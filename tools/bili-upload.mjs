#!/usr/bin/env node
// B站投稿驱动（真 Chrome CDP）：设文件 → 轮询上传与表单状态。
// 用法：node bili-upload.mjs setfile <abs-path>
//       node bili-upload.mjs status
//       node bili-upload.mjs eval "<js>"
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || 9333;
const [, , cmd, ...args] = process.argv;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('bilibili.com'));
if (!page) { console.error('no bilibili page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params })); });
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

if (cmd === 'eval') {
  console.log(JSON.stringify(await ev(args[0])));
} else if (cmd === 'setfile') {
  const doc = (await send('DOM.getDocument', { depth: 0 })).result;
  const node = (await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })).result;
  if (!node.nodeId) { console.error('file input not found'); process.exit(1); }
  await send('DOM.setFileInputFiles', { files: [args[0]], nodeId: node.nodeId });
  console.log('file set:', args[0]);
} else if (cmd === 'status') {
  const st = await ev(`(() => {
    const txt = document.body.innerText;
    const progress = [...document.querySelectorAll('[class*=progress]')].filter(e => e.getBoundingClientRect().width > 30).map(e => (e.textContent||'').trim().slice(0,50));
    const editForm = !!document.querySelector('textarea, [class*=edit]');
    const titleInput = document.querySelector('input[placeholder*=标题], [class*=title] input, .input-title');
    return {
      uploading: /上传中|正在上传/.test(txt),
      success: /上传完成|成功/.test(txt),
      fail: /失败|不支持/.test(txt),
      editForm,
      hasTitleInput: !!titleInput,
      progressBits: progress.slice(0, 3)
    };
  })()`);
  console.log(JSON.stringify(st));
}
ws.close();
setTimeout(() => process.exit(0), 200);
