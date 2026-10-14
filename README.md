# Fluid Design Open

**A measured, self-contained web design system: tokens, a glass material, springs and morphs, components, charts and the instruments that prove a page is done.**

Fluid Design Open 1.0.0 is a design system for marketing pages, app shells and
consoles. It is plain files: CSS and browser scripts in `assets/`, with no
bundler, no package manager and no network at run time. Pages link the files
they use and call `FG3.boot()` once.

- **Tokens.** Type ramps, spacing, radii, continuous corners, bands, z-order,
  durations and curves, all as CSS custom properties. Colour is a role (`--label`,
  `--accent`, `--bg-1`), never a value.
- **The glass material.** `LG3`: a lens rim, a colour transform, a top
  highlight, a dark edge and an adaptive shadow, with refraction under a budget,
  merge by spacing, morph by identity and a tint slider.
- **Springs and morphs.** `SPRING`, `MOTION` and `ANIM`: named springs as CSS
  `linear()` easings, an interruptible morph primitive, drag with projection,
  and declarative scroll keyframes (`data-anim-*`).
- **Components.** Controls, containers, overlays, navigation chrome (global and
  local nav, tab bars, sidebars, sheets, menus, a command palette), a
  product-page kit and device frames.
- **Charts and symbols.** Sparklines, bars, rings, a 24-hour dial and an event
  strip; a set of SVG symbols that follow the type ramp.
- **Instruments.** A self-test of engine claims, a contrast and keyboard audit
  against the rendered ground, an accessibility-mode emulator and a frame-timing
  probe.

Licence: MIT (see `LICENSE`). The bundled fonts are under the SIL Open Font
License 1.1 (see `assets/FONTS-LICENSE.txt`).

---

## Adopt it

You need Node 24 and a Chromium-based browser (Edge or Chrome) for the
instruments. Nothing to install: there is no `npm install`.

1. **Copy `assets/`** into your project. Keep `FONTS-LICENSE.txt` next to the
   fonts.
2. **Copy `_partials/page-template.html` verbatim** and change only the
   `<title>`, the `aria-current` link in the site nav, the local nav's title
   and jump links, and the contents of `<main>`. The template carries the
   tone-before-first-paint snippet, the stylesheet and script order, and the
   closing `FG3.boot()` call.
3. **Pick a palette.** The default is `assets/fg3-color.css` (violet), generated
   from `assets/palette.js` by `tools/gen-palettes.mjs`. Pages link the generated
   CSS; they never run the palette engine.
4. **Call `FG3.boot()`** once, at the end of `<body>`, after the scripts you
   use. It mounts the modules in order (ART3, LG3, SYM, CHART, MOTION, ANIM,
   DEVICE, UI, CHROME, SHOW), sets the tone and the capability classes, and
   dispatches `fg3:ready`. No module mounts itself.

The minimum page links `fg3-tokens.css`, `fg3-color.css`, `fg3.css` and
`fg3.js`. Everything else is per feature. `start.html` shows the minimal page
running live, the ten rules and the first traps.

**Where to read next**

- `start.html`: the adoption recipe.
- `SPEC.md`: the build contract (names, load order, quality bars).
- `API.md`: what each module actually exposes. Where it disagrees with
  `SPEC.md`, `API.md` and the source headers win.
- `docs.html`: the written system.

### Tone

Do not put `data-tone` on `<html>` unless the page must be one tone: an author
tone beats the host's `data-theme`, so the viewer's appearance switch stops
working. When a page really must be pinned, also add `data-tone-lock`. The
precedence is the reader's choice, then the author's `data-tone`, then the
host's `data-theme`, then the system.

### Page conventions

Page layout goes in the template's `<style>` block. Use roles and tokens,
never a colour value. Prefix page-local classes with the page's short name
(such as `st-` on `start.html`) so they cannot collide with a system class.
Product surfaces drop `fg3-docs.css` and `docs.js`, which are documentation
furniture.

---

## Principles

Morph, don't swap. Glass is chrome and content is opaque. A lens needs
something to bend. Colour is a role, never a value. Motion is a spring that can
be interrupted. Scroll is the timeline. Density follows motion. Measured, not
asserted. They are in `SPEC.md` section 0.

---

## File map

```
README.md  SPEC.md  API.md  LICENSE
*.html            the site: overview, start, docs, foundations, components, instruments
_partials/        the page template
assets/           the system (CSS, scripts, fonts)
tools/            serve, see, emulate, time, test, generate, build
```

### Pages

| Page | What it is |
|---|---|
| `index.html` | The overview and the hub. |
| `start.html` | The adoption recipe: the minimal page running live, boot and tone, the ten rules with live specimens, the first traps and the instruments. |
| `docs.html` | The written system. |
| `color.html` | Roles, the palette and the contrast contracts. |
| `type.html` | The web ramp and the app ramp. |
| `layout.html` | The grid, bands, spacing and corners. |
| `materials.html` | The glass lab and playground. |
| `motion.html` | Springs, curves, the scroll system and morphs, all live. |
| `components.html` | Controls, containers and overlays. |
| `chrome.html` | Bars, tab bars, sidebars, sheets, menus and the live capsule. |
| `showcase.html` | The product-page section kit. |
| `patterns.html` | Forms, overlays, states, onboarding and settings. |
| `symbols.html` | The symbol set. |
| `data.html` | Charts and the stat grammar. |
| `selftest.html` | Every engine claim as an in-page assertion: 64 self-test assertions. The build checks any assertion count quoted in `index.html`, `start.html`, `docs.html` or this README against it. |
| `audit.html` | Contrast against the rendered ground, including text over art and glass, and keyboard reachability across pages. |

### Assets

| File | Global | What it is |
|---|---|---|
| `fg3-tokens.css` | | Non-colour tokens: type ramps, spacing, radii and corner hooks, heights, layout, bands, z, durations, curves, material recipes, shadows. The Inter and Geist Mono `@font-face` rules. |
| `fg3-color.css` | | The default palette, generated: violet on neutral greys, both tones, increased contrast. |
| `fg3-springs.css` | | Every named spring as `--sp-<name>` (a `linear()` easing) plus `--sp-<name>-ms`. Generated. |
| `fg3.css` | | Reset, base, tone plumbing, the `.t-*` and `.ui-*` type roles, layout, bands, links, focus, utilities, corners and the accessibility modes. |
| `fg3.js` | `FG3` | Boot, tone precedence, the capability gate, concentric radii, the corner fallback, `rollNumber` and `whenSeen`. |
| `lg3.css` | | The glass layers: tint, glow, highlight, rim, dark edge and dim. |
| `lg3-core.js` | `LG3` | The glass engine: refraction under a budget, frost, adaptivity, merge, `morph`, `materialize` and the tint slider. Needs `geom.js`. |
| `geom.js` | `GEOM` | Continuous corners, superellipse outlines and the signed distance fields the glass bends with. |
| `art3.js` | `ART3` | The backdrop painter: domain-warped fBm on a readable canvas. |
| `spring.js` | `SPRING` | Spring maths: named springs, a fixed-step integrator and velocity-seeded `linear()`. |
| `motion.js` | `MOTION` | The morph primitive `progress()`, springs on properties, drag with projection, the magnetic detent and view transitions. |
| `anim.js` | `ANIM` | Declarative scroll keyframes (`data-anim-*`), compiled to scroll timelines or run in script; the `data-reveal`, `data-scene`, `data-count` and `data-sweep` presets. |
| `fg3-motion.css` | | Motion tiers, the reveal and scroll presets, and the reduced-motion twins. |
| `palette.js` | `PALETTE` | The OKLCH palette engine. The generator and playgrounds use it at run time; pages link the generated CSS. |
| `symbols.js` | `SYM` | The symbol set as an SVG sprite: `<i data-sym="name">`. |
| `fg3-symbols.css` | | Symbol sizing on the type ramp, weights and variants. |
| `chart.js` | `CHART` | Sparklines, bars, series, rings, the 24-hour dial and the event strip. |
| `fg3-chart.css` | | Chart styling. Charts are content, so they are always opaque. |
| `device.js` | `DEVICE` | Device frames: phone, duo foldable, laptop and browser, with live DOM screens and the fold slider. |
| `fg3-device.css` | | Device art and hardware finishes. |
| `fg3-components.css` | | Controls, containers and overlays: buttons, fields, toggles, segmented controls, lists, tables, cards, menus, toasts and alerts. |
| `ui.js` | `UI` | Control behaviour: anchoring, menus that morph from their button, toasts, alerts, the segmented control, stepper and detent slider. |
| `fg3-chrome.css` | | The global nav, the floating local nav, navigation and tab bars, toolbars, sidebars, sheets, the control bar, the live capsule and the command palette. |
| `chrome.js` | `CHROME` | Chrome behaviour: morphs, minimising, sheet detents and the scroll edge. |
| `fg3-showcase.css` | | The product-page kit: hero, lockup, gallery, scroller, bento, tabs, pose chips, stats, scene, card overlay and swatches. |
| `showcase.js` | `SHOW` | Kit behaviour: the gallery autoplay, paddles, pose morphs, the modal sheet and the hero fold. |
| `fg3-docs.css` | | Documentation furniture: `.doc-code`, `.doc-specimen`, `.doc-table`, `.doc-note` and the rest. Documentation pages only. |
| `docs.js` | `DOCS` | A Copy button on every code block, and the contents list that follows the scroll. Documentation pages only. |
| `audit.js` | `AUDIT` | The page audit engine behind `audit.html`. `audit.html` only. |
| `inter-latin.woff2`, `inter-latin-italic.woff2` | | Inter 4, variable (wght 100-900, opsz 14-32), latin subset. |
| `geist-mono-latin.woff2` | | Geist Mono, latin subset, for code. |
| `FONTS-LICENSE.txt` | | The SIL OFL 1.1 notices for the fonts. Keep it next to them. |

---

## Instruments

Everything runs from the repo root with Node 24 and a local Chromium-based
browser. There is nothing to install. Each tool's header comment is its full
reference, and `tools/README.md` is the map.

```sh
node tools/serve.mjs . 8810            # http://127.0.0.1:8810/start.html
```

Always serve the folder. Under `file://` a stylesheet is cross-origin to its
page, and `document.styleSheets` throws.

```sh
# see a page, then read every PNG
node tools/shoot.mjs http://127.0.0.1:8810/start.html --width 402 --scroll steps:8 --out shots
node tools/shoot.mjs http://127.0.0.1:8810/start.html --width 1440 --dark --reduced-motion --out shots

# every accessibility mode, at both widths
node tools/emulate.mjs http://127.0.0.1:8810/start.html --widths 1440,402 --strict --out shots/emulate

# the self-test and the page audit, headless (both exit 1 on a failure)
node tools/run-selftest.mjs --width 1440
node tools/run-audit.mjs --width 402 --verify

# frame timing
node tools/perf.mjs http://127.0.0.1:8810/index.html --width 1440,402 --trace

# engines and generated files
node tools/test-color.mjs
node tools/test-motion.mjs --quick
node tools/test-geom.mjs assets/geom.js
node tools/check-vars.mjs
node tools/gen-springs.mjs --check
node tools/gen-palettes.mjs --check
node tools/artifact-build.mjs --selftest
```

| File | What it does |
|---|---|
| `tools/serve.mjs` | Serves the tree with the right charset. It can also emulate a static host from `dist/publish-map.json`, and 404s any file an artifact does not publish. |
| `tools/shoot.mjs` | Screenshots through headless Edge at any width, scroll position, tone and motion setting. `--eval` runs a snippet and `--here` captures in place. Exits 1 if the page threw. |
| `tools/emulate.mjs` | Light, dark, reduced motion, reduced transparency, increased contrast and forced colours at each width. It checks that each emulation took effect and records exceptions, errors and failed requests. |
| `tools/perf.mjs` | Frame timing on a real wheel gesture, in a fresh browser for every run. It can add the compositor's dropped-frame share. |
| `tools/run-selftest.mjs` | Drives `selftest.html` in headless Edge, prints every row and exits 1 on a failure. `--mutants` serves deliberately broken assets to prove each row can go red. |
| `tools/run-audit.mjs` | Drives `audit.html` over every page in `tools/pages.json` and exits 1 on a contrast failure, a keyboard problem or a page that could not load. `--verify` re-measures failures and a sample of passes from the screen's pixels. |
| `tools/artifact-build.mjs` | Builds `dist/` for publishing as a static bundle and runs refusal gates. `--selftest` breaks each gate on purpose to show it refuses. |
| `tools/pages.json` | The build manifest: the entries, the page list and the self-test count rule. |
| `tools/check-vars.mjs` | Fails on any `var(--x)` in `assets/*.css` that nothing declares. |
| `tools/gen-springs.mjs` | Writes `assets/fg3-springs.css` from `spring.js`. With `--check` it only verifies the file is current. |
| `tools/gen-palettes.mjs` | Writes `assets/fg3-color.css` from `palette.js`. With `--check` it only verifies it is current. |
| `tools/test-color.mjs` | Tests the generated palette, recomputing contrast independently of the engine. |
| `tools/test-geom.mjs` | Tests continuous corners against the reference corner curve. |
| `tools/test-motion.mjs` | Tests springs and the scroll-expression language, with mutants unless you pass `--quick`. |

In the browser, open `selftest.html` and `audit.html`. The audit waits for
**Run the audit** (or `audit.html?run`); opening it to read costs nothing.

Headless Edge on a machine set to dark mode captures dark pages. To capture
light, pass `--eval "FG3.setTone('light')"`. That call stores the choice in
the capture's own profile only. A UI change is done when it has been seen in
both tones, at 402 and 1440, and under reduced motion.

---

## What is measured, and what is chosen

**Measured.** Each value below has a test or an in-page assertion behind it.

- **Continuous corners.** Radius tokens are drawn as continuous corners:
  `superellipse(1.71)` at 1.53x the token, within 0.0114 r (Hausdorff
  distance) of the reference continuous corner. `tools/test-geom.mjs` checks it.
- **Springs and curves.** The spring conversions are exact, including nav-in
  and nav-out. `tools/test-motion.mjs` checks them.
- **Contrast.** The palette's contrast contracts (labels 7:1; secondary text,
  links and accents 4.5:1; tertiary 3:1 for large text and glyphs) are
  recomputed by `tools/test-color.mjs`. Audits measure against the rendered
  ground.
- **Engine output.** The art's chroma (`ART3.stats`) and the glass's refraction
  on a 50px bar (`LG3.stats`: at least 8px maximum and 2px mean in Chromium) are
  read from what the engines render.
- **Frame timing.** Measured on one machine (Edge 153 headless). Treat the
  numbers as relative.

**Chosen, not measured.**

- **Tint slider.** The end points of the clear-to-tinted slider are chosen;
  only 0.5 is the measured recipe.
- **Control geometry.** The tab bar's minimise hysteresis (32px down, 16px up)
  and the washes on large glass are choices, not measurements.
- **Not implemented.** The gallery's media counter-parallax and the product
  viewer's whole-device poses.
- **Computed radius.** A computed `border-radius` reads 1.53x the token,
  because the system matches the corner's visual mass rather than the raw
  number.

`API.md` records the other implementation notes, module by module.

---

## Credits and licence

- Fluid Design Open is released under the MIT licence (`LICENSE`).
- **Inter**: Copyright (c) 2016 The Inter Project Authors
  (https://github.com/rsms/inter). SIL Open Font License 1.1.
- **Geist Mono**: Copyright 2024 The Geist Project Authors
  (https://github.com/vercel/geist-font). SIL Open Font License 1.1.
- The full font notices are in `assets/FONTS-LICENSE.txt`. Keep that file with
  the fonts whenever you copy them.
- The font stack names `-apple-system` and `BlinkMacSystemFont` so each
  platform uses its system UI font; everything else uses the bundled Inter.
  All device art is original, and every name in the specimens is fictional.
