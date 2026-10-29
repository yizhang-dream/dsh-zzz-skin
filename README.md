# New Eridu (新艾利都)

English | [中文](README.zh.md)

A Zenless Zone Zero theme for the DSH Web GUI. The official Cunning Hares
key art sits behind the conversation — replies are chat bubbles floating on
it, not a panel over it — and the light and dark modes are two
independent designs: dark is a **neon night run** (deep-violet night with
warning-yellow accents), light is **ink on paper** (a warm paper base with
black outlines and hard shadows) — not one palette with a filter over it;
panels, popups and menus each carry their own scheme per mode.

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

The visual language borrows the game's comic idiom, with colour in a
subordinate role: 2px black outlines, chamfered `clip-path` buttons, 4px
offset hard shadows, halftone dot screens, an SMPTE test-strip base bar,
`-2°` sticker badges and `//` title prefixes. The accent collapses into two
variables — `--zzz-accent` / `--zzz-accent-soft` at the top of `skin.css` —
defaulting to the game's warning yellow `#FFD84D`; switching to cyan or
magenta is a one-line edit.

## Motion (eighteen game elements)

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
- Bubble opacity, background occlusion and composer frost follow the
  skin-center sliders.

## Copyright & licence

| Part | Author / rights holder | Licence |
| --- | --- | --- |
| Skin code & design | flower-moon | MIT |
| Key art (Sixth Street · Cunning Hares) | © miHoYo / HoYoverse | non-commercial fan use |

Zenless Zone Zero and its characters (Nicole, Anby, Billy, Bangboo) are the
property of miHoYo / HoYoverse. This skin is a non-commercial fan work with
no affiliation to, or endorsement by, the rights holders. See `NOTICE`.
