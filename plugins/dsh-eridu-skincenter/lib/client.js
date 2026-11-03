// 新艾利都皮肤中心 · 客户端（2026-11-03 v1.1：并入宿主设置对话框成一页）
// 无框架部分：背景装饰层渲染（video+scrim，跟亮暗档）、免重载换肤；
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
      renderBackground(entry);
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

    /* ── 设置页 section（React，样式随包注入一次） ────── */
    const CSS_TAG = NS + "/section.css";
    const CSS = [
      ".esc{max-width:900px;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary)}",
      ".esc-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}",
      ".esc-head .mono{font:600 11px/1 ui-monospace,Consolas,monospace;color:" + AC + ";letter-spacing:.22em}",
      ".esc-head h2{margin:0;font-size:17px;font-weight:800;letter-spacing:.06em;color:var(--dsw-alias-label-primary)}",
      ".esc-head .cur{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-tertiary)}",
      ".esc-head .cur b{color:" + AC + "}",
      ".esc-tabs{display:flex;gap:8px}",
      ".esc-tab{cursor:pointer;border:1.5px solid " + LINE + ";background:" + PANEL + ";color:#a9abbd;padding:6px 18px;font-weight:700;font-size:12.5px;letter-spacing:.1em;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}",
      ".esc-tab.on{background:" + AC + ";border-color:" + AC + ";color:" + INK + "}",
      ".esc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(224px,1fr));gap:14px}",
      ".esc-card{cursor:pointer;border:2px solid " + LINE + ";background:" + PANEL + ";box-shadow:3px 3px 0 rgba(0,0,0,.45);position:relative;transition:transform .12s;padding:0;text-align:inherit;font:inherit}",
      ".esc-card:hover{transform:translate(-2px,-2px);box-shadow:5px 5px 0 rgba(0,0,0,.5)}",
      ".esc-card.on{border-color:" + AC + "}",
      ".esc-card .shot{position:relative;aspect-ratio:16/9;overflow:hidden;background:#000}",
      ".esc-card .shot video,.esc-card .shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}",
      ".esc-card .shot .veil{position:absolute;inset:0;background:linear-gradient(180deg,transparent 62%,rgba(8,9,18,.82))}",
      ".esc-card .shot .nm{position:absolute;left:10px;bottom:8px;font-weight:800;font-size:14px;color:#fff;text-shadow:2px 2px 0 rgba(0,0,0,.7)}",
      ".esc-card .shot .nm small{display:block;font-weight:400;font-size:10px;color:#c7c9da;letter-spacing:.06em}",
      ".esc-card .meta{display:flex;justify-content:space-between;align-items:center;padding:7px 11px;font-size:11px;color:#a9abbd}",
      ".esc-card .meta .live{color:" + AC + ";font-weight:700}",
      ".esc-sticker{position:absolute;top:-9px;right:-7px;background:" + AC + ";color:" + INK + ";font-size:10.5px;font-weight:900;padding:2px 9px;transform:rotate(3deg);box-shadow:2px 2px 0 rgba(0,0,0,.55);z-index:2}",
      ".esc-search{background:" + PANEL2 + ";border:1.5px solid " + LINE + ";color:#e8e9f0;border-radius:8px;padding:7px 13px;width:230px;outline:none;font-size:13px}",
      ".esc-search:focus{border-color:" + AC + "}",
      ".esc-key{font-size:11.5px;color:var(--dsw-alias-label-tertiary);letter-spacing:.2em;margin:6px 0 2px}",
      ".esc-avgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}",
      ".esc-avcell{cursor:pointer;text-align:center;padding:7px 4px;border:1.5px solid transparent;border-radius:10px;background:transparent}",
      ".esc-avcell img{width:58px;height:58px;filter:drop-shadow(0 2px 6px #000a)}",
      ".esc-avcell span{display:block;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".esc-avcell:hover{border-color:" + LINE + ";background:" + PANEL + "}",
      ".esc-avcell.on{border-color:" + AC + ";background:" + PANEL + "}",
      ".esc-avcell.on span{color:" + AC + ";font-weight:700}",
      ".esc-bar{position:sticky;bottom:0;display:flex;align-items:center;gap:12px;padding-top:8px}",
      ".esc-bar .pick{display:flex;align-items:center;gap:10px;background:" + PANEL + ";border:1.5px solid " + LINE + ";border-radius:10px;padding:6px 14px;color:#e8e9f0;font-size:13px}",
      ".esc-bar .pick img{width:38px;height:38px}",
      ".esc-bar .pick b{color:" + AC + "}",
      ".esc-apply{background:" + AC + ";color:" + INK + ";border:none;font:800 14px/1 inherit;padding:11px 26px;cursor:pointer;box-shadow:3px 3px 0 rgba(0,0,0,.5);clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}",
      ".esc-apply:disabled{opacity:.5;cursor:wait}",
      ".esc-msg{font-size:12.5px;color:" + AC + ";min-width:80px}",
      ".esc-msg.bad{color:#ff7a90}",
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
      const [tab, setTab] = useState("bg");
      const [active, setActive] = useState(ACTIVE);
      const [catalog, setCatalog] = useState(CATALOG);
      const [av, setAv] = useState(AV);
      const [avSel, setAvSel] = useState(null);
      const [q, setQ] = useState("");
      const [msg, setMsg] = useState(null);
      const [busy, setBusy] = useState(false);

      const refresh = useCallback(async () => {
        try {
          const r = await fetch(`${API}/list`, { cache: "no-store" });
          const j = await r.json();
          CATALOG = j.skins || [];
          if (j.active) ACTIVE = j.active;
        } catch {}
        try {
          const r = await fetch(`${API}/avatar/list`, { cache: "no-store" });
          const j = await r.json();
          AV = { catalog: j.catalog || [], current: j.current || null };
        } catch {}
        setActive(ACTIVE); setCatalog([...CATALOG]); setAv({ catalog: [...AV.catalog], current: AV.current });
      }, []);
      useEffect(() => { refresh(); }, [refresh]);

      const cur = catalog.find((s) => s.id === active);
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
        try { await applySkin(id); setActive(id); say("✓ 已换上 " + name); }
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

      const kids = [
        h("div", { className: "esc-head" },
          h("span", { className: "mono" }, "// SKIN LAB"),
          h("h2", null, "新艾利都 · 皮肤中心"),
          h("span", { className: "cur" }, "使用中：", h("b", null, cur ? cur.name : active || "—")),
        ),
        h("div", { className: "esc-tabs" },
          h("button", { className: "esc-tab" + (tab === "bg" ? " on" : ""), onClick: () => setTab("bg") }, "动态背景"),
          h("button", { className: "esc-tab" + (tab === "av" ? " on" : ""), onClick: () => setTab("av") }, "代理人头像"),
        ),
      ];

      if (tab === "bg") {
        kids.push(h("div", { className: "esc-grid" },
          catalog.map((s) => {
            const base = `${API}/skin/${s.id}/assets`;
            const poster = s.preview && s.preview.dark ? `${base}/${s.preview.dark}` : "";
            const vid = s.backgroundMedia && s.backgroundMedia.dark && s.backgroundMedia.dark.src ? `${base}/${s.backgroundMedia.dark.src}` : "";
            return h("button", {
              key: s.id, className: "esc-card" + (s.id === active ? " on" : ""), "data-vid": vid,
              onMouseEnter: cardHover(true), onMouseLeave: cardHover(false),
              onClick: () => pickSkin(s.id, s.name), disabled: busy,
            },
              s.id === active ? h("span", { className: "esc-sticker" }, "使用中") : null,
              h("div", { className: "shot" },
                vid ? h("video", { muted: true, loop: true, playsInline: true, preload: "none", poster }) : h("img", { src: poster, alt: "" }),
                h("div", { className: "veil" }),
                h("div", { className: "nm" }, s.name, h("small", null, (s.nameEn || s.id) + " · v" + (s.version || "?"))),
              ),
              h("div", { className: "meta" },
                h("span", null, s.tagline || ""),
                vid ? h("span", { className: "live" }, "动态") : null,
              ),
            );
          }),
        ));
      } else {
        kids.push(
          h("input", { className: "esc-search", placeholder: "搜索代理人…", value: q, onChange: (e) => setQ(e.target.value) }),
          ...Object.entries(groups).filter(([, list]) => list.length).flatMap(([dir, list]) => [
            h("div", { key: "k" + dir, className: "esc-key" }, (GL[dir] || dir) + " · " + list.length),
            h("div", { key: "g" + dir, className: "esc-avgrid" },
              list.map((e) => {
                const on = av.current && av.current.dir === e.dir && av.current.file === e.file;
                const sel = avSel && avSel.dir === e.dir && avSel.file === e.file;
                return h("button", {
                  key: e.dir + "/" + e.file, className: "esc-avcell" + (sel || on ? " on" : ""),
                  onClick: () => setAvSel({ dir: e.dir, file: e.file, name: e.name }),
                },
                  h("img", { loading: "lazy", src: `${API}/avatar-img/${e.dir}/${e.file}`, alt: e.name }),
                  h("span", null, e.name + (on ? " · 使用中" : "")),
                );
              }),
            ),
          ]),
        );
        kids.push(h("div", { className: "esc-bar" },
          avSel ? h("div", { className: "pick" },
            h("img", { src: `${API}/avatar-img/${avSel.dir}/${avSel.file}`, alt: "" }),
            h("span", null, "已选 ", h("b", null, avSel.name), "（" + (GL[avSel.dir] || avSel.dir) + "）"),
          ) : null,
          h("button", { className: "esc-apply", onClick: pickAvatar, disabled: !avSel || busy }, "应用头像"),
          msg ? h("span", { className: "esc-msg" + (msg.bad ? " bad" : "") }, msg.t) : null,
        ));
      }
      if (tab === "bg" && msg) kids.push(h("span", { className: "esc-msg" + (msg.bad ? " bad" : "") }, msg.t));
      return h("div", { className: "esc" }, ...kids);
    }

    const inject = ["slots"];
    function apply(ctx) {
      ctx.effect(
        () => ctx.slots.inject("settings.section", () =>
          ctx.slots.register(
            { name: "settings.section", id: NS, order: 8, label: () => "皮肤中心" },
            SkinCenterSection,
          ),
        ),
        "dsh-eridu-skincenter: settings section",
      );
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
      renderBackground(CATALOG.find((s) => s.id === ACTIVE) || null);
      watchTheme();
    })();

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
