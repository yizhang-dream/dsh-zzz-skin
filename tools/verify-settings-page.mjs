// E2E：设置页「皮肤中心」+ 心情插件删除验证
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
const shot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  (await import('node:fs')).writeFileSync(`C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};
await send('Page.enable'); await send('Page.bringToFront');
await send('Page.reload', { ignoreCache: true });
await new Promise(r => setTimeout(r, 10000));

// 1. 入口签撤除 / fm-widget 消失 / 无横幅 / 背景层还在
const s1 = await ev(`(() => ({
  banner: !!document.body.textContent.match(/Failed to load plugins|invalid plugin/),
  entryTab: !!document.getElementById('eridu-entry'),
  fmWidget: !!document.querySelector('[class*=fm-widget], [id*=fm-widget], iframe[src*=feiyu]'),
  bgLayer: !!document.querySelector('[data-dsh-skin-layer=background]'),
  skin: document.documentElement.getAttribute('data-dsh-skin'),
}))()`);
console.log('1.after-reload:', JSON.stringify(s1));

// 2. 开设置，查导航
const open1 = await ev(`document.querySelector('[role=dialog]') ? 'open' : 'closed'`);
if (open1 === 'closed') {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 3, key: ',', code: 'Comma', windowsVirtualKeyCode: 188 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 3, key: ',', code: 'Comma', windowsVirtualKeyCode: 188 });
}
await new Promise(r => setTimeout(r, 1200));
const nav = await ev(`(() => {
  const dlg = document.querySelector('[role=dialog]');
  if (!dlg) return 'no-dialog';
  const cells = [...dlg.querySelectorAll('[class*=navCell], [class*=navList] button')];
  return JSON.stringify(cells.map(c => ({
    text: (c.textContent || '').trim().slice(0, 12),
    active: String(c.className).includes('active'),
  })));
})()`);
console.log('2.nav:', nav);
await shot('sp-settings-nav');

// 3. 点「皮肤中心」页
const clickSkin = await ev(`(() => {
  const cells = [...document.querySelectorAll('[role=dialog] [class*=navCell], [role=dialog] [class*=navList] button')];
  const it = cells.find(c => /皮肤中心/.test(c.textContent || ''));
  if (!it) return 'nf';
  it.click(); return 'ok';
})()`);
await new Promise(r => setTimeout(r, 1500));
const page = await ev(`(() => {
  const sec = document.querySelector('.esc');
  if (!sec) return 'no-section';
  return JSON.stringify({
    cards: document.querySelectorAll('.esc-card').length,
    tabs: [...document.querySelectorAll('.esc-tab')].map(t => t.textContent.trim()),
    cur: (document.querySelector('.esc-head .cur') || {}).textContent || '',
    sticker: !!document.querySelector('.esc-sticker'),
  });
})()`);
console.log('3.skin-page:', clickSkin, page);
await shot('sp-skin-page');

// 4. 点一张别的卡换肤，再点回原卡
const before = await ev(`document.documentElement.getAttribute('data-dsh-skin')`);
const sw = await ev(`(() => {
  const cards = [...document.querySelectorAll('.esc-card')];
  const other = cards.find(c => c.dataset.vid !== undefined && !c.classList.contains('on') && /观测台/.test(c.querySelector('.nm').textContent));
  const target = other || cards.find(c => !c.classList.contains('on'));
  if (!target) return 'nf';
  target.click();
  return target.querySelector('.nm').textContent.trim().slice(0, 14);
})()`);
await new Promise(r => setTimeout(r, 2500));
const after = await ev(`(() => JSON.stringify({ skin: document.documentElement.getAttribute('data-dsh-skin'), msg: (document.querySelector('.esc-msg') || {}).textContent || '' }))()`);
console.log('4.switch:', before, '→', sw, after);

// 5. 切回原皮肤
const back = await ev(`(() => {
  const cards = [...document.querySelectorAll('.esc-card')];
  const t = cards.find(c => c.querySelector('.nm').textContent.includes('${before}'));
  if (!t) return 'nf'; t.click(); return 'ok';
})()`);
await new Promise(r => setTimeout(r, 2000));
console.log('5.restore:', back, await ev(`document.documentElement.getAttribute('data-dsh-skin')`));

// 6. 头像页签：搜索南宫羽 → 选中 → 应用
const avTab = await ev(`(() => { const t = [...document.querySelectorAll('.esc-tab')].find(x => /头像/.test(x.textContent)); if (t) { t.click(); return 'ok'; } return 'nf'; })()`);
await new Promise(r => setTimeout(r, 1000));
await ev(`(() => { const i = document.querySelector('.esc-search'); if (i) { const p = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; p.call(i, '南宫羽'); i.dispatchEvent(new Event('input', { bubbles: true })); } return 1; })()`);
await new Promise(r => setTimeout(r, 700));
const avCells = await ev(`(() => JSON.stringify({ cells: [...document.querySelectorAll('.esc-avcell')].map(c => c.textContent.trim().slice(0, 10)), visible: [...document.querySelectorAll('.esc-avcell')].filter(c => c.offsetParent).length }))()`);
console.log('6.avatar-search:', avTab, avCells);
const pick = await ev(`(() => { const c = document.querySelector('.esc-avcell'); if (!c) return 'nf'; c.click(); return 'ok'; })()`);
await new Promise(r => setTimeout(r, 400));
const applied = await ev(`(() => { const b = document.querySelector('.esc-apply'); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
await new Promise(r => setTimeout(r, 3000));
const avState = await ev(`(() => JSON.stringify({ msg: (document.querySelector('.esc-msg') || {}).textContent || '', using: (document.querySelector('.esc-avcell.on span') || {}).textContent || '' }))()`);
console.log('7.avatar-apply:', pick, applied, avState);
await shot('sp-avatar-page');

// 8. 其他页签回归：点「通用设置」
const gen = await ev(`(() => { const cells = [...document.querySelectorAll('[role=dialog] [class*=navCell], [role=dialog] [class*=navList] button')]; const it = cells.find(c => /通用设置/.test(c.textContent || '')); if (it) { it.click(); return 'ok'; } return 'nf'; })()`);
await new Promise(r => setTimeout(r, 700));
const genOk = await ev(`(() => JSON.stringify({ secGone: !document.querySelector('.esc'), panelText: ((document.querySelector('[role=dialog]') || {}).textContent || '').slice(0, 40) }))()`);
console.log('8.general-page:', gen, genOk);
await shot('sp-general-page');
process.exit(0);
