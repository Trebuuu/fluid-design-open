/* test-motion.mjs — node tests for spring.js, anim.js, fg3-springs.css and the
   generated reduced-motion twin in fg3-motion.css (via gen-springs --check).

     node tools/test-motion.mjs          run the suite, then prove it can fail
     node tools/test-motion.mjs --quick  suite only (no mutants)

   "See it red first" is built in: after the suite passes on the real sources,
   each MUTANT below re-runs the suite on a deliberately broken copy of one
   engine and the run FAILS unless the named group goes red. A check that
   passes on broken code is not a check. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = {
  spring: readFileSync(path.join(ROOT, 'assets/spring.js'), 'utf8'),
  anim: readFileSync(path.join(ROOT, 'assets/anim.js'), 'utf8'),
};

function load(src) {
  const sb = { console: { warn() {}, log() {} } }; sb.globalThis = sb;
  vm.runInNewContext(src.spring, sb, { filename: 'spring.js' });
  vm.runInNewContext(src.anim, sb, { filename: 'anim.js' });
  return { S: sb.SPRING, A: sb.ANIM };
}
/* spring.js on a fake clock: rAF and timers queue until advance() runs them.
   advance(ms, frames=false) is a hidden page (timers only, no rAF). */
function clocked(src) {
  let now = 1000, id = 0;
  const frames = [], timers = [];
  const drop = (list, i) => { const k = list.findIndex(x => x.id === i); if (k >= 0) list.splice(k, 1); };
  const sb = { console: { warn() {}, log() {} }, performance: { now: () => now },
    requestAnimationFrame: fn => { frames.push({ id: ++id, fn }); return id; }, cancelAnimationFrame: i => drop(frames, i),
    setTimeout: (fn, ms) => { timers.push({ id: ++id, at: now + (ms || 0), fn }); return id; }, clearTimeout: i => drop(timers, i) };
  sb.globalThis = sb;
  vm.runInNewContext(src.spring, sb, { filename: 'spring.js' });
  const advance = (ms, withFrames) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 1000 / 60);
      if (withFrames) frames.splice(0).forEach(f => f.fn(now));
      timers.filter(t => t.at <= now).forEach(t => { drop(timers, t.id); t.fn(); });
    }
  };
  return { S: sb.SPRING, advance, pending: () => ({ frames: frames.length, timers: timers.length }) };
}
/* worst |CSS linear() − solver| over q = 0..1, what the page PLAYS */
function playWorst(s, lin, N = 1000) {
  let worst = 0; const T = s.settlingDuration;
  for (let i = 0; i <= N; i++) { const q = i / N; worst = Math.max(worst, Math.abs(linearAt(lin, q) - s.at(q * T))); }
  return worst;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
/* Evaluate a CSS linear() at input q (0..1), for checking what CSS will play. */
function linearAt(str, q) {
  const pts = str.slice(7, -1).split(',').map(s => { const [v, p] = s.trim().split(/\s+/); return [parseFloat(p) / 100, +v]; });
  for (let i = 1; i < pts.length; i++) if (q <= pts[i][0]) {
    const [p0, v0] = pts[i - 1], [p1, w1] = pts[i];
    return p1 === p0 ? w1 : v0 + (w1 - v0) * (q - p0) / (p1 - p0);
  }
  return pts[pts.length - 1][1];
}

/* ── the 111 distinct expressions harvested from Duo/Pro/Air ── */
const REAL = ["a0b","a0t - 150vh","b","a0t - 100vh","a0b + 100vh","max(a0t - (50vh - 50a0h), a0b - 100vh + h)","t - 50vh + 50h","t - 120vh","t - 100vh","t - 150vh","a0t - 100vh + a0h + var(--global-section-aap-padding) * .5","a0t - (50vh - 50a0h)","a0b - 90vh","a1b + 50vh","b + 100vh","t - 200vh","a0t - 200vh","a0t - 25vh","max(a0t - 10vh, a0b - 100vh + h)","t - 70vh","t - 50vh","(b - 100vh) + 20px","t - 20px","b + 100%","t + 60h - 100vh","b - 50vh","t - 190vh","a0t - 10vh","a0t","a0t - 75vh","a0b - 75vh","t - 85vh","t","a0b + 150vh","a0t - 15vh","a0t + 100vh","t - 100vh + 60h","t - 100vh + 100a0h","a0t - 100vh + 60a0h","a1b - 75vh","a0t - 50px","a0b - 100vh","a1t - 100vh","a0t - 5vh","a0t + 75vh","a0t - 65vh","a0t + 150vh","t - (70vh + var(--r-localnav-height))","b-20vh","t - css(--product-viewer-entice-trigger-position)","b - css(--r-localnav-height)","t + 100a0h - css(--r-localnav-height)","a1b","css(--r-globalnav-height)","-500px","a0t + 10px","a0t + a0h + 50vh","b + 50vh","a0t + 50a0h - 50vh - css(--r-localnav-height) / 2","css(--trigger-video)","a0t - 250vh","a0t - 120vh","a0t - 40vh","a0t - 20vh","a0t + 5vh","a0t - 80vh","a0t + 100px","a0t - 110vh","a0t - 90vh","t-40vh","t - 250vh","a0b + 50vh","a0t - 100vh + 80px","a0t - 140vh","a1b + 100vh","a0t - 100vh + css(--global-section-padding)","a0b - 50a0h - 50vh","a0t + 10vh","a0t + 25vh","a1t - 100vh + 130px","a0t - 100px - 75vh","a0t - 230vh","a0t + 90vh","a0t - 50vh","a0t - 220vh","a0t + 20vh","a0t + 80vh","t - 100vh - 100h + (a0h * css(--front-hardware-start) * css(--medium-large))","t - 75vh - 100h - css(--front-copy-offset) + (a0h * css(--front-hardware-start) * 0.75 * css(--medium-large))","t - 25vh - css(--front-copy-offset) + (a0h * css(--front-hardware-end) * 0.25 * css(--medium-large))","css(--tom-scrim-fade-in-kf-start, a1)","css(--tom-scrim-fade-in-kf-end, a1)","css(--tom-scrim-fade-out-kf-start, a1)","css(--tom-scrim-fade-out-kf-end, a1)","css(--tom-copy-fade-out-kf-start, a0)","css(--tom-copy-fade-out-kf-end, a0)","css(--tom-will-change-start, a0)","css(--tom-will-change-end, a0)","a0t - 45vh","a0t - 42vh","t + 100a0h","0px","100000px","a0b - 25vh","a0b - 5vh","t - 30vh","t - 10vh","a0b - 40vh","t-25vh","t-55vh","t - 110vh"];

/* target top 3000 h 800; anchor0 5000 h 2000; anchor1 8000 h 500; viewport 1440×1000 */
const BOX = { null: { t: 3000, h: 800, b: 3800, w: 1200, l: 120, r: 1320 }, 0: { t: 5000, h: 2000, b: 7000, w: 1440, l: 0, r: 1440 },
              1: { t: 8000, h: 500, b: 8500, w: 1440, l: 0, r: 1440 } };
const VARS = { '--r-localnav-height': '52', '--tom-copy-fade-out-kf-start': 't - 30vh', '--global-section-aap-padding': '100',
  '--parallax-offset-start': '50px', '--trigger-video': 't - 110vh', '--front-hardware-start': '0.2', '--medium-large': '1',
  '--front-copy-offset': '0', '--tom-scrim-fade-in-kf-start': 'a0t - 110vh', '--product-viewer-entice-trigger-position': '50vh',
  '--r-globalnav-height': '44', '--tom-crop-corner-radius': '40' };
const ctx = (vars = VARS, strict = true) => ({
  vh: 1000, vw: 1440, box: r => BOX[r],
  css: n => { if (n in vars) return vars[n]; if (strict) throw new Error('no ' + n); return '0'; },
  prop: n => ({ offsetWidth: 1200 })[n],
});

/* ═════════════════════════════ THE SUITE ═══════════════════════════════════ */
function suite(src) {
  const { S, A } = load(src);
  const groups = {};
  const G = (name, fn) => { const fails = []; try { fn((ok, msg) => { if (!ok) fails.push(msg); }); } catch (e) { fails.push('threw: ' + e.message); } groups[name] = fails; };

  G('spring:conversions', ok => {
    const a = S.Spring({ duration: 0.5, bounce: 0.3 });
    ok(a.mass === 1 && near(a.stiffness, 157.9, 0.05) && near(a.damping, 17.6, 0.05),
      `Spring(0.5, 0.3) → (${a.mass}, ${a.stiffness.toFixed(2)}, ${a.damping.toFixed(2)}); the documented values are (1, 157.9, 17.6)`);
    const b = S.Spring({ mass: 1, stiffness: 100, damping: 10 });
    ok(near(b.duration, 0.63, 0.005) && near(b.bounce, 0.5, 1e-9),
      `Spring(m1 k100 c10) → (${b.duration.toFixed(3)}, ${b.bounce}); the documented values are (0.63, 0.5)`);
    const c = S.Spring({ duration: 0.4, bounce: -0.25 });   /* flattened branch ζ = 1/(1+b) */
    ok(near(c.zeta, 1 / 0.75, 1e-9) && near(c.bounce, -0.25, 1e-9), 'negative bounce round-trips');
  });

  G('spring:named-set', ok => {
    const want = { smooth: [.5, 0], snappy: [.5, .15], bouncy: [.5, .3], interactive: [.15, .14], press: [.22, .12],
      toggle: [.32, .15], move: [.46, .18], sheet: [.55, .10], morph: [.6, .22], select: [.4, .15], lift: [.25, 0],
      hold: [.356, .41], follow: [.196, .1], settle: [.63, 0], card: [.5, .16], tour: [.5, .42], snap: [.32, 0], drop: [.63, .6] };
    for (const [n, [d, b]] of Object.entries(want)) {
      const s = S.Spring(n);
      ok(near(s.duration, d, 0.005) && near(s.bounce, b, 0.005), `${n}: (${s.duration.toFixed(3)}, ${s.bounce.toFixed(3)}) ≠ (${d}, ${b})`);
    }
    for (const [n, k, c] of [['drop', 100, 8], ['bubble', 100, 10], ['content', 100, 20], ['dots', 200, 20]]) {
      const s = S.Spring(n); ok(s.stiffness === k && s.damping === c, `${n}: k${s.stiffness} c${s.damping} ≠ k${k} c${c}`);
    }
    for (const [n, m, k, c, ms] of [['nav-in', 1.5, 28, 28, 600], ['nav-out', 0.75, 20, 20, 400]]) {
      const s = S.Spring(n); ok(s.mass === m && s.stiffness === k && s.damping === c && s.ms() === ms, `${n}: m${s.mass} k${s.stiffness} c${s.damping} ${s.ms()}ms`);
    }
  });

  G('spring:mkc-easing', ok => {
    /* The SpringEasing: ζ ≥ 1 → critical formula with B = ω0 − v0; span =
       (first t where solve === 1 for 16 steps of 1/6 s) × 1/6. */
    const E = S.mkcEasing(1.5, 28, 28, 1), w = Math.sqrt(28 / 1.5);
    ok(E.zeta > 2 && near(E.span, 2, 1e-9), `nav-in: ζ ${E.zeta.toFixed(3)}, span ${E.span} (expected ζ 2.16, span 2.0)`);
    for (const p of [0.1, 0.3, 0.7]) {
      const t = p * E.span, want = 1 - (1 + (w - 1) * t) * Math.exp(-w * t);
      ok(near(E(p), want, 1e-12), `nav-in E(${p}) = ${E(p)} ≠ critical ${want}`);
    }
    ok(E(0) === 0 && E(1) === 1, 'endpoints exact');
    const s = S.Spring('nav-in');
    ok(near(s.at(0.3), E(0.5), 1e-9), 'Spring("nav-in").at(0.3 s) plays the fixed-length curve over 600 ms');
  });

  G('spring:linear-accuracy', ok => {
    /* What CSS will actually PLAY: the emitted linear() at q must equal the
       spring at q·settle. sampling time p^1.65 at position p would be wrong. */
    for (const n of ['smooth', 'snappy', 'bouncy', 'morph', 'drop', 'nav-in']) {
      const s = S.Spring(n), lin = s.linear(), T = s.settlingDuration;
      let worst = 0;
      for (let i = 1; i < 200; i++) { const q = i / 200; worst = Math.max(worst, Math.abs(linearAt(lin, q) - s.at(q * T))); }
      ok(worst < 0.006, `${n}: linear() deviates ${worst.toFixed(4)} from the spring`);
      ok(!/NaN|Infinity/.test(lin) && lin.endsWith('1 100%)'), `${n}: bad linear() tail`);
    }
  });

  G('spring:css-plays-solver', ok => {
    /* The bar the self-test holds every --sp-* to: CSS plays within .003 of
       the solver. 48 samples facet a bouncy overshoot (drop ζ .4 → .0031), so
       the density must follow the bounce — for the named set AND for any
       spring a page defines, down to ζ .2. */
    const cfgs = Object.keys(S.NAMED).map(n => [n, n]).concat([['ζ .45', { duration: 0.5, bounce: 0.55 }],
      ['ζ .3', { duration: 0.5, bounce: 0.7 }], ['ζ .2', { duration: 0.4, bounce: 0.8 }]]);
    for (const [n, cfg] of cfgs) {
      const s = S.Spring(cfg), w = playWorst(s, s.linear());
      ok(w <= 0.003, `${n}: linear() plays ${w.toFixed(4)} off the solver (bar .003)`);
    }
    /* the runtime re-emit (glide, DEVICE.fold) gets the same density */
    const d = S.Spring('drop'), r = d.linearFrom(0, 0, 100), U = r.to - r.from;
    let w = 0; for (let i = 0; i <= 1000; i++) { const q = i / 1000; w = Math.max(w, Math.abs(linearAt(r.easing, q) * U - r.at(q * r.settlingDuration))); }
    ok(w / 100 <= 0.003, `drop linearFrom plays ${(w / 100).toFixed(4)} off the solver`);
    ok(S.Spring('smooth').linear() === S.Spring('smooth').linear(48), 'a calm spring keeps 48 samples (no bloat)');
  });

  G('spring:driven-deadline', ok => {
    /* Hidden page: rAF never runs. The value must still land and onDone fire. */
    let C = clocked(src), log = [], done = 0;
    let D = C.S.Driven('snappy', 0, (v, vel, rest) => log.push([v, rest])).to(100, () => done++);
    C.advance(2500, false);
    const last = log[log.length - 1];
    ok(last && last[0] === 100 && last[1] === true && done === 1 && !D.running,
      `hidden page: last frame ${JSON.stringify(last)}, done ×${done}, running ${D.running}`);
    /* Visible page: rAF lands it; the deadline then finds it at rest (no second landing, no second done). */
    C = clocked(src); log = []; done = 0;
    D = C.S.Driven('snappy', 0, (v, vel, rest) => log.push([v, rest])).to(100, () => done++);
    C.advance(2500, true);
    ok(log.filter(f => f[1]).length === 1 && done === 1 && log.length > 20, `visible page: ${log.length} frames, ${log.filter(f => f[1]).length} landings, done ×${done}`);
    ok(C.pending().timers === 0, `no deadline left behind (${C.pending().timers})`);
    /* re-aim mid-flight while hidden: lands on the NEW target */
    C = clocked(src); log = []; done = 0;
    D = C.S.Driven('morph', 0, (v, vel, rest) => log.push([v, rest])).to(100, () => done++);
    C.advance(150, true); D.to(-40, () => done += 10); C.advance(3000, false);
    ok(log[log.length - 1][0] === -40 && done === 10, `re-aimed while hidden: ${JSON.stringify(log[log.length - 1])}, done ${done}`);
    /* stop() and set() cancel the deadline: nothing lands afterwards */
    C = clocked(src); log = []; done = 0;
    D = C.S.Driven('snappy', 0, (v, vel, rest) => log.push([v, rest])).to(100, () => done++);
    C.advance(50, true); D.stop(); const n = log.length, left = C.pending().timers; C.advance(2500, false);
    ok(log.length === n && done === 0 && left === 0, `stopped spring: ${log.length - n} frames after, done ×${done}, ${left} deadline(s) left armed`);
  });

  G('spring:linearFrom', ok => {
    const s = S.Spring('snappy');
    for (const [x0, v0, tgt] of [[0, 0, 100], [0, 900, 100], [40, -600, 100], [100, 300, 0]]) {
      const r = s.linearFrom(x0, v0, tgt), U = r.to - r.from;
      ok(r.from === x0 && near(r.to, tgt, 1e-9), `from/to ${r.from}→${r.to}`);
      /* initial slope of the CSS curve × U / T must be the seeded velocity */
      const q = 0.002, slope = linearAt(r.easing, q) / q * U / r.settlingDuration;
      ok(near(slope, v0, Math.max(25, Math.abs(v0) * 0.04)), `v0 ${v0}: CSS starts at ${slope.toFixed(1)} px/s`);
      ok(near(linearAt(r.easing, 1) * U + x0, tgt, 1e-6), 'lands on target');
    }
    const z = s.linearFrom(50, 400, 50);          /* zero-length move with velocity: out and back */
    ok(z.to !== z.from && near(linearAt(z.easing, 1), 0, 1e-9) && linearAt(z.easing, 0.2) > 0.1, 'zero-span move goes out and returns');
  });

  G('spring:layer', ok => {
    /* the fixed-step layer: fixed 1/60 step → identical state at 30/60/120 Hz. */
    const run = (hz, secs) => { const L = S.Layer('snappy', 0); L.setTarget(100); let v; for (let i = 0; i < Math.round(secs * hz); i++) v = L.step(1 / hz); return v; };
    const a = run(60, 0.5), b = run(120, 0.5), c = run(30, 0.5);
    ok(near(a, b, 1e-6) && near(a, c, 1e-6), `frame-rate dependence: 60Hz ${a} 120Hz ${b} 30Hz ${c}`);
    const a2 = run(60, 0.2), an = 100 * S.Spring('snappy').at(0.2);
    ok(near(a2, an, 3), `integrator ${a2.toFixed(2)} vs analytic ${an.toFixed(2)} at 0.2 s`);
    /* retarget keeps velocity: compare with a restart from rest at the same spot */
    const L = S.Layer('morph', 0); L.setTarget(100);
    for (let i = 0; i < 6; i++) L.step(1 / 60);
    const x1 = L.value, va = L.velocity; L.setTarget(-100); const vb = L.velocity;
    const R = S.Layer('morph', x1); R.setTarget(-100);
    for (let i = 0; i < 3; i++) { L.step(1 / 60); R.step(1 / 60); }
    ok(va > 100 && va === vb, `velocity before/after retarget ${va} / ${vb}`);
    ok(L.value > R.value + 5, `momentum carried: ${L.value.toFixed(1)} vs restart ${R.value.toFixed(1)}`);
    for (let i = 0; i < 400 && !L.atRest; i++) L.step(1 / 60);
    ok(L.atRest && L.value === -100, `rest: ${L.atRest} at ${L.value}`);
  });

  G('spring:driven-retarget', ok => {
    const s = S.Spring('morph'), f1 = s.from(0, 0, 1), t = 0.12, x = f1.at(t), v = f1.vel(t);
    const f2 = s.from(x, v, 0);
    ok(near(f2.at(0), x, 1e-12) && near(f2.vel(0), v, 1e-9), 'from() continues position AND velocity');
  });

  G('spring:gestures', ok => {
    ok(near(S.project(1000, 0.998), 499, 1e-6), 'project(1000 px/s) = 499 px');
    ok(near(S.rubber(100, 300), 300 * (1 - 1 / (100 * 0.55 / 300 + 1)), 1e-9), 'rubber band c = .55');
  });

  G('anim:cases', ok => {
    const c = ctx();
    const cases = [
      ['a0t - 100vh', 4000], ['a0b', 7000], ['t - 70vh', 2300], ['t - 50vh + 50h', 2900], ['b', 3800], ['a0b - 90vh', 6100],
      ['a0t - 100vh + 60a0h', 5200], ['max(a0t - (50vh - 50a0h), a0b - 100vh + h)', 6800],
      ['t - (70vh + var(--r-localnav-height))', 2248], ['css(--tom-copy-fade-out-kf-start, a0)', 2700],
      ['a0t - 100vh + a0h + var(--global-section-aap-padding) * .5', 6050], ['t + 60h - 100vh', 2480],
      ['(b - 100vh) + 20px', 2820], ['b + 100%', 4600], ['a1b + 50vh', 9000], ['-500px', -500], ['0', 0], [4, 4],
      ['css(--trigger-video)', 1900], ['css(--parallax-offset-start)', 50], ['css(--front-hardware-start) * a0h', 400],
      ['t - 100vh - 100h + (a0h * css(--front-hardware-start) * css(--medium-large))', 1600],
      /* `, a1` picks the element the value is READ from; the value is
         evaluated in the keyframe's own context (a0 stays a0). */
      ['css(--tom-scrim-fade-in-kf-start, a1)', 3900],
      ['t - css(--product-viewer-entice-trigger-position)', 2500], ['css(--r-globalnav-height)', 44],
      ['a0t + 50a0h - 50vh - css(--r-localnav-height) / 2', 5474], ['b-20vh', 3600],
      ['min(-6.25vw, -1 * ((100vw - 980px) / 2))', -230],
      /* the rest of the grammar */
      ['50 h', 400], ['l + 50%w', 720], ['r', 1320], ['90deg', 90], ['1rad', 180 / Math.PI], ['w > 1000 ? 1 : 2', 1],
      ['0 ?? 5', 0], ['t > 0 && 7', 7], ['clamp(150, 0, 100)', 100], ['lerp(0.25, 0, 200)', 50],
      ['easeInOutQuad(0.25)', 0.125], ['map(5, 0, 10, 100, 200)', 150], ['PI', Math.PI], ['prop(offsetWidth)', 1200],
      ['!0', true], ['2 * -h', -1600], ['a0t-100vh', 4000], ['.5 * 10px', 5],
    ];
    for (const [e, want] of cases) { const got = A.expr(e, c); ok(near(+got, +want, 1e-6), `${e}: got ${got} want ${want}`); }
    let threw = false; try { A.expr('t + ', c); } catch { threw = true; } ok(threw, 'a syntax error throws');
  });

  G('anim:real-expressions', ok => {
    ok(REAL.length === 111, 'harvest has 111 expressions');
    const c = ctx(VARS, false);
    for (const e of REAL) {
      let v; try { v = A.expr(e, c); } catch (err) { ok(false, `${e}: ${err.message}`); continue; }
      ok(typeof v === 'number' && isFinite(v), `${e}: ${v}`);
    }
  });

  G('anim:range-mapping', ok => {
    /* verified in Edge 153 to ≤ 0.0001 progress */
    const table = [
      ['t - 100vh', null, 'exit-crossing -100vh'], ['t - 70vh', null, 'exit-crossing -70vh'], ['t', null, 'exit-crossing 0%'],
      ['t + 25vh', null, 'exit-crossing 25vh'], ['t - 100vh + 60h', null, 'exit-crossing calc(60% - 100vh)'],
      ['t - 50vh + 50h', null, 'exit-crossing calc(50% - 50vh)'], ['b - 100vh', null, 'exit-crossing calc(100% - 100vh)'],
      ['b - 40vh', null, 'exit-crossing calc(100% - 40vh)'], ['b', null, 'exit-crossing 100%'],
      ['b + 50vh', null, 'exit-crossing calc(100% + 50vh)'], ['a0t - 100vh + 60a0h', 0, 'exit-crossing calc(60% - 100vh)'],
      ['a1b - 75vh', 1, 'exit-crossing calc(100% - 75vh)'], ['(b - 100vh) + 20px', null, 'exit-crossing calc(100% + 20px - 100vh)'],
      ['t - 85vh', null, 'exit-crossing -85vh'],
    ];
    for (const [e, ref, css] of table) {
      const r = A.rangeOf(e);
      ok(r && r.ref === ref && r.css === css, `${e} → ${r && r.css} (ref ${r && r.ref}), want ${css}`);
    }
    for (const e of ['max(a0t - 10vh, a0b - 100vh + h)', 'css(--trigger-video)', 'a0t - 100vh + h', '50t', '-500px', 'l + 10px', 't * 2'])
      ok(A.rangeOf(e) === null, `${e} must go to the JS path, got ${JSON.stringify(A.rangeOf(e))}`);
    /* the linear form evaluates to the same number as the interpreter */
    for (const e of REAL) {
      const L = A.linearize(e);
      if (!L || L.ref === undefined) continue;
      const B = BOX[L.ref], val = L.t * B.t + L.h * B.h + L.vh * 10 + L.vw * 14.4 + L.px;
      ok(near(val, A.expr(e, ctx(VARS, false)), 1e-6), `linearize(${e}) = ${val}`);
    }
  });

  G('anim:easing', ok => {
    const names = ['linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInSin', 'easeOutSin', 'easeInOutSin', 'easeInElastic',
      'easeOutElastic', 'easeInOutElastic', 'easeOutBack', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'easeInQuart', 'easeOutQuart',
      'easeInOutQuart', 'easeInQuint', 'easeOutQuint', 'easeInOutQuint'];
    ok(names.every(n => typeof A.EASE[n] === 'function') && Object.keys(A.EASE).length === 20, 'the 20 easings');
    ok(near(A.EASE.easeInOutQuad(0.25), 0.125, 1e-12) && near(A.EASE.easeOutCubic(0.5), 0.875, 1e-12), 'polynomials');
    ok(near(A.ease('bezier(.42,0,.58,1)')(0.5), 0.5, 1e-4) && near(A.ease('bezier(.42,0,.58,1)')(0.25), 0.129, 2e-3), 'bezier');
    ok(A.ease('spring(1.5,28,28,1)')(0.5) === S.mkcEasing(1.5, 28, 28, 1)(0.5), 'spring() easing is the fixed-length curve');
    ok(A.cssEasing('bezier(.42,0,.58,1)') === 'cubic-bezier(0.42,0,0.58,1)', 'bezier → cubic-bezier');
    /* bezier() is parsed with /\d*\.?\d+/g: the minus sign is dropped, so
       "bezier(-0.24,…)" is bezier(0.24,…). Same here, on
       both paths. cubic-bezier() keeps CSS's signed meaning, x clamped. */
    const airCss = A.cssEasing('bezier(-0.24,0.65,0.39,1.56)'), air = A.ease('bezier(-0.24,0.65,0.39,1.56)'), pos = A.ease('bezier(0.24,0.65,0.39,1.56)');
    ok(airCss === 'cubic-bezier(0.24,0.65,0.39,1.56)', `Air curve compiles to ${airCss}`);
    ok([0.1, 0.3, 0.6, 0.9].every(x => air(x) === pos(x)) && air(0.6) > 1, 'Air curve evaluates as the unsigned one, overshooting');
    ok(A.cssEasing('cubic-bezier(-0.24,0.65,0.39,1.56)') === 'cubic-bezier(0,0.65,0.39,1.56)', 'cubic-bezier x clamped to [0,1]');
    const lin = A.cssEasing('easeInOutQuad');
    let worst = 0; for (let i = 0; i <= 100; i++) worst = Math.max(worst, Math.abs(linearAt(lin, i / 100) - A.EASE.easeInOutQuad(i / 100)));
    ok(worst < 0.002, `easeInOutQuad as linear() off by ${worst}`);
  });
  return groups;
}

/* ═════════════════════════════ RUN ═════════════════════════════════════════ */
function report(groups, label) {
  let bad = 0, n = 0;
  for (const [g, fails] of Object.entries(groups)) {
    n++;
    if (fails.length) { bad++; if (label) { console.log(`  ✗ ${g}`); fails.slice(0, 6).forEach(f => console.log('      ' + f)); } }
    else if (label) console.log(`  ✓ ${g}`);
  }
  return { bad, n };
}
console.log('motion suite (real sources)');
const real = suite(SRC);
const r = report(real, true);

let genOK = true;
try { execFileSync(process.execPath, [path.join(ROOT, 'tools/gen-springs.mjs'), '--check'], { stdio: 'pipe' }); console.log('  ✓ generated CSS is current (fg3-springs.css; fg3-motion.css §13b mirrors §13)'); }
catch (e) { genOK = false; console.log('  ✗ generated CSS is stale: ' + String(e.stdout || e.stderr).trim()); }
const css = readFileSync(path.join(ROOT, 'assets/fg3-springs.css'), 'utf8');
const { S } = load(SRC);
const missing = Object.keys(S.NAMED).filter(n => !css.includes(`--sp-${n}: linear(`) || !css.includes(`--sp-${n}-ms:`));
if (missing.length || /NaN/.test(css)) { genOK = false; console.log('  ✗ fg3-springs.css misses ' + missing.join(', ')); }
else console.log(`  ✓ fg3-springs.css carries all ${Object.keys(S.NAMED).length} springs`);
/* what the page LOADS, not what spring.js would emit today */
const offCss = Object.keys(S.NAMED).map(n => { const m = new RegExp(`--sp-${n}: (linear\\([^;]*\\));`).exec(css); return [n, m ? playWorst(S.Spring(n), m[1]) : 1]; })
  .sort((a, b) => b[1] - a[1]);
if (offCss[0][1] > 0.003) { genOK = false; console.log(`  ✗ fg3-springs.css: ${offCss.filter(x => x[1] > 0.003).map(x => x[0] + ' ' + x[1].toFixed(4)).join(', ')} off the solver (bar .003)`); }
else console.log(`  ✓ every --sp-* in fg3-springs.css plays within .003 of the solver (worst ${offCss[0][0]} ${offCss[0][1].toFixed(4)})`);

let mutOK = true;
if (!process.argv.includes('--quick')) {
  /* Each mutant must turn its group red. */
  const MUTANTS = [
    ['spring', 'damping ratio off by 10 %', "return bounce >= 0 ? 1 - bounce :", "return bounce >= 0 ? 1 - bounce * 0.9 :", 'spring:conversions'],
    ['spring', 'linear() time-warp bug', "out.push(+fn(q).toFixed(5) + ' ' + +(q * 100).toFixed(3) + '%');", "out.push(+fn(q).toFixed(5) + ' ' + +(i / n * 100).toFixed(3) + '%');", 'spring:linear-accuracy'],
    ['spring', 'retarget zeroes velocity', "setTarget: function (t) {\n        target = t; atRest = false;", "setTarget: function (t) {\n        target = t; v = 0; atRest = false;", 'spring:layer'],
    ['spring', 'variable step (dt, not 1/60)', "while (acc >= STEP) { integrate(); acc -= STEP; }", "integrate(); acc = 0;", 'spring:layer'],
    ['spring', 'linearFrom drops velocity', "var sol = from(x0, v0, target), U = sol.scale", "var sol = from(x0, 0, target), U = sol.scale", 'spring:linearFrom'],
    ['spring', 'span quirk removed', "if (++quiet >= 16) return d * step;", "if (++quiet >= 16) return d;", 'spring:mkc-easing'],
    ['spring', '48 samples for every spring', "return toLinear(g, samples || samplesFor(g, 1.65), 1.65);", "return toLinear(g, samples || 48, 1.65);", 'spring:css-plays-solver'],
    ['spring', 'Driven relies on rAF alone', "raf = requestAnimationFrame(tick);\n        watch();", "raf = requestAnimationFrame(tick);", 'spring:driven-deadline'],
    ['spring', 'stop() leaves the deadline armed', "stop: function () { sol = null; if (raf) { cancelAnimationFrame(raf); raf = 0; } unwatch(); return this; }", "stop: function () { sol = null; if (raf) { cancelAnimationFrame(raf); raf = 0; } return this; }", 'spring:driven-deadline'],
    ['anim', 'vh unit reads vw', "if (u === 'vh') return 0.01 * n.n * ctx.vh;", "if (u === 'vh') return 0.01 * n.n * ctx.vw;", 'anim:cases'],
    ['anim', 'css(,aN) re-roots the context', "return raw === '' || raw == null ? undefined : evaluate(parse(String(raw).trim()), ctx);", "return raw === '' || raw == null ? undefined : evaluate(parse(String(raw).trim()), n.ref == null ? ctx : Object.assign({}, ctx, { box: function (r) { return ctx.box(r == null || r === 0 ? n.ref : r); } }));", 'anim:cases'],
    ['anim', 'h maps to 50 %', "if (L.h) terms.push(r4(L.h * 100) + '%');", "if (L.h) terms.push(r4(L.h * 50) + '%');", 'anim:range-mapping'],
    ['anim', 'easeInOutQuad wrong branch', "easeInOutQuad: function (e) { return e < 0.5 ? 2 * e * e :", "easeInOutQuad: function (e) { return e < 0.5 ? e * e :", 'anim:easing'],
  ];
  console.log('mutants (each must turn its group red)');
  for (const [file, label, from, to, group] of MUTANTS) {
    if (!SRC[file].includes(from)) { mutOK = false; console.log(`  ✗ mutant "${label}": anchor text not found in ${file}.js`); continue; }
    const src = { ...SRC, [file]: SRC[file].replace(from, to) };
    let groups; try { groups = suite(src); } catch (e) { groups = { [group]: ['load threw: ' + e.message] }; }
    const red = groups[group] && groups[group].length;
    if (!red) mutOK = false;
    console.log(`  ${red ? '✓' : '✗'} ${label} → ${group} ${red ? 'RED (' + groups[group][0].slice(0, 90) + ')' : 'stayed GREEN'}`);
  }
}

const ok = !r.bad && genOK && mutOK;
console.log(ok ? `\nPASS — ${r.n} groups green, mutants caught` : `\nFAIL — ${r.bad} group(s) red${genOK ? '' : ', springs css'}${mutOK ? '' : ', a mutant survived'}`);
process.exit(ok ? 0 : 1);
