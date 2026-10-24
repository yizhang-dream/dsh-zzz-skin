#!/usr/bin/env node
// B站表单下拉选择 v2：页面内完成（找到可见选项→对 LI 派发完整指针序列→回读）。
// 前置：下拉已处于打开状态（如已用 ArrowDown 打开）。
// 用法：node bili-pick2.mjs <选项精确文本> [label关键词，默认创作声明]
const PORT = process.env.CDP_PORT || 9333;
const [, , optionText, labelKey = '创作声明'] = process.argv;

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
    e.children.length === 0 && (e.textContent || '').trim() === ${JSON.stringify(optionText)} && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().y > 200);
  if (!leaf) return resolve({ err: 'option not visible' });
  const li = leaf.closest('li, [class*=option], [class*=item]') || leaf;
  const rect = li.getBoundingClientRect();
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const base = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, view: window };
  const down = { ...base, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  const up = { ...base, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  li.dispatchEvent(new PointerEvent('pointerdown', down));
  li.dispatchEvent(new MouseEvent('mousedown', down));
  li.dispatchEvent(new PointerEvent('pointerup', up));
  li.dispatchEvent(new MouseEvent('mouseup', up));
  li.dispatchEvent(new MouseEvent('click', up));
  setTimeout(() => {
    const label = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent || '').trim().includes(${JSON.stringify(labelKey)}))[0];
    const row = label && label.closest('[class*=item], [class*=row]');
    const inp = row && row.querySelector('input');
    const stillOpen = [...document.querySelectorAll('body *')].some(e =>
      e.children.length === 0 && /含AI生成内容|含虚构演绎/.test(e.textContent || '') && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().y > 200);
    resolve({ inputVal: inp ? inp.value : null, stillOpen, rowText: row ? (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : null });
  }, 700);
})`;

const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(m.result?.result?.value ?? m.result, null, 1).slice(0, 800));
ws.close();
process.exit(0);
