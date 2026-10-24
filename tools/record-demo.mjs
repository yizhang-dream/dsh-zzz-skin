#!/usr/bin/env node
// 录制 DSH 皮肤演示：CDP screencast 抓帧 + 同进程驱动演示操作。
// 产出 frames/frame_XXXX.jpg + ffconcat 清单（真实时间戳时长）。
// 用法：node record-demo.mjs <输出目录> [时长倍率]
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = process.env.CDP_PORT || 9333;
const OUT = process.argv[2] || 'C:/Users/zyz/.zcode/dsh-zzz-skin/demo-record';
const RATE = Number(process.argv[3] || 1); // >1 放慢操作节奏
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'frames'), { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms * RATE));
const pause = ms => new Promise(r => setTimeout(r, ms)); // 不受倍率影响

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const candidates = list.filter(t => t.type === 'page' && t.url.includes('100.112.92.62'));
let page = null;
for (const c of candidates) {
  const probe = new WebSocket(c.webSocketDebuggerUrl);
  await new Promise(r => probe.onopen = r);
  let pid = 0; const pp = new Map();
  probe.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pp.has(m.id)) { pp.get(m.id)(m); pp.delete(m.id); } };
  const psend = (m, params = {}) => new Promise(res => { pp.set(++pid, res); probe.send(JSON.stringify({ id: pid, method: m, params })); });
  const vis = (await psend('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true })).result?.result?.value;
  probe.close();
  if (vis === 'visible') { page = c; break; }
}
if (!page) page = candidates[0];
if (!page) { console.error('no page target'); process.exit(1); }
console.log('target:', page.webSocketDebuggerUrl.slice(-12));
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
const clickSel = async sel => evaljs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'MISS ${sel}'; el.click(); return 'ok'; })()`);
const clickText = async (text, scope = 'document') => evaljs(`(() => {
  const root = ${scope};
  if (!root || !root.querySelectorAll) return 'NO SCOPE';
  const want = ${JSON.stringify(text)};
  const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const ownText = e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
  // 1) 直接文本的按钮/菜单项
  const direct = [...root.querySelectorAll('button, [role=menuitem], [role=tab], [role=radio], label')]
    .filter(e => ownText(e) === want && visible(e));
  if (direct.length) { direct[direct.length - 1].click(); return 'ok:direct'; }
  // 2) 叶子文本 → 就近可点元素（菜单项文字在子 span 里）
  const leaves = [...root.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent || '').trim() === want && visible(e));
  if (leaves.length) {
    const t = leaves[leaves.length - 1].closest('[role=menuitem], button, [role=tab], [role=radio], label') || leaves[leaves.length - 1];
    t.click();
    return 'ok:leaf';
  }
  return 'MISS ' + want;
})()`);
const typeSlow = async text => {
  for (const ch of text) {
    await send('Input.insertText', { text: ch });
    await pause(55 + Math.random() * 70);
  }
};

// ── screencast 收帧（即时落盘，防 OOM）──
const frames = []; // 只存元数据 {ts, name}
let castSession = null;
async function handleEvents() {
  for (;;) {
    const m = events.shift();
    if (!m) { await pause(15); continue; }
    if (m.method === 'Page.screencastFrame') {
      const { data, metadata, sessionId } = m.params;
      castSession = sessionId;
      const name = `frame_${String(frames.length).padStart(4, '0')}.jpg`;
      writeFileSync(join(OUT, 'frames', name), Buffer.from(data, 'base64'));
      frames.push({ ts: metadata.timestamp, name });
      await send('Page.screencastFrameAck', { sessionId });
    }
  }
}
handleEvents();

await send('Page.enable');

// ── 钉窗口尺寸：视口必须 16:9（表面=视口×DPR），否则重设并断言 ──
for (let attempt = 0; attempt < 3; attempt++) {
  const vp = (await send('Runtime.evaluate', { expression: '({w: innerWidth, h: innerHeight})', returnByValue: true })).result.result.value;
  if (Math.abs(vp.w / vp.h - 16 / 9) < 0.005) break;
  const w = (await send('Browser.getWindowForTarget')).result;
  await send('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'normal', left: 0, top: 0, width: 1857, height: 1074 } });
  await pause(900);
  const vp2 = (await send('Runtime.evaluate', { expression: '({w: innerWidth, h: innerHeight})', returnByValue: true })).result.result.value;
  console.log('window fix attempt', attempt, JSON.stringify(vp), '→', JSON.stringify(vp2));
}
const vpFinal = (await send('Runtime.evaluate', { expression: '({w: innerWidth, h: innerHeight})', returnByValue: true })).result.result.value;
if (Math.abs(vpFinal.w / vpFinal.h - 16 / 9) >= 0.005) {
  console.error('viewport not 16:9:', JSON.stringify(vpFinal), '— abort');
  process.exit(1);
}
console.log('viewport OK:', JSON.stringify(vpFinal));

await sleep(300);

console.log('== start screencast ==');
await send('Page.startScreencast', { format: 'jpeg', quality: 100 });

const t0 = Date.now();
const step = async (name, fn) => {
  const r = await fn();
  console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${name}: ${typeof r === 'string' ? r : JSON.stringify(r)}`);
  return r;
};

// ═══ 演示脚本（当前应为暗色主题，处于有内容的会话）═══
await sleep(800);

await step('新建会话（CRT 开机 + PRESS ANY KEY）', () => clickSel('button[aria-label="新建会话"]'));
await sleep(3200);

await step('聚焦输入框', () => evaljs(`(() => { document.querySelector('div[contenteditable=true]').focus(); return 'ok'; })()`));
await sleep(400);
await step('打字', async () => { await typeSlow('用一句话介绍新艾利都'); return 'typed'; });
await sleep(700);

await step('发送', () => clickSel('button[aria-label="发送消息"]'));

// 流式：等回复完成（HDD 警报/邦布/深潜进度条/COMBO 都在这段里）
let done = false;
for (let i = 0; i < 80; i++) {
  await pause(1500);
  done = await evaljs(`(() => {
    const msgs = [...document.querySelectorAll('[class*=bubble], [data-dsh-part=message-body]')];
    if (msgs.length < 2) return false;
    const busy = document.querySelector('[aria-busy=true], [data-streaming]');
    return !busy;
  })()`);
  if (done) break;
}
console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] 流式完成: ${done}`);
await sleep(3400); // S 评级弹卡 2.6s

await step('打开账号菜单', () => clickSel('button[aria-label="账号菜单"]'));
await sleep(1600);

await step('点设置', () => clickText('设置', 'document.querySelector(\'[role=menu]\') || document'));
await sleep(2600); // 调查报告弹窗 + CONFIDENTIAL 章

await step('切到皮肤页', () => clickText('皮肤', "document.querySelector('[role=dialog]')"));
await sleep(3200); // 皮肤中心卡片：新艾利都 使用中

await step('回通用设置', () => clickText('通用设置', "document.querySelector('[role=dialog]')"));
await sleep(1200);

await step('切浅色主题', () => clickText('浅色', "document.querySelector('[role=dialog]')"));
await sleep(2400); // 白纸漫画切换

await step('Escape 关设置', async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  return 'esc';
});
await sleep(2400);

// hover 一条消息气泡出操作行
await step('hover 气泡', () => evaljs(`(() => {
  const b = document.querySelector('[class*=bubble], [data-dsh-part=message-body]');
  if (!b) return 'no bubble';
  b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return 'ok';
})()`));
await sleep(1800);

await send('Page.stopScreencast');
await pause(500);

// ── 清单 ──
let prevTs = null;
const lines = ['ffconcat version 1.0'];
for (let i = 0; i < frames.length; i++) {
  const f = frames[i];
  let dur = 1 / 30;
  if (prevTs !== null && f.ts > prevTs) dur = Math.min(f.ts - prevTs, 1.0);
  lines.push(`file 'frames/${f.name}'`, `duration ${dur.toFixed(4)}`);
  prevTs = f.ts;
}
if (frames.length) lines.push(`file 'frames/${frames[frames.length - 1].name}'`);
writeFileSync(join(OUT, 'list.ffconcat'), lines.join('\n') + '\n');

const total = frames.reduce((a, f, i) => {
  if (i === 0) return 0;
  return a + Math.min(Math.max(f.ts - frames[i - 1].ts, 0), 1.0);
}, 0);
console.log(`== done: ${frames.length} frames, ~${total.toFixed(1)}s ==`);
ws.close();
setTimeout(() => process.exit(0), 300);
