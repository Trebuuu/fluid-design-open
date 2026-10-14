# Fluid Design Open 1.0 — build contract

This is the contract every module and page of Fluid Design Open works to. It
fixes names, ownership and quality bars so that many files written in parallel
compose into one system.

If something in here is wrong or impossible, do not silently diverge: do the
closest correct thing and report the deviation.

---

## 0 · What Fluid Design Open is

**A measured modern web design language with a violet accent.** Three parts, one
system:

| part | what it provides |
|---|---|
| **Web tokens** | the `--sk-*` neutrals, a 14-step type ramp, 28px cards, content width, band rhythm, a declarative scroll-keyframe system, springs, morphs (pill→panel, chip→card, drop→bubbles), gallery/tab/detent micro-interactions |
| **The glass material** | a stack (lens rim, colour transform, top highlight, dark edge, adaptive shadow), regular/clear, interactive press + glow, morph by identity, merge by spacing, materialize (not fade), scroll-edge effect, floating/minimising tab bar, sheets glass→opaque, three corner kinds, the tint slider, the accessibility behaviour |
| **Engines** | the fBm painter's saturated art, a dusty glowing primary, directional scrims, superellipse SDF corners, spring maths, OKLCH palette fitting, symbols, charts, instruments |

**The one-line test:** a page built from this system should have consistent
type, spacing, radius, band rhythm and motion; only the colour and the content
are yours.

### Principles (these decide disputes)

1. **Morph, don't swap.** A thing that changes state changes shape; it does not
   cross-fade into a different thing (pill→panel, chip→card, drop→bar).
2. **Glass is chrome, content is opaque.** Bars, capsules, controls over media,
   sheets at partial height. Never a card, table, chart or number. Never glass on
   glass. (`.layer-content` removes the material structurally.)
3. **A lens needs something to bend.** Glass sits over real imagery (the art
   painter, media, scrolling content) or it is a bordered box.
4. **Colour is a role, never a value.** Nothing outside the token files names a
   colour. One tinted primary per view.
5. **Motion is a spring, interruptible, and it reports state.** Duration+bounce
   springs for everything interactive; cubic curves only for fire-and-forget
   scroll choreography. Reduced motion removes displacement, never information.
6. **Scroll is the timeline.** Marketing surfaces are choreographed by scroll
   position, calmly: one idea per viewport.
7. **Density follows motion.** Glass gets denser (more blur, more fill) while it
   moves or morphs, and relaxes at rest (control bar: 7→14px, 72%→100%).
8. **Measured, not asserted.** Every engine claim has a self-test assertion that
   was seen red first.

---

## 1 · Layout of the tree, ownership, load order

```
/
  SPEC.md  README.md  API.md
  assets/
    inter-latin.woff2 inter-latin-italic.woff2 geist-mono-latin.woff2   (see FONTS-LICENSE.txt)
    fg3-tokens.css      non-colour tokens: type, space, radius, corner, z, elevation, material recipes
    fg3.css             reset, base, type roles, layout/grid/bands, links, focus ring, utilities, a11y modes
    fg3.js   → FG3      boot, tone, capability gate, concentric, corner fallback, reveal fallback, number roll
    fg3-color.css       GENERATED default palette (violet on neutral greys), both tones + increased contrast
    palette.js → PALETTE OKLCH engine (fixed, + neutrals + on-art inks)
    geom.js  → GEOM     continuous-corner calibration
    lg3.css  lg3-core.js → LG3   the material
    art3.js  → ART3     backdrop painter (fBm look) — readable-canvas contract
    spring.js → SPRING  springs + fixed-step integrator + velocity-seeded linear()
    fg3-springs.css     GENERATED: every spring as --sp-<name> linear() + --sp-<name>-ms
    motion.js → MOTION  spring on props, drag+projection, view transitions + MORPH primitive
    anim.js  → ANIM     declarative scroll keyframes (CSS-first compiler + JS fallback)
    fg3-motion.css      motion tiers, reveal presets, scroll presets, reduced-motion twins
    symbols.js → SYM  fg3-symbols.css   glyphs
    chart.js → CHART  fg3-chart.css     charts incl. rings, dial, strip
    device.js → DEVICE  fg3-device.css  device frames: phone, duo (foldable), laptop, browser window
    fg3-components.css  ui.js → UI      controls + containers + overlays
    fg3-chrome.css  chrome.js → CHROME  bars, tab bars, sidebars, toolbars, sheets, menus, scroll edge, live capsule, glass control bar
    fg3-showcase.css showcase.js → SHOW product-page section kit
  tools/      shoot.mjs · serve.mjs · gen-springs.mjs · gen-palettes.mjs · artifact-build.mjs · audit tooling
  *.html      pages
```

**Script load order** (end of body), then `FG3.boot()`:

```
geom.js spring.js palette.js art3.js lg3-core.js fg3.js symbols.js chart.js
motion.js anim.js device.js ui.js chrome.js showcase.js
```

**Stylesheet order** (head): `fg3-tokens.css fg3-color.css fg3-springs.css
fg3.css lg3.css fg3-motion.css fg3-components.css fg3-chrome.css fg3-showcase.css
fg3-symbols.css fg3-chart.css fg3-device.css`.

Every module is a plain browser script (IIFE) that defines ONE global (names
above) and does not throw if a later module is absent. No bundler, no imports,
no network at runtime (a strict CSP can block every external origin), no
external fonts or CDNs. Modules mount from `FG3.boot()`, never by themselves —
except that a module may expose `mount(root)` which boot calls. Every public
function is documented in a header comment of its file. Files are UTF-8 but keep
displayed non-ASCII in HTML as entities where cheap (publishing may drop the
charset).

**Namespaces.** Material attributes `data-lg3*`, class `.lg3`. Motion
attributes are `data-anim-*` (see §5). Component classes are
unprefixed semantic names listed in §7 — they are the contract between CSS
authors and page authors, so use exactly these names. CSS custom properties:
colour roles unprefixed (`--label`), everything else by family (`--t-*`,
`--s-*`, `--r-*`, `--sp-*`, `--ease-*`, `--d-*`, `--z-*`, `--mat-*`, `--lg3-*`).

---

## 2 · Colour (generated, everyone consumes)

Roles, per tone (`[data-tone="light"]` / `[data-tone="dark"]`, on `<html>` and on
any band), plus a `prefers-contrast: more` block and a `[data-contrast="more"]`
twin:

```
--bg-1 --bg-2 --bg-3 --bg-elevated            page · alt band/grouped · tertiary · raised
--label --label-2 --label-3 --label-4         #1d1d1f #6e6e73 #86868b + a 3:1 fourth (light)
--label-3-on-fill --label-4-on-fill --label-inv
--fill-1 --fill-2 --fill-3 --fill-4           alpha fills (controls)
--separator --separator-opaque
--link                                        light #0066cc · dark #2997ff unless the brand re-tones it
--accent --accent-ink --accent-solid --accent-fill --accent-hover --accent-active
--on-art-1 --on-art-2                         near-white brand-tinted inks fitted against rendered art
--ok --warn --bad  (+ -strong, -ink, -fill)
--sys-blue --sys-green --sys-red --sys-orange --sys-yellow --sys-pink --sys-purple
--sys-indigo --sys-teal --sys-cyan --sys-mint --sys-brown   
--series-1 … --series-6                        data hues (the validated categorical set)
```

Light neutrals are `#fff`, `#f5f5f7`, `#fafafc`, `#e8e8ed`,
`#d2d2d7` and the labels above. Dark: `#000` page, `#161617`/`#1d1d1f` raised,
dark nav `rgba(22,22,23,.8)`. Hover/active colours are fixed values,
never opacity or filters. Accent: the default brand is violet
`#7c5cff` with a **dusty** primary fill `#7a68c4 → #4f4184` and its
own-tone glow. A product's primary action is emphasised by fill (white/ink pill),
never by hue; red only for Stop and errors.

`palette.js` stays available at runtime for the playground, but **pages link
the generated static CSS** (the head-injection cascade trap: a head-injected
stylesheet loses to a body-linked one).

## 3 · Type, space, radius, corners

- **Font stack**: `-apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif` with Inter bundled (variable, `opsz` 14–32, `wght` 100–900; `font-optical-sizing:auto`). Mono: `"Geist Mono", ui-monospace, Menlo, Consolas, monospace` (Geist Mono bundled). The system UI font is used where available; everything else gets Inter. Keep the 19px display/text switch as a token.
- **Web (marketing) ramp** — 14 steps (12/14/17/19/21/24/28/32/40/48/56/64/80/96) with a line-height and letter-spacing per step. Roles: `.t-hero` (80/84 600 −.015em → 64 / 48 / 40 at 1068/734/480), `.t-headline` (56), `.t-section` (48/52 600), `.t-title` (40), `.t-subtitle` (28/32), `.t-lede` (21/29 400, grey with `<strong>` in `--label` same weight), `.t-body` (17/25 −.022em), `.t-callout` (19/23), `.t-caption` (14/18), `.t-micro` (12/16), `.t-eyebrow` (17–21 600, accent or label-2), `.t-stat` (40/40 600 with 14/18 captions above/below). Weights are 600 and 400. Nothing grows above 1441px.
- **App (UI) ramp** — a type table at the default size: `.ui-large-title` 34/41 700, `.ui-title1` 28/34, `.ui-title2` 22/28, `.ui-title3` 20/25, `.ui-headline` 17/22 600, `.ui-body` 17/22, `.ui-callout` 16/21, `.ui-subhead` 15/20, `.ui-footnote` 13/18, `.ui-caption1` 12/16, `.ui-caption2` 11/13, with tracking per size. Dense console variant `data-density="compact"` steps everything down one.
- `text-wrap: balance` on headings, `pretty` on paragraphs, `tabular-nums` in numeric columns. Sentence case. Prose ≤ 680px.
- **Grid/layout**: `.viewport-content` = `width: 87.5%; max-width: 1260px` (420px ≤ 734). 12 columns, 20px gap. Breakpoints 1441/1068/734/480 (`--bp-*` documented; media queries literal). Full-bleed rails padded `max(6.25vw, (100vw − 1260px)/2)`.
- **Bands**: `section.band` with `data-band="story"` (#fff, 128/96/80 padding), `"utility"` (`--bg-2`, 144/120/112; 224 bottom when it holds a sticky glass bar: `data-band-bar`), `"stage"` (black / art, for material & film scenes, dark tone). Same-tone neighbours collapse the seam; a band may fade into the next (`data-band-fade`).
- **Spacing** `--s-1..14` = 4 8 12 16 20 24 32 40 48 64 80 96 128 144.
- **Radius**: `--r-xs 8` (small rect buttons), `--r-sm 12`, `--r-md 18` (tiles, small platters, collapsed floating nav), `--r-lg 28` (cards, galleries, modals — THE content radius), `--r-xl 32` (expanded floating chrome), `--r-2xl 44` (sheets, big panels), `--r-pill 999`; round controls 24/36/44/56/90. Inner radii are derived (`data-concentric`: inner = outer − gap, min 6; a capsule's child is a capsule).
- **Corners — three kinds only**: *fixed* (token radius, continuous), *capsule* (true semicircle ends — NOT superellipse), *concentric* (derived). "Continuous" = `corner-shape: superellipse(var(--k))` with the radius scaled so that the corner's visual mass (diagonal inset) matches a continuous corner of the token radius — `geom.js` calibrates `--k` and the radius multiplier (`--r-scale`) and documents the numbers; `fg3-tokens.css` applies them via `--r-*` tokens. Fallback where `corner-shape` is unsupported: FG3 walks the stylesheets for every selector that declares `corner-shape` and applies the generated clip-path.

## 4 · Material — `lg3`

Four kinds, one attribute:

| `data-lg3=` | what | where | cost |
|---|---|---|---|
| `glass` (default, `data-lg3` alone) | the glass material: backdrop blur ≈8px with margin, per-surface colour transform, refraction band at the rim (Chromium only, budgeted), top-weighted highlight, **dark edge**, adaptive shadow, adaptive tone for small hosts (hysteresis), thicker look for large hosts | floating controls, tab bar, capsules, sheets, hero chips | high |
| `clear` | same optics, much less frost, mandatory dim layer (≈35%, deeper over bright media) | controls over photos/video | high |
| `chrome` | the web material: `saturate(180%) blur(20px)` over `rgba(250,250,252,.8)` / `rgba(22,22,23,.8)` (.92/.88 without backdrop-filter), 1px ring | global/local nav, sidebars, toolbars that span an edge | low |
| `platter` | control fill `rgb(232 232 237/.72)` + blur(20) + inset .5px ring (dark `rgba(66,66,69,.72)`) | small controls on media (pose chips, paddles) | low |

**Refraction engine**: optics (profiles, Snell offset, clamp tilt, dispersion,
buildFilter, sampleBackdrop, adapt, spreadGlow, resize fallback) with (a) a
target of ≥ 8px max and
≥ 2px mean displacement on a 50px bar; (b) the gate is
an engine check (Chromium brand AND not a software renderer) — WebKit parses
`url()` in backdrop-filter and drops it; (c) a **budget**: at most
3 refracting hosts on desktop, 1 on phones; others fall to the frost path
automatically, priority by `data-lg3-priority`; (d) a **morph-capable map
pipeline** so a glass silhouette can change size every frame without the smear
(preferred: 9-slice inside the SVG filter — corner tiles baked once per
(r,k,bezel,light), edge tiles stretched with `preserveAspectRatio="none"`,
sizes updated as primitive attributes per frame; measure it).

**Behaviours**: `data-lg3-interactive` (press: lift/scale on the `--sp-lift`
spring, glow from the touch point that spreads to neighbouring glass in the same
`data-lg3-container` falling off with the real gap), `data-lg3-live` (highlight follows pointer/tilt), `data-lg3-adaptive`,
`data-lg3-tone`, `data-lg3-size`, `data-lg3-priority`.

**Containers, merge and morph**:
`data-lg3-container="<spacing px>"` shares one sampling context; children with
`data-lg3-shape` fuse by smooth union when within `spacing` (bridge closes at
k ≥ 2g). Children with `data-lg3-id="x"` MORPH: `LG3.morph(fromEl, toEl, {spring})`
animates silhouette (rect + radius), density and content cross-over between two
elements that share an id — used for button→menu, button→sheet, pill→panel.
`LG3.materialize(el)` / `LG3.dematerialize(el)` bring glass in by ramping
refraction scale, blur and a slight scale (0.9→1), never `opacity` on the host
(opacity < 1 on an ancestor kills the backdrop pass — the #1 trap).

**Global controls**: `LG3.setTint(0..1)` = the "clear ↔ tinted" slider
(default .5; forced to 1 under reduced transparency / increased contrast);
`LG3.setReduceTransparency(bool)` mirrors `prefers-reduced-transparency` because
some browsers cannot detect it; `html[data-reduce-transparency]` is the
single CSS hook.

**Art — `ART3`**: the fBm domain-warp painter (ramp
palettes, warp .55, vertical bias .18, vignette, grain) as the brand backdrop,
palettes derived from a brand accent plus named ones (`aurora`, `twilight`,
`ember`, `deep`, `dawn`, `steel`, `paper` for light). Acceptance:
hero crop OKLCH C ≥ .10, ≥ 70% vivid, ≤ 5% grey. Contract:
deterministic seed, synchronous first paint, `data-lg3-source` set when painted,
event `art3:painted`, then `LG3.adapt()`. Optional `data-art-drift` = slow
transform-only drift of the canvas (no repaint), off under reduced motion. The
diagnostic scene (streaks, text rows) exists only as `data-art="fixture"`
for tests.

## 5 · Motion

**Springs** — `SPRING` provides a duration+bounce API and adds: a fixed-60Hz semi-implicit integrator with accumulator and `retarget` that
keeps velocity, and
`linearFrom(x0, v0, target)` that re-emits a CSS `linear()` seeded with the
current velocity (some browsers cap rAF at 60Hz on high-refresh screens; CSS runs at the display rate).
Generated tokens (`fg3-springs.css`, via `tools/gen-springs.mjs`):
`smooth .5/0 · snappy .5/.15 · bouncy .5/.3 · interactive .15/.14 ·
press .22/.12 · toggle .32/.15 · move .46/.18 · sheet .55/.10 · morph .6/.22 ·
select .4/.15 · lift .25/0 · hold .356/.41 · follow .196/.1 · settle .63/0 ·
card .5/.16 · tour .5/.42 · drop .63/.6 · nav-in / nav-out (local nav) ·
snap .32/0`. Each: `--sp-<n>: linear(...)` and `--sp-<n>-ms`.

**Curves** (by frequency of use):
`--ease-standard cubic-bezier(.4,0,.6,1)`, `--ease-decel (0,0,.2,1)`,
`--ease-out-cubic (.33,1,.68,1)`, `--ease-in-out-quad (.45,0,.55,1)`,
`--ease-in-out-cubic (.65,0,.35,1)`, `--ease-card (0,0,.5,1)`,
`--ease-pop (.3,2,.5,1)`, `--ease-exit` (easeInQuad). Durations
`--d-100 … --d-900` (100/200/240/320/400/500/800/900). Staggers 20/40/80/150ms.

**Declarative scroll keyframes — `ANIM`**:
`data-anim-scroll-group`, `data-anim-keyframe` (and `-0`…`-10`),
`data-anim-classname`, `data-anim-event`, JSON keys
`start end anchors easeFunction ease breakpointMask disabledWhen cssClass toggle
event hold` plus animated props `opacity x y z scale scaleX scaleY rotation
clip --anyVar`. Expression language: `t b h w`, `aN` anchors, `vh vw px %`,
`css(--var[,aN])`, `min max calc`, ternaries (the evaluator is covered by `tools/test-motion.mjs`). A
CSS-first compiler maps every linear `T + c·H + K` onto `animation-timeline:
view()` with `animation-range: exit-crossing calc(c·100% + K)` (verified in Edge
153); a JS path (lerp `1-(1-ease)^(dt·60)`, full offsetParent measurement)
handles everything else and every browser without `animation-timeline`.
Presets on top, same engine: `data-reveal="up|fade|scale|stagger"`
(StaggeredFadeIn: 30px, .7s/.9s, .15s stagger, easeInOutQuad at t−85vh),
`data-scene` (sticky tall scene writing `--progress` 0→1), `data-parallax`,
`data-clip-expand` (card→full-bleed via `--clip-path-progress`), `data-scrub`
(video `currentTime` or canvas image sequence), `data-count` (count-up),
`data-sweep` (gradient text sweep). Capability gate on `<html>`:
`fd-enhanced` / `no-fd-enhanced` (reduced motion, tiny viewports, text zoom),
as an `enhanced` gate.

**MORPH primitive** (in motion.js): `MOTION.progress(el, to, {spring})` drives
one `--progress` custom property on a spring (interruptible); CSS derives
radius, padding, width, font-size, translate and glass density from it with
`calc()`. This one mechanism powers nav pill→panel, chip→card, tab-bar
minimise, live capsule compact↔expanded, and the drop→bar intro. Also: `spring(el, prop, …)`, `draggable` with projection + rubber band +
snap (for detent sliders, sheets, carousels), `navigate`/`shared` view
transitions, `attention`, `swap`.

**Motion tiers & reduced motion** (`fg3-motion.css`): a behaviour × purpose
matrix: no blanket
`*{animation-duration:1ms!important}`; state-reporting indefinite motion
survives (slowed/flattened); displacement becomes a short fade; parallax,
scrub and ambient drift go; `--progress` jumps to its end. The self-test must
check COMPUTED durations under forced reduced motion.

## 6 · Devices & data

`DEVICE` draws generic device art in CSS/SVG: `data-device="phone"` (slab, continuous corners ~ 55px,
camera pill), `"duo"` (a book-style foldable: two panels on a hinge with an inner
screen and an outer screen; `data-device-state="closed|tent|laptop|open"`,
3D CSS transforms, driven by `DEVICE.fold(el, 0..1)` and a detent slider),
`"laptop"`, `"browser"` (a window with a toolbar). A `.device__screen` slot
takes live DOM (our mockups render inside the device, scaled). The camera-pill
area hosts the live capsule.

`CHART` adds to the base chart types: `rings` (concentric activity rings, spring in on value change), `dial` (24h radial timeline with segments and
a now-hand), `strip` (event strip: height = asked, fill = done, outline =
empty — a job-run strip). Charts are content: opaque, never on glass.
`SYM` adds glyphs for: phone, phone-fold, bolt, flame, heart, person-add,
person-remove, bubble, paperplane, target, map, shape/sliders, shield, waveform,
record, camera, list-bullet, calendar, chart-bar, sparkles, play-pause, lock.

## 7 · Components — canonical class names

**Controls & containers** (`fg3-components.css`, `ui.js`):
`.btn` + `.btn-primary` (brand fill, own-tone glow) `.btn-secondary` (outline
pill) `.btn-plain` (text + chevron link) `.btn-tinted` `.btn-glass`
`.btn-icon` (round 36/44/56) sizes `.btn-s/.btn-m/.btn-l/.btn-xl` (24/36/44/56
tall) · `.link-chevron` · `.field` `.search` `.textarea` `.select` ·
`.switch` (toggle) `.check` `.radio` · `.slider` (+`.slider-detent`,
rubber-band thumb) · `.stepper` · `.segmented` (sliding indicator, 320ms
ease-out, label flip after 160ms; `.segmented-glass` variant = merged lens) ·
`.chip` `.token` `.badge` `.pill-status` (with dot, pulses while live) ·
`.avatar` `.avatar-stack` · `.card` `.tile` (bento) `.card-media` (inset(1px round R)) ·
`.list` `.list-inset` `.row` (grouped list row, chevron, detail) · `.table` ·
`.stat` · `.progress` `.progress-ring` `.spinner` (activity indicator)
`.skeleton` · `.toast` `.banner` `.alert` (centred alert) · `.popover`
`.tooltip` `.menu` (context menu, morphs from its button) · `.empty-state` ·
`.kbd` · `.divider`. `UI`: anchor (popover + anchor positioning with fallback),
menu (morph from trigger via LG3.morph), toast, tooltip, stepper, slider,
segmented, detent slider.

**Chrome** (`fg3-chrome.css`, `chrome.js`): `.globalnav` (top
bar, chrome material, flyout that grows 240–480ms by height) · `.localnav`
(floating glass capsule 18px→32px radius, reveals after the hero, **morphs into
an Explore panel** on the `nav-in/out` springs) · `.navbar` (app nav bar, large
title that collapses on scroll, shrinks) · `.tabbar` (floating glass capsule,
selection lens travels on `--sp-select` and lifts on press; **minimises on
scroll-down**, restores on scroll-up; `.tabbar-accessory` bottom accessory;
`.tab-prominent`) · `.toolbar` (≤ 3 glass groups, one tinted primary trailing)
· `.sidebar` (floating inset, or edge-to-edge, background
extension) · `.sheet` (detents; glass at partial height, opaque at full;
morphs from its button) · `.scroll-edge` (soft/hard/auto) · `.control-bar`
(sticky bottom 32px, 56px, liquid-drop→bubbles intro, dot pill with
growing progress, round play/pause) · `.live-capsule` ("now"
component: compact ↔ expanded morph) · `.command` (pill→panel command
palette) · `.inspector` (glass side panel).

**Showcase** (`fg3-showcase.css`, `showcase.js`): `.hero` (+ price/CTA
platter) · `.lockup` · `.section-header` (headline ≤ 75% + CTA, 80px gap) ·
`.gallery` (highlights: 1260×612 cards, snap-center, dots → 48px progress
pill over 6.15s, play/pause bubble, caption parallax −.45×) · `.scroller`
(card rail + 36px paddles bottom-right, 1s easeInOutQuad) · `.bento` · `.feature-tabs`
(pill tab switcher driving media) · `.pose` (chips that morph into glass cards,
spring .5/.42) · `.stat-grid` (stat grammar, count-up) · `.compare` ·
`.scene` (sticky frame-down: media scales .9, inset 6.25%, radius 40 over the
last 60vh) · `.clip-expand` (card→full bleed) · `.headline-sweep` (gradient
text) · `.glow-ring` (mask-composite conic ring) ·
`.card-overlay` ("+" rotates into "×", modal sheet rises 0.8s easeInOutCubic
over a scrim that goes to .48 + blur 20) · `.footnotes` · `.swatches`
(colour picker with conic specular ring) · `.detent` (fold slider with
magnetic detents).

## 8 · Pages

`index` (the system as a product page — the argument and the hub) ·
`start` (adoption) · `docs` (the written system) · `color` · `type` · `layout`
(grid, bands, spacing, corners) · `materials` (glass lab + playground) ·
`motion` (springs, curves, scroll system, morphs — live) · `components` ·
`chrome` · `showcase` (section kit) · `patterns` (forms, overlays, states,
onboarding, settings) · `symbols` · `data` · `selftest` · `audit`. Every page ships in both tones and works at 402px.

## 9 · Quality bars (acceptance)

- Hero art: OKLCH C ≥ .10, ≥ 70% vivid pixels, ≤ 5% grey.
- Refraction on a 50px bar: ≥ 8px max, ≥ 2px mean displacement (Chromium).
- Text contrast ≥ 4.5:1 against the RENDERED ground, including text over art
  (the audit must rasterise the backdrop, not skip `.hero`/canvas/glass).
- Frame budget: ≤ 3 refracting hosts desktop / 1 phone; scroll at 60fps in Edge
  headless-with-GPU on the reference pages (measure with the perf probe).
- Reduced motion: layout identical, zero displacement, state indicators still
  moving; verified by computed-style assertions.
- Keyboard: every control reachable, visible focus ring (2px, accent,
  offset), 44px hit targets on touch.
- No page throws; no asset 404s; no external request.

## 10 · How to verify your module (everyone)

Serve: `node tools/serve.mjs .`. See it: `node tools/shoot.mjs <url> --width
1440|402 [--scroll steps:6] [--dark] [--reduced-motion] [--eval "<js>"]
[--console] --out shots` then Read the PNGs. A module is not done
until you have looked at it rendered, in both tones, and at 402px.
