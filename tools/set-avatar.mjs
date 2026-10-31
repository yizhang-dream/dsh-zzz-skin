#!/usr/bin/env node
// 代理人头像选择器（2026-10-31）——素材库 assets/avatars/（zenless.tools 抓取，
// 见 tools/scrape-avatars.mjs），换的是 §14 AI 消息头像槽：
//   assets/avatar-agent.webp 盖在 avatar-fatfish-128.png 上，缺文件=回落大肥鱼。
//
// 用法：
//   node tools/set-avatar.mjs                 # 起本地挑选页（127.0.0.1，点击即应用+部署）
//   node tools/set-avatar.mjs --list          # 列出全部头像
//   node tools/set-avatar.mjs 艾莲            # 按名字直选（重名时提示加 --group）
//   node tools/set-avatar.mjs 艾莲 --group 角色
//   node tools/set-avatar.mjs --fatfish       # 换回大肥鱼（默认）
//
// 应用 = 拷图到 assets/avatar-agent.webp + 改 patches.css §14 圆角（圆=50%/方=15px）
//        + scp 到 lab-ts 全部 zzz-* 皮肤目录 + 记录 assets/avatars/active.json。
// DSH 端看效果需硬刷新（Ctrl+Shift+R）或设置→皮肤→重新应用（CSS/资产启发式缓存）。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PATCHES = path.join(ROOT, 'patches.css');
const AV_DIR = path.join(ROOT, 'assets/avatars');
const CATALOG = path.join(AV_DIR, 'catalog.json');
const ACTIVE = path.join(AV_DIR, 'active.json');
const AGENT_FILE = path.join(ROOT, 'assets/avatar-agent.webp');
const PORT = Number(process.env.PORT || 4177);
const GROUP_LABEL = { 'chat-icons': '聊天图标', avatars: '头像', portraits: '角色' };

const readCatalog = () => JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

function findEntries(name, group) {
  const cat = readCatalog();
  const q = name.trim();
  let hits = cat.filter((e) => e.name === q);
  if (!hits.length) hits = cat.filter((e) => e.name.includes(q));
  if (group) hits = hits.filter((e) => GROUP_LABEL[e.dir] === group || e.dir === group);
  return hits;
}

function setShape(radius) {
  let css = fs.readFileSync(PATCHES, 'utf8');
  const re = /border-radius: [\d.]+(?:px|%); \/\* avatar-shape \*\//;
  if (!re.test(css)) throw new Error('patches.css 里找不到 avatar-shape 标记行');
  css = css.replace(re, `border-radius: ${radius}; /* avatar-shape */`);
  fs.writeFileSync(PATCHES, css);
}

function deploy(files) {
  // files: { 'patches.css': absPath, 'assets/avatar-agent.webp': absPath }（可含 null=远端删除）
  const tmp = 'zzz-avatar-deploy';
  execFileSync('ssh', ['lab-ts', `rm -rf /tmp/${tmp} && mkdir -p /tmp/${tmp}/assets`], { stdio: 'pipe' });
  for (const [rel, abs] of Object.entries(files)) {
    if (abs) execFileSync('scp', ['-q', abs, `lab-ts:/tmp/${tmp}/${rel}`]);
  }
  const rmAgent = files['assets/avatar-agent.webp'] === null ? 'rm -f $d/assets/avatar-agent.webp; ' : '';
  const cpPatches = files['patches.css'] ? 'cp /tmp/zzz-avatar-deploy/patches.css $d/; ' : '';
  const cpAgent = files['assets/avatar-agent.webp'] ? 'cp /tmp/zzz-avatar-deploy/assets/avatar-agent.webp $d/assets/; ' : '';
  const out = execFileSync('ssh', ['lab-ts',
    `for d in ~/.dsh/skins/zzz-*; do ${rmAgent}${cpPatches}${cpAgent}done; ls ~/.dsh/skins/ | grep -c zzz-`],
    { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  return out;
}

function apply(entry) {
  // entry = { name, dir, file } 或 null（=大肥鱼）
  if (entry) {
    const src = path.join(AV_DIR, entry.dir, entry.file);
    fs.copyFileSync(src, AGENT_FILE);
    setShape('50%');
  } else {
    fs.rmSync(AGENT_FILE, { force: true });
    setShape('15px');
  }
  const dirs = deploy({
    'patches.css': PATCHES,
    'assets/avatar-agent.webp': entry ? AGENT_FILE : null,
  });
  fs.writeFileSync(ACTIVE, JSON.stringify({ ...entry, appliedAt: new Date().toISOString() }, null, 1));
  return { entry, skins: dirs };
}

/* ── CLI ─────────────────────────────────────────────── */
const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  const cat = readCatalog();
  for (const dir of ['avatars', 'chat-icons', 'portraits']) {
    console.log(`\n[${GROUP_LABEL[dir]}]`);
    cat.filter((e) => e.dir === dir).forEach((e) => console.log(`  ${e.name}\t${e.file}`));
  }
  process.exit(0);
}
const fatfish = argv.includes('--fatfish');
const gi = argv.indexOf('--group');
const nameArg = argv.find((a, i) => !a.startsWith('--') && !(gi >= 0 && i === gi + 1));
const groupArg = gi >= 0 ? argv[gi + 1] : null;
if (fatfish || nameArg) {
  if (fatfish) {
    const r = apply(null);
    console.log(`已换回大肥鱼（圆角方），部署到 ${r.skins} 个皮肤目录`);
  } else {
    const hits = findEntries(nameArg, groupArg);
    if (!hits.length) { console.error(`没有叫「${nameArg}」的头像，--list 看全部`); process.exit(1); }
    if (hits.length > 1) {
      console.error(`「${nameArg}」有 ${hits.length} 个：`);
      hits.forEach((h) => console.error(`  ${h.name}\t${GROUP_LABEL[h.dir]}\t${h.file}`));
      console.error('加 --group 头像|聊天图标|角色 消歧');
      process.exit(1);
    }
    const r = apply(hits[0]);
    console.log(`已应用「${r.entry.name}」（${GROUP_LABEL[r.entry.dir]}），部署到 ${r.skins} 个皮肤目录`);
  }
  console.log('DSH 里 Ctrl+Shift+R 硬刷新可见');
  process.exit(0);
}

/* ── 挑选页服务器 ─────────────────────────────────────── */
const html = (cat, active) => `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>新艾利都 · 代理人头像</title>
<style>
:root{--ac:#cdf348;--ink:#14141a;--bg:#0b0c14;--panel:#14151f;--line:#2a2c3c}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 "Segoe UI",system-ui,"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Source Han Sans SC",sans-serif;background:var(--bg);color:#e8e9f0}
header{position:sticky;top:0;z-index:5;background:linear-gradient(var(--bg),var(--bg) 80%,transparent);padding:18px 22px 12px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
h1{font-size:17px;margin:0;letter-spacing:.06em}h1 b{color:var(--ac)}
input{background:var(--panel);border:1px solid var(--line);color:#e8e9f0;border-radius:8px;padding:7px 12px;width:200px;outline:none}
input:focus{border-color:var(--ac)}
nav{display:flex;gap:6px}
nav button{background:transparent;border:1px solid var(--line);color:#a9abbd;border-radius:999px;padding:5px 14px;cursor:pointer}
nav button.on{background:var(--ac);border-color:var(--ac);color:var(--ink);font-weight:700}
#status{margin-left:auto;font-size:12px;color:#a9abbd}
main{padding:6px 22px 30px}
h2{font-size:13px;color:#a9abbd;letter-spacing:.2em;margin:18px 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:12px}
.cell{cursor:pointer;text-align:center;padding:8px 4px;border-radius:12px;border:1.5px solid transparent}
.cell img{width:64px;height:64px;display:block;margin:0 auto 6px;filter:drop-shadow(0 2px 6px #000a)}
.cell span{font-size:12px;color:#c7c9da;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cell:hover{border-color:var(--line);background:var(--panel)}
.cell.sel{border-color:var(--ac);background:var(--panel)}
.cell.sel span{color:var(--ac);font-weight:700}
.cell.cur::after{content:"使用中";display:block;font-size:10px;color:var(--ac);margin-top:2px}
footer{position:fixed;bottom:0;left:0;right:0;padding:12px 22px;background:linear-gradient(transparent,var(--bg) 40%);display:flex;gap:12px;align-items:center}
#pick{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 14px;display:none;align-items:center;gap:12px}
#pick img{width:44px;height:44px}
#pick b{color:var(--ac)}
#apply{background:var(--ac);color:var(--ink);border:none;border-radius:10px;padding:10px 26px;font-weight:800;font-size:15px;cursor:pointer;display:none;box-shadow:3px 3px 0 #0008}
#apply:disabled{opacity:.5;cursor:wait}
#toast{font-size:12px;color:var(--ac)}
</style></head><body>
<header><h1>新艾利都 · <b>代理人头像</b></h1>
<input id="q" placeholder="搜索名字…">
<nav id="tabs"></nav><span id="status"></span></header>
<main id="main"></main>
<footer><div id="pick"><img><div>已选 <b id="pname"></b><span id="pgroup" style="color:#a9abbd;font-size:12px"></span></div></div>
<button id="apply">应用并部署</button><span id="toast"></span></footer>
<script>
const CAT = ${JSON.stringify(cat)};
const ACTIVE = ${JSON.stringify(active || {})};
const GL = ${JSON.stringify(GROUP_LABEL)};
let tab = 'all', q = '', sel = null;
const tabs = [['all','全部'],['avatars','头像'],['chat-icons','聊天图标'],['portraits','角色'],['default','默认']];
const curKey = ACTIVE.dir ? ACTIVE.dir + '/' + ACTIVE.file : 'default';
function render() {
  const m = document.getElementById('main');
  const gs = tab === 'all'
    ? (q ? ['avatars', 'chat-icons', 'portraits'] : ['default', 'avatars', 'chat-icons', 'portraits'])
    : [tab];
  let h = '', total = 0;
  for (const g of gs) {
    const list = g === 'default'
      ? (q ? [] : [{ name: '大肥鱼（DeepSeek 人设）', dir: 'default', file: 'fatfish' }])
      : CAT.filter(e => e.dir === g && (!q || e.name.includes(q)));
    if (!list.length) continue;
    total += list.length;
    h += '<h2>' + (g === 'default' ? '默认' : GL[g]) + ' · ' + list.length + '</h2><div class="grid">';
    for (const e of list) {
      const key = e.dir + '/' + e.file;
      const src = e.dir === 'default' ? '/img/default.png' : '/img/' + key;
      h += '<div class="cell' + (sel === key ? ' sel' : '') + (curKey === key ? ' cur' : '') + '" data-key="' + key + '"><img loading="lazy" src="' + src + '"><span>' + e.name + '</span></div>';
    }
    h += '</div>';
  }
  m.innerHTML = h;
  m.querySelectorAll('.cell').forEach(c => c.onclick = () => pick(c.dataset.key));
  document.getElementById('status').textContent = total + ' 个' + (ACTIVE.name ? ' · 使用中：' + ACTIVE.name : ' · 使用中：大肥鱼');
}
function pick(key) {
  sel = key;
  const [dir, file] = key.split('/');
  const e = dir === 'default' ? { name: '大肥鱼', dir, file } : CAT.find(x => x.dir === dir && x.file === file);
  document.getElementById('pick').style.display = 'flex';
  document.getElementById('pname').textContent = e.name;
  document.getElementById('pgroup').textContent = dir === 'default' ? '默认' : GL[dir];
  document.querySelector('#pick img').src = dir === 'default' ? '/img/default.png' : '/img/' + key;
  document.getElementById('apply').style.display = 'block';
  render();
}
document.getElementById('q').oninput = ev => { q = ev.target.value.trim(); render(); };
document.getElementById('tabs').innerHTML = tabs.map(([k, l]) => '<button data-t="' + k + '">' + l + '</button>').join('');
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  tab = b.dataset.t; q = ''; document.getElementById('q').value = '';
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b)); render();
});
document.querySelector('#tabs button').classList.add('on');
document.getElementById('apply').onclick = async () => {
  const btn = document.getElementById('apply'); btn.disabled = true;
  document.getElementById('toast').textContent = '部署中…';
  try {
    const r = await fetch('/api/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: sel }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || '失败');
    document.getElementById('toast').textContent = '✓ 已应用到 ' + j.skins + ' 个皮肤目录 —— DSH 里 Ctrl+Shift+R 可见';
    setTimeout(() => location.reload(), 1600);
  } catch (e) {
    document.getElementById('toast').textContent = '✗ ' + e.message; btn.disabled = false;
  }
};
render();
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' ) {
    const active = fs.existsSync(ACTIVE) ? JSON.parse(fs.readFileSync(ACTIVE, 'utf8')) : null;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html(readCatalog(), active));
  } else if (url.pathname === '/api/apply' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { key } = JSON.parse(body);
        if (key === 'default/fatfish') {
          const r = apply(null);
          res.end(JSON.stringify({ ok: true, skins: r.skins }));
        } else {
          const [dir, file] = String(key).split('/');
          const entry = readCatalog().find((e) => e.dir === dir && e.file === file && !e.file.includes('..'));
          if (!entry) throw new Error('未知头像');
          const r = apply(entry);
          res.end(JSON.stringify({ ok: true, skins: r.skins, name: r.entry.name }));
        }
      } catch (e) {
        res.writeHead(500).end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  } else if (url.pathname === '/img/default.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(fs.readFileSync(path.join(ROOT, 'assets/avatar-fatfish-128.png')));
  } else if (url.pathname.startsWith('/img/')) {
    const rel = url.pathname.slice(5);
    if (rel.includes('..')) { res.writeHead(403).end(); return; }
    const abs = path.join(AV_DIR, rel);
    if (!fs.existsSync(abs)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': 'image/webp' });
    res.end(fs.readFileSync(abs));
  } else res.writeHead(404).end();
});
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`挑选页: ${url}  （Ctrl+C 退出）`);
  try { execFileSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' }); } catch { /* 手动打开 */ }
});
