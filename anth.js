/* ── 오래 걸리는 요청이 중간에 끊기지 않게 하는 부분 ──

   증상: "자료를 만들지 못했습니다. (524) error code: 524"

   왜 났나. 클로드에게 자료를 부탁하고 답을 통째로 기다리면 첫 글자가 100초 넘게 안 옵니다.
   api.anthropic.com 앞에도 클라우드플레어가 서 있어서, 100초 동안 아무 글자도 안 오면
   그 중간 장비가 먼저 끊고 524를 돌려줍니다. 우리 서버는 그 524를 받아서 화면에 그대로 올린 겁니다.
   꿈문장은 짧아서 100초 안에 끝나니 살아남았고, 2학기 방향은 길어서 매번 걸렸습니다.

   고치는 법은 두 가지입니다.
   1) 클로드를 부를 때 stream 을 켭니다. 첫 글자가 1초 안에 오니 100초 규칙에 안 걸립니다.
      대신 답이 조각으로 오므로 여기서 다시 모아 원래 모양으로 되돌립니다.
   2) 학부모 화면 쪽으로도 5초마다 줄바꿈을 하나씩 흘려보냅니다.
      줄바꿈은 JSON 앞에 붙어도 되는 글자라, 받는 쪽 코드는 한 글자도 안 고쳐도 됩니다. */

/* 조각으로 오는 답(SSE)을 모아 평소 받던 메시지 모양으로 되돌립니다. */
export async function readStream(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const blocks = [];
  const usage = {};
  let buf = "";
  let stopReason = null;
  let model = "";
  let apiError = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let ev;
      try { ev = JSON.parse(payload); } catch { continue; }

      if (ev.type === "error") { apiError = ev.error || { message: "스트림이 끊겼습니다." }; continue; }
      if (ev.type === "message_start" && ev.message) {
        model = ev.message.model || model;
        Object.assign(usage, ev.message.usage || {});
        continue;
      }
      if (ev.type === "content_block_start") {
        const b = ev.content_block || {};
        blocks[ev.index] = { type: b.type, text: b.text || "", thinking: b.thinking || "" };
        continue;
      }
      if (ev.type === "content_block_delta") {
        const b = blocks[ev.index] || (blocks[ev.index] = { type: "text", text: "", thinking: "" });
        const d = ev.delta || {};
        if (d.type === "text_delta") b.text += d.text || "";
        else if (d.type === "thinking_delta") b.thinking += d.thinking || "";
        continue;
      }
      if (ev.type === "message_delta") {
        if (ev.delta && ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
        Object.assign(usage, ev.usage || {});
        continue;
      }
    }
  }

  return {
    error: apiError,
    msg: { content: blocks.filter(Boolean), stop_reason: stopReason, model, usage },
  };
}

/* 클로드를 한 번 부르고 답을 다 모아서 돌려줍니다.
   부르는 길(미국 방·우회로·게이트웨이·직통)은 파일마다 이미 있는 anthropicFetch 를 그대로 씁니다. */
export async function anthropicMessage(anthropicFetch, env, bodyObj) {
  const res = await anthropicFetch(env, JSON.stringify(Object.assign({}, bodyObj, { stream: true })));
  if (!res) return { ok: false, status: 502, detail: "" };
  if (!res.ok) return { ok: false, status: res.status, detail: await res.text() };

  const out = await readStream(res);
  if (out.error) {
    const kind = String(out.error.type || "");
    const status = kind === "overloaded_error" ? 529 : kind === "rate_limit_error" ? 429 : 502;
    return { ok: false, status, detail: JSON.stringify({ error: out.error }) };
  }
  /* 조각이 하나도 안 왔으면 도중에 끊긴 겁니다. 빈 자료를 화면에 올리지 않습니다. */
  if (!out.msg.content.length) return { ok: false, status: 524, detail: "" };
  return { ok: true, msg: out.msg };
}

/* 자료 만드는 데 2~3분 걸리는 동안 학부모 브라우저로 5초마다 줄바꿈을 하나씩 보냅니다.
   work() 가 끝나면 그 뒤에 본문을 붙이고 닫습니다.
   work() 는 지금까지처럼 Response 를 돌려주면 됩니다. 다만 상태번호는 200으로 통일되고
   오류는 본문의 error 로만 전해집니다. 화면 쪽은 원래 error 를 먼저 보므로 그대로 동작합니다. */
export function streamJson(work) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  let alive = true;
  let timer = null;

  const beat = () => {
    timer = setTimeout(() => {
      if (!alive) return;
      w.write(enc.encode("\n")).then(beat, () => {});
    }, 5000);
  };
  beat();

  const finish = async (text) => {
    alive = false;
    if (timer) clearTimeout(timer);
    try { await w.write(enc.encode(text)); } catch {}
    try { await w.close(); } catch {}
  };

  Promise.resolve()
    .then(work)
    .then((res) => res.text())
    .then(finish)
    .catch((e) => {
      console.log("streamJson", e && e.stack);
      return finish(JSON.stringify({ error: "서버에서 문제가 생겼습니다: " + (e && e.message) }));
    });

  return new Response(readable, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
