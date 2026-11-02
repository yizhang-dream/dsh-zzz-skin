// 验证头像外置几何：40px 圆、距气泡左缘 9px、顶边高 3px、完整在气泡外
const PORT = 9334;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools')).find(t => t.url.includes('100.112.92.62'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
const shot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  const fs = await import('node:fs');
  fs.writeFileSync(`C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};
await send('Page.enable'); await send('Page.bringToFront');
await send('Page.reload', { ignoreCache: true });
await new Promise(r => setTimeout(r, 10000));
// 打开测试会话
await ev(`(() => { const items = [...document.querySelectorAll('.pI_x6G_sidebarCol [class*=session], .pI_x6G_sidebarCol a, .pI_x6G_sidebarCol button')]; const it = items.find(x => /在吗|你好/.test(x.textContent||'')); if (it) { it.click(); return 'ok'; } return 'nf'; })()`);
await new Promise(r => setTimeout(r, 2500));

const geo = await ev(`(() => {
  const rows = [...document.querySelectorAll('.EvIC1a_flowItem[data-chat-anchor-key*=":assistant"]')].filter(r => { const k = r.getAttribute('data-chat-anchor-key')||''; return !k.includes('[') && !r.hidden && (r.textContent||'').trim(); });
  const out = [];
  for (const row of rows.slice(-3)) {
    const rr = row.getBoundingClientRect();
    const pb = getComputedStyle(row, '::before');
    const bw = parseFloat(pb.width) || 0;
    const bl = parseFloat(pb.left) || 0, bt = parseFloat(pb.top) || 0;
    out.push({
      key: row.getAttribute('data-chat-anchor-key').slice(0, 24),
      rowX: Math.round(rr.x), rowW: Math.round(rr.width),
      avatar: { w: bw, leftOfBubble: Math.round(rr.x - (rr.x + bl + bw)), gap: Math.round(-bl - bw), top: bt },
      ml: getComputedStyle(row).marginLeft, pl: getComputedStyle(row).paddingLeft,
      bg: pb.backgroundImage.includes('avatar-agent'),
    });
  }
  return JSON.stringify(out, null, 1);
})()`);
console.log(geo);
await shot('avatar-position');
process.exit(0);
