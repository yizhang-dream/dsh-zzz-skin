#!/usr/bin/env node
// 指定视口尺寸截图：node tools/shot-size.mjs <宽> <高> <输出文件>
// 用 CDP Emulation.setDeviceMetricsOverride 覆盖视口，绕过窗口大小限制。
const [, , w, h, out] = process.argv;
const PORT = process.env.CDP_PORT || 9333;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools'))
  .find((t) => t.url.includes('100.112.92.62')) || list.find((t) => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});

await send('Page.bringToFront');
await new Promise((r) => setTimeout(r, 800));
await send('Emulation.setDeviceMetricsOverride', {
  width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false,
});
await new Promise((r) => setTimeout(r, 2500));
const shot = await send('Page.captureScreenshot', { format: 'png' });
await send('Emulation.clearDeviceMetricsOverride');

const { writeFileSync } = await import('node:fs');
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(`saved ${out} ${w}x${h}`);
ws.close();
