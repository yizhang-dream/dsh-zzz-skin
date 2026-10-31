#!/usr/bin/env node
// 气泡形状验收 v2：reload 后再切档（属性是 React 管的，reload 会回弹），
// 滚到会话底部拍最近一组 AI+用户气泡。
// 用法：node tools/verify-bubbles.mjs dark|light <out.png>
const PORT = 9334;
const mode = process.argv[2] || 'dark';
const out = process.argv[3] || `build/bubble-${mode}.png`;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools')).find((t) => t.url.includes('100.112.92.62'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (f) => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable');
await send('Page.bringToFront');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 4000));
let n = await ev(`document.querySelectorAll('[data-chat-anchor-key*=":assistant-step"]:not([data-chat-anchor-key*="["]):not([hidden])').length`);
if (!n) {
  await ev(`(()=>{const r=[...document.querySelectorAll('.YDXeBa_sessionRow')].find(x=>!String(x.className).includes('selected'))||document.querySelectorAll('.YDXeBa_sessionRow')[0];r&&r.click();return 1})()`);
  await new Promise((r) => setTimeout(r, 4500));
}
// reload 后切档（不再 reload，属性直接驱动 CSS）
await ev(`document.body.toggleAttribute('data-ds-dark-theme', ${mode === 'dark'})`);
const info = await ev(`(() => new Promise(res => {
  const sc = document.querySelector('.wSkVaW_scrollBody');
  if (sc) sc.scrollTop = sc.scrollHeight;
  setTimeout(() => {
    const users = [...document.querySelectorAll('[data-chat-anchor-key*=":input-message"] [class*="_bubble"]:not([role="tooltip"])')];
    const user = users[users.length - 1];
    const ais = [...document.querySelectorAll('[data-chat-anchor-key*=":assistant-step"]:not([data-chat-anchor-key*="["]):not([hidden])')];
    const ai = ais.filter((e) => { const r = e.getBoundingClientRect(); return r.height > 30 && r.height < 400; }).slice(-1)[0];
    const out = { dark: document.body.hasAttribute('data-ds-dark-theme'), dpr: devicePixelRatio,
      user: user && (() => { const r = user.getBoundingClientRect(); const cs = getComputedStyle(user); return { x: r.x, y: r.y, w: r.width, h: r.height, radius: cs.borderRadius }; })(),
      ai: ai && (() => { const r = ai.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })() };
    res(JSON.stringify(out));
  }, 900);
}))()`);
console.log(info);
await new Promise((r) => setTimeout(r, 300));
const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(`saved ${out}`);
ws.close();
