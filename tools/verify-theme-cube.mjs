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
  const want = ${JSON.stringify(text)};
  const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const ownText = e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
  const direct = [...root.querySelectorAll('button, [role=menuitem], [role=tab], [role=radio], label')].filter(e => ownText(e) === want && visible(e));
  if (direct.length) { direct[direct.length - 1].click(); return 'ok:direct'; }
  const leaves = [...root.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent || '').trim() === want && visible(e));
  if (leaves.length) { const t = leaves[leaves.length - 1].closest('[role=menuitem], button, [role=tab], [role=radio], label') || leaves[leaves.length - 1]; t.click(); return 'ok:leaf'; }
  return 'MISS ' + want;
})()`);
const shot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, name), Buffer.from(s.result.data, 'base64')); console.log('shot', name); };

await send('Page.enable');
const DIALOG = "document.querySelector('[role=dialog]')";
console.log('mode', await ev(`document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'`));
console.log('菜单', await ev(`(() => { const b = document.querySelector('button[aria-label="账号菜单"]'); if (b) b.click(); return !!b; })()`));
await sleep(1200);
console.log('设置', await clickText('设置', "document.querySelector('[role=menu]') || document"));
await sleep(1800);
console.log('通用设置', await clickText('通用设置', DIALOG));
await sleep(1500);
console.log('cubes light', JSON.stringify(await ev(`[...document.querySelectorAll('[class*=themeCube]')].map(e => ({ cls: e.className, pressed: e.getAttribute('aria-pressed'), bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }))`)));
await shot('cube-light.png');

// 暗档对照
console.log('深色', await clickText('深色', DIALOG)); await sleep(1800);
console.log('cubes dark', JSON.stringify(await ev(`[...document.querySelectorAll('[class*=themeCube]')].map(e => ({ pressed: e.getAttribute('aria-pressed'), bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }))`)));
await shot('cube-dark.png');
console.log('浅色', await clickText('浅色', DIALOG)); await sleep(1500);
ws.close();
