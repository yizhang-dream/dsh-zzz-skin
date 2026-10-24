#!/usr/bin/env node
// 面板已开前提下：DOM 滚动面板 → 真鼠标点目标项 → 回读。
// 用法：node bili-category2.mjs <主分类文本>
const PORT = process.env.CDP_PORT || 9333;
const [, , catText] = process.argv;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('bilibili.com'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result.result.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. DOM 滚动面板容器，让目标项离开视口底缘
const scrolled = await ev(`(() => {
  const leaf = [...document.querySelectorAll('body *')].find(e =>
    e.children.length === 0 && (e.textContent || '').trim() === ${JSON.stringify(catText)} && e.getBoundingClientRect().x > 350 && e.getBoundingClientRect().y > 60);
  if (!leaf) return 'not visible';
  let n = leaf;
  for (let i = 0; i < 8 && n; i++) {
    const st = getComputedStyle(n);
    if (/(auto|scroll)/.test(st.overflowY)) { n.scrollTop += 260; return 'scrolled ' + (n.className || '').toString().slice(0, 25); }
    n = n.parentElement;
  }
  return 'no scroll container';
})()`);
console.log('scroll:', scrolled);
await sleep(700);

// 2. 定位目标项
const pos = await ev(`(() => {
  const leaf = [...document.querySelectorAll('body *')].find(e =>
    e.children.length === 0 && (e.textContent || '').trim() === ${JSON.stringify(catText)} && e.getBoundingClientRect().x > 350 && e.getBoundingClientRect().y > 60);
  if (!leaf) return null;
  const r = (leaf.closest('li, [class*=item]') || leaf).getBoundingClientRect();
  return { x: Math.round(r.x + Math.min(r.width / 2, 130)), y: Math.round(r.y + r.height / 2), top: Math.round(r.y), bottom: Math.round(r.bottom) };
})()`);
console.log('target:', JSON.stringify(pos));
if (!pos) process.exit(1);

// 3. 真鼠标 hover + click
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
await sleep(600);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
await sleep(1400);

// 4. 回读
const st = await ev(`(() => {
  const el = document.querySelector('.selector-container');
  const chip = el && el.querySelector('.select-item-cont');
  const panelOpen = [...document.querySelectorAll('body *')].some(e =>
    e.children.length === 0 && (e.textContent || '').trim() === '鬼畜' && e.getBoundingClientRect().x > 350 && e.getBoundingClientRect().y > 60);
  const subs = [...document.querySelectorAll('body *')].filter(e => {
    if (e.children.length !== 0) return false;
    const r = e.getBoundingClientRect();
    return r.x > 620 && r.y > 200 && r.y < 860 && r.width > 10;
  }).map(e => (e.textContent || '').trim().slice(0, 12) + '@' + Math.round(e.getBoundingClientRect().y));
  return { selected: chip ? chip.textContent.trim() : null, panelOpen, subs: [...new Set(subs)].slice(0, 12) };
})()`);
console.log('state:', JSON.stringify(st));
ws.close();
process.exit(0);
