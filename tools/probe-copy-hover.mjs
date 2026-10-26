#!/usr/bin/env node
// 复制键边缘悬停抖动探针（2026-10-26）
// 目的：用户报「鼠标放在复制键边缘会弹动」。逐点把鼠标移到复制按钮中心/四边，
// 逐帧采样按钮 rect + 皮肤命中的 tooltip rect，量化「是否在边缘进入显隐循环」。
// 用法：node tools/probe-copy-hover.mjs
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

const btnInfo = JSON.parse(await evaljs(`(() => {
  const all = [...document.querySelectorAll('[aria-label="复制"]')].filter(b => b.getClientRects().length);
  const btn = all[all.length - 1];
  if (!btn) return null;
  btn.scrollIntoView({ block: 'center', inline: 'center' });
  const r = btn.getBoundingClientRect();
  return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height });
})()`));
if (!btnInfo) { console.error('复制按钮未找到'); process.exit(1); }

await evaljs(`(() => {
  window.__p = { frames: [], added: 0, removed: 0, running: true };
  const all = [...document.querySelectorAll('[aria-label="复制"]')].filter(b => b.getClientRects().length);
  window.__p.btn = all[all.length - 1];
  const isTip = n => n.nodeType === 1 && (n.getAttribute?.('role') === 'tooltip' || n.querySelector?.('[role=tooltip]'));
  window.__p.mo = new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of m.addedNodes) if (isTip(n)) window.__p.added++;
      for (const n of m.removedNodes) if (isTip(n)) window.__p.removed++;
    }
  });
  window.__p.mo.observe(document.body, { childList: true, subtree: true });
  const tick = () => {
    if (!window.__p.running) return;
    const b = window.__p.btn, tip = document.querySelector('[role=tooltip]');
    const br = b && b.isConnected ? b.getBoundingClientRect() : null;
    const tr = tip ? tip.getBoundingClientRect() : null;
    const cs = tip ? getComputedStyle(tip) : null;
    window.__p.frames.push({
      btn: br ? [Math.round(br.x), Math.round(br.y), Math.round(br.width), Math.round(br.height)] : null,
      tip: tr ? [Math.round(tr.x), Math.round(tr.y), Math.round(tr.width), Math.round(tr.height)] : null,
      pe: cs ? cs.pointerEvents : null,
      bw: cs ? cs.borderWidth : null,
      pos: cs ? cs.position : null,
      op: cs ? cs.opacity : null,
      txt: tip ? tip.textContent.trim().slice(0, 8) : null,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return 'on';
})()`);

const probes = [
  { name: 'center', x: btnInfo.x + btnInfo.w / 2, y: btnInfo.y + btnInfo.h / 2 },
  { name: 'left-edge', x: btnInfo.x + 1, y: btnInfo.y + btnInfo.h / 2 },
  { name: 'right-edge', x: btnInfo.x + btnInfo.w - 1, y: btnInfo.y + btnInfo.h / 2 },
  { name: 'top-edge', x: btnInfo.x + btnInfo.w / 2, y: btnInfo.y + 1 },
  { name: 'bottom-edge', x: btnInfo.x + btnInfo.w / 2, y: btnInfo.y + btnInfo.h - 1 },
  { name: 'top-left-corner', x: btnInfo.x + 2, y: btnInfo.y + 2 },
];
const results = {};
for (const p of probes) {
  await evaljs('window.__p.frames = []; window.__p.added = 0; window.__p.removed = 0; 0');
  await move(p.x, p.y);
  await new Promise(r => setTimeout(r, 1500));
  const s = JSON.parse(await evaljs('JSON.stringify({ frames: window.__p.frames, added: window.__p.added, removed: window.__p.removed })'));
  const uniq = arr => [...new Set(arr.map(v => JSON.stringify(v)))];
  const btnRects = uniq(s.frames.map(f => f.btn));
  const tipRects = uniq(s.frames.map(f => f.tip));
  const withTip = s.frames.filter(f => f.tip);
  results[p.name] = {
    frames: s.frames.length,
    btnDistinctRects: btnRects.length,
    btnRects: btnRects.slice(0, 3),
    tooltipFrameRatio: `${withTip.length}/${s.frames.length}`,
    tooltipDistinctRects: tipRects.length,
    tooltipRects: tipRects.slice(0, 4),
    tipAddRemove: `${s.added}/${s.removed}`,
    sample: withTip.length ? { pe: withTip[0].pe, border: withTip[0].bw, pos: withTip[0].pos, text: withTip[0].txt } : null,
  };
}
await evaljs('(() => { window.__p.running = false; window.__p.mo.disconnect(); return "off"; })()');
await move(640, 40); // 收尾：鼠标移开
console.log(JSON.stringify({ btn: btnInfo, results }, null, 1));
ws.close();
