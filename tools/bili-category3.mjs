#!/usr/bin/env node
// 分区选择·一体化：真鼠标开面板（验证真开）→ DOM 滚面板 → 真鼠标点目标 → 截图+回读。
// 用法：node bili-category3.mjs <主分类> [子分类]
import { appendFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || 9333;
const [, , mainCat, subCat] = process.argv;
const log = s => appendFileSync('bili-cat.log', new Date().toISOString().slice(11, 19) + ' ' + s + '\n');

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('bilibili.com'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result.result.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const realClick = async (x, y, hover = true) => {
  if (hover) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(400); }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
// 可见项（真实展开态判定：多个不同 y 且每项有独立宽高）
const itemsProbe = () => ev(`(() => {
  const rows = [...document.querySelectorAll('.drop-list-v2-item')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 100 && r.height > 20 && r.y > 60 && r.y < innerHeight;
  }).map(e => {
    const r = e.getBoundingClientRect();
    return { t: (e.textContent || '').trim().slice(0, 8), y: Math.round(r.y + r.height / 2), x: Math.round(r.x + Math.min(r.width / 2, 130)) };
  });
  return rows;
})()`);

// 1. 滚控件到中央并打开
await ev(`document.querySelector('.selector-container').scrollIntoView({ block: 'center' })`);
await sleep(700);
const ctl = await ev(`(() => { const r = document.querySelector('.selector-container').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
log('ctl ' + JSON.stringify(ctl));
await realClick(ctl.x, ctl.y);
await sleep(1100);
let rows = await itemsProbe();
log('after open rows=' + rows.length + ' ' + JSON.stringify(rows.map(r => r.t + '@' + r.y)));
if (rows.length < 3) { console.error('panel did not open: ' + JSON.stringify(rows)); process.exit(1); }

// 2. 目标不在安全区则滚面板
let target = rows.find(r => r.t === mainCat);
if (!target || target.y > 800) {
  await ev(`(() => { const c = document.querySelector('.drop-list-v2-content-wrp'); if (c) c.scrollTop += 300; return 'ok'; })()`);
  await sleep(700);
  rows = await itemsProbe();
  log('after scroll rows=' + JSON.stringify(rows.map(r => r.t + '@' + r.y)));
  target = rows.find(r => r.t === mainCat);
}
if (!target) { console.error('target not found: ' + mainCat); process.exit(1); }
log('target ' + JSON.stringify(target));

// 3. 点击主分类
await realClick(target.x, target.y);
await sleep(1400);

// 4. 子分类
let subInfo = null;
if (subCat) {
  const subRows = await ev(`(() => {
    const rows = [...document.querySelectorAll('.drop-list-v2-item, [class*=sub-list] *, [class*=second] *')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 60 && r.height > 20 && r.x > 600 && r.y > 60 && r.y < innerHeight;
    }).map(e => { const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 10), y: Math.round(r.y + r.height / 2), x: Math.round(r.x + Math.min(r.width / 2, 150)) }; });
    return rows;
  })()`);
  log('sub rows=' + JSON.stringify(subRows));
  subInfo = subRows.find(r => r.t === subCat);
  if (subInfo) {
    await realClick(subInfo.x, subInfo.y);
    await sleep(1400);
  }
}

// 5. 截图 + 回读
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
const { writeFileSync } = await import('node:fs');
writeFileSync('C:/Users/zyz/Documents/projects/schedule-app/.playwright-mcp/bili-cat-final.jpg', Buffer.from(shot.result.data, 'base64'));
const sel = await ev(`(() => {
  const el = document.querySelector('.selector-container');
  const chip = el && el.querySelector('.select-item-cont');
  return { selected: chip ? chip.textContent.trim() : (el ? el.textContent.trim().slice(0, 15) : null) };
})()`);
log('final ' + JSON.stringify(sel) + ' sub=' + JSON.stringify(subInfo));
console.log(JSON.stringify({ sel, subClicked: !!subInfo }));
ws.close();
process.exit(0);
