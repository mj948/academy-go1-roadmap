/* ── 한글(hwp·hwpx)과 워드(doc·docx) 파일에서 글자만 뽑습니다 ──
   전부 학부모 브라우저 안에서 돌고, 바깥 라이브러리를 안 씁니다.
   압축은 브라우저에 든 DecompressionStream 으로 풉니다. 없으면 pako 를 불러옵니다.

   hwp  — 5.0 형식. OLE2(CFB) 통에 BodyText/Section0… 이 들어 있고, 각 섹션은 raw deflate 로 눌려 있습니다.
          레코드 태그 67(HWPTAG_PARA_TEXT)의 UTF-16 글자를 모읍니다. 제어문자(1~23)는 8글자짜리라 건너뜁니다.
          암호가 걸렸거나 배포용 문서면 못 읽습니다.
   hwpx — zip 안의 Contents/section0.xml… 에서 <hp:t> 글자를 모읍니다.
   doc  — 워드 97~2003. OLE2 통의 WordDocument 스트림에서 FIB 를 읽고, 0Table/1Table 의 piece table 을 따라 본문을 모읍니다.
   docx — zip 안의 word/document.xml 에서 <w:t> 글자를 모읍니다.

   쓰는 법: DAParse.read(file) → Promise<string>. 못 읽으면 Error 를 던지고 message 가 학부모에게 보여 줄 문장입니다. */
(function (root) {
  "use strict";

  var PAKO_URL = "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js";

  /* ── raw deflate 풀기 ── */
  var pakoLib = null;
  function loadPako() {
    if (root.pako) return Promise.resolve(root.pako);
    if (typeof document === "undefined") return Promise.reject(new Error("pako"));
    if (!pakoLib) {
      pakoLib = new Promise(function (ok, no) {
        var s = document.createElement("script"); s.src = PAKO_URL;
        s.onload = function () { root.pako ? ok(root.pako) : no(new Error("pako")); };
        s.onerror = function () { no(new Error("pako")); };
        document.head.appendChild(s);
      });
      pakoLib.catch(function () { pakoLib = null; });
    }
    return pakoLib;
  }
  /* hwp 섹션은 deflate 스트림 뒤에 여분 바이트가 붙어 있을 때가 있어, 브라우저 스트림이 끝에서 "trailing junk" 오류를 냅니다.
     그래서 조각을 하나씩 받아 모으고, 이미 모은 것이 있으면 끝의 오류는 무시합니다. */
  function inflateRaw(u8) {
    if (typeof DecompressionStream === "function") {
      return new Promise(function (ok, no) {
        var ds, w, r, parts = [], total = 0;
        try {
          ds = new DecompressionStream("deflate-raw");
          w = ds.writable.getWriter();
          w.write(u8).catch(function () {});
          w.close().catch(function () {});
          r = ds.readable.getReader();
        } catch (e) { no(e); return; }
        var pump = function () {
          r.read().then(function (x) {
            if (x.done) { ok(cat(parts, total)); return; }
            parts.push(x.value); total += x.value.length; pump();
          }, function (e) { if (total > 0) ok(cat(parts, total)); else no(e); });
        };
        pump();
      }).catch(function () {
        return loadPako().then(function (p) { return p.inflateRaw(u8); });
      });
    }
    return loadPako().then(function (p) { return p.inflateRaw(u8); });
  }

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function cat(parts, total) {
    var out = new Uint8Array(total), p = 0, i;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], p); p += parts[i].length; }
    return out;
  }
  function utf16(b, o, n) {
    var s = "", i, cps = [];
    for (i = 0; i + 1 < n; i += 2) cps.push(u16(b, o + i));
    for (i = 0; i < cps.length; i += 4096) s += String.fromCharCode.apply(null, cps.slice(i, i + 4096));
    return s;
  }
  var latin1 = typeof TextDecoder === "function" ? new TextDecoder("windows-1252") : null;
  var utf8 = typeof TextDecoder === "function" ? new TextDecoder("utf-8") : null;

  /* ── OLE2 / CFB 통 읽기 ── */
  function cfbOpen(u8) {
    if (u8.length < 512 || u8[0] !== 0xD0 || u8[1] !== 0xCF || u8[2] !== 0x11 || u8[3] !== 0xE0) throw new Error("cfb");
    var ss = 1 << u16(u8, 30), mss = 1 << u16(u8, 32);
    var nFat = u32(u8, 44), dirStart = u32(u8, 48), cutoff = u32(u8, 56);
    var miniStart = u32(u8, 60), difStart = u32(u8, 68), nDif = u32(u8, 72);
    var END = 0xFFFFFFFE, perSec = ss / 4;
    var sec = function (n) { var o = (n + 1) * ss; return u8.subarray(o, o + ss); };

    var fatSecs = [], i, k, d = difStart, guard;
    for (i = 0; i < 109; i++) { k = u32(u8, 76 + i * 4); if (k < END) fatSecs.push(k); }
    for (guard = 0; d < END && guard < nDif + 1; guard++) {
      var ds = sec(d);
      for (i = 0; i < perSec - 1; i++) { k = u32(ds, i * 4); if (k < END) fatSecs.push(k); }
      d = u32(ds, (perSec - 1) * 4);
    }
    var fat = new Uint32Array(fatSecs.length * perSec);
    for (i = 0; i < fatSecs.length; i++) { var fs = sec(fatSecs[i]); for (k = 0; k < perSec; k++) fat[i * perSec + k] = u32(fs, k * 4); }

    function chain(start, table) {
      var out = [], n = start, g = 0;
      while (n < END && g++ < 1e6) { out.push(n); n = table[n]; if (n === undefined) break; }
      return out;
    }
    function readChain(start) {
      var cs = chain(start, fat), parts = [];
      for (var j = 0; j < cs.length; j++) parts.push(sec(cs[j]));
      return cat(parts, parts.length * ss);
    }

    var dir = readChain(dirStart), entries = [], n = dir.length / 128;
    for (i = 0; i < n; i++) {
      var o = i * 128, nl = u16(dir, o + 64), type = dir[o + 66];
      if (type === 0) { entries.push(null); continue; }
      entries.push({
        name: nl >= 2 ? utf16(dir, o, nl - 2) : "", type: type,
        left: u32(dir, o + 68), right: u32(dir, o + 72), child: u32(dir, o + 76),
        start: u32(dir, o + 116), size: u32(dir, o + 120),
      });
    }
    var root = entries[0];
    var mini = root && root.start < END ? readChain(root.start) : new Uint8Array(0);
    var miniFat = new Uint32Array(0);
    if (miniStart < END) { var mf = readChain(miniStart); miniFat = new Uint32Array(mf.length / 4); for (i = 0; i < miniFat.length; i++) miniFat[i] = u32(mf, i * 4); }

    function readEntry(e) {
      var out;
      if (e.type !== 5 && e.size < cutoff) {
        var cs = chain(e.start, miniFat), parts = [];
        for (var j = 0; j < cs.length; j++) parts.push(mini.subarray(cs[j] * mss, cs[j] * mss + mss));
        out = cat(parts, parts.length * mss);
      } else out = readChain(e.start);
      return out.subarray(0, e.size);
    }

    /* 트리를 돌며 "BodyText/Section0" 같은 경로를 만듭니다 */
    var paths = {};
    function walk(idx, prefix, depth) {
      if (idx >= entries.length || idx === 0xFFFFFFFF || depth > 64) return;
      var e = entries[idx]; if (!e) return;
      walk(e.left, prefix, depth + 1);
      var p = prefix + e.name;
      if (e.type === 2) paths[p] = e;
      else if (e.type === 1) walk(e.child, p + "/", depth + 1);
      walk(e.right, prefix, depth + 1);
    }
    if (root) walk(root.child, "", 0);
    return {
      has: function (p) { return !!paths[p]; },
      list: function () { return Object.keys(paths); },
      read: function (p) { if (!paths[p]) throw new Error("no stream " + p); return readEntry(paths[p]); },
    };
  }

  /* ── zip 읽기 (store·deflate 만) ── */
  function zipOpen(u8) {
    var i, eocd = -1;
    for (i = u8.length - 22; i >= 0 && i >= u8.length - 70000; i--) {
      if (u8[i] === 0x50 && u8[i + 1] === 0x4B && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("zip");
    var count = u16(u8, eocd + 10), cdOff = u32(u8, eocd + 16), files = {}, p = cdOff, k;
    for (k = 0; k < count; k++) {
      if (u32(u8, p) !== 0x02014B50) break;
      var method = u16(u8, p + 10), csize = u32(u8, p + 20), usize = u32(u8, p + 24);
      var nlen = u16(u8, p + 28), elen = u16(u8, p + 30), clen = u16(u8, p + 32), loc = u32(u8, p + 42);
      var name = utf8 ? utf8.decode(u8.subarray(p + 46, p + 46 + nlen)) : "";
      files[name] = { method: method, csize: csize, usize: usize, loc: loc };
      p += 46 + nlen + elen + clen;
    }
    return {
      names: function () { return Object.keys(files); },
      read: function (name) {
        var f = files[name]; if (!f) return Promise.reject(new Error("no entry " + name));
        var lo = f.loc; if (u32(u8, lo) !== 0x04034B50) return Promise.reject(new Error("zip local"));
        var start = lo + 30 + u16(u8, lo + 26) + u16(u8, lo + 28);
        var data = u8.subarray(start, start + f.csize);
        if (f.method === 0) return Promise.resolve(data);
        if (f.method === 8) return inflateRaw(data);
        return Promise.reject(new Error("zip method " + f.method));
      },
    };
  }

  function xmlText(s) {
    return s.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); }).replace(/&amp;/g, "&");
  }
  /* <p>…</p> 단위로 줄을 나누고, 그 안의 <t>…</t> 만 모읍니다. 표 안의 문단도 같은 규칙으로 줄이 됩니다 */
  function xmlParas(xml, pTag, tTag, brTag, tabTag) {
    var paras = xml.split(new RegExp("</(?:\\w+:)?" + pTag + ">")), out = [], i;
    var tRe = new RegExp("<(?:\\w+:)?" + tTag + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?" + tTag + ">", "g");
    var brRe = new RegExp("<(?:\\w+:)?" + brTag + "\\b[^>]*/?>", "g");
    var tabRe = new RegExp("<(?:\\w+:)?" + tabTag + "\\b[^>]*/?>", "g");
    for (i = 0; i < paras.length; i++) {
      var chunk = paras[i].replace(brRe, "\n").replace(tabRe, "\t"), m, line = "";
      tRe.lastIndex = 0;
      while ((m = tRe.exec(chunk))) line += xmlText(m[1]);
      if (line.replace(/\s/g, "")) out.push(line);
    }
    return out.join("\n");
  }
  function secNum(name) { var m = name.match(/(\d+)\.xml$/i); return m ? +m[1] : 0; }

  /* ── hwpx ── */
  function readHwpx(u8) {
    var z = zipOpen(u8);
    var secs = z.names().filter(function (n) { return /^Contents\/section\d+\.xml$/i.test(n); }).sort(function (a, b) { return secNum(a) - secNum(b); });
    if (!secs.length) throw new Error("hwpx sections");
    var p = Promise.resolve([]);
    secs.forEach(function (n) {
      p = p.then(function (acc) { return z.read(n).then(function (b) { acc.push(xmlParas(utf8.decode(b), "p", "t", "lineBreak", "tab")); return acc; }); });
    });
    return p.then(function (parts) { return parts.join("\n"); });
  }

  /* ── docx ── */
  function readDocx(u8) {
    var z = zipOpen(u8);
    if (!z.names().some(function (n) { return n === "word/document.xml"; })) throw new Error("docx document.xml");
    return z.read("word/document.xml").then(function (b) { return xmlParas(utf8.decode(b), "p", "t", "br", "tab"); });
  }

  /* ── hwp 5.0 ── */
  var HWP_EXT = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 11: 1, 12: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1, 23: 1 };
  function hwpParaText(b, o, n) {
    var s = "", i = 0, c;
    while (i + 1 < n) {
      c = u16(b, o + i);
      if (c >= 32) { s += String.fromCharCode(c); i += 2; continue; }
      if (HWP_EXT[c]) { i += 16; continue; }          /* 확장·인라인 제어문자는 8글자(16바이트) */
      if (c === 10 || c === 13) s += "\n";
      else if (c === 24 || c === 30 || c === 31) s += " "; /* 하이픈 자리·묶음 빈칸·고정폭 빈칸 */
      i += 2;
    }
    return s;
  }
  function hwpRecords(b) {
    var pos = 0, out = [], len = b.length;
    while (pos + 4 <= len) {
      var h = u32(b, pos), tag = h & 0x3FF, size = (h >>> 20) & 0xFFF;
      pos += 4;
      if (size === 0xFFF) { if (pos + 4 > len) break; size = u32(b, pos); pos += 4; }
      if (pos + size > len) size = len - pos;
      if (tag === 67) out.push(hwpParaText(b, pos, size));
      pos += size;
    }
    return out;
  }
  function readHwp(u8) {
    var c = cfbOpen(u8);
    if (!c.has("FileHeader")) throw new Error("hwp header");
    var fh = c.read("FileHeader");
    var sig = latin1 ? latin1.decode(fh.subarray(0, 17)) : "";
    if (sig !== "HWP Document File") throw new Error("hwp signature");
    var flags = u32(fh, 36);
    if (flags & 2) throw new Error("PASSWORD");
    if (flags & 4) throw new Error("DISTRIBUTION");
    var compressed = !!(flags & 1);
    var secs = c.list().filter(function (n) { return /^BodyText\/Section\d+$/.test(n); })
      .sort(function (a, b) { return +a.match(/\d+$/)[0] - +b.match(/\d+$/)[0]; });
    if (!secs.length) throw new Error("hwp sections");
    var p = Promise.resolve([]);
    secs.forEach(function (n) {
      p = p.then(function (acc) {
        var raw = c.read(n);
        var un = compressed ? inflateRaw(raw) : Promise.resolve(raw);
        return un.then(function (b) { acc.push(hwpRecords(b).join("\n")); return acc; });
      });
    });
    return p.then(function (parts) { return parts.join("\n"); });
  }

  /* ── doc (워드 97~2003) ── */
  function readDoc(u8) {
    var c = cfbOpen(u8);
    if (!c.has("WordDocument")) throw new Error("doc stream");
    var wd = c.read("WordDocument");
    if (u16(wd, 0) !== 0xA5EC) throw new Error("doc fib");
    var fl = u16(wd, 0x0A);
    if (fl & 0x0100) throw new Error("PASSWORD");
    var tbl = (fl & 0x0200) ? "1Table" : "0Table";
    if (!c.has(tbl)) throw new Error("doc table");
    var tb = c.read(tbl);
    var ccpText = u32(wd, 0x4C), fcClx = u32(wd, 0x1A2), lcbClx = u32(wd, 0x1A6);
    var pos = fcClx, end = fcClx + lcbClx, plc = -1, lcb = 0;
    while (pos < end && pos < tb.length) {
      var t = tb[pos];
      if (t === 1) { pos += 3 + u16(tb, pos + 1); continue; }
      if (t === 2) { lcb = u32(tb, pos + 1); plc = pos + 5; break; }
      break;
    }
    if (plc < 0) throw new Error("doc clx");
    var n = Math.floor((lcb - 4) / 12), out = "", i, field = 0;
    var push = function (ch) {
      var code = ch.charCodeAt(0);
      if (code === 0x13) { field = 1; return; }
      if (code === 0x14) { field = 0; return; }
      if (code === 0x15) { field = 0; return; }
      if (field) return;                         /* 필드 코드(HYPERLINK 등)는 버리고 결과 글자만 남깁니다 */
      if (code === 0x0D || code === 0x0B || code === 0x0C) out += "\n";
      else if (code === 0x07 || code === 0x09) out += "\t";
      else if (code === 0x1E) out += "-";
      else if (code >= 32) out += ch;
    };
    for (i = 0; i < n; i++) {
      var cpS = u32(tb, plc + i * 4), cpE = u32(tb, plc + (i + 1) * 4);
      if (cpS >= ccpText) break;
      if (cpE > ccpText) cpE = ccpText;
      var pcd = plc + (n + 1) * 4 + i * 8, fcRaw = u32(tb, pcd + 2);
      var comp = !!(fcRaw & 0x40000000), fc = fcRaw & 0x3FFFFFFF, cnt = cpE - cpS, s;
      if (comp) s = latin1.decode(wd.subarray(fc / 2, fc / 2 + cnt));
      else s = utf16(wd, fc, cnt * 2);
      for (var k = 0; k < s.length; k++) push(s[k]);
    }
    return Promise.resolve(out);
  }

  /* ── 겉에서 부르는 자리 ── */
  var MSG = {
    PASSWORD: "암호가 걸린 파일이라 못 읽습니다. 암호를 풀고 다시 저장한 뒤 올려 주세요.",
    DISTRIBUTION: "배포용 문서라 못 읽습니다. 원본 파일이나 PDF로 저장한 것을 올려 주세요.",
    hwp: "한글 파일을 못 읽었습니다. 한글에서 PDF로 저장한 뒤 올려 주세요.",
    hwpx: "한글 파일을 못 읽었습니다. 한글에서 PDF로 저장한 뒤 올려 주세요.",
    doc: "워드 파일을 못 읽었습니다. 워드에서 PDF로 저장한 뒤 올려 주세요.",
    docx: "워드 파일을 못 읽었습니다. 워드에서 PDF로 저장한 뒤 올려 주세요.",
  };
  var READERS = { hwp: readHwp, hwpx: readHwpx, doc: readDoc, docx: readDocx };

  function readBuffer(ext, buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var fn = READERS[ext];
    if (!fn) return Promise.reject(new Error("이 형식은 못 읽습니다."));
    /* hwp 라고 저장했는데 실제로는 hwpx(zip)인 파일, 그 반대도 있어서 머리 바이트로 한 번 더 고릅니다 */
    if (u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4B && (ext === "hwp" || ext === "doc")) fn = ext === "hwp" ? readHwpx : readDocx;
    if (u8.length > 4 && u8[0] === 0xD0 && u8[1] === 0xCF && (ext === "hwpx" || ext === "docx")) fn = ext === "hwpx" ? readHwp : readDoc;
    return Promise.resolve().then(function () { return fn(u8); }).then(function (t) {
      t = String(t || "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!t) throw new Error("EMPTY");
      return t;
    }, function (e) {
      var m = e && e.message;
      if (m === "PASSWORD" || m === "DISTRIBUTION") throw new Error(MSG[m]);
      if (m === "EMPTY") throw new Error("이 파일에는 글자가 없습니다. 사진만 있는 파일이면 PDF로 저장해서 올려 주세요.");
      throw new Error(MSG[ext] || "이 파일을 못 읽었습니다. PDF로 저장한 뒤 올려 주세요.");
    });
  }
  function read(file) {
    var m = String(file.name || "").toLowerCase().match(/\.([a-z0-9]+)$/), ext = m ? m[1] : "";
    return new Promise(function (ok, no) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); }; r.onerror = function () { no(new Error("read")); };
      r.readAsArrayBuffer(file);
    }).then(function (buf) { return readBuffer(ext, buf); });
  }

  var api = { read: read, readBuffer: readBuffer, exts: Object.keys(READERS), _internal: { cfbOpen: cfbOpen, zipOpen: zipOpen, hwpRecords: hwpRecords, inflateRaw: inflateRaw } };
  root.DAParse = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
