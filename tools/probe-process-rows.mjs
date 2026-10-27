#!/usr/bin/env node
// 过程行（思考 / 工具）对比度探针：同一连接内 展开组 → 截屏 → 注入候选样式 → 再截屏。
// 用法：node tools/probe-process-rows.mjs <tag> [cssFile]
//   输出 .playwright-mcp/rows-<tag>-before.png / -after.png + JSON（行矩形与计算样式）
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.CDP_PORT || 9333;
const SHOTS = join(homedir(), 'Documents', 'projects', 'schedule-app', '.playwright-mcp');
const tag = process.argv[2] || 'probe';
const cssFile = process.argv[3];

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter(t => t.type === 'page' && !t.url.startsWith('devtools')).find(t => t.url.includes('100.112.92.62'));
if (!page) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaljs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.exceptionDetails ? { error: String(r.result.exceptionDetails.exception?.description) } : r.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable');
await evaljs(`['loud','loud2','cvfix','probe16d','probe-css','t'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove()});true`);
// MODE=light 时把宿主切到亮档（皮肤与宿主都按 body[data-ds-dark-theme] 分流）
if ((process.env.MODE || 'dark') === 'light') await evaljs(`document.body.removeAttribute('data-ds-dark-theme');true`);
else await evaljs(`document.body.setAttribute('data-ds-dark-theme','');true`);
await sleep(400);

// 展开过程组并居中
// 注意：宿主的步骤行有多层收起——过程组 O_Ebla_root(hidden="until-found")、
// 以及每个步骤所在的 EvIC1a_flowItem 都可能带 hidden + content-visibility:hidden。
// 收起时行元素仍有布局盒（尺寸看起来正常）但不上屏，量到的会是不渲染的幽灵盒。
const geo = await evaljs(`(function(){
  const head=[...document.querySelectorAll('[class*="O_Ebla_title"]')][0];
  if(!head) return {error:'no group header'};
  const root=head.closest('[class*="O_Ebla_root"]');
  let e=head, unhid=0;
  while(e && !e.matches('[data-dsh-surface="conversation"]')){
    if(e.hasAttribute('hidden')){ e.removeAttribute('hidden'); unhid++; }
    if(getComputedStyle(e).contentVisibility!=='visible') e.style.setProperty('content-visibility','visible','important');
    e=e.parentElement;
  }
  root.querySelectorAll('[hidden]').forEach(el=>{ el.removeAttribute('hidden'); unhid++; });
  root.querySelectorAll('*').forEach(el=>{ if(getComputedStyle(el).contentVisibility!=='visible') el.style.setProperty('content-visibility','visible','important'); });
  root.scrollIntoView({block:'center'});
  return {ok:true, unhid};
})()`);
await sleep(1200);

const collect = async () => evaljs(`(function(){
  const conv=document.querySelector('[data-dsh-surface="conversation"]');
  const head=conv.querySelector('[class*="O_Ebla_title"]');
  const root=head?head.closest('[class*="O_Ebla_root"]'):null;
  const rows=[...conv.querySelectorAll('[class*="lcKema_row"],[data-tool]')].map(r=>{
    const b=r.getBoundingClientRect(); const c=getComputedStyle(r);
    return {kind:r.hasAttribute('data-tool')?'tool':'think', cls:r.className.toString().slice(0,44),
      x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),
      color:c.color,bg:c.backgroundColor};
  });
  const hb=head?head.getBoundingClientRect():null;
  const rb=root?root.getBoundingClientRect():null;
  return {dpr:devicePixelRatio, group: rb?{x:Math.round(rb.x),y:Math.round(rb.y),w:Math.round(rb.width),h:Math.round(rb.height)}:null,
    header: hb?{x:Math.round(hb.x),y:Math.round(hb.y),w:Math.round(hb.width),h:Math.round(hb.height),bg:getComputedStyle(head).backgroundColor,color:getComputedStyle(head).color}:null,
    rows};
})()`);

const clipShot = async (name) => {
  // 用整视口截图（clip 参数与页面 DPR 的组合容易算错，整屏 + DPR 映射最稳）
  const m = await send('Page.captureScreenshot', { format: 'png' });
  const out = join(SHOTS, `rows-${tag}-${name}.png`);
  writeFileSync(out, Buffer.from(m.result.data, 'base64'));
  return out;
};

const before = { geo: await collect(), shot: await clipShot('before') };

let after = null;
if (cssFile) {
  const css = (await import('node:fs')).readFileSync(cssFile, 'utf8');
  await evaljs(`(function(){const s=document.getElementById('probe-css')||document.createElement('style');s.id='probe-css';s.textContent=${JSON.stringify(css)};document.head.appendChild(s);return true})()`);
  await sleep(600);
  after = { geo: await collect(), shot: await clipShot('after') };
  await evaljs(`(function(){const s=document.getElementById('probe-css');if(s)s.remove();return true})()`);
}

console.log(JSON.stringify({ before, after }, null, 1));
ws.close(); process.exit(0);
