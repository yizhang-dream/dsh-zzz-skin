// 探测 zzz-chat.auraa.moe（AKindWorld/ZZZ-Chat）：DOM 结构、消息行/头像元素、可交互入口
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;

await send('Page.enable'); await send('Page.bringToFront');
await new Promise(r => setTimeout(r, 6000)); // SPA 首屏

const info = await ev(`(() => {
  const t = (s) => document.querySelector(s)?.textContent?.slice(0, 60);
  const btns = [...document.querySelectorAll('button, [role=button], a')].map(b => (b.textContent || '').trim().slice(0, 24)).filter(Boolean).slice(0, 30);
  const imgs = [...document.querySelectorAll('img')].slice(0, 8).map(i => ({ src: i.src.slice(0, 80), w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height) }));
  // 找消息行：常见聊天容器 class 嗅探
  const classHits = {};
  for (const el of document.querySelectorAll('[class]')) {
    const c = el.className.baseVal !== undefined ? '' : String(el.className);
    for (const k of ['msg', 'message', 'chat', 'bubble', 'avatar', 'dm', 'conv']) {
      if (new RegExp('(^|[^a-z])' + k, 'i').test(c)) classHits[k] = (classHits[k] || 0) + 1;
    }
  }
  return JSON.stringify({
    title: document.title,
    lang: document.documentElement.lang,
    bodyText: (document.body.innerText || '').slice(0, 400),
    buttons: btns, imgs, classHits,
    rootChildren: [...document.body.children].map(c => c.tagName + '.' + String(c.className).slice(0, 40)).slice(0, 10),
  }, null, 1);
})()`);
console.log(info);
await new Promise(r => setTimeout(r, 1000));
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
(await import('node:fs')).writeFileSync('C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/auraa-home.jpg', Buffer.from(shot.result.data, 'base64'));
console.log('shot saved');
process.exit(0);
