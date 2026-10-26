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
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable');
await ev(`(() => { const b = document.querySelector('button[aria-label="账号菜单"]'); if (b) b.click(); return 1; })()`);
await sleep(1000);
await ev(`(() => { const leaves = [...document.querySelectorAll('[role=menu] *, button, span')].filter(e => e.children.length === 0 && e.textContent.trim() === '设置' && e.getBoundingClientRect().width > 0); (leaves[leaves.length - 1] || {}).click?.(); return 1; })()`);
await sleep(1600);
await ev(`(() => { const d = document.querySelector('[role=dialog]'); const leaves = [...d.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === '皮肤' && e.getBoundingClientRect().width > 0); const t = leaves[leaves.length - 1]?.closest('button, [role=tab]') || leaves[leaves.length - 1]; t?.click?.(); return 1; })()`);
await sleep(2600);
await ev(`(() => { const d = document.querySelector('[role=dialog]'); const sc = [...d.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 100 && e.clientHeight > 300); if (sc) sc.scrollTop = sc.scrollHeight; return 1; })()`);
await sleep(1800);
const s = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(SHOTS, 'preview-cards2.png'), Buffer.from(s.result.data, 'base64'));
console.log('shot preview-cards2.png');
ws.close();
