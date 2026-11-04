# Changelog

## 1.5.0 — Unreleased

- Reorganize Settings → ZZZ around resource browsing, a separate detail preview
  and explicit apply actions for both backgrounds and avatars.
- Distinguish the browsed selection from the applied resource; reset drafts when
  the setting scope or conversation changes.
- Keep per-conversation appearance, global defaults and immediate material
  controls separate, with layouts based on the settings content width.
- Add avatar category filters and keep media players in the detail preview only.
- Reposition host navigation above ZZZ on narrow windows and bring the selected
  resource detail into view; isolate tile radii from legacy skin button rules.
- Allow a conversation to explicitly pin its currently inherited background or
  automatically assigned avatar.
- Recognize a selected real empty conversation from its session row and the host
  conversation hero, so appearance can be configured before the first message.

## 1.4.0 — 2026-11-04

- Package is now self-contained: `bundle/skins/zzz-zenless`,
  `bundle/skins/zzz-console` and the full 233-avatar `bundle/avatars` library
  ship inside the npm tarball.
- `zzz-zenless` uses the official key art as a static image background and card
  preview; the previously re-encoded `bg-dark` / `bg-light` videos are no longer
  packaged.
- `zzz-console` ships the base CSS plus the console tail, with
  `preview: null` and no wallpaper.
- Added `scripts/build-bundle.mjs`, `scripts/verify-bundle.mjs` and
  `scripts/import-custom-skins.mjs`. `prepack` builds from the source repository
  using a `fileURL`-relative root; an installed package verifies and reuses its
  complete bundle without the source tree, ffmpeg or network access.
- The 37 original-video skins stay local and optional; the importer only accepts
  managed IDs, never deletes files, and overwrites only with explicit
  `--replace`.
- Package metadata: version 1.4.0, top-level `engines.node` and `engines.dsh`,
  repository/homepage/bugs/author/keywords, `files` whitelist, and shared DSH
  packages declared as peer and dev dependencies.
- Bundled resources are read-only. Configurable local resource directories can
  extend the catalog; activation and default avatars are saved as user-state pointers.
- Added a Schemastery configuration schema, host connection authentication for
  every API, and platform-independent path and symlink containment checks.
- Client setup runs inside the plugin lifecycle, aborts pending startup requests,
  and removes its background, styles and observers on disposal while retaining preferences.
- Static image cards no longer create video players; backgrounds are labelled by type.
  In-place disposal was verified on DSH 0.2.1-rc.2; reload open pages after
  installing, updating or removing the package to load the current client code.
- Removed user-session preview screenshots from packaging. Only the official key
  art is used for the base preview.

## 1.3.1 — 2026-11-04

- Per-conversation avatar and wallpaper selection in Settings → ZZZ.
- Session appearance overrides stored in the current browser.

## 1.3.0 — 2026-11-04

- Settings entry and page title unified as ZZZ.
- Knock Knock contacts bound to real session IDs with persistent avatars.

## 1.2.1 — 2026-11-04

- Original MP4 backgrounds served with streaming byte ranges.

## 1.2.0 — 2026-11-04

- Inter-Knot windows and translucent materials.
- Material controls for panel opacity, bubble opacity and background blur.

## 1.1.0 — 2026-11-03

- Skin Center moved into the native DSH settings dialog.

## 1.0.1 — 2026-11-02

- Fixed client module factory return value.

## 1.0.0 — 2026-11-01

- Self-hosted skin center: skin catalog, activation state, avatars and CSS
  safety pipeline.
