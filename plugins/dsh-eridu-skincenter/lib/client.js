// 新艾利都皮肤中心 · 客户端（2026-11-01）
// 无框架 vanilla bundle：背景装饰层渲染（video+scrim，跟亮暗档）、免重载换肤、
// 右缘「皮肤中心」入口 + 全屏换装页面（动态背景 38 张 hover 预览 + 代理人头像）。
window.__ModuleLoader__.load({
  id: "dsh-eridu-skincenter",
  factory: () => {
    const API = "/api/eridu-skins";
    const AC = "#cdf348", INK = "#14141a", BG = "#0b0c14", PANEL = "#14151f", LINE = "#2a2c3c";
    const GL = { "chat-icons": "聊天图标", avatars: "头像", portraits: "角色" };
    let CATALOG = [], ACTIVE = null, AV = { catalog: [], current: null };
    const $ = (s, r) => (r || document).querySelector(s);
    const css = (el, s) => { el.style.cssText = s; return el; };

    /* ── 背景装饰层（video + scrim，跟 body 档位） ────── */
    let bgLayer = null, bgEntry = null, themeObs = null;
    function ensureLayer() {
      if (bgLayer && document.body.contains(bgLayer)) return bgLayer;
      bgLayer = document.createElement("div");
      bgLayer.setAttribute("data-dsh-skin-layer", "background");
      bgLayer.setAttribute("aria-hidden", "true");
      css(bgLayer, "position:fixed;top:0;right:0;bottom:0;left:0;z-index:-2;pointer-events:none;overflow:hidden;");
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
        css(img, "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;");
        layer.appendChild(img);
      } else {
        const v = document.createElement("video");
        v.src = `${base}/${spec.src}`; v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
        css(v, "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;");
        layer.appendChild(v);
      }
      if (spec.scrim) {
        const s = document.createElement("div");
        css(s, `position:absolute;inset:0;background:${spec.scrim};`);
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
      let sheet = $('link[data-dsh-skin-link="stylesheet"]');
      if (!sheet) { sheet = document.createElement("link"); sheet.rel = "stylesheet"; sheet.setAttribute("data-dsh-skin-link", "stylesheet"); document.head.appendChild(sheet); }
      sheet.href = href("stylesheet");
      let pat = $('link[data-dsh-skin-link="patches"]');
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
      const pat = $('link[data-dsh-skin-link="patches"]');
      if (pat) pat.href = `${API}/skin/${ACTIVE}/patches?t=${Date.now()}`;
      return j;
    }

    /* ── 换装页面 ────────────────────────────────────── */
    let ui = null;
    function toast(msg, bad) {
      const t = $("#eridu-toast");
      if (!t) return;
      t.textContent = msg;
      t.style.color = bad ? "#ff7a90" : AC;
      t.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 160 });
      clearTimeout(t._h);
      t._h = setTimeout(() => { t.textContent = ""; }, 2600);
    }
    function buildUI() {
      if (ui) return ui;
      ui = document.createElement("div");
      ui.id = "eridu-skin-ui";
      ui.innerHTML = `
      <style>
        #eridu-skin-ui{position:fixed;inset:0;z-index:2147483000;display:none;font:14px/1.5 "Segoe UI",system-ui,"Microsoft YaHei",sans-serif}
        #eridu-skin-ui.open{display:block}
        #eridu-ov{position:absolute;inset:0;background:rgba(8,9,18,.86);backdrop-filter:blur(10px)}
        #eridu-page{position:absolute;inset:0;overflow:auto;padding:34px 38px 90px;color:#e8e9f0;
          background:radial-gradient(rgba(255,255,255,.045) 1px,transparent 1px) 0 0/16px 16px}
        #eridu-page::-webkit-scrollbar{width:10px}#eridu-page::-webkit-scrollbar-thumb{background:${LINE};border-radius:5px}
        .eh{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:6px}
        .eh .mono{font:600 12px/1 ui-monospace,Consolas,monospace;color:${AC};letter-spacing:.24em}
        .eh h1{margin:0;font-size:26px;letter-spacing:.08em;font-weight:900}
        .eh h1 b{color:${AC}}
        .eh .cur{margin-left:auto;font-size:12px;color:#a9abbd}
        .eh .cur b{color:${AC}}
        .etabs{display:flex;gap:8px;margin:16px 0 22px}
        .etab{cursor:pointer;border:1.5px solid ${LINE};background:${PANEL};color:#a9abbd;padding:7px 22px;font-weight:700;letter-spacing:.1em;
          clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)}
        .etab.on{background:${AC};border-color:${AC};color:${INK}}
        .egrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px}
        .ecard{cursor:pointer;border:2px solid ${LINE};background:${PANEL};box-shadow:4px 4px 0 rgba(0,0,0,.55);position:relative;transition:transform .12s}
        .ecard:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 rgba(0,0,0,.55)}
        .ecard.on{border-color:${AC}}
        .ecard .shot{position:relative;aspect-ratio:16/9;overflow:hidden;background:#000}
        .ecard .shot video,.ecard .shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
        .ecard .shot .veil{position:absolute;inset:0;background:linear-gradient(180deg,transparent 62%,rgba(8,9,18,.82))}
        .ecard .shot .name{position:absolute;left:10px;bottom:8px;font-weight:800;font-size:15px;text-shadow:2px 2px 0 rgba(0,0,0,.7)}
        .ecard .shot .name small{display:block;font-weight:400;font-size:10px;color:#c7c9da;letter-spacing:.06em}
        .ecard .meta{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;font-size:11px;color:#a9abbd}
        .ecard .meta .live{color:${AC};font-weight:700}
        .esticker{position:absolute;top:-10px;right:-8px;background:${AC};color:${INK};font-size:11px;font-weight:900;padding:3px 10px;
          transform:rotate(3deg);box-shadow:2px 2px 0 rgba(0,0,0,.6);z-index:2}
        .esearch{background:${PANEL};border:1.5px solid ${LINE};color:#e8e9f0;border-radius:8px;padding:8px 14px;width:240px;outline:none;font-size:13px}
        .esearch:focus{border-color:${AC}}
        .avgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:10px;margin-top:14px}
        .avcell{cursor:pointer;text-align:center;padding:8px 4px;border:1.5px solid transparent;border-radius:10px}
        .avcell img{width:62px;height:62px;filter:drop-shadow(0 2px 6px #000a)}
        .avcell span{display:block;font-size:11px;color:#c7c9da;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .avcell:hover{border-color:${LINE};background:${PANEL}}
        .avcell.on{border-color:${AC};background:${PANEL}}
        .avcell.on span{color:${AC};font-weight:700}
        .ekey{font-size:12px;color:#a9abbd;letter-spacing:.2em;margin:18px 0 8px}
        #eridu-bar{position:fixed;left:38px;right:38px;bottom:22px;display:none;align-items:center;gap:14px}
        #eridu-bar .pick{flex:1;display:none;align-items:center;gap:12px;background:${PANEL};border:1.5px solid ${LINE};border-radius:12px;padding:8px 16px}
        #eridu-bar .pick img{width:42px;height:42px}
        #eridu-bar .pick b{color:${AC}}
        #eridu-apply{display:none;background:${AC};color:${INK};border:none;font:800 15px/1 inherit;padding:12px 30px;cursor:pointer;
          box-shadow:3px 3px 0 rgba(0,0,0,.6);clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)}
        #eridu-apply:disabled{opacity:.5;cursor:wait}
        #eridu-toast{font-size:12px;color:${AC};min-width:120px}
        #eridu-close{cursor:pointer;background:${PANEL};border:1.5px solid ${LINE};color:#e8e9f0;width:34px;height:34px;font-size:16px;font-weight:800;
          box-shadow:2px 2px 0 rgba(0,0,0,.6)}
        #eridu-close:hover{border-color:${AC};color:${AC}}
      </style>
      <div id="eridu-ov"></div>
      <div id="eridu-page">
        <div class="eh">
          <span class="mono">// SKIN LAB</span>
          <h1>新艾利都 · <b>皮肤中心</b></h1>
          <span class="cur">使用中：<b id="eridu-cur">—</b></span>
          <button id="eridu-close">✕</button>
        </div>
        <div class="etabs">
          <button class="etab on" data-t="bg">动态背景</button>
          <button class="etab" data-t="av">代理人头像</button>
        </div>
        <div id="eridu-body"></div>
        <div id="eridu-bar">
          <div class="pick" id="eridu-pick"><img><div>已选 <b id="eridu-pname"></b><span id="eridu-pg" style="color:#a9abbd;font-size:12px"></span></div></div>
          <button id="eridu-apply">应用</button>
          <span id="eridu-toast"></span>
        </div>
      </div>`;
      document.body.appendChild(ui);
      $("#eridu-close", ui).onclick = close;
      $("#eridu-ov", ui).onclick = close;
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ui.classList.contains("open")) close(); });
      ui.querySelectorAll(".etab").forEach((b) => b.onclick = () => {
        ui.querySelectorAll(".etab").forEach((x) => x.classList.toggle("on", x === b));
        renderTab(b.dataset.t);
      });
      return ui;
    }
    let avSel = null;
    function bindApply() {
      const btn = $("#eridu-apply");
      if (btn && !btn._bound) {
        btn._bound = true;
        btn.onclick = async () => {
          if (!avSel) return;
          btn.disabled = true; toast("应用中…");
          try { await applyAvatar(avSel); renderTab("av"); toast("✓ 头像已换上 " + avSel.name); }
          catch (e) { toast("✗ " + e.message, true); }
          btn.disabled = false;
        };
      }
    }
    function renderTab(t) {
      bindApply();
      const body = $("#eridu-body"), bar = $("#eridu-bar");
      bar.style.display = "none";
      if (t === "bg") {
        let h = '<div class="egrid">';
        for (const s of CATALOG) {
          const base = `${API}/skin/${s.id}/assets`;
          const poster = s.preview?.dark ? `${base}/${s.preview.dark}` : "";
          const vid = s.backgroundMedia?.dark?.src ? `${base}/${s.backgroundMedia.dark.src}` : "";
          h += `<div class="ecard${s.id === ACTIVE ? " on" : ""}" data-id="${s.id}" data-vid="${vid}" data-poster="${poster}">
            ${s.id === ACTIVE ? '<span class="esticker">使用中</span>' : ""}
            <div class="shot">${vid ? `<video muted loop playsinline preload="none" poster="${poster}"></video>` : `<img src="${poster}">`}
              <div class="veil"></div><div class="name">${s.name}<small>${s.nameEn || s.id} · v${s.version || "?"}</small></div>
            </div>
            <div class="meta"><span>${s.tagline || ""}</span>${vid ? '<span class="live">动态</span>' : ""}</div>
          </div>`;
        }
        body.innerHTML = h + "</div>";
        body.querySelectorAll(".ecard").forEach((c) => {
          const v = c.querySelector("video");
          c.onmouseenter = () => { if (v) { v.src = c.dataset.vid; v.play().catch(() => {}); } };
          c.onmouseleave = () => { if (v) { v.pause(); v.removeAttribute("src"); v.load(); } };
          c.onclick = async () => {
            try { await applySkin(c.dataset.id); renderTab("bg"); $("#eridu-cur").textContent = c.querySelector(".name").firstChild.textContent; toast("✓ 已换上 " + c.dataset.id); }
            catch (e) { toast("✗ " + e.message, true); }
          };
        });
      } else {
        let h = `<input class="esearch" id="eridu-q" placeholder="搜索代理人…">`;
        const groups = { avatars: [], "chat-icons": [], portraits: [] };
        for (const e of AV.catalog) (groups[e.dir] || (groups[e.dir] = [])).push(e);
        for (const [dir, list] of Object.entries(groups)) {
          if (!list.length) continue;
          h += `<div class="ekey">${GL[dir] || dir} · ${list.length}</div><div class="avgrid">`;
          for (const e of list) {
            const key = e.dir + "/" + e.file;
            const cur = AV.current && AV.current.dir === e.dir && AV.current.file === e.file;
            h += `<div class="avcell${cur ? " on" : ""}" data-key="${key}" data-name="${e.name}" data-dir="${e.dir}" data-file="${e.file}">
              <img loading="lazy" src="${API}/avatar-img/${key}"><span>${e.name}${cur ? " · 使用中" : ""}</span></div>`;
          }
          h += "</div>";
        }
        body.innerHTML = h;
        const q = $("#eridu-q");
        q.oninput = () => {
          const s = q.value.trim();
          body.querySelectorAll(".avcell").forEach((c) => {
            c.style.display = !s || c.dataset.name.includes(s) ? "" : "none";
          });
          body.querySelectorAll(".ekey").forEach((k) => {
            let any = false, el = k.nextElementSibling.firstChild;
            while (el) { if (el.style.display !== "none") any = true; el = el.nextElementSibling; }
            k.style.display = any ? "" : "none";
          });
        };
        body.querySelectorAll(".avcell").forEach((c) => c.onclick = () => {
          avSel = { dir: c.dataset.dir, file: c.dataset.file, name: c.dataset.name };
          body.querySelectorAll(".avcell").forEach((x) => x.classList.toggle("on", x === c));
          $("#eridu-bar").style.display = "flex";
          $("#eridu-pick").style.display = "flex";
          $("#eridu-apply").style.display = "block";
          $("#eridu-pname").textContent = c.dataset.name;
          $("#eridu-pg").textContent = "（" + (GL[c.dataset.dir] || c.dataset.dir) + "）";
          $("#eridu-pick img").src = `${API}/avatar-img/${c.dataset.key}`;
        });
      }
    }
    $("#apply") && ($("#apply").onclick = async () => {
      const btn = $("#eridu-apply"); btn.disabled = true;
      toast("应用中…");
      try { await applyAvatar(avSel); renderTab("av"); toast("✓ 头像已换上 " + avSel.name); }
      catch (e) { toast("✗ " + e.message, true); }
      btn.disabled = false;
    });
    function open() {
      buildUI();
      const tab = document.getElementById("eridu-entry");
      if (tab) tab.style.display = "none";
      $("#eridu-cur").textContent = (CATALOG.find((s) => s.id === ACTIVE) || {}).name || ACTIVE || "—";
      renderTab(ui.querySelector(".etab.on").dataset.t);
      ui.classList.add("open");
    }
    function close() {
      ui && ui.classList.remove("open");
      const tab = document.getElementById("eridu-entry");
      if (tab) tab.style.display = "";
    }

    /* ── 右缘入口签 ──────────────────────────────────── */
    function mountTab() {
      if ($("#eridu-entry")) return;
      const b = document.createElement("button");
      b.id = "eridu-entry";
      b.textContent = "皮肤中心";
      css(b, `position:fixed;right:0;top:46%;z-index:2147482000;writing-mode:vertical-rl;letter-spacing:.3em;
        font:800 13px/1 "Segoe UI","Microsoft YaHei",sans-serif;color:${INK};background:${AC};
        border:2px solid ${INK};border-right:none;padding:14px 6px 14px 8px;cursor:pointer;
        box-shadow:-3px 3px 0 rgba(0,0,0,.6);transform:translateX(0);transition:transform .15s`);
      b.onmouseenter = () => (b.style.transform = "translateX(-5px)");
      b.onmouseleave = () => (b.style.transform = "translateX(0)");
      b.onclick = open;
      document.body.appendChild(b);
    }

    /* ── 启动 ────────────────────────────────────────── */
    (async () => {
      try {
        const r = await fetch(`${API}/list`);
        const j = await r.json();
        CATALOG = j.skins || [];
        ACTIVE = j.active || CATALOG[0]?.id || null;
      } catch { CATALOG = []; }
      try {
        const r = await fetch(`${API}/avatar/list`);
        const j = await r.json();
        AV.catalog = j.catalog || [];
        AV.current = j.current || null;
      } catch {}
      if (ACTIVE) document.documentElement.setAttribute("data-dsh-skin", ACTIVE);
      renderBackground(CATALOG.find((s) => s.id === ACTIVE) || null);
      watchTheme();
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountTab);
      else mountTab();
    })();
  },
});
