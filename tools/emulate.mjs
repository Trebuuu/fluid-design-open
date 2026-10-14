/* ═══════════════════════════════════════════════════════════════════════════
   emulate.mjs — one page under every media emulation that changes it (T1)
   ───────────────────────────────────────────────────────────────────────────
     node tools/emulate.mjs <url> [options]
       --widths 1440,402    one pass per width (< 600 = phone: mobile viewport +
                            touch emulation, 874 tall)
       --only a,b           a subset of the configurations below
       --tone light|dark    the colour scheme under the four accessibility
                            configurations (default light)
       --out DIR            screenshots (default ./shots/emulate)
       --name STEM          file stem (default from the url)
       --wait 1500          settle after load (and after FG3's 'ready')
       --scroll 0,900       capture at these offsets (default 0)
       --full               capture the whole document instead
       --eval "<js>"        evaluate in every configuration; result recorded
       --strict             also exit 1 on console errors, failed or blocked
                            requests (404s, CSP) — not only on exceptions
       --json FILE          every configuration's findings

   CONFIGURATIONS (Emulation.setEmulatedMedia; all of
   them work over the raw protocol in Edge 153, including forced-colors,
   which some tools wrongly report as impossible to emulate — that limit belongs to
   the browser tool, not the protocol)
     light                  prefers-color-scheme: light
     dark                   prefers-color-scheme: dark
     reduced-motion         prefers-reduced-motion: reduce
     reduced-transparency   prefers-reduced-transparency: reduce
     contrast-more          prefers-contrast: more
     forced-colors          forced-colors: active
   The colour scheme is ALWAYS set explicitly, so the machine's own theme never
   leaks into a run. Each configuration gets its own isolated browser context
   (no shared localStorage: a stored fg3-tone cannot carry over).

   PER RUN it records, and prints:
     · uncaught exceptions (→ exit 1), console.error/assert, Log errors (this
       is where CSP refusals and "Failed to load resource" land), requests that
       failed or answered ≥ 400
     · whether the emulated feature REALLY matched in the page (matchMedia) —
       an emulation that did not take is a failure, not a pass
     · what the system did about it: data-tone, the fd-* gate classes,
       data-reduce-transparency, LG3's engine and refracting count
     · whether the capture is byte-identical to the light one ("= light"):
       a page that looks the same under forced colours is worth a look
   ═══════════════════════════════════════════════════════════════════════════ */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launch, emulateViewport, sleep } from './perf.mjs';

const CONFIGS = {
  'light': [],
  'dark': [],
  'reduced-motion': [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  'reduced-transparency': [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  'contrast-more': [{ name: 'prefers-contrast', value: 'more' }],
  'forced-colors': [{ name: 'forced-colors', value: 'active' }],
};
/* what must match inside the page for the configuration to count */
const EXPECT = {
  'light': '(prefers-color-scheme: light)', 'dark': '(prefers-color-scheme: dark)',
  'reduced-motion': '(prefers-reduced-motion: reduce)', 'reduced-transparency': '(prefers-reduced-transparency: reduce)',
  'contrast-more': '(prefers-contrast: more)', 'forced-colors': '(forced-colors: active)',
};

const PROBE = `(() => {
  const d = document.documentElement, mm = q => { try { return matchMedia(q).matches; } catch (e) { return null; } };
  const L = window.LG3; let lg = null;
  try { if (L) lg = { engine: L.engine, refracting: L.refracting, budget: L.budget }; } catch (e) {}
  const cs = document.body ? getComputedStyle(document.body) : null;
  return {
    media: { dark: mm('(prefers-color-scheme: dark)'), reducedMotion: mm('(prefers-reduced-motion: reduce)'),
      reducedTransparency: mm('(prefers-reduced-transparency: reduce)'), contrastMore: mm('(prefers-contrast: more)'),
      forcedColors: mm('(forced-colors: active)'), coarse: mm('(pointer: coarse)') },
    expect: {}, tone: d.getAttribute('data-tone'), fg3: d.getAttribute('data-fg3'),
    gate: [...d.classList].filter(c => /^(no-)?fd-/.test(c)).join(' '),
    reduceTransparency: d.hasAttribute('data-reduce-transparency') ? (d.getAttribute('data-reduce-transparency') || 'on') : null,
    contrast: d.getAttribute('data-contrast'), lg, bodyBg: cs && cs.backgroundColor, bodyInk: cs && cs.color,
    docH: Math.max(d.scrollHeight, document.body ? document.body.scrollHeight : 0),
  };
})()`;

async function runOne(browser, url, cfg, width, o) {
  const height = width < 600 ? 874 : 900;
  const r = { config: cfg, width, exceptions: [], consoleErrors: [], logErrors: [], failed: [], files: [], warnings: 0 };
  const page = await browser.newPage({ isolated: true });
  try {
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Log.enable'); await page.send('Network.enable');
    page.on('Runtime.exceptionThrown', p => r.exceptions.push((p.exceptionDetails.exception?.description || p.exceptionDetails.text || '').split('\n')[0]));
    page.on('Runtime.consoleAPICalled', p => {
      if (p.type === 'error' || p.type === 'assert') r.consoleErrors.push(p.args.map(a => a.value ?? a.description).join(' ').slice(0, 200));
      if (p.type === 'warning') r.warnings++;
    });
    /* The browser asks for /favicon.ico on its own; no page did, and the host
       supplies the icon — so it is not a finding. */
    const own = u => /\/favicon\.ico(\?|$)/.test(u || '');
    page.on('Log.entryAdded', p => { if (p.entry.level === 'error' && !own(p.entry.url)) r.logErrors.push((p.entry.text + (p.entry.url ? ' ' + p.entry.url : '')).slice(0, 220)); });
    page.on('Network.responseReceived', p => { if (p.response.status >= 400 && !own(p.response.url)) r.failed.push(p.response.status + ' ' + p.response.url); });
    const urls = new Map();
    page.on('Network.requestWillBeSent', p => urls.set(p.requestId, p.request.url));
    page.on('Network.loadingFailed', p => { if (!p.canceled) r.failed.push((p.blockedReason ? 'blocked:' + p.blockedReason : p.errorText) + ' ' + (urls.get(p.requestId) || p.requestId)); });
    await emulateViewport(page, { width, height });
    const scheme = cfg === 'dark' ? 'dark' : cfg === 'light' ? 'light' : o.tone;
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, ...CONFIGS[cfg]] });
    const loaded = await page.navigate(url);
    if (!loaded) r.exceptions.push('load event did not fire within 20 s');
    await page.eval(`new Promise(r => { const d = document.documentElement; if (!window.FG3 || d.getAttribute('data-fg3') === 'ready') return r(true);
      document.addEventListener('fg3:ready', () => r(true), { once: true }); setTimeout(() => r(false), 5000); })`).catch(() => {});
    await page.eval('Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]).then(() => true)').catch(() => {});
    await sleep(o.wait);
    r.probe = await page.eval(PROBE);
    r.emulated = await page.eval(`matchMedia(${JSON.stringify(EXPECT[cfg])}).matches`);
    if (o.evalJS) { try { r.eval = await page.eval(o.evalJS); } catch (e) { r.eval = { error: e.message }; } }
    await mkdir(o.out, { recursive: true });
    const shots = [];
    if (o.full) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(r.probe.docH, 16000), deviceScaleFactor: 1, mobile: width < 600 });
      await sleep(400);
      shots.push(['full', await page.send('Page.captureScreenshot', { format: 'png' })]);
    } else {
      for (const y of o.offsets) {
        const cur = await page.eval('scrollY');
        const steps = Math.max(1, Math.round(Math.abs(y - cur) / 300));
        for (let i = 1; i <= steps; i++) { await page.eval(`scrollTo({ top: ${Math.round(cur + (y - cur) * i / steps)}, behavior: 'instant' }), true`); await sleep(40); }
        if (steps > 1 || y) await sleep(o.wait);
        shots.push(['y' + y, await page.send('Page.captureScreenshot', { format: 'png' })]);
      }
    }
    for (const [tag, s] of shots) {
      const f = path.join(o.out, `${o.stem}-${width}-${cfg}-${tag}.png`);
      await writeFile(f, Buffer.from(s.data, 'base64'));
      r.files.push(f); (r.data ||= []).push(s.data);
    }
  } catch (e) { r.exceptions.push('harness: ' + e.message); }
  finally { await page.close(); }
  return r;
}

async function main() {
  const argv = process.argv.slice(2);
  const takes = new Set(['--widths', '--width', '--only', '--tone', '--out', '--name', '--wait', '--scroll', '--eval', '--json']);
  const url = argv.find((a, i) => !a.startsWith('--') && !takes.has(argv[i - 1]));
  const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
  const flag = k => argv.includes('--' + k);
  if (!url) { console.error('usage: node tools/emulate.mjs <url> [--widths 1440,402] [--only dark,forced-colors] [--out dir] [--strict]'); process.exit(2); }
  const widths = String(opt('widths', opt('width', '1440,402'))).split(',').map(Number);
  const only = opt('only') ? opt('only').split(',') : Object.keys(CONFIGS);
  const bad = only.filter(c => !CONFIGS[c]);
  if (bad.length) { console.error('unknown configuration(s): ' + bad.join(', ') + ' — known: ' + Object.keys(CONFIGS).join(', ')); process.exit(2); }
  const o = {
    tone: opt('tone', 'light'), out: path.resolve(opt('out', 'shots/emulate')), wait: +opt('wait', 1500), full: flag('full'),
    offsets: String(opt('scroll', '0')).split(',').map(Number), evalJS: opt('eval'),
    stem: opt('name', url.replace(/^https?:\/\/[^/]+\//, '').replace(/[?#].*$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'page'),
  };
  const browser = await launch({ gpu: true, width: Math.max(...widths), height: 900 });
  const results = [];
  try {
    for (const width of widths) {
      let light = null;
      for (const cfg of only) {
        const r = await runOne(browser, url, cfg, width, o);
        if (cfg === 'light') light = r.data;
        r.sameAsLight = cfg !== 'light' && light && r.data ? r.data.every((d, i) => d === light[i]) : null;
        delete r.data;
        results.push(r);
        const p = r.probe || {};
        const lg = p.lg ? p.lg.engine + ' ' + p.lg.refracting + '/' + p.lg.budget : '-';
        console.log([String(width).padStart(5), cfg.padEnd(21), (r.emulated ? 'matched' : 'NOT MATCHED').padEnd(11),
          ('tone ' + (p.tone ?? '-')).padEnd(10), ('glass ' + lg).padEnd(22),
          'exc ' + r.exceptions.length, 'err ' + (r.consoleErrors.length + r.logErrors.length), 'req ' + r.failed.length,
          r.sameAsLight ? '= light' : ''].join('  '));
        for (const e of r.exceptions) console.log('        EXCEPTION ' + e);
        for (const e of [...r.consoleErrors, ...r.logErrors].slice(0, 6)) console.log('        error ' + e);
        for (const e of r.failed.slice(0, 6)) console.log('        request ' + e);
        if (p.gate && !flag('quiet')) console.log('        ' + p.gate + (p.reduceTransparency ? ' · data-reduce-transparency=' + p.reduceTransparency : '') + (p.contrast ? ' · data-contrast=' + p.contrast : '') + ' · body ' + p.bodyBg + ' / ' + p.bodyInk);
        if (r.eval !== undefined) console.log('        eval → ' + JSON.stringify(r.eval).slice(0, 300));
      }
    }
  } finally { await browser.close(); }
  console.log('screenshots → ' + o.out);
  if (opt('json')) await writeFile(opt('json'), JSON.stringify(results, null, 2));
  const exc = results.some(r => r.exceptions.length || !r.emulated);
  const noisy = results.some(r => r.consoleErrors.length || r.logErrors.length || r.failed.length);
  process.exit(exc || (flag('strict') && noisy) ? 1 : 0);
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
