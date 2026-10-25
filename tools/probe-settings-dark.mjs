#!/usr/bin/env node
// 探针：浅色主题下设置弹窗内仍显深色的元素（bg 亮度低 + 面积大）
// 用法：node tools/probe-settings-dark.mjs [--shot name.png]
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.CDP_PORT || 9333;
const SHOTS = join(homedir(), 'Documents', 'projects', 'schedule-app', '.playwright-mcp');
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaljs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { error: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) };
  return r.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clickText = async (text, scope = 'document') => evaljs(`(() => {
  const root = ${scope};
  if (!root || !root.querySelectorAll) return 'NO SCOPE';
  const want = ${JSON.stringify(text)};
  const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const ownText = e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
  const direct = [...root.querySelectorAll('button, [role=menuitem], [role=tab], [role=radio], label')].filter(e => ownText(e) === want && visible(e));
  if (direct.length) { direct[direct.length - 1].click(); return 'ok:direct'; }
  const leaves = [...root.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent || '').trim() === want && visible(e));
  if (leaves.length) { const t = leaves[leaves.length - 1].closest('[role=menuitem], button, [role=tab], [role=radio], label') || leaves[leaves.length - 1]; t.click(); return 'ok:leaf'; }
  return 'MISS ' + want;
})()`);

const mode = await evaljs(`({dark: document.body.hasAttribute('data-ds-dark-theme'), skin: document.documentElement.getAttribute('data-dsh-skin')})`);
console.log('mode:', JSON.stringify(mode));

// 打开账号菜单 → 设置
await evaljs(`(() => { const b = document.querySelector('button[aria-label="账号菜单"]'); if (b) b.click(); return !!b; })()`);
await sleep(1200);
console.log('设置:', await clickText('设置', "document.querySelector('[role=menu]') || document"));
await sleep(1800);

// 需要浅色
if (mode.dark) {
  console.log('通用设置:', await clickText('通用设置', "document.querySelector('[role=dialog]')"));
  await sleep(900);
  console.log('浅色:', await clickText('浅色', "document.querySelector('[role=dialog]')"));
  await sleep(2000);
}
console.log('插件市场:', await clickText('插件市场', "document.querySelector('[role=dialog]')"));
await sleep(3500);

const probe = await evaljs(`(() => {
  const dlg = document.querySelector('[role=dialog]');
  if (!dlg) return { err: 'no dialog' };
  const lum = c => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).map(Number); return p.slice(0,3).reduce((a,b)=>a+b,0)/3; };
  const out = [];
  for (const el of dlg.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 24) continue;
    if (r.width * r.height < 4000) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)') continue;
    const L = lum(bg);
    if (L === null || L > 110) continue;
    const alpha = (() => { const m = bg.match(/rgba\\(([^)]+)\\)/); if (!m) return 1; const p = m[1].split(/[ ,\\/]+/).map(Number); return p.length > 3 ? p[3] : 1; })();
    if (alpha < 0.25) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 90),
      bg, L: Math.round(L),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      text: (el.innerText || '').trim().slice(0, 40).replace(/\\s+/g, ' ')
    });
  }
  // 按面积降序，最多 40 条
  out.sort((a, b) => b.rect[2]*b.rect[3] - a.rect[2]*a.rect[3]);
  const counts = {};
  for (const o of out) counts[o.bg] = (counts[o.bg] || 0) + 1;
  return { darkCount: out.length, byBg: counts, items: out.slice(0, 40) };
})()`);
console.log(JSON.stringify(probe, null, 1));

const shotName = process.argv[3] || 'settings-light-plugin.png';
await send('Page.enable');
const s = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(SHOTS, shotName), Buffer.from(s.result.data, 'base64'));
console.log('shot:', join(SHOTS, shotName));
ws.close();
