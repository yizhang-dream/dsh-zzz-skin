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

const inventory = () => ev(`(() => {
  const dlg = document.querySelector('[role=dialog]');
  const picks = [
    ['dialog', dlg],
    ['header', dlg.querySelector('[class*="_header"]')],
    ['content', dlg.querySelector('[class*="_content"]')],
    ['nav', dlg.querySelector('nav')],
    ['row', dlg.querySelector('[class*="_row"]')],
    ['card', dlg.querySelector('[class*="_card"]')],
    ['pill', dlg.querySelector('[class*="_pill"]')],
    ['tab', dlg.querySelector('[class*="_tab"]:not([class*="tabs"])')],
    ['search', dlg.querySelector('input')],
  ];
  const out = [];
  for (const [name, el] of picks) {
    if (!el) { out.push({ name, missing: true }); continue; }
    const cs = getComputedStyle(el);
    const ps = {};
    for (const p of ['::before', '::after']) {
      const c = getComputedStyle(el, p);
      if (c.content !== 'none' && (c.backgroundImage !== 'none' || c.borderTopWidth !== '0px')) {
        ps[p] = { bi: c.backgroundImage.slice(0, 120), content: c.content.slice(0, 20) };
      }
    }
    out.push({ name, bg: cs.backgroundColor, bi: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 260), border: cs.borderColor, shadow: cs.boxShadow === 'none' ? null : cs.boxShadow.slice(0, 100), pseudo: ps });
  }
  return out;
})()`);

const DIALOG = "document.querySelector('[role=dialog]')";
const setMode = async mode => {
  await clickText('通用设置', DIALOG); await sleep(1000);
  await clickText(mode, DIALOG); await sleep(2000);
};

await send('Page.enable');
const isDark = await ev(`document.body.hasAttribute('data-ds-dark-theme')`);
if (!await ev(`!!document.querySelector('[role=dialog]')`)) {
  await ev(`(() => { const b = document.querySelector('button[aria-label="账号菜单"]'); if (b) b.click(); return !!b; })()`);
  await sleep(1200);
  await clickText('设置', "document.querySelector('[role=menu]') || document");
  await sleep(1600);
}
await clickText('插件市场', DIALOG); await sleep(2000);
const lightInv = await inventory();
const s1 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(SHOTS, 'inv-light.png'), Buffer.from(s1.result.data, 'base64'));

await setMode('深色');
await clickText('插件市场', DIALOG); await sleep(2000);
const darkInv = await inventory();
const s2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(SHOTS, 'inv-dark.png'), Buffer.from(s2.result.data, 'base64'));

await setMode('浅色');
console.log('=== LIGHT ==='); console.log(JSON.stringify(lightInv, null, 1));
console.log('=== DARK ==='); console.log(JSON.stringify(darkInv, null, 1));
ws.close();
