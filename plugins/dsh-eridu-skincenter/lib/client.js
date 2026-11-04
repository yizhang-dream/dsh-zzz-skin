// 新艾利都皮肤中心 · 客户端（2026-11-04 v1.4：生命周期收口——初始化/异步启动/清理全在 ctx.effect）
// 无框架部分：背景装饰层渲染（video+scrim，跟亮暗档；有效壁纸=会话专属>全局激活，仅条目变化才重建媒体）、
//   免重载换肤、界面材质（三滑块 → body CSS 变量，localStorage 持久，启用时注入、停用时还原）；
// 会话外观偏好（localStorage zzz-session-appearance-v1，仅当前浏览器）：按真实会话行 ID 存
//   手动头像（三类素材全部可用）与专属壁纸；敲敲联系人 choose 优先手动头像，否则走旧自动 CONTACT_KEY；
// 换装 UI 从「右缘入口签 + 全屏浮层」迁移为 settings.section（ctx.slots.register），
// React 组件由宿主 require 提供，照 dsh-backend-restart 的注册样板。
// 卸载约定：running 守卫切断所有异步回写；cleanup 撤 themeObs/bgLayer/自身 CSS、在用的与暂存的 skin link，
//   仅当 html 的 data-dsh-skin 是本插件管理过的 ID 才移除，并还原启用前的 body 材质变量。
window.__ModuleLoader__.load({
  id: "dsh-eridu-skincenter",
  factory: (require) => {
    // 宿主约定：factory 返回值会被当作插件模块校验（必须有 apply），
    // 不返回 → "invalid plugin ... received undefined"（副作用虽已跑，横幅仍会弹）。
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const { createElement: h, useCallback, useEffect, useMemo, useRef, useState } = React;

    const API = "/api/eridu-skins";
    const NS = "dsh-eridu-skincenter";
    const AC = "#cdf348", INK = "#14141a", PANEL = "#14151f", PANEL2 = "#0e0f18", LINE = "#2a2c3c";
    const GL = { "chat-icons": "聊天图标", avatars: "头像", portraits: "角色" };
    let CATALOG = [], ACTIVE = null, AV = { catalog: [], current: null };
    // 本插件见过/设置过的皮肤 ID：卸载时只撤自己管过的 html 属性
    const MANAGED_IDS = new Set();
    // running：启用期间才允许写 DOM / 回写状态；gen 防旧生命周期清理误伤新实例
    let running = false, lifecycleGen = 0, runtimeSignal = null, runtimeCleanup = null;

    /* ── 背景装饰层（video + scrim，跟 body 档位） ────── */
    let bgLayer = null, bgEntry = null, themeObs = null;
    function ensureLayer() {
      if (!running) return null;
      if (bgLayer && document.body.contains(bgLayer)) return bgLayer;
      bgLayer = document.createElement("div");
      bgLayer.setAttribute("data-dsh-skin-layer", "background");
      bgLayer.setAttribute("aria-hidden", "true");
      bgLayer.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;z-index:-2;pointer-events:none;overflow:hidden;";
      document.body.appendChild(bgLayer);
      return bgLayer;
    }
    function renderBackground(entry) {
      if (!running) return;
      bgEntry = entry;
      const layer = ensureLayer();
      if (!layer) return;
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
      if (!running || themeObs) return;
      themeObs = new MutationObserver(() => { if (running) renderBackground(bgEntry); });
      themeObs.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
    }

    /* ── 动态组件公共样式（独立 <link>，与皮肤 link / section.css 互不混用） ── */
    const COMPONENT_CSS_HREF = API + "/components.css";
    const COMPONENT_LINK_SEL = 'link[data-zzz-component-styles][href^="' + API + '/components.css"]';
    function componentLink() {
      return document.querySelector(COMPONENT_LINK_SEL);
    }
    // 首屏可能已由服务端注入；缺失时补一条。只查本 API 前缀 + 自家标记，不碰其他样式。
    function ensureComponentStyles() {
      if (!running || typeof document === "undefined" || !document.head) return null;
      const exists = componentLink();
      if (exists) return exists;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.setAttribute("data-zzz-component-styles", "");
      link.setAttribute("href", COMPONENT_CSS_HREF);
      document.head.appendChild(link);
      return link;
    }
    // 新建皮肤 link 只插到组件链之前，维持「皮肤 → 组件」层叠顺序；移动新节点不触发组件样式重载。
    function mountSkinLink(el) {
      const comp = componentLink();
      if (comp && comp.parentNode === document.head) document.head.insertBefore(el, comp);
      else document.head.appendChild(el);
    }

    /* ── 免重载换肤（新 link 暂存加载 → 就绪后原子切换） ──────────
       旧实现先改 href 再写 data-dsh-skin：旧 CSS 已被作用域排除、新 CSS 还没到，页面会闪一下裸样式。
       现在新 link 先以暂存标记并行加载，全部成功后在同一同步任务内晋升为在用 link、移除旧 link、
       切换 html 属性；失败只清理暂存，旧样式继续可用。停用、重新启用、新一轮换肤都会作废旧事务，
       晚到的请求不写 DOM。 */
    const SKIN_LINK_ATTR = "data-dsh-skin-link";
    const STAGING_ATTR = "data-zzz-skin-staging";
    const LINK_LOAD_TIMEOUT = 6000; // 无回应时按失败收口，不让 UI 一直等
    let linkTx = 0;          // 换肤事务号：新事务/停用递增，旧等待与旧结果据此作废
    let linkTxCancel = null; // 当前等待的唤醒函数（停用或新事务可立即结束旧等待）
    let skinCommits = 0;     // >0 表示有换肤事务占用链接切换，头像刷新不得取消它

    function liveSkinLinks(slot) {
      return Array.from(document.querySelectorAll(
        'link[' + SKIN_LINK_ATTR + '="' + slot + '"][href^="' + API + '/skin/"]',
      ));
    }
    function skinLinkId(el) {
      const h = el && el.getAttribute("href");
      if (!h || !h.startsWith(API + "/skin/")) return null;
      return h.slice((API + "/skin/").length).split("/")[0].split("?")[0];
    }
    // 作废当前事务：清掉未晋升的暂存 link，并立即唤醒等待者（卸载/新一轮换肤不让旧流程挂住）
    function cancelStagedLinks() {
      linkTx += 1;
      const cancel = linkTxCancel;
      linkTxCancel = null;
      document.querySelectorAll("link[" + STAGING_ATTR + "]").forEach((el) => el.remove());
      if (cancel) { try { cancel(); } catch {} }
    }
    function waitForCssLinks(links) {
      if (!links.length) return Promise.resolve(true);
      return new Promise((resolve) => {
        let left = links.length, failed = false, settled = false;
        const teardown = () => {
          links.forEach((l) => { l.removeEventListener("load", onLoad); l.removeEventListener("error", onError); });
          clearTimeout(timer);
          if (linkTxCancel === cancel) linkTxCancel = null;
        };
        const settle = (ok) => {
          if (settled) return;
          settled = true; teardown(); resolve(ok);
        };
        const step = () => { left -= 1; if (left <= 0) settle(!failed); };
        const onLoad = () => step();
        const onError = () => { failed = true; step(); };
        const cancel = () => settle(false);
        const timer = setTimeout(cancel, LINK_LOAD_TIMEOUT);
        linkTxCancel = cancel;
        links.forEach((l) => { l.addEventListener("load", onLoad); l.addEventListener("error", onError); });
      });
    }
    async function commitSkinLinks(id, opts) {
      if (!running || typeof document === "undefined" || !document.head) return false;
      const gen = lifecycleGen;
      const dropPatches = !!(opts && opts.dropPatches);
      const slots = opts && Array.isArray(opts.slots)
        ? opts.slots.slice()
        : (dropPatches ? ["stylesheet"] : ["stylesheet", "patches"]);
      const setAttribute = !opts || opts.attribute !== false;
      MANAGED_IDS.add(id);
      if (setAttribute) skinCommits += 1;
      try {
        cancelStagedLinks();
        const tx = linkTx;
        const href = (f) => `${API}/skin/${id}/${f}?t=${Date.now()}`;
        const previous = {};
        const staged = {};
        for (const slot of slots) previous[slot] = liveSkinLinks(slot);
        for (const slot of slots) {
          const el = document.createElement("link");
          el.rel = "stylesheet";
          el.setAttribute(STAGING_ATTR, slot);
          el.setAttribute("href", href(slot === "stylesheet" ? "stylesheet" : "patches"));
          mountSkinLink(el); // 仍插在组件链之前：皮肤 → components 顺序不变
          staged[slot] = el;
        }
        const ok = await waitForCssLinks(slots.map((slot) => staged[slot]));
        // 事务过期（停用/重新启用/新一轮换肤）：本轮结果一律不落地
        if (tx !== linkTx || !running || gen !== lifecycleGen) {
          Object.values(staged).forEach((el) => el.remove());
          return false;
        }
        if (!ok) {
          Object.values(staged).forEach((el) => el.remove());
          throw new Error("皮肤样式加载失败，已保留当前样式");
        }
        // 同一个同步任务内：晋升新 link → 撤旧 link →（换肤时）切作用域属性；浏览器只重算一次，不闪裸样式
        for (const slot of slots) {
          staged[slot].setAttribute(SKIN_LINK_ATTR, slot);
          staged[slot].removeAttribute(STAGING_ATTR);
        }
        for (const slot of slots) {
          for (const el of previous[slot]) if (el !== staged[slot]) el.remove();
        }
        if (dropPatches) liveSkinLinks("patches").forEach((el) => el.remove());
        if (setAttribute) document.documentElement.setAttribute("data-dsh-skin", id);
        return true;
      } finally {
        if (setAttribute) skinCommits -= 1;
      }
    }
    // 启动/重新启用：首屏已注入且 ID 一致就不重载，只补作用域属性；否则走同一原子切换
    async function ensureSkinLinks(id, hasPatches) {
      if (!running) return false;
      MANAGED_IDS.add(id);
      const sheet = liveSkinLinks("stylesheet");
      const pat = liveSkinLinks("patches");
      const matching = sheet.length === 1 && skinLinkId(sheet[0]) === id
        && (hasPatches ? pat.length === 1 && skinLinkId(pat[0]) === id : pat.length === 0);
      if (matching) {
        if (document.documentElement.getAttribute("data-dsh-skin") !== id) {
          document.documentElement.setAttribute("data-dsh-skin", id);
        }
        return true;
      }
      return commitSkinLinks(id, { attribute: true, dropPatches: !hasPatches });
    }
    let skinApplySeq = 0, avatarApplySeq = 0; // 用户操作序号：旧请求晚到只回执，不写 DOM
    let activePost = Promise.resolve();       // /active 写入串行化：后点的皮肤必定最后落库
    let skinPending = 0;                      // >0 表示换肤请求在途（POST 或链接事务）
    let pendingPatchRefresh = false;          // 换肤事务期间头像变了：事务结束后补拉最新 patches

    // live 层是否与某个皮肤完整一致：作用域属性 + 正在生效的 stylesheet/patches 都算
    function liveLayerMatches(id, hasPatches) {
      const sheet = liveSkinLinks("stylesheet");
      const pat = liveSkinLinks("patches");
      const attr = document.documentElement.getAttribute("data-dsh-skin") || null;
      return attr === id && sheet.length === 1 && skinLinkId(sheet[0]) === id
        && pat.length === (hasPatches ? 1 : 0)
        && (!hasPatches || skinLinkId(pat[0]) === id);
    }
    // 只为当前 ACTIVE 补拉 patch 链（头像版本戳）；live 层与 ACTIVE 不一致时不动，交给 ensureSkinLinks
    async function refreshPatchLayer() {
      if (!running || !ACTIVE) return false;
      if (document.documentElement.getAttribute("data-dsh-skin") !== ACTIVE) return false;
      const sheet = liveSkinLinks("stylesheet");
      if (sheet.length !== 1 || skinLinkId(sheet[0]) !== ACTIVE) return false;
      if (!liveSkinLinks("patches").length) return false;
      return commitSkinLinks(ACTIVE, { slots: ["patches"], attribute: false });
    }
    // 事务结束后补一次：不依赖换肤事务里已发出的旧 patch GET 会带上新头像戳
    async function flushPendingPatchRefresh() {
      if (!pendingPatchRefresh || skinPending > 0 || skinCommits > 0 || !running) return false;
      pendingPatchRefresh = false;
      try { return await refreshPatchLayer(); } catch { return false; }
    }
    async function applySkin(id) {
      const gen = lifecycleGen;
      const seq = ++skinApplySeq;
      const signal = runtimeSignal || undefined;
      skinPending += 1;
      try {
        const post = activePost.then(() => fetch(`${API}/active`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }), signal }));
        activePost = post.then(() => undefined, () => undefined);
        const r = await post;
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "失败");
        // 已卸载/已重新启用，或已有更新的换肤请求：只回执，不落地
        if (!running || gen !== lifecycleGen || seq !== skinApplySeq) return j;
        MANAGED_IDS.add(id);
        const committed = await commitSkinLinks(id, { attribute: true, dropPatches: !j.hasPatches });
        if (!committed || !running || gen !== lifecycleGen || seq !== skinApplySeq) return j;
        ACTIVE = id;
        // 全局换装仍尊重当前会话的专属壁纸：有效壁纸=会话 override > 全局 ACTIVE
        renderBackgroundEffective();
        return j;
      } finally {
        skinPending -= 1;
        // 本轮（无论成功、失败还是被接管）结束后补最头像戳；只在此处补，不再依赖已发出的旧 patch GET
        flushPendingPatchRefresh();
      }
    }
    async function applyAvatar(e) {
      const gen = lifecycleGen;
      const seq = ++avatarApplySeq;
      const r = await fetch(`${API}/avatar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(e), signal: runtimeSignal || undefined });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "失败");
      if (!running || gen !== lifecycleGen || seq !== avatarApplySeq) return j;
      AV.current = { dir: e.dir, file: e.file, name: e.name };
      // patches.css 带 avatar-agent.webp 版本戳。先确认 live 层与 ACTIVE 完整一致再动 patch 链：
      // 不一致（其他标签页换肤/此前样式加载失败）时先 ensureSkinLinks 补齐；补不齐就保留旧的完整
      // 补丁层并如实报样式错误，避免删掉在生效的旧 patches 却装上与 html 不匹配的新 ID。
      if (!ACTIVE) return j;
      // 换肤请求或链接事务在途：标记后由该轮事务结束时补最新头像戳
      if (skinPending > 0 || skinCommits > 0) { pendingPatchRefresh = true; return j; }
      const entry = CATALOG.find((s) => s.id === ACTIVE);
      if (!entry) return j; // 目录未就绪时不动现有层
      const hasPatches = !!entry.hasPatches;
      try {
        if (!liveLayerMatches(ACTIVE, hasPatches)) {
          const ok = await ensureSkinLinks(ACTIVE, hasPatches);
          if (!ok || !running || gen !== lifecycleGen || seq !== avatarApplySeq) return j;
          if (skinPending > 0 || skinCommits > 0) { pendingPatchRefresh = true; return j; }
        }
        if (hasPatches) await refreshPatchLayer();
      } catch (e) {
        throw new Error("头像已保存，但皮肤样式未同步：" + (e && e.message ? e.message : e));
      }
      return j;
    }

    /* ── 界面材质（v1.2：三滑块 → body 变量，直值无映射，localStorage 持久） ── */
    const MAT_KEY = "dsh-eridu-material-v1";
    const MAT_FIELDS = [
      { key: "panel", label: "面板不透明度", hint: "中间列 / 侧栏 / 右侧工作区 / 输入卡 / 对话框底色，向左更透、壁纸透进页面", min: 0.48, max: 0.9, step: 0.01, def: 0.66, css: "--zzz-panel-alpha" },
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
    // 启用前快照：cleanup 只还原这三个内联变量，不碰 localStorage 里保存的选择
    function matSnapshot() {
      if (typeof document === "undefined" || !document.body) return null;
      return MAT_FIELDS.map((f) => ({
        css: f.css,
        value: document.body.style.getPropertyValue(f.css),
        priority: document.body.style.getPropertyPriority(f.css),
      }));
    }
    function matRestore(snap) {
      if (!snap || typeof document === "undefined" || !document.body) return;
      for (const p of snap) {
        if (p.value) document.body.style.setProperty(p.css, p.value, p.priority);
        else document.body.style.removeProperty(p.css);
      }
    }
    let MATERIAL = matLoad();

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
      if (!running) return;
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
      ".esc{--esc-accent:var(--zzz-accent,#cdf348);--esc-accent-text:var(--zzz-accent,#cdf348);--esc-ink:#14141a;--esc-panel:#14151f;--esc-panel-2:#0e0f18;--esc-line:#2a2c3c;--esc-line-strong:rgba(128,132,160,.55);--esc-label:#e8e9f0;--esc-label-2:#a9abbd;--esc-label-3:#808090;--esc-shot-dim:#c7c9da;--esc-shadow:rgba(0,0,0,.45);--esc-shadow-hover:rgba(0,0,0,.55);--esc-error:#ff7a90;max-width:900px;container-type:inline-size;display:flex;flex-direction:column;gap:14px;min-width:0;color:var(--esc-label)}",
      "body:not([data-ds-dark-theme]) .esc{--esc-accent-text:#4f7000;--esc-panel:#fbf9f4;--esc-panel-2:#f4f1e9;--esc-line:rgba(26,26,30,.22);--esc-line-strong:rgba(26,26,30,.4);--esc-label:#1a1a1e;--esc-label-2:#5c5c66;--esc-label-3:#65656f;--esc-shot-dim:#d8d5cc;--esc-shadow:rgba(26,24,20,.16);--esc-shadow-hover:rgba(26,24,20,.22);--esc-error:#b81c22}",
      /* :where(…) 零特异性兜底：宿主全局 button/img/input 规则不再渗进卡片与按钮；
         类名 esc- 前缀自隔离，本段也不外泄。所有 button 可靠 box-sizing/min-width。 */
      ".esc,.esc *{box-sizing:border-box;min-width:0}",
      ".esc :where(button){font:inherit;color:inherit;margin:0;padding:0;border:none;background:none;appearance:none;-webkit-appearance:none}",
      ".esc :where(button):disabled{cursor:not-allowed}",
      ".esc :where(img,video){display:block;max-width:100%}",
      ".esc :where(button,input):focus-visible{outline:2px solid var(--esc-accent);outline-offset:2px}",
      "@media (prefers-reduced-motion:reduce){.esc :where(*){transition:none!important}}",
      ".esc-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:1px 2px 0}",
      ".esc-head .mono{font:600 10px/1 ui-monospace,Consolas,monospace;color:var(--esc-accent-text);letter-spacing:.2em}",
      ".esc-head h2{margin:0;font-size:18px;font-weight:800;letter-spacing:.08em;color:var(--esc-label)}",
      ".esc-head .cur{margin-left:auto;font-size:11.5px;color:var(--esc-label-3);line-height:1.5}",
      ".esc-head .cur b{color:var(--esc-accent-text);font-weight:700}",
      /* 设置对象：胶囊 radiogroup；当前对话无会话时禁用并提示 */
      ".esc-scope{display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
      ".esc-scope-key{font:600 10px/1 ui-monospace,Consolas,monospace;color:var(--esc-label-3);letter-spacing:.2em;flex-shrink:0;margin-right:2px}",
      ".esc-radio{cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;border:1px solid var(--esc-line);background:var(--esc-panel);color:var(--esc-label-2);border-radius:999px;padding:4px 12px;font-family:inherit;font-weight:700;font-size:11.5px;line-height:1.5;letter-spacing:.04em;white-space:nowrap}",
      ".esc-radio:hover:not(:disabled){color:var(--esc-label);border-color:var(--esc-line-strong)}",
      ".esc-radio.on{background:var(--esc-accent);border-color:var(--esc-accent);color:var(--esc-ink)}",
      ".esc-radio:disabled{opacity:.55}",
      ".esc-scope .esc-scope-name{font-weight:500;min-width:0;max-width:min(40vw,300px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".esc-scope .esc-scope-name.dim{color:var(--esc-label-3);font-weight:400}",
      ".esc-radio.on .esc-scope-name{font-weight:700;color:inherit}",
      ".esc-scope-note{margin-left:auto;font-size:11px;color:var(--esc-label-3);line-height:1.5}",
      ".esc-tabs{display:flex;gap:6px;flex-wrap:wrap}",
      ".esc-tab{cursor:pointer;min-width:0;border:1px solid var(--esc-line);background:var(--esc-panel);color:var(--esc-label-2);border-radius:999px;padding:5px 16px;font-weight:700;font-size:12px;letter-spacing:.08em;white-space:nowrap}",
      ".esc-tab:hover:not(:disabled){color:var(--esc-label);border-color:var(--esc-line-strong)}",
      ".esc-tab.on{background:var(--esc-accent);border-color:var(--esc-accent);color:var(--esc-ink)}",
      ".esc-tab:disabled{opacity:.55}",
      ".esc-panel{display:flex;flex-direction:column;gap:12px;min-width:0}",
      /* 装备页：宽容器资源在左、详情在右；窄容器详情在上、资源在下，均按 .esc 自身宽度判断 */
      ".esc-workbench{display:flex;flex-direction:column;gap:12px;min-width:0}",
      ".esc-detail{order:-1;min-width:0;border:1px solid var(--esc-line);background:var(--esc-panel);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px;box-shadow:0 10px 26px -20px var(--esc-shadow)}",
      "@container (min-width:520px){.esc-workbench{display:grid;grid-template-columns:minmax(240px,1fr) minmax(220px,.85fr);gap:12px;align-items:start}.esc-detail{order:0;position:sticky;top:0}}",
      ".esc-inventory{min-width:0;border:1px solid var(--esc-line);background:var(--esc-panel);border-radius:16px;padding:11px;display:flex;flex-direction:column;gap:9px}",
      ".esc-inv-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}",
      ".esc-inv-head strong{font-size:12px;font-weight:800;letter-spacing:.08em;color:var(--esc-label)}",
      ".esc-inv-head span{font-size:10.5px;color:var(--esc-label-3)}",
      ".esc-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".esc-search{background:var(--esc-panel-2);border:1px solid var(--esc-line);color:var(--esc-label);border-radius:999px;padding:6px 12px;width:100%;outline:none;font-size:12.5px}",
      ".esc-search::placeholder{color:var(--esc-label-3)}",
      ".esc-search:focus{border-color:var(--esc-accent)}",
      ".esc-filters{display:flex;flex-wrap:wrap;gap:5px}",
      ".esc-chip{cursor:pointer;border:1px solid var(--esc-line);background:transparent;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;color:var(--esc-label-2);line-height:1.5;white-space:nowrap}",
      ".esc-chip:hover:not(:disabled){border-color:var(--esc-line-strong);color:var(--esc-label)}",
      ".esc-chip.on{background:var(--esc-accent);color:var(--esc-ink);border-color:var(--esc-accent)}",
      ".esc-chip:disabled{opacity:.55}",
      ".esc-key{font-size:10.5px;color:var(--esc-label-3);letter-spacing:.18em;margin:5px 0 1px}",
      /* 背景资源：紧凑 16:9 静态缩略图，绝不渲染 hover 并发视频 */
      ".esc-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(122px,100%),1fr));gap:8px}",
      ".esc-tiles.av{grid-template-columns:repeat(auto-fill,minmax(min(74px,100%),1fr));gap:5px}",
      ".esc-tile{position:relative;display:block;width:100%;padding:0;cursor:pointer;text-align:left;border:1.5px solid var(--esc-line);border-radius:10px;background:var(--esc-panel-2);overflow:hidden;transition:border-color .12s,box-shadow .12s}",
      ".esc-tile:hover:not(:disabled){border-color:var(--esc-line-strong)}",
      ".esc-tile.sel{border-color:var(--esc-accent);box-shadow:0 0 0 2px var(--esc-accent)}",
      ".esc-tile.inuse{border-color:var(--esc-line-strong)}",
      ".esc-tile.sel.inuse{border-color:var(--esc-accent)}",
      ".esc-tile:disabled{opacity:.45}",
      ".esc-tile .thumb{position:relative;display:block;aspect-ratio:16/9;overflow:hidden;background:var(--esc-panel-2)}",
      ".esc-tile .thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}",
      ".esc-tile .ph{position:absolute;inset:0;background:radial-gradient(120% 120% at 18% 0%,var(--esc-panel) 0%,var(--esc-panel-2) 68%,var(--esc-line) 100%)}",
      ".esc-tile .ph::before{content:\"\";position:absolute;inset:0;background-image:linear-gradient(var(--esc-line) 1px,transparent 1px),linear-gradient(90deg,var(--esc-line) 1px,transparent 1px);background-size:20px 20px;opacity:.14}",
      ".esc-tile .ph::after{content:\"\";position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border:2px solid var(--esc-line-strong);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);opacity:.4}",
      ".esc-tile .nm{display:block;padding:5px 8px 1px;font-size:11.5px;font-weight:800;color:var(--esc-label);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".esc-tile .meta{display:flex;justify-content:space-between;gap:6px;padding:0 8px 6px;font-size:9.5px;color:var(--esc-label-3)}",
      ".esc-tile .meta .live{color:var(--esc-accent-text);font-weight:700;flex-shrink:0}",
      ".esc-badge{position:absolute;top:5px;left:5px;z-index:2;background:var(--esc-accent);color:var(--esc-ink);border-radius:999px;padding:1px 7px;font-size:9px;font-weight:900;letter-spacing:.04em}",
      ".esc-badge.draft{left:auto;right:5px;background:var(--esc-panel);color:var(--esc-accent-text);border:1px solid var(--esc-accent)}",
      /* 头像资源：紧凑单元格；当前使用项只加角标，选中项走黄绿轮廓 */
      ".esc-av-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 3px 5px;cursor:pointer;border:1.5px solid transparent;border-radius:10px;background:transparent;transition:border-color .12s,background .12s}",
      ".esc-av-tile img{width:52px;height:52px;object-fit:contain;margin:0 auto;filter:drop-shadow(0 2px 5px var(--esc-shadow))}",
      ".esc-av-tile span{display:block;width:100%;font-size:10.5px;line-height:1.3;text-align:center;color:var(--esc-label-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".esc-av-tile:hover:not(:disabled){background:var(--esc-panel-2)}",
      ".esc-av-tile.sel{border-color:var(--esc-accent);background:var(--esc-panel-2)}",
      ".esc-av-tile.inuse::after{content:\"\";position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;background:var(--esc-accent);box-shadow:0 0 0 2px var(--esc-panel)}",
      ".esc-av-tile:disabled{opacity:.45}",
      /* 详情：大预览 + 强标题 + 分隔事实区 + 底部显式应用 */
      ".esc-detail .kicker{font:600 9.5px/1.4 ui-monospace,Consolas,monospace;color:var(--esc-label-3);letter-spacing:.16em;text-transform:uppercase}",
      ".esc-detail h3{margin:2px 0 0;font-size:15.5px;font-weight:800;letter-spacing:.01em;line-height:1.3;overflow-wrap:anywhere;color:var(--esc-label)}",
      ".esc-preview{position:relative;border:1px solid var(--esc-line);border-radius:10px;overflow:hidden;background:var(--esc-panel-2)}",
      ".esc-preview img,.esc-preview video{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#000}",
      ".esc-preview .ph{position:relative;aspect-ratio:16/9;display:grid;place-items:center;background:radial-gradient(120% 120% at 18% 0%,var(--esc-panel) 0%,var(--esc-panel-2) 68%,var(--esc-line) 100%)}",
      ".esc-preview .ph::before{content:\"\";position:absolute;inset:0;background-image:linear-gradient(var(--esc-line) 1px,transparent 1px),linear-gradient(90deg,var(--esc-line) 1px,transparent 1px);background-size:22px 22px;opacity:.14}",
      ".esc-preview .ph span{position:relative;z-index:1;font-size:10.5px;color:var(--esc-label-3);letter-spacing:.06em;text-align:center;padding:0 10px}",
      ".esc-av-big{width:100px;height:100px;margin:0 auto;object-fit:contain;filter:drop-shadow(0 6px 16px var(--esc-shadow))}",
      ".esc-av-ph{width:100px;height:100px;margin:0 auto;border:1px dashed var(--esc-line-strong);border-radius:16px;display:grid;place-items:center;font-size:11px;color:var(--esc-label-3)}",
      ".esc-facts{display:flex;flex-direction:column;gap:5px;border-top:1px solid var(--esc-line);padding-top:9px;font-size:11px}",
      ".esc-fact{display:flex;justify-content:space-between;align-items:baseline;gap:10px}",
      ".esc-fact span:first-child{color:var(--esc-label-3);flex-shrink:0}",
      ".esc-fact span:last-child{text-align:right;color:var(--esc-label);overflow-wrap:anywhere}",
      ".esc-actions{display:flex;flex-direction:column;gap:7px;border-top:1px solid var(--esc-line);padding-top:10px}",
      ".esc-apply{background:var(--esc-accent);color:var(--esc-ink);border:none;border-radius:10px;font-family:inherit;font-weight:800;font-size:13px;line-height:1;padding:10px 14px;width:100%;cursor:pointer;letter-spacing:.04em}",
      ".esc-apply:disabled{opacity:.45;cursor:not-allowed}",
      ".esc-ghost{background:transparent;border:1px solid var(--esc-line-strong);color:var(--esc-label);border-radius:10px;padding:8px 12px;width:100%;font-family:inherit;font-weight:700;font-size:11.5px;line-height:1.2;letter-spacing:.04em;cursor:pointer}",
      ".esc-ghost:hover:not(:disabled){border-color:var(--esc-accent);color:var(--esc-accent-text)}",
      ".esc-ghost:disabled{opacity:.45}",
      ".esc-note{margin:0;font-size:12px;line-height:1.65;color:var(--esc-label-3)}",
      ".esc-loading{font-size:13px;color:var(--esc-label-2);padding:4px 0}",
      ".esc-reload{display:flex;align-items:center;gap:12px;flex-wrap:wrap}",
      ".esc-msg{font-size:11.5px;line-height:1.5;color:var(--esc-accent-text);min-width:0;max-width:100%;word-break:break-word}",
      ".esc-msg.bad{color:var(--esc-error)}",
      /* 界面材质：平铺行，即时生效；不造假聊天预览 */
      ".esc-mat{display:flex;flex-direction:column;gap:7px;max-width:620px;min-width:0}",
      ".esc-mat .esc-mat-top{display:flex;align-items:baseline;justify-content:space-between;gap:14px}",
      ".esc-mat .esc-mat-top label{font-size:13px;font-weight:700;letter-spacing:.04em;color:var(--esc-label)}",
      ".esc-mat .esc-mat-val{font:600 12px/1 ui-monospace,Consolas,monospace;color:var(--esc-label-2)}",
      ".esc-mat input[type=range]{width:100%;max-width:100%;margin:0;cursor:pointer;accent-color:var(--esc-accent)}",
      ".esc-mat .esc-mat-hint{font-size:11.5px;line-height:1.6;color:var(--esc-label-3)}",
      ".esc-mat-reset{background:transparent;border:1px solid var(--esc-line-strong);color:var(--esc-label);border-radius:10px;padding:8px 16px;font-family:inherit;font-weight:700;font-size:12px;line-height:1.2;letter-spacing:.06em;cursor:pointer}",
      ".esc-mat-reset:hover:not(:disabled){border-color:var(--esc-accent);color:var(--esc-accent-text)}",
      ".esc-mat-reset:disabled{opacity:.55}",
      /* 旧皮肤的 html[data-dsh-skin] button 胶囊规则不能覆盖资源卡与详情按钮。 */
      ".esc .esc-tile.esc-tile,.esc .esc-av-tile.esc-av-tile,.esc .esc-apply.esc-apply,.esc .esc-ghost.esc-ghost,.esc .esc-mat-reset.esc-mat-reset{border-radius:10px;font-style:normal}",
      /* 仅在显示 ZZZ 时重排宿主导航，避免手机正文被固定左栏挤成约 100px。 */
      "@media(max-width:600px){body [role=dialog]:has(.esc){flex-direction:column!important}body [role=dialog]:has(.esc)>nav{width:100%!important;flex:0 0 auto!important;padding:12px 12px 8px!important;gap:8px!important;border-right:0!important}body [role=dialog]:has(.esc)>nav [class*=_navList]{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;overflow-x:auto!important;max-width:100%;gap:4px!important;padding:2px}body [role=dialog]:has(.esc)>nav [class*=_navList]>button{flex:0 0 auto!important;white-space:nowrap!important;max-width:none!important;padding:6px 10px!important}body [role=dialog]:has(.esc)>[class*=_content]{width:100%!important;min-height:0;flex:1 1 auto!important}body [role=dialog]:has(.esc) [class*=_header]{padding:8px 12px!important}body [role=dialog]:has(.esc) [class*=_options]{padding:0 12px 16px!important}}",
    ].join("");
    function useStyleOnce() {
      useEffect(() => {
        if (!running || typeof document === "undefined") return;
        if (!document.getElementById(CSS_TAG)) {
          const el = document.createElement("style");
          el.id = CSS_TAG;
          el.textContent = CSS;
          document.head.appendChild(el);
        }
      }, []);
    }

    function previewSrcOf(skin) {
      if (!skin || !skin.preview) return "";
      const p = skin.preview;
      if (typeof p === "string") return p;
      if (p && typeof p === "object") {
        for (const k of ["dark", "light"]) if (typeof p[k] === "string" && p[k]) return p[k];
      }
      return "";
    }
    // 明暗档真实媒体：light/dark 各自取 type/src；缺档或空 src 一律视为无媒体
    function bgSpecOf(entry, dark) {
      const bm = entry && entry.backgroundMedia;
      if (!bm || typeof bm !== "object") return null;
      const spec = bm[dark ? "dark" : "light"];
      if (!spec || typeof spec.src !== "string" || !spec.src) return null;
      return spec;
    }
    function sameAv(a, b) {
      return !!(a && b && a.dir === b.dir && a.file === b.file);
    }

    function SkinCenterSection() {
      useStyleOnce();
      const TABS = [["bg", "背景"], ["av", "代理人头像"], ["mt", "界面材质"]];
      const [tab, setTab] = useState("bg");
      const [scope, setScope] = useState(() => CURRENT_CONTACT ? "session" : "global"); // 设置对象：session=当前对话 / global=全局默认
      const [contact, setContact] = useState(CURRENT_CONTACT);
      const [active, setActive] = useState(ACTIVE);
      const [catalog, setCatalog] = useState(CATALOG);
      const [av, setAv] = useState(AV);
      const [bgSel, setBgSel] = useState(null); // 背景草稿：只改浏览项，不碰 ACTIVE/DOM/SESH/网络
      const [avSel, setAvSel] = useState(null); // 头像草稿
      const [avGroup, setAvGroup] = useState("all");
      const [q, setQ] = useState("");
      const [msg, setMsg] = useState(null);
      const [busy, setBusy] = useState(false);
      const [loading, setLoading] = useState(true);
      const [loadErr, setLoadErr] = useState(null);
      const [mat, setMat] = useState(MATERIAL);
      const [dark, setDark] = useState(() => typeof document !== "undefined" && document.body ? document.body.hasAttribute("data-ds-dark-theme") : false);

      const contactId = contact ? contact.id : null;
      const liveToken = scope + "|" + (contactId || "");
      const liveRef = useRef("");
      const detailRef = useRef(null);
      // 每次渲染同步刷新：异步回执只认发起时的 scope+contact，绝不写入切换后的新对象
      liveRef.current = liveToken;

      // 跟随敲敲当前联系人（切换会话即更新）；会话没了自动回到全局档
      useEffect(() => {
        setContact(CURRENT_CONTACT);
        return onContactChange(setContact);
      }, []);
      useEffect(() => { if (scope === "session" && !contact) setScope("global"); }, [scope, contact]);
      // scope 或真实 contact id 变化：所有草稿与提示作废，避免把旧对象的选择写到新对象
      useEffect(() => { setBgSel(null); setAvSel(null); setMsg(null); }, [contactId, scope]);
      // 窄窗选择资源后回到详情，避免从长头像列表手动滚回顶部寻找应用按钮。
      useEffect(() => {
        const selected = tab === "bg" ? bgSel : tab === "av" ? avSel : null;
        const detail = detailRef.current;
        if (!selected || !detail) return;
        const root = detail.closest(".esc");
        if (root && root.getBoundingClientRect().width < 520) {
          detail.scrollIntoView({ block: "start", behavior: "instant" });
          detail.focus({ preventScroll: true });
        }
      }, [tab, bgSel, avSel]);

      // 详情预览跟随宿主明暗档；观察器只在组件存活期间存在
      useEffect(() => {
        if (typeof document === "undefined" || !document.body) return;
        const read = () => setDark(document.body.hasAttribute("data-ds-dark-theme"));
        read();
        const mo = new MutationObserver(read);
        mo.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
        return () => mo.disconnect();
      }, []);

      // refresh 不再吞异常：两列表分开兜底，HTTP 状态与解析失败都浮出到界面，可重试
      const refresh = useCallback(async () => {
        if (!running) return;
        setLoading(true); setLoadErr(null);
        const errs = [];
        const signal = runtimeSignal || undefined;
        try {
          const r = await fetch(`${API}/list`, { cache: "no-store", signal });
          if (!running) return;
          if (!r.ok) throw new Error("HTTP " + r.status);
          const j = await r.json();
          if (!running) return;
          CATALOG = Array.isArray(j.skins) ? j.skins : [];
          for (const s of CATALOG) if (s && typeof s.id === "string") MANAGED_IDS.add(s.id);
          // active 必须在当前目录里：指向已下架条目时显示真实空态，不回退到不存在的 ID
          const wantId = j.active && CATALOG.some((s) => s.id === j.active) ? j.active : null;
          // 服务端 active 变了（其他标签页换肤）或 live 层与它不一致（此前样式加载失败）时，
          // 先把样式层切到该皮肤并确认成功，再更新 ACTIVE；切不齐就保留现有 ACTIVE 与实际样式，
          // 并把样式错误如实显示出来，避免 ACTIVE 与 html/link 脱节后误删在生效的补丁层。
          const wantEntry = wantId ? CATALOG.find((s) => s.id === wantId) : null;
          const wantPatches = !!(wantEntry && wantEntry.hasPatches);
          const needsSync = !!wantId && skinCommits === 0 && skinPending === 0
            && (wantId !== ACTIVE || !liveLayerMatches(wantId, wantPatches));
          if (needsSync) {
            try {
              const ok = await ensureSkinLinks(wantId, wantPatches);
              if (!running) return;
              // 失败可能是被本页换肤事务接管：那种情况不报样式错误
              if (ok) {
                ACTIVE = wantId;
                // 同步就绪后排掉等待中的头像补拉；flush 自身只在无在途请求/事务时执行
                flushPendingPatchRefresh();
              } else if (skinCommits === 0 && skinPending === 0) errs.push("皮肤样式未就绪，已保留当前样式");
            } catch (e) {
              if (skinCommits === 0 && skinPending === 0) {
                errs.push("皮肤样式同步失败（" + (e && e.message ? e.message : e) + "），已保留当前样式");
              }
            }
          } else if (!wantId) {
            ACTIVE = null;
          }
        } catch (e) { if (running) errs.push("背景列表加载失败（" + (e && e.message ? e.message : e) + "）"); }
        try {
          const r = await fetch(`${API}/avatar/list`, { cache: "no-store", signal });
          if (!running) return;
          if (!r.ok) throw new Error("HTTP " + r.status);
          const j = await r.json();
          if (!running) return;
          AV = { catalog: Array.isArray(j.catalog) ? j.catalog : [], current: j.current || null };
        } catch (e) { if (running) errs.push("头像列表加载失败（" + (e && e.message ? e.message : e) + "）"); }
        if (!running) return;
        setActive(ACTIVE); setCatalog([...CATALOG]); setAv({ catalog: [...AV.catalog], current: AV.current });
        renderBackgroundEffective();
        if (errs.length) setLoadErr(errs.join("；"));
        setLoading(false);
      }, []);
      useEffect(() => { refresh(); }, [refresh]);

      const cur = catalog.find((s) => s.id === active) || null;
      const isSess = scope === "session" && !!contact;
      const sessWpEntry = isSess ? sessionWallpaperOf(contact.id) : null;
      const sessAv = isSess ? sessionAvatarOf(contact.id) : null;
      // 当前会话未手动设置时的真实自动头像（chat-icons 分配或会话 override），不是全局默认
      // 自动分配只带 dir/file，回目录取真实名称，详情不出现 undefined
      const autoAvRaw = isSess && contact && contact.av ? contact.av : null;
      const autoAv = autoAvRaw
        ? (av.catalog.find((e) => sameAv(e, autoAvRaw)) || { dir: autoAvRaw.dir, file: autoAvRaw.file, name: autoAvRaw.name || autoAvRaw.file })
        : null;
      const appliedAv = isSess ? (sessAv || autoAv) : (av.current || null);
      const globalBgEntry = cur;
      const bgEffective = isSess ? (sessWpEntry || globalBgEntry) : globalBgEntry;
      const bgView = bgSel || bgEffective;
      const bgStored = isSess ? sessWpEntry : globalBgEntry;
      const bgIsApplied = !!(bgView && bgStored && bgView.id === bgStored.id);
      const bgSessUsable = !isSess || !!(bgSel && bgSel.backgroundMedia);
      const bgActionDisabled = busy || !bgSel || bgIsApplied || !bgSessUsable;
      const avView = avSel || appliedAv;
      const avIsApplied = sameAv(avView, isSess ? sessAv : av.current);
      const avActionDisabled = busy || !avSel || avIsApplied;
      const say = (t, bad) => { setMsg({ t, bad }); };

      const avCounts = useMemo(() => {
        const c = { all: av.catalog.length, avatars: 0, "chat-icons": 0, portraits: 0 };
        for (const e of av.catalog) if (c[e.dir] !== undefined) c[e.dir]++;
        return c;
      }, [av.catalog]);
      const groups = useMemo(() => {
        const g = { avatars: [], "chat-icons": [], portraits: [] };
        const s = q.trim();
        for (const e of av.catalog) {
          if (avGroup !== "all" && e.dir !== avGroup) continue;
          if (s && !e.name.includes(s)) continue;
          (g[e.dir] || (g[e.dir] = [])).push(e);
        }
        return g;
      }, [av, avGroup, q]);

      const pickSkin = async (id, name) => {
        const token = liveRef.current;
        setBusy(true); setMsg(null);
        try {
          await applySkin(id);
          if (!running) return;
          setActive(id); setBgSel(null);
          if (liveRef.current === token) {
            const wp = sessionWallpaperOf(CURRENT_CONTACT && CURRENT_CONTACT.id);
            say(wp ? "✓ 已换上 " + name + "（当前对话仍使用其专属壁纸）" : "✓ 已换上 " + name);
          }
        } catch (e) {
          if (liveRef.current === token) say("✗ " + e.message, true);
        } finally {
          setBusy(false);
        }
      };
      const pickAvatar = async () => {
        if (!avSel) return;
        const sel = avSel, token = liveRef.current;
        setBusy(true); say("应用中…");
        try {
          await applyAvatar(sel);
          if (!running) return;
          await refresh();
          if (!running) return;
          if (liveRef.current === token) { say("✓ 头像已换上 " + sel.name); setAvSel(null); }
        } catch (e) {
          if (liveRef.current === token) say("✗ " + e.message, true);
        } finally {
          setBusy(false);
        }
      };
      // 显式应用背景：全局走原 pickSkin/applySkin；当前会话只写本浏览器覆盖，不 POST、不换 CSS
      const applyBackground = () => {
        if (!bgSel || busy || bgIsApplied) return;
        if (!isSess) { pickSkin(bgSel.id, bgSel.name); return; }
        if (!bgSel.backgroundMedia) { say("✗ 该主题没有背景媒体，不能作为当前对话壁纸。", true); return; }
        const rec = seshRec(contact.id, true);
        if (!rec) return;
        rec.wallpaper = bgSel.id;
        if (!saveSessionPrefs(contact.id)) { say("无法保存到本浏览器，请检查存储权限。", true); return; }
        renderBackgroundEffective();
        setBgSel(null);
        say("✓ 已为「" + (contact.title || contact.id) + "」设置壁纸 " + bgSel.name + "（仅保存在本浏览器）");
      };
      const resetSessionWallpaper = () => {
        if (!isSess || busy) return;
        const rec = seshRec(contact.id, false);
        if (!rec || !rec.wallpaper) return;
        delete rec.wallpaper;
        if (!rec.avatar) delete SESH[contact.id];
        if (!saveSessionPrefs(contact.id)) { say("无法保存到本浏览器，请检查存储权限。", true); return; }
        renderBackgroundEffective();
        setBgSel(null);
        say("✓ 「" + (contact.title || contact.id) + "」已恢复使用全局壁纸");
      };
      const pickSessionAvatar = () => {
        if (!isSess || !avSel || busy || avIsApplied) return;
        const rec = seshRec(contact.id, true);
        if (!rec) return;
        rec.avatar = { dir: avSel.dir, file: avSel.file, name: avSel.name };
        if (!saveSessionPrefs(contact.id)) { say("无法保存到本浏览器，请检查存储权限。", true); return; }
        if (contactRefresh) contactRefresh();
        say("✓ 已为「" + (contact.title || contact.id) + "」设置头像 " + avSel.name + "（仅保存在本浏览器）");
        setAvSel(null);
      };
      const resetSessionAvatar = () => {
        if (!isSess || busy) return;
        const rec = seshRec(contact.id, false);
        if (!rec || !rec.avatar) return;
        delete rec.avatar;
        if (!rec.wallpaper) delete SESH[contact.id];
        if (!saveSessionPrefs(contact.id)) { say("无法保存到本浏览器，请检查存储权限。", true); return; }
        if (contactRefresh) contactRefresh();
        setAvSel(null);
        say("✓ 「" + (contact.title || contact.id) + "」已恢复自动分配头像");
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

      // tab 可访问性：roving tabindex + 方向键/Home/End 循环；异步应用期间锁定
      const onTabKey = (e) => {
        if (busy) return;
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
      // 设置对象可访问性：radiogroup 左右键/Home/End；busy 时锁定
      const onScopeKey = (e) => {
        if (busy) return;
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
            ? ["当前对话 ", h("b", null, contact.title || contact.id), " · 背景 ", h("b", null, sessWpEntry ? sessWpEntry.name : (globalBgEntry ? globalBgEntry.name : "宿主默认"))]
            : ["当前使用 ", h("b", null, globalBgEntry ? globalBgEntry.name : (active || "宿主默认"))],
          ),
        ),
        h("div", { className: "esc-scope", role: "radiogroup", "aria-label": "设置对象", onKeyDown: onScopeKey },
          h("span", { className: "esc-scope-key" }, "设置对象"),
          h("button", {
            type: "button", id: "esc-scope-session", role: "radio",
            className: "esc-radio" + (scope === "session" ? " on" : ""),
            "aria-checked": scope === "session" ? "true" : "false",
            tabIndex: scope === "session" ? 0 : -1,
            disabled: busy || !contact,
            title: contact ? "只为当前对话设置壁纸与头像" : "先在敲敲中打开一个对话，再回来为它单独设置",
            onClick: () => { if (!busy && contact) setScope("session"); },
          }, "当前对话", contact
            ? h("span", { className: "esc-scope-name" }, contact.title || contact.id)
            : h("span", { className: "esc-scope-name dim" }, "先打开一个对话")),
          h("button", {
            type: "button", id: "esc-scope-global", role: "radio",
            className: "esc-radio" + (scope === "global" ? " on" : ""),
            "aria-checked": scope === "global" ? "true" : "false",
            tabIndex: scope === "global" ? 0 : -1,
            disabled: busy,
            onClick: () => { if (!busy) setScope("global"); },
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
            disabled: busy,
            onClick: () => { if (!busy) setTab(id); },
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
        const spec = bgSpecOf(bgView, dark);
        const viewedNoMedia = !bgView || !bgView.backgroundMedia;
        kids.push(h("div", { key: "panel-bg", id: "esc-panel-bg", role: "tabpanel", "aria-labelledby": "esc-tab-bg", className: "esc-panel" },
          isSess ? h("p", { className: "esc-note" },
            "为「", h("b", null, contact.title || contact.id), "」选择专属壁纸：只更换本对话的背景画面，不改全局皮肤与样式；设置保存在本浏览器，不跨设备同步。") : null,
          h("div", { className: "esc-workbench" },
            h("div", { className: "esc-inventory" },
              h("div", { className: "esc-inv-head" },
                h("strong", null, "背景资源"),
                h("span", null, catalog.length + " 项"),
              ),
              catalog.length ? h("div", { className: "esc-tiles" },
                catalog.map((s) => {
                  const base = `${API}/skin/${s.id}/assets`;
                  const poster = previewSrcOf(s);
                  const hasMedia = !!s.backgroundMedia;
                  const sel = !!(bgSel && bgSel.id === s.id);
                  const inuse = !!(bgEffective && bgEffective.id === s.id);
                  const pressed = !!(bgView && bgView.id === s.id);
                  const sSpec = bgSpecOf(s, dark);
                  return h("button", {
                    key: s.id, type: "button",
                    className: "esc-tile" + (sel ? " sel" : "") + (inuse ? " inuse" : ""),
                    "aria-pressed": pressed ? "true" : "false",
                    "aria-label": s.name + (inuse ? "，使用中" : "") + (sel && !bgIsApplied ? "，待应用" : ""),
                    onClick: () => { if (!busy) setBgSel(s); },
                    disabled: busy,
                    title: isSess && !hasMedia ? "该主题没有背景媒体，不能作为会话壁纸" : undefined,
                  },
                    inuse ? h("span", { className: "esc-badge" }, isSess ? (sessWpEntry && sessWpEntry.id === s.id ? "本对话" : "全局") : "使用中") : null,
                    sel && !bgIsApplied ? h("span", { className: "esc-badge draft" }, "待应用") : null,
                    h("span", { className: "thumb" },
                      poster
                        ? h("img", { src: `${base}/${poster}`, alt: "", loading: "lazy" })
                        : h("span", { className: "ph", "aria-hidden": "true" }),
                    ),
                    h("span", { className: "nm" }, s.name),
                    h("span", { className: "meta" },
                      h("span", null, isSess && !hasMedia ? "无背景" : hasMedia ? "背景" : "纯色"),
                      hasMedia ? h("span", { className: "live" }, sSpec && sSpec.type === "video" ? "动态" : "静态") : null,
                    ),
                  );
                }),
              ) : h("p", { className: "esc-note" }, "当前没有可用皮肤，界面使用宿主默认外观。安装皮肤包后重新打开此页即可选择。"),
            ),
            h("aside", { ref: detailRef, tabIndex: -1, className: "esc-detail", "aria-label": "背景详情" },
              h("div", null,
                h("span", { className: "kicker" }, "BACKGROUND"),
                h("h3", null, bgView ? bgView.name : "无背景"),
              ),
              bgView ? h("div", { className: "esc-preview" },
                spec && spec.type === "image"
                  ? h("img", { key: "img-" + bgView.id + "-" + (dark ? "d" : "l"), src: `${API}/skin/${bgView.id}/assets/${spec.src}`, alt: bgView.name })
                  : spec && spec.type === "video"
                    ? h("video", {
                      key: "vid-" + bgView.id + "-" + (dark ? "d" : "l"),
                      src: `${API}/skin/${bgView.id}/assets/${spec.src}`,
                      controls: true, muted: true, loop: true, playsInline: true, preload: "metadata",
                    })
                    : h("div", { className: "ph" }, h("span", null, viewedNoMedia ? "无背景 · 纯色主题" : "当前明暗档没有背景媒体")),
              ) : h("div", { className: "esc-preview" }, h("div", { className: "ph" }, h("span", null, "尚无背景"))),
              h("div", { className: "esc-facts" },
                h("div", { className: "esc-fact" }, h("span", null, "作用对象"), h("span", null, isSess ? "当前对话「" + (contact.title || contact.id) + "」" : "全局默认")),
                h("div", { className: "esc-fact" }, h("span", null, "当前状态"), h("span", null,
                  isSess
                    ? (sessWpEntry ? "本对话专属 · " + sessWpEntry.name : (globalBgEntry ? "跟随全局 · " + globalBgEntry.name : "跟随全局 · 宿主默认"))
                    : (globalBgEntry ? "使用中 · " + globalBgEntry.name : "宿主默认外观"),
                )),
                bgSel ? h("div", { className: "esc-fact" }, h("span", null, "选择"), h("span", null, bgIsApplied ? "已应用" : "未应用草稿")) : null,
              ),
              h("div", { className: "esc-actions" },
                h("button", { type: "button", className: "esc-apply", onClick: applyBackground, disabled: bgActionDisabled },
                  !bgSel ? (bgEffective ? "正在使用" : "选择背景后应用") : !bgSessUsable ? "不可用于当前会话" : bgIsApplied ? "已应用" : (isSess ? "设为当前对话壁纸" : "应用此主题")),
                isSess ? h("button", { type: "button", className: "esc-ghost", onClick: resetSessionWallpaper, disabled: busy || !sessWpEntry }, "使用全局壁纸") : null,
                isSess && bgSel && !bgSel.backgroundMedia ? h("span", { className: "esc-msg bad" }, "该主题没有背景媒体，不能作为当前对话壁纸。") : null,
                msg ? h("span", { className: "esc-msg" + (msg.bad ? " bad" : "") }, msg.t) : null,
              ),
              bgSel && !bgIsApplied ? h("p", { className: "esc-note" }, "点击上方「" + (isSess ? "设为当前对话壁纸" : "应用此主题") + "」后才会生效。") : null,
            ),
          ),
        ));
      } else if (tab === "av") {
        const avEntries = Object.entries(groups).filter(([, list]) => list.length);
        const filteredCount = avEntries.reduce((n, [, list]) => n + list.length, 0);
        let avStatus;
        if (!avView) avStatus = isSess ? "等待联系人识别" : "尚未设置";
        else if (avSel) avStatus = avIsApplied ? "已应用（无改动）" : "未应用草稿";
        else if (isSess) avStatus = sessAv ? "本对话专属头像" : autoAv ? "自动分配（本对话）" : "等待自动分配";
        else avStatus = av.current ? "全局默认" : "宿主默认";
        kids.push(h("div", { key: "panel-av", id: "esc-panel-av", role: "tabpanel", "aria-labelledby": "esc-tab-av", className: "esc-panel" },
          h("p", { className: "esc-note" }, isSess
            ? ["为「", h("b", null, contact.title || contact.id), "」挑选专属头像：三类素材全部可用，列表、聊天头部与消息气泡同步更换；保存在本浏览器，不影响其他对话与全局默认头像。"]
            : "默认头像用于没有联系人头像的会话；敲敲联系人按会话自动分配头像。"),
          h("div", { className: "esc-workbench" },
            h("div", { className: "esc-inventory" },
              h("div", { className: "esc-inv-head" },
                h("strong", null, "头像素材"),
                h("span", null, filteredCount + " / " + av.catalog.length),
              ),
              h("div", { className: "esc-toolbar" },
                h("input", {
                  className: "esc-search", placeholder: "搜索代理人…", value: q,
                  onChange: (e) => setQ(e.target.value), "aria-label": "搜索代理人", disabled: busy,
                }),
              ),
              h("div", { className: "esc-filters", role: "group", "aria-label": "头像分类" },
                [["all", "全部", avCounts.all], ["avatars", GL.avatars, avCounts.avatars], ["chat-icons", GL["chat-icons"], avCounts["chat-icons"]], ["portraits", GL.portraits, avCounts.portraits]].map(([key, label, count]) => h("button", {
                  key, type: "button",
                  className: "esc-chip" + (avGroup === key ? " on" : ""),
                  "aria-pressed": avGroup === key ? "true" : "false",
                  onClick: () => { if (!busy) setAvGroup(key); },
                  disabled: busy,
                }, label + " " + count)),
              ),
              avEntries.length ? avEntries.flatMap(([dir, list]) => [
                h("div", { key: "k" + dir, className: "esc-key" }, (GL[dir] || dir) + " · " + list.length),
                h("div", { key: "g" + dir, className: "esc-tiles av" },
                  list.map((e) => {
                    const applied = sameAv(appliedAv, e);
                    const sel = sameAv(avSel, e);
                    const pressed = sameAv(avView, e);
                    return h("button", {
                      key: e.dir + "/" + e.file, type: "button",
                      className: "esc-av-tile" + (sel ? " sel" : "") + (applied ? " inuse" : ""),
                      "aria-pressed": pressed ? "true" : "false",
                      "aria-label": e.name + (applied ? "，使用中" : "") + (sel ? "，已选" : ""),
                      onClick: () => { if (!busy) setAvSel({ dir: e.dir, file: e.file, name: e.name }); },
                      disabled: busy,
                      title: e.name,
                    },
                      h("img", { loading: "lazy", src: `${API}/avatar-img/${e.dir}/${e.file}`, alt: e.name }),
                      h("span", null, e.name),
                    );
                  }),
                ),
              ]) : h("div", null,
                h("p", { className: "esc-note" }, q.trim() || avGroup !== "all"
                  ? "当前筛选没有匹配的头像。"
                  : "当前没有可用头像素材，会话继续使用宿主默认头像。导入 .webp 头像后重新打开此页即可选择。"),
                q.trim() || avGroup !== "all"
                  ? h("button", { type: "button", className: "esc-mat-reset", onClick: () => { setQ(""); setAvGroup("all"); }, disabled: busy }, "清除筛选")
                  : null,
              ),
            ),
            h("aside", { ref: detailRef, tabIndex: -1, className: "esc-detail", "aria-label": "头像详情" },
              h("div", null,
                h("span", { className: "kicker" }, "AGENT AVATAR"),
                h("h3", null, avView ? avView.name : "未选择头像"),
              ),
              avView
                ? h("img", { className: "esc-av-big", src: `${API}/avatar-img/${avView.dir}/${avView.file}`, alt: avView.name })
                : h("div", { className: "esc-av-ph" }, h("span", null, "无")),
              h("div", { className: "esc-facts" },
                h("div", { className: "esc-fact" }, h("span", null, "名称"), h("span", null, avView ? avView.name : "—")),
                h("div", { className: "esc-fact" }, h("span", null, "类别"), h("span", null, avView ? (GL[avView.dir] || avView.dir) : "—")),
                h("div", { className: "esc-fact" }, h("span", null, "作用对象"), h("span", null, isSess ? "当前对话「" + (contact.title || contact.id) + "」" : "全局默认")),
                h("div", { className: "esc-fact" }, h("span", null, "当前状态"), h("span", null, avStatus)),
              ),
              h("div", { className: "esc-actions" },
                h("button", { type: "button", className: "esc-apply", onClick: isSess ? pickSessionAvatar : pickAvatar, disabled: avActionDisabled },
                  avSel ? (avIsApplied ? "已应用" : (isSess ? "设为本对话头像" : "应用头像")) : (appliedAv ? "正在使用" : "选择头像后应用")),
                isSess ? h("button", { type: "button", className: "esc-ghost", onClick: resetSessionAvatar, disabled: busy || !sessAv }, "恢复自动头像") : null,
                msg ? h("span", { className: "esc-msg" + (msg.bad ? " bad" : "") }, msg.t) : null,
              ),
              avSel && !avIsApplied ? h("p", { className: "esc-note" }, "点击上方「" + (isSess ? "设为本对话头像" : "应用头像") + "」后才会生效。") : null,
            ),
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
          h("div", { className: "esc-actions" },
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
        const emptyConversation = !nav && document.querySelector('[data-slot="main.conversation"] [data-phase="hero"]');
        if (selected && emptyConversation) current = selected;
        else if (selected && title && (title === selected.title || title.endsWith(selected.title))) current = selected;
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
        // av 一并带给设置页：当前会话未手动设置时显示真实自动分配头像，而不是误称跟随全局
        const prevCur = CURRENT_CONTACT;
        const nextCur = current ? { id: current.id, title: current.title, av: current.av } : null;
        if (!!prevCur !== !!nextCur || (prevCur && nextCur && (prevCur.id !== nextCur.id || prevCur.title !== nextCur.title || !sameAv(prevCur.av, nextCur.av)))) notifyContact(nextCur);
      };
      const schedule = () => { if (!stopped && timer === null) timer = setTimeout(refresh, 80); };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-selected", "data-row-key", "data-phase"] });
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

    /* ── 运行时生命周期：材质/主题观察/联系人/异步启动全部在 effect 内，启用一次、停用可逆 ── */
    function startRuntime() {
      // 防御重复 setup：同一实例只保留一份运行时
      if (runtimeCleanup) { try { runtimeCleanup(); } catch {} }
      const gen = ++lifecycleGen;
      const previousSkin = document.documentElement.getAttribute("data-dsh-skin");
      running = true;
      // 组件公共样式在启用时就位，不等打开 ZZZ 设置页；卸载时随 cleanup 撤掉。
      ensureComponentStyles();
      const ac = new AbortController();
      runtimeSignal = ac.signal;
      let stopContacts = null;
      let matPrev = null;
      let onReady = null;
      let cleaned = false;

      const applyMaterial = () => {
        if (matPrev || typeof document === "undefined" || !document.body) return !!matPrev;
        matPrev = matSnapshot();
        matApply(MATERIAL);
        return true;
      };
      if (typeof document !== "undefined" && !applyMaterial()) {
        onReady = () => { if (running && gen === lifecycleGen) applyMaterial(); };
        document.addEventListener("DOMContentLoaded", onReady, { once: true });
      }

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (gen !== lifecycleGen) return; // 已有新实例接管，旧清理不得拆新状态
        if (runtimeCleanup === cleanup) runtimeCleanup = null;
        running = false; // 先断写入口：contact cleanup 与异步返回都不得复活 bg
        // 作废换肤事务：清掉尚未晋升的暂存 link，并立刻唤醒等待者，不让旧流程挂住
        try { cancelStagedLinks(); } catch {}
        pendingPatchRefresh = false;
        try { ac.abort(); } catch {}
        if (runtimeSignal === ac.signal) runtimeSignal = null;
        if (onReady && typeof document !== "undefined") {
          document.removeEventListener("DOMContentLoaded", onReady);
          onReady = null;
        }
        if (stopContacts) { try { stopContacts(); } catch {} stopContacts = null; }
        else if (CURRENT_CONTACT) notifyContact(null);
        if (themeObs) { try { themeObs.disconnect(); } catch {} themeObs = null; }
        if (bgLayer) { try { bgLayer.remove(); } catch {} bgLayer = null; }
        bgEntry = null;
        // 只移除本 API 前缀的 skin link；顺带从 href 认领服务端首屏注入的皮肤 ID
        try {
          document.querySelectorAll('link[data-dsh-skin-link]').forEach((link) => {
            const href = link.getAttribute("href") || "";
            if (!href.startsWith(API + "/skin/")) return;
            const id = href.slice((API + "/skin/").length).split("/")[0].split("?")[0];
            if (id) MANAGED_IDS.add(id);
            link.remove();
          });
        } catch {}
        // 组件公共样式只撤自家这条；其他样式链一律不动。
        try {
          document.querySelectorAll('link[data-zzz-component-styles]').forEach((link) => {
            const href = link.getAttribute("href") || "";
            if (href.startsWith(COMPONENT_CSS_HREF)) link.remove();
          });
        } catch {}
        // 仅当 html 当前属性是本插件管理过的 ID：别把宿主或其他皮肤的值删掉
        try {
          const root = document.documentElement;
          const cur = root.getAttribute("data-dsh-skin");
          if (cur && MANAGED_IDS.has(cur)) {
            if (previousSkin && !MANAGED_IDS.has(previousSkin)) root.setAttribute("data-dsh-skin", previousSkin);
            else root.removeAttribute("data-dsh-skin");
          }
          document.getElementById(CSS_TAG)?.remove();
        } catch {}
        matRestore(matPrev); matPrev = null;
        CATALOG = []; ACTIVE = null; AV = { catalog: [], current: null };
      };

      try {
        // 生命周期先于 startContacts：主题观察与背景渲染先就位
        watchTheme();
        // 联系人扫描最后启动；它产生的 notifyContact 在 running 守卫下才写 DOM
        stopContacts = startContacts();
        bootRuntime(ac.signal, gen);
      } catch (e) {
        cleanup();
        throw e;
      }

      runtimeCleanup = cleanup;
      return cleanup;
    }

    function bootRuntime(signal, gen) {
      const alive = () => running && gen === lifecycleGen && !signal.aborted;
      (async () => {
        try {
          const r = await fetch(`${API}/list`, { cache: "no-store", signal });
          if (!alive()) return;
          if (!r.ok) throw new Error("HTTP " + r.status);
          const j = await r.json();
          if (!alive()) return;
          CATALOG = Array.isArray(j.skins) ? j.skins : [];
          for (const s of CATALOG) if (s && typeof s.id === "string") MANAGED_IDS.add(s.id);
          // active 必须在目录内：不把已下架/不存在的 ID 当全局激活
          ACTIVE = j.active && CATALOG.some((s) => s.id === j.active) ? j.active : null;
        } catch (e) {
          if (!alive()) return;
          CATALOG = []; ACTIVE = null;
        }
        try {
          const r = await fetch(`${API}/avatar/list`, { cache: "no-store", signal });
          if (!alive()) return;
          if (!r.ok) throw new Error("HTTP " + r.status);
          const j = await r.json();
          if (!alive()) return;
          AV = { catalog: Array.isArray(j.catalog) ? j.catalog : [], current: j.current || null };
        } catch {}
        if (!alive()) return;
        // 启动恢复：先全局；联系人首轮扫描识别当前会话后自动切到其专属壁纸。
        // 背景与联系人初始化不等待样式加载事务：首屏 CSS 缺失或响应慢时壁纸仍立即恢复。
        renderBackgroundEffective();
        watchTheme();
        contactRefresh?.();
        if (ACTIVE) {
          const skinId = ACTIVE;
          const entry = CATALOG.find((s) => s.id === skinId);
          // 首屏 CSS 与作用域一致时只是同步补属性；需要重载时在后台完成。事务内部按 running /
          // lifecycleGen / linkTx 守卫，旧实例的晚到结果不写 DOM，失败则保留现状。
          ensureSkinLinks(skinId, !!(entry && entry.hasPatches)).then((ok) => {
            // 启动期慢 CSS 正是唯一能碰到 skinCommits 窗口的入口：事务完成后补最头像戳
            if (ok && alive() && gen === lifecycleGen && running) flushPendingPatchRefresh();
          }).catch(() => {});
        }
      })();
    }

    function apply(ctx) {
      // 先注册运行时（禁用时后清理），再注册设置页（禁用时先卸载组件）
      ctx.effect(startRuntime, "ZZZ: runtime");
      ctx.effect(
        () => ctx.slots.inject("settings.section", () =>
          ctx.slots.register(
            { name: "settings.section", id: NS, order: 8, label: () => "ZZZ" },
            SkinCenterSection,
          ),
        ),
        "dsh-eridu-skincenter: settings section",
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
