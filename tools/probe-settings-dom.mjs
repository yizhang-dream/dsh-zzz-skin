// 探测宿主设置对话框 DOM：导航项结构、面板容器、翻页机制（为皮肤中心并入设置做准备）
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Page.bringToFront');

// 打开设置：点头像菜单里的「设置」（或直接找按钮）
const opened = await ev(`(() => {
  const av = document.querySelector('[data-slot="account.menu"], [class*="avatar"], [class*="Avatar"]');
  // 尝试常见入口：先点账户按钮
  const btns = [...document.querySelectorAll('button, [role=button]')];
  const acc = btns.find(b => /设置/.test((b.textContent || '')) && b.closest('[role=menu], [class*=menu]'));
  if (acc) { acc.click(); return 'clicked-menu-item'; }
  if (av) { av.click(); return 'clicked-avatar'; }
  return 'nf';
})()`);
await new Promise(r => setTimeout(r, 800));
const step2 = await ev(`(() => {
  const items = [...document.querySelectorAll('[role=menuitem], button')];
  const it = items.find(x => /^设置$|^Settings$/.test((x.textContent || '').trim()));
  if (it) { it.click(); return 'opened-settings'; }
  return 'nf:' + items.slice(0, 12).map(x => (x.textContent || '').trim().slice(0, 8)).join('|');
})()`);
await new Promise(r => setTimeout(r, 1200));
console.log('open:', opened, '→', step2);

const dump = await ev(`(() => {
  const dlg = document.querySelector('[data-dsh-surface="settings"]') || document.querySelector('[role=dialog]');
  if (!dlg) return 'no-dialog';
  const r = dlg.getBoundingClientRect();
  // 导航列表：左侧一组可点项
  const navCandidates = [...dlg.querySelectorAll('nav, [role=tablist], [class*=nav], [class*=sidebar], [class*=menu]')];
  const navs = navCandidates.map(n => ({
    tag: n.tagName, cls: String(n.className).slice(0, 60), role: n.getAttribute('role'),
    items: [...n.querySelectorAll('button, [role=tab], [role=menuitem], a')].slice(0, 20).map(b => ({
      text: (b.textContent || '').trim().slice(0, 12),
      cls: String(b.className).slice(0, 50),
      ariaSel: b.getAttribute('aria-selected'), role: b.getAttribute('role'),
      dataAttrs: Object.keys(b.dataset || {}).join(','),
    })),
  })).filter(n => n.items.length >= 2);
  // 面板容器：nav 兄弟/右侧大区域
  const panels = [...dlg.children].map(c => ({ tag: c.tagName, cls: String(c.className).slice(0, 70), w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height) }));
  // dialog 根属性
  const rootAttrs = {};
  for (const a of dlg.attributes) rootAttrs[a.name] = (a.value || '').slice(0, 60);
  // 当前激活面板内容特征
  const main = [...dlg.querySelectorAll('div')].filter(d => { const b = d.getBoundingClientRect(); return b.width > 300 && b.height > 300 && !d.querySelector('div div div div div'); }).slice(0, 3)
    .map(d => ({ cls: String(d.className).slice(0, 60), text: (d.textContent || '').slice(0, 60) }));
  return JSON.stringify({ rootAttrs, rect: { w: Math.round(r.width), h: Math.round(r.height) }, topChildren: panels, navs, main }, null, 1);
})()`);
console.log(dump);
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
(await import('node:fs')).writeFileSync('C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/settings-dom.jpg', Buffer.from(shot.result.data, 'base64'));
console.log('shot saved');
process.exit(0);
