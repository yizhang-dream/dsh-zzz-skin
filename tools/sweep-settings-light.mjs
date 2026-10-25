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
const clickText = async (text, scope = 'document') => ev(`(() => {
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

const probe = () => ev(`(() => {
  const dlg = document.querySelector('[role=dialog]');
  if (!dlg) return { err: 'no dialog' };
  const lum = c => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).map(Number); return p.slice(0,3).reduce((a,b)=>a+b,0)/3; };
  const out = [];
  for (const el of dlg.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 12000) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const L = lum(bg);
    if (L === null || L > 150) continue;
    const m = bg.match(/rgba\\(([^)]+)\\)/); const p = m ? m[1].split(/[ ,\\/]+/).map(Number) : [0,0,0,1];
    const alpha = p.length > 3 ? p[3] : 1;
    if (alpha < 0.02) continue;
    out.push({ cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60), bg, L: Math.round(L), alpha: +alpha.toFixed(2), area: Math.round(r.width*r.height) });
  }
  out.sort((a,b)=>b.area-a.area);
  return { n: out.length, top: out.slice(0, 6) };
})()`);

const shot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, name), Buffer.from(s.result.data, 'base64')); };
await send('Page.enable');

const navs = ['通用设置', '小黑盒', '模型', '内置插件', 'MCP 服务器', 'Agent 预设', 'IM 机器人', '刷B站', '鱼的心情', '插件市场', '鱼的记忆', '主动搭话', '皮肤'];
const DIALOG = "document.querySelector('[role=dialog]')";
console.log('mode', await ev(`document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'`));
for (const nav of navs) {
  const r = await clickText(nav, DIALOG);
  await sleep(1900);
  const p = await probe();
  const slug = nav.replace(/\s+/g, '-');
  console.log(nav, r, JSON.stringify(p).slice(0, 420));
  if (p && p.n > 0) await shot(`sweep-light-${slug}.png`);
}
ws.close();
