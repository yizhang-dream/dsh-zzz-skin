import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = 9333;
const SHOTS = join(homedir(), 'Documents', 'projects', 'schedule-app', '.playwright-mcp');
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { error: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) };
  return r.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, name), Buffer.from(s.result.data, 'base64')); };
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, clickCount: 0 });

await send('Page.enable');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(800);

const msg = await ev(`(() => {
  const m = [...document.querySelectorAll('[data-chat-anchor-key*=":input-message"]')].pop();
  m.scrollIntoView({ block: 'center' });
  const r = m.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()`);
await move(msg.x, msg.y);
await sleep(800);

const target = await ev(`(() => {
  const users = [...document.querySelectorAll('[data-chat-anchor-key*=":input-message"]')];
  const m = users[users.length - 1];
  const mr = m.getBoundingClientRect();
  let best = null, bd = 1e9;
  for (const b of [...document.querySelectorAll('button[aria-label="复制"]')]) {
    const r = b.getBoundingClientRect();
    if (r.width <= 0) continue;
    const d = Math.abs(r.y - (mr.y + mr.height + 20)) + Math.abs(r.x - (mr.right - 60));
    if (d < bd) { bd = d; best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }
  }
  return best;
})()`);
await move(target.x, target.y);
await sleep(900);

console.log('at veil point (900,300):', JSON.stringify(await ev(`(() => {
  const el = document.elementFromPoint(900, 300);
  if (!el) return 'none';
  const cs = getComputedStyle(el);
  const chain = []; let n = el;
  for (let i = 0; i < 3 && n; i++, n = n.parentElement) { const c = getComputedStyle(n); chain.push({ tag: n.tagName, cls: String(n.className).slice(0, 60), bg: c.backgroundColor, pos: c.position, z: c.zIndex, opacity: c.opacity, anim: c.animationName }); }
  return chain;
})()`), null, 1));

console.log('at copy button:', JSON.stringify(await ev(`(() => {
  const el = document.elementFromPoint(${target.x}, ${target.y});
  if (!el) return 'none';
  const cs = getComputedStyle(el);
  return { tag: el.tagName, label: el.getAttribute('aria-label'), cls: String(el.className).slice(0, 50), bg: cs.backgroundColor, z: cs.zIndex, pos: cs.position };
})()`), null, 1));

// 找会话列里的大面积覆盖层
console.log('overlays:', JSON.stringify(await ev(`(() => {
  const out = [];
  for (const el of document.querySelectorAll('[data-pane="conversation"] *, .pI_x6G_centerCol *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 800 || r.height < 500) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'static') continue;
    out.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), pos: cs.position, z: cs.zIndex, bg: cs.backgroundColor, opacity: cs.opacity, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
  }
  return out.slice(0, 10);
})()`), null, 1));
ws.close();
