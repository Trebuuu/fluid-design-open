/* ═══════════════════════════════════════════════════════════════════════════
   palette.js → PALETTE — ONE BRAND IN, EVERY COLOUR ROLE OUT (Fluid Design Open)
   ───────────────────────────────────────────────────────────────────────────
   An OKLCH engine (colour maths, contrast fit against the hardest
   ground, increased contrast as a step toward the ink, pale-brand ink rule)
   with four properties:

   1 NEUTRALS ARE A MODE. `fluid` is a fixed table of cool neutrals; only the
     fourth label is fitted. `derived` is a brand-tinted ramp. An object gives
     custom neutrals.
   2 EVERY ROLE IN SPEC §2 IS EMITTED — including --*-strong / --*-ink /
     --*-fill — plus
     --link, fixed --accent-hover/--accent-active, --on-art-1/2, the
     --sys-* colours (with their increased-contrast values), --series-1…6,
     --scrim (dialog::backdrop), --sweep-1/-2 (the [data-sweep] gradient) and
     --accent-ink-on-tint (the accent as text on its own 12-22% wash: a tinted
     button or chip, where --accent itself has no headroom).
   3 PAGES LINK GENERATED CSS (tools/gen-palettes.mjs). install() stays for the
     playground only: a head-injected <style> loses the cascade to a
     body-linked stylesheet on some hosts.
   4 COVERAGE IS DERIVED. coverage(p, cssTexts) reads which roles the
     stylesheets actually consume; no hand-typed list to drift.

   PUBLIC API (window.PALETTE)
     build(opts) → palette     opts: { preset, accent, neutrals:'fluid'|'derived'|{light,dark},
                                 link:'accent'|{light,dark}, fill:'vivid'|'dusty'|{…},
                                 series:[hex…]|{light,dark}, semantic:{dark:{ok,warn,bad}},
                                 onArt:{dark:[a,b]}, glow, buttonContrast=4.5, label, from }
         palette = { name, label, from, accent, root:{}, tones:{light,dark}, more:{light,dark},
                     report:[{tone,role,value,target,kind,ratio,against,pass,more}], failures:[] }
     toCSS(palette, {header}) → string   :root · [data-tone] · an un-toned stage band (dark) ·
                                         no-JS OS-dark fallback · @media (prefers-contrast: more) ·
                                         [data-contrast="more"]
     install(opts, doc)       playground only (see 3)
     ROLES                    emission order of every tone role
     PRESETS, NEUTRALS, SYS   brand presets (each with `from`), neutral tables, system colours
     coverage(p, cssTexts)    → { referenced, needed, missing }: colour-family names the CONSUMER
                              texts (pass them without the palette file itself)
                              read bare (no fallback) and declare nowhere, that p does not emit
     referenced(cssText)      → names read bare through var(--x), outside SPEC §1's families
     parse(c) → {r,g,b,a}     hex / rgb() / rgba() / "r g b / a"
     over(fg, bg) → rgb       premultiplied 8-bit composite (alpha to a byte, each term
                              rounded), the way the framebuffer does it
     ratio(fg, ...grounds)    WCAG ratio of fg over a stack of grounds (bottom first)
     hexToOklch, oklchToHex, luminanceOf, contrast, hexLuminance   (unchanged)
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── 1 · COLOUR SPACE (Ottosson's OKLab) ─────────────── */
  function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function l2s(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function linToLab(r, g, b) {
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function labToLin(L, a, b) {
    var l = L + 0.3963377774 * a + 0.2158037573 * b, m = L - 0.1055613458 * a - 0.0638541728 * b,
        s = L - 0.0894841775 * a - 1.2914855480 * b;
    l *= l * l; m *= m * m; s *= s * s;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
  }
  function rgbToHex(rgb) {
    return '#' + rgb.map(function (v) { return Math.round(v).toString(16).padStart(2, '0'); }).join('');
  }
  function hexToOklch(hex) {
    var c = hexToRgb(hex).map(function (v) { return s2l(v / 255); });
    var lab = linToLab(c[0], c[1], c[2]);
    return { L: lab[0], C: Math.hypot(lab[1], lab[2]),
             H: (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360 };
  }
  function lchToLin(L, C, H) { var r = H * Math.PI / 180; return labToLin(L, C * Math.cos(r), C * Math.sin(r)); }
  function inGamut(rgb) { return rgb.every(function (v) { return v >= -0.0001 && v <= 1.0001; }); }
  /* Gamut map by giving up CHROMA, never hue or lightness: clipping channels
     turns an out-of-gamut blue purple. */
  function oklchToHex(L, C, H) {
    var lo = 0, hi = C, fit = null;
    for (var i = 0; i < 24; i++) {
      var mid = (lo + hi) / 2, rgb = lchToLin(L, mid, H);
      if (inGamut(rgb)) { fit = rgb; lo = mid; } else hi = mid;
    }
    if (!fit) fit = lchToLin(L, 0, H);
    return rgbToHex(fit.map(function (v) { return Math.max(0, Math.min(1, l2s(v))) * 255; }));
  }
  function relLum(rgb) {
    var c = rgb.map(function (v) { return s2l(v / 255); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function hexLuminance(hex) { return relLum(hexToRgb(hex)); }
  /* Luminance of what will be PAINTED (after gamut mapping and 8-bit rounding). */
  function luminanceOf(L, C, H) { return hexLuminance(oklchToHex(L, C, H)); }
  function contrast(a, b) { var x = Math.max(a, b), y = Math.min(a, b); return (x + 0.05) / (y + 0.05); }

  /* ── 2 · PARSING AND COMPOSITING ─────────────────────────────────────────
     Alpha colours are composited the way the framebuffer does it: in sRGB,
     PREMULTIPLIED in 8 bits — the alpha rounded to a byte, each term rounded
     on its own. Compositing in float reads 0.02 high and passes a role at
     4.51:1 that measures 4.49:1 on screen; a single rounding (float alpha)
     still did it to --ok-strong on its wash over --bg-2. In Edge
     153, CSS-painted cells: this formula 26 of 30 exact, the rest one step
     off, so text on a wash is also fitted with its ground one step toward the
     ink (ratioLsb). */
  function parse(c) {
    c = String(c).trim();
    if (c[0] === '#') { var h = hexToRgb(c); return { r: h[0], g: h[1], b: h[2], a: 1 }; }
    var m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) throw new Error('palette: cannot parse colour ' + c);
    var p = m[1].replace(/\//, ' ').split(/[\s,]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function over(fg, bg) {
    var f = typeof fg === 'string' ? parse(fg) : fg, b = typeof bg === 'string' ? parse(bg) : bg;
    var a8 = Math.round(f.a * 255), mix = function (s, d) { return Math.round(s * a8 / 255) + Math.round(d * (255 - a8) / 255); };
    return [mix(f.r, b.r), mix(f.g, b.g), mix(f.b, b.b)];
  }
  function flatten(stack) {
    var base = parse(stack[0]), rgb = [base.r, base.g, base.b];
    for (var i = 1; i < stack.length; i++) rgb = over(stack[i], { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 });
    return rgb;
  }
  function ratio(fg) {
    var g = flatten(Array.prototype.slice.call(arguments, 1));
    var f = over(fg, { r: g[0], g: g[1], b: g[2], a: 1 });
    return contrast(relLum(f), relLum(g));
  }
  /* The same, with the composited ground moved ONE step toward the ink in
     every channel: the worst the renderer's rounding can do. */
  function ratioLsb(fg) {
    var g = flatten(Array.prototype.slice.call(arguments, 1)), p = parse(fg);
    var ink = [p.r, p.g, p.b];
    g = g.map(function (v, i) { return Math.max(0, Math.min(255, v + (ink[i] > v ? 1 : ink[i] < v ? -1 : 0))); });
    var f = over(fg, { r: g[0], g: g[1], b: g[2], a: 1 });
    return contrast(relLum(f), relLum(g));
  }
  function rgbaOf(rgb, a) { return 'rgba(' + rgb.join(',') + ',' + round3(a) + ')'; }
  function round3(n) { return Math.round(n * 1000) / 1000; }

  /* ── 3 · THE FIT ─────────────────────────────────────────────────────────
     Bisect lightness toward the ink (dir +1 toward white on a dark ground, −1
     toward black on a light one) until `test(hex)` holds. Never the other way:
     that would "fix" a dark-mode label by turning it black. */
  function fitL(L0, C, H, dir, test) {
    if (test(oklchToHex(L0, C, H))) return L0;
    var lo = L0, hi = dir > 0 ? 1 : 0;
    for (var i = 0; i < 22; i++) {
      var mid = (lo + hi) / 2;
      if (test(oklchToHex(mid, C, H))) hi = mid; else lo = mid;
    }
    return hi;
  }
  /* The worst ratio of `ink` over any of `grounds` (each a stack, bottom first). */
  function worst(ink, grounds, lsb) {             /* lsb: one step taken away (ratioLsb) */
    var w = { ratio: Infinity, at: -1 };
    grounds.forEach(function (st, i) {
      var r = (lsb ? ratioLsb : ratio).apply(null, [ink].concat(st));
      if (r < w.ratio) w = { ratio: r, at: i };
    });
    return w;
  }

  /* Series must stay apart for readers with protanopia and deuteranopia.
     Fitting every hue to the same 3:1 floor pulls them to one lightness, and
     lightness is what those readers separate by: a green and an amber
     (ΔE 8.1 in dark) fell to 2.8 in light. So an adjacent pair below 8 is
     pulled apart by moving its member nearer the ink further toward it —
     which only raises its contrast. Machado, Oliveira & Fernandes 2009 at
     severity 1, OKLab ΔE ×100: the dataviz validator's model and threshold. */
  var MACHADO = [
    [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]];
  function simLab(hex, M) {
    var c = hexToRgb(hex).map(function (v) { return s2l(v / 255); });
    var s = M.map(function (r) {
      var v = Math.max(0, Math.min(1, r[0] * c[0] + r[1] * c[1] + r[2] * c[2]));
      return s2l(Math.round(l2s(v) * 255) / 255);
    });
    return linToLab(s[0], s[1], s[2]);
  }
  function cvdDE(a, b) {
    return Math.min.apply(null, MACHADO.map(function (M) {
      var x = simLab(a, M), y = simLab(b, M);
      return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    }));
  }
  function separate(list, dir) {
    list = list.slice();
    for (var pass = 0; pass < 4; pass++) {
      for (var i = 0; i < list.length - 1; i++) {
        for (var n = 0; n < 40 && cvdDE(list[i], list[i + 1]) < 8; n++) {
          var a = hexToOklch(list[i]), b = hexToOklch(list[i + 1]);
          var j = (dir < 0 ? a.L <= b.L : a.L >= b.L) ? i : i + 1, c = j === i ? a : b;
          var L = c.L + dir * 0.01;
          if (L < 0.3 || L > 0.9) break;
          list[j] = oklchToHex(L, c.C, c.H);
        }
      }
    }
    return list;
  }

  /* ── 4 · NEUTRAL TABLES ──────────────────────────────────────────────────
     fluid: the default cool neutrals. The role map:
       bg-1 = the page · bg-2 = the alt band (cards sit on it) · bg-3 = the
       index band (#fafafc light / #161617 dark) · bg-elevated = the card
       (white on the band; #1d1d1f on black).
       labels = primary / secondary / tertiary; the fourth is FITTED to 3:1.
       label-2-on-fill = the ink on pills and badges (#424245 / #d2d2d7):
       #6e6e73 has no headroom on a fill.
     The tertiary (#86868b light, #6e6e73 dark) measures 3.33:1 on its own
     band and 3.32:1 on #1d1d1f — it is a large-text and glyph colour,
     so its target here is 3, not 4.5. Small text uses --label-2.
     Fills are alphas (a fill must work over a card, a band and glass). The ink
     is tinted so each fill-1 composites over the page to a solid
     control fill exactly: #e8e8ed light (ink 0,0,55 at .0902) and #333336
     dark (ink 241,241,255 at .2118) — the greys are cool, b > r, and a
     neutral ink cannot reproduce that. */
  var NEUTRALS = {
    fluid: {
      light: {
        bg: ['#ffffff', '#f5f5f7', '#fafafc', '#ffffff'],
        label: ['#1d1d1f', '#6e6e73', '#86868b', { L: 0.745, C: 0.007, H: 286 }],
        target: [7, 4.5, 3, 3],
        labelInv: '#ffffff', onFill: ['#424245'],
        fillInk: [0, 0, 55], fill: [0.0902, 0.056, 0.034, 0.018],
        sep: 'rgba(0,0,0,0.16)', sepOpaque: '#d2d2d7'
      },
      dark: {
        bg: ['#000000', '#1d1d1f', '#161617', '#1d1d1f'],
        label: ['#f5f5f7', '#86868b', '#6e6e73', { L: 0.42, C: 0.008, H: 286 }],
        target: [7, 4.5, 3, 3],
        labelInv: '#000000', onFill: ['#d2d2d7'],
        fillInk: [241, 241, 255], fill: [0.2118, 0.14, 0.085, 0.045],
        sep: 'rgba(255,255,255,0.24)', sepOpaque: '#424245'
      }
    }
  };
  /* A brand-tinted ramp, in OKLCH L. */
  var DERIVED = {
    dark: { bg: [0.134, 0.162, 0.196, 0.216], label: [0.973, 0.731, 0.573, 0.414], sepOpaque: 0.253,
            target: [7, 4.5, 4.5, 3], fill: [0.115, 0.075, 0.045, 0.025], sep: 0.12, C: 0.0139 },
    light: { bg: [1, 0.963, 1, 1], label: [0.191, 0.447, 0.626, 0.780], sepOpaque: 0.913,
             target: [7, 4.5, 4.5, 3], fill: [0.085, 0.055, 0.032, 0.018], sep: 0.12, C: 0.0120 }
  };

  /* System colours:
     [light, dark, increased-contrast light, increased-contrast dark]. */
  var SYS = {
    blue:   ['#0088ff', '#0091ff', '#1e6ef4', '#5cb8ff'], green:  ['#34c759', '#30d158', '#008932', '#4ad968'],
    red:    ['#ff383c', '#ff4245', '#e9152d', '#ff6165'], orange: ['#ff8d28', '#ff9230', '#c55300', '#ffa056'],
    yellow: ['#ffcc00', '#ffd600', '#a16a00', '#fedf43'], pink:   ['#ff2d55', '#ff375f', '#e7124d', '#ff8ac4'],
    purple: ['#cb30e0', '#db34f2', '#b02fc2', '#ea8dff'], indigo: ['#6155f5', '#6d7cff', '#564ade', '#a7aaff'],
    teal:   ['#00c3d0', '#00d2e0', '#008198', '#3bddec'], cyan:   ['#00c0e8', '#3cd3fe', '#007eae', '#6dd9ff'],
    mint:   ['#00c8b3', '#00dac3', '#008575', '#54dfcb'], brown:  ['#ac7f5e', '#b78a66', '#956d51', '#dba679']
  };
  /* Default data hues: system colours in the order that maximised the
     worst ADJACENT pair under simulated protan/deutan vision (searched over
     every ordering with the dataviz validator: worst adjacent CVD ΔE 11.1,
     normal vision 15.6, first three separable as all pairs. Red and pink are
     excluded — red means Stop and errors — and brown reads as dirt; green
     never passed the dark band). Light starts from the increased-
     contrast values (darker steps, ≥3:1 on #f5f5f7); dark from the
     dark values, pulled into the dark lightness band so none glares. */
  var SERIES = ['blue', 'orange', 'cyan', 'indigo', 'yellow', 'purple'];
  var SERIES_BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] };

  /* ── 5 · PRESETS — one brand per entry ───────────────────────────────── */
  var PRESETS = {
    fluid: { accent: '#7c5cff', label: 'Fluid — violet on cool neutrals (default)',
      from: 'the default violet #7c5cff with a dusty fill',
      fill: { stops: ['#7a68c4', '#4f4184'], ink: '#ffffff' }, glow: 'rgba(109,93,174,0.8)',
      onArt: { dark: ['#ded9ec', '#cbc4dd'] } }
  };

  /* The order roles are emitted in. Also the answer to "what does a palette
     contain" — but the TEST derives coverage from the stylesheets and SPEC. */
  var ROLES = ['bg-1', 'bg-2', 'bg-3', 'bg-elevated', 'label', 'label-2', 'label-3', 'label-4',
    'label-2-on-fill', 'label-3-on-fill', 'label-4-on-fill', 'label-inv', 'fill-1', 'fill-2', 'fill-3', 'fill-4',
    'separator', 'separator-opaque', 'link', 'accent', 'accent-ink', 'accent-ink-on-tint', 'accent-solid', 'accent-fill',
    'accent-hover', 'accent-active', 'accent-fill-hover', 'accent-fill-active', 'accent-glow',
    'on-art-1', 'on-art-2', 'scrim', 'sweep-1', 'sweep-2', 'ok', 'ok-strong', 'ok-ink', 'ok-fill', 'warn', 'warn-strong', 'warn-ink',
    'warn-fill', 'bad', 'bad-strong', 'bad-ink', 'bad-fill']
    .concat(Object.keys(SYS).map(function (k) { return 'sys-' + k; }))
    .concat([1, 2, 3, 4, 5, 6].map(function (i) { return 'series-' + i; }));

  /* Increased contrast: one notch toward the ink (a fixed step, not a raised target).
     A raised TARGET collapsed light label-2 and label-3 into one hex; a fixed
     STEP keeps the spacing, and against a fixed ground can only raise the
     ratio. Inks that are not labels get a smaller notch. */
  var MORE = { step: 0.16, inkStep: 0.06, fill: 1.8, sep: 2.5 };
  var TINT = 0.14;                 /* the -fill wash under a tinted chip */
  var TINT_ACCENT = [0.12, 0.22];  /* the components' accent wash: tinted button at rest, pressed */
  var ART = { dark: { L: 0.40, C: 0.12 }, light: { L: 0.88, C: 0.06 } };

  /* ── 6 · BUILD ──────────────────────────────────────────────────────────── */
  function resolveOpts(opts) {
    opts = opts || {};
    var base = opts.preset ? PRESETS[opts.preset] : {};
    if (opts.preset && !base) throw new Error('palette: no preset ' + opts.preset);
    var o = {};
    [base, opts].forEach(function (s) { Object.keys(s).forEach(function (k) { o[k] = s[k]; }); });
    o.accent = (o.accent || '#7c5cff').toLowerCase();
    o.name = opts.preset || opts.name || 'custom';
    return o;
  }
  function tonePick(v, tone) {
    return v && typeof v === 'object' && !Array.isArray(v) && (v.light || v.dark) ? v[tone] : v;
  }
  function neutralSpec(o, tone, accent) {
    var n = o.neutrals || 'fluid';
    var spec = typeof n === 'string' ? (NEUTRALS[n] ? NEUTRALS[n][tone] : n) : n[tone];
    if (typeof spec === 'string' && NEUTRALS[spec]) spec = NEUTRALS[spec][tone];
    if (spec && spec !== 'derived') return spec;
    /* derived: the tinted ramp at the brand's hue. */
    var R = DERIVED[tone], H = (accent.H + (o.neutralShift || 0) + 360) % 360;
    var C = o.neutralChroma != null ? o.neutralChroma : R.C;
    var ink = tone === 'dark' ? [255, 255, 255] : [20, 16, 32];
    return {
      bg: R.bg.map(function (L) { return oklchToHex(L, C * 0.9, H); }),
      label: R.label.map(function (L, i) { return { L: L, C: C * (i ? 0.75 : 0.45), H: H }; }),
      target: R.target, labelInv: oklchToHex(tone === 'dark' ? 0.16 : 1, 0, H),
      fillInk: ink, fill: R.fill, sep: rgbaOf(ink, R.sep), sepOpaque: oklchToHex(R.sepOpaque, C, H)
    };
  }

  function build(opts) {
    var o = resolveOpts(opts), accent = hexToOklch(o.accent);
    var out = { name: o.name, label: o.label || o.name, from: o.from || 'chosen, not bound',
                accent: o.accent, root: {}, tones: {}, more: {}, report: [] };

    ['light', 'dark'].forEach(function (tone) {
      var N = neutralSpec(o, tone, accent), dir = tone === 'dark' ? 1 : -1;
      var t = {}, m = {}, rep = function (e) { e.tone = tone; out.report.push(e); };
      var bgNames = ['bg-1', 'bg-2', 'bg-3', 'bg-elevated'];
      N.bg.forEach(function (h, i) { t[bgNames[i]] = h; });
      /* Every role is fitted against ALL the grounds it can land on and held
         at the worst — the hardest ground is the one closest to the ink (a card
         can otherwise leave label-3 at 3.21:1). */
      var grounds = N.bg.map(function (h) { return [h]; });
      function check(role, value, target, gs, kind, names, lsb) {
        var w = worst(value, gs, lsb);
        rep({ role: role, value: value, target: target, kind: kind || 'text', ratio: w.ratio,
              against: (names || bgNames)[w.at], pass: w.ratio >= target - 0.005 });
      }
      function fitHex(start, target, gs, lsb) {
        var s = typeof start === 'string' ? hexToOklch(start) : start;
        var L = fitL(s.L, s.C, s.H, dir, function (hex) { return worst(hex, gs, lsb).ratio >= target; });
        return oklchToHex(L, s.C, s.H);
      }

      /* ── labels: verbatim where the table gives a hex, fitted otherwise.
         A trailing `*` means "the product's value, but fit it" (a fourth ink
         that fails its own floor). */
      var labelNames = ['label', 'label-2', 'label-3', 'label-4'];
      N.label.forEach(function (spec, i) {
        var v = typeof spec === 'string' && spec.slice(-1) !== '*' ? spec
              : fitHex(typeof spec === 'string' ? spec.slice(0, -1) : spec, N.target[i], grounds);
        t[labelNames[i]] = v;
        check(labelNames[i], v, N.target[i], grounds, i === 3 ? 'non-text' : 'text');
      });
      /* label-2/-3/-4 again, for the ground INSIDE a fill (fill-1 over each bg). */
      var fillGrounds = N.bg.map(function (h) { return [h, rgbaOf(N.fillInk, N.fill[0])]; });
      [1, 2, 3].forEach(function (i) {
        var role = labelNames[i] + '-on-fill';
        var v = (N.onFill && N.onFill[i - 1]) || fitHex(t[labelNames[i]], N.target[i], fillGrounds);
        t[role] = v;
        check(role, v, N.target[i], fillGrounds, i === 3 ? 'non-text' : 'text',
              bgNames.map(function (b) { return b + '+fill-1'; }));
      });
      t['label-inv'] = N.labelInv;
      check('label-inv', N.labelInv, 4.5, [[t.label]], 'text', ['label']);
      N.fill.forEach(function (a, i) { t['fill-' + (i + 1)] = rgbaOf(N.fillInk, a); });
      t.separator = N.sep;
      t['separator-opaque'] = N.sepOpaque;

      /* ── accent as INK (links, eyebrows): the brand's own chroma at the
         lightness where it reads as text on the hardest ground. */
      var aInk = tonePick(o.accentInk, tone);
      if (!aInk) {
        var aL = tone === 'dark' ? Math.max(accent.L, 0.74) : Math.min(accent.L, 0.58);
        aInk = fitHex({ L: aL, C: accent.C, H: accent.H }, 4.5, grounds);
      }
      t.accent = aInk;
      check('accent', aInk, 4.5, grounds);
      var link = tonePick(o.link, tone);
      t.link = link && link !== 'accent' ? link : aInk;
      check('link', t.link, 4.5, grounds);
      /* ── the accent as ink on its OWN wash (a tinted button or chip: the
         accent at 12% at rest, up to 22% pressed, over any ground). A wash
         moves the ground toward the ink, so --accent has no headroom there
         (4.2:1 for the violet, light). Fitted with the renderer's last step
         taken away, like every ink on a wash. */
      var washNames = [], washes = [];
      N.bg.forEach(function (h, i) {
        TINT_ACCENT.forEach(function (a) { washes.push([h, rgbaOf(hexToRgb(aInk), a)]); washNames.push(bgNames[i] + '+accent ' + Math.round(a * 100) + '%'); });
      });
      t['accent-ink-on-tint'] = fitHex(aInk, 4.5, washes, true);
      check('accent-ink-on-tint', t['accent-ink-on-tint'], 4.5, washes, 'text', washNames, true);

      /* ── the tinted button: label ON fill, not fill on ground. white
         on the default violet measures 2.81:1; the fill is derived from the
         requirement. A pale brand (L > .80) gets dark ink, as for yellow. */
      var F = tonePick(o.fill, tone) || o.fill || 'vivid', TARGET = o.buttonContrast || 4.5;
      var top, bottom, ink, hover, active;
      if (F.stops || F.solid) {
        var sol = F.solid && typeof F.solid === 'object'
          ? oklchToHex(F.solid.L, F.solid.C != null ? F.solid.C : accent.C, accent.H) : F.solid;
        top = F.stops ? F.stops[0] : sol;
        bottom = F.stops ? F.stops[1] : sol;
        ink = F.ink || '#ffffff';
        hover = F.hover; active = F.active;
      } else {
        var PALE = 0.80, MUD = 0.34, white = accent.L <= PALE, C0 = accent.C * (F === 'dusty' ? 0.6 : 1);
        var baseL = accent.L;
        if (white) {
          var lo = MUD, hi = accent.L, best = null;
          for (var q = 0; q < 22; q++) {
            var mid = (lo + hi) / 2;
            if (contrast(luminanceOf(mid, C0, accent.H), 1) >= TARGET) { best = mid; lo = mid; } else hi = mid;
          }
          if (best === null) white = false; else baseL = best;
        }
        if (!white) baseL = Math.max(accent.L, 0.74);
        top = oklchToHex(baseL, C0, accent.H);
        bottom = oklchToHex(Math.max(0.24, baseL - 0.13), C0 * 0.82, accent.H);
        ink = white ? '#ffffff' : oklchToHex(0.17, 0.02, accent.H);
      }
      /* Hover and active are FIXED colours, never opacity or a filter. The pattern: hover is the lightest step that
         still holds the ink at target (#0076df measures 4.51:1), active is
         darker. For a dark-ink (pale) fill the directions swap roles: hover
         goes lighter, which only raises its ink contrast. */
      var inkLum = hexLuminance(ink), inkIsLight = inkLum > 0.5;
      var holds = function (hex) { return contrast(hexLuminance(hex), inkLum) >= TARGET; };
      var tc = hexToOklch(top);
      if (!hover) {
        var hC = tc.C * 1.12, hL = tc.L;
        if (inkIsLight) {
          hL = fitL(tc.L + 0.02, hC, tc.H, -1, holds);
          if (hL > tc.L + 0.02) hL = tc.L + 0.02;
        } else hL = Math.min(0.98, tc.L + 0.045);
        hover = oklchToHex(hL, hC, tc.H);
      }
      if (!active) active = oklchToHex(inkIsLight ? tc.L - 0.03 : tc.L - 0.035, tc.C * 0.96, tc.H);
      var bc = hexToOklch(bottom), dL = bc.L - tc.L;
      var shade = function (hex) {
        var c = hexToOklch(hex);
        return oklchToHex(Math.max(0.2, c.L + dL), Math.max(0, c.C + bc.C - tc.C), c.H);
      };
      var grad = function (a, b) { return 'linear-gradient(135deg,' + a + ',' + b + ')'; };
      t['accent-ink'] = ink;
      t['accent-solid'] = top;
      t['accent-fill'] = grad(top, bottom);
      t['accent-hover'] = hover;
      t['accent-active'] = active;
      t['accent-fill-hover'] = grad(hover, top === bottom ? hover : shade(hover));
      t['accent-fill-active'] = grad(active, top === bottom ? active : shade(active));
      /* The lighter stop is the one that has to pass; both are reported. */
      check('accent-ink', ink, TARGET,
            [[top], [bottom], [hover], [active]], 'text',
            ['accent-solid', 'accent-fill end', 'accent-hover', 'accent-active']);
      /* Own-tone glow: the fill's colour a quarter of the way down its own
         gradient, never the brand hex (a #7c5cff halo reads as neon; #6d5dae
         is the fill's own mid-tone). */
      var glow = tonePick(o.glow, tone);
      if (!glow) {
        var g = oklchToHex(tc.L + 0.25 * (bc.L - tc.L), (tc.C + bc.C) / 2, tc.H);
        glow = rgbaOf(hexToRgb(g), 0.8);
      }
      t['accent-glow'] = glow;

      /* ── on-art inks: near-white, brand-tinted (#ded9ec / #cbc4dd for violet),
         dark on a light (paper) art. The painter's contract is that art under
         copy is no lighter than oklch L .40 (dark) / no darker than .88
         (light); the audit measures the rendered page. */
      var A = ART[tone], artGround = [[oklchToHex(A.L, A.C, accent.H)]];
      var given = tonePick(o.onArt, tone);
      ['on-art-1', 'on-art-2'].forEach(function (role, i) {
        var v = given && given[i];
        if (!v) {
          var st = tone === 'dark' ? [{ L: 0.895, C: 0.026 }, { L: 0.834, C: 0.035 }][i]
                                   : [{ L: 0.30, C: 0.05 }, { L: 0.38, C: 0.06 }][i];
          v = fitHex({ L: st.L, C: st.C, H: accent.H }, 4.5, artGround);
        }
        t[role] = v;
        check(role, v, 4.5, artGround, 'text', ['art L ' + A.L]);
      });

      /* ── scrim: the modal scrim, black at .48, for dialog::backdrop. Black in BOTH tones: on
         a light page the #f5f5f7 band under an open
         modal composites to rgb(128,128,129) — black .48. A pale
         rgba(232,232,237,.48) "light variant" is an opt-in, not
         the light-tone default. */
      t.scrim = 'rgba(0,0,0,0.48)';

      /* ── sweep: what a [data-sweep] headline travels through before it
         settles on --label (dim navy → pale blues →
         white). Brand hue at low chroma. -1 is the bright
         middle, held at 4.5:1; -2 the dim start, held at 3:1 (a headline is
         large text) so the line reads even before the sweep has played. */
      var sw = tone === 'dark' ? [{ L: 0.84, C: 0.09 }, { L: 0.30, C: 0.07 }] : [{ L: 0.46, C: 0.12 }, { L: 0.90, C: 0.05 }];
      [['sweep-1', 4.5, 'text'], ['sweep-2', 3, 'non-text']].forEach(function (s, i) {
        var v = fitHex({ L: sw[i].L, C: Math.min(accent.C, sw[i].C), H: accent.H }, s[1], grounds);
        t[s[0]] = v;
        check(s[0], v, s[1], grounds, s[2]);
      });

      /* ── semantics: hues (green / orange / red), fitted as ink on
         the hardest ground. -ink is the text ON the solid, -fill a wash of it,
         -strong the text on that wash — a tint moves the ground toward the
         ink, so a colour fitted to 4.5 has no headroom on its own wash
         (see SPEC §2). */
      var semGiven = tonePick(o.semantic, tone) || {};
      var SEMSRC = { ok: 'green', warn: 'orange', bad: 'red' };
      ['ok', 'warn', 'bad'].forEach(function (k) {
        var v = semGiven[k] || fitHex(SYS[SEMSRC[k]][tone === 'dark' ? 1 : 0], 4.5, grounds);
        var vc = hexToOklch(v), rgb = hexToRgb(v);
        t[k] = v;
        check(k, v, 4.5, grounds);
        var dark = oklchToHex(0.17, 0.03, vc.H);
        var onSolid = contrast(hexLuminance(v), 1) >= 4.5 && (tone === 'light' ||
          contrast(hexLuminance(v), 1) >= contrast(hexLuminance(v), hexLuminance(dark))) ? '#ffffff' : dark;
        t[k + '-ink'] = onSolid;
        check(k + '-ink', onSolid, 4.5, [[v]], 'text', [k]);
        var tint = rgbaOf(rgb, TINT), tintGrounds = N.bg.map(function (h) { return [h, tint]; });
        t[k + '-fill'] = tint;
        /* Every ground, --bg-2 (the card surface) the hardest in light; with
           the last step taken away, since a 12px/600 badge fitted to 4.500
           in the model measured 4.49 on the page. */
        var strong = fitHex(v, 4.5, tintGrounds, true);
        t[k + '-strong'] = strong;
        check(k + '-strong', strong, 4.5, tintGrounds, 'text',
              bgNames.map(function (b) { return b + '+' + k + '-fill'; }), true);
      });

      /* ── system colours: reference values, verbatim. They are fills
         and tints (yellow is 1.5:1 on white), so they are reported, not held. */
      Object.keys(SYS).forEach(function (k) {
        t['sys-' + k] = SYS[k][tone === 'dark' ? 1 : 0];
        m['sys-' + k] = SYS[k][tone === 'dark' ? 3 : 2];
      });

      /* ── series: data marks, a 3:1 non-text floor on the hardest ground. */
      var S = o.series ? tonePick(o.series, tone) || o.series[tone] : null;
      var exact = S && tone === 'dark' && o.series.exactDark;
      var src = S || SERIES.map(function (k) { return SYS[k][tone === 'dark' ? 1 : 2]; });
      var band = SERIES_BAND[tone];
      var ser = src.map(function (hex) {
        if (exact) return hex;
        var c = hexToOklch(hex), L = Math.max(band[0], Math.min(band[1], c.L));
        return fitHex({ L: L, C: c.C, H: c.H }, 3, grounds);
      });
      if (!exact) ser = separate(ser, dir);
      ser.forEach(function (v, i) {
        t['series-' + (i + 1)] = v;
        check('series-' + (i + 1), v, 3, grounds, 'non-text');
      });


      /* ── increased contrast ──────────────────────────────────────────── */
      var stepHex = function (hex, s) {
        var c = hexToOklch(hex);
        return oklchToHex(dir > 0 ? Math.min(0.99, c.L + s) : Math.max(0.03, c.L - s), c.C, c.H);
      };
      ['label-2', 'label-3', 'label-4'].forEach(function (r) { m[r] = stepHex(t[r], MORE.step); });
      N.fill.forEach(function (a, i) { m['fill-' + (i + 1)] = rgbaOf(N.fillInk, Math.min(0.5, a * MORE.fill)); });
      var sepP = parse(N.sep);
      m.separator = rgbaOf([sepP.r, sepP.g, sepP.b], Math.min(0.5, sepP.a * MORE.sep));
      m['separator-opaque'] = stepHex(N.sepOpaque, 0.08);
      /* The fill got heavier, which MOVES the on-fill ground: refit there,
         then step (4.50 → 3.22:1 when this was left alone). */
      var fillMore = N.bg.map(function (h) { return [h, m['fill-1']]; });
      [1, 2, 3].forEach(function (i) {
        var r = labelNames[i] + '-on-fill';
        m[r] = stepHex(fitHex(t[r], N.target[i], fillMore), MORE.step);
      });
      ['accent', 'link', 'ok', 'warn', 'bad', 'ok-strong', 'warn-strong', 'bad-strong', 'sweep-1', 'sweep-2']
        .forEach(function (r) { m[r] = stepHex(t[r], MORE.inkStep); });
      /* The wash under an on-tint ink is of the STEPPED accent here, which
         moves the ground: refit there, then step (as the on-fill inks). */
      var washMore = [];
      N.bg.forEach(function (h) { TINT_ACCENT.forEach(function (a) { washMore.push([h, rgbaOf(hexToRgb(m.accent), a)]); }); });
      m['accent-ink-on-tint'] = stepHex(fitHex(t['accent-ink-on-tint'], 4.5, washMore, true), MORE.inkStep);
      [1, 2, 3, 4, 5, 6].forEach(function (i) { m['series-' + i] = stepHex(t['series-' + i], MORE.inkStep); });
      /* Never worse: a step toward the ink cannot lower the ratio on a fixed
         ground — asserted anyway, because "by construction" is a claim. */
      Object.keys(m).forEach(function (r) {
        if (/^(fill|separator|sys)/.test(r)) return;
        var gs = /on-fill$/.test(r) ? fillMore : /on-tint$/.test(r) ? washMore : /-strong$/.test(r)
          ? N.bg.map(function (h) { return [h, t[r.replace('-strong', '-fill')]]; }) : grounds;
        var before = worst(t[r], /on-fill$/.test(r) ? fillMore : gs).ratio, after = worst(m[r], gs).ratio;
        rep({ role: r, value: m[r], more: true, kind: 'more', target: before, ratio: after,
              against: 'same grounds', pass: after >= before - 0.005 });
      });

      out.tones[tone] = t;
      out.more[tone] = m;
    });

    out.root['accent-base'] = o.accent;
    out.root['brand-rgb'] = hexToRgb(o.accent).join(',');
    out.failures = out.report.filter(function (r) { return !r.pass; });
    return out;
  }

  /* ── 7 · EMIT ───────────────────────────────────────────────────────────
     :root carries the light set too, so a page with no data-tone and no
     script still resolves every role; the OS-dark fallback covers the same
     page in dark mode. Increased contrast is wrapped, so it outranks the base
     only when the setting is on — and has a [data-contrast="more"] twin for
     a page-level switch (Safari cannot be asked). */
  function block(sel, vars, indent) {
    indent = indent || '';
    var keys = ROLES.filter(function (k) { return k in vars; })
      .concat(Object.keys(vars).filter(function (k) { return ROLES.indexOf(k) < 0; }));
    return indent + sel + '{\n' + keys.map(function (k) {
      return indent + '  ' + (k === 'color-scheme' ? k : '--' + k) + ':' + vars[k] + ';';
    }).join('\n') + '\n' + indent + '}';
  }
  function withScheme(tone, vars) {
    var v = { 'color-scheme': tone };
    Object.keys(vars).forEach(function (k) { v[k] = vars[k]; });
    return v;
  }
  var STAGE = '.band[data-band="stage"]:not([data-tone])';
  function toCSS(p, opts) {
    opts = opts || {};
    var rootVars = {};
    Object.keys(p.root).forEach(function (k) { rootVars[k] = p.root[k]; });
    var L = withScheme('light', p.tones.light), D = withScheme('dark', p.tones.dark);
    var parts = [];
    if (opts.header) parts.push(opts.header);
    parts.push(block(':root', rootVars));
    parts.push(block(':root,\n[data-tone="light"]', L));
    parts.push(block('[data-tone="dark"]', D));
    /* A stage band is dark by definition (SPEC §3). FG3.boot() gives it
       data-tone="dark"; these blocks key it dark BEFORE boot and with no
       script at all. Own blocks rather than a second selector on the dark
       ones, whose exact selectors tools read (test-color). */
    parts.push(block(STAGE, D));
    parts.push('@media (prefers-color-scheme: dark){\n' + block(':root:not([data-tone])', D, '  ') + '\n}');
    parts.push('@media (prefers-contrast: more){\n' +
      block('[data-tone="light"]', p.more.light, '  ') + '\n' +
      block('[data-tone="dark"]', p.more.dark, '  ') + '\n' +
      block(STAGE, p.more.dark, '  ') + '\n}');
    parts.push(block('[data-contrast="more"][data-tone="light"],\n[data-contrast="more"] [data-tone="light"]', p.more.light));
    parts.push(block('[data-contrast="more"][data-tone="dark"],\n[data-contrast="more"] [data-tone="dark"],\n' +
      '[data-contrast="more"]' + STAGE + ',\n[data-contrast="more"] ' + STAGE, p.more.dark));
    return parts.join('\n\n') + '\n';
  }

  function install(opts, doc) {
    doc = doc || document;
    var p = build(opts), el = doc.getElementById('fg3-palette');
    if (!el) { el = doc.createElement('style'); el.id = 'fg3-palette'; doc.head.appendChild(el); }
    el.textContent = toCSS(p);
    if (p.failures.length && global.console) console.warn('palette: ' + p.failures.length + ' role(s) below target', p.failures);
    return p;
  }

  /* ── 8 · COVERAGE, derived from the stylesheets ──────────────────────────
     SPEC §1: colour roles are unprefixed; everything else is by family. So a
     name read through var(--x) that no non-colour stylesheet DECLARES is a
     colour role the palette must emit. a typed list of roles would omit
     the ones it failed to emit. */
  function names(re, css) {
    var out = {}, mm;
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    while ((mm = re.exec(css))) out[mm[1]] = 1;
    return out;
  }
  var FAMILIES = /^(t|s|r|sp|ease|d|z|mat|lg3|bp|sym|ch|focus|shadow|w|band|font)-/;
  function referenced(cssText) {
    /* A read WITH a fallback resolves on its own; a family name is not a colour. */
    return Object.keys(names(/var\(\s*--([a-z0-9-]+)\s*\)/gi, cssText))
      .filter(function (n) { return !FAMILIES.test(n); });
  }
  function coverage(p, cssTexts) {
    var used = {}, declared = {};
    (cssTexts || []).forEach(function (css) {
      referenced(css).forEach(function (n) { used[n] = 1; });
      Object.keys(names(/(?:^|[;{\s])--([a-z0-9-]+)\s*:/gi, css)).forEach(function (n) { declared[n] = 1; });
    });
    var emitted = {};
    ['light', 'dark'].forEach(function (t) { Object.keys(p.tones[t]).forEach(function (k) { emitted[k] = (emitted[k] || 0) + 1; }); });
    Object.keys(p.root).forEach(function (k) { emitted[k] = 2; });
    /* Only names in a colour family this palette emits (label-*, series-*…):
       anything else read bare is some other module's knob. */
    var roots = {};
    Object.keys(emitted).forEach(function (k) { roots[k.split('-')[0]] = 1; });
    var needed = Object.keys(used).filter(function (n) { return !declared[n] && roots[n.split('-')[0]]; });
    return { referenced: Object.keys(used), needed: needed,
             missing: needed.filter(function (n) { return emitted[n] !== 2; }) };
  }

  global.PALETTE = {
    build: build, toCSS: toCSS, install: install, coverage: coverage, referenced: referenced,
    ROLES: ROLES, PRESETS: PRESETS, NEUTRALS: NEUTRALS, SYS: SYS, SERIES: SERIES, MORE: MORE, ART: ART,
    parse: parse, over: over, ratio: ratio,
    hexToOklch: hexToOklch, oklchToHex: oklchToHex, luminanceOf: luminanceOf,
    contrast: contrast, hexLuminance: hexLuminance
  };
})(typeof window !== 'undefined' ? window : globalThis);
