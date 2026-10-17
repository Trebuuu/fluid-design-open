/* ═══════════════════════════════════════════════════════════════════════════
   perf.mjs — frame timing of a real page in a FRESH headless Edge (T1)
   ───────────────────────────────────────────────────────────────────────────
     node tools/perf.mjs <url> [options]
       --width 1440[,402]   one configuration per width (402 = phone: mobile +
                            touch emulation; the scroll is still a wheel gesture:
                            a synthetic TOUCH scroll moves nothing in headless
                            Edge 153, with or without touch emulation)
       --height H           default 900 (874 at phone width)
       --dpr 1              device pixel ratio (2 = a Retina desktop)
       --gpu on|off|both    on = the real GPU (default); off = --disable-gpu
                            (the software rasteriser); both = one run each
       --runs 1             repeat each configuration, each in a NEW process
       --duration 6         seconds to scroll the page top → bottom
       --distance PX        scroll this far instead of the whole page
       --scroll gesture|raf gesture (default) = Input.synthesizeScrollGesture,
                            real input on the compositor; raf = stepped
                            scrollTo in requestAnimationFrame (main thread)
       --interact "<js>"    measure an interaction instead of a scroll: the
                            snippet is evaluated (a returned promise is awaited)
                            and frames are recorded for --window ms from its start
       --before "<js>"      run first (e.g. scroll the thing into view)
       --window 1500        interaction recording window, ms
       --wait 1500          settle after load (and after FG3's 'ready')
       --trace              also record a DevTools trace and read the compositor's
                            own verdict per frame (PipelineReporter): the share of
                            frames that had something to draw and were DROPPED.
                            Not "presented fps": a slow wheel gesture leaves most
                            frames with nothing new to draw (STATE_NO_UPDATE_
                            DESIRED), so presented/s measures input, not rendering
       --json FILE          write every run's numbers
       --quiet              only the summary table

   WHAT IT MEASURES (per run)
     ceiling   the idle requestAnimationFrame rate of this process before the
               run — headless with a GPU is not locked to 60 (128 Hz measured
               on the dev machine, 165 in a faster bench), software is
               vsync-locked at 60. Every fps is read against it: 60 fps is
               perfect in software and a stall with a GPU.
     fps       frames / time over the window, from rAF timestamps: the rate the
               main thread produced frames (what JS-driven motion sees)
     mean/p95/max frame ms, and "slow" = frames longer than 1.5 × the ceiling
               interval, "janks" = frames over 50 ms
     long tasks (PerformanceObserver 'longtask') and long animation frames
               ('long-animation-frame', with the scripts to blame) in the window
     glass     LG3.engine, refracting hosts (min–max sampled during the run) /
               budget, hosts, and the GL renderer — so a number is never read
               without knowing whether the lens was actually on
     scrolled  how far the page REALLY moved (a gesture that did not scroll is
               a fast, meaningless run)

   WHY A FRESH PROCESS PER CONFIGURATION: one long-lived headless process gave
   chaotic numbers (12–85 fps, 500 ms p95 spikes for a single blur) and stalls
   in 3 of 4 runs; fresh processes were stable and repeatable. Headless cannot show a display refresh rate, so 120 Hz behaviour is
   not measured here — test that on a device.

   Exports launch() for tools/emulate.mjs (one CDP driver, not two).
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

export const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome',
  '/Applications/Microsoft Edge.app/Contents/Mac' + 'OS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/Mac' + 'OS/Google Chrome',
];
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── the CDP driver ────────────────────────────────────────────────────────
   One browser-level WebSocket, flattened sessions per page. The DevTools port
   is 0 (the OS picks one) and read back from stderr, so parallel runs never
   collide on a random port. */
export async function launch({ gpu = true, width = 1440, height = 900, extraArgs = [] } = {}) {
  const exe = BROWSERS.find(p => existsSync(p));
  if (!exe) throw new Error('no Edge/Chrome found');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'fg3-cdp-'));
  const args = ['--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-component-update', '--disable-sync', '--mute-audio',
    /* a fresh profile must stay signed out of the user's Windows account (Edge implicit sign-in); ONE --disable-features only */
    '--disable-features=msImplicitSignin',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    `--window-size=${width},${height}`, '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    ...(gpu ? [] : ['--disable-gpu']), ...extraArgs, 'about:blank'];
  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsURL = await new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error('browser did not report a DevTools endpoint')), 20000);
    proc.stderr.on('data', d => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(t); res(m[1]); }
    });
    proc.on('exit', c => { clearTimeout(t); rej(new Error('browser exited (' + c + ') before DevTools was up')); });
  });
  proc.stderr.resume();
  const ws = new WebSocket(wsURL);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  let seq = 0;
  const pending = new Map(), listeners = new Set();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(p.method + ': ' + m.error.message)) : p.res(m.result);
    } else if (m.method) for (const fn of listeners) fn(m);
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej, method });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
  const browser = {
    proc, send,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async newPage({ isolated = false } = {}) {
      const ctx = isolated ? (await send('Target.createBrowserContext', { disposeOnDetach: true })).browserContextId : undefined;
      const { targetId } = await send('Target.createTarget', { url: 'about:blank', ...(ctx ? { browserContextId: ctx } : {}) });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const page = {
        targetId, sessionId, contextId: ctx,
        send: (m, p) => send(m, p, sessionId),
        on(method, fn) { return browser.on(m => { if (m.sessionId === sessionId && m.method === method) fn(m.params); }); },
        async eval(expression, { timeout = 60000 } = {}) {
          const r = await Promise.race([
            send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId),
            sleep(timeout).then(() => ({ timedOut: true })),
          ]);
          if (r.timedOut) throw new Error('evaluate timed out after ' + timeout + ' ms: ' + expression.slice(0, 60));
          if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
          return r.result.value;
        },
        async navigate(url, { timeout = 20000 } = {}) {
          const loaded = new Promise(res => { const off = page.on('Page.loadEventFired', () => { off(); res(true); }); });
          const r = await page.send('Page.navigate', { url });
          if (r.errorText) throw new Error('navigation failed: ' + r.errorText + ' (' + url + ')');
          return Promise.race([loaded, sleep(timeout).then(() => false)]);
        },
        async close() { try { await send('Target.closeTarget', { targetId }); } catch {} if (ctx) try { await send('Target.disposeBrowserContext', { browserContextId: ctx }); } catch {} },
      };
      return page;
    },
    async close() {
      try { await Promise.race([send('Browser.close'), sleep(1500)]); } catch {}
      try { ws.close(); } catch {}
      try { proc.kill(); } catch {}
      /* Edge holds its profile for a moment after exit (Windows file locks). */
      for (let k = 0; k < 10; k++) { try { await rm(profile, { recursive: true, force: true }); break; } catch { await sleep(300); } }
    },
  };
  return browser;
}

/* Viewport, touch and mobile emulation for a width, the way the tools agree
   on it: < 600 px is a phone (mobile viewport, touch, coarse pointer). */
export async function emulateViewport(page, { width, height, dpr = 1 }) {
  const phone = width < 600;
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: phone });
  if (phone) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  return phone;
}

/* ── page-side recorder ─────────────────────────────────────────────────── */
const RECORDER = `(() => {
  if (window.__fg3perf) return;
  const P = window.__fg3perf = { frames: [], lt: [], loaf: [], lg: [], rec: false, t0: 0, t1: 0 };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.lt.push([e.startTime, e.duration]); })
    .observe({ type: 'longtask', buffered: true }); } catch (e) {}
  /* A long frame names its scripts; one with none was spent in style, layout
     or paint, so the split is recorded too (end - styleAndLayoutStart, end -
     renderStart). */
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) { const end = e.startTime + e.duration;
    const scripts = (e.scripts || []).slice(0, 3).map(s => ((s.sourceURL || '').split('/').pop() || s.invokerType || '?') + (s.sourceFunctionName ? ':' + s.sourceFunctionName : '') + ' ' + Math.round(s.duration) + 'ms');
    const split = 'style+layout ' + Math.round(e.styleAndLayoutStart ? end - e.styleAndLayoutStart : 0) + 'ms, render ' + Math.round(e.renderStart ? end - e.renderStart : 0) + 'ms';
    P.loaf.push([e.startTime, e.duration, e.blockingDuration || 0, scripts.concat(split)]); } })
    .observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
  let n = 0, gen = 0;
  const glass = () => { const L = window.LG3; let r = null; try { r = L ? L.refracting : null; } catch (e) {} return r; };
  /* Each start() owns a generation: a stop() and start() inside one frame
     would otherwise leave the old loop's pending callback alive, and two
     loops record every frame twice (seen: 207 fps against a 128 ceiling). */
  function loop(g) {
    return t => {
      if (!P.rec || g !== gen) return;
      P.frames.push(t);
      if (++n % 10 === 0) P.lg.push(glass());
      requestAnimationFrame(loop(g));
    };
  }
  const mark = n => { try { performance.mark(n); } catch (e) {} };
  P.start = () => { P.frames = []; P.lg = [glass()]; n = 0; P.rec = true; gen++; mark('fg3perf:start'); P.t0 = performance.now(); requestAnimationFrame(loop(gen)); return P.t0; };
  P.stop = () => { P.rec = false; gen++; P.t1 = performance.now(); mark('fg3perf:stop'); P.lg.push(glass()); return P.t1; };
  P.scroll = (dist, ms) => new Promise(res => {
    const y0 = scrollY, t0 = performance.now();
    (function f(t) { const k = Math.min(1, (t - t0) / ms); scrollTo({ top: y0 + dist * k, behavior: 'instant' });
      if (k < 1) requestAnimationFrame(f); else res(scrollY); })(t0);
  });
})();`;

const INFO = `(() => {
  const d = document.documentElement, L = window.LG3;
  let gl = null;
  try { const c = document.createElement('canvas').getContext('webgl'); const x = c && c.getExtension('WEBGL_debug_renderer_info');
    gl = x ? c.getParameter(x.UNMASKED_RENDERER_WEBGL) : (c ? c.getParameter(c.RENDERER) : 'no webgl'); } catch (e) { gl = 'error ' + e.message; }
  let lg = null;
  try { if (L) lg = { engine: L.engine, refracting: L.refracting, budget: L.budget, hosts: L.hosts ? L.hosts.size : null,
    software: L.caps ? !!L.caps.software : null, attr: d.getAttribute('data-lg3-refracting') }; } catch (e) { lg = { error: e.message }; }
  return { title: document.title, docH: Math.max(d.scrollHeight, document.body ? document.body.scrollHeight : 0), vh: innerHeight, vw: innerWidth,
    dpr: devicePixelRatio, gl, lg, fg3: d.getAttribute('data-fg3'), cls: d.className };
})()`;

/* ── statistics ─────────────────────────────────────────────────────────── */
const q = (arr, p) => { if (!arr.length) return NaN; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const r1 = x => Math.round(x * 10) / 10;
function frameStats(frames, ceilingMs) {
  const d = [];
  for (let i = 1; i < frames.length; i++) d.push(frames[i] - frames[i - 1]);
  const span = frames.length > 1 ? frames[frames.length - 1] - frames[0] : 0;
  return {
    frames: frames.length, ms: Math.round(span),
    fps: span ? r1((frames.length - 1) * 1000 / span) : 0,
    mean: r1(d.reduce((a, b) => a + b, 0) / (d.length || 1)), p50: r1(q(d, .5)), p95: r1(q(d, .95)), p99: r1(q(d, .99)), max: r1(d.length ? Math.max(...d) : 0),
    slow: ceilingMs ? d.filter(x => x > ceilingMs * 1.5).length : null,
    over16: d.filter(x => x > 16.7 * 1.25).length,
    janks: d.filter(x => x > 50).length,
  };
}

/* ── trace: what the compositor presented ───────────────────────────────── */
async function readTrace(page, stop) {
  const done = new Promise(res => { const off = page.on('Tracing.tracingComplete', p => { off(); res(p); }); });
  await stop();
  const { stream } = await done;
  let text = '';
  for (;;) {
    const c = await page.send('IO.read', { handle: stream, size: 1 << 20 });
    text += c.base64Encoded ? Buffer.from(c.data, 'base64').toString('utf8') : c.data;
    if (c.eof) break;
  }
  await page.send('IO.close', { handle: stream });
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : json.traceEvents || [];
}
function traceFrames(events, t0us, t1us) {
  /* PipelineReporter (category 'benchmark') is one async event per frame the
     compositor started; its args say whether it was presented or dropped. */
  /* The args key was chrome_frame_reporter in older builds and is
     frame_reporter in Edge 153; accept both. One reporter per frame sequence
     (a frame can be reported by more than one pipeline stage). */
  const pr = new Map();
  let smoothness = 0;
  for (const e of events) {
    if (e.ts < t0us || e.ts > t1us || e.name !== 'PipelineReporter' || e.ph !== 'b') continue;
    const a = e.args && (e.args.frame_reporter || e.args.chrome_frame_reporter);
    if (!a || !a.state) continue;
    const key = (a.frame_source ?? '') + ':' + (a.frame_sequence ?? e.ts) + ':' + (a.layer_tree_host_id ?? '');
    if (!pr.has(key)) { pr.set(key, a.state); if (a.affects_smoothness) smoothness++; }
  }
  const states = {};
  for (const s of pr.values()) states[s] = (states[s] || 0) + 1;
  const presented = (states.STATE_PRESENTED_ALL || 0) + (states.STATE_PRESENTED_PARTIAL || 0);
  const dropped = states.STATE_DROPPED || 0;
  const secs = (t1us - t0us) / 1e6;
  return { reporters: pr.size, presented, dropped, partial: states.STATE_PRESENTED_PARTIAL || 0,
    presentedFps: secs ? r1(presented / secs) : 0, dropPct: presented + dropped ? r1(100 * dropped / (presented + dropped)) : 0,
    noUpdate: states.STATE_NO_UPDATE_DESIRED || 0, affectsSmoothness: smoothness, states };
}

/* ── one configuration, one fresh process ───────────────────────────────── */
export async function measure(url, cfg) {
  const { width, height, dpr = 1, gpu = true, duration = 6, distance, scroll = 'gesture', interact, before, window: win = 1500, wait = 1500, trace = false } = cfg;
  const browser = await launch({ gpu, width, height });
  const out = { url, width, height, dpr, gpu, mode: interact ? 'interact' : 'scroll:' + scroll, errors: [], exceptions: [] };
  try {
    const page = await browser.newPage();
    await page.send('Page.enable'); await page.send('Runtime.enable');
    page.on('Runtime.exceptionThrown', p => out.exceptions.push(p.exceptionDetails.exception?.description?.split('\n')[0] || p.exceptionDetails.text));
    await emulateViewport(page, { width, height, dpr });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
    try { const si = await browser.send('SystemInfo.getInfo'); const g = si.gpu || {};
      out.gpuInfo = { device: (g.devices || []).map(d => d.deviceString).filter(Boolean).join(' / ') || null,
        compositing: g.featureStatus ? g.featureStatus.gpu_compositing : null, rasterization: g.featureStatus ? g.featureStatus.rasterization : null };
    } catch { out.gpuInfo = null; }
    const loaded = await page.navigate(url);
    if (!loaded) out.exceptions.push('load event did not fire within 20 s');
    await page.eval(`Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]).then(() => true)`);
    await page.eval(`new Promise(r => { const d = document.documentElement; if (!window.FG3 || d.getAttribute('data-fg3') === 'ready') return r(true);
      document.addEventListener('fg3:ready', () => r(true), { once: true }); setTimeout(() => r(false), 5000); })`);
    await page.eval('scrollTo({ top: 0, behavior: "instant" }), true');
    await sleep(wait);
    out.info = await page.eval(INFO);

    /* the ceiling: this process at rest */
    await page.eval('__fg3perf.start()'); await sleep(1000);
    await page.eval('__fg3perf.stop()');
    const idle = frameStats(await page.eval('__fg3perf.frames'), 0);
    out.ceiling = { fps: idle.fps, frameMs: idle.p50 };

    if (before) { out.before = await page.eval(before); await sleep(400); }
    if (trace) await page.send('Tracing.start', { transferMode: 'ReturnAsStream',
      traceConfig: { includedCategories: ['benchmark', 'blink.user_timing', 'disabled-by-default-devtools.timeline.frame'], recordMode: 'recordAsMuchAsPossible' } });
    const t0 = await page.eval('__fg3perf.start()');
    if (interact) {
      const s = Date.now();
      try { out.result = await page.eval(interact); } catch (e) { out.exceptions.push('interact threw: ' + e.message); }
      out.snippetMs = Date.now() - s;
      await sleep(Math.max(0, win - out.snippetMs));
    } else {
      const want = Math.max(0, Math.round(distance ?? (out.info.docH - out.info.vh)));
      out.distance = want;
      const ms = duration * 1000;
      let how = scroll;
      if (scroll === 'gesture' && want > 0) {
        try {
          await page.send('Input.synthesizeScrollGesture', { x: Math.round(width / 2), y: Math.round(height / 2), yDistance: -want,
            speed: Math.max(1, Math.round(want * 1000 / ms)), gestureSourceType: 'mouse', preventFling: true });
        } catch (e) { out.errors.push('scroll gesture failed: ' + e.message); how = 'raf'; }
        await sleep(200);
        const y = await page.eval('scrollY');
        if (y < want * 0.9) { out.errors.push('gesture moved the page ' + Math.round(y) + ' of ' + want + ' px; re-ran on rAF'); how = 'raf'; await page.eval('scrollTo({top:0,behavior:"instant"}),true'); await sleep(300); }
      }
      if (how === 'raf' && want > 0) await page.eval(`__fg3perf.scroll(${want}, ${ms})`);
      out.mode = 'scroll:' + how;
      out.scrolled = Math.round(await page.eval('scrollY'));
    }
    const t1 = await page.eval('__fg3perf.stop()');
    const rec = await page.eval('({ frames: __fg3perf.frames, lt: __fg3perf.lt, loaf: __fg3perf.loaf, lg: __fg3perf.lg })');
    out.frame = frameStats(rec.frames, out.ceiling.frameMs);
    const inWin = rec.lt.filter(([s]) => s >= t0 && s <= t1);
    out.longTasks = { count: inWin.length, totalMs: Math.round(inWin.reduce((a, [, d]) => a + d, 0)), maxMs: Math.round(Math.max(0, ...inWin.map(([, d]) => d))) };
    const loaf = rec.loaf.filter(([s]) => s >= t0 && s <= t1);
    out.loaf = { count: loaf.length, maxMs: Math.round(Math.max(0, ...loaf.map(x => x[1]))), blockingMs: Math.round(loaf.reduce((a, x) => a + x[2], 0)),
      worst: loaf.sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => Math.round(x[1]) + 'ms ' + x[3].join(', ')) };
    const lgs = rec.lg.filter(x => x != null);
    out.glass = out.info.lg ? { engine: out.info.lg.engine, refracting: lgs.length ? [Math.min(...lgs), Math.max(...lgs)] : null, budget: out.info.lg.budget,
      hosts: out.info.lg.hosts, software: out.info.lg.software } : null;
    if (trace) {
      const ev = await readTrace(page, () => page.send('Tracing.end'));
      /* The trace clock is not performance.now(): the window is found by the
         performance.mark()s the recorder drops at start and stop, which land
         in the trace as user-timing events on the trace's own clock. */
      const mark = n => ev.find(e => e.name === n && e.cat && e.cat.includes('user_timing'));
      const a = mark('fg3perf:start'), b = mark('fg3perf:stop');
      if (a && b) out.trace = traceFrames(ev, a.ts, b.ts);
      else out.errors.push('trace: start/stop marks not found; presented-frame count skipped');
    }
    if (interact) {
      try { out.lg3perf = await page.eval('window.LG3 && LG3.perf ? JSON.parse(JSON.stringify(LG3.perf)) : null'); } catch {}
    }
  } finally { await browser.close(); }
  return out;
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */
function line(r) {
  const f = r.frame, g = r.glass;
  return [
    String(r.width).padStart(5), (r.gpu ? 'gpu' : 'sw').padEnd(4), r.mode.padEnd(15),
    String(r.ceiling.fps).padStart(6), String(f.fps).padStart(6), String(f.mean).padStart(6), String(f.p95).padStart(6), String(f.max).padStart(7),
    String(f.slow).padStart(5), String(f.janks).padStart(5),
    (r.longTasks.count + '/' + r.longTasks.maxMs).padStart(8),
    (g ? g.engine + ' ' + (g.refracting ? g.refracting.join('-') : '?') + '/' + g.budget : '-').padEnd(18),
    r.trace ? (r.trace.dropPct + '% of ' + (r.trace.presented + r.trace.dropped)).padEnd(15) : '',
    r.scrolled != null ? r.scrolled + '/' + r.distance : (r.snippetMs != null ? 'js ' + r.snippetMs + 'ms' : ''),
  ].join(' ');
}
const HEAD = '  w   gpu  mode           ceil    fps   mean    p95     max  slow janks  lt n/max glass (ref/budget)  ';

async function main() {
  const argv = process.argv.slice(2);
  const takes = new Set(['--width', '--height', '--dpr', '--gpu', '--runs', '--duration', '--distance', '--scroll', '--interact', '--before', '--window', '--wait', '--json']);
  const url = argv.find((a, i) => !a.startsWith('--') && !takes.has(argv[i - 1]));
  const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
  const flag = k => argv.includes('--' + k);
  if (!url) { console.error('usage: node tools/perf.mjs <url> [--width 1440,402] [--gpu on|off|both] [--duration 6] [--interact "<js>"] [--trace] [--json out.json]'); process.exit(2); }
  const widths = String(opt('width', '1440')).split(',').map(Number);
  const gpuModes = { on: [true], off: [false], both: [true, false] }[opt('gpu', 'on')] ?? [true];
  const runs = +opt('runs', 1);
  const results = [];
  if (!flag('quiet')) console.log(url + '\n' + HEAD + (flag('trace') ? 'dropped frames ' : '') + 'scrolled');
  for (const width of widths) for (const gpu of gpuModes) for (let k = 0; k < runs; k++) {
    const height = +opt('height', width < 600 ? 874 : 900);
    const r = await measure(url, { width, height, gpu, dpr: +opt('dpr', 1), duration: +opt('duration', 6), distance: opt('distance') != null ? +opt('distance') : undefined,
      scroll: opt('scroll', 'gesture'), interact: opt('interact'), before: opt('before'), window: +opt('window', 1500), wait: +opt('wait', 1500), trace: flag('trace') });
    results.push(r);
    console.log(line(r));
    if (!flag('quiet')) {
      for (const e of r.exceptions) console.log('        EXCEPTION ' + e);
      for (const e of r.errors) console.log('        ! ' + e);
      if (r.loaf.worst.length) console.log('        worst frames: ' + r.loaf.worst.join(' | '));
      if (r.gpuInfo || r.info) console.log('        renderer: ' + (r.info && r.info.gl) + (r.gpuInfo ? ' · compositing ' + r.gpuInfo.compositing + ' · raster ' + r.gpuInfo.rasterization : '') + ' · dpr ' + r.dpr);
      if (r.result !== undefined) console.log('        interact → ' + JSON.stringify(r.result).slice(0, 200));
      if (r.lg3perf && r.lg3perf.morphFrames) console.log('        LG3 morph: ' + r.lg3perf.morphMeanMs + ' ms mean · ' + r.lg3perf.morphMaxMs + ' max JS/frame over ' + r.lg3perf.morphFrames + ' frames');
    }
  }
  if (runs > 1) {
    const med = a => q(a, .5);
    console.log('median of ' + runs + ' per configuration:');
    for (const width of widths) for (const gpu of gpuModes) {
      const rs = results.filter(r => r.width === width && r.gpu === gpu);
      console.log('  ' + width + ' ' + (gpu ? 'gpu' : 'sw') + ': fps ' + med(rs.map(r => r.frame.fps)) + ' · p95 ' + med(rs.map(r => r.frame.p95)) + ' ms · max ' + med(rs.map(r => r.frame.max)) + ' ms · ceiling ' + med(rs.map(r => r.ceiling.fps)));
    }
  }
  if (opt('json')) await writeFile(opt('json'), JSON.stringify(results, null, 2));
  /* exit 1 = the page threw or never loaded: a number from a broken page is not a number */
  process.exit(results.some(r => r.exceptions.length) ? 1 : 0);
}
const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
