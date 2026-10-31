const PORT = 9334;
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
await new Promise((r) => setTimeout(r, 8000));
const snap = () => ev(`JSON.stringify({
  attr: document.documentElement.getAttribute('data-dsh-skin'),
  accent: getComputedStyle(document.body).getPropertyValue('--zzz-accent').trim() || '(空)',
  bgVid: document.querySelector('[data-dsh-skin-layer=background] video')?.src?.slice(-24) || null,
  links: [...document.querySelectorAll('link[data-dsh-skin-link]')].map((l) => l.href.split('/skin/')[1]?.split('/')[0]),
  entry: !!document.getElementById('eridu-entry'),
})`);
console.log('boot:', await snap());
// 打开页面 → 实测换肤（点第 12 张卡）
await ev(`document.getElementById('eridu-entry').click()`);
await new Promise((r) => setTimeout(r, 800));
const sw = await ev(`(async()=>{
  const card=[...document.querySelectorAll('.ecard')].find(c=>c.dataset.id==='zzz-eridu-12');
  if(!card)return 'no-card';
  card.click();
  await new Promise(r=>setTimeout(r,1500));
  return 'clicked';
})()`);
console.log('switch:', sw, '→', await snap());
// 换头像（艾莲 · 头像组）
const av = await ev(`(async()=>{
  document.querySelector('.etab[data-t=av]').click();
  await new Promise(r=>setTimeout(r,400));
  const cell=[...document.querySelectorAll('.avcell')].find(c=>c.dataset.name==='艾莲'&&c.dataset.dir==='avatars');
  if(!cell)return 'no-cell';
  cell.click();
  await new Promise(r=>setTimeout(r,300));
  document.getElementById('eridu-apply').click();
  await new Promise(r=>setTimeout(r,1200));
  return document.getElementById('eridu-toast').textContent;
})()`);
console.log('avatar:', av, '→', await snap());
const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('build/skinlab-final.png', Buffer.from(shot.result.data, 'base64'));
console.log('saved build/skinlab-final.png');
ws.close();
