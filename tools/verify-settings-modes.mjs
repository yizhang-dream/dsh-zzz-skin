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
await send('Page.enable');
const shot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); const p = join(SHOTS, name); writeFileSync(p, Buffer.from(s.result.data, 'base64')); console.log('shot', name); };

const DIALOG = "document.querySelector('[role=dialog]')";
const mode = () => ev(`document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'`);

console.log('mode', await mode());
console.log('通用设置:', await clickText('通用设置', DIALOG)); await sleep(1500); await shot('light-settings-general.png');
console.log('皮肤:', await clickText('皮肤', DIALOG)); await sleep(2600); await shot('light-settings-skin.png');
console.log('插件市场:', await clickText('插件市场', DIALOG)); await sleep(2600); await shot('light-settings-market.png');

// 暗档回归
console.log('通用设置:', await clickText('通用设置', DIALOG)); await sleep(1200);
console.log('深色:', await clickText('深色', DIALOG)); await sleep(2200);
console.log('mode now', await mode());
console.log('插件市场:', await clickText('插件市场', DIALOG)); await sleep(2600); await shot('dark-settings-market.png');
console.log('暗档卡片:', JSON.stringify(await ev(`(() => { const c = document.querySelector('[class*="_card"]'); if (!c) return 'none'; const cs = getComputedStyle(c); return { bg: cs.backgroundColor, border: cs.borderColor, color: getComputedStyle(c.querySelector('a')||c).color }; })()`)));

// 回浅色
console.log('通用设置:', await clickText('通用设置', DIALOG)); await sleep(1200);
console.log('浅色:', await clickText('浅色', DIALOG)); await sleep(2200);
console.log('mode now', await mode());
ws.close();
