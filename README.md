# New Eridu (新艾利都)

English | [中文](README.zh.md)

A Zenless Zone Zero theme for the DSH Web GUI. The v9.6 Inter-Knot treatment
uses rounded charcoal windows in dark mode and pale windows in light mode,
with the selected artwork visible through translucent surfaces. White agent
bubbles, blue reply bubbles, diagonal texture and an INTER-KNOT watermark
follow the game's messaging references. Settings → Skin Center → Surface
Material controls window opacity, bubble opacity and background blur, and
remembers these choices in the current browser.

## What it is

- `skin.json` — the v2 manifest.
- `skin.css` — the L1 token layer: a full remap of 107 `--dsw-*` semantic
  tokens plus 77 static colour steps, one block per mode.
- `patches.css` — the L3 patch layer: eighteen game-element effects,
  structural restyling, and third-party plugin tinting.
- `assets/wallpaper-zzz-keyart.jpg` — the official ZZZ key art (Sixth Street
  with the Cunning Hares). The light mode runs it through a print-tone filter
  (slight desaturation and lift) with a light paper veil; dark mode uses the
  night look as-is. The image is anchored right-top so the official mark in
  its top-right corner stays in frame at 16:10.
- `preview/light.jpg` / `preview/dark.jpg` — the running skin, 1440×900
  captures.

## Design language

The main surfaces follow Inter-Knot's charcoal hierarchy, rounded windows,
subtle diagonal texture and a large background wordmark. The artwork remains
visible through the windows. Agent messages use white bubbles with dark text;
user messages use blue bubbles with white text. Yellow-green is reserved for
selected navigation and key controls. `--zzz-accent` and `--zzz-accent-soft`
in `patches.css` control the accent colours.

## Motion and legacy decorations

The base layer contains the effects below. v9.6 retires the COMBO / DATA BANK
sidebar labels, contour overlay and PRESS ANY KEY decoration to keep the
Inter-Knot windows consistent.

Streaming hangs an **HDD detection alert** stripe on the header; a finished
reply pops an **S-rank** outlined card; waiting shows the **Bangboo** loader
and a spinner; the token counter is a pulsing **COMBO** plaque; menu items
are **dialogue-option chamfer boxes**; the empty-session hero flashes
**PRESS ANY KEY**; switching sessions plays a **white flash + noise frame**;
errors raise a **Hollow corrosion** red fog; long tasks run a **Hollow
deep-dive** progress rail; voice streaming draws **sound-wave bars**; the
settings dialog becomes an **investigation report** (ruled paper plus a
CONFIDENTIAL stamp); the sidebar carries a **DATA BANK** nameplate; usage
cards flip like **settlement cards** on hover; the new-session button hides a
**gashapon easter egg**; the panellist scans with **Hollow-watch contour
lines**. Six camera-language moves round it out (CRT power-on/off, staggered
entrances, focal push-in, glitch tear, type jitter). Every animation stops
under `prefers-reduced-motion` (verified on a real device: animationName
none across the board).

## Host compatibility

- Written against the current official UI (`@deepseek-ai/dsh-web-app`):
  layout-class anchors (`_frame` / `_sidebarCol` / `_centerCol`, …) are
  double-hooked with semantic attributes.
- All skin CSS goes through the skin-center safety pipeline (selectors are
  force-scoped under `html[data-dsh-skin]`); no `@import`, no remote URLs.
- The native Skin Center settings page controls window opacity, bubble opacity
  and background blur. Blue bubbles retain a minimum opacity for readable white text.

## Copyright & licence

| Part | Author / rights holder | Licence |
| --- | --- | --- |
| Skin code & design | flower-moon | MIT |
| Key art (Sixth Street · Cunning Hares) | © miHoYo / HoYoverse | non-commercial fan use |

Zenless Zone Zero and its characters (Nicole, Anby, Billy, Bangboo) are the
property of miHoYo / HoYoverse. This skin is a non-commercial fan work with
no affiliation to, or endorsement by, the rights holders. See `NOTICE`.
