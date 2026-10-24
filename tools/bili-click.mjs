#!/usr/bin/env node
// B站页面通用点击：按可见叶子文本定位行元素，派发完整指针序列，可选回读。
// 用法：node bili-click.mjs <精确文本> [--xmin <n>] [--check <js表达式>]
const PORT = process.env.CDP_PORT || 9333;
const argv = process.argv.slice(2);
const text = argv[0];
const xminIdx = argv.indexOf('--xmin');
const xmin = xminIdx > -1 ? Number(argv[xminIdx + 1]) : 0;
const checkIdx = argv.indexOf('--check');
const check = checkIdx > -1 ? argv[checkIdx + 1] : null;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('bilibili.com'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params })); });

const expr = `
new Promise(resolve => {
  const leaf = [...document.querySelectorAll('body *')].find(e =>
    e.children.length === 0 && (e.textContent || '').trim() === ${JSON.stringify(text)} &&
    e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().x > ${xmin});
  if (!leaf) return resolve({ err: 'not visible' });
  const row = leaf.closest('li, [class*=item], [class*=menu-item], [class*=option], button') || leaf;
  const rect = row.getBoundingClientRect();
  const cx = rect.x + Math.min(rect.width / 2, 150), cy = rect.y + rect.height / 2;
  const base = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, view: window };
  row.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  row.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
  row.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  row.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
  row.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
  setTimeout(() => {
    const result = { clicked: ${JSON.stringify(text)}, rowCls: (row.className || '').toString().slice(0, 30) };
    ${check ? `try { result.check = eval(${JSON.stringify(check)}); } catch (e) { result.checkErr = e.message; }` : ''}
    resolve(result);
  }, 900);
})`;

const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(m.result?.result?.value ?? m.result, null, 1).slice(0, 900));
ws.close();
process.exit(0);
