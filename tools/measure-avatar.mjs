// 实测参考站 chat-generator 的头像/气泡几何 + 我们 DSH 当前的几何
const PORT = 9334;
const b1 = { webSocketDebuggerUrl: (await (await fetch("http://127.0.0.1:9334/json/list")).json()).find(x => x.url.includes("zenless.tools")).webSocketDebuggerUrl };
await new Promise(r => setTimeout(r, 9000));
const ws = new WebSocket(b1.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;

// 参考站：先加一条左右消息（如果按钮在），然后量
console.log('site:', await ev(`location.href`));
console.log(await ev(`(async () => {
  // 尝试各加一条左右消息，让结构出现
  const btns = [...document.querySelectorAll('button')];
  const addL = btns.find(b => /添加到左侧/.test(b.textContent || ''));
  const addR = btns.find(b => /添加到右侧/.test(b.textContent || ''));
  addL?.click(); addR?.click();
  await new Promise(r => setTimeout(r, 1200));
  // 找聊天条目：含 img(头像) 的行
  const cands = [...document.querySelectorAll('img')].filter(i => /chat_icons|player_agent|IconMessage|IconRole/i.test(i.src)).slice(0, 4);
  if (!cands.length) return 'no avatar imgs; imgs=' + document.querySelectorAll('img').length;
  const out = [];
  for (const img of cands.slice(0, 2)) {
    const ar = img.getBoundingClientRect();
    // 相邻的文本容器：向上找 wrapper
    let wrap = img.parentElement;
    for (let i = 0; i < 4 && wrap; i++) {
      const sib = [...wrap.children].find(c => c !== img.parentElement && c.textContent && c.textContent.trim());
      if (sib) {
        const sr = sib.getBoundingClientRect();
        out.push({ avatar: [Math.round(ar.x), Math.round(ar.y), Math.round(ar.width)], bubble: [Math.round(sr.x), Math.round(sr.y), Math.round(sr.width), Math.round(sr.height)], gap: Math.round(sr.x - (ar.x + ar.width)), wrapCls: String(wrap.className).slice(0, 30), bubbleCls: String(sib.className).slice(0, 40) });
        break;
      }
      wrap = wrap.parentElement;
    }
  }
  const st = getComputedStyle(cands[0]);
  return JSON.stringify({ items: out, avatarStyle: { w: st.width, h: st.height, radius: st.borderRadius, obj: st.objectFit } }, null, 1);
})()`));
ws.close();
// 我们这边：量 DSH 会话页的头像伪元素 vs 气泡
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools')).find(t => t.url.includes('100.112.92.62'));
const ws2 = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws2.onopen = r);
id = 0; pending.clear();
ws2.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send2 = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws2.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev2 = async f => (await send2('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send2('Page.enable'); await send2('Page.bringToFront');
console.log('dsh:', await ev2(`(() => {
  const rows = [...document.querySelectorAll('.EvIC1a_flowItem[data-chat-anchor-key*=":assistant"]')].filter(r => { const k = r.getAttribute('data-chat-anchor-key')||''; return !k.includes('[') && !r.hidden && (r.textContent||'').trim(); });
  const row = rows[rows.length-1];
  if (!row) return 'no-row';
  const rr = row.getBoundingClientRect();
  const pb = getComputedStyle(row, '::before');
  return JSON.stringify({
    row: [Math.round(rr.x), Math.round(rr.y), Math.round(rr.width), Math.round(rr.height)],
    pseudoBefore: { left: pb.left, top: pb.top, w: pb.width, h: pb.height, bg: pb.backgroundImage.slice(0, 40) },
    rowPadding: getComputedStyle(row).padding,
  });
})()`));
process.exit(0);
