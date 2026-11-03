// 点设置后搜实际容器：data-pane/data-dsh-surface/大浮层
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

// 设置可能已关，重开一遍
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '账号菜单'); if (b) b.click(); return 1; })()`);
await new Promise(r => setTimeout(r, 700));
await ev(`(() => { const it = [...document.querySelectorAll('button')].find(x => /^设置/.test((x.textContent || '').trim())); if (it) it.click(); return 1; })()`);
await new Promise(r => setTimeout(r, 1500));

const found = await ev(`(() => {
  const out = { panes: [], surfaces: [], big: [] };
  for (const el of document.querySelectorAll('[data-pane]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) out.panes.push(el.getAttribute('data-pane') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  for (const el of document.querySelectorAll('[data-dsh-surface]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) out.surfaces.push(el.getAttribute('data-dsh-surface') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  for (const el of document.querySelectorAll('div')) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width > innerWidth * 0.7 && r.height > innerHeight * 0.7 && (s.position === 'fixed' || s.position === 'absolute') && s.zIndex !== 'auto' && parseFloat(s.zIndex) > 100) {
      out.big.push(String(el.className).slice(0, 50) + ' z=' + s.zIndex + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' text=' + (el.textContent || '').trim().slice(0, 30));
    }
  }
  return JSON.stringify(out, null, 1);
})()`);
console.log(found);
await shot('settings-real');
process.exit(0);
