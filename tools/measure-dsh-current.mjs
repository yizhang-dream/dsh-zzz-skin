// 量线上 DSH 当前皮肤的代理人气泡实际渲染：底色、文字色、主题档位、头像
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async f => (await send('Runtime.evaluate', { expression: f, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Page.bringToFront');

const out = await ev(`(() => {
  const dark = document.body.hasAttribute('data-ds-dark-theme');
  const skin = document.documentElement.getAttribute('data-dsh-skin');
  const rows = [...document.querySelectorAll('.EvIC1a_flowItem[data-chat-anchor-key*=":assistant"]')].filter(r => !r.hidden && (r.textContent || '').trim()).slice(-2);
  const data = rows.map(row => {
    const s = getComputedStyle(row);
    const leaf = [...row.querySelectorAll('p, span, div')].filter(e => !e.children.length && (e.textContent || '').trim().length > 3)[0];
    return {
      bg: s.backgroundColor, radius: s.borderRadius, shadow: s.boxShadow.slice(0, 60),
      pad: s.padding, ml: s.marginLeft,
      textColor: leaf ? getComputedStyle(leaf).color : null,
      leafTag: leaf ? leaf.tagName + '.' + String(leaf.className).slice(0, 30) : null,
    };
  });
  // 己方气泡
  const ub = document.querySelector('.EvIC1a_flowItem[data-chat-anchor-key*=":input-message"] [class*="_bubble"]');
  const user = ub ? { bg: getComputedStyle(ub).backgroundColor, color: getComputedStyle(ub).color } : null;
  return JSON.stringify({ dark, skin, data, user }, null, 1);
})()`);
console.log(out);
process.exit(0);
