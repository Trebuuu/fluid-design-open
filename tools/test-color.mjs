/* test-color.mjs — assert the GENERATED colour stylesheets, not the engine's opinion of them.

     node tools/test-color.mjs          exit 1 on any failure

   Contrast is recomputed here with its own WCAG maths and 8-bit compositing, from
   the values in the CSS files on disk, so a bug in palette.js's fit cannot pass
   its own exam. Every list is DERIVED: the role list from SPEC.md §2 and from the
   var() reads of every other stylesheet/script/page; the system colours from
   the table below; the brand colour from the default palette. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => readFileSync(path.join(ROOT, p), 'utf8');
const win = {}; new Function('window', rd('assets/palette.js'))(win);
const P = win.PALETTE;

let pass = 0, fail = 0, skip = 0;
const T = (ok, msg) => { ok ? pass++ : fail++; if (!ok || process.env.VERBOSE) console.log((ok ? '  ok   ' : '  FAIL ') + msg); };
const S = msg => { skip++; console.log('  SKIP ' + msg); };

/* ── own colour maths ───────────────────────────────────────────────────── */
const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
function rgba(c) {
  c = c.trim();
  if (c[0] === '#') { const h = c.slice(1); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(1); }
  const n = c.match(/-?[\d.]+/g).map(Number); return n.length > 3 ? n : n.concat(1);
}
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/* The framebuffer composites PREMULTIPLIED in 8 bits: the alpha is rounded to
   a byte and each term is rounded on its own. Measured in Edge 153 on
   CSS-painted cells (3 inks × 2 grounds × 5 alphas): this matched 26 of 30
   exactly and the rest within one step; the float formula matched 17, and
   read --ok-strong on its wash over --bg-2 as 4.52:1 where the page has 4.49. */
const over = (f, b) => { const a8 = Math.round(f[3] * 255); return [0, 1, 2].map(i => Math.round(f[i] * a8 / 255) + Math.round(b[i] * (255 - a8) / 255)); };
/* …and "within one step" is a real step: text on a tinted wash is held with
   its ground moved one step toward the ink in every channel. */
function crLsb(fg, ...stack) {
  const f = rgba(fg), g = flat(stack).map((v, i) => Math.max(0, Math.min(255, v + Math.sign(f[i] - v))));
  const a = lum(over(f, g)), b = lum(g);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const flat = stack => stack.slice(1).reduce((acc, c) => over(rgba(c), acc), rgba(stack[0]).slice(0, 3));
function cr(fg, ...stack) {
  const g = flat(stack), f = over(rgba(fg), g), a = lum(f), b = lum(g);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const hexOf = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
function oklab([r, g, b]) {
  [r, g, b] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
        m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
        s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const lch = c => { const [L, a, b] = oklab(rgba(c)); return { L, C: Math.hypot(a, b), H: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 }; };
/* Machado, Oliveira & Fernandes 2009, severity 1.0 — the dataviz validator's model. */
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]] };
const unlin = v => Math.round(255 * Math.max(0, Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
function cvd(hex, M) { const l = rgba(hex).slice(0, 3).map(lin); return M.map(row => unlin(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])); }
const dE = (a, b) => { const x = oklab(a), y = oklab(b); return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

/* ── a small CSS reader: selector → { --role: value } (one @media level) ── */
function blocks(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; let i = 0;
  const read = (media) => {
    while (i < css.length) {
      const open = css.indexOf('{', i), close = css.indexOf('}', i);
      if (close >= 0 && (open < 0 || close < open)) { i = close + 1; return; }
      if (open < 0) { i = css.length; return; }
      const sel = css.slice(i, open).trim(); i = open + 1;
      if (sel.startsWith('@')) { read(sel); continue; }
      const end = css.indexOf('}', i), body = css.slice(i, end); i = end + 1;
      const vars = {};
      for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
      out.push({ media, sel: sel.replace(/\s+/g, ' '), vars });
    }
  };
  read(null);
  return out;
}
const pick = (bs, media, test) => { const b = bs.find(x => x.media === media && test(x.sel)); return b ? b.vars : null; };

/* ── the files under test ───────────────────────────────────────────────── */
const STEMS = { 'fg3-color': 'fluid' };
const FILES = {};
console.log('\n· structure');
for (const [stem, preset] of Object.entries(STEMS)) {
  const f = `assets/${stem}.css`;
  if (!existsSync(path.join(ROOT, f))) { T(false, `${f} exists`); continue; }
  const css = rd(f), bs = blocks(css);
  T((css.match(/\/\*/g) || []).length === (css.match(/\*\//g) || []).length, `${stem}: every comment closes exactly once`);
  const light = pick(bs, null, s => s.includes('[data-tone="light"]') && !s.includes('contrast'));
  const dark = pick(bs, null, s => s === '[data-tone="dark"]');
  const moreL = pick(bs, '@media (prefers-contrast: more)', s => s === '[data-tone="light"]');
  const moreD = pick(bs, '@media (prefers-contrast: more)', s => s === '[data-tone="dark"]');
  const twinL = pick(bs, null, s => s.includes('[data-contrast="more"][data-tone="light"]'));
  const twinD = pick(bs, null, s => s.includes('[data-contrast="more"][data-tone="dark"]'));
  const osDark = pick(bs, '@media (prefers-color-scheme: dark)', s => s === ':root:not([data-tone])');
  const root = pick(bs, null, s => s === ':root');
  T(!!(light && dark && moreL && moreD && twinL && twinD && osDark && root), `${stem}: :root, both tones, OS-dark fallback, prefers-contrast and [data-contrast] twins`);
  T(light && bs.some(b => b.sel.startsWith(':root,') && b.vars === light), `${stem}: :root carries the light set (no-JS page still resolves every role)`);
  T(JSON.stringify(moreL) === JSON.stringify(twinL) && JSON.stringify(moreD) === JSON.stringify(twinD), `${stem}: [data-contrast=more] twin equals the media block`);
  T(JSON.stringify(osDark) === JSON.stringify(dark), `${stem}: OS-dark fallback equals [data-tone=dark]`);
  FILES[stem] = { preset, light, dark, more: { light: moreL, dark: moreD }, root };
}
const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/gen-palettes.mjs'), '--check'], { encoding: 'utf8' });
T(r.status === 0, 'generated files are current and the engine reports no failures (gen-palettes --check)' + (r.status ? '\n' + r.stdout.split('\n').filter(l => /STALE|FAIL/.test(l)).join('\n') : ''));

/* ── coverage ───────────────────────────────────────────────────────────── */
console.log('\n· coverage (derived, not typed)');
const spec = rd('SPEC.md');
const s2 = spec.slice(spec.indexOf('## 2 · Colour'), spec.indexOf('## 3 ·'));
const code = s2.slice(s2.indexOf('```') + 3, s2.indexOf('```', s2.indexOf('```') + 3));
const specRoles = new Set();
for (const line of code.split('\n')) {
  const decl = line.split(/\s{3,}/)[0];
  for (const m of decl.matchAll(/--([a-z]+(?:-[a-z0-9]+)*)(?:\s*…\s*--([a-z]+)-(\d+))?/g)) {
    if (m[2]) { const [, a] = /-(\d+)$/.exec(m[1]); for (let k = +a; k <= +m[3]; k++) specRoles.add(`${m[2]}-${k}`); }
    else specRoles.add(m[1]);
  }
  const plus = /\(\+\s*([^)]+)\)/.exec(line);
  if (plus) for (const base of ['ok', 'warn', 'bad']) for (const suf of plus[1].match(/-[a-z]+/g)) specRoles.add(base + suf);
}
T(specRoles.size >= 50 && ['ok-strong', 'bad-ink', 'warn-fill', 'series-6', 'sys-brown', 'on-art-2'].every(x => specRoles.has(x)),
  `SPEC §2 parsed into ${specRoles.size} roles, including the -strong/-ink/-fill roles`);
const files = [];
const walk = d => { for (const e of readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (!/^(node_modules|\.|dist)/.test(e.name)) walk(p); }
  else if (/\.(css|js|html)$/.test(e.name) && !/^fg3-color/.test(e.name) && e.name !== 'palette.js') files.push(p);
} };
walk('.');
const texts = files.map(f => rd(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, ''));
/* SPEC §1: "colour roles unprefixed (`--label`), everything else by family (`--t-*`, …)". */
const specLines = spec.split('\n'), fi = specLines.findIndex(l => /everything else by family/.test(l));
const FAMILY = (specLines[fi] + specLines[fi + 1]).match(/--([a-z0-9]+)-\*/g).map(x => x.slice(2, -2));
const used = new Set(), declared = new Set();
for (const t of texts) {
  /* A read WITH a fallback resolves on its own, so only bare reads must be emitted. */
  for (const m of t.matchAll(/var\(\s*--([\w-]+)\s*\)/g)) used.add(m[1]);
  for (const m of t.matchAll(/(?:^|[;{\s'"(])--([\w-]+)\s*:/g)) declared.add(m[1]);
  for (const m of t.matchAll(/setProperty\(\s*['"]--([\w-]+)/g)) declared.add(m[1]);
}
/* A script that names a property other than inside var() is setting it (inline
   style strings, template literals): that is a component's own knob, not a role. */
files.forEach((f, i) => { if (f.endsWith('.js')) for (const m of texts[i].matchAll(/(var\(\s*)?--([a-z][\w-]*)/g)) if (!m[1]) declared.add(m[2]); });
const consumed = [...used].filter(n => !declared.has(n) && !FAMILY.some(p => n.startsWith(p + '-')));
/* Which of those are COLOUR roles: the ones in a colour family the palette
   itself emits (label-*, accent-*, series-*, …). The rest are some module's own
   knob that nothing sets yet — printed, not failed, since they are not ours. */
const roots = new Set(Object.keys(FILES['fg3-color']?.light || {}).map(k => k.split('-')[0]));
const colourish = n => roots.has(n.split('-')[0]);
const foreign = consumed.filter(n => !colourish(n));
console.log(`  ${files.length} consumer files read; families from SPEC §1: ${FAMILY.join(' ')}\n` +
  `  ${consumed.length} unprefixed names read bare and declared nowhere else: ${consumed.join(' ')}` +
  (foreign.length ? `\n  NOTE not colour roles and set by nothing yet (another module's): ${foreign.join(' ')}` : ''));
for (const [stem, F] of Object.entries(FILES)) {
  for (const tone of ['light', 'dark']) {
    const have = new Set(Object.keys(F[tone]).concat(Object.keys(F.root)));
    const missSpec = [...specRoles].filter(n => !have.has(n));
    const missUse = consumed.filter(n => colourish(n) && !have.has(n));
    T(!missSpec.length, `${stem} ${tone}: every SPEC §2 role emitted` + (missSpec.length ? ' — missing ' + missSpec.join(' ') : ''));
    T(!missUse.length, `${stem} ${tone}: every role the stylesheets read is emitted` + (missUse.length ? ' — missing ' + missUse.join(' ') : ''));
  }
}
const ref = FILES['fg3-color'];
for (const [stem, F] of Object.entries(FILES)) for (const k of ['light', 'dark']) {
  T(Object.keys(F[k]).sort().join() === Object.keys(ref[k]).sort().join() &&
    Object.keys(F.more[k]).sort().join() === Object.keys(ref.more[k]).sort().join(), `${stem} ${k}: same role set as the default file (base and increased contrast)`);
}

/* ── contrast, recomputed ───────────────────────────────────────────────── */
console.log('\n· contrast against the hardest ground each role can land on');
const BG = ['bg-1', 'bg-2', 'bg-3', 'bg-elevated'];
const TEXT = { label: 7, 'label-2': 4.5, 'label-3': 3, 'label-4': 3, accent: 4.5, link: 4.5, ok: 4.5, warn: 4.5, bad: 4.5 };
const stops = g => g.match(/#[0-9a-f]{6}/gi);
function worstOf(v, grounds, lsb) {
  if (!v || grounds.some(g => g.stack.some(c => !c))) return { r: 0, on: 'a role that is not emitted' };
  return grounds.reduce((w, g) => { const x = (lsb ? crLsb : cr)(v, ...g.stack); return x < w.r ? { r: x, on: g.name } : w; }, { r: Infinity }); }
const washOf = (hex, a) => { const c = rgba(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
function checkTone(stem, tone, t, label) {
  const bgs = BG.map(b => ({ name: b, stack: [t[b]] }));
  const res = [];
  const need = (role, target, grounds, lsb) => { const w = worstOf(t[role], grounds, lsb); res.push([role + (lsb ? ' (±1 step)' : ''), w, target]); };
  for (const [role, target] of Object.entries(TEXT)) need(role, target, bgs);
  for (let i = 1; i <= 6; i++) need('series-' + i, 3, bgs);
  const onFill = BG.map(b => ({ name: b + '+fill-1', stack: [t[b], t['fill-1']] }));
  need('label-2-on-fill', 4.5, onFill); need('label-3-on-fill', 3, onFill); need('label-4-on-fill', 3, onFill);
  need('label-inv', 4.5, [{ name: 'label', stack: [t.label] }]);
  const inkOn = ['accent-solid', 'accent-hover', 'accent-active'].map(n => ({ name: n, stack: [t[n]] }))
    .concat(['accent-fill', 'accent-fill-hover', 'accent-fill-active'].flatMap(n => stops(t[n]).map((s, i) => ({ name: `${n} stop ${i}`, stack: [s] }))));
  need('accent-ink', 4.5, inkOn);
  for (const s of ['ok', 'warn', 'bad']) {
    need(s + '-ink', 4.5, [{ name: s, stack: [t[s]] }]);
    need(s + '-strong', 4.5, BG.map(b => ({ name: `${b}+${s}-fill`, stack: [t[b], t[s + '-fill']] })));
    /* a 12px/600 badge: --x-strong on --x-fill over every ground, --bg-2 (the
       card surface) included, with the renderer's last step taken away */
    need(s + '-strong', 4.5, BG.map(b => ({ name: `${b}+${s}-fill`, stack: [t[b], t[s + '-fill']] })), true);
  }
  /* The accent as ink on its OWN wash (the components' tinted button: 12% at rest, 22%
     pressed), over every ground: --accent itself measures ~4.2:1 there. */
  const tints = BG.flatMap(b => [0.12, 0.22].map(a => ({ name: `${b}+accent ${a * 100}%`, stack: [t[b], t.accent && washOf(t.accent, a)] })));
  need('accent-ink-on-tint', 4.5, tints);
  need('accent-ink-on-tint', 4.5, tints, true);
  const A = P.ART[tone], art = P.oklchToHex(A.L, A.C, lch(FILES[stem].root['accent-base']).H);
  need('on-art-1', 4.5, [{ name: 'art ' + art, stack: [art] }]); need('on-art-2', 4.5, [{ name: 'art ' + art, stack: [art] }]);
  let bad = res.filter(([, w, target]) => !(w.r >= target));
  T(!bad.length, `${stem} ${tone}${label || ''}: ${res.length} roles meet target on their hardest ground` +
    (bad.length ? ' — ' + bad.map(([r, w, tg]) => `${r} ${w.r.toFixed(2)}<${tg} on ${w.on}`).join('; ') : ''));
  return Object.fromEntries(res.map(([r, w]) => [r, w.r]));
}
const base = {};
for (const [stem, F] of Object.entries(FILES)) for (const tone of ['light', 'dark']) base[stem + tone] = checkTone(stem, tone, F[tone]);

console.log('\n· increased contrast is a step toward the ink, never worse');
for (const [stem, F] of Object.entries(FILES)) for (const tone of ['light', 'dark']) {
  const merged = { ...F[tone], ...F.more[tone] };
  const after = checkTone(stem, tone, merged, ' (increased contrast)');
  const worse = Object.keys(F.more[tone]).filter(k => k in after && after[k] < base[stem + tone][k] - 0.005 && !/on-fill/.test(k));
  T(!worse.length, `${stem} ${tone}: no role got worse under increased contrast` + (worse.length ? ' — ' + worse.join(' ') : ''));
  const heavier = Object.keys(F.more[tone]).filter(k => /^(fill-|separator$)/.test(k)).every(k => rgba(F.more[tone][k])[3] > rgba(F[tone][k])[3]);
  T(heavier, `${stem} ${tone}: fills and separator heavier under increased contrast`);
}

/* ── neutral table and system colours ───────────────────────────────────── */
console.log('\n· neutral table and system colours');
const NEUT = { light: { 'bg-1': '#ffffff', 'bg-2': '#f5f5f7', 'bg-3': '#fafafc', label: '#1d1d1f', 'label-2': '#6e6e73', 'label-3': '#86868b',
    'separator-opaque': '#d2d2d7', 'label-2-on-fill': '#424245', solid: '#e8e8ed', ground: '#ffffff' },
  dark: { 'bg-1': '#000000', 'bg-2': '#1d1d1f', 'bg-3': '#161617', label: '#f5f5f7', 'label-2': '#86868b', 'label-3': '#6e6e73',
    'separator-opaque': '#424245', 'label-2-on-fill': '#d2d2d7', solid: '#333336', ground: '#000000' } };
for (const [stem, F] of Object.entries(FILES)) for (const tone of ['light', 'dark']) {
  const A = NEUT[tone], t = F[tone];
  const off = Object.keys(A).filter(k => !['solid', 'ground'].includes(k) && t[k].toLowerCase() !== A[k]);
  T(!off.length, `${stem} ${tone}: neutrals match the table` + (off.length ? ' — ' + off.map(k => `${k} ${t[k]}≠${A[k]}`).join(' ') : ''));
  const comp = hexOf(flat([A.ground, t['fill-1']]));
  T(comp === A.solid, `${stem} ${tone}: --fill-1 over the page composites to the control fill ${A.solid} (got ${comp})`);
}
/* system colours: [light, dark, increased-contrast light, increased-contrast dark] */
const SYS_EXPECT = {
  blue:   ['#0088ff', '#0091ff', '#1e6ef4', '#5cb8ff'], green:  ['#34c759', '#30d158', '#008932', '#4ad968'],
  red:    ['#ff383c', '#ff4245', '#e9152d', '#ff6165'], orange: ['#ff8d28', '#ff9230', '#c55300', '#ffa056'],
  yellow: ['#ffcc00', '#ffd600', '#a16a00', '#fedf43'], pink:   ['#ff2d55', '#ff375f', '#e7124d', '#ff8ac4'],
  purple: ['#cb30e0', '#db34f2', '#b02fc2', '#ea8dff'], indigo: ['#6155f5', '#6d7cff', '#564ade', '#a7aaff'],
  teal:   ['#00c3d0', '#00d2e0', '#008198', '#3bddec'], cyan:   ['#00c0e8', '#3cd3fe', '#007eae', '#6dd9ff'],
  mint:   ['#00c8b3', '#00dac3', '#008575', '#54dfcb'], brown:  ['#ac7f5e', '#b78a66', '#956d51', '#dba679'] };
T(Object.keys(SYS_EXPECT).length === 12, 'system colour table: 12 colours');
for (const [stem, F] of Object.entries(FILES)) {
  const off = Object.entries(SYS_EXPECT).filter(([k, v]) => F.light['sys-' + k] !== v[0] || F.dark['sys-' + k] !== v[1] ||
    F.more.light['sys-' + k] !== v[2] || F.more.dark['sys-' + k] !== v[3]).map(([k]) => k);
  T(!off.length, `${stem}: --sys-* equal the table in light, dark and both increased-contrast columns` + (off.length ? ' — ' + off.join(' ') : ''));
}
const dusty = FILES['fg3-color'];
T(dusty.light['accent-fill'] === 'linear-gradient(135deg,#7a68c4,#4f4184)' && dusty.dark['accent-fill'] === dusty.light['accent-fill'] &&
  dusty.light['accent-glow'] === 'rgba(109,93,174,0.8)' && dusty.dark['on-art-1'] === '#ded9ec' && dusty.dark['on-art-2'] === '#cbc4dd',
  'default: dusty fill #7a68c4→#4f4184, its own-tone glow rgba(109,93,174,.8), on-art #ded9ec / #cbc4dd');
T(dusty.root['accent-base'] === '#7c5cff', 'default: --accent-base is the violet #7c5cff');

/* ── data hues: adjacent pairs separable under simulated CVD ──────────── */
console.log('\n· series under simulated colour-vision deficiency (Machado 2009, OKLab ΔE×100, adjacent ≥ 8)');
for (const [stem, F] of Object.entries(FILES)) for (const tone of ['light', 'dark']) {
  const s = [1, 2, 3, 4, 5, 6].map(i => F[tone]['series-' + i]);
  let w = Infinity, at = '';
  for (let i = 0; i < 5; i++) for (const M of Object.values(MACHADO)) {
    const d = dE(cvd(s[i], M), cvd(s[i + 1], M)); if (d < w) { w = d; at = `${s[i]}↔${s[i + 1]}`; }
  }
  const nv = Math.min(...[0, 1, 2, 3, 4].map(i => dE(rgba(s[i]), rgba(s[i + 1]))));
  T(w >= 8 && nv >= 15, `${stem} ${tone}: worst adjacent CVD ΔE ${w.toFixed(1)} (${at}), normal vision ${nv.toFixed(1)}`);
}

console.log(`\n${pass} passed, ${fail} failed${skip ? ', ' + skip + ' skipped' : ''}`);
process.exit(fail ? 1 : 0);
