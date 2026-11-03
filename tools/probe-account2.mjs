// 点「更多」后 dump 左下弹层全部可见节点（文本+坐标）
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
const shot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  (await import('node:fs')).writeFileSync(`C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};
await send('Page.enable'); await send('Page.bringToFront');
const s1 = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '账号菜单'); if (b) { b.click(); return 'ok'; } return 'nf'; })()`);
await new Promise(r => setTimeout(r, 900));
const pop = await ev(`(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, [role=menuitem], a, [class*=item]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.x < 420 && r.y > 640) out.push({ x: Math.round(r.x), y: Math.round(r.y), tag: el.tagName, text: (el.textContent || '').trim().slice(0, 16), cls: String(el.className).slice(0, 40) });
  }
  return JSON.stringify(out, null, 0);
})()`);
console.log('menu-open:', s1, pop);
await shot('account-menu');
// 点「设置」类项
const s2 = await ev(`(() => {
  const cands = [...document.querySelectorAll('button, [role=menuitem], a, [class*=item]')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.x < 420 && r.y > 640; });
  const it = cands.find(x => /设置/.test((x.textContent || '')));
  if (it) { it.click(); return 'clicked:' + (it.textContent || '').trim().slice(0, 12); }
  return 'nf';
})()`);
await new Promise(r => setTimeout(r, 1200));
console.log('click:', s2);
const dlg = await ev(`(() => {
  const d = document.querySelector('[data-dsh-surface="settings"]') || document.querySelector('[role=dialog]');
  return d ? 'DIALOG cls=' + String(d.className).slice(0, 80) : 'no-dialog';
})()`);
console.log(dlg);
await shot('after-settings-click');
process.exit(0);
