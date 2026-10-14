/* ═══════════════════════════════════════════════════════════════════════════
   motion.js → MOTION — the half CSS cannot do (Fluid Design Open)
   ───────────────────────────────────────────────────────────────────────────
   Spring on props, gesture, view transitions,
   attention, swap, mount) plus the MORPH primitive, compositor springs and
   the magnetic detent. Everything degrades to the thing simply happening:
   no API, or reduced motion, and the value still lands, the DOM still changes.
   Needs SPRING (spring.js, loaded earlier). Never mounts itself.

   PUBLIC API (global MOTION)
     progress(el, to, {spring='morph', var='--progress', from, onFrame(v, vel),
              onDone}) → handle {to(t), stop(), value, velocity}
       THE MORPH PRIMITIVE: one interruptible spring-driven custom property,
       written inline on el; CSS derives radius, width, padding, font-size,
       translate and glass density from it with calc(). A second call re-aims
       the same spring keeping its velocity. While it moves, el carries
       [data-m-moving] (density follows motion). Reduced motion → jumps.
     spring(el, prop, target, {spring|tier, from, frame, done})
       prop x | y | scale | rotate | opacity | --custom. x/y/scale/rotate
       compose ONE `transform` from --m-x --m-y --m-s --m-r. Re-aims per el+prop.
     glide(el, prop, target, {spring, from}) → Animation
       Compositor spring for x | y | scale | opacity | rotate via WAAPI and a
       velocity-seeded linear() (SPRING.linearFrom). Runs at display rate where
       rAF is capped (Safari ProMotion); an interruption re-emits from the
       analytic position AND velocity. x/y/scale compose with `add`.
     draggable(el, {axis, bounds(), snap[]|fn, onStart, onMove, onEnd,
                    onFrame(v, vel), hysteresis=10, decelerationRate=.998})
       → {destroy, to(v, spring)}
       1:1 from the grab point, 90 ms velocity window, rubber band past
       bounds (c .55), projection → nearest snap, settle 'move' if |v|>220 else
       'toggle'. [data-m-dragging] while dragging. Moves are heard on the
       window from pointerdown (an edge grab dragged outward arms); capture
       starts at the hysteresis. onFrame reports every frame of the settle
       spring (and of to()); onEnd(target, v) when it lands. A grab catches a
       settle where it is; a tap on a settling element re-lands it on a snap.
     detent(el, {detents:[0,1/3,1], value, thumb, onChange(v, i), onInput(v),
                 magnet:{radius:.08, strength:.8}, stretchMax:24, labels[]})
       → {set(v, animate) (commits to the nearest detent), setValue(v) (paints
       v and moves the spring, no snap, no onChange), value, index, stretch,
       direction (±1, the stretch side), destroy()}. Behaviour only; writes
       --detent-value 0..1, --detent-stretch px, --detent-squash
       (scaleY 1 − .0025·t), --detent-dir ±1 on el.
     navigate(update, {direction, types, interrupt}) → Promise   view
       transition, typed; html[data-nav]; skipped under reduced motion or
       without the API. One runs at a time: a call made meanwhile waits,
       and of several waiting only the latest animates (the others' updates
       apply at once). interrupt:true skips the running one instead. Never
       rejects and never leaves an unhandled rejection.
     shared(el, name) → release()        view-transition-name, refuses duplicates
     attention(el, 'pop'|'nudge'|'shake'|'flash')   swap(host, node, {off})
     mount(root) — [data-m-enter=up|down|left|right|scale] (IO + 1600 ms
       deadline), [data-m-press] → .m-press. FG3.boot() calls it.
     read(el, prop) · reduced (MediaQueryList) · supports{…}
   Reduced motion = that media query OR html.fd-reduced-motion (FG3 sets it,
   also for ?fd-reduced-motion): springs and morphs jump, navigate skips.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var SP = global.SPRING;
  var reduced = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)')
                                  : { matches: false, addEventListener: function () {} };
  /* The media query OR FG3's html.fd-reduced-motion (?fd-reduced-motion, a
     toggle) — the same test FG3, CHROME and SHOW use. */
  function rm() { return reduced.matches || document.documentElement.classList.contains('fd-reduced-motion'); }
  function cfgOf(opts, fallback) {
    var n = opts && (opts.spring || opts.tier);
    if (n && typeof n === 'object') return n;
    return (SP && SP.NAMED[n]) ? n : fallback;
  }
  /* Capture can throw (a synthetic or already-ended pointer); losing it only
     means the drag ends at the element edge, never a dead control. */
  function capture(el, id) { try { if (el.setPointerCapture) el.setPointerCapture(id); } catch (e) { /* not an active pointer */ } }
  function moving(el, on) {
    el.__mMoving = Math.max(0, (el.__mMoving || 0) + (on ? 1 : -1));
    if (el.__mMoving) el.setAttribute('data-m-moving', ''); else el.removeAttribute('data-m-moving');
  }

  /* ── 1 · THE MORPH PRIMITIVE ──────────────────────────────────────────────
     The local nav's pill → panel, the media-bar bubbles and the
     gallery pills from ONE float each (--progress, --alpha, --autoplay-
     progress) and derives everything in CSS. One spring,
     one number, interruptible; CSS owns the look. */
  function progress(el, to, opts) {
    opts = opts || {};
    var name = opts.var || '--progress';
    var store = el.__mProg || (el.__mProg = {});
    var write = function (v) { el.style.setProperty(name, +v.toFixed(5)); };
    if (rm() || !SP) {
      if (store[name]) store[name].stop();
      write(to);
      if (opts.onFrame) opts.onFrame(to, 0);
      if (opts.onDone) opts.onDone();
      return { to: function (t) { write(t); return this; }, stop: function () {}, value: to, velocity: 0 };
    }
    var live = store[name], carry = 0, start;
    /* Changing spring mid-flight (nav-in → nav-out) hands the velocity on. */
    if (live && opts.spring && live.cfg !== cfgOf(opts, 'morph')) {
      start = live.value; carry = live.running ? live.velocity : 0;
      live.stop();
      if (live.busy) { live.busy = false; moving(el, false); }
      live = null;
    }
    if (!live) {
      if (start == null) start = opts.from != null ? opts.from : parseFloat(el.style.getPropertyValue(name) ||
                  global.getComputedStyle(el).getPropertyValue(name)) || 0;
      var cfg = cfgOf(opts, 'morph');
      live = SP.Driven(cfg, start, function (v, vel, done) {
        write(v);
        if (live.onFrame) live.onFrame(v, vel);
        if (done && live.busy) { live.busy = false; moving(el, false); }
      }, carry);
      live.cfg = cfg;
      store[name] = live;
      write(start);
    } else if (opts.from != null) live.set(opts.from);
    live.onFrame = opts.onFrame || null;
    if (!live.busy) { live.busy = true; moving(el, true); }
    live.to(to, opts.onDone);
    return live;
  }

  /* ── 2 · A PROPERTY THAT CAN BE RE-AIMED ─────────────────────────── */
  var WRITERS = {
    x: function (el, v) { el.style.setProperty('--m-x', v + 'px'); compose(el); },
    y: function (el, v) { el.style.setProperty('--m-y', v + 'px'); compose(el); },
    scale: function (el, v) { el.style.setProperty('--m-s', v); compose(el); },
    rotate: function (el, v) { el.style.setProperty('--m-r', v + 'deg'); compose(el); },
    opacity: function (el, v) { el.style.opacity = v; }
  };
  /* One transform from parts, so x and y springs never clobber each other. */
  function compose(el) {
    var s = el.style;
    s.transform = 'translate3d(' + (s.getPropertyValue('--m-x') || '0px') + ',' + (s.getPropertyValue('--m-y') || '0px') +
      ',0) scale(' + (s.getPropertyValue('--m-s') || 1) + ') rotate(' + (s.getPropertyValue('--m-r') || '0deg') + ')';
  }
  function writerFor(prop) {
    if (WRITERS[prop]) return WRITERS[prop];
    if (prop.slice(0, 2) === '--') return function (el, v) { el.style.setProperty(prop, +(+v).toFixed(5)); };
    throw new Error('MOTION: no writer for "' + prop + '"');
  }
  function springTo(el, prop, target, opts) {
    opts = opts || {};
    var write = writerFor(prop);
    if (rm() || !SP) {
      write(el, target);
      if (opts.frame) opts.frame(target, 0);
      if (opts.done) opts.done();
      return { stop: function () {}, value: target };
    }
    el.__m = el.__m || {};
    var live = el.__m[prop];
    /* a re-aim that brings its own frame hook takes the frames over */
    if (live) { if (opts.frame) live.frame = opts.frame; live.to(target, opts.done); return live; }
    var start = opts.from != null ? opts.from : readCurrent(el, prop);
    var d = SP.Driven(cfgOf(opts, 'move'), start, function (v, vel, finished) {
      write(el, v);
      if (d.frame) d.frame(v, vel);
      if (finished) { el.__m[prop] = null; moving(el, false); }
    });
    d.frame = opts.frame || null;
    el.__m[prop] = d;
    moving(el, true);
    d.to(target, opts.done);
    return d;
  }
  function readCurrent(el, prop) {
    var s = el.style;
    if (prop === 'x') return parseFloat(s.getPropertyValue('--m-x')) || 0;
    if (prop === 'y') return parseFloat(s.getPropertyValue('--m-y')) || 0;
    if (prop === 'scale') { var v = parseFloat(s.getPropertyValue('--m-s')); return isNaN(v) ? 1 : v; }
    if (prop === 'rotate') return parseFloat(s.getPropertyValue('--m-r')) || 0;
    if (prop === 'opacity') { var o = parseFloat(global.getComputedStyle(el).opacity); return isNaN(o) ? 1 : o; }
    if (prop.slice(0, 2) === '--') return parseFloat(s.getPropertyValue(prop) || global.getComputedStyle(el).getPropertyValue(prop)) || 0;
    return 0;
  }

  /* ── 3 · COMPOSITOR SPRING ────────────────────────────────────────────────
     Re-emit, do not step. The live solution is analytic,
     so an interruption knows the exact position and velocity at `now`. */
  var GLIDE = {
    x: { css: 'translate', fmt: function (v) { return v + 'px 0px'; }, comp: 'add', base: 0 },
    y: { css: 'translate', fmt: function (v) { return '0px ' + v + 'px'; }, comp: 'add', base: 0 },
    scale: { css: 'scale', fmt: function (v) { return String(v); }, comp: 'add', base: 1 },
    rotate: { css: 'rotate', fmt: function (v) { return v + 'deg'; }, comp: 'replace', base: 0 },
    opacity: { css: 'opacity', fmt: function (v) { return String(v); }, comp: 'replace', base: 1 }
  };
  function glide(el, prop, target, opts) {
    opts = opts || {};
    var g = GLIDE[prop];
    if (!g) throw new Error('MOTION.glide: no channel "' + prop + '"');
    var st = (el.__glide = el.__glide || {})[prop] || { value: g.base };
    el.__glide[prop] = st;
    var x0 = opts.from != null ? opts.from : st.value, v0 = 0, now = global.performance.now();
    if (st.sol && opts.from == null) {                    /* interrupted: carry both */
      var t = (now - st.t0) / 1000;
      if (t < st.sol.settlingDuration) { x0 = st.sol.at(t); v0 = st.sol.vel(t); } else x0 = st.sol.target;
    }
    if (st.anim) st.anim.cancel();
    if (rm() || !SP || !el.animate) {
      st.sol = null; st.value = target;
      el.style[g.css] = g.fmt(target);
      return null;
    }
    var spring = SP.Spring(cfgOf(opts, 'snappy')), r = spring.linearFrom(x0, v0, target);
    var sol = spring.from(x0, v0, target);
    var kf = [{}, {}];
    kf[0][g.css] = g.fmt(r.from); kf[1][g.css] = g.fmt(r.to);
    st.anim = el.animate(kf, { duration: Math.max(1, r.ms), easing: r.easing, fill: 'forwards', composite: g.comp });
    /* A finished fill-forwards animation that a later one on the same property
       "overrides" is auto-removed — even when both compose with `add` — so a
       settled x glide vanished once a y glide ran (measured). One live
       animation per channel is kept, so persisting cannot pile up. */
    if (st.anim.persist) st.anim.persist();
    st.sol = sol; st.t0 = now; st.value = target;
    return st.anim;
  }

  /* ── 4 · GESTURE ─────────────────────────────────────────────────────
     Hysteresis ~10 px; 1:1 from the GRAB point; velocity from a 90 ms history;
     rubber band past bounds; projection, then the nearest snap to THAT. */
  function draggable(el, opts) {
    opts = opts || {};
    var axis = opts.axis || 'y', prop = axis === 'x' ? 'x' : 'y';
    var getBounds = opts.bounds || function () { return null; };
    var snapTo = opts.snap || null, HYST = opts.hysteresis == null ? 10 : opts.hysteresis;
    var onEnd = opts.onEnd || function () {}, onMove = opts.onMove || function () {}, onStart = opts.onStart || function () {};
    var onFrame = opts.onFrame || null;
    var dragging = false, armed = false, caught = false, grab = 0, base = 0, id = null, hist = [];
    function point(e) { return axis === 'x' ? e.clientX : e.clientY; }
    function down(e) {
      if (e.button != null && e.button !== 0) return;
      armed = true; dragging = false; id = e.pointerId; grab = point(e);
      caught = halt();                                    /* catch it where it is */
      base = readCurrent(el, prop);
      hist = [{ t: global.performance.now(), v: grab }];
      /* Moves are heard on the window while armed: a grab at an edge that
         leaves the element on its first move (a sheet's top edge pulled up)
         must still arm. Capture follows at the hysteresis, so a press on a
         button inside keeps its click. */
      global.addEventListener('pointermove', move, true);
    }
    /* Stop a settle in flight AND forget it: re-aiming the stopped spring
       later would restart from where it was caught, not where it was dragged. */
    function halt() {
      var live = el.__m && el.__m[prop];
      if (!live) return false;
      live.stop(); el.__m[prop] = null; moving(el, false);
      return true;
    }
    function move(e) {
      if (!armed || e.pointerId !== id) return;
      var p = point(e), delta = p - grab;
      if (!dragging) {
        if (Math.abs(delta) < HYST) return;
        dragging = true;
        capture(el, id);
        el.setAttribute('data-m-dragging', '');
        grab = p; delta = 0;
        onStart(base, e);
      }
      var next = base + delta, b = getBounds();
      if (b) {
        if (next < b.min) next = b.min - SP.rubber(b.min - next, b.size || 300);
        else if (next > b.max) next = b.max + SP.rubber(next - b.max, b.size || 300);
      }
      hist.push({ t: global.performance.now(), v: p });
      while (hist.length > 2 && global.performance.now() - hist[0].t > 90) hist.shift();
      WRITERS[prop](el, next);
      onMove(next, e);
    }
    function up(e) {
      if (!armed || (id != null && e.pointerId !== id)) return;
      armed = false;
      global.removeEventListener('pointermove', move, true);
      if (!dragging) {
        id = null;
        /* a tap caught it mid-settle: land it on a snap, not between two */
        if (caught) settle(0);
        return;
      }
      dragging = false;
      el.removeAttribute('data-m-dragging');
      if (el.releasePointerCapture) { try { el.releasePointerCapture(id); } catch (err) { /* already released */ } }
      id = null;
      var now = global.performance.now(), first = hist[0], last = hist[hist.length - 1];
      var dt = (last.t - first.t) / 1000, velocity = dt > 0.001 ? (last.v - first.v) / dt : 0;
      if (now - last.t > 120) velocity = 0;               /* paused before lifting */
      settle(velocity);
    }
    function settle(velocity) {
      var here = readCurrent(el, prop), landing = here + SP.project(velocity, opts.decelerationRate), target = landing;
      if (snapTo) {
        var pts = typeof snapTo === 'function' ? snapTo() : snapTo;
        target = pts.reduce(function (best, q) { return Math.abs(q - landing) < Math.abs(best - landing) ? q : best; }, pts[0]);
      } else { var b = getBounds(); if (b) target = Math.max(b.min, Math.min(b.max, landing)); }
      /* A gesture HAD momentum, so its settle may overshoot; a tap has none. */
      springTo(el, prop, target, { spring: Math.abs(velocity) > 220 ? 'move' : 'toggle', frame: onFrame,
        done: function () { onEnd(target, velocity); } });
    }
    el.addEventListener('pointerdown', down);
    global.addEventListener('pointerup', up);
    global.addEventListener('pointercancel', up);
    return {
      destroy: function () {
        el.removeEventListener('pointerdown', down); global.removeEventListener('pointermove', move, true);
        global.removeEventListener('pointerup', up); global.removeEventListener('pointercancel', up);
      },
      to: function (v, spring) { return springTo(el, prop, v, { spring: spring, frame: onFrame }); }
    };
  }

  /* ── 5 · MAGNETIC DETENT ──────────────────────────────────────────────────
     The fold slider: the value follows
     the finger on a spring, magnets at the detents pull it in, and a second,
     raw "stretch" track shows the difference as rubber: the thumb widens by
     t px and squashes to scaleY(1 − 0.0025·t), anchored on the trailing side.
     t is a decayed overshoot, so a hard pull saturates instead of tearing. */
  function detent(el, opts) {
    opts = opts || {};
    var dets = (opts.detents || [0, 1 / 3, 1]).slice().sort(function (a, b) { return a - b; });
    var mag = opts.magnet || {}, R = mag.radius == null ? 0.08 : mag.radius, K = mag.strength == null ? 0.8 : mag.strength;
    var SMAX = opts.stretchMax == null ? 24 : opts.stretchMax;
    var thumb = opts.thumb || el.querySelector('[data-detent-thumb]');
    var input = el.querySelector('input[type="range"]');
    var labels = opts.labels || null;
    var value = opts.value != null ? opts.value : dets[0], index = nearestIndex(value);
    var dragging = false, grabOff = 0, hist = [], raw = value, stretch = 0;
    function nearestIndex(v) { var bi = 0; dets.forEach(function (d, i) { if (Math.abs(d - v) < Math.abs(dets[bi] - v)) bi = i; }); return bi; }
    function magnet(r) {
      for (var i = 0; i < dets.length; i++) if (Math.abs(r - dets[i]) < R) return dets[i] + (r - dets[i]) * (1 - K);
      return Math.max(dets[0], Math.min(dets[dets.length - 1], r));
    }
    function paint(v) {
      value = v;
      el.style.setProperty('--detent-value', +v.toFixed(5));
      var pct = Math.round(v * 100), i = nearestIndex(v);
      var target = thumb || input;
      if (thumb) {
        thumb.setAttribute('aria-valuenow', pct);
        thumb.setAttribute('aria-valuetext', pct + '%' + (labels ? ', ' + labels[i] : ''));
      }
      if (input && document.activeElement !== input) input.value = pct;
      if (input && labels) input.setAttribute('aria-valuetext', pct + '%, ' + labels[i]);
      if (opts.onInput) opts.onInput(v);
      return target;
    }
    var stretchDir = 1;
    function paintStretch(t, dir) {
      stretch = t;
      el.style.setProperty('--detent-stretch', +t.toFixed(3) + 'px');
      el.style.setProperty('--detent-squash', +(1 - 0.0025 * t).toFixed(5));
      if (dir) { stretchDir = dir; el.style.setProperty('--detent-dir', dir); }
    }
    var pos = SP ? SP.Driven('follow', value, function (v) { paint(v); }) : null;
    var rel = SP ? SP.Driven('snap', 0, function (t) { paintStretch(Math.max(0, t)); }) : null;
    function width() { return el.getBoundingClientRect().width || 1; }
    function toValue(clientX) { var r = el.getBoundingClientRect(); return (clientX - r.left - grabOff) / (r.width || 1); }
    function commit(i, animate) {
      index = i;
      el.setAttribute('data-detent-index', i);
      go(dets[i], animate, function () { if (opts.onChange) opts.onChange(dets[i], i); });
    }
    function go(v, animate, done) {
      if (!animate || rm() || !pos) { if (pos) pos.set(v); paint(v); if (done) done(); return; }
      pos.to(v, done);
    }
    function down(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      var r = el.getBoundingClientRect(), onThumb = thumb && thumb.contains(e.target);
      grabOff = onThumb ? e.clientX - (r.left + value * r.width) : 0;   /* 1:1 from the grab point */
      capture(el, e.pointerId);
      el.setAttribute('data-m-dragging', '');
      hist = [{ t: global.performance.now(), v: e.clientX }];
      if (rel) rel.stop();
      move(e);
    }
    function move(e) {
      if (!dragging) return;
      raw = toValue(e.clientX);
      hist.push({ t: global.performance.now(), v: e.clientX });
      while (hist.length > 2 && global.performance.now() - hist[0].t > 90) hist.shift();
      var tgt = magnet(raw);
      if (rm() || !pos) paint(tgt); else pos.to(tgt);
      var over = Math.abs(raw - tgt) * width();
      paintStretch(rm() ? 0 : SMAX * (1 - Math.exp(-over / SMAX)), raw >= tgt ? 1 : -1);
    }
    function up(e) {
      if (!dragging) return;
      dragging = false;
      el.removeAttribute('data-m-dragging');
      var first = hist[0], last = hist[hist.length - 1], dt = (last.t - first.t) / 1000;
      var vel = dt > 0.001 && global.performance.now() - last.t < 120 ? (last.v - first.v) / dt / width() : 0;
      var landing = magnet(raw) + (SP ? SP.project(vel * 1000, 0.99) / 1000 : 0);
      if (rel && !rm()) { rel.set(stretch); rel.to(0); } else paintStretch(0);
      commit(nearestIndex(landing), true);
    }
    function key(e) {
      var i = index;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') i = Math.min(dets.length - 1, index + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') i = Math.max(0, index - 1);
      else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = dets.length - 1; else return;
      e.preventDefault(); commit(i, true);
    }
    function onRange() { commit(nearestIndex(input.value / 100), true); }
    if (thumb && !input) {
      thumb.setAttribute('role', 'slider');
      if (!thumb.hasAttribute('tabindex')) thumb.tabIndex = 0;
      thumb.setAttribute('aria-valuemin', '0'); thumb.setAttribute('aria-valuemax', '100');
      thumb.addEventListener('keydown', key);
    }
    if (input) input.addEventListener('input', onRange);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    global.addEventListener('pointerup', up);
    global.addEventListener('pointercancel', up);
    paint(value); paintStretch(0, 1);
    el.setAttribute('data-detent-index', index);
    return {
      get value() { return value; }, get index() { return index; }, get stretch() { return stretch; },
      get direction() { return stretchDir; },
      set: function (v, animate) { commit(nearestIndex(v), animate !== false); },
      /* Follow a value someone else is driving (a programmatic fold): paint it
         and move the spring there, so a grab continues from where the thumb
         really is — without snapping to a detent or firing onChange. Arrow
         keys step from the nearest detent. Driven.set keeps the velocity of
         successive calls, so a grab mid-fold inherits the motion. */
      setValue: function (v) {
        v = Math.max(dets[0], Math.min(dets[dets.length - 1], +v || 0));
        raw = v; index = nearestIndex(v);
        el.setAttribute('data-detent-index', index);
        if (pos) pos.set(v); else paint(v);
      },
      destroy: function () {
        el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
        global.removeEventListener('pointerup', up); global.removeEventListener('pointercancel', up);
        if (thumb) thumb.removeEventListener('keydown', key);
        if (input) input.removeEventListener('input', onRange);
        if (pos) pos.stop(); if (rel) rel.stop();
      }
    };
  }

  /* ── 6 · NAVIGATION: typed view transitions ───────────────────────────────
     Types (Chrome 125, Safari 18.2, Firefox 147) let CSS pick the choreography
     with :active-view-transition-type(); html[data-nav] stays for engines
     without them. View transitions ignore reduced motion by themselves.
     ONE AT A TIME: a second startViewTransition skips the running one — its
     ready/updateCallbackDone reject ("AbortError: Transition was skipped",
     unhandled), the page jumps to its end, and its cleanup deleted the NEW
     one's data-nav. So a call made while one runs waits for it; calls that
     pile up behind it apply their updates at once and only the latest
     animates (quick clicks land on the last view, never replay each one).
     {interrupt: true} skips the running transition instead. Every
     transition's promises are handled, so nothing surfaces unhandled. */
  var navRun = null, navWait = [];
  function quiet(p) { if (p && p.then) p.then(null, function () {}); }
  function navigate(update, opts) {
    opts = opts || {};
    if (navRun && !opts.interrupt) return new Promise(function (resolve) { navWait.push({ update: update, opts: opts, resolve: resolve }); });
    return navStart(update, opts);
  }
  function navStart(update, opts) {
    var root = document.documentElement;
    if (!document.startViewTransition || rm()) return Promise.resolve(update());
    var dir = opts.direction || 'forward', types = [dir].concat(opts.types || []), t;
    var run = navRun = {};
    root.dataset.nav = dir;
    try { t = document.startViewTransition({ update: update, types: types }); }
    catch (e) {
      try { t = document.startViewTransition(update); }
      catch (e2) { navRun = null; delete root.dataset.nav; navNext(); return Promise.resolve(update()); }
    }
    quiet(t.ready); quiet(t.updateCallbackDone);
    function clean() {
      if (navRun !== run) return;                         /* interrupted: the new one owns data-nav */
      navRun = null; delete root.dataset.nav;
      navNext();
    }
    return t.finished.then(clean, clean);
  }
  function navNext() {
    if (!navWait.length) return;
    var jobs = navWait.splice(0), last = jobs.pop();
    jobs.forEach(function (j) {
      try { Promise.resolve(j.update()).then(j.resolve, j.resolve); }
      catch (e) { j.resolve(); if (global.console) console.error(e); }
    });
    try { navStart(last.update, last.opts).then(last.resolve, last.resolve); }
    catch (e) { last.resolve(); if (global.console) console.error(e); }
  }
  var names = new Set();
  function shared(el, name) {
    if (names.has(name) && el.style.getPropertyValue('--m-name') !== name)
      throw new Error('MOTION: view-transition-name "' + name + '" is already taken');
    names.add(name);
    el.classList.add('m-shared');
    el.style.setProperty('--m-name', name);
    return function release() { names.delete(name); el.style.removeProperty('--m-name'); el.classList.remove('m-shared'); };
  }

  /* ── 7 · ACKNOWLEDGEMENT + CONTENT TRANSITION ────────────────────── */
  function attention(el, kind) {
    var cls = 'm-' + (kind || 'pop');
    el.classList.remove(cls);
    void el.offsetWidth;                                  /* the reflow that restarts it */
    el.classList.add(cls);
    var off = function () { el.classList.remove(cls); el.removeEventListener('animationend', off); };
    el.addEventListener('animationend', off);
    return el;
  }
  function swap(host, node, opts) {
    opts = opts || {};
    var old = host.firstElementChild;
    host.classList.add('m-swap');
    if (opts.off) host.classList.add('m-off');
    if (!old) { host.appendChild(node); return; }
    if (rm()) { host.replaceChildren(node); return; }
    old.classList.add('m-out'); node.classList.add('m-in');
    host.appendChild(node);
    old.addEventListener('animationend', function () { old.remove(); }, { once: true });
    setTimeout(function () { if (old.isConnected) old.remove(); }, 900);   /* hidden pages */
  }

  /* ── 8 · MOUNT ───────────────────────────────────────────────────────────── */
  function mount(root) {
    root = root || document;
    var pending = [].slice.call(root.querySelectorAll('[data-m-enter]')).filter(function (el) { return !el.__mEnter; });
    pending.forEach(function (el) { el.__mEnter = true; });
    var fire = function (el) { el.classList.add('m-enter-' + (el.dataset.mEnter || 'up')); };
    if (pending.length && typeof IntersectionObserver !== 'undefined') {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { fire(e.target); io.unobserve(e.target); } });
      }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });
      pending.forEach(function (el) { io.observe(el); });
      setTimeout(function () { pending.forEach(fire); }, 1600);   /* IO may never fire when hidden */
    } else pending.forEach(fire);
    root.querySelectorAll('[data-m-press]').forEach(function (el) { el.classList.add('m-press'); });
    return pending.length;
  }

  function sup(fn) { try { return fn(); } catch (e) { return false; } }
  global.MOTION = {
    reduced: reduced, progress: progress, spring: springTo, glide: glide, draggable: draggable, detent: detent,
    navigate: navigate, shared: shared, attention: attention, swap: swap, mount: mount, read: readCurrent,
    supports: {
      viewTransition: typeof document !== 'undefined' && !!document.startViewTransition,
      viewTransitionTypes: sup(function () { return !!global.CSS && CSS.supports('selector(:active-view-transition-type(a))'); }),
      crossDocument: sup(function () { return !!global.CSSViewTransitionRule; }),
      startingStyle: sup(function () { return CSS.supports('transition-behavior', 'allow-discrete'); }),
      interpolateSize: sup(function () { return CSS.supports('interpolate-size', 'allow-keywords'); }),
      scrollTimeline: sup(function () { return CSS.supports('animation-timeline', 'view()'); }),
      linearEasing: sup(function () { return CSS.supports('transition-timing-function', 'linear(0, 1)'); })
    }
  };
})(window);
