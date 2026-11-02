// 量 blacktunes 绳网论坛站材质 token：底色/强调色/字体/圆角
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
await new Promise(r => setTimeout(r, 7000));

const out = await ev(`(() => {
  const html = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  // 主要表面色：面积最大的几个背景
  const bgCount = {};
  for (const el of document.querySelectorAll('div, main, aside, header, nav, section')) {
    const s = getComputedStyle(el);
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      const r = el.getBoundingClientRect();
      const a = Math.round(r.width * r.height / 1000);
      bgCount[s.backgroundColor] = (bgCount[s.backgroundColor] || 0) + a;
    }
  }
  const topBg = Object.entries(bgCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  // 按钮/强调色：button 与链接的配色
  const accents = {};
  for (const b of document.querySelectorAll('button, a, [class*=btn]')) {
    const s = getComputedStyle(b);
    const key = s.backgroundColor !== 'rgba(0, 0, 0, 0)' ? s.backgroundColor : s.color;
    accents[key] = (accents[key] || 0) + 1;
  }
  const topAccent = Object.entries(accents).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const fonts = [...document.fonts].map(f => f.family + ' ' + f.status).slice(0, 10);
  // 圆角抽样
  const radii = {};
  for (const c of document.querySelectorAll('[class*=card], article, [class*=post]')) {
    const rr = getComputedStyle(c).borderRadius; radii[rr] = (radii[rr] || 0) + 1;
  }
  return JSON.stringify({
    title: document.title,
    htmlBg: html.backgroundColor, bodyBg: body.backgroundColor,
    bodyColor: body.color, bodyFont: body.fontFamily.slice(0, 120),
    topBg, topAccent, fonts, radii,
    text: (document.body.innerText || '').slice(0, 300),
  }, null, 1);
})()`);
console.log(out);
await shot('interknot-forum');
process.exit(0);
