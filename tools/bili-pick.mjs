#!/usr/bin/env node
// B站表单下拉选择：页面内一体完成 定位label→点开→等弹层→点匹配选项→回读。
// 用法：node bili-pick.mjs <label关键词> <选项文本>
const PORT = process.env.CDP_PORT || 9333;
const [, , labelKey, optionText] = process.argv;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('bilibili.com'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params })); });

const expr = `
new Promise(resolve => {
  const label = [...document.querySelectorAll('*')].filter(e =>
    e.children.length === 0 && (e.textContent || '').trim().includes(${JSON.stringify(labelKey)}) && e.getBoundingClientRect().width > 0
  )[0];
  if (!label) return resolve({ err: 'label not found: ${labelKey}' });
  const row = label.closest('[class*=item], [class*=row]');
  if (row) row.scrollIntoView({ block: 'center' });
  const control = row && (row.querySelector('input, [class*=select]') || row);
  if (!control) return resolve({ err: 'control not found' });
  const before = document.querySelectorAll('body *').length;
  control.click();
  setTimeout(() => {
    // 弹层选项：后出现或高层的可见叶子，文本匹配
    const cands = [...document.querySelectorAll('body *')].filter(e => {
      if (e.children.length !== 0) return false;
      const t = (e.textContent || '').trim();
      if (!t || t.length > 30) return false;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 8 || r.y < 0 || r.y > innerHeight) return false;
      return true;
    });
    const target = cands.filter(e => (e.textContent || '').trim().includes(${JSON.stringify(optionText)}));
    const allTexts = [...new Set(cands.map(e => (e.textContent || '').trim()))].slice(0, 25);
    if (!target.length) return resolve({ err: 'option not found', visible: allTexts });
    const el = target[target.length - 1];
    const opt = el.closest('li, [class*=option], [class*=item]') || el;
    opt.click();
    setTimeout(() => resolve({ ok: true, clicked: (el.textContent || '').trim(), visible: allTexts.slice(0, 8) }), 500);
  }, 700);
})`;

const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(m.result?.result?.value ?? m.result, null, 1).slice(0, 1500));
ws.close();
process.exit(0);
