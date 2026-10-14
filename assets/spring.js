/* ═══════════════════════════════════════════════════════════════════════════
   spring.js → SPRING — the springs as the differential equation (Fluid Design Open)
   ───────────────────────────────────────────────────────────────────────────
   The fixed-step integrator, the velocity-seeded `linear()` re-emit, the
   (mass, stiffness, damping) and `spring(m,k,c,v0)` forms, and the named
   set from SPEC §5.

   PUBLIC API  (global SPRING)
     Spring(cfg)              cfg = name | {duration, bounce, velocity?}
                                    | {response, dampingFraction}
                                    | {mass?, stiffness, damping, velocity?}
                                    | {mkc:[m,k,c,v0], ms}     (fixed-length easing)
       → { duration, bounce, zeta, w0, stiffness, damping, mass, velocity,
           settlingDuration (s), peak, at(t)→0..1, vel(t), ms(),
           from(x0, v0, target) → {at, vel, target, settlingDuration},
           linear(n) → 'linear(…)'  (normalised to ms(); n defaults to the
             first of 48/64/96/128/192/256 that plays within .0025 of the
             solver — 48 unless the spring is bouncier than ζ .5),
           linearFrom(x0, v0, target, n) → {easing, from, to, target, ms,
                                             settlingDuration, at, vel} }
     linearFrom(cfg, x0, v0, target, n)   same, one call
     Layer(cfg, initial, onFrame(value, velocity, atRest), {rest})
       the fixed-step layer: fixed 1/60 s semi-implicit Euler, accumulator,
       render interpolation. .setTarget(t) keeps velocity · .snap(v) ·
       .step(dt) (manual clock, returns rendered value) · .stop() ·
       getters value, velocity, target, atRest
     Driven(cfg, initial, onFrame, v0?)   analytic re-aimable scalar
       .to(target, done) · .set(v) · .stop() · value · velocity · running
       Frames on rAF; a deadline timer lands it (onFrame(target, 0, true),
       done) where rAF does not run, e.g. a hidden page.
     NAMED · PRESETS · TIERS · get(name) · table() · dampingRatio(b)
     mkcEasing(m,k,c,v0) → fn(p)  (the fixed-length spring easing, exact)
     toLinear(fn(p), n) → 'linear(…)'
     project(v, rate=.998) · rubber(over, dim, c=.55) · animate(cfg, onFrame, onDone)
     emitVars() → ':root{--sp-*…}' · install(doc)  (playground only — pages link
       the GENERATED assets/fg3-springs.css; a head-injected style loses the cascade)

   ── WHY THE CONSTANTS ARE WRITTEN DOWN, NOT TUNED ───────────────────────────
     ω₀ = 2π/duration   ζ = 1 − bounce (b ≥ 0) | 1/(1 + b) (b < 0)
     k = ω₀²            c = 2ζω₀                 (mass 1)
   Two conversions are printed in the spring docs; both fall out of those lines:
     Spring(duration: 0.5, bounce: 0.3)          → (mass 1, k 157.9, c 17.6)
     Spring(mass: 1, stiffness: 100, damping: 10) → (duration 0.63, bounce 0.5)
   The fixed-step layer uses the same mapping. The node
   test (tools/test-motion.mjs) asserts both and runs mutants to prove the
   assertions can fail.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var TAU = 2 * Math.PI;

  function dampingRatio(bounce) { return bounce >= 0 ? 1 - bounce : 1 / (1 + bounce); }

  /* Closed-form response from ARBITRARY initial conditions (u = x − target).
     Three regimes; the critical branch needs its own formula or ζ = 1 gives
     NaN, and NaN inside linear() silently drops the whole easing. */
  function solveFrom(zeta, w0, u0, v0) {
    if (zeta < 1 - 1e-9) {
      var wd = w0 * Math.sqrt(1 - zeta * zeta), c2 = (v0 + zeta * w0 * u0) / wd;
      return {
        at: function (t) { return Math.exp(-zeta * w0 * t) * (u0 * Math.cos(wd * t) + c2 * Math.sin(wd * t)); },
        vel: function (t) {
          var e = Math.exp(-zeta * w0 * t), c = Math.cos(wd * t), s = Math.sin(wd * t);
          return e * ((-zeta * w0) * (u0 * c + c2 * s) + (-u0 * wd * s + c2 * wd * c));
        }
      };
    }
    if (zeta <= 1 + 1e-9) {
      var k = v0 + w0 * u0;
      return {
        at: function (t) { return Math.exp(-w0 * t) * (u0 + k * t); },
        vel: function (t) { return Math.exp(-w0 * t) * (k - w0 * (u0 + k * t)); }
      };
    }
    var s2 = w0 * Math.sqrt(zeta * zeta - 1), a = -zeta * w0 + s2, b = -zeta * w0 - s2;
    var B = (a * u0 - v0) / (a - b), A = u0 - B;
    return {
      at: function (t) { return A * Math.exp(a * t) + B * Math.exp(b * t); },
      vel: function (t) { return A * a * Math.exp(a * t) + B * b * Math.exp(b * t); }
    };
  }

  /* The time after which f stays within ±ε of 1 FOR GOOD. Return the start of
     the quiet run, not the moment the window closed. */
  function settlingTime(f, w0, zeta, epsilon) {
    epsilon = epsilon == null ? 0.002 : epsilon;
    var dt = 1 / (w0 * 40 + 60), limit = 24 / (zeta * w0 || 1);
    var need = Math.max(2.5 / w0, 0.06), quietSince = -1;
    for (var t = 0; t < limit; t += dt) {
      if (Math.abs(f(t) - 1) <= epsilon) {
        if (quietSince < 0) quietSince = t;
        if (t - quietSince >= need) return quietSince;
      } else quietSince = -1;
    }
    return limit;
  }

  /* ── The fixed-length easing: `spring(mass, stiffness, damping, velocity)` ──
     A port of a spring solver. Two
     quirks are reproduced on purpose, because they ARE the curve:
       1 ζ ≥ 1 takes the CRITICAL formula (A = 1, B = ω₀ − v0) — the true
         over-damped response is never used. nav-in (1.5,28,28,1) has ζ 2.16.
       2 The curve's length is found by stepping d by 1/6 s until solve(d) is
         EXACTLY 1 for 16 consecutive steps, then progress maps onto d·(1/6)
         seconds of the spring (the code multiplies by the step, not by 1). */
  function mkcSolver(m, k, c, v0) {
    var w0 = Math.sqrt(k / m), zeta = c / (2 * Math.sqrt(k * m)), wd = 0, B;
    if (zeta < 1) { wd = w0 * Math.sqrt(1 - zeta * zeta); B = (zeta * w0 - v0) / wd; }
    else B = -v0 + w0;
    return {
      w0: w0, zeta: zeta,
      solve: function (t) {
        return 1 - (zeta < 1 ? Math.exp(-t * zeta * w0) * (Math.cos(wd * t) + B * Math.sin(wd * t))
                             : (1 + B * t) * Math.exp(-t * w0));
      }
    };
  }
  function mkcSpan(sol) {
    var step = 1 / 6, d = 0, quiet = 0;
    for (var guard = 0; guard < 1e5; guard++) {
      d += step;
      if (sol.solve(d) === 1) { if (++quiet >= 16) return d * step; } else quiet = 0;
    }
    return d * step;
  }
  function mkcEasing(m, k, c, v0) {
    var sol = mkcSolver(m, k, c, v0), span = mkcSpan(sol);
    var fn = function (p) { return p === 0 || p === 1 ? p : sol.solve(p * span); };
    fn.span = span; fn.w0 = sol.w0; fn.zeta = sol.zeta;
    return fn;
  }

  /* Normalise every accepted form to {w0, zeta, v (unit-response initial
     velocity, 1/s), fixed (s) | null, curve (p→value) | null} plus the params
     to report. */
  function resolve(cfg) {
    if (typeof cfg === 'string') {
      if (!NAMED[cfg]) throw new Error('SPRING: no spring named "' + cfg + '"');
      cfg = NAMED[cfg];
    }
    cfg = cfg || {};
    if (cfg.mkc) {
      var a = cfg.mkc, T = (cfg.ms || 500) / 1000, E = mkcEasing(a[0], a[1], a[2], a[3] || 0);
      var s = E.span / T;              /* time-scale the curve onto the tween length */
      return { w0: E.w0 * s, zeta: Math.min(E.zeta, 1), v: (a[3] || 0) * s, fixed: T, curve: E,
               mass: a[0], stiffness: a[1], damping: a[2], trueZeta: E.zeta };
    }
    if (cfg.stiffness != null) {
      var m = cfg.mass || 1, w = Math.sqrt(cfg.stiffness / m);
      return { w0: w, zeta: cfg.damping / (2 * Math.sqrt(cfg.stiffness * m)), v: cfg.velocity || 0,
               fixed: null, mass: m, stiffness: cfg.stiffness, damping: cfg.damping };
    }
    var dur, z;
    if (cfg.response != null) { dur = cfg.response; z = cfg.dampingFraction != null ? cfg.dampingFraction : 0.825; }
    else { dur = cfg.duration != null ? cfg.duration : 0.5; z = dampingRatio(cfg.bounce != null ? cfg.bounce : 0); }
    var w0 = TAU / dur;
    return { w0: w0, zeta: z, v: cfg.velocity || 0, fixed: null, mass: 1, stiffness: w0 * w0, damping: 2 * z * w0 };
  }

  /* Sample fn(q) on q = (i/n)^warp into a CSS linear(). The POSITION and the
     value must use the same q: putting the warp into the time only gives
     (value f(p^1.65·T) at position p), which replays every spring slowed at
     the start and rushed at the end — at 50 % of the transition it showed the
     spring's state at 32 %. Found while forking; asserted in test-motion. */
  function toLinear(fn, n, warp, last) {
    n = n || 48; warp = warp || 1;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var q = Math.pow(i / n, warp);
      out.push(+fn(q).toFixed(5) + ' ' + +(q * 100).toFixed(3) + '%');
    }
    /* Land exactly: 0.99998 is a permanent 1px offset. */
    out[n] = (last == null ? 1 : +last.toFixed(5)) + ' 100%';
    return 'linear(' + out.join(',') + ')';
  }

  /* How many samples a spring needs. 48 hold every spring with ζ ≥ .5 inside
     .002 of the solver (that is the settle tail: the curve lands on 1 while
     the spring is still ±.002 off it), but the bouncier ones facet their
     overshoot: drop (ζ .4) played .0031 off with 48. So measure what CSS will
     PLAY — the same rounded samples, lerped, against fn between them — and
     take the first density that stays within PLAY_TOL (margin under the .003
     bar the self-test holds every --sp-* to). drop → 64, ζ .2 → 128. */
  var DENSITY = [48, 64, 96, 128, 192, 256], PLAY_TOL = 0.0025;
  function playError(fn, n, warp, last) {
    var worst = 0, p0 = 0, v0 = +fn(0).toFixed(5);
    for (var i = 1; i <= n; i++) {
      var q = Math.pow(i / n, warp), v = i < n ? +fn(q).toFixed(5) : (last == null ? 1 : +last.toFixed(5));
      for (var j = 1; j < 4; j++) {
        var m = p0 + (q - p0) * j / 4;
        worst = Math.max(worst, Math.abs(v0 + (v - v0) * j / 4 - fn(m)));
      }
      p0 = q; v0 = v;
    }
    return worst;
  }
  function samplesFor(fn, warp, last) {
    for (var i = 0; i < DENSITY.length - 1; i++) if (playError(fn, DENSITY[i], warp, last) <= PLAY_TOL) return DENSITY[i];
    return DENSITY[DENSITY.length - 1];
  }

  function Spring(cfg) {
    var r = resolve(cfg), w0 = r.w0, zeta = r.zeta;
    var unit = solveFrom(zeta, w0, -1, r.v);
    var f = r.curve ? function (t) { return t >= r.fixed ? 1 : r.curve(t / r.fixed); }
                    : function (t) { return 1 + unit.at(t); };
    var settle = r.fixed || settlingTime(f, w0, zeta);
    var peak = 0;
    for (var i = 0; i <= 400; i++) peak = Math.max(peak, f(settle * i / 400));

    /* Re-aim from where the thing IS and how fast it is GOING (WWDC18: change
       direction mid-gesture). A zero-length move with velocity still has to
       go out and come back, so the settle is normalised by a characteristic
       amplitude instead of dividing by zero. */
    function from(x0, v0, target) {
      target = target == null ? 1 : target;
      var s = solveFrom(zeta, w0, x0 - target, v0 || 0), span = target - x0;
      var U = Math.abs(span) > 1e-9 ? span : (v0 ? v0 / w0 : 1);
      var g = function (t) { return target + s.at(t); };
      return { at: g, vel: s.vel, target: target, scale: U,
               settlingDuration: settlingTime(function (t) { return 1 + (g(t) - target) / U; }, w0, zeta) };
    }

    return {
      duration: TAU / w0, zeta: zeta, w0: w0,
      stiffness: r.stiffness, damping: r.damping, mass: r.mass, velocity: r.v,
      bounce: zeta <= 1 ? 1 - zeta : 1 / zeta - 1,
      trueZeta: r.trueZeta != null ? r.trueZeta : zeta,
      settlingDuration: settle, peak: peak,
      at: f, vel: unit.vel, from: from,

      /* The CSS easing, sampled on t = p^1.65·settle: a spring does its
         interesting work early, so uniform spacing facets the overshoot.
         Default density from samplesFor (48 for ζ ≥ .5, more for bouncier
         springs): every named spring plays within .0025 of the solver. */
      linear: function (samples) {
        var g = function (q) { return f(q * settle); };
        return toLinear(g, samples || samplesFor(g, 1.65), 1.65);
      },
      ms: function () { return Math.round(settle * 1000); },

      /* Interruption for CSS/WAAPI: a transition restarts
         at zero velocity and kinks; re-emit a linear() whose FIRST SLOPE is
         the current velocity. Safari caps rAF at 60 Hz on ProMotion, but a
         WAAPI animation with this easing runs at display rate. Animate from
         `from` to `to` (== target unless the move is zero-length) over `ms`. */
      linearFrom: function (x0, v0, target, samples) {
        var sol = from(x0, v0, target), U = sol.scale, T = sol.settlingDuration;
        var g = function (q) { return (sol.at(q * T) - x0) / U; }, last = (sol.target - x0) / U;
        var easing = toLinear(g, samples || samplesFor(g, 1.65, last), 1.65, last);
        return { easing: easing, from: x0, to: x0 + U, target: sol.target,
                 ms: Math.round(T * 1000), settlingDuration: T, at: sol.at, vel: sol.vel };
      }
    };
  }

  /* ── The named set (SPEC §5). Duration/bounce where a spring is
        specified that way, stiffness/damping where raw constants are
        used. ───────────────────────────────────────────────────────────── */
  var NAMED = {
    smooth:      { duration: 0.5,   bounce: 0 },      /* smooth                   */
    snappy:      { duration: 0.5,   bounce: 0.15 },   /* snappy                           */
    bouncy:      { duration: 0.5,   bounce: 0.3 },    /* bouncy                           */
    interactive: { duration: 0.15,  bounce: 0.14 },   /* interactive (df .86)              */
    press:       { duration: 0.22,  bounce: 0.12 },   /* tiers …                                              */
    toggle:      { duration: 0.32,  bounce: 0.15 },
    move:        { duration: 0.46,  bounce: 0.18 },
    sheet:       { duration: 0.55,  bounce: 0.10 },
    morph:       { duration: 0.60,  bounce: 0.22 },
    select:      { duration: 0.40,  bounce: 0.15 },   /* tab lens travel            */
    lift:        { duration: 0.25,  bounce: 0 },      /* lens lift on press                */
    hold:        { duration: 0.356, bounce: 0.41 },   /* held-press grow                   */
    follow:      { duration: 0.196, bounce: 0.10 },   /* finger follow (20 ms behind)      */
    settle:      { duration: 0.63,  bounce: 0 },      /* glass settle                       */
    card:        { duration: 0.5,   bounce: 0.16 },   /* product viewer cardMorph          */
    tour:        { duration: 0.5,   bounce: 0.42 },   /* tourMorph / pose chip → card      */
    snap:        { duration: 0.32,  bounce: 0 },      /* interactiveMorph                  */
    drop:        { stiffness: 100, damping: 8 },      /* media bar droplet + bar rise  (.63/.60) */
    bubble:      { stiffness: 100, damping: 10 },     /* media bar bubble width/height (.63/.50) */
    content:     { stiffness: 100, damping: 20 },     /* media bar content slide/alpha (.63/0)   */
    dots:        { stiffness: 200, damping: 20 },     /* dot shift, --progress-intro (.44/.29) */
    'nav-in':    { mkc: [1.5, 28, 28, 1], ms: 600 },  /* localnav expand: 0.4 + 0.2 s    */
    'nav-out':   { mkc: [0.75, 20, 20, 2], ms: 400 }, /* localnav collapse               */
    legacy:      { response: 0.55, dampingFraction: 0.825 }
  };
  var PRESETS = {}, TIERS = {};
  ['smooth', 'snappy', 'bouncy', 'legacy', 'interactive'].forEach(function (n) { PRESETS[n] = NAMED[n]; });
  Object.keys(NAMED).forEach(function (n) { if (!PRESETS[n]) TIERS[n] = NAMED[n]; });

  function get(name) { return NAMED[name] || null; }

  function table() {
    return Object.keys(NAMED).map(function (n) {
      var s = Spring(n);
      return { name: n, duration: s.duration, bounce: s.bounce, zeta: s.trueZeta, stiffness: s.stiffness,
               damping: s.damping, mass: s.mass, ms: s.ms(), peak: s.peak, mkc: !!NAMED[n].mkc };
    });
  }

  function emitVars() {
    var css = [];
    Object.keys(NAMED).forEach(function (n) {
      var s = Spring(n);
      css.push('  --sp-' + n + ': ' + s.linear() + ';');
      css.push('  --sp-' + n + '-ms: ' + s.ms() + 'ms;');
    });
    return ':root{\n' + css.join('\n') + '\n}';
  }
  function install(doc) {
    doc = doc || document;
    var el = doc.getElementById('sp-vars');
    if (!el) { el = doc.createElement('style'); el.id = 'sp-vars'; doc.head.appendChild(el); }
    el.textContent = emitVars();
    return el;
  }

  /* ── Driven: a scalar you can re-aim; analytic, so exact at any fps ──
     optional initialVelocity (hand-over from another spring), and a move
     that starts AT REST takes the spring's own velocity kick scaled by the
     travel — the nav-in is spring(1.5, 28, 28, v0 = 1). */
  function Driven(cfg, initial, onFrame, initialVelocity) {
    var spring = Spring(cfg), value = initial || 0, velocity = initialVelocity || 0;
    var sol = null, t0 = 0, raf = 0, timer = 0, done = null, lastSetT = 0, lastSetV = value;
    function tick(now) {
      raf = 0;
      if (!sol) return;
      var t = (now - t0) / 1000;
      if (t >= sol.settlingDuration) {
        value = sol.target; velocity = 0; sol = null; unwatch();
        onFrame(value, 0, true);
        if (done) { var d = done; done = null; d(); }
        return;
      }
      value = sol.at(t); velocity = sol.vel(t);
      onFrame(value, velocity, false);
      if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
    }
    /* rAF never runs in a hidden page (a background tab, a headless capture
       that lost focus), and the value would sit mid-flight forever with
       onDone unfired. A deadline timer at the settle time lands it anyway;
       with rAF running it finds the spring already at rest and does nothing. */
    function unwatch() { if (timer) { clearTimeout(timer); timer = 0; } }
    function watch() {
      unwatch();
      if (!sol || typeof setTimeout !== 'function') return;
      var left = sol.settlingDuration - (performance.now() - t0) / 1000;
      timer = setTimeout(function () {
        timer = 0;
        if (!sol) return;
        if ((performance.now() - t0) / 1000 < sol.settlingDuration) { watch(); return; }
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        tick(performance.now());
      }, Math.max(0, left * 1000) + 34);
    }
    return {
      get value() { return value; },
      get velocity() { return velocity; },
      get running() { return !!sol; },
      get spring() { return spring; },
      to: function (target, onDone) {
        /* Sample where we are NOW, not at the last frame, so a re-aim between
           frames does not jump back a frame. */
        if (sol) { var t = (performance.now() - t0) / 1000; value = sol.at(t); velocity = sol.vel(t); }
        else if (!velocity && spring.velocity) velocity = spring.velocity * (target - value);
        sol = spring.from(value, velocity, target);
        t0 = performance.now(); done = onDone || null;
        if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
        watch();
        return this;
      },
      set: function (v) {
        var now = performance.now(), dt = (now - lastSetT) / 1000;
        if (dt > 0.0005 && dt < 0.25) velocity = (v - lastSetV) / dt;
        lastSetT = now; lastSetV = v; value = v; sol = null;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        unwatch();
        onFrame(value, velocity, false);
        return this;
      },
      stop: function () { sol = null; if (raf) { cancelAnimationFrame(raf); raf = 0; } unwatch(); return this; }
    };
  }

  /* ── Layer: the fixed-step spring layer ─────────────────────────────────
     Fixed 60 Hz step with an accumulator, dt capped at 1/30 s, semi-implicit
     Euler (v first, then x), and the rendered value interpolated between the
     last two states (Gaffer). Because the step is fixed, the trajectory is the
     same at 30, 60 or 120 Hz: only the render sampling differs. setTarget keeps
     velocity — that is what makes the glass interruptible. */
  var STEP = 1 / 60, MAX_FRAME = 1 / 30;
  var layers = [], layerRaf = 0, layerThen = 0;
  function layerLoop(now) {
    var dt = layerThen ? (now - layerThen) / 1000 : STEP;
    layerThen = now;
    layers.slice().forEach(function (l) { l._tick(dt); });
    if (layers.length) layerRaf = requestAnimationFrame(layerLoop);
    else { layerRaf = 0; layerThen = 0; }
  }
  function Layer(cfg, initial, onFrame, opts) {
    var s = Spring(cfg), k = s.w0 * s.w0, c = 2 * s.zeta * s.w0;
    var rest = (opts && opts.rest) || 0.001;
    var x = initial || 0, px = x, v = 0, target = x, acc = 0, render = x, atRest = true;
    function integrate() {
      px = x;
      v += (-k * (x - target) - c * v) * STEP;
      x += v * STEP;
    }
    var api = {
      get value() { return render; }, get velocity() { return v; },
      get target() { return target; }, get atRest() { return atRest; },
      step: function (dt) {
        if (atRest) return render;
        acc += Math.min(MAX_FRAME, dt);
        while (acc >= STEP) { integrate(); acc -= STEP; }
        var alpha = acc / STEP;
        render = x * alpha + px * (1 - alpha);
        if (Math.abs(x - target) < rest && Math.abs(v) < rest) {
          x = px = render = target; v = 0; acc = 0; atRest = true;
        }
        if (onFrame) onFrame(render, v, atRest);
        return render;
      },
      setTarget: function (t) {
        target = t; atRest = false;
        if (typeof requestAnimationFrame === 'function' && layers.indexOf(api) < 0) {
          layers.push(api);
          if (!layerRaf) layerRaf = requestAnimationFrame(layerLoop);
        }
        return api;
      },
      snap: function (val) {
        x = px = render = target = val; v = 0; acc = 0; atRest = true;
        if (onFrame) onFrame(render, 0, true);
        return api;
      },
      stop: function () { var i = layers.indexOf(api); if (i >= 0) layers.splice(i, 1); atRest = true; return api; },
      _tick: function (dt) { api.step(dt); if (atRest) api.stop(); }
    };
    return api;
  }

  global.SPRING = {
    Spring: Spring, Driven: Driven, Layer: Layer,
    NAMED: NAMED, PRESETS: PRESETS, TIERS: TIERS, get: get, table: table,
    dampingRatio: dampingRatio, solveFrom: solveFrom, settlingTime: settlingTime,
    mkcEasing: mkcEasing, toLinear: toLinear,
    linearFrom: function (cfg, x0, v0, target, n) { return Spring(cfg).linearFrom(x0, v0, target, n); },
    emitVars: emitVars, install: install,
    STEP: STEP,

    /* WHERE A FLICK WOULD LAND: (v/1000)·d/(1−d); UIScrollView normal .998,
       fast .99 per ms. Choose the endpoint from THIS, not the release point. */
    project: function (velocity, decelerationRate) {
      var d = decelerationRate == null ? 0.998 : decelerationRate;
      return (velocity / 1000) * d / (1 - d);
    },
    /* UIScrollView rubber band: offset = (1 − 1/(x·c/d + 1))·d, c = .55. */
    rubber: function (overshoot, dimension, c) {
      c = c == null ? 0.55 : c;
      if (!dimension) return overshoot;
      var sign = overshoot < 0 ? -1 : 1, x = Math.abs(overshoot);
      return sign * (1 - (1 / (x * c / dimension + 1))) * dimension;
    },
    /* rAF driver for a unit spring; returns cancel. */
    animate: function (cfg, onFrame, onDone) {
      var s = Spring(cfg), t0 = performance.now(), raf = 0, cancelled = false;
      (function step(now) {
        if (cancelled) return;
        var t = (now - t0) / 1000;
        if (t >= s.settlingDuration) { onFrame(1, s.settlingDuration); if (onDone) onDone(); return; }
        onFrame(s.at(t), t);
        raf = requestAnimationFrame(step);
      })(t0);
      return function () { cancelled = true; cancelAnimationFrame(raf); };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
