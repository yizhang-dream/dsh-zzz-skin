# ZZZ

`dsh-eridu-skincenter` is the technical npm name; the product name shown in DSH
is **ZZZ**. This DSH Web plugin registers through the `dsh.bundle.patch`
and `dsh.client` fields.

A Zenless Zone Zero theme for the DSH Web GUI. ZZZ uses rounded charcoal windows
in dark mode and pale windows in light mode. The official key art is shown as a
static background through translucent surfaces. Agent messages use white
bubbles, user messages use blue bubbles, and the Inter-Knot treatment adds the
diagonal texture and INTER-KNOT watermark.

Settings → ZZZ controls surface material, the global wallpaper/avatar defaults,
and per-conversation avatar and wallpaper overrides. Knock Knock contacts bind
each session ID to a persistent avatar shared by the session row, conversation
header and assistant messages. Material and appearance choices are stored in
the current browser.

## Package contents

The npm tarball is self-contained. Installing it does **not** read
`Downloads`, contact a development host, require ffmpeg, download game assets, or need a
pre-populated `~/.dsh/skins`.

- `lib/` — the DSH server plugin and browser client.
- `cordis.patch.yml` — the DSH bundle registration patch.
- `bundle/` — default skins and the complete avatar library.
- `scripts/` — bundle build/verification and the optional local import tool.
- `README.md`, `LICENSE`, `NOTICE`, `CHANGELOG.md`.

### Bundle contract

```text
bundle/
├─ bundle-manifest.json          # schema, version, sizes and SHA-256 for every file
├─ skins/
│  ├─ zzz-zenless/
│  │  ├─ skin.json               # id, version, preview, image backgroundMedia
│  │  ├─ skin.css
│  │  ├─ patches.css
│  │  ├─ LICENSE
│  │  ├─ NOTICE
│  │  └─ assets/
│  │     ├─ wallpaper-zzz-keyart.jpg   # official key art; also used as preview
│  │     ├─ avatar-agent.webp
│  │     └─ bubble-arrow-*.webp        # assets referenced by patches.css
│  └─ zzz-console/
│     ├─ skin.json               # preview = null, backgroundMedia = null
│     ├─ skin.css                # base tokens + console colorway
│     ├─ patches.css             # base patches + console §C tail
│     ├─ LICENSE
│     ├─ NOTICE
│     └─ assets/                 # avatar and bubble arrows
└─ avatars/
   ├─ catalog.json               # 233 entries
   ├─ avatars/                   # 62 webp
   ├─ chat-icons/                # 76 webp
   └─ portraits/                 # 95 webp
```

The plugin reads bundled skins and avatars directly from its installation directory.
It does not copy them into the DSH home or modify installed package files. Optional
local resources in `$DSH_HOME/skins` and `$DSH_HOME/eridu-avatars` take precedence
for the plugin's own skin IDs and matching avatar files. Unrelated skins are not
listed or modified. Global selections are saved separately in `eridu-skins.json`
and `eridu-avatar.json` under the configured data directory.

`zzz-zenless` uses the official key art as its static light/dark background and
as its card preview. `zzz-console` is a pure graphite/paper colorway with no
wallpaper, so its preview is `null`; the client can draw a placeholder instead
of shipping a session screenshot. No real-user-session screenshots, no source
MP4 files and no user state (`active.json`, contact mappings, material settings)
are included.

## Requirements

- Node.js `>=22`.
- DSH `>=0.2.1-rc.2 <0.3.0`.
- Shared DSH packages are peer dependencies: `@deepseek-ai/cordis`,
  `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-client-runtime` and
  `@deepseek-ai/dsh-client-ui-slots`.

Install the packed tarball with the normal DSH plugin mechanism, for example:

```bash
dsh plugin --profile web add ./dsh-eridu-skincenter-1.4.0.tgz
```

There is no `postinstall` network step. The plugin requires the DSH Web
composition, which provides the `webServer`, `connection` and client slot services.
Every plugin API uses the host's connection authentication and origin checks.

Optional plugin configuration fields are `dataDir`, `skinsDir` and `avatarsDir`.
Leave them empty for the defaults: `DSH_HOME` (or `~/.dsh`), `skins` and
`eridu-avatars`. Relative resource paths resolve under `dataDir`; absolute paths
are supported. Only the plugin's selection files are written to `dataDir`.
Disabling the plugin removes its background, links and styles and restores the
previous material variables without deleting saved preferences. In-place disposal
was observed on the tested DSH 0.2.1-rc.2 host without a page reload. Reload an
already-open page after installing, updating or removing the package to ensure
that the host loads the current client code; reload also provides a fallback
after configuration changes.

## Building the bundle

`prepack` builds `bundle/` from the source repository. The script resolves the
source root relative to its own `fileURL`, not the current working directory:

```bash
npm run build:bundle
npm run verify:bundle
npm pack
```

When the package is installed without the source repository, `build:bundle`
verifies the shipped bundle against `bundle/bundle-manifest.json` and reuses it.
It never needs the original CSS tree, key art, avatar source or ffmpeg.

`verify:bundle` checks file hashes and sizes, manifest IDs and versions, CSS
`url(assets/...)` references, avatar counts, and rejects videos, user-state
files, scratch directories and unexpected raster previews (which could be
session screenshots).

## Optional local video skins

The 37 original-video cards are **not** in the npm package. They remain local
optional resources. To import already-prepared skin directories into a DSH home:

```bash
node scripts/import-custom-skins.mjs \
  --from /path/to/prepared/skins \
  --to "${DSH_HOME:-$HOME/.dsh}/skins" \
  --ids zzz-eridu-01,zzz-eridu-02
```

Rules enforced by the importer:

- only managed IDs: `zzz-zenless`, `zzz-console`, `zzz-eridu-01` … `zzz-eridu-37`;
- never deletes files or directories;
- never overwrites an existing target file unless `--replace` is passed;
- `--replace` still never removes files that are absent from the source;
- `--dry-run` reports the plan without writing; no activation or state changes.

## Licence

The software and original design are MIT licensed (see `LICENSE`).

| Part | Rights holder / source | Licence |
| --- | --- | --- |
| Skin code and design | flower-moon | MIT |
| Official key art (Sixth Street · Cunning Hares) | © miHoYo / HoYoverse | non-commercial fan use, **not MIT** |
| 233 avatar icons | © miHoYo / HoYoverse; catalogued/downloaded via zenless.tools | non-commercial fan use, **not MIT** |

Zenless Zone Zero and its characters are the property of miHoYo / HoYoverse.
This is a non-commercial fan work with no affiliation with, authorization from,
or endorsement by the rights holders. The MIT licence does not cover any game
artwork or game-derived asset. See `NOTICE` for details and sources.
