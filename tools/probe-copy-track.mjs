#!/usr/bin/env node
// 复制键边缘「真实轨迹」复现（2026-10-26）
// 上一次探针只把鼠标瞬间跳到边缘，采到的是页面上无关的 tooltip。
// 真实鼠标是连续移动的：这里按 1px 步长从按钮外侧逼近并越过边缘，
// 记录「复制」提示每次出现/消失的时机与 rect 序列，量化是否有显隐循环或位置跳变。
const PORT = process.env.CDP_PORT || 9333;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools'))
  .find(t => t.url.includes('100.112.92.62'));
if (!page) { console.error('no dsh page on CDP'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaljs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result.result.value;
};
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const btn = JSON.parse(await evaljs(`(() => {
  const all = [...document.querySelectorAll('[aria-label="复制"]')].filter(b => b.getClientRects().length);
  const b = all[all.length - 1];
  b.scrollIntoView({ block: 'center', inline: 'center' });
  const r = b.getBoundingClientRect();
  return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height });
})()`));

// 采样器：只认「复制」提示（text === 复制），记录其 rect 与动画状态
await evaljs(`(() => {
  window.__t = { events: [], added: 0, removed: 0, running: true };
  const find = () => [...document.querySelectorAll('[role=tooltip]')]
    .find(t => t.textContent.trim() === '复制' && t.getClientRects().length);
  window.__t.find = find;
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const tips = [n, ...(n.querySelectorAll ? n.querySelectorAll('[role=tooltip]') : [])];
        for (const t of tips) if (t.getAttribute && t.getAttribute('role') === 'tooltip') {
          const cs = getComputedStyle(t); const r = t.getBoundingClientRect();
          window.__t.added++;
          window.__t.events.push({ k: 'add', t: Math.round(performance.now()), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], border: cs.borderWidth, pos: cs.position, anim: cs.animationName, text: t.textContent.trim().slice(0,8) });
        }
      }
      for (const n of m.removedNodes) {
        if (n.nodeType !== 1) continue;
        const tips = [n, ...(n.querySelectorAll ? n.querySelectorAll('[role=tooltip]') : [])];
        for (const t of tips) if (t.getAttribute && t.getAttribute('role') === 'tooltip') {
          window.__t.removed++;
          window.__t.events.push({ k: 'rm', t: Math.round(performance.now()), text: t.textContent.trim().slice(0,8) });
        }
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  window.__t.mo = mo;
  const tick = () => {
    if (!window.__t.running) return;
    const tip = window.__t.find();
    if (tip) {
      const r = tip.getBoundingClientRect();
      const cs = getComputedStyle(tip);
      const cur = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',');
      const last = window.__t.events[window.__t.events.length - 1];
      if (!last || last.k !== 'frame' || last.rect.join(',') !== cur) {
        window.__t.events.push({ k: 'frame', t: Math.round(performance.now()), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], opacity: cs.opacity, transform: cs.transform.slice(0, 40), border: cs.borderWidth });
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return 'on';
})()`);

async function runTrack(name, from, to, steps) {
  await move(640, 40); await sleep(500);
  await evaljs('window.__t.events = []; window.__t.added = 0; window.__t.removed = 0; 0');
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    await move(Math.round(from.x + (to.x - from.x) * k), Math.round(from.y + (to.y - from.y) * k));
    await sleep(25);
  }
  await sleep(900);
  const s = JSON.parse(await evaljs('JSON.stringify({ events: window.__t.events, added: window.__t.added, removed: window.__t.removed })'));
  return { name, added: s.added, removed: s.removed, track: s.events.slice(0, 22) };
}

const cy = btn.y + btn.h / 2, cx = btn.x + btn.w / 2;
const runs = [];
// 从左侧外部水平逼近并越过左边缘
runs.push(await runTrack('左侧逼近', { x: btn.x - 26, y: cy }, { x: btn.x + 5, y: cy }, 34));
// 从下方竖直逼近并越过下边缘
runs.push(await runTrack('下方逼近', { x: cx, y: btn.y + btn.h + 24 }, { x: cx, y: btn.y + btn.h - 4 }, 30));
// 沿上边缘横向刮（最容易触发进出的姿势）
runs.push(await runTrack('上边缘横扫', { x: btn.x - 8, y: btn.y + 1 }, { x: btn.x + btn.w + 8, y: btn.y + 1 }, 40));

await evaljs('(() => { window.__t.running = false; window.__t.mo.disconnect(); return "off"; })()');
await move(640, 40);
console.log(JSON.stringify({ btn, runs }, null, 1));
ws.close();
