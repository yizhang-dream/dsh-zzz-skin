#!/usr/bin/env node
// 从 zenless.tools 聊天生成器抓取代理人头像库（2026-10-31）。
// 数据源：refs/avatars-catalog.json（页面 DOM 提取的三组清单）。
//   聊天图标  IconMessageRoleCircle*  游戏内敲敲聊天的角色圆标
//   头像      IconInterKnotRole*      绳网个人资料头像（玩家可换的那套）
//   角色      IconRoleCircle*         角色半身圆图（一人多表情）
// 用法：node tools/scrape-avatars.mjs   # 已存在的文件跳过，幂等
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATALOG = path.join(ROOT, 'refs/avatars-catalog.json');
const OUT_DIR = path.join(ROOT, 'assets/avatars');
const BASE = 'https://zenless.tools';
const GROUP_DIR = { 聊天图标: 'chat-icons', 头像: 'avatars', 角色: 'portraits' };

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const manifest = [];
let ok = 0, skip = 0, fail = 0;

for (const [group, items] of Object.entries(catalog)) {
  const dir = path.join(OUT_DIR, GROUP_DIR[group]);
  fs.mkdirSync(dir, { recursive: true });
  for (const item of items) {
    const file = path.basename(item.src);
    const dest = path.join(dir, file);
    manifest.push({ group, dir: GROUP_DIR[group], name: item.name, file, src: item.src });
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { skip++; continue; }
    try {
      const buf = execFileSync('curl', ['-sS', '--fail', `${BASE}${item.src}`], { maxBuffer: 10 << 20 });
      if (!(buf.slice(0, 4).equals(Buffer.from('RIFF')) || buf.slice(0, 4).equals(Buffer.from([0x30, 0x26, 0xb2, 0x75])))) {
        throw new Error(`not webp (${buf.length}B)`);
      }
      fs.writeFileSync(dest, buf);
      ok++;
    } catch (e) {
      fail++;
      console.error(`FAIL ${item.src}: ${e.message}`);
    }
  }
}

fs.writeFileSync(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(manifest, null, 1));
const size = fs.readdirSync(OUT_DIR, { recursive: true })
  .filter((f) => String(f).endsWith('.webp'))
  .reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, String(f))).size, 0);
console.log(`downloaded=${ok} skipped=${skip} failed=${fail} total=${manifest.length} size=${(size / 1048576).toFixed(2)}MB`);
