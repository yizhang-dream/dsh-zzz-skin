// 开设置对话框并 dump：导航项/面板容器/翻页机制
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Page.bringToFront');

const s1 = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '账号菜单'); if (b) { b.click(); return 'ok'; } return 'nf'; })()`);
await new Promise(r => setTimeout(r, 700));
const s2 = await ev(`(() => { const items = [...document.querySelectorAll('[role=menuitem], button, a')]; const it = items.find(x => /^设置$/.test((x.textContent || '').trim())); if (it) { it.click(); return 'ok'; } return 'nf:' + items.slice(0, 14).map(x => (x.textContent || '').trim().slice(0, 8)).join('|'); })()`);
await new Promise(r => setTimeout(r, 1200));
console.log('open:', s1, s2);

const dump = await ev(`(() => {
  const dlg = document.querySelector('[data-dsh-surface="settings"]') || document.querySelector('[role=dialog]');
  if (!dlg) return 'no-dialog';
  // 树形 dump（深度 6，只留结构性节点）
  function tree(el, d) {
    if (d > 6) return null;
    const r = el.getBoundingClientRect();
    const kids = [...el.children].map(c => tree(c, d + 1)).filter(Boolean);
    return {
      tag: el.tagName,
      cls: String(el.className).slice(0, 46) || undefined,
      slot: el.getAttribute('data-slot') || undefined,
      role: el.getAttribute('role') || undefined,
      w: Math.round(r.width) || undefined, h: Math.round(r.height) || undefined,
      text: !kids.length && (el.textContent || '').trim() ? (el.textContent || '').trim().slice(0, 16) : undefined,
      kids: kids.length ? kids : undefined,
    };
  }
  return JSON.stringify(tree(dlg, 0), null, 1).slice(0, 7000);
})()`);
console.log(dump);
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
(await import('node:fs')).writeFileSync('C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/settings-open.jpg', Buffer.from(shot.result.data, 'base64'));
console.log('shot saved');
process.exit(0);
