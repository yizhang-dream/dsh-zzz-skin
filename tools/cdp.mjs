#!/usr/bin/env node
// 真实 Chrome CDP 驱动（v3.18 铁律：验收 DSH UI 一律真实 Chrome，不用无头）。
// 用法：node cdp.mjs <cmd> [args...]
//   goto <url>                     导航并等 load+9s
//   reload                         刷新当前页并等 6s
//   eval "<js>" / evalfile <path>  求值（awaitPromise, returnByValue），打印 JSON
//   click <css>                    点元素中心（先滚入视口）
//   hover <css>                    悬停 700ms
//   type <text>                    Input.insertText
//   key <Enter|Tab|Escape>         按键
//   shot <name.(png|jpg)>          视口截图（jpg=质量50，规避大文件）；存 .playwright-mcp/
//   shotfull <name.png>            整页截图
//   wait <ms>
import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.CDP_PORT || 9333;
const SHOTS = join(homedir(), 'Documents', 'projects', 'schedule-app', '.playwright-mcp');

const [, , cmd, ...args] = process.argv;
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
const send = (method, params = {}) => new Promise(res => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaljs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { error: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) };
  return r.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (cmd === 'goto') {
  await send('Page.enable');
  await send('Page.navigate', { url: args[0] });
  await sleep(9000);
  console.log('goto done');
} else if (cmd === 'reload') {
  await send('Page.enable');
  await send("Page.reload", { ignoreCache: true });
  await sleep(6000);
  console.log('reload done');
} else if (cmd === 'eval' || cmd === 'evalfile') {
  const expr = cmd === 'evalfile' ? (await readFile(args[0], 'utf8')) : args[0];
  console.log(JSON.stringify(await evaljs(expr)));
} else if (cmd === 'click' || cmd === 'hover') {
  const rect = await evaljs(`(function(){const el=document.querySelector(${JSON.stringify(args[0])});if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if (!rect) { console.error('not found'); process.exit(1); }
  const types = cmd === 'click' ? ['mousePressed', 'mouseReleased'] : ['mouseMoved'];
  for (const t of types) await send('Input.dispatchMouseEvent', { type: t, x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  if (cmd === 'hover') await sleep(700);
  console.log(cmd, 'ok', JSON.stringify(rect));
} else if (cmd === 'type') {
  await send('Input.insertText', { text: args[0] });
  console.log('type ok');
} else if (cmd === 'key') {
  const map = { Enter: ['\r', 13], Tab: ['\t', 9], Escape: ['\u001b', 27] };
  const [text, vk] = map[args[0]] || ['a', 65];
  for (const type of ['keyDown', 'keyUp'])
    await send('Input.dispatchKeyEvent', { type, key: args[0], text: type === 'keyDown' ? text : undefined, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  console.log('key ok');
} else if (cmd === 'shot' || cmd === 'shotfull') {
  await send('Page.enable');
  const jpeg = /\.jpe?g$/i.test(args[0]);
  const m = await send('Page.captureScreenshot', { format: jpeg ? 'jpeg' : 'png', quality: jpeg ? 50 : undefined, ...(cmd === 'shotfull' ? { captureBeyondViewport: true } : {}) });
  const out = args[0].match(/^[A-Za-z]:|^[/\\]/) ? args[0] : join(SHOTS, args[0]);
  writeFileSync(out, Buffer.from(m.result.data, 'base64'));
  console.log('saved', out);
} else if (cmd === 'shotclip') {
  // shotclip <name.(png|jpg)> <x> <y> <w> <h>  视口内裁剪截图（CSS px）
  await send('Page.enable');
  const [, x, y, w, h] = args;
  const jpeg = /\.jpe?g$/i.test(args[0]);
  const m = await send('Page.captureScreenshot', { format: jpeg ? 'jpeg' : 'png', quality: jpeg ? 92 : undefined, clip: { x: +x, y: +y, width: +w, height: +h, scale: 1 } });
  const out = args[0].match(/^[A-Za-z]:|^[/\\]/) ? args[0] : join(SHOTS, args[0]);
  writeFileSync(out, Buffer.from(m.result.data, 'base64'));
  console.log('saved', out);
} else if (cmd === 'shot1440') {
  // shot1440 <name.(png|jpg)>  固定 1440x900 CSS 视口 @DPR1 截整屏（评审用）
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  await send('Page.enable');
  const jpeg = /\.jpe?g$/i.test(args[0]);
  const m = await send('Page.captureScreenshot', { format: jpeg ? 'jpeg' : 'png', quality: jpeg ? 92 : undefined });
  const out = args[0].match(/^[A-Za-z]:|^[/\\]/) ? args[0] : join(SHOTS, args[0]);
  writeFileSync(out, Buffer.from(m.result.data, 'base64'));
  await send('Emulation.clearDeviceMetricsOverride');
  console.log('saved', out);
} else if (cmd === 'viewport') {
  // viewport <w> <h> [dpr]  固定视口（评审截图统一 1440x900 DPR1）
  await send('Emulation.setDeviceMetricsOverride', {
    width: +args[0], height: +args[1], deviceScaleFactor: +(args[2] || 1), mobile: false,
  });
  await sleep(900);
  console.log('viewport', args.join('x'));
} else if (cmd === 'wait') {
  await sleep(+args[0]); console.log('waited');
}
ws.close(); process.exit(0);
