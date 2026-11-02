// v9.3.2 资产+CSS 链路端到端：换肤后 CSSOM 仍满、视频真的在播、头像真的载入
const PORT = 9334;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools')).find((t) => t.url.includes('100.112.92.62'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (f) => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Page.bringToFront');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 12000));

const state = `(() => {
  const v = document.querySelector('[data-dsh-skin-layer=background] video');
  let rules = 0; for (const s of document.styleSheets) if (s.href && s.href.includes('eridu-skins')) { try { rules += s.cssRules.length; } catch {} }
  return JSON.stringify({
    attr: document.documentElement.getAttribute('data-dsh-skin'),
    accent: getComputedStyle(document.body).getPropertyValue('--zzz-accent').trim() || '(空)',
    cssRules: rules,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    video: v ? { src: (v.currentSrc || '').split('/').slice(-2).join('/'), rs: v.readyState, w: v.videoWidth, paused: v.paused } : null,
  });
})()`;
console.log('boot:', await ev(state));

const switchTo = async (sk) => await ev(`(async () => {
  document.getElementById('eridu-entry')?.click();
  await new Promise(r => setTimeout(r, 500));
  const card = [...document.querySelectorAll('.ecard')].find(c => c.dataset.id === '${sk}');
  card.click(); await new Promise(r => setTimeout(r, 2500));
  document.getElementById('eridu-close')?.click(); document.querySelector('#eridu-ov')?.click();
  await new Promise(r => setTimeout(r, 300));
  return ${state};
})()`);
console.log('switch→base   :', await switchTo('zzz-zenless'));
console.log('switch→eridu01:', await switchTo('zzz-eridu-01'));

// 头像 URL（带 ?v=）真实载入
console.log('avatarFetch:', await ev(`fetch('/api/eridu-skins/skin/zzz-eridu-01/assets/avatar-agent.webp?v=1', {cache:'reload'}).then(r=>r.status+' '+r.headers.get('content-type'))`));

await new Promise((r) => setTimeout(r, 1200));
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
const fs = await import('node:fs');
fs.writeFileSync('C:/Users/zyz/.zcode/dsh-zzz-skin/Temp/verify-assets-final.jpg', Buffer.from(shot.result.data, 'base64'));
console.log('screenshot: Temp/verify-assets-final.jpg');
process.exit(0);
