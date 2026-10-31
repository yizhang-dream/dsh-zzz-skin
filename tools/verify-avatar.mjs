#!/usr/bin/env node
// 头像换图验收（2026-10-31）：真 Chrome + CDP。
// 1) ignoreCache 重载；2) 找 AI 消息行（无则注入 :assistant-step 锚点探针）；
// 3) 按 ::before 几何（left 12 / top 10 / 47×47）裁剪截图；
// 4) 页内 fetch 两个头像资产确认 200；
// 5) 输出裁剪图，与本地所选 webp 由 ffmpeg 比对（脚本外跑）。
// 用法：CDP_PORT=9334 node tools/verify-avatar.mjs <out.png> [--probe]
const [, , out, flag] = process.argv;
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
const ev = async (fn) => (await send('Runtime.evaluate', { expression: fn, returnByValue: true, awaitPromise: true })).result.result.value;

await send('Page.enable');
await send('Page.bringToFront');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 4000));

let info = await ev(`(() => {
  const rows = [...document.querySelectorAll('[data-chat-anchor-key*=":assistant-step"]:not([data-chat-anchor-key*="["]):not([hidden])')];
  const el = rows[0];
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, count: rows.length,
           key: el.getAttribute('data-chat-anchor-key').slice(0, 60) };
})()`);
if (!info && flag === '--probe') {
  await ev(`(() => {
    const d = document.createElement('div');
    d.setAttribute('data-chat-anchor-key', 'probe:assistant-step');
    d.textContent = 'avatar probe ';
    d.style.cssText = 'position:relative;height:70px;margin:40px 60px;width:600px;background:#222';
    (document.querySelector('.pI_x6G_centerCol') || document.body).appendChild(d);
    d.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  info = await ev(`(() => {
    const el = document.querySelector('[data-chat-anchor-key="probe:assistant-step"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, count: 1, key: 'probe' };
  })()`);
}
if (!info) { console.error('no assistant row (try --probe)'); process.exit(1); }
console.log('anchor:', JSON.stringify(info));

const dpr = await ev('devicePixelRatio');
const clip = {
  x: Math.max(0, (info.x + 12 - 4) * dpr), y: Math.max(0, (info.y + 10 - 4) * dpr),
  width: 55 * dpr, height: 55 * dpr, scale: 1,
};
const shot = await send('Page.captureScreenshot', { format: 'png', clip });

const assets = await ev(`(async () => {
  const base = location.origin + '/api/skin-center/v2/skins/';
  const active = document.documentElement.getAttribute('data-dsh-skin') || '';
  const out = { active };
  for (const f of ['avatar-agent.webp', 'avatar-fatfish-128.png']) {
    try { const r = await fetch(base + active + '/assets/' + f); out[f] = r.status + ' ' + (r.headers.get('content-type') || ''); }
    catch (e) { out[f] = 'ERR ' + e.message; }
  }
  const css = await fetch(base + active + '/patches').then(r => r.text());
  out.radius = (css.match(/border-radius: ([\\d.]+(?:px|%)); \\/\\* avatar-shape \\*\\//) || [])[1];
  out.agentInCss = css.includes('avatar-agent.webp');
  return out;
})()`);
console.log('assets:', JSON.stringify(assets));

const { writeFileSync } = await import('node:fs');
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(`saved ${out} (dpr=${dpr})`);
ws.close();
