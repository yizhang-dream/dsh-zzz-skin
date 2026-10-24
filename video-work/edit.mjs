#!/usr/bin/env node
// 皮肤演示视频剪辑：片头 → 字幕演示 → 片尾 → BGM 合流。
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

mkdirSync('caps', { recursive: true });
const cap = (name, text) => { writeFileSync(`caps/${name}.txt`, text); return `caps/${name}.txt`; };

const YH = "'C\\:/Windows/Fonts/msyh.ttc'";
const YHB = "'C\\:/Windows/Fonts/msyhbd.ttc'";

const run = (args) => {
  console.log('ffmpeg', args.join(' ').slice(0, 130), '...');
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
};

// ── 1. 片头（4s，keyart 暗底 + 标题）──
run(['-loop', '1', '-t', '4', '-i', '../preview/dark.jpg', '-vf', [
  'scale=1920:1080',
  'boxblur=5:2,eq=brightness=-0.06:saturation=1.05',
  `drawtext=fontfile=${YHB}:textfile='caps/t1.txt':fontsize=170:fontcolor='#FFD84D':x=(w-text_w)/2:y=310:shadowx=8:shadowy=8:shadowcolor=black@0.95`,
  `drawtext=fontfile=${YH}:textfile='caps/t2.txt':fontsize=46:fontcolor=white:x=(w-text_w)/2:y=560:shadowx=3:shadowy=3:shadowcolor=black@0.85`,
  `drawtext=fontfile=${YH}:textfile='caps/t3.txt':fontsize=36:fontcolor=white@0.88:x=(w-text_w)/2:y=650:shadowx=2:shadowy=2:shadowcolor=black@0.85`,
  'fade=t=in:st=0:d=0.5,fade=t=out:st=3.4:d=0.6,format=yuv420p',
].join(','), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', '30', 'title.mp4']);

// ── 2. 演示字幕 ──
const caps = [
  [1.2, 3.8, '空会话首屏 · PRESS ANY KEY'],
  [4.6, 7.0, '输入即所见 · 漫画硬影语言'],
  [8.2, 11.8, '流式态 · HDD 侦测警报 + 邦布 loading'],
  [14.3, 16.8, '回复完成 · S 评级弹卡'],
  [17.5, 19.1, '菜单项 · 对话选项斜切框'],
  [19.6, 21.7, '设置弹窗 · 调查报告 + CONFIDENTIAL 章'],
  [22.3, 25.0, '皮肤中心 · 滑杆调校'],
  [26.9, 29.3, '亮色档 · 白纸漫画'],
  [30.6, 34.0, '明暗双档独立设计 · reduced-motion 全停'],
];
const dt = caps.map(([a, b, text], i) => {
  const tf = `'${cap(`c${i}`, text)}'`;
  return `drawtext=fontfile=${YH}:textfile=${tf}:fontsize=40:fontcolor='#FFD84D':box=1:boxcolor=black@0.78:boxborderw=16:x=(w-text_w)/2:y=42:enable='between(t,${a},${b})'`;
}).join(',');
run(['-i', 'demo-final.mp4', '-vf', `${dt},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', 'demo-caps.mp4']);

// ── 3. 片尾（6s）──
run(['-loop', '1', '-t', '6', '-i', '../preview/light.jpg', '-vf', [
  'scale=1920:1080',
  'boxblur=8:2,eq=brightness=-0.22:saturation=0.85',
  `drawtext=fontfile=${YHB}:textfile='caps/e1.txt':fontsize=76:fontcolor='#FFD84D':x=(w-text_w)/2:y=330:shadowx=5:shadowy=5:shadowcolor=black@0.9`,
  `drawtext=fontfile=${YH}:textfile='caps/e2.txt':fontsize=44:fontcolor=white:x=(w-text_w)/2:y=490:shadowx=3:shadowy=3:shadowcolor=black@0.85`,
  `drawtext=fontfile=${YH}:textfile='caps/e3.txt':fontsize=30:fontcolor=white@0.75:x=(w-text_w)/2:y=580:shadowx=2:shadowy=2:shadowcolor=black@0.8`,
  `drawtext=fontfile=${YH}:textfile='caps/e4.txt':fontsize=28:fontcolor=white@0.6:x=(w-text_w)/2:y=648:shadowx=2:shadowy=2:shadowcolor=black@0.8`,
  'fade=t=in:st=0:d=0.5,fade=t=out:st=5.2:d=0.8,format=yuv420p',
].join(','), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', '30', 'endcard.mp4']);

// ── 4. 拼接 + BGM ──
writeFileSync('concat.txt', ["file 'title.mp4'", "file 'demo-caps.mp4'", "file 'endcard.mp4'"].join('\n') + '\n');
run(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-i', 'bgm-Electrodoodle.mp3',
  '-filter_complex', "[1:a]atrim=0:44.2,volume=0.22,afade=t=in:st=0:d=1.2,afade=t=out:st=41.7:d=2.5[a]",
  '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', 'zenless-skin-demo.mp4']);

console.log('DONE');
