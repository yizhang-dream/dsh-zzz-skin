// 点账号菜单后 dump 弹出的菜单内容
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Page.bringToFront');
const s1 = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '账号菜单'); if (b) { b.click(); return 'ok'; } return 'nf'; })()`);
await new Promise(r => setTimeout(r, 700));
const menu = await ev(`(() => {
  // 弹层：最近的 menu/popover 容器（浮在左下）
  const cands = [...document.querySelectorAll('[role=menu], [class*=popover], [class*=menu], [class*=dropdown]')];
  const vis = cands.filter(c => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  return JSON.stringify(vis.slice(-3).map(c => ({
    tag: c.tagName, cls: String(c.className).slice(0, 60), role: c.getAttribute('role'),
    items: [...c.querySelectorAll('button, [role=menuitem], a')].map(b => (b.textContent || '').trim().slice(0, 14)).filter(Boolean),
  })), null, 1);
})()`);
console.log('menu:', s1, menu);
// 若有「设置」项点它
const s2 = await ev(`(() => {
  const items = [...document.querySelectorAll('button, [role=menuitem], a')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0; });
  const it = items.find(x => /设置|Settings/.test((x.textContent || '')));
  if (it) { it.click(); return 'clicked:' + (it.textContent || '').trim().slice(0, 10); }
  return 'nf:' + items.map(x => (x.textContent || '').trim().slice(0, 8)).filter(Boolean).slice(0, 20).join('|');
})()`);
await new Promise(r => setTimeout(r, 1200));
console.log('settings:', s2);
const dlg = await ev(`(() => {
  const d = document.querySelector('[data-dsh-surface="settings"]') || document.querySelector('[role=dialog]');
  if (!d) return 'no-dialog';
  return 'dialog-cls:' + String(d.className).slice(0, 80);
})()`);
console.log(dlg);
process.exit(0);
