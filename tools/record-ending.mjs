#!/usr/bin/env node
// 补录结尾：从「设置弹窗开着（浅色）」开始 → Escape 关闭 → 亮色对话收尾。
// 与主录段状态连续，剪辑时直接拼接。用法：node record-ending.mjs <输出目录>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = process.env.CDP_PORT || 9333;
const OUT = process.argv[2] || 'C:/Users/zyz/.zcode/dsh-zzz-skin/demo-ending';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'frames'), { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools'))
  .find(t => t.url.includes('100.112.92.62'));
if (!page) { console.error('no page target'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
const events = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method) events.push(m);
};
const send = (method, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async expr => {
  const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return m.result?.result?.value;
};

const frames = [];
async function handleEvents() {
  for (;;) {
    const m = events.shift();
    if (!m) { await sleep(15); continue; }
    if (m.method === 'Page.screencastFrame') {
      const { data, metadata, sessionId } = m.params;
      frames.push({ data, ts: metadata.timestamp });
      await send('Page.screencastFrameAck', { sessionId });
    }
  }
}
handleEvents();

await send('Page.enable');
const state = await evaljs(`({dialog: !!document.querySelector('[role=dialog]'), theme: document.documentElement.dataset.dsDarkTheme ?? document.body.dataset.dsDarkTheme ?? ''})`);
console.log('start state:', JSON.stringify(state));
if (!state.dialog) { console.error('dialog not open - cannot continue seamlessly'); process.exit(1); }

await send('Page.startScreencast', { format: 'jpeg', quality: 100 });
await sleep(1200);

await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
console.log('escape sent');
await sleep(2600);

// hover 气泡出操作行
await evaljs(`(() => { const b = document.querySelector('[class*=bubble], [data-dsh-part=message-body]'); if (b) b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return 'ok'; })()`);
await sleep(2600);

await send('Page.stopScreencast');
await sleep(500);

let prevTs = null;
const lines = ['ffconcat version 1.0'];
for (let i = 0; i < frames.length; i++) {
  const f = frames[i];
  const name = `frame_${String(i).padStart(4, '0')}.jpg`;
  writeFileSync(join(OUT, 'frames', name), Buffer.from(f.data, 'base64'));
  let dur = 1 / 30;
  if (prevTs !== null && f.ts > prevTs) dur = Math.min(f.ts - prevTs, 1.0);
  lines.push(`file 'frames/${name}'`, `duration ${dur.toFixed(4)}`);
  prevTs = f.ts;
}
if (frames.length) lines.push(`file 'frames/frame_${String(frames.length - 1).padStart(4, '0')}.jpg'`);
writeFileSync(join(OUT, 'list.ffconcat'), lines.join('\n') + '\n');
console.log(`== done: ${frames.length} frames ==`);
ws.close();
setTimeout(() => process.exit(0), 300);
