// node test-geom.mjs <path-to-geom.js>
// Asserts that CSS `border-radius: r*rScale; corner-shape: superellipse(k)` (the TOKEN values)
// cuts the same diagonal inset as the continuous corner of nominal radius r, within 0.5 px,
// for r = 12, 18, 28, 44 — the inset measured off GEOM.contCorner()'s polyline (the path),
// never off the stored constant. Also: whole-curve Hausdorff, onset, capsule rule.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
const ctx = { console, Math, Map, Float32Array, Object, String, parseFloat, isFinite };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: file });
const G = ctx.GEOM;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

function diagonalOf(pts) {             // where x == y on a corner-local polyline
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], da = a.x - a.y, db = b.x - b.y;
    if (da === 0) return a.x;
    if (da * db < 0) { const t = da / (da - db); return a.x + (b.x - a.x) * t; }
  }
  return NaN;
}
function seCorner(R, k, m = 3000) {    // Lamé corner, corner-local (distance from the edges)
  const n = G.expFromK(k), o = [];
  for (let i = 0; i <= m; i++) {
    const th = i / m * Math.PI / 2;
    o.push({ x: R * (1 - Math.pow(Math.cos(th), 2 / n)), y: R * (1 - Math.pow(Math.sin(th), 2 / n)) });
  }
  return o;
}
function hausdorff(A, B) {
  const one = (P, Q) => { let mx = 0; for (const p of P) { let m = Infinity; for (const q of Q) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < m) m = d; } if (m > mx) mx = m; } return mx; };
  return Math.max(one(A, B), one(B, A));
}

const C = G.CONTINUOUS;
console.log('tokens: k =', C.k, ' rScale =', C.rScale, ' (exact', C.kExact.toFixed(4), '/', C.rScaleExact.toFixed(5) + ')');
for (const r of [12, 18, 28, 44]) {
  const cont = G.contCorner(r, 400);
  const contInset = diagonalOf(cont);
  const c = G.continuous(r);                         // what CSS will be given
  const cssInset = G.superellipseInset(c.radius, c.k);
  const circleInset = r * (1 - Math.SQRT1_2);
  const v2Inset = G.superellipseInset(r, 2);
  const onsetIos = Math.max(...cont.map(p => p.x)), onsetCss = c.radius;
  const h = hausdorff(cont, seCorner(c.radius, c.k));
  ok(Math.abs(cssInset - contInset) <= 0.5,
    `r=${r}: diagonal inset CSS ${cssInset.toFixed(3)}px vs continuous ${contInset.toFixed(3)}px (Δ ${(cssInset - contInset).toFixed(3)}; circle ${circleInset.toFixed(2)}, plain squircle ${v2Inset.toFixed(2)})`);
  ok(Math.abs(onsetCss - onsetIos) <= 0.5,
    `r=${r}: curvature onset CSS ${onsetCss.toFixed(2)}px vs continuous ${onsetIos.toFixed(2)}px`);
  ok(h <= 0.02 * r + 0.1, `r=${r}: whole-corner Hausdorff ${h.toFixed(3)}px (≤ ${(0.02 * r + 0.1).toFixed(2)})`);
}
const cap = G.continuous(18, 200, 36);
ok(cap.capsule && cap.k === 1 && cap.radius === 18, `capsule: continuous(18, 200x36) → radius ${cap.radius}, k ${cap.k} (true semicircle)`);
const notCap = G.continuous(12, 300, 200);
ok(!notCap.capsule && notCap.k === C.k, `card: continuous(12, 300x200) keeps k ${notCap.k}`);
// contPath closes and starts where the corner extent says
const d = G.contPath(200, 100, 20);
ok(/^M30\.573 0 /.test(d) && / Z$/.test(d), 'contPath starts at 1.5287 r on the top edge and closes');
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
