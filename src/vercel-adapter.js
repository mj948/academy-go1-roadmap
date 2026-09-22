import app from "./index.js";

function envForVercel() {
  return {
    ...process.env,
    ASSETS: { async fetch() { return new Response("Not found", { status: 404 }); } }
  };
}

async function bodyFromReq(req) {
  if (["GET", "HEAD"].includes(req.method)) return undefined;
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string" || Buffer.isBuffer(req.body)) return req.body;
    return JSON.stringify(req.body);
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function handle(req, res) {
  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host || "localhost";
    const body = await bodyFromReq(req);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v == null) continue;
      headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
    }
    const request = new Request(`${proto}://${host}${req.url}`, {
      method: req.method,
      headers,
      ...(body !== undefined ? { body } : {})
    });
    const response = await app.fetch(request, envForVercel());
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (!response.body) return res.end();
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "요청을 처리하지 못했습니다." }));
  }
}
