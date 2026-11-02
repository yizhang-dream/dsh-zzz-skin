// 在 zzz-chat.auraa.moe 发双侧消息并实测：头像尺寸/位置、气泡几何、配色、字体
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

// React 受控输入：native setter + input 事件，再点 Send
const post = await ev(`(() => {
  const inp = document.querySelector('textarea, input[type=text]');
  if (!inp) return 'no-input';
  const proto = inp.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(inp, '这是右侧用户的测试消息 hello right');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  const sendBtn = [...document.querySelectorAll('button')].find(b => /^Send$/.test((b.textContent || '').trim()));
  if (!sendBtn) return 'no-send';
  sendBtn.click();
  return 'ok-right';
})()`);
await new Promise(r => setTimeout(r, 400));
const sw = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Switch$/.test((x.textContent||'').trim())); if (b) { b.click(); return 'ok'; } return 'nf'; })()`);
await new Promise(r => setTimeout(r, 300));
const post2 = await ev(`(() => {
  const inp = document.querySelector('textarea, input[type=text]');
  const proto = inp.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(inp, '这是左侧代理人的测试消息 hello left');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  [...document.querySelectorAll('button')].find(b => /^Send$/.test((b.textContent || '').trim())).click();
  return 'ok-left';
})()`);
await new Promise(r => setTimeout(r, 600));
console.log('send:', post, sw, post2);

// 量几何：每条消息行里找头像 img 和气泡节点
const geo = await ev(`(() => {
  // 找消息容器：包含我们刚发的文本的最近共同祖先
  const hit = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /测试消息/.test(e.textContent || ''));
  if (!hit.length) return 'no-message-found';
  const rows = [...new Set(hit.map(e => e.closest('[class*=message], [class*=msg], li, [data-side]')))].filter(Boolean);
  const out = [];
  for (const row of (rows.length ? rows : hit.map(e => e.parentElement))) {
    const rr = row.getBoundingClientRect();
    const av = row.querySelector('img');
    // 气泡 = 发文本的那个叶子节点的可滚父层（带底色的）
    let leaf = row.querySelector('*') ;
    const bubbleNode = hit.find(h => row.contains(h));
    const br = bubbleNode ? bubbleNode.getBoundingClientRect() : null;
    let bubbleBg = null, bubbleColor = null, bubbleFont = null, radius = null, pad = null, border = null, shadow = null;
    if (bubbleNode) {
      // 从叶子往上找第一个有背景色的祖先是气泡
      let n = bubbleNode;
      while (n && n !== row.parentElement) {
        const s = getComputedStyle(n);
        if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.borderRadius !== '0px') {
          bubbleBg = s.backgroundColor; bubbleColor = s.color; bubbleFont = s.fontFamily.slice(0, 120);
          radius = s.borderRadius; pad = s.padding; border = s.border; shadow = s.boxShadow.slice(0, 80);
          break;
        }
        n = n.parentElement;
      }
    }
    out.push({
      rowClass: String(row.className).slice(0, 60),
      row: { x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.width), h: Math.round(rr.height) },
      avatar: av ? (() => { const a = av.getBoundingClientRect(); return { src: av.src.split('/').pop(), x: Math.round(a.x), y: Math.round(a.y), w: +a.width.toFixed(1), h: +a.height.toFixed(1), rounded: getComputedStyle(av).borderRadius }; })() : null,
      bubble: br ? { x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width), h: Math.round(br.height) } : null,
      style: bubbleBg ? { bg: bubbleBg, color: bubbleColor, radius, pad, border: border?.slice(0, 80), shadow, font: bubbleFont } : null,
    });
  }
  // 页面底色与主字体
  const bs = getComputedStyle(document.body);
  const env = { bodyBg: bs.backgroundColor, bodyColor: bs.color, bodyFont: bs.fontFamily.slice(0, 140), htmlBg: getComputedStyle(document.documentElement).backgroundColor };
  return JSON.stringify({ env, rows: out }, null, 1);
})()`);
console.log(geo);

// 头像-气泡关系推算放 Node 侧：先补一行原始数据
const rel = await ev(`(() => {
  const hit = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /测试消息/.test(e.textContent || ''));
  return JSON.stringify(hit.map(h => { const r = h.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), text: (h.textContent||'').slice(0,12) }; }));
})()`);
console.log('leaves:', rel);
await shot('auraa-chat');
process.exit(0);
