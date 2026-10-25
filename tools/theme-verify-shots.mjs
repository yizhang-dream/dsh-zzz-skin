import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = 9333;
const SHOTS = join(homedir(), 'Documents', 'projects', 'schedule-app', '.playwright-mcp');
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { error: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) };
  return r.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, name), Buffer.from(s.result.data, 'base64')); console.log('shot', name); };

await send('Page.enable');

const openSkinPage = async () => {
  if (await ev(`!!document.querySelector('[role=dialog]')`)) {
    // 已开：确保在皮肤页
    const onSkin = await ev(`(() => { const d = document.querySelector('[role=dialog]'); return !!d && /皮肤/.test((d.innerText || '').slice(0, 300)); })()`);
    if (!onSkin) {
      await ev(`(() => { const b = document.querySelector('button[aria-label="账号菜单"]'); if (b) b.click(); return 1; })()`);
      await sleep(900);
      await ev(`(() => { const leaves = [...document.querySelectorAll('[role=menu] *, button, span')].filter(e => e.children.length === 0 && e.textContent.trim() === '设置' && e.getBoundingClientRect().width > 0); (leaves[leaves.length - 1] || {}).click?.(); return leaves.length; })()`);
      await sleep(1500);
    }
  } else {
    await ev(`(() => { const b = document.querySelector('button[aria-label="账号菜单"]'); if (b) b.click(); return 1; })()`);
    await sleep(900);
    await ev(`(() => { const leaves = [...document.querySelectorAll('[role=menu] *, button, span')].filter(e => e.children.length === 0 && e.textContent.trim() === '设置' && e.getBoundingClientRect().width > 0); (leaves[leaves.length - 1] || {}).click?.(); return 1; })()`);
    await sleep(1500);
  }
  await ev(`(() => { const d = document.querySelector('[role=dialog]'); const leaves = [...d.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === '皮肤' && e.getBoundingClientRect().width > 0); const t = leaves[leaves.length - 1]?.closest('button, [role=tab]') || leaves[leaves.length - 1]; t?.click?.(); return 1; })()`);
  await sleep(2400);
  // 滚到皮肤卡列表
  await ev(`(() => { const d = document.querySelector('[role=dialog]'); const sc = [...d.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 100 && e.clientHeight > 300); if (sc) sc.scrollTop = sc.scrollHeight; return 1; })()`);
  await sleep(900);
};

const clickCard = async keyword => ev(`(() => {
  const d = document.querySelector('[role=dialog]');
  const hits = [...d.querySelectorAll('*')].filter(e => e.children.length === 0 && /${keyword}/.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0);
  if (!hits.length) return 'MISS ' + '${keyword}';
  const t = hits[hits.length - 1].closest('button, [role=button], label') || hits[hits.length - 1];
  t.click();
  return 'ok:' + t.tagName;
})()`);

for (const kw of ['外环落日', '空洞威胁', '1.3 虚拟杀机', '六分街', '迎新', '新艾利都']) {
  await openSkinPage();
  console.log(kw, await clickCard(kw));
  await sleep(3800);
  await shot(`skin-${kw.replace(/\s+/g, '')}.png`);
}
ws.close();
