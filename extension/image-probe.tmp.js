// 临时调试脚本 —— 探测 ChatGPT 图片是否可通过接口获取。用完可直接删除本文件。
// 用法：
//   1) 打开一个【带图片】的 ChatGPT 会话页 (chatgpt.com/c/...)，保持登录
//   2) 在 VS Code 里 Ctrl+A 全选本文件 → Ctrl+C
//   3) 到该页面 F12 → Console，粘贴回车
//   4) 把打印出来的 "==== IMAGE PROBE ====" 那段 JSON 发回
//      （download_url / domImgSamples 里的 sig= 签名可以打码）
(async () => {
  const out = {};
  const j = async (r) => { try { return await r.json(); } catch (e) { return null; } };
  const fid = (raw) => {
    let s = String(raw || "");
    const i = s.indexOf("://");
    if (i >= 0) s = s.slice(i + 3);
    const m = s.match(/file[-_][A-Za-z0-9]+/);
    return m ? m[0] : (s || null);
  };

  let token = "";
  try {
    const ses = await fetch("/api/auth/session?unstable_client=true", { credentials: "include" }).then(j);
    token = (ses && ses.accessToken) || "";
  } catch (e) {}
  out.hasToken = Boolean(token);

  const headers = { Authorization: "Bearer " + token };
  const didMatch = document.cookie.match(/(?:^|;\s*)oai-did=([^;]+)/);
  if (didMatch) headers["oai-device-id"] = decodeURIComponent(didMatch[1]);
  let accountId = "";
  try {
    const ndEl = document.getElementById("__NEXT_DATA__");
    const nd = ndEl ? JSON.parse(ndEl.textContent || "{}") : {};
    const accts = (nd.props && nd.props.pageProps && nd.props.pageProps.user && nd.props.pageProps.user.accounts) || {};
    accountId = Object.values(accts).map((a) => a && a.account && a.account.id).find(Boolean) || "";
  } catch (e) {}
  if (accountId) headers["ChatGPT-Account-Id"] = accountId;
  out.headerKeys = Object.keys(headers);

  const convId = location.pathname.split("/").filter(Boolean).pop();
  out.convId = convId;
  const conv = await fetch("/backend-api/conversation/" + convId, { credentials: "include", headers }).then(j);
  out.convOk = Boolean(conv && conv.mapping);

  const refs = [];
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const t = String(v.content_type || v.type || "").toLowerCase();
    if (t === "image_asset_pointer" || t === "image") {
      const meta = v.metadata || {};
      const raw = v.asset_pointer || meta.asset_pointer || null;
      const ref = { kind: "asset_pointer", raw: raw, fileId: fid(raw), mime: meta.mime_type || null, title: meta.image_gen_title || null };
      refs.push(ref);
    }
    ["parts", "content", "items", "output", "result", "children", "data"].forEach((k) => walk(v[k]));
  };
  const nodes = (conv && conv.mapping) ? Object.values(conv.mapping) : [];
  nodes.forEach((n) => {
    const msg = n && n.message;
    if (!msg) return;
    walk(msg.content);
    const atts = (msg.metadata && msg.metadata.attachments) || [];
    atts.forEach((a) => {
      const ref = { kind: "attachment", raw: a.id || null, fileId: fid(a.id), mime: a.mime_type || a.mimeType || null, title: a.name || null };
      refs.push(ref);
    });
  });
  out.imageRefs = refs;

  const byId = new Map();
  refs.forEach((r) => { if (r.fileId && !byId.has(r.fileId)) byId.set(r.fileId, r); });
  const uniq = Array.from(byId.values()).slice(0, 5);

  out.downloadProbe = [];
  for (const r of uniq) {
    const p = { fileId: r.fileId, kind: r.kind };
    try {
      const resp = await fetch("/backend-api/files/" + r.fileId + "/download", { credentials: "include", headers });
      p.status = resp.status;
      p.body = await j(resp);
      const u = p.body && p.body.download_url;
      if (u) {
        try { const h = await fetch(u); p.urlPublicStatus = h.status; }
        catch (e) { p.urlPublicStatus = "err"; }
      }
    } catch (e) { p.error = String(e); }
    out.downloadProbe.push(p);
  }

  out.domImgSamples = Array.from(document.querySelectorAll("img"))
    .map((i) => i.currentSrc || i.src)
    .filter((s) => /backend-api|oaiusercontent|estuary|blob:/.test(s))
    .slice(0, 6);

  console.log("==== IMAGE PROBE ====");
  console.log(JSON.stringify(out, null, 2));
  return out;
})();
