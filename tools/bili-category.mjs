#!/usr/bin/env node
// 一气呵成选分区：滚动分区行到视口上方 → 真鼠标开面板 → 点目标分类 →（如有）点子分类。
// 用法：node bili-category.mjs <主分类> [子分类]
const PORT = process.env.CDP_PORT || 9333;
const [, , mainCat, subCat] = process.argv;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('bilibili.com'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result.result.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mouse = async (x, y, type = 'click') => {
  if (type === 'move' || type === 'click') await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  if (type === 'click') {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
};
const findItem = async (text, xmin = 350) => ev(`(() => {
  const leaf = [...document.querySelectorAll('body *')].find(e =>
    e.children.length === 0 && (e.textContent || '').trim() === ${JSON.stringify(text)} &&
    e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().x > ${xmin} && e.getBoundingClientRect().y > 60);
  if (!leaf) return null;
  const row = leaf.closest('li, [class*=item]') || leaf;
  const r = row.getBoundingClientRect();
  return { x: Math.round(r.x + Math.min(r.width / 2, 130)), y: Math.round(r.y + r.height / 2), top: Math.round(r.y), h: Math.round(r.height) };
})()`);

// 1. （不滚动——之前实测原始位置点得开）

// 2. 开面板
const ctl = await ev(`(() => {
  const el = document.querySelector('.selector-container');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()`);
if (!ctl) { console.error('no selector'); process.exit(1); }
await mouse(ctl.x, ctl.y);
await sleep(900);

// 3. 面板可能挡住低处项：滚一点面板（悬停面板上滚轮）
const item = await findItem(mainCat);
if (!item) { console.error('main cat not visible:', mainCat); process.exit(1); }
console.log('main cat at', JSON.stringify(item));
if (item.top + item.h > innerHeightFallback() - 40) {
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: item.y, deltaX: 0, deltaY: 200 });
  await sleep(500);
}
function innerHeightFallback() { return 900; }
const item2 = (await findItem(mainCat)) || item;
await mouse(item2.x, item2.y, 'move');
await sleep(500);
await mouse(item2.x, item2.y);
await sleep(1000);

// 4. 子分类
let result = { clicked: mainCat, at: item2 };
if (subCat) {
  const sub = await findItem(subCat, 600);
  if (sub) {
    await mouse(sub.x, sub.y, 'move');
    await sleep(400);
    await mouse(sub.x, sub.y);
    await sleep(800);
    result.sub = sub;
  } else {
    result.subErr = 'not visible';
  }
}

// 5. 回读选择值
result.selected = await ev(`(() => {
  const el = document.querySelector('.selector-container');
  const chip = el && el.querySelector('.select-item-cont');
  return chip ? chip.textContent.trim() : (el ? el.textContent.trim().slice(0, 20) : null);
})()`);
console.log(JSON.stringify(result, null, 1));
ws.close();
process.exit(0);
