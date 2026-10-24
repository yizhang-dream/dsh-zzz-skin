#!/usr/bin/env node
// 点开模型下拉 → dump 弹层文本 → 立刻截图。不点任何选项。
import { writeFileSync } from 'node:fs';

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const p = list.find(t => t.type === 'page' && t.url.includes('100.112.92.62'));
const ws = new WebSocket(p.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result.result.value;

const r = await ev(`(() => { const b = document.querySelector('button[aria-label^="选择模型"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
if (!r) { console.error('no model button'); process.exit(1); }
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
await new Promise(r2 => setTimeout(r2, 1500));

const dump = await ev(`(() => {
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    const st = getComputedStyle(e);
    if (st.position === 'fixed' || st.position === 'absolute') {
      const b = e.getBoundingClientRect();
      if (b.width > 100 && b.height > 40) {
        for (const l of e.querySelectorAll('*')) {
          if (l.children.length === 0) {
            const t = (l.textContent || '').trim();
            if (t.length > 2 && t.length < 60) out.push(t + ' @' + Math.round(l.getBoundingClientRect().x) + ',' + Math.round(l.getBoundingClientRect().y));
          }
        }
      }
    }
  }
  return [...new Set(out)].slice(0, 30);
})()`);
console.log('popup texts:');
for (const d of dump) console.log('  ', d);

const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
writeFileSync('C:/Users/zyz/Documents/projects/schedule-app/.playwright-mcp/model-open.jpg', Buffer.from(shot.result.data, 'base64'));
console.log('shot saved: model-open.jpg');
ws.close(); process.exit(0);
