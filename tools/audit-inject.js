(() => {
  // 聚合全 DOM 计算样式；真实 Chrome 下 getComputedStyle 全量可靠（无头才丢属性）。
  const rgb = s => { const m = s.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
  const hex = c => Array.isArray(c) ? ('#' + [c[0], c[1], c[2]].map(v => Math.round(v).toString(16).padStart(2, '0')).join('') + (c[3] !== undefined && c[3] !== 1 ? `@${(+c[3]).toFixed(2)}` : '')) : String(c).slice(0, 24);
  const hslOf = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); switch (mx) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; } h *= 60; } return { h, s, l }; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  // 语言内色相：黄绿/金 48-68，红 <12 或 >348，青 178-205；深蓝紫画布族 218-255(s<.6,l<.3)；深底黑字 l<.12
  const leak = c => { if (!c || c[3] === 0) return false; const { h, s, l } = hslOf(c); if (s < .25 || l > .97 || l < .12) return false; if (h >= 48 && h <= 68) return false; if (h <= 12 || h >= 348) return false; if (h >= 178 && h <= 205) return false; if (h >= 218 && h <= 255 && s < .6 && l < .3) return false; return true; };
  const opaqueBg = el => { let e = el, acc = []; while (e && e !== document.documentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c[3] >= 1) return { c, stack: acc }; if (c && c[3] > 0) acc.push(c); e = e.parentElement; } const c = rgb(getComputedStyle(document.documentElement).backgroundColor) || rgb(getComputedStyle(document.body).backgroundColor); return { c, stack: acc }; };
  const blend = (top, under) => top.map((v, i) => i < 3 ? v * top[3] + under[i] * (1 - top[3]) : 1);
  const effBg = el => { const { c, stack } = opaqueBg(el); let cur = c || [12, 14, 35, 1]; for (const s of stack.slice().reverse()) cur = blend(s, cur); return cur; };
  const sel = el => { const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 1).join(''); return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (el.getAttribute('data-dsh-part') ? `[${el.getAttribute('data-dsh-part')}]` : ''); };
  const bucket = (map, key, el, extra) => { const k = key || '(none)'; if (!map[k]) map[k] = { n: 0, ex: [] }; map[k].n++; if (map[k].ex.length < 3 && !map[k].ex.includes(sel(el))) map[k].ex.push(sel(el)); if (extra) map[k][extra[0]] = extra[1]; };
  const R = { colors: {}, bg: {}, borders: {}, radii: {}, fonts: {}, anims: {}, weight: {}, leaks: [], contrast: [], n: 0 };
  for (const el of document.querySelectorAll('*')) {
    R.n++;
    const cs = getComputedStyle(el);
    for (const [prop, map] of [['color', R.colors], ['backgroundColor', R.bg], ['borderTopColor', R.borders]]) {
      const v = cs[prop]; if (v && v !== 'rgba(0, 0, 0, 0)') bucket(map, hex(rgb(v) || v), el);
    }
    bucket(R.radii, cs.borderTopLeftRadius, el);
    bucket(R.fonts, cs.fontFamily.split(',')[0].replace(/"/g, ''), el);
    bucket(R.weight, cs.fontWeight, el);
    const an = cs.animationName; if (an && an !== 'none') bucket(R.anims, an, el);
    const bgc = rgb(cs.backgroundColor); if (leak(bgc)) R.leaks.push({ where: sel(el) + ' bg', val: hex(bgc) });
    const cc = rgb(cs.color); if (leak(cc)) R.leaks.push({ where: sel(el) + ' fg', val: hex(cc) });
    const bc = rgb(cs.borderTopColor); if (cs.borderTopWidth !== '0px' && leak(bc)) R.leaks.push({ where: sel(el) + ' bd', val: hex(bc) });
    if (cc && cc[3] > .5) {
      const grad = cs.backgroundImage && cs.backgroundImage !== 'none';
      let e = el, gradNear = grad;
      while (!gradNear && e && e !== document.documentElement) { if (getComputedStyle(e).backgroundImage !== 'none') gradNear = true; e = e.parentElement; }
      if (!gradNear) {
        const bg = effBg(el); const l1 = lum(cc), l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
        const txt = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).length;
        if (txt && ratio < 4.5 && ratio > 0) R.contrast.push({ el: sel(el), fg: hex(cc), bg: hex(bg), ratio: +ratio.toFixed(2) });
      }
    }
  }
  const top = (m, n = 18) => Object.entries(m).sort((a, b) => b[1].n - a[1].n).slice(0, n)
    .map(([k, v]) => ({ v: k, n: v.n, ex: v.ex }));
  const seen = new Set();
  R.leaks = R.leaks.filter(l => !seen.has(l.where) && seen.add(l.where)).slice(0, 30);
  R.contrast = R.contrast.sort((a, b) => a.ratio - b.ratio).slice(0, 15);
  return { n: R.n, colors: top(R.colors), bg: top(R.bg), borders: top(R.borders, 12), radii: top(R.radii, 14), fonts: top(R.fonts, 8), weight: top(R.weight, 8), anims: top(R.anims, 12), leaks: R.leaks, contrast: R.contrast };
})()
