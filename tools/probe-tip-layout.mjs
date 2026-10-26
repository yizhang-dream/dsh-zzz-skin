const PORT = 9333;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, clickCount: 0 });

await send('Page.enable');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(700);

const msg = await ev(`(() => {
  const m = [...document.querySelectorAll('[data-chat-anchor-key*=":input-message"]')].pop();
  m.scrollIntoView({ block: 'center' });
  const r = m.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()`);
await move(msg.x, msg.y); await sleep(800);

const measure = `(() => {
  const t = document.querySelector('[role=tooltip]');
  const users = [...document.querySelectorAll('[data-chat-anchor-key*=":input-message"]')];
  const m = users[users.length - 1];
  const item = m.closest('[class*="flowItem"]') || m.parentElement.parentElement;
  const row = item.querySelector('[class*="xzv4MW_actions"]');
  const rr = row.getBoundingClientRect();
  const out = { rowH: Math.round(rr.height), rowW: Math.round(rr.width), rowY: Math.round(rr.y), itemY: Math.round(item.getBoundingClientRect().y) };
  if (t) {
    const tr = t.getBoundingClientRect();
    const cs = getComputedStyle(t);
    out.tip = { cls: String(t.className).slice(0, 50), pos: cs.position, display: cs.display, offsetLeft: t.offsetLeft, offsetTop: t.offsetTop, rect: [Math.round(tr.x), Math.round(tr.y), Math.round(tr.width), Math.round(tr.height)], h: cs.height, lh: cs.lineHeight, fw: cs.fontWeight, border: cs.borderWidth };
  } else out.tip = null;
  return out;
})()`;

console.log('with tooltip:', JSON.stringify(await ev(measure), null, 1));

// 移开鼠标再量（tooltip 消失）
await move(300, 200); await sleep(500);
console.log('without tooltip:', JSON.stringify(await ev(measure), null, 1));

// 回到按钮，读 tooltip 的宿主规则
await move(msg.x, msg.y); await sleep(800);
const t2 = await ev(`(() => { const t = document.querySelector('[role=tooltip]'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
if (t2) {
  await send('DOM.enable'); await send('CSS.enable');
  const doc = await send('DOM.getDocument', { depth: -1 });
  const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '[role=tooltip]' });
  const ms = await send('CSS.getMatchedStylesForNode', { nodeId: q.result.nodeId });
  const rules = [];
  for (const m of (ms.result.matchedCSSRules || [])) {
    const keep = (m.rule.style?.cssProperties || []).filter(p => ['position','left','top','right','bottom','display','margin','height','line-height','vertical-align'].includes(p.name) && p.value);
    if (keep.length) rules.push({ sel: m.rule.selectorList.text.slice(0, 90), decl: keep.map(p => p.name + ':' + p.value).join('; ') });
  }
  console.log('tooltip matched position rules:', JSON.stringify(rules, null, 1));
}
ws.close();
