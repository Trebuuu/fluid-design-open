/* ═══════════════════════════════════════════════════════════════════════════
   art3.js → ART3 — the brand backdrop painter (Fluid Design Open)
   ───────────────────────────────────────────────────────────────────────────
   A lens needs something to bend. the painter is back: value-
   noise fBm, domain-warped so bands fold like long-exposure light, indexed
   along a dark→light RAMP whose hue walks with luminance (a sunset, not a set
   of blobs), then vignetted and grained. Every pixel sits at ONE point of the
   ramp, so complementary hues never average into grey.

   MARKUP
     <canvas data-art="twilight"          aurora twilight ember deep dawn steel paper
                                          | accent (with data-art-accent="#hex") | #hex
                                          | fixture (a diagnostic test scene — tests only)
             data-art-seed="11"           deterministic (default 7)
             data-art-scale="2"           noise cells across the frame (2)
             data-art-warp=".55"          domain warp (.55)
             data-art-contrast="1.2"      ramp contrast (1.2)
             data-art-vignette=".34"      corner darkening (.34)
             data-art-grain=".05"         ±grain·255/2 per channel (.05)
             data-art-drift[=".5"]>       slow transform-only drift; parent must clip; off under reduced motion
   CONTRACT (the glass material depends on it)
     · only canvas primitives, never a URL, so pixels stay readable (getImageData),
       and every paint keeps a CPU copy readers can use for free (pixels());
     · paints SYNCHRONOUSLY in mount() when the canvas has a box; a
       ResizeObserver repaints only when the size changes (or a hidden canvas
       first gets a box);
     · when painted: sets `data-lg3-source`, dispatches bubbling `art3:painted`
       {detail:{ms, palette, w, h}}, then calls LG3.adapt() if LG3 exists;
     · DPR capped at 2.
   API (window.ART3)
     mount(root)              paint every canvas[data-art] under root (FG3.boot calls it)
     paint(canvas, opts)      paint now; opts {palette, seed, scale, warp, contrast,
                              vignette, grain, accent} → ms taken
     palettes                 {name: [[r,g,b] × 5]} dark→light ramps
     fromAccent(hex)          → a 5-stop ramp walking hue with luminance from the accent
     stats(canvas[, rect])    OKLCH stats of the painted pixels: {C, vivid, grey, L}
                              (C = mean chroma; vivid = % C ≥ .08; grey = % C < .03 & L ≥ .2)
     drift(canvas, on)        start/stop the drift
     pixels(canvas)           the readable copy of the last paint (null for the
                              fixture): {w, h, cw, ch, scale: 4, id, data} — a
                              quarter-size RGBA array painted with the same ops
                              (field, vignette, grain), built on first call and
                              kept until the next paint; LG3 samples it instead
                              of reading the GPU canvas back
   ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /* ── deterministic value noise ─────────────────────────────────────── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeGrid(rand, n) {
    var g = new Float32Array(n * n);
    for (var i = 0; i < n * n; i++) g[i] = rand();
    return g;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  /* n is 32. The warp can push a coordinate below 0, so shift by two whole
     periods first (wrap and fraction unchanged); then floor is |0 and the
     wrap is a mask — fewer cold-start cycles */
  function sample(grid, n, x, y) {
    x += 64; y += 64;
    var xi = x | 0, yi = y | 0, m = n - 1;
    var xf = smooth(x - xi), yf = smooth(y - yi);
    var x0 = xi & m, x1 = (x0 + 1) & m;
    var y0 = yi & m, y1 = (y0 + 1) & m;
    var a = grid[y0 * n + x0], b = grid[y0 * n + x1];
    var c = grid[y1 * n + x0], d = grid[y1 * n + x1];
    return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
  }
  function fbm(grid, n, x, y, octaves) {
    var v = 0, amp = 0.5, freq = 1, norm = 0;
    for (var o = 0; o < octaves; o++) {
      v += amp * sample(grid, n, x * freq, y * freq);
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return v / norm;
  }

  /* ── palettes: ordered dark → light RAMPS (OKLCH L C h per stop) ────────── */
  var PALETTES = {
    /* aurora is toned to northern lights (navy → teal → green glow); a chroma of .088 failed the hero bar and read like deep */
    twilight: [[10, 6, 26], [58, 26, 96], [122, 70, 190], [214, 108, 156], [255, 190, 140]],  /* 14 .04 290 · 31 .12 300 · 52 .18 300 · 67 .14 353 · 85 .10 58 */
    aurora:   [[5,7,36], [25,50,127], [3,105,175], [57,208,117], [216,244,170]], /* 15 .06 272 · 35 .14 266 · 51 .15 248 · 76 .18 152 · 93 .10 125 */
    ember:    [[18, 6, 16], [92, 18, 62], [190, 52, 78], [242, 130, 74], [255, 214, 150]],   /* 15 .03 333 · 33 .12 349 · 54 .17 15 · 72 .15 46 · 90 .09 78 */
    /* ocean, navy → azure → teal → mint (mids held blue-ward: cyan has little chroma headroom mid-L) */
    deep:     [[0, 9, 36], [1, 51, 111], [5, 111, 170], [8, 178, 202], [139, 241, 221]],  /* 15 .06 260 · 33 .12 257 · 52 .12 243 · 70 .12 212 · 89 .10 180 */
    /* a morning sky, indigo → rose → peach → pale gold; the lightest dark ramp */
    dawn:     [[28, 16, 60], [120, 43, 115], [221, 89, 113], [253, 166, 112], [251, 230, 179]], /* 22 .08 291 · 43 .14 330 · 64 .17 12 · 80 .12 52 · 93 .07 88 */
    /* Steel. Hue of a blue-grey #A8B4C6 (oklch 77% .03 258), chroma raised
       until the lens has colour to bend; the blue-grey is the
       highlight end of the ramp, not the whole of it. */
    steel:    [[1, 9, 34], [6, 46, 110], [42, 105, 180], [105, 167, 227], [191, 228, 255]], /* 15 .06 262 · 32 .12 260 · 52 .14 255 · 71 .11 249 · 90 .05 240 */
    /* the light ground — pale lavender/periwinkle/blush, for light bands */
    paper:    [[243, 242, 251], [220, 220, 253], [178, 205, 254], [248, 188, 221], [254, 246, 231]]
  };

  function ramp(pal, t) {
    t = Math.max(0, Math.min(0.9999, t)) * (pal.length - 1);
    var i = Math.floor(t), f = t - i;
    var a = pal[i], b = pal[i + 1] || pal[i];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  /* ── OKLCH, for fromAccent and stats ────────────────────────────────────── */
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function enc(v) { v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, v)) * 255); }
  function oklab(r, g, b) {
    r = lin(r); g = lin(g); b = lin(b);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  /* In gamut by lowering chroma, never by clipping channels (clipping shifts hue). */
  function oklchToRgb(L, C, h) {
    var hr = h * Math.PI / 180;
    for (var c = C; c >= 0; c -= 0.004) {
      var a = c * Math.cos(hr), b = c * Math.sin(hr);
      var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
      var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
      var R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      var G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      var B = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
      if (R > -1e-4 && R < 1.0001 && G > -1e-4 && G < 1.0001 && B > -1e-4 && B < 1.0001) return [enc(R), enc(G), enc(B)];
    }
    return [enc(L), enc(L), enc(L)];
  }

  /* A ramp from one brand hex. The hue walks +8/+10/+60/+125° as it brightens,
     which reproduces twilight from Fluid violet: the warm highlight is what
     makes the field read as light rather than as a tinted gradient. Chroma is
     floored so a near-grey brand still gives the lens colour to bend. */
  function fromAccent(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return PALETTES.twilight;
    var v = parseInt(m[1], 16), lab = oklab(v >> 16 & 255, v >> 8 & 255, v & 255);
    var C = Math.hypot(lab[1], lab[2]), h = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
    var s = Math.max(0.82, Math.min(1.2, C / 0.16));
    return [[0.14, 0.045, 0], [0.31, 0.12, 8], [0.52, 0.17, 10], [0.67, 0.145, 60], [0.86, 0.10, 125]]
      .map(function (st) { return oklchToRgb(st[0], st[1] * s, (h + st[2] + 360) % 360); });
  }

  /* ── grain: two seeded tiles, composited on the GPU ─────────────────────── */
  /* Walking every device pixel in JS costs (28 ms per 1200×400, 150+ ms for a
     retina hero). Additive grain = 'lighter' with the positive half plus
     'difference' with the negative half (b − n for every b ≥ n), tiled from a
     seeded 256² tile: same look, a fraction of the cost, still deterministic. */
  var tileCache = new Map();
  function grainTiles(seed, grain) {
    var key = seed + ':' + grain;
    var hit = tileCache.get(key);
    if (hit) return hit;
    var S = 256, rnd = mulberry32((seed + 77) * 40503 >>> 0);
    var pos = document.createElement('canvas'), neg = document.createElement('canvas');
    pos.width = neg.width = pos.height = neg.height = S;
    var pc = pos.getContext('2d'), nc = neg.getContext('2d');
    var pi = pc.createImageData(S, S), ni = nc.createImageData(S, S);
    for (var p = 0; p < S * S * 4; p += 4) {
      var nz = (rnd() - 0.5) * 255 * grain;
      var a = nz > 0 ? nz : 0, b = nz < 0 ? -nz : 0;
      pi.data[p] = pi.data[p + 1] = pi.data[p + 2] = a; pi.data[p + 3] = 255;
      ni.data[p] = ni.data[p + 1] = ni.data[p + 2] = b; ni.data[p + 3] = 255;
    }
    pc.putImageData(pi, 0, 0); nc.putImageData(ni, 0, 0);
    hit = { pos: pos, neg: neg, pi: pi, ni: ni };
    if (tileCache.size > 8) tileCache.delete(tileCache.keys().next().value);
    tileCache.set(key, hit);
    return hit;
  }

  /* ── the painter ─────────────────────────────────────────────────────────── */
  function now() { return global.performance ? performance.now() : Date.now(); }
  var RF = { willReadFrequently: true }, SNAP = 4, snaps = 0;

  /* field → frame: the low-res field drawn up, the vignette, the grain (one
     grain per pixel of the target) — the same ops for the canvas and for its
     readable snapshot */
  function finish(ctx, w, h, small, vignette, grain, seed, cpu) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, w, h);
    if (vignette > 0) {
      var g = ctx.createRadialGradient(w * 0.5, h * 0.44, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,' + vignette + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (grain > 0) {
      var tiles = cpu ? cpuTiles(seed, grain) : grainTiles(seed, grain);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = ctx.createPattern(tiles.pos, 'repeat');
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = ctx.createPattern(tiles.neg, 'repeat');
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }
  /* THE READABLE COPY. The contract says the pixels stay readable; reading a
     GPU canvas back costs a synchronous GPU round trip per call (LG3's
     sampler did it on every reading, the top cost of a scroll). So a paint
     keeps its ingredients, and the first reader gets a quarter-size copy
     painted on a CPU canvas with the same ops, read ONCE: pixels(canvas) =
     {w, h, cw, ch, scale, id, data}. Means and spread match the canvas (the
     grain is one grain per pixel in both). Built on demand — art with no
     glass over it never pays (≈ 3 ms a canvas). */
  /* the snapshot draws from CPU canvases only: a GPU-backed source drawn into
     a CPU canvas is a synchronous readback (measured 80 ms on data.html) */
  var cpuTileCache = new Map();
  function cpuTiles(seed, grain) {
    var key = seed + ':' + grain, hit = cpuTileCache.get(key);
    if (hit) return hit;
    var t = grainTiles(seed, grain), S = 256;
    function cv(img) { var c = document.createElement('canvas'); c.width = c.height = S; c.getContext('2d', RF).putImageData(img, 0, 0); return c; }
    hit = { pos: cv(t.pi), neg: cv(t.ni) };
    if (cpuTileCache.size > 8) cpuTileCache.delete(cpuTileCache.keys().next().value);
    cpuTileCache.set(key, hit);
    return hit;
  }
  function pixels(canvas) {
    if (!canvas) return null;
    var px = canvas.__art3px, src = canvas.__art3src;
    if (px && px.cw === canvas.width && px.ch === canvas.height) return px;
    if (!src || src.cw !== canvas.width || src.ch !== canvas.height) return null;
    var w = Math.max(3, Math.round(canvas.width / SNAP)), h = Math.max(3, Math.round(canvas.height / SNAP));
    try {
      var f = document.createElement('canvas'); f.width = src.img.width; f.height = src.img.height;
      f.getContext('2d', RF).putImageData(src.img, 0, 0);
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var x = c.getContext('2d', RF);
      finish(x, w, h, f, src.vignette, src.grain, src.seed, true);
      px = { w: w, h: h, cw: canvas.width, ch: canvas.height, scale: SNAP, id: 'art3-' + (++snaps),
             data: x.getImageData(0, 0, w, h).data };
    } catch (e) { px = null; }
    canvas.__art3px = px; canvas.__art3src = null;
    return px;
  }

  function paint(canvas, opts) {
    opts = opts || {};
    if (opts.palette === 'fixture') return paintFixture(canvas, opts);
    var t0 = now();
    var pal = opts.accent ? fromAccent(opts.accent)
            : Array.isArray(opts.palette) ? opts.palette
            : PALETTES[opts.palette] || PALETTES.twilight;
    var seed     = opts.seed != null ? opts.seed : 7;
    var scale    = opts.scale || 2.0;
    var warp     = opts.warp != null ? opts.warp : 0.55;
    var contrast = opts.contrast || 1.2;
    var grain    = opts.grain != null ? opts.grain : 0.05;
    var vignette = opts.vignette != null ? opts.vignette : 0.34;

    var box = canvas.getBoundingClientRect();
    /* offsetWidth, not the rect: a drifting (scaled) canvas must not repaint
       at its transformed size. */
    var W = Math.max(1, Math.round(canvas.offsetWidth || box.width));
    var H = Math.max(1, Math.round(canvas.offsetHeight || box.height));
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    /* Low-res paint, drawn up: 240 px on the long side is not a shortcut, it
       is the look — a continuous-tone field with no hard pixel edges. */
    var long = Math.max(W, H);
    var lw = Math.max(8, Math.round(W / long * 240));
    var lh = Math.max(8, Math.round(H / long * 240));
    var rand = mulberry32(seed * 2654435761 >>> 0);
    var n = 32;
    var gA = makeGrid(rand, n), gB = makeGrid(rand, n), gC = makeGrid(rand, n);
    var small = document.createElement('canvas');
    small.width = lw; small.height = lh;
    var sctx = small.getContext('2d');
    var img = sctx.createImageData(lw, lh), d = img.data;
    /* Kept on purpose for landscape frames: `scale` cells across
       each axis, so a wide hero's bands stretch into the long-exposure
       streak. A portrait frame (a phone hero, a tall band) would stretch them
       VERTICALLY into rain, so cells there stay ≥ 1.2 : 1 wide. Identical to
       a plain mapping whenever H/W ≤ .83. */
    var vs = Math.max(scale, 1.2 * scale * H / W);
    for (var y = 0; y < lh; y++) {
      for (var x = 0; x < lw; x++) {
        var u = x / lw * scale, v = y / lh * vs;
        /* domain warp: concentric blobs fold into flowing bands */
        var wx = fbm(gB, n, u + 1.7, v + 9.2, 3) - 0.5;
        var wy = fbm(gC, n, u + 5.3, v + 2.8, 3) - 0.5;
        var t = fbm(gA, n, u + warp * wx * scale, v + warp * wy * scale, 5);
        /* vertical bias: brighter at the top, so it reads as lit, not wallpaper */
        t = t * 0.82 + (1 - y / lh) * 0.18;
        t = (t - 0.5) * contrast + 0.5;
        var c = ramp(pal, t), i = (y * lw + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);

    finish(canvas.getContext('2d'), canvas.width, canvas.height, small, vignette, grain, seed);
    canvas.__art3px = null;
    canvas.__art3src = { img: img, vignette: vignette, grain: grain, seed: seed, cw: canvas.width, ch: canvas.height };
    return now() - t0;
  }

  /* ── the diagnostic scene, for tests ONLY (data-art="fixture") ──────────
     It "must have somewhere to be wrong": a hotspot, a dark well, hard strokes
     and text-like rows, so adaptive tone/shadow have known places to respond.
     A test chart, never a brand backdrop. */
  function paintFixture(canvas, opts) {
    var t0 = now();
    var pal = ['#2b1c5e', '#6b3fa8', '#c05a8a', '#2a6ea8', '#0c0a16'];
    var s = (opts.seed || 7) >>> 0 || 1;
    var rand = function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    var w = Math.max(2, Math.round(canvas.offsetWidth || 1200)), h = Math.max(2, Math.round(canvas.offsetHeight || 600));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d'), i, g;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal[4]; ctx.fillRect(0, 0, w, h);
    function rgb(hx) { return [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)].join(','); }
    for (i = 0; i < 6; i++) {
      var cx = rand() * w, cy = rand() * h, rad = (0.3 + rand() * 0.55) * Math.max(w, h), col = rgb(pal[i % 4]);
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(' + col + ',' + (0.5 + rand() * 0.4) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 26; i++) {
      var x0 = rand() * w, y0 = rand() * h, len = (0.1 + rand() * 0.5) * w, ang = (rand() - 0.5) * 1.1;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.03 + rand() * 0.12).toFixed(3) + ')';
      ctx.lineWidth = 0.6 + rand() * 2.4; ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); ctx.stroke();
    }
    ctx.restore();
    g = ctx.createRadialGradient(w * 0.74, h * 0.3, 0, w * 0.74, h * 0.3, Math.max(w, h) * 0.34);
    g.addColorStop(0, 'rgba(255,252,244,.92)'); g.addColorStop(0.45, 'rgba(255,230,200,.26)'); g.addColorStop(1, 'rgba(255,220,190,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    g = ctx.createRadialGradient(w * 0.2, h * 0.78, 0, w * 0.2, h * 0.78, Math.max(w, h) * 0.3);
    g.addColorStop(0, 'rgba(0,0,0,.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.80)';
    for (var row = 0; row < 7; row++) {
      var yy = 0.52 * h + row * 15, xx = w * 0.08, right = w * 0.08 + (0.3 + rand() * 0.12) * w;
      while (xx < right) { var ww = Math.min(14 + rand() * 46, right - xx); ctx.fillRect(xx, yy, ww, 5.5); xx += ww + 7; }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    canvas.__art3px = canvas.__art3src = null;                 /* no copy: readers read the canvas */
    return now() - t0;
  }

  /* ── stats: the acceptance metric, measured on what was painted ─────────── */
  function stats(canvas, rect) {
    var ctx = canvas.getContext('2d');
    var x = rect ? rect.x : 0, y = rect ? rect.y : 0;
    var w = rect ? rect.w : canvas.width, h = rect ? rect.h : canvas.height;
    var data = ctx.getImageData(x, y, w, h).data;
    var n = 0, sC = 0, sL = 0, vivid = 0, grey = 0, step = 4 * Math.max(1, Math.round(Math.sqrt(w * h / 40000)));
    for (var p = 0; p < data.length; p += step) {
      var lab = oklab(data[p], data[p + 1], data[p + 2]), C = Math.hypot(lab[1], lab[2]);
      n++; sC += C; sL += lab[0];
      if (C >= 0.08) vivid++;
      if (C < 0.03 && lab[0] >= 0.2) grey++;
    }
    return { C: +(sC / n).toFixed(4), vivid: +(100 * vivid / n).toFixed(1),
             grey: +(100 * grey / n).toFixed(1), L: +(sL / n).toFixed(3), n: n };
  }

  /* ── drift: transform only, never a repaint ─────────────────────────────── */
  var RM = global.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  function drift(canvas, on) {
    if (canvas.__art3Drift) { canvas.__art3Drift.cancel(); canvas.__art3Drift = null; }
    if (!on || (RM && RM.matches) || !canvas.animate) return null;
    var k = Math.max(0.1, Math.min(2, parseFloat(canvas.dataset.artDrift) || 1));
    /* Scaled past the frame so an edge never shows; the parent clips. */
    canvas.__art3Drift = canvas.animate([
      { transform: 'translate3d(0,0,0) scale(' + (1 + 0.06 * k) + ')' },
      { transform: 'translate3d(' + (-2.4 * k) + '%,' + (1.6 * k) + '%,0) scale(' + (1 + 0.1 * k) + ')' }
    ], { duration: 48000 / k, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    return canvas.__art3Drift;
  }
  if (RM && RM.addEventListener) RM.addEventListener('change', function () {
    document.querySelectorAll('canvas[data-art][data-art-drift]').forEach(function (c) { drift(c, true); });
  });

  /* ── mount ───────────────────────────────────────────────────────────────── */
  function optsOf(c) {
    var d = c.dataset, name = (d.art || 'twilight').trim();
    var num = function (v) { var x = parseFloat(v); return isFinite(x) ? x : undefined; };
    return {
      palette: name.charAt(0) === '#' ? null : name,
      accent: name.charAt(0) === '#' ? name : (name === 'accent' ? d.artAccent : null),
      seed: num(d.artSeed), scale: num(d.artScale), warp: num(d.artWarp),
      contrast: num(d.artContrast), vignette: num(d.artVignette), grain: num(d.artGrain)
    };
  }

  function repaint(c, force) {
    var w = c.offsetWidth, h = c.offsetHeight;
    if (w < 2 || h < 2) return false;                        /* hidden: wait for a box */
    if (!force && c.__art3W === w && c.__art3H === h) return false;
    c.__art3W = w; c.__art3H = h;
    var o = optsOf(c), ms = paint(c, o);
    c.__art3Ms = ms;
    c.setAttribute('data-lg3-source', '');
    c.dispatchEvent(new CustomEvent('art3:painted', { bubbles: true,
      detail: { ms: ms, palette: o.accent || o.palette, w: c.width, h: c.height } }));
    if (global.LG3 && global.LG3.adapt) global.LG3.adapt();
    return true;
  }

  var ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(function (es) { es.forEach(function (e) { repaint(e.target, false); }); }) : null;

  function mount(root) {
    var list = (root || document).querySelectorAll('canvas[data-art]');
    list.forEach(function (c) {
      repaint(c, true);                  /* synchronous when it already has a box */
      if (ro && !c.__art3Obs) { ro.observe(c); c.__art3Obs = true; }
      if (c.hasAttribute('data-art-drift')) drift(c, true);
    });
    return list.length;
  }

  global.ART3 = {
    mount: mount, paint: paint, palettes: PALETTES, fromAccent: fromAccent,
    stats: stats, drift: drift, repaint: function (c) { return repaint(c, true); },
    pixels: pixels
  };
})(window);
