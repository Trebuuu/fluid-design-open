/* ═══════════════════════════════════════════════════════════════════════════
   lg3-core.js → LG3 — the glass material engine (Fluid Design Open)
   ───────────────────────────────────────────────────────────────────────────
   glass as a STACK of measured layers, not a blurred box:
     frost      backdrop blur ≈ 8px + the per-surface colour transform
                c' = (lum + (c − lum)·sat)·scale + offset
     lens       a refracting rim from a signed distance field (Snell), with
                per-wavelength dispersion — Chromium only, engine-gated, budgeted
     highlight  Blinn-Phong + Fresnel rim, lit from ABOVE (top-weighted)
     dark edge  the side line: b → max(b − 76, .22·b), fading to top/bottom
     shadow     two-part, sampled: deeper over busy art, lighter over calm light
   plus: tone that flips on SMALL hosts only (with hysteresis), thicker glass
   for large hosts, clear-with-dim, interactive press + glow that spreads to
   neighbours, merge by smooth union, morph by identity, materialize.

   THE OPTICS, AND WHAT IS CORRECTED
     · thickness: `slope /= band` would model a 1px-tall bevel (−73% lensing).
       The slope climbs `thickness` over `band` again: 50px bar → ≥8 px max.
     · the gate: WebKit PARSES backdrop-filter:url() and drops it, so
       CSS.supports() lies. Refraction = Chromium brand AND a hardware GPU.
     · the budget: ≈0.5 ms/refracting layer/frame on a desktop GPU → at most 3 refracting hosts on desktop, 1 at phone width.
     · the smear: whole-host maps could not change size. Single-shape hosts now
       use a 9-SLICE map inside the SVG filter — four corner tiles + four 1-px
       edge strips baked once per (radius, corner, bevel, light), placed with
       primitive x/y/width/height — so a host can resize every frame for the
       cost of attribute writes (a morph flies on frost and needs no map at
       all until it lands). Merged (union) hosts still bake whole.

   MARKUP (all optional except data-lg3)
     data-lg3=""|"glass"|"clear"|"chrome"|"platter"   the kind (§4 of the SPEC)
     data-lg3-recipe="panel|pill|bar"   glass colour transform (default panel)
     data-lg3-interactive               press lift + glow from the pointer
     data-lg3-live                      highlight follows the pointer / tilt
     data-lg3-adaptive                  small hosts flip tone from the backdrop
     data-lg3-tone="light|dark"         declared tone (large hosts keep it)
     data-lg3-tone="context"            the tone of the band the host LIVES in (its
                                        nearest [data-tone] ancestor), not whatever
                                        is behind its centre — floating panels
     data-lg3-text | ="dense"           the host carries text: the engine raises its
                                        veil (the reduce-transparency fill) by the
                                        smallest share that holds 4.5:1 for its ink
                                        (dense: the secondary ink, --lg3-ink-2) over
                                        what it samples behind → --lg3-legible
     data-lg3-wash                      large glass: a veil floor (--lg3-wash-dark
                                        .72 / -light .12) growing with density
     data-lg3-hide-{lens,veil,tint,spec,rim,edge,glow,shadow}   dissection, on
                                        <html>, any ancestor, or the host (lg3.css)
     data-lg3-size="small|large"        override the size class
     data-lg3-priority="n"              refraction budget priority (higher first)
     data-lg3-mode="frost"              never refract
     data-lg3-shape                     child shape of a merged host
     data-lg3-container="<spacing>"     on a host WITH data-lg3-shape children:
                                        merge (smooth union, k = 2·spacing, so a
                                        gap < spacing bridges). On a plain parent:
                                        shared tone + glow spread + morph scope.
     data-lg3-id="x"                    morph identity
     data-lg3-away                      hidden by morph/dematerialize (visibility)
     tuning: data-lg3-bezel -thickness -ior -dispersion -max-tilt -blur -rim-blur
             -lens -light (deg, 0 = from above) -elev -shine
             -profile (circle | lip | squircle | flat; default circle, lip when large)
             -rim-frac (how far in the sharp lensed rim reaches, default .6 of the bevel)
             -debug (map | frost | lens | rimOnly | joined | sat: end the chain there)
   WRITTEN BY THE ENGINE
     class .lg3 · data-lg3-kind · data-lg3-appearance="light|dark" (ink + recipe)
     data-lg3-engine="refraction|frost" · data-lg3-size-class · data-lg3-pressed
     data-lg3-morphing · data-lg3-landed (a landed morph holding its round corner
     until the page is still, §14) · on <html>: data-lg3-engine, data-lg3-refracting="n/budget"
     --lg3-shadow-strength --lg3-shadow-hard --lg3-shadow-spread --lg3-dim
     --lg3-glow --lg3-glow-r --lg3-gx --lg3-gy --lg3-press-scale --lg3-mat --lg3-spec-boost
     --lg3-density --lg3-legible · span.lg3__veil (text/wash hosts)
     span.lg3__aa on every glass/clear host: the raster hint (§7 crisp()), one
     crisp-edged paint at alpha 1/255 that keeps the host out of MSAA raster
     div[data-lg3-warm] on <html> for ≈ .6–1.4 s after mount (and after hosts
     are added): inert, aria-hidden copies of the glass at opacity 1/255 (§18)

   WHAT THE ENGINE FOLLOWS BY ITSELF (after mount)
     · an element that gains [data-lg3] — inserted, or the attribute set — is
       applied (one MutationObserver); a CLONE of glass (the .lg3 class with no
       engine state: DEVICE's fold snapshot, a morph ghost) is left alone;
     · data-lg3-text / -wash add the veil; data-tone on any band or <html> (not on
       a glass host: chrome mirrors appearances there), data-lg3-tone on a
       host, and FG3's 'fg3:tone' event re-read tones before the next frame;
     · every host from its first apply is watched for size and visibility.
   A canvas[data-lg3-source] that is not ART3's must dispatch a bubbling
   'art3:painted' after it repaints: readings of it are cached until then.

   COSTS (stage-3 profile of a scroll: adapt was 60–290 ms 'run' tasks)
     · adapt is a PASS: every rect, hit test and pixel is read before any write
       (one layout, not one per host); scroll passes run in idle time, at most
       one per 120 ms, plus one after the scroll stops; hosts the observer has
       not seen enter are skipped (they are read as they enter);
     · readings come from ART3.pixels (a CPU copy made once per paint) — never
       a GPU readback per reading — and are memoised per host until it moves
       8 px over the painting; a hit test only when two paintings overlap;
     · chrome/platter hosts no longer re-apply on every resize;
     · the page's corner exponents are baked into GEOM in idle time after
       mount, so a morph into a continuous corner never bakes one mid-flight.
     · the GPU compiles a shader program the first time each structure of
       glass is drawn (10–40 ms each, several at once): the slow frames of a
       scroll with no main-thread long task. Every structure the page's glass
       needs — both paths, at rest and in motion — is drawn once in idle time
       after mount (§18), so a host entering view or trading its budget slot
       no longer compiles mid-scroll;
     · a host whose box keeps changing (a scroll-driven morph) uses the
       morph's quantised tiles while it moves and bakes exact tiles once it
       is still — a handful of bakes for the whole travel, not one per frame;
       scaled tiles are placed on whole pixels.
     · a layer with enough antialiased concave paths (symbols, a superellipse
       ring or clip) is rastered MULTISAMPLED, and then every kind of draw in
       it compiles an MSAA program (20–28 ms each) the first time: the raster
       hint (.lg3__aa) keeps every glass host single-sampled;
     · a morph flies ROUND (the circle with the destination corner's 45°
       inset) and its frozen content rides on its own compositor layer: the
       fade and the growing clip cost no raster and compile nothing (§14).

   API (window.LG3)                    mount(root) is called by FG3.boot; never self-mounts
     mount(root) → n                   apply every [data-lg3] under root, observe, adapt
     apply(host) · refresh(host)       (re)build one host · rebuild after a DOM change
     adapt()                           re-read every host now: tone, shadow, dim, legibility
     morph(fromEl, toEl, {duration=.5, bounce=.18} | {spring:'morph'}) → Promise   pill→panel by identity
                                       · works inside a SCALED transformed ancestor (DEVICE's
                                         .device__viewport): placed in its local px
                                       · toEl without data-lg3 morphs as an opaque box; the
                                         engine never makes it glass
     materialize(el, {duration,bounce} | {spring}) / dematerialize(el, …) → Promise
     setTint(0..1)                     clear↔tinted slider (default .5)
     setReduceTransparency(true|false|null)   null = follow the system
     setEngine('refraction'|'frost'|null)  force a path (labs, tests)
     setBudget(n|null)                 override the refraction budget
     stats(host)                       refraction map of this host: {max, mean, displaced px,
                                       bezel, thickness, buildMs, tileMs, path}
     statsFor({w, h, r, k, size, bezel, thickness, ior, maxTilt, profile, rimFrac, light,
               elev, shine})           the same for a box that does not exist (r defaults to a
                                       capsule, k to 1): nothing registered, observed or drawn
     forget(host)                      stop tracking a host (a probe); a later apply restarts it
     material(host)                    the resolved {blur, sat, scale, offset, B, C}
     spring(duration, bounce)          {at(t), settle, source: 'SPRING'|'local'}
     sampleBackdrop(host) · buildMaps(cfg) · tileSet(p) · caps · recipes · profiles · hosts
     engine · refracting · budget · tint (getters)
     perf                              {morphMeanMs, morphMaxMs, morphFrames, lastBuildMs,
                                       lastTileMs, tileBakes, lastShapeFrameMs, adapts, adaptMs,
                                       lastAdaptMs, adaptBy {soon, idle, scroll}, samples,
                                       snapshots, warmMs, warm {copies, runs, ms, keys}, ...}
   MERGED-MASK TRAP (warned once in the console): a merged host inside an
   ancestor that clips (overflow ≠ visible) with a superellipse corner is
   frosted as its whole rectangle by Chromium — give that ancestor
   corner-shape: round (equal-mass radius) or stop it clipping.
   Requires geom.js before it. Uses SPRING if present (the morph maths is the same
   either way); a CSS spring fallback covers the press.
   ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var G = global.GEOM;
  var RF = { willReadFrequently: true };
  /* geom.js loads first (SPEC load order). Without it there is no field to
     bake: expose an inert LG3 rather than throw, and the CSS baseline frost
     in lg3.css still draws every [data-lg3]. */
  if (!G) {
    var noop = function () { return 0; };
    global.LG3 = { mount: noop, apply: noop, refresh: noop, adapt: noop, setTint: noop,
      setReduceTransparency: noop, setEngine: noop, setBudget: noop, stats: function () { return null; },
      morph: function () { return Promise.resolve(); }, materialize: function () { return Promise.resolve(); },
      dematerialize: function () { return Promise.resolve(); }, engine: 'none', missing: 'GEOM' };
    return;
  }
  var doc = document, html = doc.documentElement;
  var uid = 0;

  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function now() { return global.performance ? performance.now() : Date.now(); }
  function mq(q) {
    try { return global.matchMedia(q); } catch (e) { return { matches: false, addEventListener: function () {} }; }
  }
  var RM = mq('(prefers-reduced-motion: reduce)');
  var RT_MQ = mq('(prefers-reduced-transparency: reduce)');
  var IC_MQ = mq('(prefers-contrast: more)');
  var FC_MQ = mq('(forced-colors: active)');

  /* ─────────────────────────────────────────────────────────────────────────
     0. THE ENGINE GATE
     Never CSS.supports('backdrop-filter','url(#x)'): WebKit parses url() through
     the shared filter grammar, answers true, then drops the whole backdrop
     (bug 245510; PR #68613 reports a GPU-process crash loop). Chromium renders
     it — but on a software rasteriser many large backdrop layers can stop
     frame production outright, so SwiftShader / llvmpipe /
     Basic Render Driver fall to frost too.
     ───────────────────────────────────────────────────────────────────────── */
  var CAPS = null, forcedEngine = null;
  function detect() {
    if (CAPS) return CAPS;
    var t0 = now(), c = { chromium: false, renderer: '', software: false, backdrop: false };
    try { c.backdrop = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'); } catch (e) {}
    var uad = navigator.userAgentData, ua = navigator.userAgent || '';
    if (uad && uad.brands) c.chromium = uad.brands.some(function (b) { return /Chromium/.test(b.brand); });
    /* userAgentData needs a secure context; elsewhere read the UA, excluding
       the shells that are WebKit underneath. */
    else c.chromium = /(Chrome|Chromium)\/\d/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    /* The WebGL probe costs 35–70 ms of main thread; the answer does not
       change between pages, so it is remembered per viewer (a convenience —
       storage may be absent, and then we simply probe). */
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem('lg3-gl') || 'null'); } catch (e) {}
    if (cached && typeof cached.r === 'string' && cached.ua === ua) { c.renderer = cached.r; c.software = !!cached.s; c.cached = true; }
    else try {
      var cv = doc.createElement('canvas');
      var gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
      if (!gl) c.software = true;
      else {
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        c.renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
        c.software = /SwiftShader|llvmpipe|softpipe|Basic Render Driver|Software Adapter/i.test(c.renderer);
        var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      }
      try { localStorage.setItem('lg3-gl', JSON.stringify({ r: c.renderer, s: c.software, ua: ua })); } catch (e) {}
    } catch (e) { c.software = true; }
    c.engine = !c.backdrop ? 'flat' : (c.chromium && !c.software) ? 'refraction' : 'frost';
    c.detectMs = +(now() - t0).toFixed(1);
    CAPS = c;
    return c;
  }
  function engine() { var c = detect(); return forcedEngine || c.engine; }

  /* ─────────────────────────────────────────────────────────────────────────
     1. MEASURED RECIPES
     sat · scale · offset(0–1). Transform applied to the BLURRED backdrop.
     The backdrop keeps its colour (sat × scale ≈ 1): only luminance is
     compressed — tinted clear glass, not a frosted slab.
     ───────────────────────────────────────────────────────────────────────── */
  var RECIPES = {
    panel: { light: { sat: 2.08, scale: 0.457, offset: 0.539 },   /* free-standing glass */
             dark:  { sat: 2.84, scale: 0.378, offset: 0.313 } },
    pill:  { light: { sat: 2.10, scale: 0.422, offset: 0.553 },   /* tab-bar pill, PR #5906 direct fit */
             dark:  { sat: 1.93, scale: 0.517, offset: 0.266 } },
    /* Edge nav/title bar. Light is measured unchanged. Dark carries a non-affine luma curve we do not model, so dark uses the
       affine fit. */
    bar:   { light: { sat: 1.10, scale: 0.850, offset: 0.078 },
             dark:  { sat: 1.60, scale: 1.000, offset: 0.047 } },
    /* Clear: "highly translucent, not adaptive" — near-identity, the required
       dim layer does the work (see lg3.css). */
    clear: { light: { sat: 1.30, scale: 0.940, offset: 0.030 },
             dark:  { sat: 1.30, scale: 0.940, offset: 0.030 } }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     2. OPTICS (with the thickness term restored)
     ───────────────────────────────────────────────────────────────────────── */
  /* x: 0 at the silhouette → 1 at the plateau; the derivative is the tilt.
     circle (default for controls) keeps a visible bend across the whole band;
     lip (default for large glass) pinches, then releases; squircle (the old
     default) spends nearly all of its bend in the outer 3 px. */
  var PROFILES = {
    circle: function (x) { return Math.sqrt(Math.max(0, 1 - (1 - x) * (1 - x))); },
    squircle: function (x) { var u = 1 - x; return Math.pow(Math.max(0, 1 - u * u * u * u), 0.25); },
    lip: function (x) {
      var convex = PROFILES.squircle(x), concave = 1 - PROFILES.squircle(1 - x), t = x * x * (3 - 2 * x);
      return convex * (1 - t) + concave * t;
    },
    flat: function (x) { return x; }
  };
  /* Snell: a ray meets a surface tilted by `tilt`, travels `thickness`, exits. */
  function refractOffset(tilt, ior, thickness) {
    var s = Math.sin(tilt) / ior;
    if (s >= 1) return thickness;                    /* TIR — unreachable below ~72° */
    return Math.tan(tilt - Math.asin(s)) * thickness;
  }
  /* Both round profiles have an infinite slope at the silhouette; one singular
     pixel would set the normalisation max and crush the lens. Polish it. */
  function clampTilt(tilt, maxTilt) { return tilt > maxTilt ? maxTilt : tilt; }

  /* bake(cfg) → canvases: displacement (R dx, G dy, B rim coverage), specular
     (white, alpha), optional silhouette mask and dark-edge (merged hosts). */
  function bake(cfg) {
    var w = Math.max(2, Math.round(cfg.w)), h = Math.max(2, Math.round(cfg.h));
    var hw = w / 2, hh = h / 2;
    var r = Math.max(0.01, Math.min(cfg.r, Math.min(hw, hh)));
    var n = G.expFromK(cfg.cornerK);
    var shapes = cfg.shapes && cfg.shapes.length ? cfg.shapes : [{ cx: hw, cy: hh, hw: hw, hh: hh, r: r, n: n }];
    var kM = cfg.k || 0, merged = shapes.length > 1;
    var minHalf = Math.min.apply(null, shapes.map(function (s) { return Math.min(s.hw, s.hh); }));
    var band = Math.max(1, Math.min(cfg.bezel, minHalf - 0.5));
    var f = PROFILES[cfg.profile] || PROFILES.squircle;
    var fieldAt = G.fieldAt;

    /* light: degrees clockwise from 12 o'clock; 0 = from above */
    var la = (cfg.lightAngle - 90) * Math.PI / 180;
    var lx = Math.cos(la), ly = Math.sin(la), lz = cfg.lightElev;
    var ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
    var hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    var kx = -hx, ky = -hy, kz = hz;                 /* the weaker counter-light */

    function canvas() { var c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }
    var dCan = canvas(), sCan = canvas();
    /* CPU-backed: these are written with putImageData and read with
       toDataURL; a GPU canvas turns every encode into a synchronous readback
       (measured 52 ms for one tile set without this, see PERF). */
    var dCtx = dCan.getContext('2d', RF), sCtx = sCan.getContext('2d', RF);
    var dImg = dCtx.createImageData(w, h), sImg = sCtx.createImageData(w, h);
    var dD = dImg.data, sD = sImg.data;
    var mCan = null, mD = null, mImg = null, eCan = null, eD = null, eImg = null;
    if (merged) {
      mCan = canvas(); mImg = mCan.getContext('2d', RF).createImageData(w, h); mD = mImg.data;
      eCan = canvas(); eImg = eCan.getContext('2d', RF).createImageData(w, h); eD = eImg.data;
    }
    var ox = new Float32Array(w * h), oy = new Float32Array(w * h), rim = new Float32Array(w * h);
    var maxMag = 1e-6, eps = 0.5, x, y, i, o, covSum = 0;

    for (y = 0; y < h; y++) {
      var py = y + 0.5;
      for (x = 0; x < w; x++) {
        i = y * w + x; o = i * 4;
        var px = x + 0.5;
        var d = fieldAt(px, py, shapes, kM, n);
        if (merged) {
          var cov = clamp(0.5 - d, 0, 1);
          covSum += cov;
          mD[o] = mD[o + 1] = mD[o + 2] = 255; mD[o + 3] = Math.round(cov * 255);
        }
        if (d > 0.5 || d < -band - 1) continue;      /* outside, or flat interior */
        var t = clamp(-d / band, 0, 1), inBand = -d < band;

        /* THE FIX. The profile climbs `thickness` over `band`, so the real
           slope is f′·thickness/band. Dividing by band alone gives a bevel one
           pixel tall and loses three quarters of the lens. */
        var e = 1 / band, t0 = Math.max(0, t - e), t1 = Math.min(1, t + e);
        var slope = (f(t1) - f(t0)) / ((t1 - t0) || 1e-6) * cfg.thickness / band;
        var tilt = clampTilt(Math.atan(Math.abs(slope)), cfg.maxTilt);
        slope = Math.tan(tilt);

        var gx = fieldAt(px + eps, py, shapes, kM, n) - fieldAt(px - eps, py, shapes, kM, n);
        var gy = fieldAt(px, py + eps, shapes, kM, n) - fieldAt(px, py - eps, shapes, kM, n);
        var gl = Math.hypot(gx, gy) || 1e-6; gx /= gl; gy /= gl;

        var mag = inBand ? refractOffset(tilt, cfg.ior, cfg.thickness) * cfg.sign : 0;
        if (d > -0.5) mag *= (0.5 - d);               /* feather the outermost row */
        ox[i] = gx * mag; oy[i] = gy * mag;
        if (Math.abs(mag) > maxMag) maxMag = Math.abs(mag);

        /* rim coverage: 1 at the silhouette → 0 by 42% of the band; the sharp
           lensed rim sits over the frosted interior through this mask */
        var tt = clamp(-d / (band * cfg.rimFrac), 0, 1), rc = 1 - tt * tt * (3 - 2 * tt);
        if (d > -0.5) rc *= (0.5 - d);
        rim[i] = rc;

        /* specular from the same normal field */
        var nx = gx * slope, ny = gy * slope, nz = 1, nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        var spec = nx * hx + ny * hy + nz * hz; spec = spec > 0 ? Math.pow(spec, cfg.shine) * 0.7 : 0;
        var back = nx * kx + ny * ky + nz * kz; back = back > 0 ? Math.pow(back, cfg.shine * 1.6) * 0.3 : 0;
        /* Blinn-Phong alone peaks where the tilt is ~32° — several px INSIDE
           the rim, a second line. The highlight is ON the rim, brightest
           at the top, then the bottom, weakest on the sides (which carry the
           dark edge): a grazing Fresnel term, weighted by where the rim faces
           relative to the light. */
        var up = (gx * lx + gy * ly) / (Math.hypot(lx, ly) || 1);  /* 1 = rim faces the light */
        var face = up > 0 ? 0.55 + 0.45 * up : 0.55 + 0.25 * -up;
        var fres = Math.pow(1 - nz, 2) * 0.8 * face;
        var a = Math.min(1, spec + back + fres) * (inBand ? Math.max(0, 1 - t * 1.45) : 0);
        if (d > -0.5) a *= (0.5 - d) * 2 > 1 ? 1 : (0.5 - d) * 2;
        sD[o] = sD[o + 1] = sD[o + 2] = 255; sD[o + 3] = Math.round(a * 255);

        /* dark edge for a union (single hosts draw it in CSS): the
           outermost ~1.2 px, weighted by the horizontal part of the normal —
           full on the sides, none along top and bottom. */
        if (merged && d > -1.2) {
          var ring = clamp(0.5 - d, 0, 1) * clamp(1.2 + d, 0, 1);
          eD[o + 3] = Math.round(ring * Math.abs(gx) * 255);
        }
      }
    }
    var inv = 1 / maxMag;
    for (i = 0; i < w * h; i++) {
      o = i * 4;
      dD[o] = clamp(Math.round(128 + ox[i] * inv * 127), 0, 255);
      dD[o + 1] = clamp(Math.round(128 + oy[i] * inv * 127), 0, 255);
      dD[o + 2] = Math.round(rim[i] * 255);
      dD[o + 3] = 255;                                /* never premultiply the map */
    }
    dCtx.putImageData(dImg, 0, 0); sCtx.putImageData(sImg, 0, 0);
    if (merged) { mCan.getContext('2d', RF).putImageData(mImg, 0, 0); eCan.getContext('2d', RF).putImageData(eImg, 0, 0); }
    /* feDisplacementMap moves by scale·(c/255 − .5); ±1 is encoded at 128±127
       = ±.498, so the scale reproducing maxMag px is maxMag/.498. */
    return { disp: dCan, spec: sCan, mask: mCan, edge: eCan, ox: ox, oy: oy, coverage: merged ? covSum / (w * h) : 1,
             maxMag: maxMag, scale: maxMag / (127 / 255), w: w, h: h, band: band };
  }

  /* Whole-host maps as data URLs (merged hosts). */
  var mapCache = new Map();
  function buildMaps(cfg) {
    var key = JSON.stringify([cfg.w, cfg.h, cfg.r, cfg.cornerK, cfg.bezel, cfg.ior, cfg.thickness, cfg.maxTilt,
      cfg.profile, cfg.lightAngle, cfg.lightElev, cfg.shine, cfg.sign, cfg.k, cfg.rimFrac,
      cfg.shapes ? cfg.shapes.map(function (s) { return [s.cx | 0, s.cy | 0, s.hw | 0, s.hh | 0, s.r | 0]; }) : 0]);
    var hit = mapCache.get(key);
    if (hit) return hit;
    var t0 = now(), b = bake(cfg);
    var out = { displacement: b.disp.toDataURL(), specular: b.spec.toDataURL(),
                silhouette: b.mask ? b.mask.toDataURL() : null, edge: b.edge ? b.edge.toDataURL() : null,
                merged: !!b.mask, coverage: b.coverage, scale: b.scale, maxMag: b.maxMag, w: b.w, h: b.h, band: b.band,
                ox: b.ox, oy: b.oy, ms: 0 };
    out.ms = now() - t0;
    PERF.lastBuildMs = +out.ms.toFixed(2);
    while (mapCache.size > 120) mapCache.delete(mapCache.keys().next().value);
    mapCache.set(key, out);
    return out;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     3. THE 9-SLICE TILE SET
     A rounded box's field is 2-D only inside its four corner squares; along
     the flats it depends on the distance to one edge alone. So bake ONE small
     box of side 2T+1 (T ≥ radius and ≥ band, + 2 px of flat), cut it into four
     T×T corners and four 1-px strips, and let the filter stretch the strips.
     Any box with that corner then costs attribute writes, not a bake.
     ───────────────────────────────────────────────────────────────────────── */
  var tileCache = new Map();
  function tileSet(p) {
    var key = [p.T, p.r.toFixed(1), p.k, p.band.toFixed(1), p.thickness.toFixed(1), p.ior, p.maxTilt,
               p.profile, p.lightAngle, p.lightElev, p.shine, p.rimFrac].join('|');
    var hit = tileCache.get(key);
    if (hit) return hit;
    var t0 = now(), T = p.T, S = 2 * T + 1;
    var b = bake({ w: S, h: S, r: Math.min(p.r, S / 2), cornerK: p.k, bezel: p.band, ior: p.ior,
                   thickness: p.thickness, maxTilt: p.maxTilt, profile: p.profile, lightAngle: p.lightAngle,
                   lightElev: p.lightElev, shine: p.shine, sign: 1, rimFrac: p.rimFrac });
    function cut(x, y, w, h) {
      var c = doc.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d', RF).drawImage(b.disp, x, y, w, h, 0, 0, w, h);
      return c.toDataURL();
    }
    var out = {
      T: T, S: S, scale: b.scale, maxMag: b.maxMag, band: b.band,
      d: { tl: cut(0, 0, T, T), tr: cut(T + 1, 0, T, T), bl: cut(0, T + 1, T, T), br: cut(T + 1, T + 1, T, T),
           t: cut(T, 0, 1, T), b: cut(T, T + 1, 1, T), l: cut(0, T, T, 1), r: cut(T + 1, T, T, 1) },
      spec: b.spec.toDataURL(), ms: 0
    };
    out.ms = now() - t0;
    PERF.lastTileMs = +out.ms.toFixed(2);
    PERF.tileBakes = (PERF.tileBakes || 0) + 1; PERF.tileBakeMs = +((PERF.tileBakeMs || 0) + out.ms).toFixed(2);
    while (tileCache.size > 160) tileCache.delete(tileCache.keys().next().value);
    tileCache.set(key, out);
    return out;
  }
  /* A 64² linear ramp (R across, G down): the interior "thick glass" lens of
     large hosts is linear in position, so one stretched ramp scaled by a
     component transfer reproduces it at any size. */
  var RAMP = null;
  function rampURL() {
    if (RAMP) return RAMP;
    var c = doc.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d', RF), im = x.createImageData(64, 64);
    for (var j = 0; j < 64; j++) for (var i = 0; i < 64; i++) {
      var o = (j * 64 + i) * 4;
      im.data[o] = Math.round((i + 0.5) / 64 * 255); im.data[o + 1] = Math.round((j + 0.5) / 64 * 255);
      im.data[o + 2] = 128; im.data[o + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return (RAMP = c.toDataURL());
  }

  /* ─────────────────────────────────────────────────────────────────────────
     4. THE FILTER
     Region grows by the max displacement: rim reads reach for backdrop
     outside the box, and a region that stops at the box returns transparent
     black there (a dark fringe). The element still clips the result.
     ───────────────────────────────────────────────────────────────────────── */
  function defs() {
    var svg = doc.getElementById('lg3-defs');
    if (!svg) {
      svg = doc.createElementNS(NS, 'svg');
      svg.id = 'lg3-defs';
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
      doc.body.appendChild(svg);
    }
    return svg;
  }
  function el(name, attrs, parent) {
    var e = doc.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var SLICES = ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'];
  var ROWS = { R: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
               G: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
               B: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0' };

  /* One filter per host. `mode` 9 = sliced map, 'full' = one baked map. */
  function buildFilter(st) {
    var old = doc.getElementById(st.fid); if (old) old.remove();
    var f = el('filter', { id: st.fid, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse',
                           'color-interpolation-filters': 'sRGB' });
    var P = { f: f };
    if (st.merged) {
      P.map = el('feImage', { preserveAspectRatio: 'none', x: 0, y: 0, result: 'map' }, f);
    } else {
      el('feFlood', { 'flood-color': 'rgb(128,128,0)', 'flood-opacity': 1, result: 'n0' }, f);
      P.tiles = {};
      SLICES.forEach(function (k) { P.tiles[k] = el('feImage', { preserveAspectRatio: 'none', result: 'i' + k }, f); });
      var m = el('feMerge', { result: st.lens ? 'map0' : 'map' }, f);
      ['n0'].concat(SLICES.map(function (k) { return 'i' + k; })).forEach(function (r) { el('feMergeNode', { in: r }, m); });
      if (st.lens) {
        P.ramp = el('feImage', { href: rampURL(), preserveAspectRatio: 'none', x: 0, y: 0, result: 'lr' }, f);
        var ct = el('feComponentTransfer', { in: 'lr', result: 'ls' }, f);
        P.lensR = el('feFuncR', { type: 'linear' }, ct); P.lensG = el('feFuncG', { type: 'linear' }, ct);
        el('feFuncB', { type: 'linear', slope: 0, intercept: 0.5 }, ct);
        el('feFuncA', { type: 'linear', slope: 0, intercept: 1 }, ct);
        el('feComposite', { in: 'map0', in2: 'ls', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: -0.5, result: 'map' }, f);
      }
    }
    P.frost = el('feGaussianBlur', { in: 'SourceGraphic', result: 'frost' }, f);
    P.disp = {};
    ['R', 'G', 'B'].forEach(function (ch) {
      P.disp[ch] = el('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' + ch }, f);
      el('feColorMatrix', { in: 'd' + ch, type: 'matrix', values: ROWS[ch], result: 'c' + ch }, f);
    });
    el('feBlend', { in: 'cR', in2: 'cG', mode: 'screen', result: 'rg' }, f);
    el('feBlend', { in: 'rg', in2: 'cB', mode: 'screen', result: 'lens' }, f);
    P.rimBlur = el('feGaussianBlur', { in: 'lens', stdDeviation: st.cfg.rimBlur, result: 'lensSoft' }, f);
    el('feColorMatrix', { in: 'map', type: 'matrix', values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 0', result: 'rimMask' }, f);
    el('feComposite', { in: 'lensSoft', in2: 'rimMask', operator: 'in', result: 'rimOnly' }, f);
    el('feComposite', { in: 'rimOnly', in2: 'frost', operator: 'over', result: 'joined' }, f);
    P.sat = el('feColorMatrix', { in: 'joined', type: 'saturate', result: 'sat' }, f);
    var tr = el('feComponentTransfer', { in: 'sat', result: 'out' }, f);
    P.funcs = ['feFuncR', 'feFuncG', 'feFuncB'].map(function (n) { return el(n, { type: 'linear' }, tr); });
    if (st.cfg.debug) el('feOffset', { in: st.cfg.debug, dx: 0, dy: 0 }, f);
    defs().appendChild(f);
    st.P = P;
    st.geoKey = st.matKey = st.tileKey = null;
  }

  /* per frame: where the tiles go (integers, so seams land on pixel edges;
     strips overlap the corners by 1 px so bilinear edges never expose the
     neutral flood underneath) */
  function placeTiles(st, w, h, tiles) {
    var P = st.P; if (!P || st.merged) return;
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    /* whole px even when a morph draws the tiles scaled (tileF): a fractional
       rect is a different image-sampling program, compiled mid-motion */
    var T = Math.max(1, Math.round(tiles.T * (st.tileF || 1))), M = Math.ceil(tiles.maxMag * 1.1 + (st.lensPx || 0)) + 6;
    var key = w + 'x' + h + ':' + T.toFixed(2) + ':' + M;
    if (st.tileKey !== tiles.d.tl) {
      SLICES.forEach(function (k) { P.tiles[k].setAttribute('href', tiles.d[k]); });
      st.tileKey = tiles.d.tl;
    }
    if (st.geoKey === key) return;
    st.geoKey = key;
    placeGeo(P, w, h, T, M);
  }
  /* the attribute writes themselves — also for a warm-up twin of the filter
     (§18), placed for its copy's box */
  function placeGeo(P, w, h, T, M) {
    var ew = Math.max(0, w - 2 * T + 2), eh = Math.max(0, h - 2 * T + 2);
    var pos = { tl: [0, 0, T, T], tr: [w - T, 0, T, T], bl: [0, h - T, T, T], br: [w - T, h - T, T, T],
                t: [T - 1, 0, ew, T], b: [T - 1, h - T, ew, T], l: [0, T - 1, T, eh], r: [w - T, T - 1, T, eh] };
    SLICES.forEach(function (k) {
      var q = pos[k], e = P.tiles[k];
      e.setAttribute('x', q[0]); e.setAttribute('y', q[1]);
      e.setAttribute('width', q[2]); e.setAttribute('height', q[3]);
    });
    if (P.ramp) { P.ramp.setAttribute('width', w); P.ramp.setAttribute('height', h); }
    var f = P.f;
    f.setAttribute('x', -M); f.setAttribute('y', -M);
    f.setAttribute('width', w + 2 * M); f.setAttribute('height', h + 2 * M);
  }

  function placeFull(st, maps) {
    var P = st.P, M = Math.ceil(maps.maxMag) + 6;
    P.map.setAttribute('href', maps.displacement);
    P.map.setAttribute('width', maps.w); P.map.setAttribute('height', maps.h);
    P.f.setAttribute('x', -M); P.f.setAttribute('y', -M);
    P.f.setAttribute('width', maps.w + 2 * M); P.f.setAttribute('height', maps.h + 2 * M);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     5. MATERIAL — recipe × tint slider × density × a11y × materialize
     Written as the overlay form c' = (1 − a)·c + a·g (a = 1 − scale, g =
     offset / a), because every modifier is "more or less wash".
     ───────────────────────────────────────────────────────────────────────── */
  var TINT = 0.5, RT_OVERRIDE = null;
  function reduceTransparency() {
    var a = html.getAttribute('data-reduce-transparency');
    if (a === 'off') return false;
    return a != null || RT_MQ.matches;
  }
  function increaseContrast() { return IC_MQ.matches || html.getAttribute('data-contrast') === 'more'; }

  function material(st, toneAs) {
    var tone = (toneAs || st.appearance) === 'light' ? 'light' : 'dark';
    var R = (st.kind === 'clear' ? RECIPES.clear : RECIPES[st.recipe] || RECIPES.panel)[tone];
    var a = 1 - R.scale, g = a > 1e-6 ? R.offset / a : 0, blur = st.cfg.blur;
    var rt = reduceTransparency(), ic = increaseContrast();
    var t = (rt || ic) ? 1 : TINT;                 /* RT / IC override the slider */
    if (st.kind !== 'clear') {
      if (t < 0.5) { var u = (0.5 - t) * 2; a *= 1 - 0.7 * u; blur *= 1 - 0.45 * u; }
      else { var v = (t - 0.5) * 2; a += (1 - a) * 0.62 * v; blur *= 1 + 0.6 * v; }
    }
    /* density follows motion: the media bar goes 7→14 px and 72→100% while it
       moves; relax at rest */
    var d = st.density || 0;
    blur *= 1 + d; a += (1 - a) * 0.45 * d;
    if (rt) { a = Math.max(a, tone === 'light' ? 0.9 : 0.86); blur = Math.max(blur, 24); }
    if (ic) a = Math.max(a, 0.93);
    /* The recipe keeps the backdrop's colour at full strength: sat × scale
       ≈ 1. Hold that product as the wash changes — less wash must not mean
       neon (tint → 0), more wash lets colour fade toward tinted (capped). */
    var sat = clamp(R.sat * R.scale / Math.max(0.02, 1 - a), 1, R.sat * 1.2);
    var p = st.mat == null ? 1 : st.mat;          /* materialize: 0 = no glass */
    a *= p; sat = 1 + (sat - 1) * p; blur *= p;
    var scale = 1 - a, offset = a * g, B = scale + 2 * offset;
    return { blur: blur, sat: sat, scale: scale, offset: offset, refr: p,
             B: B, C: B > 1e-6 ? scale / B : 1, rt: rt, ic: ic };
  }

  function frostString(m) {
    return 'blur(' + m.blur.toFixed(2) + 'px) saturate(' + m.sat.toFixed(3) + ') contrast(' +
           m.C.toFixed(3) + ') brightness(' + m.B.toFixed(3) + ')';
  }

  /* the material into the filter's primitives (skipped when nothing changed) */
  function fillFilter(st, m) {
    var P = st.P, sc = (st.merged ? st.maps.scale : st.tiles.scale) * m.refr, disp = st.cfg.dispersion;
    var key = [m.blur.toFixed(2), m.sat.toFixed(3), m.scale.toFixed(4), m.offset.toFixed(4), sc.toFixed(2)].join();
    if (key === st.matKey) return;
    st.matKey = key;
    P.frost.setAttribute('stdDeviation', m.blur.toFixed(2));
    P.disp.R.setAttribute('scale', (sc * (1 - disp)).toFixed(3));
    P.disp.G.setAttribute('scale', sc.toFixed(3));
    P.disp.B.setAttribute('scale', (sc * (1 + disp)).toFixed(3));
    P.sat.setAttribute('values', m.sat.toFixed(3));
    P.funcs.forEach(function (fn) { fn.setAttribute('slope', m.scale.toFixed(4)); fn.setAttribute('intercept', m.offset.toFixed(4)); });
    if (P.lensR) {
      /* lens px at the edge = scale·s·.5 → s = 2·lensPx/scale */
      var s = sc > 1e-3 ? clamp(2 * (st.lensPx || 0) * m.refr / sc, 0, 1) : 0;
      [P.lensR, P.lensG].forEach(function (fn) { fn.setAttribute('slope', s.toFixed(4)); fn.setAttribute('intercept', (0.5 - s / 2).toFixed(4)); });
    }
  }
  /* write the material to whatever path the host is on — cheap, per frame */
  function writeMaterial(host, st) {
    var m = material(st);
    host.style.setProperty('--lg3-mat', (st.mat == null ? 1 : st.mat).toFixed(3));
    host.style.setProperty('--lg3-density', (st.density || 0).toFixed(3));
    if (st.path === 'refraction' && st.P) {
      fillFilter(st, m);
    } else if (st.kind === 'glass' || st.kind === 'clear') {
      var fs = frostString(m);
      if (fs !== st.frostKey) { st.frostKey = fs; host.style.backdropFilter = host.style.webkitBackdropFilter = fs; }
    }
    return m;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     6. READING THE BACKDROP (on canvas[data-lg3-source])
     Luma drives tone and veil; WCAG luminance is reported for contrast only.
     Requires REAL overlap and skips out-of-bounds patches — a sampler that
     clamped kept a scrolled-away hero's reading and white ink on white.
     ───────────────────────────────────────────────────────────────────────── */
  /* The paintings on the page (ART3 canvases) are few: list them once, and
     again when one paints or the DOM changes. A host's source is the one
     painting its rect overlaps; only when SEVERAL overlap does the hit test
     (the expensive part of a reading) decide which is nearest in the stack. */
  var SOURCES = null;
  function sources() {
    if (!SOURCES) SOURCES = Array.prototype.slice.call(doc.querySelectorAll('canvas[data-lg3-source]'));
    return SOURCES;
  }
  function overlapRect(b, r) { return b.width && b.height && b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom; }
  function hitStack(r) {
    return doc.elementsFromPoint(clamp(r.left + r.width / 2, 1, innerWidth - 1), clamp(r.top + r.height / 2, 1, innerHeight - 1));
  }
  /* one adapt pass: every rect and hit test is read once, before any write */
  function newPass() {
    var rects = new Map();
    return { rect: function (e) { var r = rects.get(e); if (!r) { r = e.getBoundingClientRect(); rects.set(e, r); } return r; } };
  }
  function sourceUnder(host, r, pass, job) {
    var list = sources(), hits = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c.isConnected) { SOURCES = null; continue; }
      if (host.contains(c)) continue;
      if (overlapRect(pass ? pass.rect(c) : c.getBoundingClientRect(), r)) hits.push(c);
    }
    if (hits.length < 2) return hits[0] || null;
    var stack = job ? job.stack() : hitStack(r);
    for (var j = 0; j < stack.length; j++) {
      var e = stack[j];
      if (e === host || host.contains(e)) continue;
      for (var k = 0; k < hits.length; k++) if (e === hits[k] || e.contains(hits[k])) return hits[k];
    }
    return hits[0];
  }
  function srgb(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  /* A CPU copy of each painting, made once per paint. A GPU canvas answers
     every getImageData with a synchronous readback — the top cost of a
     scroll in the stage-3 profiles — so readings come from an array:
     ART3's own copy (ART3.pixels: painted on the CPU with the same ops, no
     GPU round trip at all), or for any other source one quarter-size
     nearest-neighbour shrink ON the GPU read back once. Re-made when the
     source repaints (its 'art3:painted' bumps its generation) or resizes. */
  var SNAP = 4, SPATCH = 3;                        /* canvas px per snapshot px; patch side in snapshot px */
  function snapshot(canvas) {
    var A = global.ART3, a = A && A.pixels ? A.pixels(canvas) : null;
    if (a && a.data && a.cw === canvas.width && a.ch === canvas.height) return a;
    var s = canvas.__lg3snap, gen = canvas.__lg3gen || 0;
    if (s && s.gen === gen && s.cw === canvas.width && s.ch === canvas.height) return s;
    var w = Math.max(SPATCH, Math.round(canvas.width / SNAP)), h = Math.max(SPATCH, Math.round(canvas.height / SNAP));
    try {
      var c = doc.createElement('canvas'); c.width = w; c.height = h;
      var x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(canvas, 0, 0, w, h);
      s = { gen: gen, id: 'lg3-' + (++uid), cw: canvas.width, ch: canvas.height, w: w, h: h, data: x.getImageData(0, 0, w, h).data };
    } catch (e) { s = null; }                      /* tainted or unreadable: no reading */
    PERF.snapshots = (PERF.snapshots || 0) + 1;
    canvas.__lg3snap = s;
    return s;
  }
  /* sampleRect(owner, host, rect) — 5 patches across (× 3 rows when tall),
     read from the painting's snapshot, memoised on `owner` until the host
     moves over the painting by 8 px or the painting changes (a host in flow
     over its own band's art reads once, however far the page scrolls). */
  function sampleRect(owner, host, hr, pass, job) {
    var canvas = sourceUnder(host, hr, pass, job);
    if (!canvas) return null;
    var cr = pass ? pass.rect(canvas) : canvas.getBoundingClientRect();
    if (!cr.width || !cr.height) return null;
    var snap = snapshot(canvas);
    if (!snap) return null;
    var key = [snap.id, Math.round(cr.width / 8), Math.round((hr.left - cr.left) / 8), Math.round((hr.top - cr.top) / 8),
      Math.round(hr.width / 8), Math.round(hr.height / 8)].join();
    var memo = owner.__lg3s;
    if (memo && memo.key === key) return memo.val;
    PERF.samples = (PERF.samples || 0) + 1;
    var sx = snap.w / cr.width, sy = snap.h / cr.height, data = snap.data, W = snap.w;
    var lums = [], rows = hr.height > 120 ? 3 : 1, N = 5, i, c, x, y, H = (SPATCH - 1) / 2;
    for (c = 0; c < rows; c++) {
      var cy = Math.round((hr.top + hr.height * (c + 0.5) / rows - cr.top) * sy) - H;
      if (cy < 0 || cy > snap.h - SPATCH) continue;
      for (i = 0; i < N; i++) {
        var cx = Math.round((hr.left + hr.width * (i + 0.5) / N - cr.left) * sx) - H;
        if (cx < 0 || cx > W - SPATCH) continue;
        var sum = 0, sum2 = 0, sumLin = 0, sr = 0, sg = 0, sb = 0, cnt = SPATCH * SPATCH;
        for (y = 0; y < SPATCH; y++) for (x = 0; x < SPATCH; x++) {
          var o = ((cy + y) * W + cx + x) * 4, R = data[o], Gv = data[o + 1], B = data[o + 2];
          var L = (0.2126 * R + 0.7152 * Gv + 0.0722 * B) / 255;
          sum += L; sum2 += L * L; sr += R; sg += Gv; sb += B;
          sumLin += 0.2126 * srgb(R) + 0.7152 * srgb(Gv) + 0.0722 * srgb(B);
        }
        var mean = sum / cnt;
        lums.push({ mean: mean, lin: sumLin / cnt, sd: Math.sqrt(Math.max(0, sum2 / cnt - mean * mean)),
                    r: sr / cnt / 255, g: sg / cnt / 255, b: sb / cnt / 255 });
      }
    }
    var out = null;
    if (lums.length) {
      var k = lums.length;
      var mAll = lums.reduce(function (a, b) { return a + b.mean; }, 0) / k;
      var localSd = lums.reduce(function (a, b) { return a + b.sd; }, 0) / k;
      var acrossSd = Math.sqrt(lums.reduce(function (a, b) { return a + (b.mean - mAll) * (b.mean - mAll); }, 0) / k);
      out = { mean: mAll, luminance: lums.reduce(function (a, b) { return a + b.lin; }, 0) / k,
              busy: Math.min(1, localSd * 2.4 + acrossSd * 1.6), samples: k, patches: lums };
    }
    owner.__lg3s = { key: key, val: out };
    return out;
  }
  function sampleBackdrop(host) { return sampleRect(host, host, host.getBoundingClientRect()); }

  function onScreen(r) { return r.width && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; }
  var DARK_MQ = mq('(prefers-color-scheme: dark)');
  function toneAttr(e) { var t = e && e.getAttribute('data-tone'); return t === 'light' || t === 'dark' ? t : null; }
  /* the tone of the band (or any [data-tone]) the host LIVES in — never the
     host's own attribute (chrome mirrors the appearance onto it) */
  function contextTone(host) {
    for (var e = host.parentElement; e; e = e.parentElement) { var t = toneAttr(e); if (t) return t; }
    return DARK_MQ.matches ? 'dark' : 'light';
  }
  /* declared tone: data-lg3-tone="light|dark"; ="context" = the band the host
     lives in; otherwise whatever [data-tone] is BEHIND its centre (a floating
     bar over a band takes that band's tone) */
  function declaredTone(host, r, job) {
    var own = host.getAttribute('data-lg3-tone');
    if (own === 'light' || own === 'dark') return own;
    if (own !== 'context') {
      r = r || host.getBoundingClientRect();
      /* off screen, a clamped probe would read whatever IS on screen */
      if (onScreen(r)) {
        var stack = job ? job.stack() : hitStack(r);
        for (var i = 0; i < stack.length; i++) {
          if (stack[i] === host || host.contains(stack[i])) continue;
          var s = stack[i].closest('[data-tone]');
          if (s && toneAttr(s)) return toneAttr(s);
        }
      }
    }
    return contextTone(host);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     7. CONFIG
     ───────────────────────────────────────────────────────────────────────── */
  var KINDS = { '': 'glass', glass: 'glass', clear: 'clear', chrome: 'chrome', platter: 'platter' };
  function sizeClassOf(w, h, declared) {
    if (declared === 'small' || declared === 'large') return declared;
    return (Math.min(w, h) <= 140 && w * h <= 150000) ? 'small' : 'large';
  }
  /* The untransformed border box: the filter region is in local space, so a
     scaled host measured by its rect gets a region the wrong size (a seam). */
  function borderBox(host) {
    var w = host.offsetWidth, h = host.offsetHeight;
    if (w && h) return { w: w, h: h };
    var r = host.getBoundingClientRect(); return { w: r.width, h: r.height };
  }
  /* A computed radius can be "50%" or "40px 20px": parseFloat("50%") is 50,
     and a highlight baked for 50 px on a 140 px orb draws a rounded square
     around the circle the browser clipped. Resolve, then clamp like CSS. */
  function radiusPx(v, w, h) {
    var p = String(v || '0').trim().split(/\s+/), rx = p[0], ry = p[1] || p[0];
    rx = /%$/.test(rx) ? parseFloat(rx) / 100 * w : parseFloat(rx) || 0;
    ry = /%$/.test(ry) ? parseFloat(ry) / 100 * h : parseFloat(ry) || 0;
    return Math.min(rx, ry, Math.min(w, h) / 2);
  }
  function cornerKOf(cs) {
    var v = cs.getPropertyValue('corner-top-left-shape') || cs.getPropertyValue('corner-shape') || '';
    v = v.trim().split(/\s+/)[0];
    var k = v ? G.resolveK(v) : num(cs.getPropertyValue('--lg3-k'), 1);
    return isFinite(k) ? k : 1;
  }

  function readConfig(host, st) {
    var d = host.dataset, cs = getComputedStyle(host), rect = host.getBoundingClientRect();
    var box = borderBox(host), w = box.w, h = box.h;
    var sx = rect.width && w ? rect.width / w : 1, sy = rect.height && h ? rect.height / h : 1;
    var radius = Math.min(num(d.lg3Radius, radiusPx(cs.borderTopLeftRadius, w, h)), Math.min(w, h) / 2);
    /* Where corner-shape is missing the browser draws a circle, so the field
       must be a circle too, or the highlight traces a corner that is not there. */
    var k = G.SUPPORTS_CORNER_SHAPE ? cornerKOf(cs) : 1;
    if (G.isCapsule(w, h, radius)) k = 1;             /* a capsule's end is a semicircle */
    var shapes = null, kM = 0;
    var spacing = host.getAttribute('data-lg3-container');
    if (spacing != null) {
      var parts = host.querySelectorAll('[data-lg3-shape]');
      if (parts.length) {
        kM = 2 * num(spacing, 10);
        shapes = [];
        parts.forEach(function (p) {
          var pr = p.getBoundingClientRect();
          if (pr.width < 2 || pr.height < 2) return;
          var pcs = getComputedStyle(p), pw = pr.width / sx, ph = pr.height / sy;
          var prr = radiusPx(pcs.borderTopLeftRadius, pw, ph), pk = G.SUPPORTS_CORNER_SHAPE ? cornerKOf(pcs) : 1;
          if (G.isCapsule(pw, ph, prr)) pk = 1;
          shapes.push({ cx: (pr.left - rect.left) / sx + pw / 2, cy: (pr.top - rect.top) / sy + ph / 2,
                        hw: pw / 2, hh: ph / 2, r: Math.min(prr, pw / 2, ph / 2), n: G.expFromK(pk) });
        });
        if (!shapes.length) shapes = null;
      }
    }
    var cfg = configFor(w, h, radius, k, d, st.kind);
    cfg.shapes = shapes; cfg.k = kM;
    return cfg;
  }
  /* the engine's defaults for a w×h box of radius r and corner k, with the
     author's tuning in d (a host's dataset, or statsFor's options) */
  function configFor(w, h, radius, k, d, kind) {
    var minSide = Math.min(w, h), size = sizeClassOf(w, h, d.lg3Size), large = size === 'large';
    /* A slab has one thickness whatever you cut from it: the bevel is nearly
       constant in px, growing a little with size (thicker glass), never past
       the radius or half the short side. 50 px bar → 17.75 (17 would also do). */
    var bezel = num(d.lg3Bezel, clamp(Math.min(radius || 20, minSide / 2,
      large ? 16 + 0.03 * minSide : 15 + 0.055 * minSide), 8, large ? 36 : 28));
    return {
      w: w, h: h, r: radius, cornerK: k, bezel: bezel, size: size, shapes: null, k: 0,
      ior: num(d.lg3Ior, 1.48),
      /* how far a ray travels inside: THE knob for how much the edge bends */
      thickness: num(d.lg3Thickness, bezel * (large ? 0.95 : 0.82)),
      maxTilt: num(d.lg3MaxTilt, 72) * Math.PI / 180,
      dispersion: num(d.lg3Dispersion, 0.045),
      /* circle keeps a measurable bend across the whole band (5 / 3.3 / 2.2 px at
         3 / 6 / 9 px in on a 50 px bar) where the squircle spends it in the outer
         3 px; lip pinches then releases — the larger surfaces */
      profile: d.lg3Profile || (large ? 'lip' : 'circle'),
      /* ≈ 8 pt on the tab bar; large glass scatters softer */
      blur: num(d.lg3Blur, kind === 'clear' ? 2.5 : large ? 12 : 8),
      rimBlur: num(d.lg3RimBlur, 0.4),
      /* how far in the SHARP lensed rim reaches before the frost takes over */
      rimFrac: num(d.lg3RimFrac, 0.6),        /* ≈10 px on a 50 px bar: the measured rim */
      lens: num(d.lg3Lens, large ? 0.35 : 0),
      lightAngle: num(d.lg3Light, 0),
      lightElev: num(d.lg3Elev, 0.5),
      shine: num(d.lg3Shine, large ? 26 : 34),
      debug: d.lg3Debug || null
    };
  }

  function layer(host, name) {
    var e = host.querySelector(':scope > .lg3__' + name);
    if (!e) {
      e = doc.createElement('span');
      e.className = 'lg3__' + name;
      e.setAttribute('aria-hidden', 'true');
      host.insertBefore(e, host.firstChild);
    }
    return e;
  }
  /* THE RASTER HINT (.lg3__aa): Chromium rasters a layer MULTISAMPLED once
     its display list holds a handful of "slow paths" (antialiased concave
     paths and clips: symbols, a superellipse ring, a corner clip), and a
     multisampled layer needs its own shader program for every kind of draw
     in it — text, symbols, gradients, the glass layers. Glass carries such
     content, so a host that grew or opened compiled 5–10 of those programs
     at 20–28 ms each in its first frames (index's pill → panel 133–164 ms,
     docs' share panel and patterns' alert as they land; all gone with raster
     MSAA off). A layer with ONE non-antialiased paint is never multisampled:
     this is that paint — a 4 px triangle, crisp edges, alpha 1/255, under
     the label. It changes no pixel anyone can see. */
  function crisp(host) {
    if (host.querySelector(':scope > .lg3__aa')) return;
    var e = doc.createElement('span');
    e.className = 'lg3__aa'; e.setAttribute('aria-hidden', 'true');
    var svg = el('svg', { width: 4, height: 4, viewBox: '0 0 4 4', focusable: 'false' }, e);
    el('path', { d: 'M0 0L4 1L1 4Z', fill: 'rgb(0 0 0 / .004)', 'shape-rendering': 'crispEdges' }, svg);
    host.insertBefore(e, host.firstChild);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     8. APPLY
     ───────────────────────────────────────────────────────────────────────── */
  var PERF = { lastBuildMs: 0, lastTileMs: 0, lastApplyMs: 0, lastMorphFrameMs: 0, morphFrames: 0,
               morphMeanMs: 0, morphMaxMs: 0 };
  var HOSTS = new Set();

  function stateOf(host) {
    var st = host.__lg3;
    if (!st) {
      st = host.__lg3 = { fid: 'lg3-f-' + (++uid), density: 0, mat: null, path: null };
      HOSTS.add(host);
    }
    st.kind = KINDS[(host.getAttribute('data-lg3') || '').trim()] || 'glass';
    st.recipe = host.getAttribute('data-lg3-recipe') || 'panel';
    return st;
  }

  function apply(host) {
    if (!host || !host.isConnected) return null;
    var t0 = now(), st = stateOf(host);
    observe(host);
    host.classList.add('lg3');
    host.setAttribute('data-lg3-kind', st.kind);
    if (!st.appearance) setAppearance(host, st, st.kind === 'clear' ? 'dark' : declaredTone(host));
    if (st.kind === 'chrome' || st.kind === 'platter') return host;   /* CSS does these */

    var cfg = readConfig(host, st);
    if (cfg.w < 4 || cfg.h < 4) return null;          /* hidden: the observer retries */
    st.cfg = cfg;
    st.merged = !!cfg.shapes;
    st.lens = cfg.lens > 0 && !st.merged;
    st.lensPx = st.lens ? cfg.lens * Math.min(cfg.w, cfg.h) / 2 * 0.06 : 0;
    host.setAttribute('data-lg3-size-class', cfg.size);

    var edge = layer(host, 'edge'); layer(host, 'rim');
    var spec = layer(host, 'spec'); layer(host, 'tint');
    if (host.hasAttribute('data-lg3-interactive')) layer(host, 'glow');
    if (st.kind === 'clear') layer(host, 'dim');
    /* the legibility veil / wash: created last, so it is FIRST in the host and
       paints under the tint ramp and the glow (all three sit at z −1) */
    if (host.hasAttribute('data-lg3-text') || host.hasAttribute('data-lg3-wash')) { layer(host, 'veil'); st.inks = null; }
    crisp(host);

    if (st.merged) {
      st.maps = buildMaps(Object.assign({ sign: 1 }, cfg));
      st.tiles = null;
      spec.style.borderImage = '';
      spec.style.backgroundImage = 'url("' + st.maps.specular + '")';
      host.style.maskImage = host.style.webkitMaskImage = 'url("' + st.maps.silhouette + '")';
      host.style.maskSize = host.style.webkitMaskSize = '100% 100%';
      host.querySelector(':scope > .lg3__rim').style.backgroundImage = 'url("' + st.maps.edge + '")';
      host.setAttribute('data-lg3-merged', '');
      if (!st.trapChecked) { st.trapChecked = true; maskTrap(host, st); }
    } else {
      st.maps = null;
      st.tiles = tilesFor(st, cfg.w, cfg.h, cfg.r);
      setSpecSlices(spec, st.tiles);
      if (host.hasAttribute('data-lg3-merged')) {
        host.style.maskImage = host.style.webkitMaskImage = '';
        host.querySelector(':scope > .lg3__rim').style.backgroundImage = '';
        host.removeAttribute('data-lg3-merged');
      }
    }
    edge.style.display = st.merged ? 'none' : '';
    host.style.setProperty('--lg3-shadow-spread', (0.72 + Math.min(1.5, Math.min(cfg.w, cfg.h) / 150)).toFixed(3));
    host.style.setProperty('--lg3-press-scale', (1 + clamp(8 / Math.max(cfg.w, cfg.h), 0.025, 0.07)).toFixed(4));
    st.path = null;                                   /* force the path write below */
    setPath(host, st, wantsRefraction(host, st) ? 'refraction' : 'frost');
    PERF.lastApplyMs = +(now() - t0).toFixed(2);
    return host;
  }

  /* `q` (morph frames): quantise radius to 4 px and band to 2 px so a
     growing silhouette re-bakes a dozen times, not every frame; placeTiles
     then draws the tiles scaled by r / r_q, so the arc still lands on the
     animated CSS radius (the band scales by < 5% — invisible in motion). */
  function tilesFor(st, w, h, r, q) {
    var c = st.cfg, minHalf = Math.min(w, h) / 2;
    var cap = G.isCapsule(w, h, r);
    var band = Math.max(1, Math.min(c.bezel, minHalf - 0.5));
    var rq = r, T, f = 1;
    if (q) {
      /* T is chosen from the QUANTISED corner alone, never from the growing
         box; while the box is still too small for it the tiles are drawn
         scaled down (f < 1) instead of re-baked every frame */
      rq = Math.max(4, Math.round(r / 4) * 4);
      band = Math.max(2, Math.round(Math.min(c.bezel, Math.max(2, minHalf - 0.5)) / 4) * 4);
      T = Math.ceil(Math.max(rq, band)) + 2;
      f = Math.min(r / rq, minHalf / T);
      cap = false;
    } else {
      T = Math.max(2, Math.min(Math.ceil(Math.max(r, band)) + 2, Math.floor(minHalf)));
    }
    var tiles = tileSet({ T: T, r: Math.min(rq, T), k: cap ? 1 : (q && r >= minHalf - 1 ? 1 : c.cornerK), band: band,
                     thickness: c.thickness, ior: c.ior, maxTilt: c.maxTilt,
                     profile: c.profile, lightAngle: st.light != null ? st.light : c.lightAngle,
                     lightElev: c.lightElev, shine: c.shine, rimFrac: c.rimFrac });
    st.tileF = f;
    return tiles;
  }
  /* the highlight is 9-sliced by CSS itself: border-image stretches the
     1-px middle strips, so the rim is right at any size, every frame, free */
  function setSpecSlices(spec, tiles, f) {
    var v = 'url("' + tiles.spec + '") ' + tiles.T + ' / ' + Math.max(1, Math.round(tiles.T * (f || 1))) + 'px / 0 stretch';
    if (spec.__lg3bi === v) return;
    spec.__lg3bi = v;
    spec.style.backgroundImage = '';
    spec.style.borderImage = v;
  }

  /* the host's SVG filter, built (once per structure) and placed for its
     current box — also for a host still on frost (the warm-up, §18) */
  function ensureFilter(st) {
    if (!st.P || st.P.merged !== st.merged || st.P.lens !== st.lens || st.P.debug !== st.cfg.debug) {
      buildFilter(st); st.P.merged = st.merged; st.P.lens = st.lens; st.P.debug = st.cfg.debug;
    }
    if (st.merged) placeFull(st, st.maps); else placeTiles(st, st.cfg.w, st.cfg.h, st.tiles);
  }

  function setPath(host, st, path) {
    if (st.path === path && path !== 'refraction') { writeMaterial(host, st); return; }
    st.path = path;
    host.setAttribute('data-lg3-engine', path);
    if (path === 'refraction') {
      ensureFilter(st);
      st.frostKey = null; st.matKey = null;
      writeMaterial(host, st);
      host.style.backdropFilter = host.style.webkitBackdropFilter = 'url(#' + st.fid + ')';
    } else {
      /* keep the filter DOM: an unreferenced filter costs nothing, and a
         host the budget hands back refracts again with one style write */
      st.frostKey = null; st.matKey = null;
      writeMaterial(host, st);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     9. THE REFRACTION BUDGET
     ───────────────────────────────────────────────────────────────────────── */
  var BUDGET_OVERRIDE = null, visible = new Set();
  function budget() {
    if (BUDGET_OVERRIDE != null) return BUDGET_OVERRIDE;
    var attr = html.getAttribute('data-lg3-budget');
    if (attr != null && isFinite(+attr)) return +attr;
    return innerWidth < 735 ? 1 : 3;                 /* the small breakpoint */
  }
  var granted = new Set();
  /* a morph in flight flies on frost (st.morphing) and holds the budget
     still: a slot traded mid-flight — the hidden source's going to the next
     host in line — switched an unrelated host's pass and compiled its
     programs inside the morph's frames. The trade happens when it lands. */
  var inFlight = 0, budgetAfterFlight = false;
  function wantsRefraction(host, st) {
    return granted.has(host) && !st.morphing && engine() === 'refraction' && !reduceTransparency() && !increaseContrast() &&
           !FC_MQ.matches && host.getAttribute('data-lg3-mode') !== 'frost';
  }
  function rebudget() {
    if (inFlight) { budgetAfterFlight = true; return; }
    var list = [];
    HOSTS.forEach(function (h) {
      var st = h.__lg3;
      if (!h.isConnected) { forget(h); return; }
      if (!st || !st.cfg || (st.kind !== 'glass' && st.kind !== 'clear')) return;
      if (h.getAttribute('data-lg3-mode') === 'frost' || h.hasAttribute('data-lg3-away')) return;
      /* the content layer removes the material (lg3.css): never spend a slot there */
      if (h.hasAttribute('data-lg3-off') || h.closest('.layer-content')) return;
      if (!visible.has(h)) return;
      list.push(h);
    });
    list.sort(function (a, b) {
      var pa = num(a.getAttribute('data-lg3-priority'), 0), pb = num(b.getAttribute('data-lg3-priority'), 0);
      if (pa !== pb) return pb - pa;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    var n = engine() === 'refraction' ? budget() : 0;
    granted = new Set(list.slice(0, n));
    HOSTS.forEach(function (h) {
      var st = h.__lg3;
      if (!st || !st.cfg || (st.kind !== 'glass' && st.kind !== 'clear')) return;
      var want = wantsRefraction(h, st) ? 'refraction' : 'frost';
      if (st.path !== want) setPath(h, st, want);
    });
    html.setAttribute('data-lg3-refracting', Math.min(n, list.length) + '/' + n);
  }
  var budgetQueued = false;
  function queueBudget() {
    if (budgetQueued) return; budgetQueued = true;
    later(function () { budgetQueued = false; rebudget(); });
  }
  /* rAF does not fire in a hidden page: pair it with a timeout, first wins */
  function later(fn) {
    var done = false, run = function () { if (!done) { done = true; fn(); } };
    if (global.requestAnimationFrame) requestAnimationFrame(run);
    setTimeout(run, 120);
  }
  /* work that must not sit inside a frame: the browser's idle time, with a
     deadline so it still happens while the page is busy (or has no rIC) */
  function idle(fn, timeout) {
    if (global.requestIdleCallback) return requestIdleCallback(fn, { timeout: timeout || 200 });
    return setTimeout(function () { fn({ didTimeout: true, timeRemaining: function () { return 6; } }); }, 32);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     10. ADAPTIVITY — tone (small only, with hysteresis), shadow, clear dim,
     legibility. One PASS reads every host (rects, hit tests, pixels) before
     it writes anything, so a pass costs one layout, not one per host.
     ───────────────────────────────────────────────────────────────────────── */
  function setAppearance(host, st, tone) {
    if (st.appearance === tone) return false;
    st.appearance = tone;
    host.setAttribute('data-lg3-appearance', tone);
    return true;
  }
  function prop(host, st, name, v) {
    var c = st.props || (st.props = {});
    /* skip a write that would change nothing (the inline value is read back:
       someone else may have reset the style attribute) */
    if (c[name] === v && host.style.getPropertyValue(name) === (v == null ? '' : v)) return;
    c[name] = v;
    if (v == null) host.style.removeProperty(name); else host.style.setProperty(name, v);
  }

  /* ── LEGIBILITY (data-lg3-text) ────────────────────────────────────────
     A label on glass over MID-tone art has the worst ground for either ink
     (white on dark glass, #1d1d1f on light measured 1.7–4.3:1 on the pages).
     Glass takes a denser material where there is text; this does so per
     host and per reading: the engine models what the glass paints over each
     sampled patch (the recipe's saturate → scale/offset on the blurred
     colour, then the veil, then the tint ramp) and raises the veil — the
     reduce-transparency fill, .lg3__veil — by the smallest share that holds
     TEXT_TARGET for the host's ink on the worst patch. Mid-tone art needs
     most; dark art under white ink, or pale art under dark ink, needs none.
       data-lg3-text           the host's own ink (its `color`)
       data-lg3-text="dense"   the SECONDARY ink (--lg3-ink-2): panels with
                               subtitles and body copy
     No painting under the host: the first opaque background in the stack is
     the ground; images or video (pixels it cannot read) take DEFAULT_SHARE,
     the share measured over mid-tone art. Reduce transparency and increased
     contrast replace the whole answer (lg3.css hides the veil there). */
  var TEXT_TARGET = 4.5 * 1.25;   /* patch MEANS predict the median pixel; the 90th-percentile pixel runs ≈10% brighter */
  var DEFAULT_SHARE = { dark: 0.36, light: 0.4, denseDark: 0.5, denseLight: 0.52 };
  var RAMP_MID = { dark: 0.01, light: 0.05 };      /* lg3.css tint ramp at mid-height (white) */
  var RGB1 = null;
  function rgbOf(css) {
    css = String(css || '').trim();
    var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(css);
    if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] == null ? 1 : m[5] ? m[4] / 100 : +m[4]];
    m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css);
    if (m) { var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1], v = parseInt(h, 16);
      return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255, 1]; }
    if (!css) return null;
    try {   /* color-mix(), oklab(), color(srgb …): let a 1 px canvas resolve it */
      if (!RGB1) { var c = doc.createElement('canvas'); c.width = c.height = 1; RGB1 = c.getContext('2d', RF); }
      RGB1.clearRect(0, 0, 1, 1); RGB1.fillStyle = 'rgba(0,0,0,0)'; RGB1.fillStyle = css; RGB1.fillRect(0, 0, 1, 1);
      var d = RGB1.getImageData(0, 0, 1, 1).data;
      return d[3] ? [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255] : null;   /* unparsed stays transparent */
    } catch (e) { return null; }
  }
  function lumOf(c) { return 0.2126 * srgb(c[0] * 255) + 0.7152 * srgb(c[1] * 255) + 0.0722 * srgb(c[2] * 255); }
  function ratioOf(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
  /* the inks and the veil colour this host shows at its appearance (read
     once per appearance: a style read after the appearance is written) */
  function inksOf(host, st) {
    var k = st.inks;
    if (k && k.ap === st.appearance) return k;
    var light = st.appearance === 'light', cs = getComputedStyle(host);
    var veil = host.querySelector(':scope > .lg3__veil'), v = veil ? rgbOf(getComputedStyle(veil).backgroundColor) : null;
    return (st.inks = {
      ap: st.appearance,
      primary: rgbOf(cs.color) || (light ? [0.114, 0.114, 0.122] : [1, 1, 1]),
      secondary: rgbOf(cs.getPropertyValue('--lg3-ink-2')) || (light ? [0.259, 0.259, 0.271] : [0.824, 0.824, 0.843]),
      veil: v && v[3] > 0.05 ? v : (light ? [0.965, 0.965, 0.973, 0.96] : [0.11, 0.11, 0.118, 0.94])
    });
  }
  /* luminance of what the glass paints over one patch with the veil at `a` */
  function groundOver(p, m, veil, a, w) {
    var s = m.sat, r = p.r, g = p.g, b = p.b, va = a * veil[3], out = [
      (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
      (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
      (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b];
    for (var i = 0; i < 3; i++) {
      var v = clamp(clamp(out[i], 0, 1) * m.scale + m.offset, 0, 1);
      v = v * (1 - va) + veil[i] * va;
      out[i] = v + (1 - v) * w;
    }
    return lumOf(out);
  }
  /* the smallest veil share (0..1) that holds the target on every patch */
  function shareFor(host, st, ground, dense) {
    var m = material(st), k = inksOf(host, st);
    if (m.rt || m.ic) return 0;
    var ink = lumOf(dense ? k.secondary : k.primary), w = RAMP_MID[st.appearance === 'light' ? 'light' : 'dark'] * (st.mat == null ? 1 : st.mat);
    var need = 0;
    ground.patches.forEach(function (p) {
      if (need >= 1 || ratioOf(ink, groundOver(p, m, k.veil, need, w)) >= TEXT_TARGET) return;
      if (ratioOf(ink, groundOver(p, m, k.veil, 1, w)) < TEXT_TARGET) { need = 1; return; }
      var lo = need, hi = 1;
      for (var i = 0; i < 14; i++) { var mid = (lo + hi) / 2; if (ratioOf(ink, groundOver(p, m, k.veil, mid, w)) >= TEXT_TARGET) hi = mid; else lo = mid; }
      need = hi;
    });
    return need;
  }
  /* no painting under the host: the first opaque background behind it */
  function flatGround(host, job) {
    var stack = job.stack();
    for (var i = 0; i < stack.length; i++) {
      var e = stack[i];
      if (e === host || host.contains(e)) continue;
      if (/^(IMG|VIDEO|CANVAS|IFRAME|OBJECT|EMBED|PICTURE)$/.test(e.tagName)) return null;   /* pixels it cannot read */
      var cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      var c = rgbOf(cs.backgroundColor);
      if (c && c[3] >= 0.6) return { patches: [{ r: c[0], g: c[1], b: c[2] }], flat: true };
    }
    return null;
  }
  function writeLegible(host, st, job) {
    var share;
    if (job.ground) share = shareFor(host, st, job.ground, job.dense);
    else {
      var light = st.appearance === 'light';
      share = job.dense ? (light ? DEFAULT_SHARE.denseLight : DEFAULT_SHARE.denseDark) : (light ? DEFAULT_SHARE.light : DEFAULT_SHARE.dark);
      var m = material(st); if (m.rt || m.ic) share = 0;
    }
    share = Math.round(share * 100) / 100;
    /* hysteresis: a veil that follows every scroll pixel would breathe */
    if (st.legible != null && Math.abs(share - st.legible) < 0.03 && !(share === 0 && st.legible > 0)) return;
    st.legible = share;
    prop(host, st, '--lg3-legible', share.toFixed(2));
  }

  /* one host's reading — reads only; commitOne writes after the whole pass */
  function planOne(host, st, job, shared) {
    var b = shared !== undefined ? shared : (job.on ? sampleRect(host, host, job.r, job.pass, job) : null);
    var small = !st.cfg || st.cfg.size === 'small', tone;
    if (st.kind === 'clear') tone = 'dark';           /* clear is not adaptive */
    else if (host.hasAttribute('data-lg3-adaptive') && small && b) {
      /* hysteresis: each flip changes the recipe; a bar crossing a band edge
         must not strobe */
      var cur = st.appearance;
      tone = cur === 'light' ? (b.mean < 0.5 ? 'dark' : 'light')
           : cur === 'dark' ? (b.mean > 0.62 ? 'light' : 'dark')
           : (b.mean > 0.56 ? 'light' : 'dark');
    } else tone = declaredTone(host, job.r, job);    /* large hosts never flip */
    job.b = b; job.tone = tone;
    var tm = host.getAttribute('data-lg3-text');
    job.text = tm != null;
    if (job.text && job.on && st.cfg) {
      job.dense = tm === 'dense';
      job.ground = b && b.patches ? b : flatGround(host, job);
      job.legible = true;
    } else if (job.text && st.cfg && st.legible == null) {
      /* never read yet (off screen at boot): the measured default share, not 0 —
         a text host scrolled in before the next idle pass must not flash (or be
         measured) with no veil at all. The first on-screen reading replaces it. */
      job.dense = tm === 'dense';
      job.ground = null;
      job.legible = true;
    }
  }
  function commitOne(host, st, job) {
    var changed = setAppearance(host, st, job.tone), b = job.b;
    if (b) {
      /* deeper over text/busy content, lighter over flat light. Floor
         .85 over dark art so floating chrome keeps its lift. */
      var s = clamp(0.55 + 0.8 * b.busy - 0.38 * b.mean, 0.22, 1.5);
      if (b.mean < 0.45) s = Math.max(s, 0.85);
      prop(host, st, '--lg3-shadow-strength', s.toFixed(3));
      prop(host, st, '--lg3-shadow-hard', b.busy.toFixed(3));
      if (st.kind === 'clear') prop(host, st, '--lg3-dim', (0.12 + 0.36 * smoothstep(0.25, 0.75, b.mean)).toFixed(3));
      st.sample = b;
    }
    if (changed && st.cfg) { st.matKey = st.frostKey = null; writeMaterial(host, st); }
    if (job.legible) writeLegible(host, st, job);
    else if (!job.text && st.legible != null) { st.legible = null; prop(host, st, '--lg3-legible', null); }
  }
  function jobFor(el, pass) {
    var r = pass.rect(el), stack = null;
    return { r: r, on: onScreen(r), pass: pass, stack: function () { return stack || (stack = hitStack(r)); } };
  }
  /* adapt(scope): 'full' = every host; 'visible' = hosts on (or near) the
     screen and any not read yet — off-screen hosts are read as they enter */
  function adapt(scope) {
    var t0 = now(), pass = newPass(), solo = [], groups = new Map(), work = [];
    var partial = scope === 'visible';
    HOSTS.forEach(function (h) {
      var st = h.__lg3;
      if (!st || !h.isConnected) return;
      if (partial && st.appearance && !visible.has(h)) return;
      var c = h.parentElement && h.parentElement.closest('[data-lg3-container]:not([data-lg3])');
      if (c) { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(h); }
      else solo.push(h);
    });
    solo.forEach(function (h) { var j = jobFor(h, pass); planOne(h, h.__lg3, j); work.push([h, j]); });
    /* one sampling context per container: its members share one reading so
       their appearance stays consistent (GlassEffectContainer) */
    groups.forEach(function (members, c) {
      var cj = jobFor(c, pass), b = cj.on ? sampleRect(c, members[0], cj.r, pass, cj) : null;
      members.forEach(function (h) { var j = jobFor(h, pass); planOne(h, h.__lg3, j, b); work.push([h, j]); });
    });
    work.forEach(function (w) { commitOne(w[0], w[0].__lg3, w[1]); });
    PERF.adapts = (PERF.adapts || 0) + 1;
    PERF.lastAdaptMs = +(now() - t0).toFixed(2);
    PERF.adaptMs = +((PERF.adaptMs || 0) + (now() - t0)).toFixed(2);
    lastAdapt = now();
  }
  /* queueAdapt(full, soon): one visible pass (full: every host). soon = before
     the next frame (a tone switch, a new host, a morph landing); otherwise
     in idle time within 100 ms (a host entering the observer's margin is
     still off screen, a paint or a resize can wait a frame or two) */
  var adaptQueued = false, adaptSoon = false, adaptFull = false, lastAdapt = -1e9, scrollPending = false;
  function queueAdapt(full, soon) {
    if (full === true) adaptFull = true;
    if (adaptQueued && (adaptSoon || !soon)) return;
    adaptQueued = true;
    var by = PERF.adaptBy || (PERF.adaptBy = { soon: 0, idle: 0, scroll: 0 });
    if (soon) { by.soon++; adaptSoon = true; later(runAdapt); } else { by.idle++; idle(runAdapt, 100); }
  }
  function runAdapt() {
    if (!adaptQueued) return;                       /* the other scheduler ran it */
    adaptQueued = adaptSoon = false;
    var f = adaptFull; adaptFull = false;
    adapt(f ? 'full' : 'visible');
  }
  /* scroll: at most one pass per ~120 ms, in idle time, never inside the
     scroll's frames — and always one after the last scroll event (it is
     either pending then, or schedules one) */
  function onScroll() {
    lastBusy = now();
    if (scrollPending || adaptQueued) return;
    scrollPending = true;
    setTimeout(function () {
      idle(function () { scrollPending = false; if (!adaptQueued) { (PERF.adaptBy || (PERF.adaptBy = { soon: 0, idle: 0, scroll: 0 })).scroll++; adapt('visible'); } }, 120);
    }, Math.max(0, lastAdapt + 120 - now()));
  }

  /* ─────────────────────────────────────────────────────────────────────────
     11. RESIZE — 9-slice hosts follow any size at once; merged hosts fall
     back to frost for the move and rebuild when it settles
     ───────────────────────────────────────────────────────────────────────── */
  var settleTimer = 0, settling = new Set();
  function resized(host) {
    if (!host.isConnected) { if (host.__lg3) forget(host); return; }   /* a removed probe */
    var st = host.__lg3;
    /* chrome and platter are CSS only: a resize is nothing to them (they
       used to re-apply and queue a pass on every size change) */
    if (st && (st.kind === 'chrome' || st.kind === 'platter')) return;
    /* a host that was too small to build (hidden) builds once it has a box */
    if (!st || !st.cfg) { if (apply(host) && host.__lg3.cfg) { queueBudget(); queueAdapt(false, true); } return; }
    /* a morph owns its 9-slice host's box every frame and re-applies it when
       it lands. Settling it here re-applied it MID-flight whenever a frame ran
       past 90 ms, reading the in-flight corner-shape — a new exponent, a
       107–127 ms unit-field bake inside the morph (patterns' alert, docs'
       share panel) */
    if (st.morphing && !st.merged) return;
    var b = borderBox(host);
    if (Math.round(b.w) === Math.round(st.cfg.w) && Math.round(b.h) === Math.round(st.cfg.h)) return;
    if (st.merged || st.morphing) { beginSettle(host); return; }
    st.cfg.w = b.w; st.cfg.h = b.h;
    /* A box that keeps changing (a scroll-driven pill → panel: index's
       .ov-morph resizes every scroll frame) re-baked its tiles for every
       0.1 px of radius and every 2 px of height — 28 bakes a pass, each
       nine new images to decode and upload. While it moves, the morph's
       quantised tiles (a handful for the whole travel, drawn scaled so the
       arc stays on the CSS radius); the exact bake once it has been still
       for 160 ms. */
    retile(host, st, b.w, b.h, true);
    clearTimeout(st.exactT);
    st.exactT = setTimeout(function () {
      if (host.__lg3 === st && host.isConnected && st.cfg && !st.merged && !st.morphing) retile(host, st, st.cfg.w, st.cfg.h, false);
    }, 160);
    bumpDensity(host, st);
  }
  function retile(host, st, w, h, q) {
    var r = Math.min(num(host.dataset.lg3Radius, radiusPx(getComputedStyle(host).borderTopLeftRadius, w, h)), Math.min(w, h) / 2);
    var tiles = tilesFor(st, w, h, r, q);
    st.tiles = tiles;
    setSpecSlices(host.querySelector(':scope > .lg3__spec'), tiles, st.tileF);
    if (st.path === 'refraction') placeTiles(st, w, h, tiles);
  }
  function beginSettle(host) {
    var st = host.__lg3;
    host.setAttribute('data-lg3-resizing', '');
    if (st.path === 'refraction') { st.path = null; setPath(host, st, 'frost'); st.path = 'frost-settling'; }
    settling.add(host);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () {
      var list = Array.from(settling); settling.clear();
      list.forEach(function (h) { h.removeAttribute('data-lg3-resizing'); apply(h); });
      queueBudget();
    }, 90);
  }
  /* density follows motion: a resize makes the glass denser, then it relaxes */
  function bumpDensity(host, st) {
    st.density = Math.min(1, (st.density || 0) + 0.5);
    writeMaterial(host, st);
    clearTimeout(st.relaxT);
    st.relaxT = setTimeout(function () { relax(host, st); }, 140);
  }
  function relax(host, st) {
    var t0 = now(), d0 = st.density;
    (function step() {
      var p = Math.min(1, (now() - t0) / 320);
      st.density = d0 * (1 - p) * (1 - p);
      writeMaterial(host, st);
      if (p < 1 && !st.morphing) frame(step); else if (!st.morphing) { st.density = 0; writeMaterial(host, st); }
    })();
  }
  function frame(fn) { if (global.requestAnimationFrame && doc.visibilityState !== 'hidden') requestAnimationFrame(fn); else setTimeout(fn, 16); }

  /* merged hosts: rebuild while a shape child transitions (throttled), and
     once at the end — a segmented indicator travelling inside a fused lens */
  function shapeMotion(host) {
    var st = host.__lg3; if (!st || !st.merged) return;
    if (st.shapeLoop) return;
    st.shapeLoop = true;
    var last = 0;
    (function loop() {
      if (!st.shapeRunning) { st.shapeLoop = false; apply(host); return; }
      var t = now();
      if (t - last > 33) { last = t; var t0 = now(); apply(host); PERF.lastShapeFrameMs = +(now() - t0).toFixed(2); }
      frame(loop);
    })();
  }

  var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function (es) {
    es.forEach(function (e) { resized(e.target); });
  }) : null;
  var io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(function (es) {
    var entered = false;
    es.forEach(function (e) {
      if (e.isIntersecting) { entered = true; visible.add(e.target); }
      else visible.delete(e.target);
    });
    queueBudget();
    /* a host that enters is read before it shows; one that leaves needs nothing */
    if (entered) queueAdapt();
  }, { rootMargin: '120px' }) : null;

  /* every host is watched for size and visibility from its first apply —
     mount's, a component's LG3.apply/refresh, or the DOM observer's */
  function observe(h) {
    if (h.__lg3Obs) return;
    h.__lg3Obs = true;
    if (ro) ro.observe(h);
    if (io) io.observe(h);
    /* until the observer first reports, near the screen counts as visible */
    var r = h.getBoundingClientRect();
    if (!io || (r.width && r.bottom > -120 && r.top < innerHeight + 120)) visible.add(h);
  }
  /* forget(h): stop tracking a host (the element keeps its current look; a
     later apply starts it afresh — its filter is rebuilt, never reused) */
  function forget(h) {
    var st = h.__lg3;
    if (st && st.P) st.P.f.remove();
    HOSTS.delete(h); visible.delete(h); granted.delete(h);
    if (ro) ro.unobserve(h); if (io) io.unobserve(h);
    if (st && st.rampStop) st.rampStop();
    h.__lg3 = null; h.__lg3Obs = false; h.__lg3s = null;
    FORGOTTEN.add(h);
  }
  /* a CLONE of glass (a DEVICE snapshot, a morph ghost) carries the .lg3
     class and layers but no engine state: never a host of its own */
  var FORGOTTEN = typeof WeakSet !== 'undefined' ? new WeakSet() : { add: function () {}, has: function () { return false; } };
  function isClone(h) { return h.classList.contains('lg3') && !h.__lg3 && !FORGOTTEN.has(h); }

  /* THE MERGED-MASK TRAP (Chromium): a merged host's silhouette is a
     mask-image; inside an ancestor that CLIPS (overflow other than visible)
     with a superellipse corner (corner-shape ≠ round), the backdrop pass
     ignores the mask and frosts the host's whole rectangle. The engine cannot
     see the result, only the recipe: warn once, naming the ancestor. The fix
     is the ancestor's: corner-shape: round with the equal-mass radius
     (r / --r-scale), or no clipping. Silent when the union fills the host's
     own rounded box anyway (a segmented track): the frost then looks right. */
  var trapWarned = false;
  function maskTrap(host, st) {
    if (trapWarned || !G.SUPPORTS_CORNER_SHAPE) return;
    var c = st.cfg, r = Math.min(c.r || 0, Math.min(c.w, c.h) / 2), box = c.w * c.h - (4 - Math.PI) * r * r;
    if (st.maps && st.maps.coverage * c.w * c.h >= 0.97 * box) return;
    /* The map's coverage counts the feathered rim short (a segmented track that
       visibly fills its capsule measures .83–.86), so it cannot prove the union
       fills the box. Geometry can: one shape spanning the host (a track) means
       the frost falls exactly where the silhouette is. */
    var hb = host.getBoundingClientRect(), hs = getComputedStyle(host), shapes = host.querySelectorAll('[data-lg3-shape]');
    var cw = hb.width - parseFloat(hs.paddingLeft) - parseFloat(hs.paddingRight),
        ch = hb.height - parseFloat(hs.paddingTop) - parseFloat(hs.paddingBottom);
    for (var i = 0; i < shapes.length; i++) {
      var sb = shapes[i].getBoundingClientRect();      /* a track spans the CONTENT box (the host pads it) */
      if (sb.width >= 0.97 * cw && sb.height >= 0.97 * ch) return;
    }
    for (var e = host.parentElement; e && e !== doc.body && e !== html; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      if (!(parseFloat(cs.borderTopLeftRadius) > 0)) continue;
      var v = (cs.getPropertyValue('corner-top-left-shape') || cs.getPropertyValue('corner-shape') || '').trim().split(/\s+/)[0];
      if (!v || G.resolveK(v) === 1) continue;
      trapWarned = true;
      try { console.warn('LG3: a merged glass host (data-lg3-container with [data-lg3-shape] children) sits inside an ancestor that clips with a superellipse corner (overflow ' +
        cs.overflowX + ', corner-shape ' + v + '). Chromium then frosts the host\'s whole rectangle instead of its merged silhouette. Give that ancestor corner-shape: round (with the equal-mass radius) or stop it clipping.', e, host); } catch (x) {}
      return;
    }
  }

  /* NEW HOSTS, TONE CHANGES — one DOM observer, started by mount():
     · an element that gains [data-lg3] (inserted, or the attribute set) is
       applied: components no longer need to call LG3.apply themselves;
       a CLONE of glass (the .lg3 class without engine state — a snapshot,
       a morph ghost) is left alone;
     · data-lg3-text / data-lg3-wash on a host adds its veil layer;
     · data-tone anywhere but on a glass host (chrome mirrors the appearance
       there), or data-lg3-tone on a host, re-reads the tones. */
  var mo = null;
  function watchDom() {
    if (mo || typeof MutationObserver === 'undefined') return;
    mo = new MutationObserver(function (records) {
      var fresh = new Set(), again = new Set(), veil = new Set(), tone = false;
      records.forEach(function (rec) {
        var t = rec.target;
        if (rec.type === 'childList') {
          /* the warm-up deck (§18) and its copies are none of the engine's business */
          if (t.nodeType === 1 && t.hasAttribute('data-lg3-warm')) return;
          rec.addedNodes.forEach(function (n) {
            if (n.nodeType !== 1 || n.hasAttribute('data-lg3-warm')) return;
            if (n.matches('canvas[data-lg3-source]') || (n.firstElementChild && n.querySelector('canvas[data-lg3-source]'))) SOURCES = null;
            if (n.matches('[data-lg3]')) fresh.add(n);
            if (n.firstElementChild) n.querySelectorAll('[data-lg3]').forEach(function (h) { fresh.add(h); });
          });
          if (Array.prototype.some.call(rec.removedNodes, function (n) { return !(n.nodeType === 1 && n.hasAttribute('data-lg3-warm')); })) SOURCES = null;
        } else if (rec.attributeName === 'data-lg3') {
          if (!t.hasAttribute('data-lg3')) return;
          if (t.__lg3 && HOSTS.has(t)) again.add(t); else fresh.add(t);
        } else if (rec.attributeName === 'data-lg3-text' || rec.attributeName === 'data-lg3-wash') {
          if (t.__lg3 && HOSTS.has(t)) veil.add(t);
        } else if (rec.attributeName === 'data-lg3-tone' || !t.__lg3) tone = true;
      });
      fresh.forEach(function (h) {
        if (!h.isConnected || h.closest('.lg3__ghost')) return;
        if (isClone(h)) return;
        if (h.__lg3 && h.__lg3.cfg && HOSTS.has(h)) return;           /* its component applied it */
        apply(h);
      });
      again.forEach(function (h) { if (h.isConnected) apply(h); });
      /* text / wash only need the veil layer and a fresh reading of the inks */
      veil.forEach(function (h) {
        if (!h.__lg3 || !h.__lg3.cfg || again.has(h)) return;
        if (h.hasAttribute('data-lg3-text') || h.hasAttribute('data-lg3-wash')) layer(h, 'veil');
        h.__lg3.inks = null;
      });
      if (fresh.size || again.size) { queueBudget(); queueWarm(); }
      if (fresh.size || again.size || veil.size || tone) queueAdapt(false, true);
    });
    mo.observe(html, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-lg3', 'data-tone', 'data-lg3-tone', 'data-lg3-text', 'data-lg3-wash'] });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     12. PRESS, GLOW, LIVE LIGHT
     Measured: the glow is white, 93 pt across,
     rises in .1 s, and on release expands 4× and fades over .5 s; it spreads
     onto neighbouring glass. The press LIFTS (scale up), not down.
     ───────────────────────────────────────────────────────────────────────── */
  var GLOW_REACH = 150;
  function glowAt(host, x, y, strength) {
    var r = host.getBoundingClientRect(); if (!r.width) return;
    host.style.setProperty('--lg3-gx', ((x - r.left) / r.width * 100).toFixed(1) + '%');
    host.style.setProperty('--lg3-gy', ((y - r.top) / r.height * 100).toFixed(1) + '%');
    host.style.setProperty('--lg3-glow', strength.toFixed(3));
    host.style.setProperty('--lg3-glow-r', '1');
    /* neighbours in the same container, falling off with the REAL gap */
    var c = host.closest('[data-lg3-container]');
    if (!c) return;
    var reach = num(c.getAttribute('data-lg3-glow'), GLOW_REACH);
    c.querySelectorAll('.lg3[data-lg3-interactive]').forEach(function (n) {
      if (n === host) return;
      var b = n.getBoundingClientRect();
      var dx = Math.max(b.left - x, 0, x - b.right), dy = Math.max(b.top - y, 0, y - b.bottom);
      var f = Math.max(0, 1 - Math.hypot(dx, dy) / reach);
      n.style.setProperty('--lg3-glow', (f * f * 0.55 * strength).toFixed(3));
      n.style.setProperty('--lg3-glow-r', (1 + f * 0.6).toFixed(2));
      n.style.setProperty('--lg3-gx', clamp((x - b.left) / b.width * 100, -40, 140).toFixed(1) + '%');
      n.style.setProperty('--lg3-gy', clamp((y - b.top) / b.height * 100, -40, 140).toFixed(1) + '%');
    });
  }
  function releaseGlow(host) {
    var c = host.closest('[data-lg3-container]');
    var list = c ? c.querySelectorAll('.lg3[data-lg3-interactive]') : [host];
    Array.prototype.forEach.call(list, function (n) {
      n.style.setProperty('--lg3-glow-r', '4');       /* expands across the bar… */
      n.style.setProperty('--lg3-glow', '0');         /* …as it fades (.5 s, CSS) */
    });
  }
  var pressed = null;
  function onDown(ev) {
    var host = ev.target.closest && ev.target.closest('.lg3[data-lg3-interactive]');
    if (!host) return;
    pressed = host;
    host.setAttribute('data-lg3-pressed', '');
    glowAt(host, ev.clientX, ev.clientY, ev.pointerType === 'touch' ? 1 : 0.8);
  }
  function onUp() {
    var host = pressed; if (!host) return;
    pressed = null;
    host.removeAttribute('data-lg3-pressed');
    releaseGlow(host);
    /* the late release wobble (0.9 s after touch-up, scaleY ≈ 1.5× scaleX,
       inverted) — elasticity, so none under reduced motion */
    if (!RM.matches && host.animate) {
      if (host.__lg3Wob) host.__lg3Wob.cancel();
      host.__lg3Wob = host.animate([{ scale: '1 1' }, { scale: '0.996 1.006' }, { scale: '1.003 0.995' }, { scale: '1 1' }],
        { duration: 640, delay: 900, easing: 'ease-in-out' });
    }
  }
  var pointer = null, moveQueued = false;
  function onMove(ev) {
    pointer = { x: ev.clientX, y: ev.clientY, touch: ev.pointerType === 'touch' };
    if (moveQueued) return; moveQueued = true;
    later(runMove);
  }
  var LIGHT_STEP = 5;
  function runMove() {
    moveQueued = false;
    var p = pointer; if (!p) return;
    if (pressed) glowAt(pressed, p.x, p.y, p.touch ? 1 : 0.8);
    else if (!p.touch) {
      /* pointer hover: a subdued glow (pointer response is quieter) */
      var over = doc.elementFromPoint(p.x, p.y), host = over && over.closest && over.closest('.lg3[data-lg3-interactive]');
      if (host !== hovered) { if (hovered) releaseGlow(hovered); hovered = host; }
      if (host) glowAt(host, p.x, p.y, 0.3);
    }
    /* live highlight: quantised so the tile cache hits after one sweep */
    HOSTS.forEach(function (h) {
      if (!h.hasAttribute('data-lg3-live') || !h.__lg3 || !h.__lg3.cfg || RM.matches) return;
      var r = h.getBoundingClientRect();
      if (!r.width || r.bottom < -80 || r.top > innerHeight + 80) return;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var ang = (Math.atan2(p.x - cx, -(p.y - cy)) * 180 / Math.PI + 360) % 360;
      var stepped = Math.round(ang / LIGHT_STEP) * LIGHT_STEP % 360;
      var d = Math.hypot(p.x - cx, p.y - cy), reach = Math.max(r.width, r.height) * 1.6;
      h.style.setProperty('--lg3-spec-boost', (1 + 0.6 * Math.max(0, 1 - d / reach)).toFixed(3));
      setLight(h, stepped);
    });
  }
  var hovered = null;
  function setLight(h, angle) {
    var st = h.__lg3;
    if (st.light === angle) return;
    st.light = angle;
    if (st.merged) { h.__lg3.cfg.lightAngle = angle; apply(h); return; }
    var tiles = tilesFor(st, st.cfg.w, st.cfg.h, st.cfg.r);
    st.tiles = tiles;
    setSpecSlices(h.querySelector(':scope > .lg3__spec'), tiles);
  }
  function onOrient(ev) {
    if (RM.matches || ev.gamma == null) return;
    var ang = (Math.atan2(ev.gamma, Math.max(1, 45 - (ev.beta || 0))) * 180 / Math.PI + 360) % 360;
    var stepped = Math.round(ang / 15) * 15 % 360;
    HOSTS.forEach(function (h) { if (h.hasAttribute('data-lg3-live') && h.__lg3 && h.__lg3.cfg) setLight(h, stepped); });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     13. SPRINGS — the model: ω = 2π/duration, ζ = 1 − bounce
     ───────────────────────────────────────────────────────────────────────── */
  function analytic(duration, bounce) {
    var w0 = 2 * Math.PI / duration, z = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
    return function (t) {
      if (Math.abs(z - 1) < 1e-6) return 1 - (1 + w0 * t) * Math.exp(-w0 * t);  /* ζ = 1 has its own form */
      if (z < 1) {
        var wd = w0 * Math.sqrt(1 - z * z);
        return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + z * w0 / wd * Math.sin(wd * t));
      }
      var r1 = -w0 * (z - Math.sqrt(z * z - 1)), r2 = -w0 * (z + Math.sqrt(z * z - 1));
      return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
    };
  }
  /* the start of the last quiet run, not the first crossing */
  function settleOf(at) {
    var last = 0;
    for (var t = 0; t < 4; t += 1 / 120) if (Math.abs(1 - at(t)) > 0.002) last = t;
    return last + 1 / 60;
  }
  function spring(duration, bounce) {
    var S = global.SPRING;
    if (S && typeof S.Spring === 'function') {
      try {
        var sp = S.Spring({ duration: duration, bounce: bounce });
        if (sp && typeof sp.at === 'function' && isFinite(sp.at(0.1)))
          return { at: sp.at, settle: isFinite(sp.settlingDuration) ? sp.settlingDuration : settleOf(sp.at), source: 'SPRING' };
      } catch (e) {}
    }
    var at = analytic(duration, bounce);
    return { at: at, settle: settleOf(at), source: 'local' };
  }
  /* opts: {duration, bounce} or {spring: 'morph' | {duration, bounce}} (SPEC
     §4 names springs; a name needs the spring engine's SPRING, else the defaults apply) */
  function springOf(opts, d, b) {
    var s = opts && opts.spring;
    if (typeof s === 'string' && global.SPRING && typeof global.SPRING.Spring === 'function') {
      try { var sp = global.SPRING.Spring(s); if (sp && sp.at) return { at: sp.at, settle: sp.settlingDuration || settleOf(sp.at), source: 'SPRING:' + s }; } catch (e) {}
    }
    if (s && typeof s === 'object') opts = s;
    return spring(opts && opts.duration || d, opts && opts.bounce != null ? opts.bounce : b);
  }
  /* run p(t) until settled; fn(p, dp/dt) per frame; frames stay honest
     when rAF is throttled because time, not frame count, drives p */
  function run(sp, fn, done) {
    var t0 = now(), prev = 0, prevT = 0, cancelled = false;
    (function step() {
      if (cancelled) return;
      var t = (now() - t0) / 1000;
      var p = t >= sp.settle ? 1 : sp.at(t), v = (p - prev) / Math.max(1e-3, t - prevT);
      prev = p; prevT = t;
      fn(p, v);
      if (t >= sp.settle) { done(); return; }
      frame(step);
    })();
    return function () { cancelled = true; };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     14. MORPH — one glass silhouette flowing from one element into another
     The destination is laid out at its final size first (measure), then its
     BOX is animated from the source rect: width/height/left/top/radius per
     frame, the corner ROUND in flight (the circle with the same 45° inset as
     the interpolated corner; the exact corner returns as it lands). Its
     content is frozen at final layout (absolute, translated so it stays put
     on screen, each piece on its own compositor layer — lg3.css) and clipped
     by the growing glass; the source's content rides along as a fading
     ghost. The backdrop pass, shadow and
     layers follow the box natively. The flight is frost, denser while it
     moves, with the highlight stepped out (lg3.css), and the refraction
     budget holds still until it lands: highlight and lens return then, at
     rest, never mid-flight. Never opacity on the host.
     ───────────────────────────────────────────────────────────────────────── */
  /* STILLNESS — a compile is a stall, so work that compiles on purpose (a
     warm-up run after mount, the exact corner after a landing) waits until
     nothing is in flight and nothing was tapped, typed, wheeled, scrolled
     or landed for STILL_MS: then there is no motion for it to stall */
  var STILL_MS = 1000, lastBusy = 0;
  function busy() { lastBusy = now(); }
  function whenStill(fn) {
    (function check() {
      var q = now() - lastBusy;
      if (!inFlight && q >= STILL_MS) fn(); else setTimeout(check, Math.max(120, STILL_MS - q));
    })();
  }
  function radiusOf(e) { var b = borderBox(e); return radiusPx(getComputedStyle(e).borderTopLeftRadius, b.w, b.h); }
  function kOf(e) { var b = borderBox(e), r = radiusOf(e); return G.isCapsule(b.w, b.h, r) ? 1 : (G.SUPPORTS_CORNER_SHAPE ? cornerKOf(getComputedStyle(e)) : 1); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function contentKids(e) {
    /* a bare text node can be neither faded nor frozen in place: give each
       one a span, once (a flex parent already treats it as its own item) */
    Array.prototype.slice.call(e.childNodes).forEach(function (n) {
      if (n.nodeType === 3 && /\S/.test(n.nodeValue)) {
        var sp = doc.createElement('span'); sp.className = 'lg3-text';
        e.insertBefore(sp, n); sp.appendChild(n);
      }
    });
    return Array.prototype.filter.call(e.children, function (c) { return !/^lg3__/.test(c.className); });
  }
  function show(e) { e.hidden = false; e.removeAttribute('data-lg3-away'); }
  function away(e) { e.setAttribute('data-lg3-away', ''); }

  function morph(fromEl, toEl, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!fromEl || !toEl) return resolve();
      [fromEl, toEl].forEach(function (e) { if (e.__lg3Morph) e.__lg3Morph(true); if (e.__lg3Hold) e.__lg3Hold(true); });
      /* only a [data-lg3] destination becomes glass; anything else morphs as
         an opaque box (the same silhouette flight, no material) */
      var glass = toEl.hasAttribute('data-lg3');
      var fr = fromEl.getBoundingClientRect(), frR = radiusOf(fromEl), frK = kOf(fromEl);
      var fb = borderBox(fromEl), fs = fb.w && fr.width ? fr.width / fb.w : 1;   /* the source's on-screen scale */
      show(toEl);
      var st = null;
      if (glass) { if (!toEl.__lg3 || !toEl.__lg3.cfg) apply(toEl); st = toEl.__lg3 || stateOf(toEl); }
      var tr = toEl.getBoundingClientRect(), trR = radiusOf(toEl), trK = kOf(toEl), tb = borderBox(toEl);
      if (RM.matches || !tr.width) {
        /* reduced motion: no travel, no growth — the destination appears, the
           source goes, the content cross-fades (information kept) */
        away(fromEl);
        contentKids(toEl).forEach(function (c) { if (c.animate) c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 }); });
        if (glass) { apply(toEl); queueBudget(); queueAdapt(false, true); }
        return resolve();
      }
      var saved = toEl.getAttribute('style') || '';
      var cs = getComputedStyle(toEl);
      var inFlow = cs.position === 'static' || cs.position === 'relative' || cs.position === 'sticky';
      var kids = contentKids(toEl).map(function (c) {
        return { el: c, style: c.getAttribute('style'), x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight };
      });
      var holder = null;
      if (inFlow) {
        holder = doc.createElement('div');
        holder.style.cssText = 'width:' + tb.w + 'px;height:' + tb.h + 'px;margin:' + cs.margin + ';flex:none;visibility:hidden;pointer-events:none';
        toEl.parentNode.insertBefore(holder, toEl);
      }
      toEl.style.position = 'fixed'; toEl.style.margin = '0';
      toEl.style.right = 'auto'; toEl.style.bottom = 'auto'; toEl.style.transform = 'none';
      toEl.style.left = tr.left + 'px'; toEl.style.top = tr.top + 'px';
      toEl.style.width = tr.width + 'px'; toEl.style.height = tr.height + 'px';
      toEl.style.boxSizing = 'border-box';
      if (!glass) toEl.style.overflow = 'hidden';
      /* A transformed ancestor re-bases `fixed` and may SCALE it (DEVICE's
         .device__viewport lays a screen out at 402 px and scales it): measure
         its origin and scale once, then place every frame in its local px —
         screen rects divided by the scale, or the box flies at scale² and
         snaps at the end. */
      var chk = toEl.getBoundingClientRect();
      var sx = chk.width > 0 && tr.width > 0 ? chk.width / tr.width : 1, sy = chk.height > 0 && tr.height > 0 ? chk.height / tr.height : 1;
      if (!(sx > 0.01 && isFinite(sx))) sx = 1;
      if (!(sy > 0.01 && isFinite(sy))) sy = 1;
      var ox = chk.left - tr.left * sx, oy = chk.top - tr.top * sy;
      frR = frR * fs / sx;                            /* the source's radius in the destination's px */
      kids.forEach(function (k) {
        var s = k.el.style;
        s.position = 'absolute'; s.left = k.x + 'px'; s.top = k.y + 'px';
        s.width = k.w + 'px'; s.height = k.h + 'px'; s.margin = '0'; s.boxSizing = 'border-box';
      });
      var ghost = doc.createElement('div');
      ghost.className = 'lg3__ghost'; ghost.setAttribute('aria-hidden', 'true');
      contentKids(fromEl).forEach(function (c) { ghost.appendChild(c.cloneNode(true)); });
      ghost.style.cssText = 'position:absolute;left:0;top:0;width:' + (fr.width / sx) + 'px;height:' + (fr.height / sy) + 'px;' +
        'display:' + getComputedStyle(fromEl).display.replace('inline-', '') + ';align-items:center;justify-content:center;' +
        'gap:' + getComputedStyle(fromEl).gap + ';padding:' + getComputedStyle(fromEl).padding + ';box-sizing:border-box;pointer-events:none';
      toEl.appendChild(ghost);
      away(fromEl);
      toEl.setAttribute('data-lg3-morphing', '');
      if (st) {
        st.morphing = true;
        /* the destination is the glass that moves. It flies on FROST (denser
           while it moves) and its lens arrives when it lands: a refraction
           chain switched on mid-flight compiled its programs inside the
           morph's frames (and a destination whose box outgrew the morph's —
           UI.alert's dialog — was demoted by the settle one frame in) */
        visible.add(toEl);
        if (st.path === 'refraction') setPath(toEl, st, 'frost');
      }
      inFlight++;
      var landed = false;
      var sp = springOf(opts, 0.5, 0.18);
      var peakV = 2.2 / Math.max(0.2, sp.settle * 0.8), sumMs = 0, frames = 0, maxMs = 0;

      function paintAt(p, v) {
        var t0 = now();
        var x = lerp(fr.left, tr.left, p), y = lerp(fr.top, tr.top, p);                 /* screen px */
        var w = Math.max(4, lerp(fr.width, tr.width, p)) / sx, h = Math.max(4, lerp(fr.height, tr.height, p)) / sy;   /* local px */
        var r = Math.max(0, Math.min(lerp(frR, trR, clamp(p, 0, 1)), Math.min(w, h) / 2));
        var k = lerp(frK, trK, clamp(p, 0, 1));
        /* the flight is ROUND. A superellipse corner is a path: the host's
           clip and every layer drawn through it counted as "slow paths", so
           the whole box was rastered multisampled, and every kind of content
           in it (text, symbols, circles, gradients) compiled an MSAA program
           mid-flight — 7–10 of 20–28 ms each, the open's 55–146 ms frames
           (docs share, patterns alert; gone with raster MSAA off, and with a
           round corner). The circle with the same 45° inset stays within
           0.0125 r of the curve (0.4 px at r 32, geom.js §THE FIT); the
           exact corner returns when it lands. The ROUND itself is lg3.css's
           ([data-lg3-morphing], !important), never an inline corner-shape:
           FG3's corner pass re-wrote an inline one on every resize (the
           per-frame k never showed) and, on a box it had not seen before
           (UI.alert's dialog), kept the in-flight value as the author's —
           the alert landed on superellipse(1.08–1.15), not 1.71. */
        r = Math.min(G.superellipseInset(r, k) / (1 - Math.SQRT1_2), Math.min(w, h) / 2);
        var s = toEl.style;
        s.left = (x - ox) / sx + 'px'; s.top = (y - oy) / sy + 'px'; s.width = w + 'px'; s.height = h + 'px';
        s.borderRadius = r + 'px';
        var mx = (tr.left - x) / sx, my = (tr.top - y) / sy;
        toEl.style.setProperty('--lg3-mx', mx + 'px'); toEl.style.setProperty('--lg3-my', my + 'px');
        var fade = smoothstep(0.35, 0.85, p);
        kids.forEach(function (kk) { kk.el.style.opacity = fade.toFixed(3); if (!st) kk.el.style.translate = mx + 'px ' + my + 'px'; });
        ghost.style.translate = (fr.left - x) / sx + 'px ' + (fr.top - y) / sy + 'px';
        ghost.style.opacity = (1 - smoothstep(0, 0.4, p)).toFixed(3);
        if (st) {
          /* the glass itself: frost, denser while it moves. No tiles in
             flight — the lens is off and the highlight steps out (lg3.css,
             [data-lg3-morphing]); the 4–7 quantised bakes an open used to
             make drew nothing. finish() re-applies the landed box. */
          st.cfg.w = w; st.cfg.h = h; st.cfg.r = r;
          st.density = clamp(Math.abs(v) / peakV, 0, 1);
          writeMaterial(toEl, st);
        }
        var ms = now() - t0; sumMs += ms; frames++; if (ms > maxMs) maxMs = ms;
      }
      function finish(cancelled) {
        stop();
        if (!landed) { landed = true; inFlight = Math.max(0, inFlight - 1); }
        toEl.setAttribute('style', saved);
        kids.forEach(function (kk) { if (kk.style == null) kk.el.removeAttribute('style'); else kk.el.setAttribute('style', kk.style); });
        ghost.remove(); if (holder) holder.remove();
        toEl.removeAttribute('data-lg3-morphing');
        toEl.__lg3Morph = fromEl.__lg3Morph = null;
        lastBusy = now();
        if (!cancelled && Math.abs(trK - 1) > 1e-3) {
          /* the exact corner waits for stillness. Switched at landing, the
             first superellipse raster of the content (a path clip: a program
             per kind of content) compiled inside the highlight's fade-in —
             patterns' alert, 65–70 ms. Until then the box keeps the flight's
             last circle (the same 45° inset, within 0.4 px at r 32). */
          var savedBR = toEl.style.borderRadius;
          toEl.style.borderRadius = Math.min(G.superellipseInset(trR, trK) / (1 - Math.SQRT1_2), Math.min(tb.w, tb.h) / 2) + 'px';
          toEl.setAttribute('data-lg3-landed', '');
          var release = function (quick) {
            if (toEl.__lg3Hold !== release) return;
            toEl.__lg3Hold = null;
            toEl.style.borderRadius = savedBR;
            toEl.removeAttribute('data-lg3-landed');
            /* quick: another morph takes the box over and re-applies it */
            if (!quick && st && toEl.isConnected && toEl.__lg3 === st) { apply(toEl); queueBudget(); queueAdapt(false, true); queueWarm(); }
          };
          toEl.__lg3Hold = release;
          whenStill(function () { release(false); });
        }
        PERF.morphFrames = frames; PERF.morphMeanMs = +(sumMs / Math.max(1, frames)).toFixed(3);
        PERF.morphMaxMs = +maxMs.toFixed(3); PERF.lastMorphFrameMs = PERF.morphMeanMs;
        if (st) {
          /* the style attribute was restored: what the engine wrote since
             must be written again */
          st.morphing = false; st.density = 0; st.props = null; st.legible = null;
          apply(toEl); queueBudget(); queueAdapt(false, true);
        }
        if (!inFlight) {
          if (budgetAfterFlight) { budgetAfterFlight = false; queueBudget(); }
          /* once the landing's own fades are done: at landing it cost the
             highlight's return an 85–115 ms frame (402), in flight a
             163–170 ms one (1440); at rest nothing is drawing */
          if (warmAfterFlight) { warmAfterFlight = false; setTimeout(queueWarm, 400); }
        }
        resolve(cancelled ? 'cancelled' : 'done');
      }
      paintAt(0, 0);
      var stop = run(sp, paintAt, function () { finish(false); });
      toEl.__lg3Morph = fromEl.__lg3Morph = finish;
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     15. MATERIALIZE — glass arrives by ramping lensing, blur, wash and a
     slight scale (.9 → 1), never by opacity on the host (an opacity < 1
     ancestor is a backdrop root: the pass would go flat for the whole fade).
     ───────────────────────────────────────────────────────────────────────── */
  function materialize(host, opts) { return ramp(host, 0, 1, opts || {}); }
  function dematerialize(host, opts) { return ramp(host, 1, 0, opts || {}); }
  function ramp(host, from, to, opts) {
    return new Promise(function (resolve) {
      if (to > 0) show(host);
      if (!host.__lg3 || !host.__lg3.cfg) apply(host);
      var st = host.__lg3;
      if (!st) return resolve();
      if (st.rampStop) st.rampStop();
      var kids = contentKids(host);
      function set(p) {
        st.mat = p;
        writeMaterial(host, st);
        host.style.scale = RM.matches ? '' : (0.9 + 0.1 * p).toFixed(4);
        var c = smoothstep(0.35, 1, p).toFixed(3);
        kids.forEach(function (k) { k.style.opacity = c; });
      }
      function end() {
        st.rampStop = null;
        set(to);
        host.style.scale = '';
        kids.forEach(function (k) { k.style.opacity = ''; });
        st.mat = null; writeMaterial(host, st);
        if (to === 0) { away(host); queueBudget(); }
        resolve();
      }
      /* reduced motion: "avoid animating into or out of blurs" — switch */
      if (RM.matches) { end(); return; }
      set(from);
      var sp = springOf(opts, 0.5, 0);
      st.rampStop = run(sp, function (p) { set(from + (to - from) * p); }, end);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     16. GLOBAL CONTROLS
     ───────────────────────────────────────────────────────────────────────── */
  function refreshAll() {
    HOSTS.forEach(function (h) {
      var st = h.__lg3;
      if (st && st.cfg) { st.matKey = st.frostKey = null; writeMaterial(h, st); st.legible = null; }
    });
    rebudget(); queueAdapt(false, true);
  }
  function setTint(t) {
    TINT = clamp(num(t, 0.5), 0, 1);
    html.style.setProperty('--lg3-tint', TINT.toFixed(3));
    refreshAll();
    return TINT;
  }
  function setReduceTransparency(on) {
    if (on === true) html.setAttribute('data-reduce-transparency', '');
    else if (on === false) html.setAttribute('data-reduce-transparency', 'off');
    else html.removeAttribute('data-reduce-transparency');
    refreshAll();
    return reduceTransparency();
  }
  [RT_MQ, IC_MQ, FC_MQ].forEach(function (m) { if (m.addEventListener) m.addEventListener('change', refreshAll); });

  /* ─────────────────────────────────────────────────────────────────────────
     17. MOUNT (FG3.boot calls this; the file never mounts itself)
     ───────────────────────────────────────────────────────────────────────── */
  var wired = false;
  function wire() {
    if (wired) return; wired = true;
    doc.addEventListener('pointerdown', onDown, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', onUp, true);
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('scroll', onScroll, { passive: true, capture: true });
    /* stillness (§14): a tap, a key or a wheel is the page in use */
    doc.addEventListener('pointerdown', busy, true);
    addEventListener('keydown', busy, true);
    addEventListener('wheel', busy, { passive: true, capture: true });
    addEventListener('resize', function () { queueBudget(); queueAdapt(); });
    /* a tone switch reaches the glass before the next frame (FG3's event,
       and the attribute for anyone who flips it by hand — watchDom) */
    doc.addEventListener('fg3:tone', function () { queueAdapt(true, true); });
    /* a (re)painted backdrop: every reading of it is stale */
    doc.addEventListener('art3:painted', function (e) { var c = e.target; if (c) c.__lg3gen = (c.__lg3gen || 0) + 1; SOURCES = null; });
    addEventListener('deviceorientation', onOrient);
    doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'visible') { queueBudget(); queueAdapt(); queueWarm(); } });
    /* merged hosts follow their shapes' transitions */
    doc.addEventListener('transitionrun', function (e) {
      var s = e.target.closest && e.target.closest('[data-lg3-shape]'), h = s && s.closest('.lg3[data-lg3-merged]');
      if (h) { h.__lg3.shapeRunning = (h.__lg3.shapeRunning || 0) + 1; shapeMotion(h); }
    });
    ['transitionend', 'transitioncancel'].forEach(function (ev) {
      doc.addEventListener(ev, function (e) {
        var s = e.target.closest && e.target.closest('[data-lg3-shape]'), h = s && s.closest('.lg3[data-lg3-merged]');
        if (h && h.__lg3.shapeRunning) h.__lg3.shapeRunning--;
      });
    });
  }

  function mount(root) {
    root = root || doc;
    detect();
    html.setAttribute('data-lg3-engine', engine());
    if (TINT === 0.5) html.style.setProperty('--lg3-tint', '0.5');
    wire();
    var hosts = Array.prototype.slice.call(root.querySelectorAll('[data-lg3]'));
    if (root.nodeType === 1 && root.hasAttribute('data-lg3')) hosts.unshift(root);
    hosts.forEach(function (h) { if (!isClone(h)) apply(h); });   /* apply observes */
    watchDom();
    /* Adapt and budget NOW (a static page gets no scroll to fix a missed
       first pass), again once layout settles, and never rely on rAF alone.
       A sub-tree mount (UI.alert's dialog, on the click that opens it) reads
       the hosts on screen and the new ones, as the DOM observer does for an
       inserted host — not every host on the page inside that click. */
    var scope = root === doc || root === html ? 'full' : 'visible';
    rebudget(); adapt(scope);
    later(function () { rebudget(); adapt(scope); queueWarm(); });
    idle(prewarm, 3000);
    return hosts.length;
  }
  /* GEOM bakes a unit corner field per corner exponent the first time a
     corner of that shape is baked: ~30 ms warm, far more cold — mid-morph
     (a capsule flowing into a continuous-corner panel) that was the long
     first frame. Bake every corner shape the page's glass declares, hidden
     morph targets included, in idle time, one per idle period. */
  var warmed = false;
  function prewarm() {
    if (warmed || !G.SUPPORTS_CORNER_SHAPE) return;
    warmed = true;
    var ns = {};
    doc.querySelectorAll('[data-lg3]').forEach(function (e) {
      var k = cornerKOf(getComputedStyle(e));
      if (isFinite(k) && Math.abs(k - 1) > 1e-3 && k < 60) ns[G.expFromK(k).toFixed(3)] = G.expFromK(k);
    });
    var list = Object.keys(ns).map(function (key) { return ns[key]; });
    (function step() {
      var n = list.shift();
      if (n) { var t0 = now(); G.unitCornerField(n); PERF.warmMs = +((PERF.warmMs || 0) + now() - t0).toFixed(1); }
      if (list.length) idle(step, 3000);
    })();
  }

  /* ─────────────────────────────────────────────────────────────────────────
     18. GPU WARM-UP — compile the glass before it is on screen
     The slow frames of a scroll (139–412 ms, no main-thread long task) were
     the GPU process compiling SHADER PROGRAMS the first time a kind of glass
     was drawn: a GrShaderCache::store inside FinishPaintRenderPass (the
     backdrop pass: frost chain, refraction chain, lens ramp, merged mask, the
     rounded/oval clip of the pass) or inside a tile raster (the layers: the
     tint and edge gradients on a rounded box, the rim border, the shadow).
     Measured in a fresh process: index 113 programs compiled DURING the
     scroll, 63 of them glass; materials 59 of 119; a third page 30 of 89. One
     compile is 10–40 ms on the GPU main thread (D3D, more under load), and a
     host entering or trading its budget slot brought 4–15 at once.
     A program depends on the STRUCTURE drawn (chain, clip shape, layers,
     the blur's value), not on the host's size, colour or position (300×56
     and 420×56 capsules: 0 new programs; a 57 px circle: 1; a lens panel:
     3). So the engine draws one of each structure the page's glass will
     ever need — both paths of every host, frost and refraction, at the blur
     of rest and of motion (density .5 and 1), and for a capsule or circle
     also the round RECT it becomes when it grows or flies — in a deck of
     throw-away copies, a few per frame in idle time after mount, and one at
     a time for hosts added later.
     Each host's own SVG filter is built and placed first, so its maps are
     decoded then too. The copies are not hosts (no engine state, not in
     HOSTS, never budgeted); the deck is a child of <html>, outside FG3's
     body observer, inert and aria-hidden.
     TWO MEASURED CONDITIONS, or the copy warms nothing:
       · opacity 1/255, not less — below ≈ .5/255 the compositor skips the
         backdrop pass outright (opacity .001: 0 programs; .004: all of them).
         At 1/255 a copy moves a pixel by at most one level, for 3 frames;
       · the whole box, unclipped — a copy cut to 1 px (or 64 px) compiles
         the clipped variants and leaves the host its own (3 left of 3 on
         a local nav; unclipped: 0).
     ───────────────────────────────────────────────────────────────────────── */
  var WARM_BATCH = 4, WARM_ALPHA = String(1 / 255);
  var warmSeen = new Set(), warmQueued = false, warmRunning = false, warmAgain = false, warmAfterFlight = false, warmFirstDone = false;
  var WARM_DROP = ['id', 'data-lg3-id', 'data-lg3-priority', 'data-lg3-away', 'data-lg3-pressed', 'data-lg3-morphing',
    'data-lg3-resizing', 'hidden', 'tabindex', 'role', 'href', 'name', 'for', 'popover', 'autofocus', 'aria-label',
    'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-pressed', 'aria-selected', 'aria-expanded', 'aria-current'];
  function queueWarm() {
    if (warmQueued || engine() === 'flat') return;
    warmQueued = true;
    idle(function () {
      warmQueued = false;
      if (doc.visibilityState === 'hidden') return;       /* nothing is drawn: visibilitychange re-queues */
      /* a compile is a stall: never inside a morph's frames (a new alert
         queues its warm-up the moment it is inserted, as its morph starts) */
      if (inFlight) { warmAfterFlight = true; return; }
      if (warmRunning) { warmAgain = true; return; }
      /* after the first run the page is in use: wait for it to be still */
      if (warmFirstDone && now() - lastBusy < STILL_MS) { warmQueued = true; whenStill(function () { warmQueued = false; queueWarm(); }); return; }
      runWarm();
    }, 400);
  }
  /* what decides a program: the clip the pass is drawn through, the chain,
     the layers — never the size (a size CLASS only, for the lens/bevel) */
  function shapeKey(st, cs) {
    var c = st.cfg, w = c ? c.w : 0, h = c ? c.h : 0, r = c ? c.r : parseFloat(cs.borderTopLeftRadius) || 0;
    var shape = r < 0.5 ? 'rect' : Math.abs(w - h) < 1 && r >= w / 2 - 0.5 ? 'oval' : c && G.isCapsule(w, h, r) ? 'capsule' : 'rrect';
    var cornerV = (cs.getPropertyValue('corner-top-left-shape') || cs.getPropertyValue('corner-shape') || '').trim();
    return shape + ':' + cornerV;
  }
  function warmPlan() {
    var plan = [], canRefract = engine() === 'refraction' && !reduceTransparency() && !increaseContrast() && !FC_MQ.matches;
    HOSTS.forEach(function (h) {
      var st = h.__lg3;
      if (!st || !h.isConnected || h.hasAttribute('data-lg3-off') || h.closest('.layer-content')) return;
      var cs = getComputedStyle(h);
      if (st.kind === 'chrome' || st.kind === 'platter') {
        var bf = cs.backdropFilter || cs.webkitBackdropFilter, box = borderBox(h);
        if (!bf || bf === 'none' || box.w < 4 || box.h < 4) return;
        plan.push({ host: h, key: [st.kind, bf.replace(/[\d.]+/g, '#'), shapeKey(st, cs)].join('|'), css: bf, w: box.w, h: box.h });
        return;
      }
      if (!st.cfg || st.cfg.w < 4 || st.cfg.h < 4) return;
      var layers = Array.prototype.map.call(h.children, function (k) { return /^lg3__/.test(k.className) ? k.className : ''; }).join('');
      var refr = canRefract && h.getAttribute('data-lg3-mode') !== 'frost';
      var sk = shapeKey(st, cs), forms = [{ key: sk, w: st.cfg.w, h: st.cfg.h }];
      /* a capsule or circle that GROWS or FLIES is a round rect for the whole
         travel — index's pill → panel, and every LG3.morph (flights are round,
         §14). Its clip is a program of its own: with only the capsule warmed,
         the pill → panel's first frames compiled 2 × 28–39 ms. */
      if (!st.merged && /^(capsule|oval):/.test(sk)) {
        var g = 2 * st.cfg.r + 16;
        forms.push({ key: 'rrect:round', w: Math.max(st.cfg.w, g), h: Math.max(st.cfg.h, g), r: st.cfg.r });
      }
      forms.forEach(function (f) {
        var base = [st.kind, st.cfg.size, f.key, layers, h.hasAttribute('data-lg3-merged') ? 'm' : ''].join('|');
        /* at rest and in motion: density (a resize, a morph) raises the blur
           up to 2x, and the blur compiles by its value (below) */
        [0, 0.5, 1].forEach(function (d) {
          var b = blurKey(materialAt(st, d).blur);
          plan.push({ host: h, key: base + '|frost|' + b, frost: true, dens: d, w: f.w, h: f.h, r: f.r });
          if (refr) plan.push({ host: h, key: base + '|refr|' + (st.merged ? 'm' : '') + (st.lens ? 'l' : '') + (st.cfg.debug || '') + '|' + b,
                                refr: true, dens: d, w: f.w, h: f.h, r: f.r });
        });
      });
    });
    return plan.filter(function (p) { if (warmSeen.has(p.key)) return false; warmSeen.add(p.key); return true; });
  }
  /* a copy that paints what the host paints: its class, appearance, inline
     material and layers, at its own box and corner — without its content,
     identity or behaviour */
  function warmCopy(p) {
    var h = p.host, st = h.__lg3, cs = getComputedStyle(h), c = h.cloneNode(false), s = c.style;
    WARM_DROP.forEach(function (a) { c.removeAttribute(a); });
    if (st.kind === 'glass' || st.kind === 'clear') c.removeAttribute('data-lg3');   /* CSS keys on .lg3 + data-lg3-kind */
    Array.prototype.forEach.call(h.children, function (k) { if (/^lg3__/.test(k.className) && !/ghost/.test(k.className)) c.appendChild(k.cloneNode(true)); });
    s.position = 'absolute'; s.left = s.top = '0px'; s.right = s.bottom = 'auto'; s.margin = '0'; s.padding = '0';
    s.width = p.w + 'px'; s.height = p.h + 'px'; s.minWidth = s.minHeight = '0'; s.maxWidth = s.maxHeight = 'none';
    s.boxSizing = 'border-box'; s.transform = 'none'; s.translate = 'none'; s.scale = 'none'; s.rotate = 'none';
    s.display = 'block'; s.visibility = 'visible'; s.animation = 'none'; s.transition = 'none'; s.opacity = WARM_ALPHA;
    ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].forEach(function (k) { s['border' + k + 'Radius'] = p.r != null ? p.r + 'px' : cs['border' + k + 'Radius']; });
    var cv = p.r != null ? 'round' : (cs.getPropertyValue('corner-shape') || '').trim();
    if (cv) s.setProperty('corner-shape', cv);
    if (p.css) { s.backdropFilter = s.webkitBackdropFilter = p.css; s.backgroundColor = cs.backgroundColor; s.boxShadow = cs.boxShadow; }
    else if (p.refr) {
      ensureFilter(st); fillFilter(st, material(st));
      var id = st.fid, m = materialAt(st, p.dens);
      if (p.dens || p.r != null) {
        /* a throw-away twin of the host's filter at the moving blur (and, for
           the round-rect form, placed for the copy's box: a region cut to
           the host's own box warmed a different program): the host's own
           filter keeps drawing the host meanwhile */
        var f = st.P.f.cloneNode(true);
        f.id = id = st.fid + '-warm' + (++uid);
        f.querySelector('feGaussianBlur').setAttribute('stdDeviation', m.blur.toFixed(2));
        if (p.r != null && st.tiles) {
          var tw = {};
          SLICES.forEach(function (k) { tw[k] = f.querySelector('[result="i' + k + '"]'); });
          placeGeo({ f: f, tiles: tw, ramp: f.querySelector('[result="lr"]') }, Math.round(p.w), Math.round(p.h),
            Math.max(1, Math.round(st.tiles.T * (st.tileF || 1))), Math.ceil(st.tiles.maxMag * 1.1 + (st.lensPx || 0)) + 6);
        }
        defs().appendChild(f);
        c.__lg3tmp = f;
      }
      s.backdropFilter = s.webkitBackdropFilter = 'url(#' + id + ')';
    } else s.backdropFilter = s.webkitBackdropFilter = frostString(materialAt(st, p.dens));
    return c;
  }
  /* the material at a given motion density, without touching the host */
  function materialAt(st, d) {
    var keep = st.density; st.density = d || 0;
    try { return material(st); } finally { st.density = keep; }
  }
  /* the blur compiles by VALUE, not by the four buckets once assumed
     (2.5 / 4 / 6–16 / 18+): index's pill → panel, warmed at 12 and 18 px,
     still compiled 17–33 ms programs at 24 px (its density-1 blur) as it
     grew; warmed at 24 px as well, none. So every distinct whole-px blur
     the host reaches at rest and in motion gets its copy. */
  function blurKey(b) { return Math.round(b); }
  function runWarm() {
    var later = warmFirstDone; warmFirstDone = true;
    var plan = warmPlan();
    if (!plan.length) return;
    warmRunning = true;
    var t0 = now(), n = 0, deck = doc.createElement('div');
    /* after the first run the page is in use (an alert has just landed, a
       panel was added): the run waits for stillness (queueWarm) and draws
       one copy per batch — patterns' alert, 400 ms after landing, drew two
       copies' 2 × 25–27 ms in one 55–57 ms frame */
    var per = later ? 1 : WARM_BATCH;
    deck.setAttribute('data-lg3-warm', ''); deck.setAttribute('aria-hidden', 'true'); deck.inert = true;
    deck.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483647;margin:0;padding:0;border:0';
    html.appendChild(deck);
    (function step() {
      Array.prototype.forEach.call(deck.children, function (c) { if (c.__lg3tmp) c.__lg3tmp.remove(); });
      deck.textContent = '';
      if (inFlight && doc.visibilityState !== 'hidden') { idle(step, 250); return; }   /* resume once it lands */
      var batch = plan.splice(0, per);
      if (!batch.length || doc.visibilityState === 'hidden') {
        deck.remove(); warmRunning = false;
        var W = PERF.warm || (PERF.warm = { copies: 0, runs: 0, ms: 0 });
        W.copies += n; W.runs++; W.ms = +(W.ms + now() - t0).toFixed(1); W.keys = warmSeen.size;
        /* a hidden page drew nothing: forget what this run claimed to warm */
        if (batch.length || plan.length) batch.concat(plan).forEach(function (p) { warmSeen.delete(p.key); });
        if (warmAgain) { warmAgain = false; queueWarm(); }
        return;
      }
      batch.forEach(function (p) { try { deck.appendChild(warmCopy(p)); n++; } catch (x) {} });
      /* three frames on screen, so the compositor draws the batch at least
         once whatever it skips; then the next batch in idle time */
      frame(function () { frame(function () { frame(function () { idle(step, 250); }); }); });
    })();
  }

  /* stats(host): what the refraction actually does on this host's map —
     the ≥ 8 px max / ≥ 2 px mean acceptance is read from here */
  function stats(host) {
    var st = host.__lg3; if (!st || !st.cfg) return null;
    return mapStats(st.cfg, st);
  }
  /* statsFor({w, h, r, k, size, bezel, thickness, ior, maxTilt, profile,
     rimFrac, light, elev, shine}) — the same reading for a box that does not
     exist: nothing is registered, observed or drawn. r defaults to a capsule
     (min(w,h)/2), k to 1 (a circle's corner). */
  function statsFor(o) {
    o = o || {};
    var w = num(o.w, 0), h = num(o.h, 0);
    if (!(w >= 4 && h >= 4)) return null;
    var r = Math.min(num(o.r, Math.min(w, h) / 2), Math.min(w, h) / 2), k = G.isCapsule(w, h, r) ? 1 : num(o.k, 1);
    var cfg = configFor(w, h, r, k, { lg3Size: o.size, lg3Bezel: o.bezel, lg3Thickness: o.thickness, lg3Ior: o.ior,
      lg3MaxTilt: o.maxTilt, lg3Profile: o.profile, lg3RimFrac: o.rimFrac, lg3Light: o.light, lg3Elev: o.elev, lg3Shine: o.shine }, o.kind || 'glass');
    return mapStats(cfg, null);
  }
  function mapStats(c, st) {
    var maps = buildMaps(Object.assign({ sign: 1 }, c, { lens: 0 }));
    var max = 0, sum = 0, n = 0;
    for (var i = 0; i < maps.ox.length; i++) {
      var m = Math.hypot(maps.ox[i], maps.oy[i]);
      if (m > 0.05) { n++; sum += m; if (m > max) max = m; }
    }
    return { w: maps.w, h: maps.h, bezel: +c.bezel.toFixed(2), thickness: +c.thickness.toFixed(2),
             max: +max.toFixed(2), mean: +(sum / Math.max(1, n)).toFixed(2), displaced: n,
             scale: +maps.scale.toFixed(2), buildMs: +maps.ms.toFixed(2), path: st ? st.path : null,
             tileT: st && st.tiles ? st.tiles.T : null, tileMs: st && st.tiles ? +st.tiles.ms.toFixed(2) : null };
  }

  global.LG3 = {
    mount: mount, apply: apply, refresh: function (h) { apply(h); queueBudget(); queueAdapt(false, true); },
    adapt: adapt, morph: morph, materialize: materialize, dematerialize: dematerialize,
    setTint: setTint, setReduceTransparency: setReduceTransparency,
    setEngine: function (e) { forcedEngine = e || null; html.setAttribute('data-lg3-engine', engine()); rebudget(); return engine(); },
    setBudget: function (n) { BUDGET_OVERRIDE = n == null ? null : +n; rebudget(); return budget(); },
    get engine() { return engine(); }, get caps() { return detect(); }, get tint() { return TINT; },
    get budget() { return budget(); },
    get refracting() { var n = 0; HOSTS.forEach(function (h) { if (h.__lg3 && h.__lg3.path === 'refraction') n++; }); return n; },
    sampleBackdrop: sampleBackdrop, buildMaps: buildMaps, tileSet: tileSet, stats: stats, statsFor: statsFor,
    forget: function (h) { if (h && (h.__lg3 || HOSTS.has(h))) { forget(h); queueBudget(); } },
    material: function (h) { return h.__lg3 && h.__lg3.cfg ? material(h.__lg3) : null; },   /* chrome/platter hosts have no optics cfg: null, not a throw */
    recipes: RECIPES, profiles: PROFILES, sizeClassOf: sizeClassOf, spring: spring,
    perf: PERF, hosts: HOSTS
  };
})(window);
