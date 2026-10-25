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
await send('Page.enable');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(700);

// 打开设置 → 皮肤 → 逐卡切换截图
await ev(`(() => { const b = document.querySelector('button[aria-label="账号菜单"]'); if (b) b.click(); return 1; })()`);
await sleep(1000);
console.log('设置', await clickText('设置', "document.querySelector('[role=menu]') || document"));
await sleep(1600);
console.log('皮肤', await clickText('皮肤', "document.querySelector('[role=dialog]')"));
await sleep(2600);

const DIALOG = "document.querySelector('[role=dialog]')";
for (const name of ['外环落日', '空洞威胁', '迎新']) {
  console.log(name, await clickText(name, DIALOG));
  await sleep(3600);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const fn = `theme-${name}.png`;
  writeFileSync(join(SHOTS, fn), Buffer.from(s.result.data, 'base64'));
  console.log('shot', fn);
  // 回皮肤页（切肤后弹窗可能已关）
  const open = await ev(`!!document.querySelector('[role=dialog]')`);
  if (!open) {
    await ev(`(() => { const b = document.querySelector('button[aria-label="账号菜单"]'); if (b) b.click(); return 1; })()`);
    await sleep(900);
    await clickText('设置', "document.querySelector('[role=menu]') || document");
    await sleep(1500);
    await clickText('皮肤', DIALOG);
    await sleep(2200);
  } else {
    const onSkin = await ev(`(() => { const d = document.querySelector('[role=dialog]'); return !!d && /皮肤/.test(d.innerText.slice(0, 200)); })()`);
    if (!onSkin) { console.log('皮肤', await clickText('皮肤', DIALOG)); await sleep(2200); }
  }
}
// 切回基座
console.log('新艾利都', await clickText('新艾利都', DIALOG));
await sleep(3000);
ws.close();
