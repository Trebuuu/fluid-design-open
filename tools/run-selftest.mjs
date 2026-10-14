/* run-selftest.mjs — drive selftest.html in headless Edge, print every row,
   exit 1 on any failure. Then, with --mutants, prove each row CAN fail.

     node tools/run-selftest.mjs [url] [options]

     url                  default: a fresh tools/serve.mjs on a free port,
                          /selftest.html on it
     --width 1440         viewport (402 = the phone surface: mobile + touch)
     --height 900
     --dark               prefers-color-scheme: dark
     --reduced-motion     prefers-reduced-motion: reduce (the page's own
                          checks also emulate it in a frame either way)
     --timeout 240        seconds to wait for the suite
     --json <file>        write the full result
     --quiet              failures and the summary only

     --mutants            run the MUTANT table: each mutant serves ONE asset
                          with a deliberate break (CDP Fetch interception —
                          the file on disk is never touched, so other people
                          working in the tree see nothing) and FAILS unless
                          every row it names goes red. A row that passes on
                          broken code is not an assertion.
     --only <id,id>       run only these mutants
     --list               print the mutant table and exit

   Reuses the CDP driver in tools/perf.mjs (fresh isolated context per run,
   so a mutated asset never leaks into the next run through the cache). */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { launch, emulateViewport, sleep } from './perf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const flag = k => argv.includes('--' + k);
const VALUED = new Set(['--width', '--height', '--timeout', '--json', '--only']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));

const W = +opt('width', 1440), H = +opt('height', 900), TIMEOUT = +opt('timeout', 240) * 1000;

/* A repair, for a row that is red on the real assets: the named rows must
   turn GREEN when the defect is fixed (a sixth element 'green'). Today that is
   the drop spring, whose 48-sample linear() misses the solver by .0031. */
function springLib() { const sb = {}; sb.globalThis = sb; vm.runInNewContext(readFileSync(path.join(ROOT, 'assets/spring.js'), 'utf8'), sb); return sb.SPRING; }
const fixDrop = t => t.replace(/--sp-drop: linear\([^;]*\);/, () => '--sp-drop: ' + springLib().Spring('drop').linear(96) + ';');
const breakSmooth = t => t.replace(/(--sp-smooth: linear\((?:[^,]+,){9})\s*([\d.]+)/, (m, a, b) => a + (+b + 0.02).toFixed(5));

/* ── the mutants: [id, asset, find, replace, rows that must go red] ─────────
   `find` must occur in the file exactly as written (checked before the run);
   `replace` may be a string or a function of the whole file text. Rows are
   matched by a unique fragment of their label. */
const MUTANTS = [
  ['geom-exp', 'geom.js', 'if (k === -Infinity) return 1e-6;\n    return Math.pow(2, k);', 'if (k === -Infinity) return 1e-6;\n    return 2 * k;', ['n = 2^k']],
  ['geom-chord', 'geom.js', "pts.push([Math.pow(Math.abs(Math.cos(th)), 2 / n) * rx,", "pts.push([Math.pow(Math.abs(Math.cos(th)), 1.9 / n) * rx,", ['straight chord']],
  ['geom-rscale', 'geom.js', 'k: 1.71, rScale: 1.53,', 'k: 1.71, rScale: 1.3,', ['diagonal inset within 0.5', 'carries the calibration']],
  ['geom-k', 'geom.js', 'k: 1.71, rScale: 1.53,', 'k: 2.4, rScale: 1.53,', ['Hausdorff']],
  ['geom-capsule', 'geom.js', 'R >= Math.min(w, h) / 2 - 0.5) {', 'R >= Math.min(w, h) * 2) {', ['capsule rule']],
  ['fg3-snap', 'fg3.js', 'var cs = getComputedStyle(el), half = Math.min(w, h) / 2 - 0.5;', 'var cs = getComputedStyle(el), half = Math.min(w, h) * 2;', ['capsule snap in the page']],
  ['geom-sdf', 'geom.js', 'return outer + Math.min(Math.max(qx, qy), 0) - r;', 'return outer + Math.min(Math.max(qx, qy), 0);', ['circular signed distance']],
  ['geom-field', 'geom.js', 'var FIELD_N = 128;', 'var FIELD_N = 4;', ['squircle field is accurate']],
  ['fg3-concentric', 'fg3.js', 'Math.max(min, or - gap);', 'Math.max(min, or + gap);', ['concentric:']],

  ['spring-w0', 'spring.js', 'var w0 = TAU / dur;', 'var w0 = TAU / dur * 1.02;', ['(mass 1, stiffness 157.9', 'settling time']],
  ['spring-bounce', 'spring.js', 'bounce: zeta <= 1 ? 1 - zeta : 1 / zeta - 1,', 'bounce: zeta <= 1 ? 0.9 - zeta : 1 / zeta - 1,', ['(duration 0.63, bounce 0.5)']],
  ['springs-fix', 'fg3-springs.css', t => fixDrop(t), null, ['plays within .003'], 'green'],
  ['springs-css', 'fg3-springs.css', t => breakSmooth(fixDrop(t)), null, ['plays within .003']],
  ['springs-ms', 'fg3-springs.css', t => t.replace(/--sp-snappy-ms: (\d+)ms/, (m, a) => '--sp-snappy-ms: ' + (+a + 40) + 'ms'), null, ['settling time']],
  ['spring-retarget', 'spring.js', 'setTarget: function (t) {\n        target = t; atRest = false;', 'setTarget: function (t) {\n        target = t; atRest = false; v = 0;', ['retarget keeps velocity']],
  ['spring-fixedstep', 'spring.js', 'while (acc >= STEP) { integrate(); acc -= STEP; }', 'if (acc >= STEP) { integrate(); acc = 0; }', ['one trajectory at 30, 60 and 120']],
  ['spring-linearFrom', 'spring.js', 'var sol = from(x0, v0, target), U = sol.scale', 'var sol = from(x0, 0, target), U = sol.scale', ['linearFrom seeds']],
  ['motion-carry', 'motion.js', 'start = live.value; carry = live.running ? live.velocity : 0;', 'start = live.value; carry = 0;', ['hands its velocity on']],

  ['palette-role', 'fg3-color.css', '--series-6:', '--seriesX-6:', ['every role in PALETTE.ROLES']],
  ['palette-stale', 'fg3-color.css', '--label-2:#6e6e73;', '--label-2:#6e6e74;', ['exactly what palette.js generates']],
  ['palette-contrast', 'fg3-color.css', '--label-2:#6e6e73;', '--label-2:#a0a0a4;', ['contrast holds in the shipped files']],
  ['palette-more', 'fg3-color.css', t => { const i = t.indexOf('@media (prefers-contrast: more)'); const j = t.indexOf('--label-2:', i); const k = t.indexOf(';', j); return t.slice(0, j) + '--label-2:#9a9aa0' + t.slice(k); }, null, ['increased contrast is never worse']],
  ['palette-cascade', 'fg3-color.css', '\n[data-tone="dark"]{', '\n[data-tone="darkx"]{', ['the page resolved the palette']],

  ['tokens-type', 'fg3-tokens.css', '--t-48-lh:1.0834933333;', '--t-48-lh:1.2;', ['type roles at this width']],
  ['tokens-face', 'fg3.css', 'font-optical-sizing:auto;font-synthesis-weight:none;', 'font-optical-sizing:none;font-synthesis-weight:none;', ['the face switch']],
  ['tokens-var', 'fg3.css', 'var(--t-body-fs)', 'var(--t-bodyx-fs)', ['no bare var()']],
  ['tokens-width', 'fg3-tokens.css', '--w-content:1260px;', '--w-content:1200px;', ['content width and band padding']],

  ['lg3-gate', 'lg3-core.js', 'c.software = /SwiftShader|llvmpipe|softpipe|Basic Render Driver|Software Adapter/i.test(c.renderer);', 'c.software = /./.test(c.renderer);', ['engine gate']],
  ['lg3-thickness', 'lg3-core.js', 'var slope = (f(t1) - f(t0)) / ((t1 - t0) || 1e-6) * cfg.thickness / band;', 'var slope = (f(t1) - f(t0)) / ((t1 - t0) || 1e-6) / band;', ['refraction on a 50 px bar']],
  ['lg3-budget', 'lg3-core.js', 'return innerWidth < 735 ? 1 : 3;', 'return innerWidth < 735 ? 1 : 5;', ['budget: at most 3']],
  ['lg3-phone', 'lg3-core.js', 'return innerWidth < 735 ? 1 : 3;', 'return innerWidth < 735 ? 2 : 3;', ['at 402 px the budget']],
  ['fg3-fade', 'fg3.css', t => t + '\n.band[data-band="stage"] .viewport-content{opacity:.98}\n', null, ['opacity below 1']],
  ['lg3-rt', 'lg3-core.js', "if (rt) { a = Math.max(a, tone === 'light' ? 0.9 : 0.86); blur = Math.max(blur, 24); }", 'if (false) { a = 1; }', ['reduce transparency']],
  ['lg3-ramp', 'lg3-core.js', "host.style.scale = RM.matches ? '' : (0.9 + 0.1 * p).toFixed(4);", 'host.style.opacity = p.toFixed(3);', ['never the host']],

  ['fg3-walk', 'fg3.js', 'if (r.cssRules && r.cssRules.length) {\n        var cond', 'if (false && r.cssRules) {\n        var cond', ['knows every corner-shape']],
  ['fg3-supports', 'fg3.js', "else if (name === 'supports') scan(", "else if (name === 'supportsx') scan(", ['every element a corner-shape rule reaches']],
  ['fg3-mass', 'fg3.js', 'var mass = (1 - Math.pow(2, -1 / nOf(k))) / (1 - Math.SQRT1_2);', 'var mass = 1;', ['circle of equal mass']],

  ['motion-blanket', 'fg3-motion.css', t => t + '\n@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:1ms!important;transition-duration:1ms!important}}\n', null, ['no blanket rule', 'state indicators keep moving']],
  ['components-spinner', 'fg3-components.css', '.spinner,.btn[aria-busy="true"]::after{animation-duration:1600ms}', '.spinner,.btn[aria-busy="true"]::after{animation:none}', ['state indicators keep moving']],
  ['motion-scene', 'fg3-motion.css', '[data-scene]{ --progress:1 }', '[data-scene]{ --progress:0 }', ['no displacement']],
  ['fg3-rmgate', 'fg3.js', "if (rm) cause = 'reduced-motion';", "if (false) cause = 'reduced-motion';", ['the gate reads it', 'data-reveal content is fully visible']],

  ['anim-vh', 'anim.js', "if (u === 'vh') return 0.01 * n.n * ctx.vh;", "if (u === 'vh') return 0.01 * n.n * ctx.vw;", ['expression language evaluates']],
  ['anim-range', 'anim.js', "return { ref: L.ref, css: 'exit-crossing ' + off };", "return { ref: L.ref, css: 'entry-crossing ' + off };", ['rangeOf maps', 'compiled keyframe tracks']],
  ['anim-gate', 'anim.js', 'gateState.enhanced = cl.contains(ENH);', 'gateState.enhanced = !cl.contains(ENH);', ['capability gate agrees']],

  ['sym-bolt', 'symbols.js', "'bolt':", "'boltx':", ['SPEC §6 glyph']],
  ['sym-plus', 'symbols.js', "'plus':           'M12 5v14M5 12h14',", "'plus':           'M12 5v0M5 12h0',", ['every glyph renders']],
  ['sym-rtl', 'fg3-symbols.css', 'transform:scaleX(-1);transform-origin:50% 50%;', 'transform:none;transform-origin:50% 50%;', ['right to left']],

  ['chart-zero', 'chart.js', 'ext.lo = opts.min == null ? 0 : opts.min;', 'ext.lo = opts.min == null ? Math.min.apply(null, v) * 0.5 : opts.min;', ['bars are read from zero']],
  ['chart-role', 'chart.js', "svg.setAttribute('role', 'img');", "svg.setAttribute('role', 'presentation');", ['an image with a title']],
  ['chart-rings', 'chart.js', 'Math.max(0, Math.min(2, r.value / r.max)); }', 'Math.max(0, Math.min(2, r.value / r.max * 0.9)); }', ['rings land on value/max']],
  ['chart-dial', 'chart.js', 'var ht = pt(50, 50, R1 + 3.2, now / 24);', 'var ht = pt(50, 50, R1 + 3.2, now / 24 + 0.01);', ['now-hand points at 14:30']],
  ['chart-strip', 'chart.js', 'var empty = it.empty || !(it.landed > 0), lost', 'var empty = false, lost', ['empty batch is an outline']],
  ['chart-refuse', 'chart.js', "if (host.closest && host.closest('[data-lg3],.lg3')) {", 'if (false) {', ['chart inside glass']],

  ['ui-seg', 'ui.js', "host.style.setProperty('--seg-x', it.offsetLeft + 'px');", "host.style.setProperty('--seg-x', (it.offsetLeft + 12) + 'px');", ['indicator sits under']],
  ['ui-segkey', 'ui.js', "step(e.key === 'ArrowRight' && rtl ? -1 : 1); }", 'step(0); }', ['arrow keys move the selection']],
  ['ui-menu', 'ui.js', 'if (returnFocus !== false) trigger.focus({ preventScroll: true });', '', ['menu: opens on its trigger']],
  ['chrome-sheet', 'chrome.js', "var medF = parseFloat(sh.getAttribute('data-medium')) || 0.5;", "var medF = parseFloat(sh.getAttribute('data-medium')) || 0.62;", ['sheet: medium detent']],
  ['chrome-tabbar', 'chrome.js', 'if (st.acc > 32) tbMin(tb, true);', 'if (st.acc > 8) tbMin(tb, true);', ['tab bar: minimises']],

  ['fg3-modules', 'fg3.js', "'DEVICE', 'UI', 'CHROME', 'SHOW'];", "'DEVICE', 'UI', 'CHROME'];", ['every module is present']],
  ['chart-throw', 'chart.js', "function mount(root) {\n    (root || document).querySelectorAll('[data-chart]:not([data-chart-drawn])')", "function mount(root) {\n    if (!window.__mutantThrown) { window.__mutantThrown = 1; throw new Error('mutant: CHART.mount'); }\n    (root || document).querySelectorAll('[data-chart]:not([data-chart-drawn])')", ['nothing threw']],
  ['fg3-idem', 'fg3.js', 'if (state) return state;', '', ['boot is idempotent']],
  ['fg3-toggle', 'fg3.js', "b.addEventListener('click', function () { setTone(tone.tone === 'dark' ? 'light' : 'dark'); });", "b.addEventListener('click', function () {});", ['appearance toggle']],
];

/* ── a server, if none was named ─────────────────────────────────────────── */
async function server() {
  if (positional[0]) return { url: positional[0], stop() {} };
  const port = 8900 + Math.floor(Math.random() * 90);
  const proc = spawn(process.execPath, [path.join(HERE, 'serve.mjs'), ROOT, String(port), '--quiet'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('serve.mjs did not start')), 10000);
    proc.stdout.on('data', d => { if (/serving/.test(String(d))) { clearTimeout(t); res(); } });
    proc.on('exit', c => { clearTimeout(t); rej(new Error('serve.mjs exited ' + c)); });
  });
  return { url: `http://127.0.0.1:${port}/selftest.html`, stop() { proc.kill(); } };
}

const TYPES = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
async function runOnce(browser, url, mutant) {
  const page = await browser.newPage({ isolated: true });
  const errors = [];
  try {
    await emulateViewport(page, { width: W, height: H });
    const media = [];
    if (flag('dark')) media.push({ name: 'prefers-color-scheme', value: 'dark' });
    else media.push({ name: 'prefers-color-scheme', value: 'light' });
    if (flag('reduced-motion')) media.push({ name: 'prefers-reduced-motion', value: 'reduce' });
    await page.send('Emulation.setEmulatedMedia', { features: media });
    try { await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
    await page.send('Page.enable'); await page.send('Runtime.enable');
    page.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    if (mutant) {
      const [, file, find, replace] = mutant;
      const src = readFileSync(path.join(ROOT, 'assets', file), 'utf8');
      const out = typeof find === 'function' ? find(src) : src.split(find).join(replace);
      if (out === src) throw new Error('mutant ' + mutant[0] + ' changed nothing in ' + file);
      await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/assets/' + file + '*', requestStage: 'Request' }] });
      page.on('Fetch.requestPaused', p => {
        page.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: TYPES[file.split('.').pop()] }, { name: 'Cache-Control', value: 'no-store' }],
          body: Buffer.from(out, 'utf8').toString('base64') }).catch(() => {});
      });
    }
    const keep = setInterval(() => { page.send('Page.bringToFront').catch(() => {}); }, 3000);
    try {
      await page.navigate(url, { timeout: 30000 });
      const t0 = Date.now();
      let res = null;
      while (Date.now() - t0 < TIMEOUT) {
        await sleep(700);
        res = await page.eval('window.__selftest ? JSON.stringify(window.__selftest) : null', { timeout: 20000 }).catch(() => null);
        if (res) break;
      }
      if (!res) {
        const where = await page.eval('document.getElementById("st-headline") && document.getElementById("st-headline").textContent').catch(() => '?');
        return { error: 'the suite did not finish in ' + TIMEOUT / 1000 + ' s (' + where + ')', errors };
      }
      return { result: JSON.parse(res), errors };
    } finally { clearInterval(keep); }
  } finally { await page.close(); }
}

function rowsOf(r) { return r.groups.flatMap(g => g.rows.map(x => ({ ...x, group: g.title }))); }
function print(r, quiet) {
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  for (const g of r.groups) {
    const rows = g.rows.filter(x => !quiet || (!x.pass && !x.skip));
    if (!rows.length) continue;
    console.log('\n' + g.title);
    for (const x of rows) {
      console.log('  ' + pad(x.skip ? 'skip' : x.pass ? 'ok' : 'FAIL', 5) + x.label);
      if (x.note && (!x.pass || !quiet)) console.log('        ' + x.note);
    }
  }
}

async function main() {
  if (flag('list')) {
    for (const m of MUTANTS) console.log(`${m[0].padEnd(20)} ${m[1].padEnd(24)} red: ${m[4].join(' | ')}`);
    return 0;
  }
  const srv = await server();
  const browser = await launch({ width: W, height: H });
  let code = 0;
  try {
    const base = await runOnce(browser, srv.url, null);
    if (base.error) { console.log('ERROR ' + base.error); base.errors.forEach(e => console.log('  [exception] ' + e)); return 1; }
    const r = base.result;
    print(r, flag('quiet'));
    console.log(`\n${r.total} assertions, ${r.passed} passed, ${r.failed} failed${r.skipped ? ', ' + r.skipped + ' skipped' : ''} ` +
      `in ${(r.ms / 1000).toFixed(1)} s at ${W}px${flag('dark') ? ' dark' : ''}${flag('reduced-motion') ? ' reduced-motion' : ''}`);
    if (base.errors.length) { console.log('uncaught exceptions:'); base.errors.forEach(e => console.log('  ' + e)); }
    if (r.failed || base.errors.length) code = 1;
    const count = (readFileSync(path.join(ROOT, 'selftest.html'), 'utf8').match(/^\s*T\(/gm) || []).length;
    if (count !== r.total) { console.log(`COUNT MISMATCH: ${count} lines start with T( but ${r.total} ran`); code = 1; }
    if (flag('json')) writeFileSync(opt('json'), JSON.stringify(r, null, 2));

    if (flag('mutants')) {
      const only = opt('only') ? opt('only').split(',') : null;
      const list = MUTANTS.filter(m => !only || only.includes(m[0]));
      const baseline = new Map(rowsOf(r).map(x => [x.label, x]));
      console.log(`\nmutants: ${list.length}, each serving one broken asset; every named row must go red`);
      let survived = 0;
      const covered = new Set();
      for (const m of list) {
        const [id, file, find, , expect, want] = m;
        const src = readFileSync(path.join(ROOT, 'assets', file), 'utf8');
        if (typeof find === 'string' && !src.includes(find)) { console.log(`  !! ${id}: anchor not found in ${file} — the table is stale`); survived++; continue; }
        const run = await runOnce(browser, srv.url, m);
        if (run.error) { console.log(`  ?? ${id}: ${run.error}`); survived++; continue; }
        const rows = rowsOf(run.result);
        const misses = [];
        for (const frag of expect) {
          const hit = rows.filter(x => x.label.includes(frag));
          if (hit.length !== 1) { misses.push(`"${frag}" matches ${hit.length} rows`); continue; }
          const row = hit[0];
          if (want === 'green') { if (!row.pass || row.skip) misses.push(`"${frag}" is still red after the repair: ${row.note}`); continue; }
          if (row.pass || row.skip) misses.push(`"${frag}" stayed green`);
          else { covered.add(row.label); if (baseline.get(row.label)?.pass === false && !list.some(o => o[5] === 'green' && o[4].includes(frag))) misses.push(`"${frag}" was already red before the mutant`); }
        }
        const collateral = rows.filter(x => !x.pass && !x.skip && !expect.some(f => x.label.includes(f)) && baseline.get(x.label)?.pass).map(x => x.label.slice(0, 48));
        if (misses.length) { survived++; console.log(`  SURVIVED ${id} (${file}): ${misses.join('; ')}`); }
        else console.log(`  ${want === 'green' ? 'repaired' : 'caught  '} ${id.padEnd(18)} ${file.padEnd(24)} ${expect.map(f => rows.find(x => x.label.includes(f)).note.replace(/\s+/g, ' ').slice(0, 70)).join(' | ')}` +
          (collateral.length ? `\n           also red: ${collateral.join(' · ')}` : ''));
      }
      const all = rowsOf(r).map(x => x.label), unseen = all.filter(l => !covered.has(l));
      console.log(`\n${list.length - survived} of ${list.length} mutants caught; rows seen red: ${covered.size} of ${all.length}`);
      if (!only && unseen.length) { console.log('rows no mutant turned red:'); unseen.forEach(l => console.log('  ' + l)); code = 1; }
      if (survived) code = 1;
    }
  } finally { await browser.close(); srv.stop(); }
  return code;
}
main().then(c => process.exit(c), e => { console.error(e.stack || e.message); process.exit(1); });
