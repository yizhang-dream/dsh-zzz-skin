#!/usr/bin/env node
// 切换 composer 模型：CDP 鼠标点开模型下拉，选择指定关键词的模型。
// 用法：node switch-model.mjs <关键词，如 西湖|GLM>
import { writeFileSync } from 'node:fs';

const KEYWORD = process.argv[2] || '西湖';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const p = list.find(t => t.type === 'page' && t.url.includes('100.112.92.62'));
const ws = new WebSocket(p.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result.result.value;

const btn = await ev(`(() => { const b = document.querySelector('button[aria-label^="选择模型"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: b.getAttribute('aria-label') }; })()`);
console.log('current:', btn?.label);
if (!btn) { console.error('no model button'); process.exit(1); }

await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
await new Promise(r => setTimeout(r, 1200));

const opts = await ev(`(() => {
  // 弹层里的可点行：文本叶子 → 就近 option/menuitem/li
  const leaves = [...document.querySelectorAll('body *')].filter(e => {
    if (e.children.length !== 0) return false;
    const t = (e.textContent || '').trim();
    if (t.length < 3 || t.length > 60) return false;
    const r = e.getBoundingClientRect();
    if (r.width === 0) return false;
    // 排除主界面已知文本
    return true;
  });
  const rows = [];
  for (const l of leaves) {
    const row = l.closest('[role=option], [role=menuitem], li, [class*=option], [class*=item], [class*=model]');
    if (row) rows.push({ text: (row.textContent || '').trim().slice(0, 60), x: Math.round(row.getBoundingClientRect().x + row.getBoundingClientRect().width / 2), y: Math.round(row.getBoundingClientRect().y + row.getBoundingClientRect().height / 2) });
  }
  const seen = new Set();
  return rows.filter(r => { if (seen.has(r.text)) return false; seen.add(r.text); return true; });
})()`);
console.log('options:', JSON.stringify(opts, null, 0).slice(0, 1500));

const target = opts.find(o => o.text.includes(KEYWORD));
if (!target) { console.error('no option matches', KEYWORD); await ev('document.body.click()'); process.exit(1); }
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
await new Promise(r => setTimeout(r, 1000));
const after = await ev(`(() => document.querySelector('button[aria-label^="选择模型"]')?.getAttribute('aria-label'))()`);
console.log('after:', after);
ws.close(); process.exit(0);
