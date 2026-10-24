#!/usr/bin/env node
// 封面制作编辑器：选左栏视频帧封面 → 滚到确定 → 点确定 → 回读表单封面状态。
const PORT = process.env.CDP_PORT || 9333;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('bilibili.com'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result.result.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const realClick = async (x, y, hover = true) => {
  if (hover) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(400); }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};

// 1. 左栏封面候选（排除「不使用」）
const pick = await ev(`new Promise(resolve => {
  const tiles = [...document.querySelectorAll('body *')].filter(e => {
    const r = e.getBoundingClientRect();
    if (r.x < 60 || r.x > 500 || r.y < 180 || r.y > 560) return false;
    if (r.width < 100 || r.width > 200 || r.height < 80 || r.height > 150) return false;
    return true;
  });
  const withImg = tiles.filter(e => (e.textContent || '').trim() !== '不使用');
  const list = (withImg.length ? withImg : tiles).map(e => {
    const r = e.getBoundingClientRect();
    return { t: (e.textContent || '').trim().slice(0, 8), cls: (e.className || '').toString().slice(0, 30), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  resolve(list.slice(0, 6));
})`);
console.log('tiles:', JSON.stringify(pick));
if (!pick.length) process.exit(1);
const tile = pick.find(t => t.t !== '不使用') || pick[0];
await realClick(tile.x, tile.y);
await sleep(1000);

// 2. 确定 按钮
const btn = await ev(`new Promise(resolve => {
  const cands = [...document.querySelectorAll('button, [class*=btn], [class*=button]')].filter(e => {
    const t = (e.textContent || '').trim();
    const r = e.getBoundingClientRect();
    return (t === '确定' || /^确\s*定$/.test(t)) && r.width > 0;
  });
  if (!cands.length) return resolve(null);
  const b = cands[cands.length - 1];
  b.scrollIntoView({ block: 'center' });
  setTimeout(() => {
    const r = b.getBoundingClientRect();
    resolve({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), t: (b.textContent || '').trim() });
  }, 500);
})`);
console.log('confirm btn:', JSON.stringify(btn));
if (!btn) process.exit(1);
await realClick(btn.x, btn.y);
await sleep(2000);

// 3. 回读：封面占位符应消失
const st = await ev(`(() => {
  const editorGone = ![...document.querySelectorAll('body *')].some(e =>
    e.children.length === 0 && (e.textContent || '').trim().includes('封面制作') && e.getBoundingClientRect().width > 0);
  const placeholder = [...document.querySelectorAll('*')].some(e =>
    e.children.length === 0 && (e.textContent || '').trim() === '添加封面' && e.getBoundingClientRect().width > 0);
  return { editorGone, placeholderStill: placeholder };
})()`);
console.log('after:', JSON.stringify(st));
ws.close();
process.exit(0);
