// dump 设置面板结构：导航项 + 页面容器 + 翻页行为
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Page.bringToFront');
const open1 = await ev(`document.querySelector('[role=dialog]') ? 'open' : 'closed'`);
if (open1 === 'closed') {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 3, key: ',', code: 'Comma', windowsVirtualKeyCode: 188 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 3, key: ',', code: 'Comma', windowsVirtualKeyCode: 188 });
}
await new Promise(r => setTimeout(r, 1200));

const tree = await ev(`(() => {
  const dlg = document.querySelector('[role=dialog]');
  if (!dlg) return 'no-dialog';
  function t(el, d) {
    if (d > 7) return null;
    const r = el.getBoundingClientRect();
    const kids = [...el.children].map(c => t(c, d + 1)).filter(Boolean);
    return {
      tag: el.tagName, cls: String(el.className).slice(0, 40) || undefined,
      role: el.getAttribute('role') || undefined,
      w: Math.round(r.width) || undefined,
      text: !kids.length && (el.textContent || '').trim() ? (el.textContent || '').trim().slice(0, 18) : undefined,
      n: kids.length || undefined, kids: kids.length ? kids : undefined,
    };
  }
  return JSON.stringify(t(dlg, 0), null, 1).slice(0, 9000);
})()`);
console.log(tree);
process.exit(0);
