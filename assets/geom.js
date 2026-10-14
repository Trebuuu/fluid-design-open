/* ═══════════════════════════════════════════════════════════════════════════
   geom.js → GEOM — corners as geometry (Fluid Design Open, forked)
   ───────────────────────────────────────────────────────────────────────────
   The corner as numbers: the outline (clip-path fallback), the signed distance
   field (the glass bevel), concentricity, and — the CALIBRATION
   that makes a CSS `corner-shape: superellipse(k)` corner carry the same visual
   mass as the continuous corner of the same nominal radius.

   PUBLIC API (window.GEOM)
     SUPPORTS_CORNER_SHAPE           bool   CSS.supports('corner-shape','squircle')
     KEYWORDS                        {notch,scoop,bevel,round,squircle,square} → k
     resolveK(v)                     number | keyword | 'superellipse(k)' → k (default 2)
     expFromK(k)                     Lamé exponent n = 2^k
     outline(w,h,radii,k,steps)      SVG path d; radii number | {tl,tr,br,bl}
     clipPath(w,h,radii,k,steps)     'path("…")'
     normRadii(w,h,radii)            border-radius style clamp → {tl,tr,br,bl}
     sdBox(px,py,hw,hh,r,n)          signed distance to a superellipse-cornered box
     smin(a,b,k)                     polynomial smooth-min (glass merge meniscus)
     fieldAt(px,py,shapes,k,n)       smooth union of boxes {cx,cy,hw,hh,r,n?}
     unitCornerField(n) / warm(ns)   baked unit corner field (cached)
     concentric(outerR,gap,{minimum=6,outerIsCapsule}) → {capsule,r}
     measureGap(innerEl,outerEl)     px, from live rects
     isCapsule(w,h,r)                r ≥ min(w,h)/2 − .5
   continuous corners:
     CONTINUOUS                      {k:1.71, rScale:1.53, kExact, rScaleExact,
                                      insetPerR, extentPerR, hausdorffPerR, source}
     continuous(r[, w, h])           → {radius, k, capsule}  CSS numbers for an
                                      continuous corner of nominal radius r
     contCorner(r)                    → [{x,y}] polyline of the corner (corner-local:
                                      x from the vertical edge, y from the horizontal)
     contPath(w,h,r)                  SVG path d of a w×h rect with corners
     superellipseInset(R,k)          diagonal inset per axis, px
     contInset(r)                     diagonal inset per axis, px

   TOKENS FOR THE CORE (fg3-tokens.css):   --k: 1.71;  --r-scale: 1.53;
     a fixed radius token is  border-radius: calc(<r> * var(--r-scale));
                              corner-shape: superellipse(var(--k));
     a capsule is             border-radius: 999px; corner-shape: round;   (k = 1)
   ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /* n = 2^k is forced by the spec's keyword table: bevel = superellipse(0) is a
     straight diagonal (n = 1), and only n = 2^k sends k = 0 there. */
  var KEYWORDS = {
    notch: -Infinity, scoop: -1, bevel: 0, round: 1, squircle: 2, square: Infinity
  };

  /* Chromium 139+ only; Safari/Firefox drop the declaration and draw a circle,
     so FG3 applies clipPath() from these same numbers where it is missing. */
  var SUPPORTS_CORNER_SHAPE = (function () {
    try { return CSS.supports('corner-shape', 'squircle'); } catch (e) { return false; }
  })();

  function resolveK(v) {
    if (typeof v === 'number') return v;
    if (v == null) return 2;
    var s = String(v).trim();
    if (s in KEYWORDS) return KEYWORDS[s];
    var m = /^superellipse\(\s*(-?[\d.]+|-?infinity)\s*\)$/i.exec(s);
    if (m) return m[1].toLowerCase() === 'infinity' ? Infinity
          : m[1].toLowerCase() === '-infinity' ? -Infinity : parseFloat(m[1]);
    var n = parseFloat(s);
    return isFinite(n) ? n : 2;
  }

  function expFromK(k) {
    if (k === Infinity) return 1e6;
    if (k === -Infinity) return 1e-6;
    return Math.pow(2, k);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     1. THE OUTLINE
     u = cos^(2/n)θ clings to 1 as n grows, so uniform θ starves the bend and a
     large corner comes out faceted. Concentrate samples at both ends by the
     amount the exponent demands (w = 0 at n = 2, where uniform θ is exact).
     ───────────────────────────────────────────────────────────────────────── */
  function cornerPoints(rx, ry, n, steps) {
    var w = Math.max(0, Math.min(0.85, (n - 2) / 6));
    var pts = [], i, t, g, th;
    for (i = 0; i <= steps; i++) {
      t = i / steps;
      g = (1 - w) * t + w * 0.5 * (1 - Math.cos(Math.PI * t));
      th = g * (Math.PI / 2);
      pts.push([Math.pow(Math.abs(Math.cos(th)), 2 / n) * rx,
                Math.pow(Math.abs(Math.sin(th)), 2 / n) * ry]);
    }
    return pts;
  }

  /* Opposite corners scale down together, as border-radius does, so a pill
     never overlaps itself. */
  function normRadii(w, h, radii) {
    var r = (typeof radii === 'number') ? { tl: radii, tr: radii, br: radii, bl: radii }
                                        : Object.assign({ tl: 0, tr: 0, br: 0, bl: 0 }, radii || {});
    var f = 1;
    f = Math.min(f, w / Math.max(1e-6, r.tl + r.tr));
    f = Math.min(f, w / Math.max(1e-6, r.bl + r.br));
    f = Math.min(f, h / Math.max(1e-6, r.tl + r.bl));
    f = Math.min(f, h / Math.max(1e-6, r.tr + r.br));
    if (f < 1) { r.tl *= f; r.tr *= f; r.br *= f; r.bl *= f; }
    return r;
  }

  function outline(w, h, radii, k, steps) {
    var n = expFromK(resolveK(k));
    var r = normRadii(w, h, radii);
    steps = steps || 24;
    var d = [], i, p;
    function corner(cx, cy, rx, ry, sx, sy, rev) {
      var pts = cornerPoints(rx, ry, n, steps);
      if (rev) pts.reverse();
      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        d.push((cx + sx * p[0]).toFixed(2) + ',' + (cy + sy * p[1]).toFixed(2));
      }
    }
    corner(r.tl, r.tl, r.tl, r.tl, -1, -1, false);
    corner(w - r.tr, r.tr, r.tr, r.tr, 1, -1, true);
    corner(w - r.br, h - r.br, r.br, r.br, 1, 1, false);
    corner(r.bl, h - r.bl, r.bl, r.bl, -1, 1, true);
    return 'M' + d.join('L') + 'Z';
  }

  function clipPath(w, h, radii, k, steps) {
    return 'path("' + outline(w, h, radii, k, steps) + '")';
  }

  /* ─────────────────────────────────────────────────────────────────────────
     2. THE FIELD
     The bevel needs a signed DISTANCE. The first-order estimator (S − r)/|∇S|
     reads 1.28 px too deep at n = 4 on an 18 px band — the corners then glow
     brighter than the flats, the very artefact a continuous corner removes. In
     unit coordinates the corner depends only on n, so bake d(u,v) once per n
     (bracketed golden-section nearest point) and scale by r: 0.076 px at n = 4,
     and cheaper than three pow() calls.
     ───────────────────────────────────────────────────────────────────────── */
  var PHI = (Math.sqrt(5) - 1) / 2;
  var FIELD_EXT = 1.45;
  var FIELD_N = 128;
  var fieldCache = new Map();

  function nearestOnUnitCorner(u, v, p) {
    var HI = Math.PI / 2, bi = 0, bv = Infinity, i, t, d;
    for (i = 0; i <= 16; i++) {
      t = i / 16 * HI;
      d = dist2(t, u, v, p);
      if (d < bv) { bv = d; bi = i; }
    }
    var a = Math.max(0, (bi - 1) / 16 * HI), b = Math.min(HI, (bi + 1) / 16 * HI);
    var c = b - PHI * (b - a), e = a + PHI * (b - a);
    var fc = dist2(c, u, v, p), fe = dist2(e, u, v, p);
    for (i = 0; i < 30; i++) {
      if (fc < fe) { b = e; e = c; fe = fc; c = b - PHI * (b - a); fc = dist2(c, u, v, p); }
      else         { a = c; c = e; fc = fe; e = a + PHI * (b - a); fe = dist2(e, u, v, p); }
    }
    return Math.sqrt(Math.min(fc, fe));
  }
  function dist2(th, u, v, p) {
    var dx = u - Math.pow(Math.cos(th), p);
    var dy = v - Math.pow(Math.sin(th), p);
    return dx * dx + dy * dy;
  }

  /* sdBox asks once per corner pixel, and a bake asks for one n: answer a
     repeat without the key string and the map lookup (≈1.5 ms a tile bake) */
  var lastN = NaN, lastField = null;
  function unitCornerField(n) {
    if (n === lastN) return lastField;
    var key = n.toFixed(3);
    var hit = fieldCache.get(key);
    if (hit) { lastN = n; lastField = hit; return hit; }
    var N = FIELD_N, g = new Float32Array((N + 1) * (N + 1)), p = 2 / n;
    for (var j = 0; j <= N; j++) {
      var v = j / N * FIELD_EXT;
      for (var i = 0; i <= N; i++) {
        var u = i / N * FIELD_EXT;
        var d = nearestOnUnitCorner(u, v, p);
        g[j * (N + 1) + i] = (Math.pow(u, n) + Math.pow(v, n) <= 1) ? -d : d;
      }
    }
    if (fieldCache.size > 24) fieldCache.delete(fieldCache.keys().next().value);
    fieldCache.set(key, g);
    lastN = n; lastField = g;
    return g;
  }

  function sampleUnit(g, u, v) {
    var N = FIELD_N, E = FIELD_EXT;
    u = u < 0 ? 0 : u > E - 1e-6 ? E - 1e-6 : u;
    v = v < 0 ? 0 : v > E - 1e-6 ? E - 1e-6 : v;
    var fx = u / E * N, fy = v / E * N;
    var x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    var a = g[y0 * (N + 1) + x0],       b = g[y0 * (N + 1) + x0 + 1];
    var c = g[(y0 + 1) * (N + 1) + x0], d = g[(y0 + 1) * (N + 1) + x0 + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  function sdBox(px, py, hw, hh, r, n) {
    /* A concave corner (n < 1) has no inward, so no bevel: clamp rather than
       let outline and material disagree silently. */
    if (!(n >= 1)) n = 1;
    var qx = Math.abs(px) - (hw - r);
    var qy = Math.abs(py) - (hh - r);
    var ax = qx > 0 ? qx : 0;
    var ay = qy > 0 ? qy : 0;
    var outer;
    if (ax === 0 && ay === 0) outer = 0;
    else if (ax === 0 || ay === 0) outer = ax + ay;          /* on a flat run   */
    else if (n >= 1e5) outer = Math.max(ax, ay);              /* square corner   */
    else if (Math.abs(n - 2) < 1e-6) outer = Math.hypot(ax, ay); /* circle, exact */
    else outer = sampleUnit(unitCornerField(n), ax / r, ay / r) * r + r;
    /* outer + inner − r: dropping the −r sits the bevel one radius too far in
       and still renders, which is why it survives review. */
    return outer + Math.min(Math.max(qx, qy), 0) - r;
  }

  /* A hard min() creases where two shapes meet; this blends them over k, which
     is the meniscus. Two shapes a gap g apart bridge exactly when k ≥ 2g. */
  function smin(a, b, k) {
    if (k <= 0) return Math.min(a, b);
    var h = 0.5 + 0.5 * (b - a) / k;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    return b * (1 - h) + a * h - k * h * (1 - h);
  }

  function fieldAt(px, py, shapes, k, n) {
    var s0 = shapes[0];
    var d = sdBox(px - s0.cx, py - s0.cy, s0.hw, s0.hh, s0.r, s0.n != null ? s0.n : n);
    for (var i = 1; i < shapes.length; i++) {
      var s = shapes[i];
      d = smin(d, sdBox(px - s.cx, py - s.cy, s.hw, s.hh, s.r, s.n != null ? s.n : n), k);
    }
    return d;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     3. CONCENTRICITY — r_inner = r_outer − gap; a capsule's child is a capsule;
     a negative result floors at `minimum` (the `.concentric(minimum:)`).
     ───────────────────────────────────────────────────────────────────────── */
  function concentric(outerR, gap, opts) {
    opts = opts || {};
    var min = opts.minimum != null ? opts.minimum : 6;
    if (opts.outerIsCapsule) return { capsule: true, r: Infinity };
    return { capsule: false, r: Math.max(min, outerR - gap) };
  }

  function measureGap(innerEl, outerEl) {
    var a = innerEl.getBoundingClientRect(), b = outerEl.getBoundingClientRect();
    if (!a.width || !b.width) return null;
    return Math.max(0, Math.min(
      a.left - b.left, b.right - a.right, a.top - b.top, b.bottom - a.bottom));
  }

  function isCapsule(w, h, r) { return r >= Math.min(w, h) / 2 - 0.5; }

  /* ─────────────────────────────────────────────────────────────────────────
     4. CONTINUOUS CORNERS, CALIBRATED

     THE TARGET CORNER. A continuous corner is not a Lamé curve. Its published
     path is: each corner is a circular
     arc of radius ≈ 0.9958 r centred at (r, r), eased into both edges by a
     cubic, so the curve STARTS 1.52866 r from the corner instead of at r.
     The constants below are that published path, top-right corner, in units
     of r, x measured inward from the vertical edge and y down from the top.
     Design tools offer a corner-smoothing setting of the same kind (60%: same
     arc, curve extent 1.6 r, diagonal inset 0.2929 r).

     WHAT A CIRCLE OR A PLAIN SQUIRCLE DRAWS, AND WHY IT READS WRONG.
       continuous, r        inset 0.2915 r   extent 1.529 r
       border-radius r (circle) inset 0.2929 r   extent 1.000 r
       superellipse(2) at r     inset 0.1591 r   extent 1.000 r   ← plain squircle
     A squircle with circle-sized radii carries about
     half the mass.

     THE FIT. Two properties decide how a corner reads: how far it cuts in
     along the 45° diagonal (its mass) and where the bend begins (onset). A
     superellipse of exponent n at radius R has inset R(1 − 2^(−1/n)) and onset
     R, so two equations, two unknowns:
         R = 1.52866 r                         (onset)
         1 − 2^(−1/n) = 0.291507 / 1.52866     (inset)  →  n = 3.2761, k = 1.7120
     Over the WHOLE corner that curve stays within 0.0114 r of the target
     (Hausdorff) — 0.50 px at r = 44. A circle of the same nominal radius is
     about as close in POSITION (two-way distance ≈ 0.0125 r, 0.35 px at
     r = 28); its 0.53 r (1.52866 r − r) is the ONSET offset — its bend starts
     that much nearer the corner. What reads wrong is curvature: the circle
     jumps from 0 to 1/r at its onset, the target eases in; the fit keeps both
     the onset and the eased entry. Tokens round to k = 1.71, rScale = 1.53,
     which moves the inset by 0.0004 r (0.02 px at r = 44).

     A CAPSULE IS NOT A CORNER. The capsule is r = h/2 with true semicircle
     ends; scaling it by 1.53 and squircling it reads as a lozenge. continuous()
     returns k = 1 at h/2 whenever the calibrated radius would reach the ends.
     ───────────────────────────────────────────────────────────────────────── */
  var CONT_E = 1.52866483;
  var CONT_SEGS = [                          /* [type, p0, (c1, c2,) p1] units of r */
    ['C', [CONT_E, 0], [1.08849323, 0], [0.86840689, 0], [0.66993427, 0.06549600]],
    ['L', [0.66993427, 0.06549600], [0.63149399, 0.07491100]],
    ['C', [0.63149399, 0.07491100], [0.37282392, 0.16905899], [0.16906013, 0.37282401], [0.07491176, 0.63149399]],
    ['L', [0.07491176, 0.63149399], [0.06549600, 0.66993427]],
    ['C', [0.06549600, 0.66993427], [0, 0.86840701], [0, 1.08849299], [0, CONT_E]]
  ];
  var CONT_INSET = 0.291506993;              /* diagonal point, measured off the path */
  var N_EXACT = 1 / -Math.log2(1 - CONT_INSET / CONT_E);
  var CONTINUOUS = {
    k: 1.71, rScale: 1.53,
    kExact: Math.log2(N_EXACT), rScaleExact: CONT_E,
    insetPerR: CONT_INSET, extentPerR: CONT_E, hausdorffPerR: 0.0114,
    source: 'a published continuous-corner path: a circular arc eased into both edges by a cubic'
  };

  function bez(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  }

  function contCorner(r, per) {
    per = per || 32;
    var out = [], s, i, t, p;
    for (s = 0; s < CONT_SEGS.length; s++) {
      var g = CONT_SEGS[s];
      for (i = s ? 1 : 0; i <= per; i++) {
        t = i / per;
        p = g[0] === 'C' ? bez(g[1], g[2], g[3], g[4], t)
          : [g[1][0] + (g[2][0] - g[1][0]) * t, g[1][1] + (g[2][1] - g[1][1]) * t];
        out.push({ x: p[0] * r, y: p[1] * r });
      }
    }
    return out;
  }

  /* The full rect, exact cubics, not a polyline. The radius is limited so the 1.53 r extent fits the short side. */
  function contPath(w, h, r) {
    r = Math.min(r, Math.min(w, h) / 2 / CONT_E);
    function P(cx, cy, sx, sy, q) { return (cx + sx * q[0] * r).toFixed(3) + ' ' + (cy + sy * q[1] * r).toFixed(3); }
    /* each corner: (sx, sy) point x/y AWAY from the corner vertex (cx, cy) */
    function corner(cx, cy, sx, sy, swap) {
      var d = '';
      CONT_SEGS.forEach(function (g) {
        var q = g.slice(1).map(function (p) { return swap ? [p[1], p[0]] : p; });
        d += g[0] === 'C' ? ' C' + P(cx, cy, sx, sy, q[1]) + ' ' + P(cx, cy, sx, sy, q[2]) + ' ' + P(cx, cy, sx, sy, q[3])
                          : ' L' + P(cx, cy, sx, sy, q[1]);
      });
      return d;
    }
    var e = CONT_E * r;
    return 'M' + e.toFixed(3) + ' 0' +
      ' L' + (w - e).toFixed(3) + ' 0' + corner(w, 0, -1, 1, false) +
      ' L' + w + ' ' + (h - e).toFixed(3) + corner(w, h, -1, -1, true) +
      ' L' + e.toFixed(3) + ' ' + h + corner(0, h, 1, -1, false) +
      ' L0 ' + e.toFixed(3) + corner(0, 0, 1, 1, true) + ' Z';
  }

  function superellipseInset(R, k) { return R * (1 - Math.pow(2, -1 / expFromK(k))); }
  function contInset(r) { return CONT_INSET * r; }

  function continuous(r, w, h) {
    var R = r * CONTINUOUS.rScale;
    if (w != null && h != null && R >= Math.min(w, h) / 2 - 0.5) {
      return { radius: Math.min(w, h) / 2, k: 1, capsule: true };
    }
    return { radius: R, k: CONTINUOUS.k, capsule: false };
  }

  global.GEOM = {
    SUPPORTS_CORNER_SHAPE: SUPPORTS_CORNER_SHAPE,
    KEYWORDS: KEYWORDS,
    resolveK: resolveK,
    expFromK: expFromK,
    outline: outline,
    clipPath: clipPath,
    normRadii: normRadii,
    sdBox: sdBox,
    smin: smin,
    fieldAt: fieldAt,
    concentric: concentric,
    measureGap: measureGap,
    isCapsule: isCapsule,
    unitCornerField: unitCornerField,
    warm: function (ns) { (ns || [4]).forEach(function (n) { if (Math.abs(n - 2) > 1e-6) unitCornerField(n); }); },
    CONTINUOUS: CONTINUOUS,
    continuous: continuous,
    contCorner: contCorner,
    contPath: contPath,
    superellipseInset: superellipseInset,
    contInset: contInset
  };
})(typeof window !== 'undefined' ? window : globalThis);
