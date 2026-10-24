#!/usr/bin/env node
// 选封面：DOM 定位推荐封面缩略图 → 滚入 → 真鼠标点 → 回读。
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

const r = await ev(`new Promise(resolve => {
  const btn = [...document.querySelectorAll('*')].filter(e =>
    e.children.length === 0 && (e.textContent || '').trim() === '添加封面' && e.getBoundingClientRect().width > 0)[0];
  if (!btn) return resolve({ err: 'no cover btn' });
  const sec = btn.closest('.form-item');
  let cands = [...sec.querySelectorAll('*')].filter(e => {
    if (e.children.length !== 0 || (e.textContent || '').trim()) return false;
    const r = e.getBoundingClientRect();
    return r.width >= 100 && r.width <= 170 && r.height >= 80 && r.height <= 145;
  });
  if (!cands.length) {
    cands = [...sec.querySelectorAll('div')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width >= 100 && r.width <= 170 && r.height >= 80 && r.height <= 145;
    });
  }
  if (!cands.length) return resolve({ err: 'no candidates', secText: (sec.textContent || '').slice(0, 60) });
  // 推荐缩略图通常是后几个（前面是 AI 生成大卡），取中间偏后的一张
  const el = cands[Math.min(cands.length - 1, Math.floor(cands.length * 0.6))];
  el.scrollIntoView({ block: 'center' });
  setTimeout(() => {
    const rect = el.getBoundingClientRect();
    resolve({ cands: cands.length, cls: (el.className || '').toString().slice(0, 40), cx: Math.round(rect.x + rect.width / 2), cy: Math.round(rect.y + rect.height / 2) });
  }, 500);
})`);
console.log('locate:', JSON.stringify(r));
if (!r.cx) process.exit(1);

await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx, y: r.cy });
await sleep(450);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.cx, y: r.cy, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.cx, y: r.cy, button: 'left', clickCount: 1 });
await sleep(1800);

const st = await ev(`(() => {
  const placeholder = [...document.querySelectorAll('*')].some(e =>
    e.children.length === 0 && (e.textContent || '').trim() === '添加封面' && e.getBoundingClientRect().width > 0);
  const newTexts = [...document.querySelectorAll('body *')].filter(e =>
    e.children.length === 0 && /截取|确认|换一|重新选择|封面图/.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0
  ).map(e => (e.textContent || '').trim().slice(0, 12));
  return { placeholderStill: placeholder, newTexts: [...new Set(newTexts)].slice(0, 8) };
})()`);
console.log('after:', JSON.stringify(st));
ws.close();
process.exit(0);
