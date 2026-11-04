// 新艾利都皮肤中心 · 客户端（2026-11-04 v1.3：设置对象切换——按对话选壁纸与头像）
// 无框架部分：背景装饰层渲染（video+scrim，跟亮暗档；有效壁纸=会话专属>全局激活，仅条目变化才重建媒体）、
//   免重载换肤、界面材质（三滑块 → body CSS 变量，localStorage 持久，启动即注入）；
// 会话外观偏好（localStorage zzz-session-appearance-v1，仅当前浏览器）：按真实会话行 ID 存
//   手动头像（三类素材全部可用）与专属壁纸；敲敲联系人 choose 优先手动头像，否则走旧自动 CONTACT_KEY；
// 换装 UI 从「右缘入口签 + 全屏浮层」迁移为 settings.section（ctx.slots.register），
// React 组件由宿主 require 提供，照 dsh-backend-restart 的注册样板。
window.__ModuleLoader__.load({
  id: "dsh-eridu-skincenter",
  factory: (require) => {
    // 宿主约定：factory 返回值会被当作插件模块校验（必须有 apply），
    // 不返回 → "invalid plugin ... received undefined"（副作用虽已跑，横幅仍会弹）。
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const { createElement: h, useCallback, useEffect, useMemo, useState } = React;

    const API = "/api/eridu-skins";
    const NS = "dsh-eridu-skincenter";
    const AC = "#cdf348", INK = "#14141a", PANEL = "#14151f", PANEL2 = "#0e0f18", LINE = "#2a2c3c";
    const GL = { "chat-icons": "聊天图标", avatars: "头像", portraits: "角色" };
    let CATALOG = [], ACTIVE = null, AV = { catalog: [], current: null };

    /* ── 背景装饰层（video + scrim，跟 body 档位） ────── */
    let bgLayer = null, bgEntry = null, themeObs = null;
    function ensureLayer() {
      if (bgLayer && document.body.contains(bgLayer)) return bgLayer;
      bgLayer = document.createElement("div");
      bgLayer.setAttribute("data-dsh-skin-layer", "background");
      bgLayer.setAttribute("aria-hidden", "true");
      bgLayer.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;z-index:-2;pointer-events:none;overflow:hidden;";
      document.body.appendChild(bgLayer);
      return bgLayer;
    }
    function renderBackground(entry) {
      bgEntry = entry;
      const layer = ensureLayer();
      layer.textContent = "";
      const bm = entry && entry.backgroundMedia;
      if (!bm) return;
      const dark = document.body.hasAttribute("data-ds-dark-theme");
      const spec = bm[dark ? "dark" : "light"];
      if (!spec) return;
      const base = `${API}/skin/${entry.id}/assets`;
      if (spec.type === "image") {
        const img = document.createElement("img");
        img.src = `${base}/${spec.src}`; img.alt = "";
        img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
        layer.appendChild(img);
      } else {
        const v = document.createElement("video");
        v.src = `${base}/${spec.src}`; v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
        v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
        layer.appendChild(v);
      }
      if (spec.scrim) {
        const s = document.createElement("div");
        s.style.cssText = `position:absolute;inset:0;background:${spec.scrim};`;
        layer.appendChild(s);
      }
    }
    function watchTheme() {
      if (themeObs) return;
      themeObs = new MutationObserver(() => renderBackground(bgEntry));
      themeObs.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
    }

    /* ── 免重载换肤 ──────────────────────────────────── */
    function swapLinks(id, hasPatches) {
      const href = (f) => `${API}/skin/${id}/${f}?t=${Date.now()}`;
      let sheet = document.querySelector('link[data-dsh-skin-link="stylesheet"]');
      if (!sheet) { sheet = document.createElement("link"); sheet.rel = "stylesheet"; sheet.setAttribute("data-dsh-skin-link", "stylesheet"); document.head.appendChild(sheet); }
      sheet.href = href("stylesheet");
      let pat = document.querySelector('link[data-dsh-skin-link="patches"]');
      if (hasPatches) {
        if (!pat) { pat = document.createElement("link"); pat.rel = "stylesheet"; pat.setAttribute("data-dsh-skin-link", "patches"); document.head.appendChild(pat); }
        pat.href = href("patches");
      } else if (pat) pat.remove();
      document.documentElement.setAttribute("data-dsh-skin", id);
    }
    async function applySkin(id) {
      const r = await fetch(`${API}/active`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "失败");
      ACTIVE = id;
      const entry = CATALOG.find((s) => s.id === id);
      swapLinks(id, j.hasPatches);
      // 全局换装仍尊重当前会话的专属壁纸：有效壁纸=会话 override > 全局 ACTIVE
      renderBackgroundEffective();
      return j;
    }
    async function applyAvatar(e) {
      const r = await fetch(`${API}/avatar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(e) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "失败");
      AV.current = { dir: e.dir, file: e.file, name: e.name };
      const pat = document.querySelector('link[data-dsh-skin-link="patches"]');
      if (pat) pat.href = `${API}/skin/${ACTIVE}/patches?t=${Date.now()}`;
      return j;
    }

    /* ── 界面材质（v1.2：三滑块 → body 变量，直值无映射，localStorage 持久） ── */
    const MAT_KEY = "dsh-eridu-material-v1";
    const MAT_FIELDS = [
      { key: "panel", label: "面板不透明度", hint: "中间列 / 侧栏 / 输入卡 / 对话框底色，向左更透、壁纸透进页面", min: 0.48, max: 0.9, step: 0.01, def: 0.66, css: "--zzz-panel-alpha" },
      { key: "bubble", label: "气泡不透明度", hint: "白色气泡随滑块调节；蓝色气泡保持足够浓度，让白色文字清晰可读", min: 0.65, max: 1, step: 0.01, def: 0.86, css: "--dsh-skin-bubble-alpha" },
      { key: "blur", label: "背景模糊", hint: "面板底下壁纸的虚化半径", min: 0, max: 18, step: 1, def: 6, unit: "px", css: "--zzz-panel-blur" },
    ];
    function matClamp(v, f) {
      // 安全 parse：只收有限数，字符串先 Number 再验；null/空串/NaN/Infinity 一律回默认
      let n;
      if (typeof v === "number") n = v;
      else if (typeof v === "string" && v.trim() !== "") n = Number(v);
      else return f.def;
      if (!Number.isFinite(n)) return f.def;
      return Math.min(f.max, Math.max(f.min, n));
    }
    function matDefaults() {
      const m = {};
      for (const f of MAT_FIELDS) m[f.key] = f.def;
      return m;
    }
    function matLoad() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(MAT_KEY) || "null"); } catch {}
      const src = raw && typeof raw === "object" ? raw : {};
      const m = {};
      for (const f of MAT_FIELDS) m[f.key] = matClamp(src[f.key], f);
      return m;
    }
    function matSave(m) {
      try { localStorage.setItem(MAT_KEY, JSON.stringify(m)); } catch {}
    }
    function matApply(m) {
      if (typeof document === "undefined" || !document.body) return false;
      for (const f of MAT_FIELDS) {
        document.body.style.setProperty(f.css, f.unit ? m[f.key] + f.unit : String(m[f.key]));
      }
      return true;
    }
    // 启动即注入（皮肤 CSS 的 body 兜底默认与本组 def 相同，无闪烁）；body 未就绪时挂 DOMContentLoaded
    let MATERIAL = matLoad();
    if (typeof document !== "undefined" && !matApply(MATERIAL)) {
      document.addEventListener("DOMContentLoaded", () => matApply(MATERIAL), { once: true });
    }

    /* ── 会话外观偏好（v1.3：本浏览器 localStorage，按真实会话行 ID） ── */
    // 只存白名单形状；使用时再对 catalog 校验（皮肤/头像下架即自然回落全局/自动）。
    const SESH_KEY = "zzz-session-appearance-v1";
    const SESH_DIRS = ["avatars", "chat-icons", "portraits"];
    function loadSessionPrefs() {
      const out = Object.create(null);
      try {
        const raw = JSON.parse(localStorage.getItem(SESH_KEY) || "{}");
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
        for (const [id, v] of Object.entries(raw)) {
          if (typeof id !== "string" || !id.startsWith("session:") || id.length > 200) continue;
          if (!v || typeof v !== "object" || Array.isArray(v)) continue;
          const rec = {};
          const a = v.avatar;
          if (a && typeof a === "object" && !Array.isArray(a)
            && SESH_DIRS.includes(a.dir)
            && typeof a.file === "string" && /^[\w.-]+\.webp$/.test(a.file)
          ) {
            rec.avatar = { dir: a.dir, file: a.file, name: (typeof a.name === "string" && a.name.trim() && a.name.length <= 64) ? a.name : a.file };
          }
          if (typeof v.wallpaper === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v.wallpaper)) rec.wallpaper = v.wallpaper;
          if (rec.avatar || rec.wallpaper) out[id] = rec;
        }
      } catch {}
      return out;
    }
    let SESH = loadSessionPrefs();
    function saveSessionPrefs(id) {
      const latest = loadSessionPrefs();
      const next = Object.assign(Object.create(null), latest);
      if (SESH[id]) next[id] = SESH[id];
      else delete next[id];
      try { localStorage.setItem(SESH_KEY, JSON.stringify(next)); }
      catch { SESH = latest; return false; }
      SESH = next;
      return true;
    }
    function seshRec(id, create) {
      if (!id || typeof id !== "string" || !id.startsWith("session:") || id.length > 200) return null;
      if (!SESH[id] && create) SESH[id] = {};
      return SESH[id] || null;
    }
    function sessionAvatarOf(id) {
      const rec = seshRec(id, false);
      const a = rec && rec.avatar;
      if (!a) return null;
      return AV.catalog.some((e) => e.dir === a.dir && e.file === a.file) ? a : null;
    }
    function sessionWallpaperOf(id) {
      const rec = seshRec(id, false);
      const wp = rec && rec.wallpaper;
      if (!wp) return null;
      const e = CATALOG.find((s) => s.id === wp);
      return e && e.backgroundMedia ? e : null;
    }
    // 当前联系人（模块级，startContacts 维护，设置页订阅）：null=未识别到选中会话
    let CURRENT_CONTACT = null;
    const contactListeners = new Set();
    function onContactChange(fn) {
      contactListeners.add(fn);
      return () => contactListeners.delete(fn);
    }
    // 有效壁纸：会话 override > 全局 ACTIVE；条目未变不重建媒体（80ms observer 只做身份比较）
    function effectiveBgEntry(id) {
      return sessionWallpaperOf(id) || CATALOG.find((s) => s.id === ACTIVE) || null;
    }
    function renderBackgroundEffective() {
      const entry = effectiveBgEntry(CURRENT_CONTACT ? CURRENT_CONTACT.id : null);
      if (entry === bgEntry) return;
      renderBackground(entry);
    }
    function notifyContact(next) {
      SESH = loadSessionPrefs();
      CURRENT_CONTACT = next;
      renderBackgroundEffective();
      contactRefresh?.();
      for (const fn of contactListeners) { try { fn(next); } catch {} }
    }

    /* ── 设置页 section（React，样式随包注入一次） ────── */
    const CSS_TAG = NS + "/section.css";
    const CSS = [
      /* 主题变量全部收敛在 .esc 作用域：暗色为默认值，body:not([data-ds-dark-theme]) 整组切亮色。
         组件一律只引用 --esc-*，不再硬编码暗色混宿主 token（此前亮档下深底浅字/浅字深底全糊）。 */
      ".esc{--esc-accent:var(--zzz-accent,#cdf348);--esc-accent-text:var(--zzz-accent,#cdf348);--esc-ink:#14141a;--esc-panel:#14151f;--esc-panel-2:#0e0f18;--esc-line:#2a2c3c;--esc-line-strong:rgba(128,132,160,.55);--esc-label:#e8e9f0;--esc-label-2:#a9abbd;--esc-label-3:#808090;--esc-shot-dim:#c7c9da;--esc-shadow:rgba(0,0,0,.45);--esc-shadow-hover:rgba(0,0,0,.55);--esc-error:#ff7a90;max-width:900px;display:flex;flex-direction:column;gap:14px;min-width:0;color:var(--esc-label)}",
      "body:not([data-ds-dark-theme]) .esc{--esc-accent-text:#4f7000;--esc-panel:#fbf9f4;--esc-panel-2:#f4f1e9;--esc-line:rgba(26,26,30,.22);--esc-line-strong:rgba(26,26,30,.4);--esc-label:#1a1a1e;--esc-label-2:#5c5c66;--esc-label-3:#65656f;--esc-shot-dim:#d8d5cc;--esc-shadow:rgba(26,24,20,.16);--esc-shadow-hover:rgba(26,24,20,.22);--esc-error:#b81c22}",
      /* :where(…) 零特异性兜底：宿主全局 button/img/input 规则不再渗进卡片与按钮；
         类名 esc- 前缀自隔离，本段也不外泄。所有 button 可靠 box-sizing/min-width。 */
      ".esc,.esc *{box-sizing:border-box;min-width:0}",
      ".esc :where(button){font:inherit;color:inherit;margin:0;padding:0;border:none;background:none;appearance:none;-webkit-appearance:none}",
      ".esc :where(button):disabled{cursor:not-allowed}",
      ".esc :where(img,video){display:block;max-width:100%}",
      ".esc :where(button,input):focus-visible{outline:2px solid var(--esc-accent);outline-offset:2px}",
      "@media (prefers-reduced-motion:reduce){.esc :where(*){transition:none!important}}",
      ".esc-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}",
      ".esc-head .mono{font:600 11px/1 ui-monospace,Consolas,monospace;color:var(--esc-accent-text);letter-spacing:.22em}",
      ".esc-head h2{margin:0;font-size:17px;font-weight:800;letter-spacing:.06em;color:var(--esc-label)}",
      ".esc-head .cur{margin-left:auto;font-size:12px;color:var(--esc-label-3)}",
      ".esc-head .cur b{color:var(--esc-accent-text)}",
      /* 设置对象（v1.3）：radiogroup，当前对话无会话时禁用并给出提示 */
      ".esc-scope{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".esc-scope-key{font:600 11px/1 ui-monospace,Consolas,monospace;color:var(--esc-label-3);letter-spacing:.2em;flex-shrink:0}",
      ".esc-radio{cursor:pointer;display:inline-flex;align-items:center;gap:7px;min-width:0;max-width:100%;border:1.5px solid var(--esc-line);background:var(--esc-panel);color:var(--esc-label-2);padding:5px 14px;font-family:inherit;font-weight:700;font-size:12px;line-height:1.5;letter-spacing:.06em;white-space:nowrap;clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)}",
      ".esc-radio:hover:not(:disabled){color:var(--esc-label)}",
      ".esc-radio.on{background:var(--esc-accent);border-color:var(--esc-accent);color:var(--esc-ink)}",
      ".esc-radio:disabled{opacity:.55}",
      ".esc-scope .esc-scope-name{font-weight:500;min-width:0;max-width:min(40vw,300px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".esc-scope .esc-scope-name.dim{color:var(--esc-label-3);font-weight:400}",
      ".esc-radio.on .esc-scope-name{font-weight:700;color:inherit}",
      ".esc-scope-note{margin-left:auto;font-size:11px;color:var(--esc-label-3)}",
      ".esc-tabs{display:flex;gap:8px;flex-wrap:wrap}",
      ".esc-tab{cursor:pointer;min-width:0;border:1.5px solid var(--esc-line);background:var(--esc-panel);color:var(--esc-label-2);padding:6px 18px;font-weight:700;font-size:12.5px;letter-spacing:.1em;white-space:nowrap;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}",
      ".esc-tab:hover{color:var(--esc-label)}",
      ".esc-tab.on{background:var(--esc-accent);border-color:var(--esc-accent);color:var(--esc-ink)}",
      ".esc-panel{display:flex;flex-direction:column;gap:14px;min-width:0}",
      ".esc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(224px,100%),1fr));gap:14px}",
      ".esc-card{cursor:pointer;display:block;width:100%;border:2px solid var(--esc-line);background:var(--esc-panel);box-shadow:3px 3px 0 var(--esc-shadow);position:relative;transition:transform .12s,box-shadow .12s;padding:0;text-align:inherit;font:inherit}",
      ".esc-card:hover:not(:disabled){transform:translate(-2px,-2px);box-shadow:5px 5px 0 var(--esc-shadow-hover)}",
      ".esc-card.on{border-color:var(--esc-accent)}",
      ".esc-card:disabled{opacity:.6}",
      ".esc-card .shot{position:relative;display:block;aspect-ratio:16/9;overflow:hidden;background:#000}",
      ".esc-card .shot video,.esc-card .shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}",
      ".esc-card .shot .veil{position:absolute;inset:0;background:linear-gradient(180deg,transparent 62%,rgba(8,9,18,.82))}",
      ".esc-card .shot .nm{position:absolute;left:10px;right:10px;bottom:8px;font-weight:800;font-size:14px;color:#fff;text-shadow:2px 2px 0 rgba(0,0,0,.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".esc-card .shot .nm small{display:block;font-weight:400;font-size:10px;color:var(--esc-shot-dim);letter-spacing:.06em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".esc-card .meta{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 11px;font-size:11px;color:var(--esc-label-2);min-width:0}",
      ".esc-card .meta>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".esc-card .meta .live{color:var(--esc-accent-text);font-weight:700;flex-shrink:0}",
      ".esc-card .meta .off{color:var(--esc-label-3);font-weight:700;flex-shrink:0}",
      ".esc-sticker{position:absolute;top:-9px;right:-7px;background:var(--esc-accent);color:var(--esc-ink);font-size:10.5px;font-weight:900;padding:2px 9px;transform:rotate(3deg);box-shadow:2px 2px 0 var(--esc-shadow);z-index:2}",
      ".esc-search{background:var(--esc-panel-2);border:1.5px solid var(--esc-line);color:var(--esc-label);border-radius:8px;padding:7px 13px;width:min(230px,100%);outline:none;font-size:13px}",
      ".esc-search::placeholder{color:var(--esc-label-3)}",
      ".esc-search:focus{border-color:var(--esc-accent)}",
      ".esc-note{margin:0;font-size:12.5px;line-height:1.7;color:var(--esc-label-3)}",
      ".esc-loading{font-size:13px;color:var(--esc-label-2);padding:4px 0}",
      ".esc-reload{display:flex;align-items:center;gap:12px;flex-wrap:wrap}",
      ".esc-key{font-size:11.5px;color:var(--esc-label-3);letter-spacing:.2em;margin:6px 0 2px}",
      ".esc-avgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(84px,100%),1fr));gap:8px}",
      ".esc-avcell{cursor:pointer;text-align:center;padding:7px 4px;border:1.5px solid transparent;border-radius:10px;background:transparent}",
      ".esc-avcell img{width:58px;height:58px;margin:0 auto;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}",
      ".esc-avcell span{display:block;font-size:11px;color:var(--esc-label-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".esc-avcell:hover{border-color:var(--esc-line);background:var(--esc-panel)}",
      ".esc-avcell.on{border-color:var(--esc-accent);background:var(--esc-panel)}",
      ".esc-avcell.on span{color:var(--esc-accent-text);font-weight:700}",
      ".esc-bar{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 0 6px;border-top:1px solid var(--esc-line);background:var(--esc-panel)}",
      ".esc-bar .pick{display:flex;align-items:center;gap:10px;min-width:0;max-width:100%;background:var(--esc-panel);border:1.5px solid var(--esc-line);border-radius:10px;padding:6px 14px;color:var(--esc-label);font-size:13px}",
      ".esc-bar .pick img{width:38px;height:38px;flex-shrink:0}",
      ".esc-bar .pick span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".esc-bar .pick b{color:var(--esc-accent-text)}",
      /* 原 font:800 14px/1 inherit 简写含 inherit 关键字整条声明非法被丢弃，改 longhand */
      ".esc-apply{background:var(--esc-accent);color:var(--esc-ink);border:none;font-family:inherit;font-weight:800;font-size:14px;line-height:1;padding:11px 26px;min-width:120px;cursor:pointer;box-shadow:3px 3px 0 var(--esc-shadow);clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}",
      ".esc-apply:disabled{opacity:.5;cursor:wait}",
      ".esc-msg{font-size:12.5px;color:var(--esc-accent-text);min-width:0;max-width:100%;word-break:break-word}",
      ".esc-msg.bad{color:var(--esc-error)}",
      /* 界面材质：平铺行，不套大框；文字走 --esc-* 跟亮暗，滑杆用 accent-color 原生双档 */
      ".esc-mat{display:flex;flex-direction:column;gap:7px;max-width:620px;min-width:0}",
      ".esc-mat .esc-mat-top{display:flex;align-items:baseline;justify-content:space-between;gap:14px}",
      ".esc-mat .esc-mat-top label{font-size:13px;font-weight:700;letter-spacing:.04em;color:var(--esc-label)}",
      ".esc-mat .esc-mat-val{font:600 12px/1 ui-monospace,Consolas,monospace;color:var(--esc-label-2)}",
      ".esc-mat input[type=range]{width:100%;max-width:100%;margin:0;cursor:pointer;accent-color:var(--esc-accent)}",
      ".esc-mat .esc-mat-hint{font-size:11.5px;line-height:1.6;color:var(--esc-label-3)}",
      ".esc-mat-reset{background:transparent;border:1.5px solid var(--esc-line-strong);color:var(--esc-label);border-radius:8px;padding:8px 18px;font-family:inherit;font-weight:700;font-size:12.5px;line-height:1;letter-spacing:.08em;cursor:pointer}",
      ".esc-mat-reset:hover:not(:disabled){border-color:var(--esc-accent);color:var(--esc-accent-text)}",
      ".esc-mat-reset:disabled{opacity:.55}",
    ].join("");
    function useStyleOnce() {
      useEffect(() => {
        if (typeof document === "undefined") return;
        if (!document.getElementById(CSS_TAG)) {
          const el = document.createElement("style");
          el.id = CSS_TAG;
          el.textContent = CSS;
          document.head.appendChild(el);
        }
      }, []);
    }

    function SkinCenterSection() {
      useStyleOnce();
      const TABS = [["bg", "动态背景"], ["av", "代理人头像"], ["mt", "界面材质"]];
      const [tab, setTab] = useState("bg");
      const [scope, setScope] = useState(() => CURRENT_CONTACT ? "session" : "global"); // 设置对象：session=当前对话 / global=全局默认
      const [contact, setContact] = useState(CURRENT_CONTACT);
      const [active, setActive] = useState(ACTIVE);
      const [catalog, setCatalog] = useState(CATALOG);
      const [av, setAv] = useState(AV);
      const [avSel, setAvSel] = useState(null);
      const [q, setQ] = useState("");
      const [msg, setMsg] = useState(null);
      const [busy, setBusy] = useState(false);
      const [loading, setLoading] = useState(true);
      const [loadErr, setLoadErr] = useState(null);
      const [mat, setMat] = useState(MATERIAL);

      // 跟随敲敲当前联系人（切换会话即更新）；会话没了自动回到全局档
      useEffect(() => {
        setContact(CURRENT_CONTACT);
        return onContactChange(setContact);
      }, []);
      useEffect(() => { if (scope === "session" && !contact) setScope("global"); }, [scope, contact]);
      useEffect(() => { setAvSel(null); setMsg(null); }, [contact && contact.id, scope]);

      // refresh 不再吞异常：两列表分开兜底，HTTP 状态与解析失败都浮出到界面，可重试
      const refresh = useCallback(async () => {
        setLoading(true); setLoadErr(null);
        const errs = [];
        try {
          const r = await fetch(`${API}/list`, { cache: "no-store" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const j = await r.json();
          CATALOG = j.skins || [];
          if (j.active) ACTIVE = j.active;
        } catch (e) { errs.push("背景列表加载失败（" + (e && e.message ? e.message : e) + "）"); }
        try {
          const r = await fetch(`${API}/avatar/list`, { cache: "no-store" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const j = await r.json();
          AV = { catalog: j.catalog || [], current: j.current || null };
        } catch (e) { errs.push("头像列表加载失败（" + (e && e.message ? e.message : e) + "）"); }
        setActive(ACTIVE); setCatalog([...CATALOG]); setAv({ catalog: [...AV.catalog], current: AV.current });
        renderBackgroundEffective();
        if (errs.length) setLoadErr(errs.join("；"));
        setLoading(false);
      }, []);
      useEffect(() => { refresh(); }, [refresh]);

      const cur = catalog.find((s) => s.id === active);
      const isSess = scope === "session" && !!contact;
      const sessWpEntry = isSess ? sessionWallpaperOf(contact.id) : null;
      const sessAv = isSess ? sessionAvatarOf(contact.id) : null;
      const say = (t, bad) => { setMsg({ t, bad }); };

      const groups = useMemo(() => {
        const g = { avatars: [], "chat-icons": [], portraits: [] };
        const s = q.trim();
        for (const e of av.catalog) {
          if (s && !e.name.includes(s)) continue;
          (g[e.dir] || (g[e.dir] = [])).push(e);
        }
        return g;
      }, [av, q]);

      const cardHover = (on) => (ev) => {
        const v = ev.currentTarget.querySelector("video");
        if (!v) return;
        if (on) { v.src = ev.currentTarget.dataset.vid; v.play().catch(() => {}); }
        else { v.pause(); v.removeAttribute("src"); v.load(); }
      };
      const pickSkin = async (id, name) => {
        setBusy(true); say("换装中…");
        try {
          await applySkin(id); setActive(id);
          const wp = sessionWallpaperOf(CURRENT_CONTACT && CURRENT_CONTACT.id);
          say(wp ? "✓ 已换上 " + name + "（当前对话仍使用其专属壁纸）" : "✓ 已换上 " + name);
        }
        catch (e) { say("✗ " + e.message, true); }
        setBusy(false);
      };
      const pickAvatar = async () => {
        if (!avSel) return;
        setBusy(true); say("应用中…");
        try { await applyAvatar(avSel); await refresh(); say("✓ 头像已换上 " + avSel.name); setAvSel(null); }
        catch (e) { say("✗ " + e.message, true); }
        setBusy(false);
      };
      // 当前对话：只写本浏览器偏好，不 POST /active、不换皮肤 CSS
      const pickSessionWallpaper = (s) => {
        if (!isSess) return;
        const rec = seshRec(contact.id, true);
        if (!rec) return;
        rec.wallpaper = s.id;
        if (!saveSessionPrefs(contact.id)) { say("无法保存到本浏览器，请检查存储权限。", true); return; }
        renderBackgroundEffective();
        say("✓ 已为「" + contact.title + "」设置壁纸 " + s.name + "（仅保存在本浏览器）");
      };
      const resetSessionWallpaper = () => {
        if (!isSess) return;
        const rec = seshRec(contact.id, false);
        if (!rec || !rec.wallpaper) return;
        delete rec.wallpaper;
        if (!rec.avatar) delete SESH[contact.id];
        if (!saveSessionPrefs(contact.id)) { say("无法保存到本浏览器，请检查存储权限。", true); return; }
        renderBackgroundEffective();
        say("✓ 「" + contact.title + "」已恢复使用全局壁纸");
      };
      const pickSessionAvatar = () => {
        if (!isSess || !avSel) return;
        const rec = seshRec(contact.id, true);
        if (!rec) return;
        rec.avatar = { dir: avSel.dir, file: avSel.file, name: avSel.name };
        if (!saveSessionPrefs(contact.id)) { say("无法保存到本浏览器，请检查存储权限。", true); return; }
        if (contactRefresh) contactRefresh();
        say("✓ 已为「" + contact.title + "」设置头像 " + avSel.name + "（仅保存在本浏览器）");
        setAvSel(null);
      };
      const resetSessionAvatar = () => {
        if (!isSess) return;
        const rec = seshRec(contact.id, false);
        if (!rec || !rec.avatar) return;
        delete rec.avatar;
        if (!rec.wallpaper) delete SESH[contact.id];
        if (!saveSessionPrefs(contact.id)) { say("无法保存到本浏览器，请检查存储权限。", true); return; }
        if (contactRefresh) contactRefresh();
        say("✓ 「" + contact.title + "」已恢复自动分配头像");
      };
      const dragMat = (f, raw) => {
        // React 的 onChange 对 range 即逐拍 input 事件：拖动即时写 body 变量并落盘
        const v = matClamp(raw, f);
        MATERIAL = { ...MATERIAL, [f.key]: v };
        setMat(MATERIAL);
        matApply(MATERIAL);
        matSave(MATERIAL);
      };
      const resetMat = () => {
        MATERIAL = matDefaults();
        setMat(MATERIAL);
        matApply(MATERIAL);
        matSave(MATERIAL);
        say("✓ 已恢复默认材质（0.66 / 0.86 / 6px）");
      };

      // tab 可访问性：roving tabindex + 方向键/Home/End 循环
      const onTabKey = (e) => {
        const ids = ["bg", "av", "mt"];
        const i = ids.indexOf(tab);
        let n = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % ids.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i + ids.length - 1) % ids.length;
        else if (e.key === "Home") n = 0;
        else if (e.key === "End") n = ids.length - 1;
        if (n < 0) return;
        e.preventDefault();
        setTab(ids[n]);
        const el = document.getElementById("esc-tab-" + ids[n]);
        if (el) el.focus();
      };
      // 设置对象可访问性：radiogroup 左右键/Home/End；「当前对话」无会话时不可进入
      const onScopeKey = (e) => {
        let target = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") target = scope === "session" ? "global" : null;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") target = scope === "global" ? "session" : null;
        else if (e.key === "Home") target = "session";
        else if (e.key === "End") target = "global";
        if (!target || target === scope) return;
        if (target === "session" && !contact) return;
        e.preventDefault();
        setScope(target);
        const el = document.getElementById("esc-scope-" + target);
        if (el) el.focus();
      };

      const kids = [
        h("div", { className: "esc-head" },
          h("span", { className: "mono" }, "// ZENLESS ZONE ZERO"),
          h("h2", null, "ZZZ"),
          h("span", { className: "cur" }, isSess
            ? ["当前对话 ", h("b", null, contact.title || contact.id), " · 壁纸 ", h("b", null, sessWpEntry ? sessWpEntry.name : (cur ? cur.name : "—"))]
            : ["使用中：", h("b", null, cur ? cur.name : active || "—")],
          ),
        ),
        h("div", { className: "esc-scope", role: "radiogroup", "aria-label": "设置对象", onKeyDown: onScopeKey },
          h("span", { className: "esc-scope-key" }, "设置对象"),
          h("button", {
            type: "button", id: "esc-scope-session", role: "radio",
            className: "esc-radio" + (scope === "session" ? " on" : ""),
            "aria-checked": scope === "session" ? "true" : "false",
            tabIndex: scope === "session" ? 0 : -1,
            disabled: !contact,
            title: contact ? "只为当前对话设置壁纸与头像" : "先在敲敲中打开一个对话，再回来为它单独设置",
            onClick: () => { if (contact) setScope("session"); },
          }, "当前对话", contact
            ? h("span", { className: "esc-scope-name" }, contact.title || contact.id)
            : h("span", { className: "esc-scope-name dim" }, "先打开一个对话")),
          h("button", {
            type: "button", id: "esc-scope-global", role: "radio",
            className: "esc-radio" + (scope === "global" ? " on" : ""),
            "aria-checked": scope === "global" ? "true" : "false",
            tabIndex: scope === "global" ? 0 : -1,
            onClick: () => setScope("global"),
          }, "全局默认"),
          h("span", { className: "esc-scope-note" }, isSess
            ? "背景与头像只作用于当前对话（材质始终全局）；保存在本浏览器"
            : "背景与头像为全局默认，材质对所有对话生效"),
        ),
        h("div", { className: "esc-tabs", role: "tablist", "aria-label": "ZZZ 皮肤中心", onKeyDown: onTabKey },
          TABS.map(([id, name]) => h("button", {
            key: id, id: "esc-tab-" + id, type: "button", role: "tab",
            className: "esc-tab" + (tab === id ? " on" : ""),
            "aria-selected": tab === id ? "true" : "false",
            "aria-controls": "esc-panel-" + id,
            tabIndex: tab === id ? 0 : -1,
            onClick: () => setTab(id),
          }, name)),
        ),
      ];

      if (loading && !catalog.length && !av.catalog.length) {
        kids.push(h("div", { className: "esc-loading", role: "status" }, "正在加载皮肤与头像列表…"));
      } else if (loadErr) {
        kids.push(h("div", { className: "esc-reload" },
          h("span", { className: "esc-msg bad", role: "alert" }, loadErr),
          h("button", { type: "button", className: "esc-mat-reset", onClick: refresh, disabled: loading }, "重试"),
        ));
      }

      if (tab === "bg") {
        kids.push(h("div", { key: "panel-bg", id: "esc-panel-bg", role: "tabpanel", "aria-labelledby": "esc-tab-bg", className: "esc-panel" },
          isSess ? h("p", { className: "esc-note" },
            "为「", h("b", null, contact.title || contact.id), "」选择专属壁纸：只更换本对话的背景画面，不改全局皮肤与样式；设置保存在本浏览器，不跨设备同步。") : null,
          catalog.length ? h("div", { className: "esc-grid" },
            catalog.map((s) => {
              const base = `${API}/skin/${s.id}/assets`;
              const poster = s.preview && s.preview.dark ? `${base}/${s.preview.dark}` : "";
              const vid = s.backgroundMedia && s.backgroundMedia.dark && s.backgroundMedia.dark.src ? `${base}/${s.backgroundMedia.dark.src}` : "";
              const usable = !isSess || !!s.backgroundMedia; // 会话壁纸只收有动态背景的条目
              const on = isSess ? !!(sessWpEntry && sessWpEntry.id === s.id) : s.id === active;
              return h("button", {
                key: s.id, type: "button", className: "esc-card" + (on ? " on" : ""), "data-vid": vid,
                "aria-pressed": on ? "true" : "false",
                onMouseEnter: usable ? cardHover(true) : undefined, onMouseLeave: usable ? cardHover(false) : undefined,
                onClick: () => (isSess ? pickSessionWallpaper(s) : pickSkin(s.id, s.name)),
                disabled: busy || !usable,
                title: usable ? undefined : "该皮肤没有动态背景，不能作为会话壁纸",
              },
                on ? h("span", { className: "esc-sticker" }, isSess ? "本对话" : "使用中") : null,
                h("div", { className: "shot" },
                  vid ? h("video", { muted: true, loop: true, playsInline: true, preload: "none", poster }) : h("img", { src: poster, alt: "" }),
                  h("div", { className: "veil" }),
                  h("div", { className: "nm" }, s.name, h("small", null, (s.nameEn || s.id) + " · v" + (s.version || "?"))),
                ),
                h("div", { className: "meta" },
                  h("span", null, s.tagline || ""),
                  isSess && !vid ? h("span", { className: "off" }, "无动态背景") : vid ? h("span", { className: "live" }, "动态") : null,
                ),
              );
            }),
          ) : h("p", { className: "esc-note" }, "暂无可用皮肤。"),
          isSess ? h("div", { className: "esc-bar" },
            h("div", { className: "pick" },
              h("span", null, "本对话壁纸：", h("b", null, sessWpEntry ? sessWpEntry.name : "跟随全局（" + (cur ? cur.name : "无") + "）")),
            ),
            h("button", { type: "button", className: "esc-mat-reset", onClick: resetSessionWallpaper, disabled: !sessWpEntry }, "使用全局壁纸"),
            msg ? h("span", { className: "esc-msg" + (msg.bad ? " bad" : "") }, msg.t) : null,
          ) : (msg ? h("span", { className: "esc-msg" + (msg.bad ? " bad" : "") }, msg.t) : null),
        ));
      } else if (tab === "av") {
        const avEntries = Object.entries(groups).filter(([, list]) => list.length);
        kids.push(h("div", { key: "panel-av", id: "esc-panel-av", role: "tabpanel", "aria-labelledby": "esc-tab-av", className: "esc-panel" },
          h("p", { className: "esc-note" }, isSess
            ? ["为「", h("b", null, contact.title || contact.id), "」挑选专属头像：三类素材全部可用，列表、聊天头部与消息气泡同步更换；保存在本浏览器，不影响其他对话与全局默认头像。"]
            : "默认头像用于没有联系人头像的会话；敲敲联系人按会话自动分配头像。"),
          h("input", { className: "esc-search", placeholder: "搜索代理人…", value: q, onChange: (e) => setQ(e.target.value), "aria-label": "搜索代理人" }),
          avEntries.length ? avEntries.flatMap(([dir, list]) => [
            h("div", { key: "k" + dir, className: "esc-key" }, (GL[dir] || dir) + " · " + list.length),
            h("div", { key: "g" + dir, className: "esc-avgrid" },
              list.map((e) => {
                const on = isSess
                  ? !!(sessAv && sessAv.dir === e.dir && sessAv.file === e.file)
                  : !!(av.current && av.current.dir === e.dir && av.current.file === e.file);
                const sel = avSel && avSel.dir === e.dir && avSel.file === e.file;
                return h("button", {
                  key: e.dir + "/" + e.file, type: "button", className: "esc-avcell" + (sel || on ? " on" : ""),
                  "aria-pressed": sel || on ? "true" : "false",
                  onClick: () => setAvSel({ dir: e.dir, file: e.file, name: e.name }),
                },
                  h("img", { loading: "lazy", src: `${API}/avatar-img/${e.dir}/${e.file}`, alt: e.name }),
                  h("span", null, e.name + (on ? (isSess ? " · 本对话" : " · 使用中") : "")),
                );
              }),
            ),
          ]) : h("p", { className: "esc-note" }, q.trim() ? "没有匹配「" + q.trim() + "」的头像。" : "暂无可用头像。"),
          h("div", { className: "esc-bar" },
            avSel ? h("div", { className: "pick" },
              h("img", { src: `${API}/avatar-img/${avSel.dir}/${avSel.file}`, alt: "" }),
              h("span", null, "已选 ", h("b", null, avSel.name), "（" + (GL[avSel.dir] || avSel.dir) + "）"),
            ) : (isSess && sessAv ? h("div", { className: "pick" },
              h("img", { src: `${API}/avatar-img/${sessAv.dir}/${sessAv.file}`, alt: "" }),
              h("span", null, "本对话头像 ", h("b", null, sessAv.name), "（" + (GL[sessAv.dir] || sessAv.dir) + "）"),
            ) : null),
            isSess
              ? h("button", { type: "button", className: "esc-apply", onClick: pickSessionAvatar, disabled: !avSel }, "设为本对话头像")
              : h("button", { type: "button", className: "esc-apply", onClick: pickAvatar, disabled: !avSel || busy }, "应用头像"),
            isSess ? h("button", { type: "button", className: "esc-mat-reset", onClick: resetSessionAvatar, disabled: !sessAv }, "恢复自动头像") : null,
            msg ? h("span", { className: "esc-msg" + (msg.bad ? " bad" : "") }, msg.t) : null,
          ),
        ));
      } else if (tab === "mt") {
        kids.push(h("div", { key: "panel-mt", id: "esc-panel-mt", role: "tabpanel", "aria-labelledby": "esc-tab-mt", className: "esc-panel" },
          h("p", { className: "esc-note" },
            "向左更透——壁纸从页面底下透进来；向右更实。拖动即时生效并自动记住，刷新后保持。材质为全局设置，对所有对话生效（仅本浏览器）。"),
          ...MAT_FIELDS.map((f) => h("div", { key: f.key, className: "esc-mat" },
            h("div", { className: "esc-mat-top" },
              h("label", { htmlFor: "esc-mat-" + f.key }, f.label),
              h("span", { className: "esc-mat-val" },
                f.unit ? mat[f.key] + f.unit : Math.round(mat[f.key] * 100) + "%"),
            ),
            h("input", {
              id: "esc-mat-" + f.key, type: "range",
              min: f.min, max: f.max, step: f.step, value: mat[f.key],
              onChange: (e) => dragMat(f, e.target.value),
            }),
            h("span", { className: "esc-mat-hint" }, f.hint),
          )),
          h("div", { className: "esc-bar" },
            h("button", { type: "button", className: "esc-mat-reset", onClick: resetMat }, "恢复默认材质"),
            msg ? h("span", { className: "esc-msg" + (msg.bad ? " bad" : "") }, msg.t) : null,
          ),
        ));
      }
      return h("div", { className: "esc" }, ...kids);
    }

    /* ── 敲敲联系人：身份绑定真实会话 ID，保留宿主标题、时间与操作 ── */
    const CONTACT_KEY = "zzz-session-contacts-v1";
    let contactRefresh = null;
    function startContacts() {
      let saved = Object.create(null);
      try {
        const data = JSON.parse(localStorage.getItem(CONTACT_KEY) || "{}");
        if (data && typeof data === "object" && !Array.isArray(data)) {
          for (const [id, file] of Object.entries(data)) {
            if (id.startsWith("session:") && typeof file === "string" && /^[\w.-]+\.webp$/.test(file)) saved[id] = file;
          }
        }
      } catch {}
      let poolSource = null, pool = [], timer = null, stopped = false, current = null;
      const hash = (s) => {
        let n = 2166136261;
        for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619);
        return n >>> 0;
      };
      // 会话头像统一走 {dir,file}：手动 override（三类素材均可）或旧自动 chat-icons 分配
      const avatarUrlOf = (a) => `${API}/avatar-img/${a.dir}/${encodeURIComponent(a.file)}`;
      const setAttr = (el, key, value) => { if (el.getAttribute(key) !== value) el.setAttribute(key, value); };
      const paint = (el, a) => {
        const value = `url("${avatarUrlOf(a)}")`;
        if (el.style.getPropertyValue("--zzz-contact-avatar") !== value) el.style.setProperty("--zzz-contact-avatar", value);
      };
      const refresh = () => {
        timer = null;
        if (stopped) return;
        if (poolSource !== AV.catalog) {
          poolSource = AV.catalog;
          pool = AV.catalog.filter((e) => e.dir === "chat-icons" && /^[\w.-]+\.webp$/.test(e.file)).map((e) => e.file).sort();
        }
        if (!pool.length) return;
        let dirty = false;
        const used = new Set(Object.values(saved));
        const choose = (id) => {
          if (pool.includes(saved[id])) return saved[id];
          const start = hash(id) % pool.length;
          let file = pool[start];
          for (let i = 0; i < pool.length; i++) {
            const candidate = pool[(start + i) % pool.length];
            if (!used.has(candidate)) { file = candidate; break; }
          }
          saved[id] = file; used.add(file); dirty = true;
          return file;
        };
        // 手动 override 优先（catalog 校验通过才认），否则回落旧自动分配；CONTACT_KEY 格式不变
        const resolveAvatar = (id) => {
          const ov = sessionAvatarOf(id);
          if (ov) return ov;
          return { dir: "chat-icons", file: choose(id) };
        };
        const rows = document.querySelectorAll('[role="treeitem"][data-row-key^="session:"]');
        let selected = null;
        for (const row of rows) {
          const id = row.getAttribute("data-row-key"), av = resolveAvatar(id);
          setAttr(row, "data-zzz-contact", id);
          paint(row, av);
          const leading = row.querySelector('[data-slot="sidebar.session.row.leading"]');
          if (leading && !leading.querySelector(".zzz-contact-face")) {
            const face = document.createElement("span");
            face.className = "zzz-contact-face"; face.setAttribute("aria-hidden", "true");
            leading.appendChild(face);
          }
          if (row.getAttribute("aria-selected") === "true") {
            const title = row.querySelector('[class*="_title"]');
            selected = { id, av, title: title ? title.textContent.trim() : "" };
          }
        }
        if (dirty) { try { localStorage.setItem(CONTACT_KEY, JSON.stringify(saved)); } catch {} }
        const header = document.querySelector('[data-slot="conversation.header"]');
        const nav = header && header.querySelector('nav[aria-label="会话层级"]');
        const title = nav && [...nav.childNodes].filter((el) => !el.classList?.contains("zzz-contact-head-face")).map((el) => el.textContent).join("").trim();
        if (selected && title && (title === selected.title || title.endsWith(selected.title))) current = selected;
        else if (!nav || !title || (current && !title.endsWith(current.title))) current = null;
        if (current) current = { ...current, av: resolveAvatar(current.id) };
        const center = document.querySelector('[data-pane="center"], [class*="_centerCol"]');
        if (current && nav && center) {
          setAttr(center, "data-zzz-contact", current.id);
          setAttr(center, "data-zzz-contact-name", current.title);
          paint(center, current.av);
          if (!nav.querySelector(".zzz-contact-head-face")) {
            const face = document.createElement("span");
            face.className = "zzz-contact-head-face"; face.setAttribute("aria-hidden", "true");
            nav.prepend(face);
          }
          setAttr(nav, "data-zzz-contact-header", "");
        } else {
          center?.removeAttribute("data-zzz-contact"); center?.removeAttribute("data-zzz-contact-name");
          center?.style.removeProperty("--zzz-contact-avatar");
          header?.querySelector(".zzz-contact-head-face")?.remove(); nav?.removeAttribute("data-zzz-contact-header");
        }
        // 当前联系人变化才广播 + 换有效壁纸（每 80ms 的 observer tick 只做比较，不重载媒体）
        const prevCur = CURRENT_CONTACT;
        const nextCur = current ? { id: current.id, title: current.title } : null;
        if (!!prevCur !== !!nextCur || (prevCur && nextCur && (prevCur.id !== nextCur.id || prevCur.title !== nextCur.title))) notifyContact(nextCur);
      };
      const schedule = () => { if (!stopped && timer === null) timer = setTimeout(refresh, 80); };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-selected", "data-row-key"] });
      contactRefresh = schedule;
      schedule();
      return () => {
        stopped = true; observer.disconnect(); clearTimeout(timer); contactRefresh = null;
        if (CURRENT_CONTACT) notifyContact(null); // 回全局壁纸 + 通知设置页
        document.querySelectorAll(".zzz-contact-face,.zzz-contact-head-face").forEach((el) => el.remove());
        document.querySelectorAll("[data-zzz-contact]").forEach((el) => {
          el.removeAttribute("data-zzz-contact"); el.removeAttribute("data-zzz-contact-name"); el.style.removeProperty("--zzz-contact-avatar");
        });
        document.querySelectorAll("[data-zzz-contact-header]").forEach((el) => el.removeAttribute("data-zzz-contact-header"));
      };
    }

    const inject = ["slots"];
    function apply(ctx) {
      ctx.effect(
        () => ctx.slots.inject("settings.section", () =>
          ctx.slots.register(
            { name: "settings.section", id: NS, order: 8, label: () => "ZZZ" },
            SkinCenterSection,
          ),
        ),
        "dsh-eridu-skincenter: settings section",
      );
      ctx.effect(startContacts, "ZZZ: session contacts");
    }

    /* ── 启动（背景层 + 档位跟随；换装 UI 已并入设置页，无独立入口） ── */
    (async () => {
      try {
        const r = await fetch(`${API}/list`);
        const j = await r.json();
        CATALOG = j.skins || [];
        ACTIVE = j.active || (CATALOG[0] && CATALOG[0].id) || null;
      } catch { CATALOG = []; }
      try {
        const r = await fetch(`${API}/avatar/list`);
        const j = await r.json();
        AV = { catalog: j.catalog || [], current: j.current || null };
      } catch {}
      if (ACTIVE) document.documentElement.setAttribute("data-dsh-skin", ACTIVE);
      // 启动恢复：先全局；联系人首轮扫描识别当前会话后自动切到其专属壁纸
      renderBackgroundEffective();
      watchTheme();
      contactRefresh?.();
    })();

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
