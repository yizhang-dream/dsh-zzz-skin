// 挖 auraa 站消息行完整包装结构（头像在哪层）+ 字体清单 + 页面底
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable');

const out = await ev(`(() => {
  const mc = document.querySelector('.message-content');
  if (!mc) return 'no-message-content';
  // 沿祖先链打印到主列表层
  const chain = [];
  let n = mc;
  for (let i = 0; i < 6 && n; i++) {
    const r = n.getBoundingClientRect();
    const s = getComputedStyle(n);
    chain.push({
      tag: n.tagName, cls: String(n.className).slice(0, 90),
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      display: s.display, gap: s.gap, align: s.alignItems, pad: s.padding,
      childSummary: [...n.children].map(c => c.tagName + '.' + String(c.className).slice(0, 30)).slice(0, 8),
    });
    n = n.parentElement;
  }
  // 全部靠近消息区的 img
  const list = mc.closest('[class*=list], main, [class*=chat]');
  const imgs = [...(list || document).querySelectorAll('img')].map(im => { const r = im.getBoundingClientRect(); return { src: im.src.split('/').pop(), x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), radius: getComputedStyle(im).borderRadius }; });
  // 字体清单
  const fonts = [...document.fonts].map(f => f.family + ' ' + f.status).slice(0, 12);
  // 根背景（动态壁纸）
  const bgEls = [...document.querySelectorAll('video, [class*=bg], [class*=wallpaper], [class*=background]')].slice(0, 6).map(e => e.tagName + '.' + String(e.className).slice(0, 40) + (e.currentSrc ? ' src=' + e.currentSrc.split('/').pop() : ''));
  return JSON.stringify({ chain, imgs, fonts, bgEls }, null, 1);
})()`);
console.log(out);
process.exit(0);
