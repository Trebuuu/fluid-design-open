# Fluid Design Open 1.0 — API reference

The public surface of each module: tokens, classes, attributes, globals and events. The source file headers are authoritative where this disagrees.


## Tokens, type, layout, boot (fg3-tokens.css, fg3.css, fg3.js)

fg3-tokens.css (load first). Fonts: @font-face "Inter" (variable wght 100-900 + italic) and "Geist Mono", url(./...). Stacks: --font-text, --font-display (the 19px display/text switch is recorded as --t-display-from), --font-mono, --font.
Web ramp steps: --t-{96,80,64,56,48,40,32,28,24,21,19,17,14,12,10} in rem (html is 106.25%, so 1rem = 17px), each with -lh (unitless ratio) and -ls (em). Loose variants: --t-21-lh-loose, --t-19-lh-loose, --t-17-lh-loose, --t-14-lh-loose, --t-17-lh-button.
Web role tokens: --t-<role>-{fs,lh,ls,ff}, re-pointed at 1068/734/480, for hero, headline, section, title, subtitle, lede, body, callout, caption, micro, eyebrow, stat, stat-caption.
App ramp tokens: --t-ui-<role>-{fs,lh,ls,ff} (default size column). [data-density="compact"] swaps in the next size down.
Spacing: --s-1..14 = 4 8 12 16 20 24 32 40 48 64 80 96 128 144.
Corner hooks: --k-continuous (1.71) and --r-scale (1.53), both from GEOM.CONTINUOUS. Radii: --r-xs/sm/md/lg/xl/2xl = calc(8/12/18/28/32/44px * var(--r-scale)); --r-pill 999px; --r-min 6px.
Heights: --h-s/m/l/xl/xxl 24/36/44/56/90; --touch 44px.
Layout: --w-content (1260px; 420px at ≤734), --w-content-hero 1680px, --w-prose 680px, --w-min 320px, --grid-cols 12, --grid-gap 20px.
Bands: --band-pad-story (128/96/80), --band-pad-utility (144/120/112), --band-pad-bar (224/176/144), --band-pad-reduced (120/80/56), --band-header-gap (48/40/32), --band-fade-extra 69px, --band-stage-bg #000.
Breakpoints (documentation only): --bp-xlarge/medium/small/xsmall/nav.
Stacking: --z-base/raised/sticky/edge/chrome/float/scrim/modal/toast/tooltip (0 to 800).
Durations: --d-100/120/200/240/300/320/400/500/700/800/900 and --d-stagger-rapid/short/medium (20/40/80ms), --d-stagger (150ms).
Curves: --ease-standard, decel, out-cubic, in-out-quad, in-out-cubic, card, pop, exit (easeInQuad), nav, overlay, out-quint.
Focus: --focus-w 2px, --focus-offset 3px, --focus-offset-inline 1px. There is deliberately no root colour alias: fg3.css uses var(--focus-color, var(--accent)) at the element.
Materials: consume the RESOLVED names, which re-resolve on every [data-tone] element and switch themselves for no-backdrop engines, reduced transparency, increased contrast and forced colours:
- --mat-chrome-{bg,filter,ring}
- --mat-platter-{bg,filter,ring}
- --mat-control-{bg,bg-hover,bg-active,filter}, --mat-control-ink
- --mat-ring-w
Raw ingredients: --mat-*-fill, -fill-fallback, -fill-solid, -keyline.
Shadows (per tone): --shadow-tile (two-layer tile shadow), --shadow-hairline, --shadow-knob, --shadow-lift.

fg3.css — classes and attributes:
- Web roles: .t-hero .t-headline .t-section .t-title .t-subtitle .t-lede (grey, <strong>/<b> in --label at the same weight, max 680px) .t-body .t-callout .t-caption .t-micro .t-eyebrow .t-stat .t-stat-caption
- App roles: .ui-large-title .ui-title1 .ui-title2 .ui-title3 .ui-headline .ui-body .ui-callout .ui-subhead .ui-footnote .ui-caption1 .ui-caption2, plus .ui-emphasized
- Layout: .viewport-content, .prose, .grid-12 with .span-N / .span-md-N / .span-sm-N / .start-N (and a subset of -md-/-sm- starts). Children stack to 12 columns at ≤734.
- .rail: full-bleed padded rail; place it as a DIRECT child of a band.
- Bands: .band with data-band="story|utility|stage", [data-band-bar], [data-band-fade] (value utility|story|stage), [data-band-seam="keep|collapse"] on the lower band.
- .layer-content removes [data-lg3]/.lg3 material with !important.
- Links: an <a> with no class, or .link, gets --link and underlines on hover. A classed <a> inherits.
- Focus: :focus-visible gives the 2px accent ring with the offsets above.
- Utilities: .stack and .stack-1..14, .cluster, .sr-only, .tabular, .balance, .pretty, .center.
- Corners: .corner-continuous with .r-xs..r-2xl (sets --r), .capsule (corner-shape: round, --k: 1).
- Tone: [data-tone="light|dark"] on any element sets color-scheme and color:var(--label).
- Accessibility hooks: html[data-reduce-transparency], html[data-contrast="more"], and the matching media queries.
- Set by FG3: [data-fg3-corner], [data-fg3-capsule], .fg3-roll*.

fg3.js — global FG3:
- boot(opts) → state {version, ready, tone, capability, corners:{mode,count}, mounted[], errors[]}. Idempotent and never throws; a module that throws is recorded in state.errors and the rest still mount. Order: tone, stage bands (gain data-tone="dark"), gate, concentric, corners, then X.mount(document) for ART3 LG3 SYM CHART MOTION ANIM DEVICE UI CHROME SHOW, then concentric again. Finally it sets html[data-fg3="ready"] and dispatches document 'fg3:ready'. opts.cornerFallback = 'auto' | 'force' | 'off'.
- setTone('light'|'dark'|'auto') is persisted as localStorage 'fg3-tone'. getTone() → {tone, mode, source: user|author|host|system}. Precedence: user, then author data-tone, then host html[data-theme] (observed), then prefers-color-scheme. html[data-tone-lock] makes the author's tone beat a stored choice.
- capability() classes on <html>: fd-js; fd-enhanced / no-fd-enhanced with data-fd-cause = reduced-motion | viewport | small-desktop | text-zoom | override; fd-reduced-motion, fd-touch, fd-corner-shape, fd-refraction-capable, each with a no- twin. URL overrides: ?fd-enhanced, ?no-fd-enhanced, ?fd-reduced-motion, ?no-fd-reduced-motion, ?no-fd-corner-shape, ?fd-corner-shape.
- corners({reload}) → Promise<count>; cornerState() → {mode, rules, shaped[], modes, snapped[], foreign[]}; cornersReady (Promise); cornerClip(w,h,radii,k) → 'path("…")'.
- concentric(root) writes data-concentric-r and inherits the container's corner shape. refresh(root) re-runs concentric and corners for new DOM.
- rollNumber(el, to, {format, animate}): digit roll with a visually hidden real value.
- whenSeen(el, fn, deadline=1600) → cancel(). The deadline fires only if the observer has never reported.
- reduceMotion (MediaQueryList).
- Events on document: fg3:ready, fg3:tone, fg3:capability.
- Tone without a flash: the head snippet in fg3.js's header.

### Implementation notes

- Corner calibration: --k-continuous 1.71 and --r-scale 1.53 come from geom.js (GEOM.CONTINUOUS). Consequence: computed border-radius reads 42.84px for r-lg, not 28px. The 45° visual mass matches a 28px circular corner, but a raw comparison of computed border-radius shows different numbers. Reverting is two numbers in fg3-tokens.css.
- .t-hero at ≤480 is 40/44. A single marquee headline can use 48/52 at 402 (the showcase hero does).
- Seam collapse: consecutive utility and stage bands collapse (one padding between). Consecutive white story bands keep 128+128. data-band-seam="collapse|keep" overrides. The lower band loses its top padding, so an upper data-band-bar keeps its 224.
- The corner fallback is not a plain clip-path everywhere: a squircle clip over a circular border-radius fill renders the circle, and a drop-shadow patch is clipped by the element's own clip-path. Instead, per element: boxes with no painted edge are held at border-radius:0 and clipped to the exact superellipse. Boxes with a shadow, hairline or border get no clip; the radius becomes the circle of equal 45° mass. k<1 is a plain clip. Forcing the fallback in Chromium injects style#fg3-corner-emulation so it truly emulates browsers without corner-shape. Silhouettes measured within 0.06px of exact in both modes.
- Capsule snap: where a scaled continuous radius clamps on a short box, FG3 sets corner-shape:round (a capsule is a true semicircle). Concentric children inherit the container's corner shape, not just the radius.
- Platter dark fill is rgba(51,51,54,.72); the control fill is rgba(66,66,69,.72) and has no blur. The eyebrow colour is --label (ink #1d1d1f).
- Role sizes: .t-headline 56/48/40/32, .t-title 40/32/24, .t-callout 19/17/14, .t-stat 40/40 at every width. App ramp weights are Regular, Headline 600, Large Title 700, plus .ui-emphasized.
- whenSeen's deadline fires only when the IntersectionObserver never reported (a hidden page); otherwise off-screen content would run after 1.6s.
- The capability gate includes the InvalidViewport and SmallDesktop validators, so any 481–734px viewport is no-fd-enhanced (cause 'viewport'). Text zoom is detected by 1rem > 17.5px through a ResizeObserver probe.


## Geometry, material, art (geom.js, lg3-core.js, lg3.css, art3.js)

GEOM (geom.js: SUPPORTS_CORNER_SHAPE, KEYWORDS, resolveK, expFromK, outline, clipPath, normRadii, sdBox, smin, fieldAt, unitCornerField, warm, concentric, measureGap, isCapsule) PLUS: GEOM.CONTINUOUS {k:1.71, rScale:1.53, kExact:1.7120, rScaleExact:1.52866, insetPerR:.2915, extentPerR:1.5287, hausdorffPerR:.0114, source}; GEOM.continuous(r[,w,h]) -> {radius, k, capsule} (capsule -> radius h/2, k 1); GEOM.contCorner(r[,per]) -> [{x,y}] continuous-corner polyline; GEOM.contPath(w,h,r) -> SVG d of a continuous rect; GEOM.superellipseInset(R,k); GEOM.contInset(r). CSS: border-radius: calc(r * var(--r-scale)); corner-shape: superellipse(var(--k-continuous)) (fg3-tokens.css ships 1.71 / 1.53); capsules corner-shape: round.

LG3 (lg3-core.js + lg3.css; never self-mounts): LG3.mount(root)->n; apply(host); refresh(host); adapt(); morph(fromEl,toEl,{duration=.5,bounce=.18}|{spring:'name'})->Promise; materialize(el,opts)/dematerialize(el,opts)->Promise; setTint(0..1, default .5); setReduceTransparency(true|false|null); setEngine('refraction'|'frost'|null); setBudget(n|null); stats(host)->{max,mean,displaced,bezel,thickness,buildMs,tileT,tileMs,path}; material(host)->{blur,sat,scale,offset,B,C}; spring(d,b)->{at,settle,source}; sampleBackdrop(host); buildMaps(cfg); tileSet(p); getters engine, caps{chromium,renderer,software,backdrop,engine,detectMs,cached}, refracting, budget, tint; recipes, profiles, hosts, perf{morphMeanMs,morphMaxMs,morphFrames,lastBuildMs,lastTileMs,tileBakes,tileBakeMs,lastShapeFrameMs}.
Markup in: data-lg3=""|glass|clear|chrome|platter; data-lg3-recipe=panel|pill|bar; data-lg3-interactive; data-lg3-live; data-lg3-adaptive; data-lg3-tone=light|dark; data-lg3-size=small|large; data-lg3-priority=n; data-lg3-mode=frost; data-lg3-container="<spacing>" (on a host with [data-lg3-shape] children = smooth-union merge, k=2*spacing; on a plain parent = shared sampling + glow spread scope; data-lg3-glow="px" reach); data-lg3-shape; data-lg3-id; data-lg3-away (visibility hidden); tuning data-lg3-bezel/-thickness/-ior/-dispersion/-max-tilt/-blur/-rim-blur/-lens/-light/-elev/-shine/-profile(circle|lip|squircle|flat)/-rim-frac/-radius/-debug(map|frost|lens|rimOnly|joined|sat). data-lg3-off / .layer-content .lg3 removes the material.
Written by engine: class .lg3; data-lg3-kind; data-lg3-appearance=light|dark (ink + recipe; key label styling on this, NOT the band tone); data-lg3-engine=refraction|frost; data-lg3-size-class; data-lg3-pressed; data-lg3-morphing; data-lg3-merged; data-lg3-resizing; span.lg3-text wrappers around bare text nodes of morph/materialize targets; layers span.lg3__dim/__tint/__glow/__spec/__rim/__edge (+ transient .lg3__ghost). On <html>: data-lg3-engine, data-lg3-refracting="n/budget", --lg3-tint. Inputs on <html>: data-reduce-transparency (present = reduce, ="off" = force off), data-contrast="more", data-lg3-budget, data-lg3-hide-{lens,tint,spec,rim,edge,glow,shadow}. Also: data-lg3-landed (a landed morph holds its round corner until the page is still); span.lg3__veil (text/wash hosts); span.lg3__aa on every glass/clear host — the raster hint, one crisp-edged paint at alpha 1/255 that keeps the host out of multisampled raster; div[data-lg3-warm] on <html> for ~.6–1.4 s after mount — inert, aria-hidden copies of each glass structure at opacity 1/255 that compile its GPU programs in idle time (LG3.perf.warm = {copies, runs, ms, keys}).
CSS custom props: written --lg3-shadow-strength --lg3-shadow-hard --lg3-shadow-spread --lg3-dim --lg3-glow --lg3-glow-r --lg3-gx --lg3-gy --lg3-press-scale --lg3-mat --lg3-density --lg3-spec-boost --lg3-mx --lg3-my; tokens (override on :root) --lg3-ink-on-dark/-light, --lg3-spec-dark/-light, --lg3-rim-dark/-light, --lg3-edge-top/bottom-dark/-light, --lg3-chrome-*, --lg3-platter-*, --lg3-rt-*, --lg3-ic-*, --lg3-ease-lift/-hold. Consumes --mat-chrome-bg/-filter/-ring, --mat-platter-bg/-filter/-ring, --mat-chrome-fill-solid and --sp-lift(-ms), --sp-hold(-ms), all with fallbacks.

ART3 (art3.js): mount(root)->n; paint(canvas,{palette,seed,scale,warp,contrast,vignette,grain,accent})->ms; repaint(canvas); palettes{twilight,aurora,ember,deep,dawn,steel,paper}; fromAccent(hex)->ramp; stats(canvas[,rect])->{C,vivid,grey,L,n}; drift(canvas,on). Markup canvas[data-art=name|accent|#hex|fixture] data-art-seed/-scale/-warp/-contrast/-vignette/-grain/-accent/-drift. Contract: sync first paint when it has a box, data-lg3-source, bubbling 'art3:painted' {ms,palette,w,h}, then LG3.adapt(); DPR cap 2; drift is WAAPI transform only, off under reduced motion.

### Implementation notes

- Bevel profile default is circle (controls) / lip (large glass) with the sharp lensed rim reaching 60% of the bevel. A squircle profile put nearly all the bend in the outer 3 px and the lens barely read over soft art. squircle stays available via data-lg3-profile.
- data-lg3-container: on a host with [data-lg3-shape] children it merges them (smooth union, k = 2 x spacing, so any gap < spacing bridges); on a plain parent it is a shared sampling/glow/morph scope. Separate glass hosts cannot be fused into one silhouette on the web.
- Only single-shape hosts use the 9-slice map. Merged (union) hosts still whole-bake, rebuilt at <= 30 Hz while a shape transitions (7.5 ms per rebuild at 380x52, 0.3 ms on cache hits) and once at rest.
- The dark edge is a CSS layer (side-only 1 px border that tapers to zero at top/bottom), alpha .55 dark / .36 light (x .58 for the pill recipe). It draws on the outermost pixel inside the box. Merged hosts get a baked side-weighted edge image instead.
- The tint slider (clear<->tinted) mapping is an interpolation anchored so that .5 is exactly the measured recipe.
- The resolved tone is written to data-lg3-appearance; data-lg3-tone stays author input. Glass hosts set their own monochrome `color` per appearance.
- Morph mechanics: toEl is laid out at its final size, switched to position:fixed for the run, and has its box (left/top/width/height/radius/corner-shape) animated per frame. Its content is frozen in place and clipped; fromEl's content becomes a fading ghost; a placeholder is inserted if toEl was in flow; fromEl is hidden with [data-lg3-away] (visibility), not [hidden]. Bare text nodes in morph/materialize targets are wrapped in span.lg3-text.
- Art: aurora is toned navy -> blue -> green glow. The paper palette (light ground) does not meet the hero chroma bar (C .054) and cannot at its lightness. Portrait frames cap noise-cell stretch at >= 1.2:1 wide to avoid vertical streaks on phones. Grain uses seeded GPU pattern composites (lighter + difference), not a per-pixel JS loop.
- Engine gate adds a per-viewer localStorage cache of the WebGL renderer string, keyed by UA and wrapped in try/catch. The probe costs 36-72 ms cold. 'Phone width' for the budget is innerWidth < 735.
- LG3.morph/materialize accept {duration, bounce}, {spring: {duration, bounce}}, or {spring: 'name'} (resolved through SPRING).


## Springs, motion, scroll keyframes (spring.js, fg3-springs.css, motion.js, anim.js, fg3-motion.css)

SPRING (spring.js): Spring(cfg) where cfg is a name | {duration,bounce,velocity?} | {response,dampingFraction} | {mass?,stiffness,damping,velocity?}. It returns {duration,bounce,zeta,w0,stiffness,damping,mass,velocity,settlingDuration,peak,at(t),vel(t),from(x0,v0,target),linear(n),linearFrom(x0,v0,target,n)->{easing,from,to,target,ms,settlingDuration,at,vel},ms()}. Also: SPRING.linearFrom(cfg,x0,v0,target) · Layer(cfg,initial,onFrame,{rest}) (fixed 1/60 s semi-implicit Euler, accumulator, interpolated render; .setTarget keeps velocity, .snap, .step(dt), .stop, value/velocity/target/atRest) · Driven(cfg,initial,onFrame,v0?) (analytic; .to/.set/.stop; a move that starts at rest takes the spring's own velocity kick) · NAMED (24 springs: smooth snappy bouncy interactive press toggle move sheet morph select lift hold follow settle card tour snap drop bubble content dots nav-in nav-out legacy) · PRESETS · TIERS · get · table() · toLinear(fn,n,warp) · project(v,rate=.998) · rubber(over,dim,c=.55) · animate · dampingRatio · emitVars() · install() (playground only).
fg3-springs.css: --sp-<name> (a linear() easing) and --sp-<name>-ms for all 24; always use the two together.
MOTION (motion.js; never self-mounts): progress(el,to,{spring='morph',var='--progress',from,onFrame,onDone}) is the morph primitive; it writes the variable inline, is interruptible, carries velocity across a spring change (nav-in -> nav-out), sets [data-m-moving] while moving, and jumps under reduced motion. Also: spring(el,'x'|'y'|'scale'|'rotate'|'opacity'|'--var',target,{spring,from,frame,done}) (one composed transform built from --m-x/--m-y/--m-s/--m-r) · glide(el,'x'|'y'|'scale'|'rotate'|'opacity',target,{spring,from}) (compositor spring through WAAPI + linearFrom; x/y/scale use composite add; persisted) · draggable(el,{axis,bounds(),snap,onStart,onMove,onEnd,hysteresis,decelerationRate}) ([data-m-dragging]) · detent(el,{detents=[0,1/3,1],value,thumb,labels,onChange(v,i),onInput(v),magnet:{radius:.08,strength:.8},stretchMax:24}) -> {set(v,animate),value,index,stretch,destroy} (writes --detent-value, --detent-stretch (px), --detent-squash, --detent-dir and [data-detent-index]; the thumb is [data-detent-thumb] with role=slider and arrow/Home/End keys, or it syncs an inner input[type=range]) · navigate(update,{direction,types}) (typed view transition, sets html[data-nav]) · shared(el,name) · attention(el,kind) · swap(host,node,{off}) · mount(root) ([data-m-enter], [data-m-press]) · read · reduced · supports.
ANIM (anim.js; FG3.boot calls mount): mount(root) -> stats · refresh() · destroy() · addKeyframe/addEvent(el,json) -> {remove} · onScrub(el,fn(p)) · gate(force) -> {enhanced,cause,owned} · stats() · inspect(el) · expr/parse/evaluate/linearize/rangeOf · ease(name) · cssEasing(name) · bezier · EASE (20 easings) · BREAKPOINTS · forceJS · path ('css'|'js') · enhanced. Markup: data-anim-scroll-group and data-anim-keyframe / -classname / -event (each with slots '' and -0 to -10; a value may be a JSON array of keyframes). JSON keys: start end anchors easeFunction (a name | bezier() | cubic-bezier() | spring(m,k,c,v)) ease epsilon breakpointMask disabledWhen cssClass toggle event hold style, plus props opacity x y z scale scaleX scaleY rotation(Z|X|Y) clip ([t,r,b,l,rad] | [block,inline,rad] | [all,rad], in % and px) --custom currentTime scrollLeft scrollTop and camelCase CSS lengths. Presets: data-reveal='up|fade|scale|stagger' (items: [data-staggered-item], [data-staggered-item-no-translate]), data-scene (+[data-scene-sticky]) -> --progress, data-parallax='rate'|JSON, data-clip-expand -> --clip-path-progress, data-scrub (a video's currentTime; otherwise the 'anim:scrub' event plus onScrub, and --scrub-progress), data-count (+data-count-from, data-count-duration), data-sweep. Events: name, name:reverse, name:enter, name:exit (bubbling CustomEvent, detail {progress,direction}). State classes: .anim-armed .anim-in .anim-counted. Gate on html: fd-enhanced | no-fd-enhanced plus data-fd-cause and fd-text-zoom; URL overrides ?enhanced/?no-enhanced and ?fd-enhanced/?no-fd-enhanced; ?anim=js forces the JS path. CSS-path output goes to style#anim-compiled at the end of body, with data-anim-id on elements. ANIM owns translate/scale/rotate/animation-* on the elements it animates.
fg3-motion.css tokens: --ease-standard/decel/out-cubic/in-out-quad/in-out-cubic/card/pop/exit, --d-100…--d-900, --stagger-20/40/80/150, --m-near/mid/far/press/pop, --reveal-rise/-d-y/-d-o/-stagger (and --reveal-start, an expression read by ANIM), --scene-length/-min-h/-top, --frame-scale/-inset/-radius, --clip-inset, --clip-radius, --sweep-d, --sweep-1, --sweep-2. Classes: the .m-* tiers; .m-morph (view-transition-class; the group is clipped and rounded by --m-radius); glass popovers and dialogs ([data-lg3], .lg3, [data-m-no-fade]) never fade.

### Implementation notes

- bezier() parsing: the regex /\d*\.?\d+/g drops minus signs, so bezier(-0.24,0.65,0.39,1.56) plays as bezier(0.24,…). Signed curves must use cubic-bezier(…) (CSS semantics, x clamped to [0,1]).
- Expression semantics: in css(--x, aN), aN only chooses the element the value is read from; the value is evaluated in the unchanged keyframe context. var() evaluates like css(). Whitespace is allowed between a number and its unit.
- The spring(m,k,c,v0) easing has two quirks. When ζ ≥ 1 it uses the critical formula, not the over-damped one (nav-in has ζ 2.16). Its curve length is (first d where solve(d) === 1 for 16 steps of 1/6 s) × 1/6, not d. So nav-in (1.5,28,28,1) spans 2.0 s of the spring mapped onto 600 ms, and nav-out spans 1.75 s mapped onto 400 ms.
- cssClass, event and style keyframes always run in JS, including on the CSS path; CSS timeline-trigger isn't used. It is Chromium-only, can't emit events, and the JS cost is one comparison per scroll frame.
- Tween keyframes (and data-scene, parallax, clip and scrub) default to disabledWhen ['no-fd-enhanced'] when the JSON has no disabledWhen key. This applies principle 5 (reduced motion removes displacement). An explicit disabledWhen, including [], overrides it.
- An element goes to the JS path as a whole when its keyframes have different gates or breakpoint masks, or split one CSS property across keyframes (x in one, y in another), because a single CSS animation list can't express that. The CSS path orders animations by measured start and gives fill 'both' only to the first writer of each property, so sequential ranges (scrim fading in then out) work on both paths.
- Custom properties on the CSS path animate a private registered --anim-pN and set the public variable to var(--anim-pN). Global registration would change var(--progress, x) fallbacks in everyone else's CSS.
- ANIM's own gate implements ReducedMotion, InvalidViewport (five queries), TextZoom (a probe of 16px and medium font sizes, ≥1.2) and URL overrides. It does not implement SmallDesktop or LowPowerMode. FG3's gate includes small-desktop, and ANIM accepts whatever gate FG3 set.
- Formats defined here: clip = [[t,r,b,l,rad]|[block,inline,rad]|[all,rad], …]; data-parallax = rate × ±50vh over t−100vh → b; data-reveal='scale' starts at .96; count-up runs 1400 ms easeOutCubic when FG3.rollNumber is absent.
- MOTION.glide is a compositor spring through WAAPI + linearFrom. There is also a 'morph' view-transition type (root stays put) and the .m-morph group class.


## Colour, symbols, charts (palette.js, fg3-color.css, symbols.js, fg3-symbols.css, chart.js, fg3-chart.css)

PALETTE (assets/palette.js, window.PALETTE; runtime use is for the playground only; pages link the generated CSS)
  build({preset|accent, neutrals:'derived'|'steel'|{light,dark}, link:'accent'|{light,dark}, fill:'vivid'|'dusty'|{stops|solid,hover,active,ink}|{light,dark}, series, semantic:{dark:{ok,warn,bad}}, onArt, glow, accentInk, buttonContrast=4.5}) returns {name,label,from,accent,root,tones{light,dark},more{light,dark},report[],failures[]}
  toCSS(p,{header}) · install(opts,doc) (writes <style id=fg3-palette>) · coverage(p, consumerCssTexts) returns {referenced,needed,missing} · referenced(css)
  parse(c) · over(fg,bg) · ratio(fg,...groundsBottomFirst) · hexToOklch · oklchToHex · luminanceOf · contrast · hexLuminance
  ROLES · PRESETS {fluid}, each with `from` · NEUTRALS {derived, steel} · SYS (system hues [light,dark,IC-light,IC-dark]) · SERIES · MORE · ART
GENERATED CSS: assets/fg3-color.css (preset fluid, the default violet). Blocks: :root{--accent-base,--brand-rgb} · ':root,[data-tone="light"]' · [data-tone="dark"] · @media(prefers-color-scheme:dark){:root:not([data-tone])} · @media(prefers-contrast:more){[data-tone=light|dark]} · [data-contrast="more"][data-tone=…] and [data-contrast="more"] [data-tone=…]. Each tone block also sets color-scheme.
ROLES per tone (61): --bg-1 --bg-2 --bg-3 --bg-elevated · --label --label-2 --label-3 --label-4 · --label-2-on-fill (NEW) --label-3-on-fill --label-4-on-fill --label-inv · --fill-1..4 · --separator --separator-opaque · --link · --accent (ink) --accent-ink --accent-solid --accent-fill (always a gradient, valid for background and background-image) --accent-hover --accent-active (fixed colours) --accent-fill-hover --accent-fill-active (NEW, ready-made gradients) --accent-glow (NEW, own-tone glow colour) · --on-art-1 --on-art-2 · --ok/--warn/--bad + -strong (ink on the tint) -ink (ink on the solid) -fill (the tint wash, rgba .14) · --sys-{blue,green,red,orange,yellow,pink,purple,indigo,teal,cyan,mint,brown} · --series-1..6.
CONTRACTS: label 7:1; label-2, accent, link, ok/warn/bad, -strong, -ink, accent-ink and on-art 4.5:1; label-3 and label-4 3:1 (large text or glyphs only). Every contract holds against the hardest ground the role lands on. Fill ramp: fill-1 over the page = #e8e8ed / #333336 exactly. Test: node tools/test-color.mjs. Regenerate: node tools/gen-palettes.mjs [--check].
SYM (assets/symbols.js): mount(root) · sprite(doc) (#fg3-symbol-sprite, symbol ids #sym-<name>) · build(name,cls,label) · replace(host,name,{delay}) · names() · has() · count() (76) · resolve() (alias shape→sliders) · DIRECTIONAL (15). Markup: <i data-sym="name" data-sym-class data-sym-label>. Svg gets data-sym-name, data-sym-dir. Glyphs include: phone phone-fold bolt flame heart person-add person-remove bubble paperplane target map sliders(shape) shield waveform record camera list-bullet calendar chart-bar sparkles play-pause lock.
fg3-symbols.css: .sym (1em, vertical-align -0.13em) · the optical ramp keyed on .ui-* and .t-* type roles · .sym-xs..xl · .sym-light..bold · .sym-scale-sm/lg · .sym-hier · .sym-palette (--sym-layer-2/3) · .sym-variable (--sym-value) · .sym-ok/warn/bad · .sym-replace-out/in · .sym-bounce · .sym-noflip · .sym-row · [data-sym-missing]; vars --sym-optical --sym-weight --sym-1..4.
CHART (assets/chart.js): mount(root) · draw(host,v,opts) · sparkline · bars (true zero baseline) · series({format,idle}) · ring · rings(host,[{value,max,label,color:'series-N'|'--var',state:'cooling'|'restricted'}],{center,width,animateIn}) · dial(host,[{from,to,kind,label}],{now,animate,format}) with times as hours or "HH:MM" · strip(host,[{asked,landed,people?,empty?,arrived?,at,label}],{max,format,idle}) · hours(t). Markup: data-chart, data-values (CSV/JSON), data-label, data-value/data-max, data-now, data-center, data-area; sibling [data-chart-out] (readout) and [data-chart-legend] (rings legend). Writes data-chart-drawn, data-reading, data-chart-index, data-chart-missing, data-chart-refused, data-chart-settled. Uses SPRING.Driven when present ('snappy', 'settle', 'smooth' under reduced motion), with a fallback ease plus a deadline timer.
fg3-chart.css: [data-chart] (color = series, --ch-w, --ch-surface) · .chart-svg · .ch-ok/.ch-warn/.ch-bad/.ch-quiet/.ch-series-1..6 · rings .is-cooling/.is-restricted/.is-missing · dial kinds .k-done/.k-active/.k-planned/.k-empty/.k-lost/.k-warm/.k-idle/.k-error · strip .is-empty/.is-lost/.ch-enter · .metric .metric-name/.metric-value/.metric-delta(.up/.down) · refusal styling on [data-lg3]/.lg3/[data-chart-refused].

### Implementation notes

- label-3 contract: labels keep the neutral values with only the 4th fitted. The tertiary (#86868b light / #6e6e73 dark) measures 3.33:1 on #f5f5f7 and 3.32:1 on #1d1d1f, so label-3 carries a 3:1 contract (large text and glyphs). label-4 is fitted to 3:1 (#8d8e92 light / #67686d dark), so label-3 and label-4 are close. Small secondary text must use --label-2.
- Additional roles: --label-2-on-fill (#424245 / #d2d2d7; #6e6e73 has no headroom on any fill, it drops to about 3.85:1); --accent-fill-hover and --accent-fill-active (ready-made gradients); --accent-glow (the own-tone glow colour for .btn-primary).
- Fills: --fill-1 is tinted (ink rgb(0,0,55) at .09 light, rgb(241,241,255) at .212 dark) so that over the page it composites to #e8e8ed / #333336 exactly; the greys are cool and a neutral alpha cannot reproduce them. #d2d2d7 / #424245 is --separator-opaque. The --separator alpha is the keyline (rgba 0,0,0,.16 / 255,255,255,.24).
- Default series: blue, orange, cyan, indigo, yellow, purple, searched with the dataviz validator, excluding red, pink and brown. Light starts from the increased-contrast values and dark from the dark values pulled into L .48–.67.
- Strip fill uses `people` when a row has it, otherwise `done` capped at asked. Rows can complete more than people asked, so rows and people are different units.
- .metric .m-* is named .metric-name/-value/-delta, since the m- prefix collides with the motion namespace.
- The palette emits no material/chrome colours: fg3-tokens.css owns --mat-* (chrome, platter and control fills, per tone).


## Devices (device.js, fg3-device.css)

GLOBAL DEVICE (device.js; FG3.boot calls DEVICE.mount(document)):
- DEVICE.mount(root?) - builds every .device[data-device] and binds every .device-fold-slider under root. Idempotent.
- DEVICE.fold(el, to, opts?) -> Promise(settled value). `to` is 0..1 (slider position) or 'closed'|'tent'|'laptop'|'open'. opts: {spring:{duration,bounce}, immediate}. Default spring is the hinge {.7, 0}. Runs as WAAPI keyframes with a spring linear() easing; the curve comes from SPRING.Spring(cfg).linearFrom when loaded, else DEVICE's own closed form. It is interruptible and carries velocity. Under reduced motion it jumps.
- DEVICE.set(el, v) - jumps to a value or state name.
- DEVICE.value(el) / DEVICE.state(el) - current value and state.
- DEVICE.angle(v) - interior hinge angle in degrees: 0 -> 0, 1/3 -> 120, 1 -> 180 (monotone cubic).
- DEVICE.valueForAngle(deg) - the inverse.
- DEVICE.slider(sliderEl, deviceEl?) - binds a slider by hand.
- DEVICE.fit(root?) - re-measures screen scaling.
- DEVICE.pose(v) - the per-part pose for a value.
- Constants: DEVICE.DETENTS [0, 1/3, 1]; DEVICE.STATES {closed 0, tent (70 deg), laptop 1/3, open 1}; DEVICE.SPRINGS {hinge .7/0, follow .4/.4, stretch .2/0}; DEVICE.MAGNET {radius .08, strength .8}.
- EVENT on the duo: 'device:fold' detail {value, angle, state, settled}. It fires every frame while moving and once at rest, so listeners must be cheap.

MARKUP:
- Device: <div class="device" data-device="phone|duo|laptop|browser" [data-finish="light|dark|accent"] [data-fold="0..1"] [data-device-state="closed|tent|laptop|open"] [data-url="..."] (browser) [data-island="none"] style="--device-width:320px">
- Screens: <div class="device__screen" [data-screen="inner|outer"] (duo) [data-screen-width="402"]>live DOM</div>
- Slider: <div class="device-fold-slider" data-for="<duo id>" [data-label] [aria-labelledby]></div>. Without data-for it finds the nearest duo in an ancestor.
- Default screen sizes: the phone display is 402x874; the duo inner is 760x608 and the outer 362x608; the laptop is 1280x800; the browser content is 1280 wide.

WHAT MOUNT GENERATES (the contract for CSS authors):
- All devices: .device__viewport wraps the screen children when data-screen-width is set (width = W px, transform: scale(s); --screen-scale is set on the screen). The frame is sized in --u = 100cqw / logical width (phone 426, duo 788, laptop 1440, browser 1280). --lu is 1 logical px, both inside the scaled viewport and in the screen.
- Phone: .device__frame (metal; ::before is the glass bezel), .device__key[data-side=start|end] (with --key-y / --key-h), .device__glare, and .device__island (the camera pill). An author island is kept and moved into the viewport; the island grows to hold a live capsule.
- Duo: .device__ground > .device__shadow--base/--leaf; .device__camera (perspective) > .device__rig (preserve-3d; tilt via --device-tilt-x/--device-tilt-y) > .device__panel--end > .device__face--inner + keys, and .device__panel--start > .device__face--inner (holding .device__mirror, .device__sheen, .device__shade) + .device__face--outer (outer screen, sheen, shade) + .device__edge. The inner screen sits in the rig and gets .device__sheen + .device__crease overlays. The duo carries data-device-state. The inner screen gets .is-split while off the flat. inert + aria-hidden go on whichever display faces away.
- Laptop: .device__lid + .device__base.
- Browser: .device__window + .device__toolbar (.device__dots, .device__nav, .device__url).
- Slider: .device-fold-slider__track, __rail > __thumb[role=slider] > __skin + __glyph. [data-dragging] is set in own mode. Input goes through MOTION.detent(rail, ...) when motion.js is loaded, else DEVICE's own fixed-60 Hz detent simulator.
- Before mount, a CSS-only fallback applies to .device:not([data-device-ready]).

CSS CUSTOM PROPERTIES:
- Inputs: --device-width; --device-tilt-x, --device-tilt-y; --fold-slider-width (default 367px).
- Reads: --k-continuous (then --k, default 1.71); --r-scale (default 1.53); --accent-solid, --accent-ink, --accent, --bg-1, --bg-2, --fill-2, --fill-3, --label-2, --label-3, --separator, --separator-opaque.
- Finish tokens: --device-metal-hi, --device-metal, --device-metal-mid, --device-metal-lo, --device-seam, --device-glass, --device-display, --device-island, --device-shade, --device-sheen, --device-shadow, --device-rim, --device-thumb-shadow. The set is switched by --device-dark 0|1, which inherits from the nearest [data-tone] or can be forced with data-finish.

window.deviceSelftest() (when defined by a page) is async and returns {pass, total, failed}.

### Implementation notes

- Inner display aspect is 760x608 (1.25:1, a near-square ~7.6in class); the outer display is 362x608.
- Slider value maps to hinge angle NON-linearly: a monotone cubic through 0 -> 0 deg, 1/3 -> 120 deg, 1 -> 180 deg (the 1/3 'landing' pose is about 120 deg interior; the leaf foreshortens to cos about .5). So DEVICE.fold(el, .5) is about 138 deg, not 90. State names are defined by angle: closed <12, tent <90, laptop <170, open. STATES.tent = 70 deg, STATES.laptop = 1/3.
- Programmatic folds always run as WAAPI + linear() on the compositor, taking the curve from SPRING.linearFrom when present, so the fold runs at display rate either way. Drags run on a fixed-60 Hz JS simulator (own) or on MOTION.detent.
- Spring constants: hinge {.7, 0}; own drag follow {.4, .4}. When MOTION.detent drives, the 'follow' spring (.196/.1) applies instead. stretchMax is 28px (88px thumb vs 60px) and is passed to MOTION, whose default is 24.
- aria-valuetext differs by input path: own mode says 'closed' / 'half open' / 'open' / 'N% open'; with MOTION.detent it uses MOTION's format, e.g. '33%, half open'. MOTION owns aria in that mode.
- Hardware finish colours (metal, glass, shadow, rim) are a small token block in fg3-device.css, switched by the nearest [data-tone], not in the palette. Hardware is treated as material, not UI; every UI colour (slider, browser toolbar) is a palette role, and the thumb glyph uses --accent-ink.
- Corner tokens are read as var(--k-continuous, var(--k, 1.71)) and var(--r-scale, 1.53). Circular radii are the fallback where corner-shape is unsupported. GEOM clip-path is applied to screens only, never frames, because a clip would cut the keys and shadows.
- The duo's folding half shows a static snapshot (a sanitised clone) of the live inner screen while the leaf is off the flat, refreshed at most 4 times a second on DOM mutation. The live DOM itself is clipped to the fixed half. This is the closest correct thing, because a single live subtree cannot be split across two 3D planes.
- The .device-fold-slider element is emptied and rebuilt by mount.


## Controls, containers, overlays (fg3-components.css, ui.js)

CSS (fg3-components.css; load after lg3.css + fg3-motion.css). Full contract in the file header.
BUTTONS .btn (bare = ink pill) + .btn-primary (--accent-fill/-hover/-active gradients, --accent-ink, glow 0 8px 24px -8px var(--accent-glow)) .btn-secondary (1px --accent outline, fills with primary on hover) .btn-tinted (accent wash, ink = accent mixed 80% with --label) .btn-plain (link ink + chevron, no inline pad) .btn-glass (needs data-lg3 [+data-lg3-interactive]; LG3 owns surface+ink; .btn-glass.btn-primary = tinted glass body) .btn-icon (round, alpha control fill, press .95 on --sp-press) .btn-block (continuous 5/8/10/12 radius). Sizes .btn-s/.btn-m/.btn-l/.btn-xl = 24/36/44/56 (padding 4×11/9×16/12×22/18×31 minus 1px border; min-width 45/60/70/90; 12/14/17/17px weight 400). States :hover :active :focus-visible (fg3.css ring) :disabled/[aria-disabled=true] (.42; glass dims its ink) [aria-busy=true] (8-spoke spinner, width kept). Every small control gets a 44px ::before hit area. Vars: --btn-bg --btn-bg-hover --btn-bg-active --btn-ink --btn-ink-hover --btn-line --btn-glow.
LINKS .link-chevron (inline, inherits size, --link, underline on hover).
FIELDS input.field (.field-s 36 / 44 / .field-l 56; 1px --label-3 ring; [aria-invalid=true]) textarea.textarea · .search > input[type=search] (capsule, magnifier) · select.select (pill, gradient chevron) · .form-field > label + control + .field-help | .field-error.
TOGGLES input.switch[role=switch] (63×28, 37×24 knob, travel 22 on --sp-toggle, pressed knob stretches to 45 + lifts 1.14 on --sp-hold; --switch-on default --sys-green; .switch-accent) · input.check (22px continuous, tick draws) · input.radio · label.choice (44px row).
SLIDERS input.slider[type=range] (UI writes --v; --slider-fill) · .slider-detent[data-detents][data-labels][data-value][data-stretch-max] > [data-detent-thumb] (on MOTION.detent vars --detent-value/-stretch/-squash/-dir; --detent-ring) + optional .slider-detent-labels.
STEPPER .stepper[data-min][data-max][data-step][data-value] > button, output?, button.
SEGMENTED .segmented[role=tablist|radiogroup] > button… (UI adds .segmented-indicator) · .segmented-l (56/6/22/17px) · .segmented-glass (one LG3 host: data-lg3 + .segmented-track[data-lg3-shape] + .segmented-indicator[data-lg3-shape]; UI adds missing parts and data-lg3-container=10). State attrs: [data-seg-ready] [data-seg-armed] [data-seg-snap] [data-seg-press] [data-overflow=start|end|both] [data-m-moving]. Vars --seg-platter --seg-ind --seg-ink --seg-x --seg-w.
SMALL .chip (.chip-s; selected via aria-pressed/selected/checked/current) .token > .token-remove · .badge (.badge-ok/-warn/-bad/-accent/-solid/-count/-new) · .pill-status[data-state=live|ok|warn|bad|idle] (live dot pulses; calmer under RM) · .avatar (.avatar-s/-l/-xl, [data-status=online|busy|away]) .avatar-stack · .kbd · hr.divider (.divider-inset, .divider-v).
SURFACES .card (--r-lg continuous, band surface --c-surface, tile shadow light / none dark, --card-pad 32/28/24) .card-hover (scale (w+6)/w via UI --card-scale) .card-action · .tile · .card-media (clip-path inset(1px round 28px); as first child of .card it bleeds to the top) · .list (.list-inset) > li > .row (.row-icon .row-body .row-title .row-sub .row-detail .row-value; a.row/.row-nav chevron; --row-inset auto 16/59/66) .list-header .list-footer · .table (.table-hover .table-sticky, th/td .num) .table-scroll · .stat (.stat-caption .stat-value .stat-delta.up|.down).
PROGRESS progress.progress (.progress-l; :indeterminate sweep) · .progress-ring (--value 0..1, --ring-w, .progress-ring-s/-l, [data-indeterminate]) · .spinner (.spinner-l, .spinner-12) · .skeleton (.skeleton-text, .skeleton-circle).
OVERLAYS .menu[popover] (glass with data-lg3; opaque otherwise) > .menu-item (.menu-item-destructive, role menuitemcheckbox/radio + aria-checked, .menu-trail, .kbd) .menu-separator .menu-header · .popover · .tooltip · .toasts > .toast (.toast-action) · .banner (.banner-inset .banner-ok/-warn/-bad) · dialog.alert (.alert-title .alert-message .alert-actions; ::backdrop = --c-scrim) · .empty-state (.empty-state-glyph -title -body -actions).
Derived vars: --c-surface (band's content surface), --c-scrim (modal scrim per tone), --c-card-shadow, --c-on-glass (on .lg3 by appearance), --dir (±1 RTL), --c-hit 44px.
JS (ui.js → window.UI; never self-mounts, FG3.boot calls UI.mount(document)):
mount(root)→n (wires .segmented, .stepper, input.slider, .slider-detent, [data-tip], [data-menu=id], [data-popover=id], popovertarget→.menu/.popover, .card-hover, .progress-ring[data-value]) · anchor(panel, trigger, {placement bottom|top|left|right, align start|center|end, gap 8, native}) → {placement, path css|js, rect} (CSS anchor positioning + flips; JS fallback; ?ui-anchor=js forces it; writes transform-origin + [data-placed] [data-anchor]) · menu(trigger, panel, opts) / popover(...) → {open('first'|'last'), close(returnFocus), toggle, isOpen, state, destroy} (glass panel + glass trigger sharing data-lg3-id → LG3.morph; glass otherwise → LG3.materialize; opaque → MOTION spring scale from trigger; keys ↑↓ Home End type-ahead Esc Tab; emits 'ui:select' {item,value}) · toast(msg, {kind ok|bad|info, action{label,run}, duration, glass}) → {el, dismiss} · alert({title, message, actions[{label,value,role default|cancel|destructive}], from, glass}) → Promise<value> · tooltip(el, text?) / tooltips(root) · segmented(host,{onChange}) → {index, items, select(i,{focus,silent}), place(), destroy} (emits 'change' {index,value,item}) · stepper(el) → {value, set(v)} (emits 'change' {value}) · slider(input) → {paint} · detent(el, {detents, labels, value, stretchMax}) → MOTION.detent handle (emits 'change' {value,index,label}) · progress(el, v|null) · reduced (MediaQueryList) · anchorPath getter · version.

### Implementation notes

- Bare .btn (no variant) is the neutral ink pill.
- .btn-tinted / .token / .badge-accent label = color-mix(in oklab, --accent 80%, --label): the accent alone measured 4.17:1 on its own 12% wash.
- Destructive text on glass (menu, alert) = --bad mixed 45% into the glass ink; raw --bad was illegible on violet glass (opaque menus keep --bad).
- Text-bearing glass (btn-glass non-icon, segmented-glass, toast, menu, popover, alert) gets a share of LG3's --lg3-rt-* fill in its tint layer (34–62%) for measured ≥4.5:1 over mid-tone art; this densifies the material at component level (increased contrast keeps LG3's own answer).
- Segmented (solid) indicator animates translate + width over 320ms ease-out instead of left + width (same motion, compositor-friendly); the glass variant travels on --sp-select, not 320ms ease-out.
- Glass segmented labels are all full ink (selection shown by the lens), not 80%/100% opacity like the solid tabnav.
- Placeholders use --label-2 (4.5:1) instead of --label-3 (3:1), per the ≤17px text rule.
- Switch 63×28 with a 37×24 capsule knob, slider thumb 38×24.
- A small component-token block names #fff (knob, white in both tones) and two knob/thumb shadows; no palette role covers them.
- Reduced motion is keyed to the prefers-reduced-motion media query only (like fg3-motion.css, LG3 and MOTION), not to html.fd-reduced-motion.
- Menus/popovers are forced to popover="manual" with UI's own light dismiss so the exit can animate (morph back / spring out); native popover="auto" closes instantly.
- CSS anchor positioning is not used for glass menus that morph (LG3.morph works in viewport coordinates); those use the measured fixed placement.
- Checked menu items show the checkmark trailing, not leading.
- Chips use weight 400.


## Chrome (fg3-chrome.css, chrome.js)

GLOBAL CHROME (assets/chrome.js; never self-mounts; FG3.boot calls CHROME.mount(document) after LG3/MOTION). Full contract in the file header.
JS: mount(root)->{counts} · refresh(root) · globalnav.open(nav,item)/close(nav,instant)/menu(nav,on) · localnav.open/close/toggle(el), reveal(el,on), measure(el) · navbar.sync(el), minimize(el,on) · tabbar.select(el,i), minimize(el,on), sync(el) · sidebar.fold(el,on) · inspector.fold(el,on) · sheet.open(sheet,{from,detent}), close(sheet), detent(sheet,'medium'|'large') · scrollEdge.sync(edge) · controlBar.intro(el), select(el,i), play(el,on) · live.expand(el,on), toggle(el), update(el,{kind,glyph,hue,trail,summary,account,line,done,asked,elapsed}), measure(el) · command.open(el), close(el).
EVENTS (bubbling CustomEvent): chrome:localnav{open} chrome:tab{index} chrome:minimize{minimized} chrome:sheet{open,detent} chrome:controlbar{index,playing,reason} chrome:live{expanded} chrome:live-stop chrome:command{value,label}.
MARKUP (canonical classes):
.globalnav[data-globalnav=fixed] > .globalnav__bar(.globalnav__brand, ul.globalnav__list > li.globalnav__item[data-flyout=id] > a.globalnav__link + button.globalnav__trigger, .globalnav__tools > .globalnav__icon[data-keep], button.globalnav__menu); .globalnav__flyout#id[hidden] > .globalnav__flyout-content > .globalnav__group[data-elevated] > .globalnav__group-title + ul a.globalnav__flyout-link. Built: .globalnav__sheet, .globalnav__curtain (sibling), .globalnav__back. State [data-gn-open][data-gn-animating][data-gn-menu][data-gn-drill]. Note: .globalnav__icon[data-tone-toggle] stays visible at ≤833 px without [data-keep] — it is the only appearance control on phones.
.localnav[data-localnav-reveal=selector] > .localnav__capsule[data-lg3][data-lg3-priority] > a.localnav__title, button.localnav__explore(>.localnav__explore-label), a.localnav__cta, .localnav__panel(ul.localnav__tiles > a.localnav__tile[style=--tile-hue] > .localnav__thumb (+small, .is-new); hr.localnav__rule; .localnav__slot > .localnav__title-slot + .localnav__price + .localnav__cta-slot; nav.localnav__jump > .localnav__jump-label + ul.localnav__jump-grid > li.localnav__jump-item > a[aria-current]; .localnav__links > a.localnav__link). Built .localnav__overlay, .localnav__close-glyph. State [data-revealed][data-open][data-closing], html[data-localnav-open]. Var --progress (+ measured --ln-*; input --ln-wash).
.navbar[data-navbar-scroll=sel|window|parent][data-navbar-large=sel][data-navbar-minimize][data-scroll-edge=soft|hard|auto][data-dense] > .navbar__bar > .navbar__leading/.navbar__title/.navbar__trailing with .navbar__btn[data-lg3] / .navbar__group[data-lg3]; sibling .navbar-large > .navbar-large__title + .navbar-large__subtitle. State [data-title-inline][data-minimized]; vars --nb-collapse --nb-min.
.tabbar[data-tabbar-scroll][data-tabbar-position=absolute][data-tabbar-static] > .tabbar__accessory[data-lg3] (> .tabbar__now, [data-accessory-extra]) + .tabbar__row > .tabbar__bar[data-lg3][data-lg3-recipe=pill][data-lg3-priority] > .tabbar__tabs > .tab(.sym + .tab__label) + button.tab-prominent[data-lg3]. Built .tabbar__lens[data-lift]. State [data-minimized][data-prominent-selected]. Vars --tb-min --tb-w --tab-w --tb-sel-dx --tb-prom-w --lens-w; inputs --tb-h(62) --tb-hmin(50) --tb-pad --tb-gap --tb-acc-h --tb-max.
.toolbar[role=toolbar][data-axis=vertical][data-dense] > .toolbar__group[data-lg3][data-text] > .toolbar__item[aria-pressed]; .toolbar__title .toolbar__spacer .toolbar__primary[data-lg3] (symbol-only = circle).
.sidebar[data-lg3][data-sidebar=floating|edge][data-folded][data-concentric] > .sidebar__head(.sidebar__brand, button.sidebar__fold) · .sidebar__section > .sidebar__heading + a.sidebar__item[aria-current=page](.sym .sidebar__label .sidebar__count) · .sidebar__foot. Vars --sb-w --sb-w-folded --sb-fold.  .bg-extension[data-extend-from=sel][data-extend=start|end].
.inspector[data-lg3][data-folded] > .inspector__head(.inspector__title, .inspector__fold), .inspector__vlabel, .inspector__filters > button.inspector__filter[data-filter][aria-checked], .inspector__body > .inspector__row[data-kind]. Vars --insp-w --insp-fold.
.sheet#id[data-lg3][data-detents="medium large"][data-medium=.5][data-sheet-dim][data-sheet-morph][data-sheet-persistent][hidden] > .sheet__grabber, .sheet__header(.sheet__close, .sheet__title, .sheet__done), .sheet__body; opener [data-sheet-open=id]; closers [data-sheet-close]. Built .sheet-scrim[data-open][data-shown][data-clear]. State [data-open][data-detent][data-dragging], html[data-sheet-open]. Vars --m-y (px below large; read as HEIGHT) --sheet-hl --sheet-full --sheet-vis; inputs --sheet-max --sheet-top --sheet-inset --sheet-r --sheet-wash.
.scroll-edge[data-edge=top|bottom][data-edge-style=soft|hard|auto][data-edge-fixed] -> [data-edge-resolved][data-active][data-edge-duplicate]; inputs --edge-h --edge-ground --edge-bar-h; auto→hard with [data-pinned-header]/.toolbar[data-dense]/.navbar[data-dense].
.control-bar[data-autoplay][data-duration=6.15] > .control-bar__dots > button.control-bar__dot[aria-label][aria-current] + button.control-bar__play. Built .control-bar__drop, .control-bar__pip>.control-bar__fill, .control-bar__icon--play/--pause; data-lg3=platter. State [data-cb-intro][data-cb-drop][data-cb-bubble][data-cb-play][data-cb-icon][data-cb-ready][data-paused]. Vars --cb-p --cb-y --cb-alpha --cb-bs --cb-bw --cb-bh --cb-play --cb-slide --cb-intro --cb-drop-* --dot-x --cb-dur; inputs --cb-pill --cb-h --cb-gap --cb-bw1.
.live-capsule[data-anchor=start|center|end][data-kind=burst|warm|reply|nap|halted][data-live-start|data-elapsed] > .live-capsule__glass[data-lg3] > button.live-capsule__face(.live-capsule__lead .live-capsule__summary .live-capsule__trail) + .live-capsule__detail(.live-capsule__row > .live-capsule__glyph + .live-capsule__account/.live-capsule__line + .live-capsule__elapsed; .live-capsule__meter[role=progressbar]>span; .live-capsule__foot > .live-capsule__count + button.live-capsule__stop; [data-live-collapse]). In DEVICE .device__island (camera pill) omit data-lg3 (auto [data-island], data-tone=dark). State [data-expanded][data-swap]. Vars --lc-p --lc-w0n --lc-h0n --lc-w1n --lc-h1n --lc-meter; inputs --lc-hue (a role, e.g. var(--series-1)) --lc-r1 --lc-detail-w.
.command[data-command-hotkey] > button.command__pill[data-lg3](.command__pill-label, kbd) + .command__panel[data-lg3][hidden] > .command__field > input.command__input; ul.command__list > li.command__group[role=presentation] > .command__group-title + ul[role=group] > li.command__item[data-value][data-keywords](.command__label, kbd); .command__empty. State [data-open]. ⌘K/Ctrl+K toggles.
GLOBAL: [data-chrome-tone] (host data-tone mirrored from data-lg3-appearance), [data-chrome-pinned] (data-lg3-tone pinned to context band); derived roles --chrome-scrim (var(--scrim) fallback) --chrome-curtain --chrome-lens --chrome-link --chrome-wash; on glass --label-2 := --label-2-on-fill. Escape closes the topmost open surface, one level per press.

### Implementation notes

- Local nav radius is CIRCULAR calc(32px − 14px·(1 − p)), not a continuous token: a continuous 18 (27.5 px scaled extent) clamps to a capsule on a 52 px bar. Measured 18/32 px.
- Sheet detents change HEIGHT, not translate: MOTION.draggable's --m-y is read as 'distance below the large detent' and its transform is neutralised (transform:none !important), so a partial sheet keeps a visible inset, rounded bottom edge instead of sliding off-screen.
- Scroll edge host is a zero-height sticky anchor with hanging pseudo layers (the height+negative-margin form collapsed with the next element's margin and shifted content); layers fade individually because host opacity would make it a backdrop root. Edges sit at --z-edge; bars must be at --z-chrome.
- Labels on glass: chrome.js mirrors LG3's data-lg3-appearance into data-tone on each glass host so all roles resolve for the glass; secondary text on glass uses --label-2-on-fill (#6e6e73 failed over washes on art). Floating panels (palette, sheets) pin data-lg3-tone to the band that opened them — LG3 otherwise reads a large host's tone from whatever art is behind its centre (produced white text on pale glass).
- Large glass (sidebar, inspector, palette) gets a --bg-elevated wash (.12 light / .72 dark) and the local nav a base wash (.3 / .72): the measured recipes alone read as a grey slab in dark; large elements are 'more opaque'. Partial sheets carry a .45 wash rising to opaque.
- Control-bar intro starts two frames after the bar is seen (first raster of large gallery media ate its opening beats); its y+180 rise exists only while the intro runs (a pre-offset hid the bar from its own IntersectionObserver).
- Autoplay starts paused under reduced motion (WCAG 2.2.2); the progress fill animation itself survives as state.
- Tab-bar lens lift is CSS (+16 px each way, platter fades to clear, lift spring); no content magnification through the lens and no custom release wobble beyond LG3's. Minimise hysteresis is 32 px down / 16 px up.
- Live capsule is two-level (.live-capsule slot + .live-capsule__glass) so it can grow over content without reflowing its toolbar; in DEVICE's island data-lg3 is omitted and the island is the frame.
- --chrome-scrim = var(--scrim, colour-mix of --label (light) / --bg-1 (dark) at 48%) ≈ black .48.


## Product-page kit (fg3-showcase.css, showcase.js)

GLOBAL SHOW (showcase.js): it never mounts itself; FG3.boot calls SHOW.mount(document).
- mount(root) → {count}. Idempotent, and it also accepts a component root.
- get(el) → the component's api.
- instances → [{kind, el, api}].
- tweenScroll(el, left, ms=1000, done): the page move. Snap goes off, scrollLeft tweens on easeInOutQuad, then snap comes back. A wheel, touch or pointer takes over; reduced motion jumps.
- version.

Per-component APIs:
- .gallery {go(i), play(), pause(byUser), index, playing}
- .scroller {page(±1), update()}
- .feature-tabs {select(i)}
- .pose {open(i), close(), index}
- .compare {select(i)}
- .card-overlay {open(), close(), isOpen}
- .swatches {select(value)}
- .hero {fold(v), owned}

EVENTS (bubbling, on the component root): show:gallery{index}, show:tab{index}, show:pose{index, pose}, show:compare{index}, show:overlay{open}, show:swatch{value, finish}.

CLASSES (fg3-showcase.css):
- .hero (use on section.band[data-band=stage]): .hero-art (canvas; its art fades in below the copy), .hero-marquee, .hero-eyebrow, .hero-headline, .hero-sub, .hero-media (holds a .device; SHOW makes it role=slider, dragged or scrolled open), .hero-platter (recommended markup: data-lg3 data-lg3-tone="light" data-lg3-priority), .hero-price, .hero-cta (.btn wins; the fallback has element specificity only).
- .lockup: .lockup-eyebrow, .lockup-headline, .lockup-copy (strong = ink at the same weight), .lockup-ctas, .lockup-cta. Variant .lockup-start.
- .section-header: .section-header-headline, .section-header-link.
- .gallery: .gallery-rail > .gallery-list > .gallery-item[data-label] > .gallery-card[data-tone] > .gallery-caption[data-pin=bottom] + .gallery-media. Put .control-bar inside the gallery (preferred; SHOW drives it). Otherwise SHOW builds its own .gallery-bar-track > .gallery-bar > .gallery-dots/.gallery-dot + .gallery-play.
- .scroller: .scroller-rail > .scroller-list > .scroller-item > .scroller-card (.scroller-eyebrow, .scroller-headline, .scroller-body, .scroller-media). SHOW builds .scroller-paddles/.scroller-paddle[data-dir] if they are missing.
- .bento: > .bento-tile (+ fg3 .span-N, default span-6), .bento-copy, .bento-media. A canvas placed directly in a tile covers it and fades out below the copy.
- .feature-tabs: .feature-tabs-media > .feature-tabs-panel, .feature-tabs-nav > .feature-tabs-list > .feature-tabs-tab (+ indicator and .feature-tabs-more, both built by SHOW), .feature-tabs-captions > .feature-tabs-caption.
- .pose-stage (the viewer, 760/720/640 tall; add .clip-expand for phones) > .pose-media + .pose[data-for=duoId] > .pose-paddles, ul.pose-list > .pose-item[data-pose=closed|tent|laptop|open|0..1] > button.pose-chip(.pose-icon, .pose-label) + .pose-card. SHOW builds .pose-close.
- .stat-grid[data-cols=2|3|4], with variants .stat-grid-stack and .stat-grid-center. Cells are .stat-cell or .stat, containing .stat-lead, .stat-value[data-count], .stat-caption.
- .compare > .compare-label, .compare-select > select + i[data-sym=chevron-down], .stat-grid.compare-grid > [data-compare='[{lead,value,caption}…]']. Values roll through FG3.rollNumber.
- .scene (SHOW adds data-scene and the TextOverMedia keyframes unless you author them): .scene-sticky > .scene-media > .scene-visual (canvas/device), .scene-note (derived from --progress), plus .scene-copy.
- .clip-expand: data-clip-expand masked to phones unless authored.
- .headline-sweep: a static gradient without [data-sweep]; the ANIM sweep with it.
- .glow-ring (--glow-w, --glow-blur, --glow-size when it wraps a .device).
- .card-overlay > button.card-overlay-toggle[data-sheet="#id"] (the whole card is the target) + optional .card-overlay-panel. SHOW builds .card-overlay-icon. The sheet target is either dialog.card-overlay-sheet > .card-overlay-sheet-body (.card-overlay-topic, .card-overlay-title, p) with .card-overlay-close built by SHOW, or .sheet.
- .footnotes (ol/li#fn-N, p) and sup.fn > a.
- fieldset.swatches[data-for=deviceId] > .swatches-list > label.swatch[data-finish=light|dark|accent or style --swatch] > input[type=radio] + .swatch-disc + .sr-only name; p.swatches-name.
- .detent > .detent-caption + DEVICE's .device-fold-slider.

CUSTOM PROPERTIES:
- Inputs: --show-surface, --gallery-h/-cap-inset/-cap-w/-dot-active/-dur, --scroller-w/-h/-pad, --bento-h, --bento-fade, --pose-card-w, --sheet-w/-pad, --swatch, --glow-w/-blur/-size, --hero-overlap, --hero-art-from/-to, --scene-scrim-max.
- Written by SHOW or ANIM: --autoplay-progress, --i, --di, --progress, --chip-w, --card-h, --ind-x, --ind-w, --frame, --scene-scrim, --hover-scale, --progress-intro, html --show-sbw. Also: data-glow-idle (a .glow-ring off screen: its cones stop turning); .glow-ring is built by SHOW as .glow-ring-edge + .glow-ring-bloom, each holding a .glow-ring-cone turned by transform (the pseudo-element ring is the no-JS fallback).
- State attributes: data-playing, data-ended, data-m-moving, data-open, data-active, data-armed, is-in, data-state (sheet), html[data-show-modal].

window.showcaseSelftest() (when defined by a page) returns {pass, total, failed}.

### Implementation notes

- Hero on a stage band: every ART3 palette measures OKLCH L ≈ .6 under a hero headline, but the on-art inks need ≤ .40. So .hero-art is masked to fade out on the way up (--hero-art-from/--hero-art-to): copy sits on stage black in --label, and the art rises behind the device and platter.
- Hero platter: LG3 glass is used, marked data-lg3-tone="light". Dark glass over the device's white screen measured p5 1.94 for 14px pricing, light glass 5.80.
- Scene: a .5 scrim is the default, and --scene-scrim-max tunes it. The scrim keyframes run 0→1 and CSS multiplies by the max, so they stay linear and compile to scroll timelines; css() values would have forced the JS path. Frame-down runs a0b − 100vh → a0b − 40vh: the last 60vh, as the scene leaves.
- Gallery bar: .control-bar (drop→bubble intro, dots, 6.15s clock) is driven by the gallery when one is present; the gallery builds its own .gallery-bar only as a fallback. With the shared bar, autoplay wraps to card 1 at the end; only the fallback bar shows a replay. Dot widths then follow the bar's sprung index, not --autoplay-progress continuously.
- Gallery media counter-parallax (+.45) is not implemented; only the caption parallax and opacity wave are.
- Gallery and bento art fades out (mask) under captions and titles, so text sits on the card's own ground and passes contrast.
- Card overlay sheet: .sheet is a bottom sheet with detents, while .card-overlay is a web modal (816/692/phone widths, .8s easeInOutCubic from 100vh, scrim .48 + blur 20). The web modal is dialog.card-overlay-sheet, and a card can target .sheet instead (SHOW then calls CHROME.sheet and turns the '+' on chrome:sheet).
- Pose chips use the platter recipe through --mat-platter-*, not LG3 refractive glass. The morph interpolates corner-shape from superellipse(1) (a capsule) to superellipse(k-continuous) with radius 28 → r-lg, all on one --progress.
- Feature-tab indicator: a MOTION 'select' spring (.4/.15) instead of a 320ms ease-out. The label flip uses a 160ms delay and 160ms ease-in.
- Hero headline is 48/52 at ≤480, one step above .t-hero's 40.
- .clip-expand uses a circular 28px radius, because a clip-path inset round cannot be a superellipse; it has the same 45° mass as r-lg.
- Swatch finish colours (three oklch literals matching fg3-device.css's metal) and the conic specular-ring alphas are literals in fg3-showcase.css, under the hardware-finish exception.
- Bento tiles are .bento-tile, not .tile. .stat-grid cells accept .stat or .stat-cell, and the .stat-value/.stat-caption rules are scoped under .stat-grid so a lone .stat is untouched.
- .headline-sweep without [data-sweep] is a static gradient. With [data-sweep], the base experience shows the sweep's final state (solid ink), not the gradient.


## Tools (serve, artifact-build, perf, emulate)

SERVE  node tools/serve.mjs [root=.] [port=8810] [--port N] [--host 127.0.0.1] [--dist <root>/dist] [--drop-charset] [--quiet]
- /<path> serves the source tree.
  - Text types get `charset=utf-8`; every response is no-store and nosniff.
  - Supports Range/206, and lists folders that have no index.html.
- /a/ and /m/ (and any route named in dist/publish-map.json) emulate the Artifact host.
  - The map is re-read whenever it changes.
  - The entry is wrapped in the host skeleton from the current Artifact page contract: charset and viewport meta (viewport-fit=cover), light color-scheme, safe-area padding, body margin 0 on an off-white 14px ground, img max-width, `[hidden]` !important.
  - `?theme=dark|light` stamps `html[data-theme]`.
  - Supporting files are served ONLY if the artifact's map lists them, and only from dist; anything else is a 404 "not published".
  - The CSP names no external origin; `connect-src 'self'` stays, because FG3 fetches its own sheets.
  - `--drop-charset` removes the charset from the emulator routes, so the document decodes as windows-1252.

BUILD  node tools/artifact-build.mjs [--root] [--out <root>/dist] [--manifest tools/pages.json] [--url <id>=<artifact url>]... [--strict] [--selftest]
- Also exported: `build(opts)` → {ok, failures[{gate,msg}], warnings, notes, map, rendered}.
- Manifest (tools/pages.json):
  - entries[{id, src, out, route, scope: site|single, site, title}]: desktop = index.html at /a/ (site); an optional mobile entry at /m/ (single).
  - pages[] lists SPEC §8; `dir/*.html` globs are allowed.
  - selftest{page, count regex, claim regex, claimedIn[]} and vars.ignore[].
- Output files:
  - dist/artifact-<id>.html: body content only.
    - `<title>` comes first.
    - A parse-time bootstrap restores the source `<html>` and `<body>` attributes and moves `<body data-tone>` to `<html>`.
    - It sets data-tone with FG3 precedence: stored fg3-tone, then author data-tone, then host data-theme, then OS.
    - It mirrors data-theme flips until FG3 is present.
    - Head `<link>`, `<style>` and `<script>` are lifted in order; stylesheets stay linked, never inlined.
  - dist/pages/<path>: supporting pages at their source paths.
  - dist/assets/**: a copy of assets/.
  - dist/files/<path>: other files that pages reference.
- dist/publish-map.json = {generator, built, root, artifacts:{<id>:{route, title, src, file_path, scope, url, files:{<published path>: <path under dist>}, unresolved[]}}, missing_entries, skipped, warnings}.
- To publish one artifact: file_path = dist/<file_path>, root = dist, files = artifacts.<id>.files. Pass the WHOLE map every time.
- Transforms:
  - References are resolved against the source path and re-based to the published path; index.html becomes ./ or ../.
  - Links from a single-scope entry into the site become the --url absolute URL.
  - Non-ASCII is escaped by context: HTML `&#x;`, CSS `\XXXXXX`, JS `\uXXXX` in strings, regex and comments. Unicode spaces in JS code become spaces.
  - Every replace() is given a function.
- Gates (all failures are collected, exit 1, and dist is left untouched):
  - comments: an unbalanced block comment, string-aware, in any shipped CSS or `<style>`.
  - missing: a referenced file that does not exist, including CSS url() resolved relative to the stylesheet.
  - link: an .html link that the artifact does not publish.
  - external: a cross-origin subresource or a root-absolute URL.
  - vars: a bare var() with no declaration anywhere shipped (CSS, `<style>`, style="", JS string literals, attributes, JS-built prefixes). tools/check-vars.mjs also runs and must exit 0.
  - syntax: an asset or inline script fails vm.Script, or JSON fails to parse.
  - count: "N assertions" quotes disagree with the `T(` count in selftest.html; skipped while that file is absent.
  - ascii: any non-ASCII left in the output.
  - entry: the skeleton leaked, or `<title>` is not first within 8KB.
  - out: a published file did not land (read back before the swap), or the tool would replace a directory it did not write.
- Writes go to <out>.building-<pid> and are swapped in only on success.

PERF  node tools/perf.mjs <url> [--width 1440,402] [--height] [--dpr 1] [--gpu on|off|both] [--runs N] [--duration 6] [--distance px] [--scroll gesture|raf] [--interact "<js>" --before "<js>" --window 1500] [--wait 1500] [--trace] [--json f] [--quiet]
- Every configuration and every run launches a fresh headless Edge.
- Reports:
  - ceiling (idle rAF rate), fps, mean, p95, p99 and max frame ms.
  - slow frames (>1.5× the ceiling interval), janks (>50 ms), long tasks, and long animation frames with scripts plus the style/layout/render split.
  - glass: LG3 engine, refracting min–max against budget, hosts.
  - GPU info from SystemInfo and the WebGL renderer.
  - scrolled vs asked.
  - With --trace, the compositor drop % from PipelineReporter; the window is marked with performance.mark.
- Exit 1 if the page threw.
- Exports: launch({gpu, width, height, extraArgs}) → browser{send, on, newPage({isolated}) → page{send, on, eval, navigate, close}, close}, emulateViewport(page, {width, height, dpr}), measure(url, cfg), sleep, BROWSERS.

EMULATE  node tools/emulate.mjs <url> [--widths 1440,402] [--only light,dark,reduced-motion,reduced-transparency,contrast-more,forced-colors] [--tone light|dark] [--out shots/emulate] [--name] [--wait 1500] [--scroll 0,900 | --full] [--eval "<js>"] [--strict] [--json f]
- Each configuration runs in an isolated context.
- Writes one PNG per width, configuration and offset.
- Checks with matchMedia that the emulation really took effect.
- Records exceptions, console and Log errors (including CSP), failed requests, data-tone, the fd-* gate, LG3 state, and whether the capture is identical to light.
- Exit 1 on an exception or an emulation that did not take; with --strict, also on errors or failed requests.

### Implementation notes

- serve.mjs defaults to port 8810 and binds 127.0.0.1; pass --host 0.0.0.0 to reach it from a phone. `node tools/serve.mjs .` works.
- The emulator's routes and file sets come from dist/publish-map.json, not a hard-coded table. publish-map.json is keyed per artifact ({artifacts:{<id>:{file_path, files, ...}}}), so publish with files = artifacts.<id>.files.
- A 'single' entry (e.g. a mobile page at /m/) publishes its entry plus assets. Its links into the site need --url desktop=<url>; until then they point at the emulator route /a/…, which is a warning, and --strict refuses. This is configurable in pages.json.
- The tone bootstrap follows FG3's precedence. An author data-tone on <html> beats the host's data-theme, so an author-toned page ignores the viewer's theme toggle, which matches FG3.getTone.
- The emulator CSP is stricter than a typical host: it names no external origin. The wrapper reset applies img max-width only.
- perf scrolls with a wheel gesture at every width, because synthetic touch scroll gestures move nothing in headless Edge 153, with or without touch emulation. --trace reports the compositor drop % rather than presented fps, because a slow wheel gesture leaves most frames with nothing new to draw.
- emulate.mjs uses one browser process with an isolated context per configuration, not a fresh process. Fresh processes are kept for perf, where they matter.
- The count gate's claimedIn list excludes selftest.html itself, and the count regex defaults to `^\s*T\(`.
