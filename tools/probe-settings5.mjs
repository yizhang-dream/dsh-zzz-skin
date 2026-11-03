// Ctrl+Alt+, 打开设置，然后 dump 设置界面结构
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
const shot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  (await import('node:fs')).writeFileSync(`C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};
await send('Page.enable'); await send('Page.bringToFront');
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 3, key: ',', code: 'Comma', windowsVirtualKeyCode: 188 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 3, key: ',', code: 'Comma', windowsVirtualKeyCode: 188 });
await new Promise(r => setTimeout(r, 1500));

const found = await ev(`(() => {
  const out = { surfaces: [], panes: [], big: [], dialogs: [] };
  for (const el of document.querySelectorAll('[data-dsh-surface]')) { const r = el.getBoundingClientRect(); if (r.width > 0) out.surfaces.push(el.getAttribute('data-dsh-surface') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
  for (const el of document.querySelectorAll('[data-pane]')) { const r = el.getBoundingClientRect(); if (r.width > 0) out.panes.push(el.getAttribute('data-pane')); }
  for (const el of document.querySelectorAll('[role=dialog]')) out.dialogs.push(String(el.className).slice(0, 50));
  for (const el of document.querySelectorAll('div')) {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (r.width > innerWidth * 0.6 && r.height > innerHeight * 0.6 && (s.position === 'fixed' || s.position === 'absolute') && s.zIndex !== 'auto' && parseFloat(s.zIndex) >= 100) {
      out.big.push(String(el.className).slice(0, 44) + ' z=' + s.zIndex);
    }
  }
  return JSON.stringify(out, null, 1);
})()`);
console.log(found);
await shot('settings-key');
process.exit(0);
