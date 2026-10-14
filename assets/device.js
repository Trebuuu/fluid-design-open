/* ═══════════════════════════════════════════════════════════════════════════
   device.js — DEVICE: our own device frames for presenting live mockups.
   ───────────────────────────────────────────────────────────────────────────
   Four frames drawn in CSS (fg3-device.css), never vendor imagery:
     phone    slab, continuous 55u display corners, thin bezel, camera pill, keys
     duo      a BOOK foldable: two panels on a vertical hinge; an inner
              display across both (760 × 608 ≈ 1.25:1, the 7.6" class) and an
              outer display on the back of the leaf (362 × 608)
     laptop   lid + base            browser   window, neutral dots, address
   Screen slots take LIVE DOM. `data-screen-width="402"` lays the content out
   at 402 logical px and scales it to the slot (transform + ResizeObserver).

   PUBLIC API  (one global, DEVICE; mounted by FG3.boot → DEVICE.mount)
     DEVICE.mount(root?)          build every .device and .device-fold-slider under
                                  root (default document). Idempotent.
     DEVICE.fold(el, to, opts?)   animate a duo to `to` = 0..1 (slider position) or
                                  'closed'|'tent'|'laptop'|'open'. opts: {spring:
                                  {duration,bounce}, immediate}. The curve comes from
                                  SPRING.Spring(cfg).linearFrom(x, v, target) when the spring engine's
                                  spring.js is loaded, else the same closed form here;
                                  played as a CSS linear() on the compositor (WAAPI),
                                  seeded with the current velocity when it interrupts.
                                  Reduced motion: jumps. Returns a Promise (settled).
     DEVICE.set(el, v)            jump to v, no animation (e.g. a scroll scene driving
                                  the fold itself).
     DEVICE.value(el) / .state(el) / .angle(v) / .valueForAngle(deg)
     DEVICE.slider(sliderEl, deviceEl?)  bind a fold slider (mount() does this for
                                  .device-fold-slider[data-for=<duo id>], or the
                                  nearest duo in an ancestor). The element is emptied
                                  and rebuilt: __track, __rail > __thumb[role=slider]
                                  > __skin + __glyph. INPUT: MOTION.detent(rail, …) when
                                  motion.js is loaded (it then owns aria-valuetext,
                                  "33%, half open"), else the simulator below ("half
                                  open"). Rendering is ours either way.
     DEVICE.fit(root?)            re-measure screen scaling (normally automatic).
     DEVICE.pose(v)               the per-part pose for a value (for tests / scenes).
     DEVICE.DETENTS [0, 1/3, 1]   DEVICE.STATES {closed, tent, laptop, open}
     DEVICE.SPRINGS {hinge, follow, stretch}   DEVICE.MAGNET {radius, strength}
   EVENTS on the device:  'device:fold' {value, angle, state, settled} — EVERY FRAME
                          while moving and once at rest: keep listeners cheap (a
                          listener that writes text relayouts the page per frame).
   ATTRIBUTES written:    data-device-ready, data-device-state (duo), .is-split on
                          the inner screen while the leaf is off the flat, inert +
                          aria-hidden on whichever display faces away.
   MEASURED: one Layout per whole fold
   (the snapshot appearing), none per frame; ~22 paints per fold.

   THE FOLD, measured:
     · slider detents 0 / ⅓ / 1 (closed / landing / open); a
       magnet within .08 of a detent holds the target there with strength .8
     · the hinge simulator is {duration .7, bounce 0}; the drag follows on the
       detent-slider editor default {.4, .4}; fixed 60 Hz semi-implicit Euler
       with accumulator + interpolation, as a fixed-step spring layer
     · the thumb stretches by decay(|stretch − pos|, 28px) and squashes
       scaleY(1 − .0025t), anchored on the trailing side
     · ⅓ is the "landing" pose, ~120° interior (measured off the landing frame:
       the leaf foreshortens to cos ≈ .5), so value → angle is a monotone
       cubic through (0, 0°), (⅓, 120°), (1, 180°), not a straight line.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc) return;

  var DETENTS = [0, 1 / 3, 1];
  var MAGNET = { radius: 0.08, strength: 0.8 };
  var SPRINGS = {
    hinge:   { duration: 0.7, bounce: 0 },     /* the detent-slider constructor */
    follow:  { duration: 0.4, bounce: 0.4 },   /* its editor default: the drag feel */
    stretch: { duration: 0.2, bounce: 0 }      /* the rubber band chasing the finger */
  };
  var STRETCH_MAX = 28, SQUASH = 0.0025, DECEL = 0.998;
  /* State by interior angle (deg). ⅓ = 120° lands in 'laptop'. */
  var STATE_ANGLES = { closed: 0, tent: 70, laptop: 120, open: 180 };
  var STEP = 1 / 60;
  var RAD = Math.PI / 180;
  /* Light from the upper left, a little in front: the metal and the swatch
     rings use the same convention. */
  var L = (function (x, y, z) { var n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })(-0.45, 0, 1);

  var GEO = {
    phone: { keys: [['start', 170, 30], ['start', 232, 62], ['start', 308, 62], ['end', 262, 98]] },
    duo: { keys: [['end', 118, 54], ['end', 186, 96]] },
    laptop: {}, browser: {}
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mk(tag, cls, parent) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  function reduced() {
    var h = doc.documentElement;
    if (h.classList.contains('reduced-motion')) return true;
    try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function now() { return global.performance ? performance.now() : Date.now(); }

  /* ── value → hinge angle ────────────────────────────────────────────────
     Monotone cubic (Fritsch–Carlson tangents) through the three poses, so a
     drag through ⅓ has no speed kink. Knots: f 0, ⅓, 1 → α 0, 120, 180. */
  var KX = [0, 1 / 3, 1], KY = [0, 120, 180], KM = [450, 154.3, 90];
  function interior(f) {
    f = clamp(f, 0, 1);
    var i = f < KX[1] ? 0 : 1, h = KX[i + 1] - KX[i], t = (f - KX[i]) / h;
    var t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * KY[i] + (t3 - 2 * t2 + t) * h * KM[i] +
           (-2 * t3 + 3 * t2) * KY[i + 1] + (t3 - t2) * h * KM[i + 1];
  }
  function valueForAngle(a) {                      /* inverse by bisection */
    var lo = 0, hi = 1;
    for (var k = 0; k < 40; k++) { var m = (lo + hi) / 2; if (interior(m) < a) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  var STATES = {};
  Object.keys(STATE_ANGLES).forEach(function (k) { STATES[k] = k === 'laptop' ? 1 / 3 : valueForAngle(STATE_ANGLES[k]); });
  function stateOf(f) {
    var a = interior(f);
    return a < 12 ? 'closed' : a < 90 ? 'tent' : a < 170 ? 'laptop' : 'open';
  }
  function valueText(f) {
    for (var i = 0; i < DETENTS.length; i++) {
      if (Math.abs(f - DETENTS[i]) < 0.02) return ['closed', 'half open', 'open'][i];
    }
    return Math.round(f * 100) + '% open';
  }

  /* ── the pose: everything the fold changes, as transform/opacity only ─── */
  function pose(f) {
    var th = 180 - interior(f), t = th * RAD, s = Math.sin(t), c = Math.cos(t);
    var lamIn = Math.max(0, s * L[0] + c * L[2]) / L[2];
    var lamOut = Math.max(0, -s * L[0] - c * L[2]) / L[2];
    var uIn = clamp(th / 90, 0, 1), uOut = clamp((th - 90) / 90, 0, 1);
    return {
      theta: th,
      shift: -25 * (1 - c) / 2,                          /* keep the visible device centred */
      shadeIn: 0.42 * (1 - Math.min(1, lamIn)),
      shadeOut: 0.4 * (1 - Math.min(1, lamOut)),
      sheenIn: { x: -100 + 200 * uIn, o: th < 90 ? 0.9 * Math.sin(Math.PI * uIn) : 0 },
      sheenOut: { x: 100 - 200 * uOut, o: th > 90 ? 0.8 * Math.sin(Math.PI * uOut) : 0 },
      sheenEnd: { x: 100 - 200 * clamp(f, 0, 1), o: 0.45 * Math.sin(Math.PI * clamp(f, 0, 1)) },
      /* Hinge shading while the leaf is off the flat; it fades out over the
         last stretch of travel and is 0 from .98 on, so a fully open duo
         shows its display, not a 26%-wide band across a light UI. */
      crease: (0.1 + 0.6 * (th <= 90 ? s : 1)) * clamp((0.98 - f) / 0.08, 0, 1),
      leafSX: Math.abs(c) < 0.001 ? 0.001 : c,          /* shadow footprint flips over the hinge */
      leafY: 3.5 + 4 * s,
      leafO: 1 - 0.55 * s
    };
  }
  function f3(v) { return Math.round(v * 1000) / 1000; }
  function styles(P) {
    return {
      leaf: { transform: 'rotateY(' + f3(P.theta) + 'deg)' },
      rig: { translate: f3(P.shift) + '% 0' },
      ground: { translate: f3(P.shift) + '% 0' },
      shadeIn: { opacity: f3(P.shadeIn) },
      shadeOut: { opacity: f3(P.shadeOut) },
      sheenIn: { transform: 'translateX(' + f3(P.sheenIn.x) + '%)', opacity: f3(P.sheenIn.o) },
      sheenOut: { transform: 'translateX(' + f3(P.sheenOut.x) + '%)', opacity: f3(P.sheenOut.o) },
      sheenEnd: { transform: 'translateX(' + f3(P.sheenEnd.x) + '%)', opacity: f3(P.sheenEnd.o) },
      crease: { opacity: f3(P.crease) },
      shadowLeaf: { transform: 'scaleX(' + f3(P.leafSX) + ')', translate: '0 ' + f3(P.leafY) + '%', opacity: f3(P.leafO) }
    };
  }
  var MOVING = { leaf: 'transform', rig: 'translate', ground: 'translate', shadeIn: 'opacity', shadeOut: 'opacity',
    sheenIn: 'transform, opacity', sheenOut: 'transform, opacity', sheenEnd: 'transform, opacity', crease: 'opacity',
    shadowLeaf: 'transform, translate, opacity' };

  /* ── spring maths ──────────────────────────────────────────────────────
     Prefer SPRING — same (duration, bounce) → (k, c) conversion.
     The fallback below is the closed form from arbitrary (x0, v0), so an
     interruption hands its velocity on. */
  function ownSpring(cfg) {
    var d = cfg.duration, b = cfg.bounce || 0;
    var z = b >= 0 ? 1 - b : 1 / (1 + b), w = 2 * Math.PI / d;
    function solve(u0, v0) {
      if (z < 1) {
        var wd = w * Math.sqrt(1 - z * z), c2 = (v0 + z * w * u0) / wd;
        return {
          at: function (t) { return Math.exp(-z * w * t) * (u0 * Math.cos(wd * t) + c2 * Math.sin(wd * t)); },
          vel: function (t) {
            var e = Math.exp(-z * w * t), co = Math.cos(wd * t), si = Math.sin(wd * t);
            return e * (-z * w * (u0 * co + c2 * si) + (-u0 * wd * si + c2 * wd * co));
          }
        };
      }
      if (z < 1 + 1e-9) {
        var k = v0 + w * u0;
        return {
          at: function (t) { return Math.exp(-w * t) * (u0 + k * t); },
          vel: function (t) { return Math.exp(-w * t) * (k - w * (u0 + k * t)); }
        };
      }
      var r = w * Math.sqrt(z * z - 1), a = -z * w + r, bb = -z * w - r;
      var B = (a * u0 - v0) / (a - bb), A = u0 - B;
      return {
        at: function (t) { return A * Math.exp(a * t) + B * Math.exp(bb * t); },
        vel: function (t) { return A * a * Math.exp(a * t) + B * bb * Math.exp(bb * t); }
      };
    }
    return {
      from: function (x0, v0, target) {
        var s = solve(x0 - target, v0 || 0), span = Math.abs(target - x0) || 1;
        /* settle = start of the last run inside ±0.2% of the travel */
        var dt = 1 / 240, quiet = -1, T = 0;
        for (var t = 0; t < 6; t += dt) {
          if (Math.abs(s.at(t)) / span <= 0.002 && Math.abs(s.vel(t)) / span < 0.05) {
            if (quiet < 0) quiet = t;
            if (t - quiet > 0.12) { T = quiet; break; }
          } else quiet = -1;
          T = t;
        }
        return { at: function (t) { return target + s.at(t); }, vel: s.vel, target: target, settlingDuration: T };
      }
    };
  }
  /* The curve for one move: {easing, T (s), at(t), vel(t)}. SPRING's
     linearFrom when spring is loaded (one source of truth for every spring on the
     page); otherwise the same closed form and sampling here. */
  function curve(cfg, x0, v0, target) {
    var S = global.SPRING;
    if (S && typeof S.Spring === 'function') {
      try {
        var r = S.Spring(cfg).linearFrom(x0, v0, target);
        if (r && r.easing && r.at) return { easing: r.easing, T: r.settlingDuration, at: r.at, vel: r.vel };
      } catch (e) { /* fall through to our own */ }
    }
    var sol = ownSpring(cfg).from(x0, v0, target), T = Math.max(0.05, sol.settlingDuration || 0.7);
    return { easing: linearOf(sol, x0, target, T), T: T, at: sol.at, vel: sol.vel };
  }
  /* A CSS linear() of the normalised progress, dense early (a spring does its
     work in the first third). Value and position share the warped q. */
  function linearOf(sol, x0, target, T) {
    var span = target - x0, out = [], n = 40;
    for (var i = 0; i <= n; i++) {
      var p = i / n, t = Math.pow(p, 1.65) * T;
      var q = i === n ? 1 : (sol.at(t) - x0) / span;
      out.push(q.toFixed(4) + ' ' + (Math.pow(p, 1.65) * 100).toFixed(2) + '%');
    }
    return 'linear(' + out.join(',') + ')';
  }
  function kc(cfg) {                               /* k = (2π/d)², c = (1−b)·4π/d */
    return { k: Math.pow(2 * Math.PI / cfg.duration, 2), c: (1 - (cfg.bounce || 0)) * 4 * Math.PI / cfg.duration };
  }

  /* ── screens: logical width, scaled to the slot ─────────────────────── */
  var RO = global.ResizeObserver ? new ResizeObserver(function (entries) {
    entries.forEach(function (e) { layoutScreen(e.target, e.contentRect.width, e.contentRect.height); });
  }) : null;

  function layoutScreen(screen, w, h) {
    var W = parseFloat(screen.getAttribute('data-screen-width'));
    var vp = screen.__vp;
    if (vp && W && w) {
      var s = w / W;
      vp.style.width = W + 'px';
      vp.style.height = (h / s).toFixed(2) + 'px';
      vp.style.transform = 'scale(' + s.toFixed(5) + ')';
      screen.style.setProperty('--screen-scale', s.toFixed(5));
      if (screen.__mirror) syncMirrorScale(screen);
    }
    var G = global.GEOM;
    if (G && G.SUPPORTS_CORNER_SHAPE === false && typeof G.clipPath === 'function' && screen.__radius) {
      /* No corner-shape (Safari/Firefox today): cut the DISPLAY to the
         continuous corner with GEOM's calibrated k / r-scale. The radius goes
         to 0 under the clip — a squircle clip over a circular radius is still
         a circle (FG3 §3). Frames keep their circular radius instead (same
         45° mass): a clip would cut away their keys and shadows. */
      try {
        var C = G.CONTINUOUS || { k: 1.71, rScale: 1.53 }, R = screen.__radius;
        var u = parseFloat(getComputedStyle(screen.closest('.device')).width) / screen.__lw * C.rScale;
        screen.__cornerClip = G.clipPath(w, h, { tl: R[0] * u, tr: R[1] * u, br: R[2] * u, bl: R[3] * u }, C.k);
        if (!screen.__split) { screen.style.borderRadius = '0'; screen.style.clipPath = screen.__cornerClip; }
      } catch (e) { /* keep the circular radius */ }
    }
  }

  function prepScreen(screen, ctx, radius) {
    screen.__lw = ctx.lw;
    screen.__radius = radius;
    var W = parseFloat(screen.getAttribute('data-screen-width'));
    if (W && !screen.__vp) {
      var vp = mk('div', 'device__viewport');
      while (screen.firstChild) vp.appendChild(screen.firstChild);
      screen.appendChild(vp);
      screen.__vp = vp;
    }
    if (RO) RO.observe(screen);
    else layoutScreen(screen, screen.clientWidth, screen.clientHeight);
  }
  function hostOf(screen) { return screen.__vp || screen; }
  function ensureIsland(screen, ctx) {
    if (ctx.el.getAttribute('data-island') === 'none') return;
    var host = hostOf(screen);
    var isl = screen.querySelector('.device__island');
    if (!isl) isl = mk('div', 'device__island');
    if (isl.parentNode !== host) host.appendChild(isl);
    if (isl.childElementCount) isl.removeAttribute('aria-hidden'); else isl.setAttribute('aria-hidden', 'true');
  }
  function addKeys(list, parent) {
    (list || []).forEach(function (k) {
      var i = mk('i', 'device__key');
      i.setAttribute('data-side', k[0]);
      i.style.setProperty('--key-y', k[1]);
      i.style.setProperty('--key-h', k[2]);
      parent.insertBefore(i, parent.firstChild);
    });
  }
  function screensOf(el) {
    return [].filter.call(el.children, function (c) { return c.classList.contains('device__screen'); });
  }

  /* ── builders ─────────────────────────────────────────────────────────── */
  function buildPhone(ctx) {
    var el = ctx.el, screen = screensOf(el)[0] || mk('div', 'device__screen', el);
    var frame = mk('div', 'device__frame');
    el.insertBefore(frame, el.firstChild);
    addKeys(GEO.phone.keys, el);
    mk('div', 'device__glare', el);
    prepScreen(screen, ctx, [55, 55, 55, 55]);
    ensureIsland(screen, ctx);
  }

  function buildLaptop(ctx) {
    var el = ctx.el, screen = screensOf(el)[0] || mk('div', 'device__screen', el);
    el.insertBefore(mk('div', 'device__base'), el.firstChild);
    el.insertBefore(mk('div', 'device__lid'), el.firstChild);
    prepScreen(screen, ctx, [10, 10, 2, 2]);
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function glyph(d, cls) {
    var s = doc.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    var p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }
  function buildBrowser(ctx) {
    var el = ctx.el, screen = screensOf(el)[0] || mk('div', 'device__screen', el);
    var win = mk('div', 'device__window');
    var bar = mk('div', 'device__toolbar');
    bar.setAttribute('aria-hidden', 'true');
    var dots = mk('span', 'device__dots', bar);
    mk('i', '', dots); mk('i', '', dots); mk('i', '', dots);
    var nav = mk('span', 'device__nav', bar);
    nav.appendChild(glyph('M10 3 5 8l5 5'));
    nav.appendChild(glyph('M6 3l5 5-5 5'));
    var url = mk('span', 'device__url', bar);
    url.appendChild(glyph('M4.5 7.5h7v5.5h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2'));
    url.appendChild(doc.createTextNode(el.getAttribute('data-url') || 'fluid.example'));
    el.insertBefore(bar, el.firstChild);
    el.insertBefore(win, el.firstChild);
    prepScreen(screen, ctx, [0, 0, 18, 18]);
  }

  function buildDuo(ctx) {
    var el = ctx.el, list = screensOf(el);
    var inner = list.filter(function (s) { return s.getAttribute('data-screen') === 'inner'; })[0] ||
                list.filter(function (s) { return !s.getAttribute('data-screen'); })[0];
    var outer = list.filter(function (s) { return s.getAttribute('data-screen') === 'outer'; })[0];
    if (!inner) inner = mk('div', 'device__screen');
    if (!outer) outer = mk('div', 'device__screen');
    inner.setAttribute('data-screen', 'inner');
    outer.setAttribute('data-screen', 'outer');

    var P = {};
    var ground = P.ground = mk('div', 'device__ground');
    mk('i', 'device__shadow device__shadow--base', ground);
    P.shadowLeaf = mk('i', 'device__shadow device__shadow--leaf', ground);
    var camera = mk('div', 'device__camera');
    var rig = P.rig = mk('div', 'device__rig', camera);
    var end = mk('div', 'device__panel device__panel--end', rig);
    mk('div', 'device__face device__face--inner', end);
    addKeys(GEO.duo.keys, end);
    var leaf = P.leaf = mk('div', 'device__panel device__panel--start', rig);
    var faceIn = mk('div', 'device__face device__face--inner', leaf);
    P.mirror = mk('div', 'device__mirror', faceIn);
    P.mirror.hidden = true;
    P.mirror.setAttribute('aria-hidden', 'true');
    P.sheenIn = mk('i', 'device__sheen', faceIn);
    P.shadeIn = mk('i', 'device__shade', faceIn);
    var faceOut = mk('div', 'device__face device__face--outer', leaf);
    faceOut.appendChild(outer);
    P.sheenOut = mk('i', 'device__sheen', faceOut);
    P.shadeOut = mk('i', 'device__shade', faceOut);
    mk('i', 'device__edge', leaf);
    rig.appendChild(inner);
    el.appendChild(ground);
    el.appendChild(camera);

    prepScreen(inner, ctx, [32, 32, 32, 32]);
    prepScreen(outer, ctx, [6, 32, 32, 6]);
    ensureIsland(outer, ctx);
    P.sheenEnd = mk('i', 'device__sheen', inner);
    P.crease = mk('i', 'device__crease', inner);

    var ctl = ctx.fold = {
      el: el, parts: P, inner: inner, outer: outer,
      value: 1, anim: null, sim: null, sliders: [], state: '', split: false, waiters: []
    };
    var start = el.getAttribute('data-device-state'), v = parseFloat(el.getAttribute('data-fold'));
    apply(ctl, STATES[start] != null ? STATES[start] : isFinite(v) ? clamp(v, 0, 1) : 1);
    rest(ctl);
  }

  /* ── applying a pose ─────────────────────────────────────────────────── */
  function write(node, st) { for (var k in st) node.style[k] = st[k]; }
  function apply(ctl, f) {
    f = clamp(f, 0, 1);
    var S = styles(pose(f)), P = ctl.parts;
    for (var k in S) write(P[k], S[k]);
    ctl.value = f;
    track(ctl, f);
  }
  /* Discrete consequences of a value: state attribute, the split, inert.
     Written only when they change, so a moving fold restyles nothing else. */
  function track(ctl, f) {
    var st = stateOf(f);
    if (st !== ctl.state) {
      ctl.state = st;
      ctl.el.setAttribute('data-device-state', st);
      setInert(ctl.inner, st === 'closed');
    }
    setInert(ctl.outer, interior(f) > 90);          /* the outer display faces away */
    /* Split as soon as the leaf leaves the flat; join only at REST on the flat
       (rest()), so a drag hovering at 1 does not rebuild the mirror per frame. */
    if (f < 0.999) split(ctl, true);
  }
  function rest(ctl) { if (ctl.value >= 0.999) split(ctl, false); }
  function commit(ctl, f) {
    apply(ctl, f);
    ctl.sliders.forEach(function (s) { s.render(ctl.value, ctl.value); });
  }
  function setInert(node, on) {
    if (!!node.inert === on && node.hasAttribute('aria-hidden') === on) return;
    node.inert = on;
    if (on) node.setAttribute('aria-hidden', 'true'); else node.removeAttribute('aria-hidden');
  }

  /* ── the split: a live display cannot bend, so the leaf shows a snapshot ──
     The inner display is ONE live subtree across both halves. While the leaf
     is off the flat, the live screen is clipped to the fixed half and the leaf
     carries a static clone of the whole display, positioned so its left half
     shows. Flat, the clone is pixel-aligned with the live screen, so the
     hand-over at 1 is invisible. The clone is refreshed (≤ 4/s) if the live
     content changes while folded. */
  function split(ctl, on) {
    if (on === ctl.split) return;
    ctl.split = on;
    var m = ctl.parts.mirror;
    var inner = ctl.inner;
    inner.__split = on;
    if (inner.__cornerClip) {                        /* fallback engines: the clip is inline, so is the split */
      inner.style.clipPath = on ? 'inset(0 0 0 50%)' : inner.__cornerClip;
      inner.style.borderRadius = on ? '' : '0';
    }
    if (on) {
      buildMirror(ctl);
      m.hidden = false;
      inner.classList.add('is-split');
      if (global.MutationObserver && !ctl.mo) {
        ctl.mo = new MutationObserver(function () {
          if (ctl.moT) return;
          ctl.moT = setTimeout(function () { ctl.moT = 0; if (ctl.split) buildMirror(ctl); }, 250);
        });
        ctl.mo.observe(hostOf(ctl.inner), { subtree: true, childList: true, characterData: true, attributes: true });
      }
    } else {
      ctl.inner.classList.remove('is-split');
      m.hidden = true;
      m.textContent = '';
      if (ctl.mo) { ctl.mo.disconnect(); ctl.mo = null; }
    }
  }
  /* A snapshot, not a second app: no ids, names, scripts or focus, and no
     entrance held for a sighting that a snapshot never gets (CHART's
     [data-chart-held] hides marks whose geometry is already final). `still`
     also drops what would load or play a second time (the GPU warm-up's
     copies, below). */
  function snapshot(src, still) {
    var clone = src.cloneNode(true);
    if (still) [].forEach.call(clone.querySelectorAll('iframe,video,audio,object,embed'), function (n) { n.remove(); });
    [clone].concat([].slice.call(clone.querySelectorAll('*'))).forEach(function (n) {
      n.removeAttribute('id'); n.removeAttribute('name'); n.removeAttribute('autofocus'); n.removeAttribute('data-chart-held');
      if (n.tabIndex >= 0 && n !== clone) n.setAttribute('tabindex', '-1');
    });
    [].forEach.call(clone.querySelectorAll('script'), function (s) { s.remove(); });
    var from = src.querySelectorAll('canvas'), to = clone.querySelectorAll('canvas');
    for (var i = 0; i < to.length && i < from.length; i++) {
      try { to[i].getContext('2d').drawImage(from[i], 0, 0); } catch (e) { /* tainted / webgl: leave blank */ }
    }
    var fv = src.querySelectorAll('input,textarea,select'), tv = clone.querySelectorAll('input,textarea,select');
    for (var j = 0; j < tv.length && j < fv.length; j++) { try { tv[j].value = fv[j].value; tv[j].checked = fv[j].checked; } catch (e) {} }
    return clone;
  }
  function buildMirror(ctl) {
    var src = hostOf(ctl.inner), m = ctl.parts.mirror;
    var wrap = mk('div', 'device__mirror-content');
    var clone = snapshot(src);
    wrap.appendChild(clone);
    wrap.inert = true;
    m.textContent = '';
    m.appendChild(wrap);
    ctl.inner.__mirror = wrap;
    syncMirrorScale(ctl.inner);
  }
  function syncMirrorScale(inner) {
    var wrap = inner.__mirror, vp = inner.__vp;
    if (!wrap || !vp || !wrap.firstChild) return;
    wrap.firstChild.style.transform = vp.style.transform;
    wrap.firstChild.style.height = vp.style.height;
  }

  function emit(ctl, settled) {
    var f = ctl.value;
    if (settled) ctl.sliders.forEach(function (s) { s.aria(f); });
    try {
      ctl.el.dispatchEvent(new CustomEvent('device:fold', {
        detail: { value: f, angle: interior(f), state: ctl.state, settled: !!settled }
      }));
    } catch (e) { /* old engines */ }
  }
  /* Promote exactly what moves, only while it moves (a layer per part is
     memory; at rest nothing needs one). */
  function willChange(ctl, on) {
    for (var k in MOVING) ctl.parts[k].style.willChange = on ? MOVING[k] : '';
    ctl.sliders.forEach(function (s) { s.hint(on); });
  }

  /* ── motion state: where the fold IS and how fast, whatever is driving it ── */
  function current(ctl) {
    if (ctl.anim) {
      var a = ctl.anim, t = Math.min(a.T, (a.list[0].currentTime || 0) / 1000);
      return { x: a.sol.at(t), v: a.sol.vel(t) };
    }
    if (ctl.sim) return { x: ctl.sim.x, v: ctl.sim.v };
    return { x: ctl.value, v: 0 };
  }
  function stop(ctl) {
    var c = current(ctl);
    if (ctl.anim) {
      var a = ctl.anim;
      ctl.anim = null;
      commit(ctl, c.x);                             /* commit inline first … */
      a.list.forEach(function (x) { x.cancel(); });  /* … then drop the animations: no flash */
      cancelAnimationFrame(a.raf);
    }
    if (ctl.sim) { cancelAnimationFrame(ctl.sim.raf); ctl.sim = null; }
    return c;
  }
  function settle(ctl) {
    willChange(ctl, false);
    rest(ctl);
    emit(ctl, true);
    var w = ctl.waiters; ctl.waiters = [];
    w.forEach(function (fn) { fn(ctl.value); });
  }

  /* Programmatic fold: sampled keyframes + a spring linear() on the
     compositor. Keyframes are linear in the VALUE; the spring lives in the
     easing, so every part moves on the same curve. */
  function animateTo(ctl, target, cfg) {
    target = clamp(target, 0, 1);
    var c = stop(ctl);
    var p = new Promise(function (res) { ctl.waiters.push(res); });
    if (reduced() || cfg.immediate || !ctl.el.animate) {
      commit(ctl, target); settle(ctl); return p;
    }
    if (Math.abs(target - c.x) < 1e-4) { commit(ctl, target); settle(ctl); return p; }
    var sol = curve(cfg.spring || SPRINGS.hinge, c.x, c.v, target), T = sol.T;
    var timing = { duration: T * 1000, easing: sol.easing, fill: 'both' };
    var N = 20, frames = {};
    for (var i = 0; i <= N; i++) {
      var q = i / N, S = styles(pose(c.x + (target - c.x) * q));
      for (var k in S) {
        (frames[k] = frames[k] || []).push(Object.assign({ offset: q }, S[k]));
      }
    }
    if (c.x < 0.999 || target < 0.999) split(ctl, true);
    willChange(ctl, true);
    var list = [];
    for (var name in frames) list.push(ctl.parts[name].animate(frames[name], timing));
    ctl.sliders.forEach(function (s) { list.push(s.animate(c.x, target, timing)); });
    var a = ctl.anim = { sol: sol, T: T, target: target, list: list, raf: 0 };
    (function watch() {
      if (ctl.anim !== a) return;
      var t = (list[0].currentTime || 0) / 1000;
      /* 'finished', not t >= T alone: T*1000/1000 can land a hair under T. */
      if (list[0].playState === 'finished' || t >= T - 1e-4) {
        ctl.anim = null;
        commit(ctl, target);
        list.forEach(function (x) { x.cancel(); });
        settle(ctl);
        return;
      }
      ctl.value = clamp(sol.at(t), 0, 1);
      track(ctl, ctl.value);
      emit(ctl, false);
      a.raf = requestAnimationFrame(watch);
    })();
    return p;
  }

  /* ── drag: the detent simulator, fixed 60 Hz step ──────────────────── */
  function magnet(raw) {
    for (var i = 0; i < DETENTS.length; i++) {
      var d = raw - DETENTS[i];
      if (Math.abs(d) < MAGNET.radius) return DETENTS[i] + d * (1 - MAGNET.strength);
    }
    return raw;
  }
  function nearest(v) {
    return DETENTS.reduce(function (b, d) { return Math.abs(d - v) < Math.abs(b - v) ? d : b; }, DETENTS[0]);
  }
  function grab(ctl) {
    var c = stop(ctl);
    if (reduced()) { ctl.sim = null; ctl.rm = { raw: c.x }; return; }
    var a = kc(SPRINGS.follow), b = kc(SPRINGS.stretch);
    var sim = ctl.sim = {
      x: c.x, v: c.v, target: c.x, raw: c.x, sx: c.x, sv: 0, px: c.x, psx: c.x,
      k: a.k, c: a.c, k2: b.k, c2: b.c, acc: 0, last: now(), dragging: true, raf: 0
    };
    willChange(ctl, true);
    sim.raf = requestAnimationFrame(function loop(t) {
      if (ctl.sim !== sim) return;
      sim.acc += Math.min(1 / 30, (t - sim.last) / 1000);
      sim.last = t;
      while (sim.acc >= STEP) {
        sim.px = sim.x; sim.psx = sim.sx;
        sim.v += (-sim.k * (sim.x - sim.target) - sim.c * sim.v) * STEP;
        sim.x += sim.v * STEP;
        sim.sv += (-sim.k2 * (sim.sx - sim.raw) - sim.c2 * sim.sv) * STEP;
        sim.sx += sim.sv * STEP;
        sim.acc -= STEP;
      }
      var al = sim.acc / STEP;
      var x = sim.px + (sim.x - sim.px) * al, sx = sim.psx + (sim.sx - sim.psx) * al;
      apply(ctl, x);
      ctl.sliders.forEach(function (s) { s.render(x, sx); });
      emit(ctl, false);
      if (!sim.dragging && Math.abs(sim.x - sim.target) < 1e-4 && Math.abs(sim.v) < 1e-3 &&
          Math.abs(sim.sx - sim.target) < 1e-3) {
        ctl.sim = null;
        commit(ctl, sim.target);
        settle(ctl);
        return;
      }
      sim.raf = requestAnimationFrame(loop);
    });
  }
  function drag(ctl, raw) {
    if (ctl.rm) {                                    /* reduced motion: the pose jumps between detents */
      ctl.rm.raw = raw;
      ctl.sliders.forEach(function (s) { s.render(clamp(raw, 0, 1), clamp(raw, 0, 1)); });
      var d = nearest(raw);
      if (d !== ctl.value) { apply(ctl, d); emit(ctl, false); }
      return;
    }
    if (!ctl.sim) return;
    ctl.sim.raw = raw;
    ctl.sim.target = clamp(magnet(raw), 0, 1);
  }
  function release(ctl) {
    if (ctl.rm) {
      var d = nearest(ctl.rm.raw);
      ctl.rm = null;
      commit(ctl, d);
      settle(ctl);
      return;
    }
    var sim = ctl.sim;
    if (!sim) return;
    sim.dragging = false;
    /* Project where the flick would come to rest, then take the detent
       nearest THAT (UIScrollView's rate .998/ms) — not the one nearest the finger. */
    var landing = sim.x + (sim.v / 1000) * DECEL / (1 - DECEL);
    sim.target = sim.raw = nearest(landing);
  }

  /* ── the fold slider ─────────────────────────────────────────────────────
     Rendering is always ours (the thumb is drawn from the device's value, so
     a programmatic fold and a drag look the same). INPUT comes from
     MOTION.detent when the spring engine's motion.js is loaded — one detent behaviour across
     the system — and from the simulator above otherwise. */
  var LABELS = ['closed', 'half open', 'open'];
  function bindSlider(sl, dev) {
    if (sl.__slider) return sl.__slider;
    dev = dev || findDuo(sl);
    if (!dev) return null;
    if (!dev.__device) build(dev);
    var ctl = dev.__device && dev.__device.fold;
    if (!ctl) return null;

    sl.textContent = '';
    mk('div', 'device-fold-slider__track', sl);
    var rail = mk('div', 'device-fold-slider__rail', sl);        /* the thumb's travel: track minus a thumb */
    var thumb = mk('div', 'device-fold-slider__thumb', rail);
    var skin = mk('span', 'device-fold-slider__skin', thumb);
    var gl = glyph('M6.2 4.2 2.6 8l3.6 3.8M9.8 4.2l3.6 3.8-3.6 3.8', 'device-fold-slider__glyph');
    thumb.appendChild(gl);
    thumb.setAttribute('role', 'slider');
    thumb.tabIndex = 0;
    thumb.setAttribute('aria-valuemin', '0');
    thumb.setAttribute('aria-valuemax', '100');
    if (sl.hasAttribute('aria-labelledby')) thumb.setAttribute('aria-labelledby', sl.getAttribute('aria-labelledby'));
    else thumb.setAttribute('aria-label', sl.getAttribute('data-label') || 'Open and close');
    if (dev.id) thumb.setAttribute('aria-controls', dev.id);

    var TW = 60, travel = 1;
    function measure() { travel = Math.max(1, rail.clientWidth); }
    function draw(x, t, dir) {
      thumb.style.transform = 'translateX(' + (clamp(x, 0, 1) * travel).toFixed(2) + 'px)';
      skin.style.transform = 'translateX(' + (dir * t / 2).toFixed(2) + 'px) scale(' +
        ((TW + t) / TW).toFixed(4) + ',' + (1 - SQUASH * t).toFixed(4) + ')';
      gl.style.transform = 'translateX(' + (dir * t / 2).toFixed(2) + 'px)';
    }
    var M = global.MOTION && typeof global.MOTION.detent === 'function' ? global.MOTION : null;
    var det = null, guard = false;
    var api = {
      el: sl,
      /* x = fold value, sx = where the finger (stretch spring) is */
      render: function (x, sx) {
        var over = (sx - clamp(x, 0, 1)) * travel;
        draw(x, STRETCH_MAX * (1 - Math.exp(-Math.abs(over) / (2 * STRETCH_MAX))), over < 0 ? -1 : 1);
        if (det && !guard) { guard = true; try { if (det.setValue) det.setValue(x); else det.set(x, false); } catch (e) { /* keep ours */ } guard = false; }
      },
      animate: function (from, to, timing) {
        return thumb.animate([{ transform: 'translateX(' + (clamp(from, 0, 1) * travel).toFixed(2) + 'px)' },
                              { transform: 'translateX(' + (clamp(to, 0, 1) * travel).toFixed(2) + 'px)' }], timing);
      },
      hint: function (on) {
        thumb.style.willChange = skin.style.willChange = gl.style.willChange = on ? 'transform' : '';
      },
      aria: function (f) {
        if (det) return;                                         /* MOTION.detent owns aria when it drives */
        thumb.setAttribute('aria-valuenow', String(Math.round(f * 100)));
        thumb.setAttribute('aria-valuetext', valueText(f));
      }
    };
    measure();
    ctl.sliders.push(api);

    if (M) {
      det = M.detent(rail, { detents: DETENTS, value: nearest(ctl.value), thumb: thumb,
                             magnet: MAGNET, stretchMax: STRETCH_MAX, labels: LABELS });
      /* Follow MOTION's value and stretch each frame while it moves; the
         device takes the same value (the hinge reads the slider's
         simulator). Stops itself three still frames after release. */
      var raf = 0, last = NaN, still = 0;
      var follow = function () {
        raf = 0;
        var v = det.value, t = det.stretch || 0, dir = rail.style.getPropertyValue('--detent-dir').trim() === '-1' ? -1 : 1;
        var f = reduced() ? nearest(v) : clamp(v, 0, 1);
        if (f !== ctl.value) apply(ctl, f);
        draw(v, t, dir);
        emit(ctl, false);
        still = Math.abs(v - last) < 1e-5 && t < 0.05 && !rail.hasAttribute('data-m-dragging') ? still + 1 : 0;
        last = v;
        if (still >= 3) { draw(v, 0, 1); settle(ctl); return; }
        raf = requestAnimationFrame(follow);
      };
      var wake = function () {
        if (ctl.anim) stop(ctl);                                 /* a grab interrupts a programmatic fold */
        if (!raf) { willChange(ctl, true); still = 0; last = NaN; raf = requestAnimationFrame(follow); }
      };
      /* capture: before MOTION's own listeners, so it starts from where the fold IS */
      sl.addEventListener('pointerdown', function (e) { if (e.button === 0) { measure(); wake(); } }, true);
      sl.addEventListener('keydown', function (e) { if (/^(Arrow|Home$|End$|Page)/.test(e.key)) wake(); }, true);
      api.render(ctl.value, ctl.value);
    } else {
      api.render(ctl.value, ctl.value);
      api.aria(ctl.value);
      var rect = null, offset = 0, id = null;
      var raw = function (e) { return (e.clientX - offset - rect.left - TW / 2) / travel; };
      sl.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || id != null) return;
        measure();
        rect = sl.getBoundingClientRect();
        var tr = thumb.getBoundingClientRect();
        offset = thumb.contains(e.target) ? e.clientX - (tr.left + tr.width / 2) : 0;   /* 1:1 from the grab point */
        id = e.pointerId;
        try { sl.setPointerCapture(id); } catch (err) { /* synthetic pointer */ }
        sl.setAttribute('data-dragging', '');
        thumb.focus({ preventScroll: true });
        grab(ctl);
        drag(ctl, raw(e));
        e.preventDefault();
      });
      sl.addEventListener('pointermove', function (e) { if (e.pointerId === id) drag(ctl, raw(e)); });
      var up = function (e) {
        if (e.pointerId !== id) return;
        id = null;
        sl.removeAttribute('data-dragging');
        release(ctl);
      };
      sl.addEventListener('pointerup', up);
      sl.addEventListener('pointercancel', up);
      thumb.addEventListener('keydown', function (e) {
        var v = ctl.anim ? ctl.anim.target : nearest(current(ctl).x), i = DETENTS.indexOf(v), to = null;
        switch (e.key) {
          case 'ArrowRight': case 'ArrowUp': case 'PageUp': to = DETENTS[Math.min(DETENTS.length - 1, i + 1)]; break;
          case 'ArrowLeft': case 'ArrowDown': case 'PageDown': to = DETENTS[Math.max(0, i - 1)]; break;
          case 'Home': to = 0; break;
          case 'End': to = 1; break;
          default: return;
        }
        e.preventDefault();
        animateTo(ctl, to, {});
        api.aria(to);
      });
    }
    if (RO) new ResizeObserver(function () { measure(); if (!ctl.anim && !ctl.sim) draw(ctl.value, 0, 1); }).observe(sl);
    sl.__slider = api;
    return api;
  }
  function findDuo(sl) {
    var id = sl.getAttribute('data-for');
    if (id) return doc.getElementById(id);
    for (var n = sl.parentElement; n; n = n.parentElement) {
      var d = n.querySelector('.device[data-device="duo"]');
      if (d) return d;
    }
    return null;
  }

  /* ── GPU warm-up: compile a device's programs before it scrolls in ────────
     The hitch as a device first entered view (type #app 112–172 ms, index's
     hub phone 157–246, showcase's bento phone 140–147; style, layout and
     script ≈ 0) was the GPU process compiling SHADER PROGRAMS inside the tile
     raster: type's segment compiled 9 (154 ms in one RendererRasterWorker
     flush), 8 of them the device's — the continuous-corner slab under its
     gradients and shadows, the keys, the glare, and the screen's content
     drawn through the superellipse clip. LG3 §18 found and fixed the same
     for glass; this is its device half. One copy of each device, drawn once
     in idle time after mount, compiles them where nobody is looking.
     WHAT THE COPY NEEDS, measured (compiles left in the segment; the device
     hidden = the floor):
       · the whole device, content included — the frame alone left 3 of 9 on
         type (the text and fills under the display's corner), a full copy 1
         of 1 (= the floor);
       · its CONTEXT: the nearest ancestor that clips it with a shaped corner
         (index's hub phone sits in a superellipse bento tile and hangs out of
         it — every draw is a clipped variant) and the colour it is painted
         on. Index: a bare copy 16 of 19, clip alone 11, clip + ground 7–8
         (= the page with the real phone already seen once: 8);
       · opacity 1/255 and a copy that is its own device box, as LG3 §18.
     The deck is LG3's kind of deck ([data-lg3-warm] on <html>: outside FG3's
     body observer, and the glass engine ignores it), inert and aria-hidden;
     copies are snapshots (no ids, focus, scripts, frames or media), a few
     per three frames. A device already on screen is being drawn anyway and
     is skipped; one with no box (a closed tab) is kept for a later mount. */
  var WARM_ALPHA = String(1 / 255), WARM_BATCH = 3;
  var warmList = [], warmQueued = false, warmRunning = false, warmAgain = false, warmWake = false;
  function idle(fn, timeout) {
    if (global.requestIdleCallback) return global.requestIdleCallback(fn, { timeout: timeout });
    return setTimeout(fn, 32);
  }
  function queueWarm(el) {
    if (el && warmList.indexOf(el) < 0) warmList.push(el);
    if (warmRunning) { warmAgain = true; return; }
    if (warmQueued || !global.requestAnimationFrame) return;
    warmQueued = true;
    idle(function () {
      warmQueued = false;
      if (doc.visibilityState === 'hidden') {           /* nothing is drawn: wait to be seen */
        if (!warmWake) {
          warmWake = true;
          doc.addEventListener('visibilitychange', function wake() {
            if (doc.visibilityState === 'hidden') return;
            doc.removeEventListener('visibilitychange', wake); warmWake = false; queueWarm();
          });
        }
        return;
      }
      runWarm();
    }, 1000);
  }
  /* the nearest ancestor whose clip has a shape (a rectangle is a scissor
     and changes no program) */
  function clipperOf(el) {
    for (var a = el.parentElement; a && a !== doc.body && a !== doc.documentElement; a = a.parentElement) {
      var cs = getComputedStyle(a);
      if (cs.clipPath && cs.clipPath !== 'none') return a;
      var clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || /paint|strict|content/.test(cs.contain || '');
      if (clips && (parseFloat(cs.borderTopLeftRadius) || parseFloat(cs.borderTopRightRadius) ||
                    parseFloat(cs.borderBottomRightRadius) || parseFloat(cs.borderBottomLeftRadius))) return a;
    }
    return null;
  }
  function groundOf(el) {
    for (var a = el.parentElement; a; a = a.parentElement) {
      var bg = getComputedStyle(a).backgroundColor;
      if (bg && bg !== 'transparent' && !/^rgba\(0, 0, 0, 0\)$/.test(bg)) return bg;
    }
    return '';
  }
  function warmCopy(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    var c = snapshot(el, true), s = c.style, sh = doc.createElement('div'), ss = sh.style;
    var M = Math.round(r.width * 0.12);                  /* its shadow stays on screen too */
    s.position = 'absolute'; s.margin = '0'; s.boxSizing = 'border-box';
    s.width = r.width + 'px'; s.setProperty('--device-width', r.width + 'px'); s.maxWidth = 'none';
    s.transform = s.translate = s.scale = s.rotate = 'none';
    s.animation = s.transition = 'none'; s.opacity = '1'; s.visibility = 'visible';
    var clip = clipperOf(el), tone = el.closest('[data-tone]');
    ss.position = 'absolute'; ss.opacity = WARM_ALPHA; ss.background = groundOf(el);
    if (tone) sh.setAttribute('data-tone', tone.getAttribute('data-tone'));
    if (clip) {
      /* the clipper's box and corner, the device at its own place in it,
         the whole shifted so the device lands at (M, M) on screen */
      var cr = clip.getBoundingClientRect(), cs = getComputedStyle(clip);
      ss.width = cr.width + 'px'; ss.height = cr.height + 'px'; ss.overflow = 'hidden';
      ss.left = (M + cr.left - r.left) + 'px'; ss.top = (M + cr.top - r.top) + 'px';
      ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].forEach(function (k) { ss['border' + k + 'Radius'] = cs['border' + k + 'Radius']; });
      var cv = (cs.getPropertyValue('corner-shape') || '').trim();
      if (cv) ss.setProperty('corner-shape', cv);
      if (cs.clipPath && cs.clipPath !== 'none') ss.clipPath = cs.clipPath;
      s.left = (r.left - cr.left) + 'px'; s.top = (r.top - cr.top) + 'px';
    } else {
      ss.left = ss.top = M + 'px'; ss.width = r.width + 'px'; ss.height = r.height + 'px';
      s.left = s.top = '0px';
    }
    sh.appendChild(c);
    return sh;
  }
  function runWarm() {
    var vh = global.innerHeight || doc.documentElement.clientHeight, later = [];
    var plan = warmList.splice(0).filter(function (el) {
      if (!el.isConnected || !el.__device || el.__device.warm) return false;
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) { later.push(el); return false; }
      if (r.bottom > 0 && r.top < vh) { el.__device.warm = true; return false; }   /* on screen: drawn already */
      return true;
    });
    warmList = later.concat(warmList);
    if (!plan.length) return;
    warmRunning = true;
    var deck = doc.createElement('div');
    deck.setAttribute('data-lg3-warm', ''); deck.setAttribute('aria-hidden', 'true'); deck.inert = true;
    deck.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483647;margin:0;padding:0;border:0';
    doc.documentElement.appendChild(deck);
    (function step() {
      deck.textContent = '';
      var batch = plan.splice(0, WARM_BATCH);
      if (!batch.length || doc.visibilityState === 'hidden') {
        deck.remove(); warmRunning = false;
        var left = batch.concat(plan);                  /* hidden: these drew nothing */
        left.forEach(function (el) { warmList.push(el); });
        if (left.length || warmAgain) { warmAgain = false; queueWarm(); }
        return;
      }
      batch.forEach(function (el) {
        try { var c = warmCopy(el); if (c) { deck.appendChild(c); el.__device.warm = true; } } catch (e) { /* a copy is best effort */ }
      });
      /* three frames on screen, so the compositor draws the batch at least
         once whatever it skips; then the next batch in idle time */
      requestAnimationFrame(function () { requestAnimationFrame(function () { requestAnimationFrame(function () { idle(step, 250); }); }); });
    })();
  }

  /* ── mount ─────────────────────────────────────────────────────────────── */
  var BUILD = { phone: buildPhone, duo: buildDuo, laptop: buildLaptop, browser: buildBrowser };
  var LW = { phone: 426, duo: 788, laptop: 1440, browser: 1280 };
  function build(el) {
    var type = el.getAttribute('data-device');
    if (el.__device || !BUILD[type]) return el.__device;
    if (el.closest('[data-lg3-warm]')) return null;       /* a warm-up copy is not a device */
    var ctx = el.__device = { el: el, type: type, lw: LW[type] };
    BUILD[type](ctx);
    el.setAttribute('data-device-ready', '');
    queueWarm(el);
    return ctx;
  }
  function all(root, sel) {
    root = root || doc;
    var out = root.querySelectorAll ? [].slice.call(root.querySelectorAll(sel)) : [];
    if (root.matches && root.matches(sel)) out.unshift(root);
    return out;
  }
  function ctlOf(el) {
    var ctx = el && (el.__device || build(el));
    return ctx && ctx.fold;
  }
  function resolveTo(to) {
    if (typeof to === 'string') return STATES[to] != null ? STATES[to] : parseFloat(to);
    return to;
  }

  global.DEVICE = {
    mount: function (root) {
      all(root, '.device[data-device]').forEach(build);
      all(root, '.device-fold-slider').forEach(function (s) { bindSlider(s); });
      return this;
    },
    fold: function (el, to, opts) {
      var ctl = ctlOf(el);
      if (!ctl) return Promise.resolve(null);
      return animateTo(ctl, resolveTo(to), opts || {});
    },
    set: function (el, v) {
      var ctl = ctlOf(el);
      if (!ctl) return;
      stop(ctl); commit(ctl, clamp(resolveTo(v), 0, 1)); settle(ctl);
    },
    value: function (el) { var c = ctlOf(el); return c ? current(c).x : null; },
    state: function (el) { var c = ctlOf(el); return c ? c.state : null; },
    angle: interior,
    valueForAngle: valueForAngle,
    slider: bindSlider,
    fit: function (root) {
      all(root, '.device__screen').forEach(function (s) { layoutScreen(s, s.clientWidth, s.clientHeight); });
    },
    pose: pose,
    DETENTS: DETENTS, STATES: STATES, SPRINGS: SPRINGS, MAGNET: MAGNET
  };
})(window);
