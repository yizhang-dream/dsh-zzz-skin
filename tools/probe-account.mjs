// 找账号菜单入口：盘点 data-slot 按钮与角落按钮
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Page.bringToFront');
await ev("document.body.click()");
await new Promise(r => setTimeout(r, 400));
const slots = await ev(`(() => {
  const out = [];
  for (const el of document.querySelectorAll('[data-slot]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    out.push({ slot: el.getAttribute('data-slot'), tag: el.tagName, text: (el.textContent||'').trim().slice(0,10) });
  }
  return JSON.stringify(out.slice(0, 40));
})()`);
console.log('slots:', slots);
const corners = await ev(`(() => {
  const out = [];
  for (const b of document.querySelectorAll('button, [role=button]')) {
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.width > 260) continue;
    if (r.y > innerHeight * 0.72 || r.x < 90) {
      out.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), text: (b.textContent||'').trim().slice(0,12), aria: b.getAttribute('aria-label') || '' });
    }
  }
  return JSON.stringify(out.slice(0, 25));
})()`);
console.log('corners:', corners);
process.exit(0);
