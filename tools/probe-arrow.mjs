// 洋红探针 v2：注入后先验 computed，再全图扫洋红
const list = await (await fetch('http://127.0.0.1:9334/json/list')).json();
const page = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools')).find(t => t.url.includes('100.112.92.62'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Page.bringToFront');

const info = await ev(`(() => {
  const rows = [...document.querySelectorAll('.EvIC1a_flowItem')].filter(r => {
    const k = r.getAttribute('data-chat-anchor-key') || '';
    return k.includes(':assistant') && !k.includes('[');
  });
  const row = rows.find(r => (r.textContent || '').includes('你好')) || rows[rows.length - 1];
  if (!row) return 'NO-ROW';
  row.scrollIntoView({ block: 'center' });
  const s = document.createElement('style');
  s.id = 'eridu-arrow-probe';
  s.textContent = '[data-chat-anchor-key*=":assistant"]:not([data-chat-anchor-key*="["])::after{background:magenta !important;}';
  document.head.appendChild(s);
  const st = getComputedStyle(row, '::after');
  const r = row.getBoundingClientRect();
  return JSON.stringify({ key: row.getAttribute('data-chat-anchor-key'), x: Math.round(r.x), y: Math.round(r.y),
    bg: st.backgroundColor, content: st.content, mask: (st.maskImage || '').slice(0, 60), w: st.width });
})()`);
console.log('probe:', info);
await new Promise(r => setTimeout(r, 400));
const shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs');
fs.writeFileSync('C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/arrow-probe.png', Buffer.from(shot.result.data, 'base64'));
await ev(`document.getElementById('eridu-arrow-probe')?.remove(); 'off'`);
console.log('saved');
process.exit(0);
