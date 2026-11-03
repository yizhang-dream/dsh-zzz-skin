#!/usr/bin/env node
// 构建 zzz-console 皮肤卡（v9.4）：基座 patches.css/skin.css + §C 材质重铸尾部
// 用法：node tools/build-console.mjs [--deploy]   （--deploy = scp 到 lab-ts）
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build', 'zzz-console');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });

// patches.css = 基座全文 + §C 尾部（后置覆盖）
const base = readFileSync(join(ROOT, 'patches.css'), 'utf8');
const tail = readFileSync(join(ROOT, 'variants', 'console-tail.css'), 'utf8');
writeFileSync(join(OUT, 'patches.css'), base + '\n' + tail);

// skin.css = 基座全文 + console 色系 body 底
const skinBase = readFileSync(join(ROOT, 'skin.css'), 'utf8');
const skinTail = `
/* ═══ §C console colorway（v9.4）：石墨地 / 暖纸地 ═══ */
body { background-color: #14161d; }
body[data-ds-dark-theme] { background-color: #14161d; }
body:not([data-ds-dark-theme]) { background-color: #f5f3ec; }
`;
writeFileSync(join(OUT, 'skin.css'), skinBase + skinTail);

// skin.json：v2 manifest（contributes 是 loadCatalog 认的字段；无 backgroundMedia = 静石墨地）
writeFileSync(join(OUT, 'skin.json'), JSON.stringify({
  $schema: 'https://schemas.linxin666.org/dsh-skin/v2.json',
  skinManifestVersion: 2,
  id: 'zzz-console',
  name: 'ZZZ · 观测台',
  nameEn: 'ZZZ Console',
  author: 'flower-moon',
  tagline: 'Console 材质重铸 · 石墨三阶 × 发丝线面板 × 酸绿只留给信号 · 参考 impeccable/hallmark',
  description: '参考 pbakaus/impeccable 与 Nutlope/hallmark（Console 材质）重铸：石墨三阶地、发丝线面板、无辉光无纹理无斜切无硬影，标签去拉距转正体；保留 ZZZ 身份——酸绿信号、代理人头像、气泡旗标箭头、己方蓝胶囊。',
  tags: ['zenless', 'zzz', 'console', 'graphite', 'hairline', 'quiet', 'instrument', 'dark', 'light'],
  order: 20,
  version: '9.4.0',
  license: 'MIT',
  contributes: {
    stylesheet: 'skin.css',
    patches: 'patches.css',
    backgroundMedia: null,
  },
  preview: { light: 'assets/preview-light.jpg', dark: 'assets/preview-dark.jpg' },
}, null, 2) + '\n');

// 资产：头像 + 旗标箭头（§13/§14 引用）；preview 首跑后由实拍补
for (const f of ['avatar-agent.webp', 'bubble-arrow-left.webp', 'bubble-arrow-right.webp', 'bubble-arrow-right-blue.webp']) {
  try { copyFileSync(join(ROOT, 'assets', f), join(OUT, 'assets', f)); } catch { console.warn('missing', f); }
}

console.log('built', OUT);
if (process.argv.includes('--deploy')) {
  execSync(`ssh lab-ts "mkdir -p ~/.dsh/skins/zzz-console/assets"`, { stdio: 'inherit' });
  for (const f of ['patches.css', 'skin.css', 'skin.json']) {
    execSync(`scp "${join(OUT, f).replace(/\\/g, '/')}" lab-ts:~/.dsh/skins/zzz-console/${f}`, { stdio: 'inherit' });
  }
  execSync(`scp ${join(OUT, 'assets').replace(/\\/g, '/')}/* lab-ts:~/.dsh/skins/zzz-console/assets/`, { stdio: 'inherit' });
  console.log('deployed to lab-ts ~/.dsh/skins/zzz-console/');
}
