// zenless.tools：添加左右消息后量头像几何+气泡配色+字体
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

await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /添加到左侧/.test(x.textContent||'')); if (b) b.click(); return 1; })()`);
await new Promise(r => setTimeout(r, 400));
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /添加到右侧/.test(x.textContent||'')); if (b) b.click(); return 1; })()`);
await new Promise(r => setTimeout(r, 600));

const out = await ev(`(() => {
  // 消息行探测：找含默认消息文本的行
  const chatRoot = [...document.querySelectorAll('[class*=chat], [class*=message], main, section')].filter(e => e.querySelectorAll('img').length >= 2).sort((a, b) => a.querySelectorAll('img').length - b.querySelectorAll('img').length);
  const root = chatRoot[chatRoot.length - 1];
  if (!root) return 'no-root';
  // 全部头像类 img（圆形的）
  const avatars = [...root.querySelectorAll('img')].map(im => { const r = im.getBoundingClientRect(); const s = getComputedStyle(im); return { src: (im.src || '').split('/').pop().slice(0, 40), x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), radius: s.borderRadius, circular: s.borderRadius === '9999px' || /50%/.test(s.borderRadius) }; });
  // 气泡：带背景色的非 img 元素（含文字）
  const bubbles = [];
  for (const el of root.querySelectorAll('div, p, span')) {
    if (el.children.length > 2 || !(el.textContent || '').trim()) continue;
    const s = getComputedStyle(el);
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && el.textContent.trim().length > 2) {
      const r = el.getBoundingClientRect();
      bubbles.push({ text: el.textContent.trim().slice(0, 14), x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bg: s.backgroundColor, color: s.color, radius: s.borderRadius, pad: s.padding, font: s.fontFamily.slice(0, 90), size: s.fontSize });
    }
  }
  // 聊天窗体
  const win = [...document.querySelectorAll('div')].filter(d => { const s = getComputedStyle(d); return s.backgroundColor !== 'rgba(0, 0, 0, 0)' && d.getBoundingClientRect().width > 300 && d.getBoundingClientRect().height > 300; }).slice(-3).map(d => { const r = d.getBoundingClientRect(); const s = getComputedStyle(d); return { cls: String(d.className).slice(0, 50), w: Math.round(r.width), h: Math.round(r.height), bg: s.backgroundColor, radius: s.borderRadius }; });
  const fonts = [...document.fonts].map(f => f.family + ' ' + f.status).slice(0, 10);
  return JSON.stringify({ avatars, bubbles: bubbles.slice(0, 6), win, fonts }, null, 1);
})()`);
console.log(out);
await shot('zenless-tools-chat');
process.exit(0);
