#!/usr/bin/env node
// 以指定 DPR 截视口图（市场预览规范 1440x900）。用法：node shot-dpr.mjs <out.jpg> [w] [h] [quality]
// 先设 Emulation.setDeviceMetricsOverride 再 Page.screenshot，最后还原。
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || 9333;
const [, , out, wArg, hArg, qArg] = process.argv;
const width = Number(wArg || 1440), height = Number(hArg || 900), quality = Number(qArg || 90);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools'))
  .find(t => t.url.includes('100.112.92.62')) || list.find(t => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
await new Promise(r => setTimeout(r, 1500));
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality });
await send('Emulation.clearDeviceMetricsOverride');
if (shot.result?.data) {
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', out, `${width}x${height}`);
} else {
  console.error('shot failed', JSON.stringify(shot).slice(0, 200));
  process.exit(1);
}
ws.close();
