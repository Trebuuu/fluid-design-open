/* Drive a real headless Edge/Chrome over the DevTools protocol, so a page can be
   SEEN at a given width, scroll position, tone and motion setting — not just
   loaded. There is no Playwright on this machine; Node 24 ships WebSocket, and
   the protocol is all this needs.

     node tools/shoot.mjs <url> [options]

     --out <dir>          where PNGs go (default ./shots)
     --name <stem>        file stem (default derived from the url)
     --width 1440         viewport width   (402 = the phone surface)
     --height 900         viewport height
     --scroll 0,900,1800  capture once per scroll offset (px), or "steps:8"
                          for eight evenly spaced captures down the page
     --full               one capture of the whole document height
     --dark               emulate prefers-color-scheme: dark
     --reduced-motion     emulate prefers-reduced-motion: reduce
     --wait 1200          ms to settle after the page is ready and after each scroll
     --eval "<js>"        evaluate an expression once the page is ready, print the
                          JSON result (a returned promise is awaited)
     --eval-timeout 45    seconds any one evaluation may take; past it the run
                          stops with an error and exit 1 instead of hanging
     --ready-timeout 30   seconds to wait for the page to be READY (below)
     --console            print the page's console messages and exceptions
     --no-touch           at phone widths (< 600) touch is emulated by default,
                          because a ≤734px window WITHOUT touch is a small
                          desktop and correctly gets the base experience
     --here               capture where the page is after --eval (no scrolling),
                          so an overlay the eval opened is still on screen

   READY means the document has finished loading (readyState "complete": a
   long page is fully parsed) and, on a page that loads FG3, FG3's boot has
   finished (html[data-fg3="ready"], the 'fg3:ready' event). Nothing is
   evaluated or captured before that. A page still not ready after
   --ready-timeout is reported on stderr and as "ready": false in the
   result, and the run goes on.

   Exit code is 1 if the page threw an uncaught exception, so a script that
   dies on load cannot pass as a screenshot of an empty page, and 1 when an
   evaluation or a protocol call does not answer in time. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const url = argv.find(a => !a.startsWith('--') && !isValue(a));
function isValue(a) { const i = argv.indexOf(a); return i > 0 && argv[i - 1].startsWith('--') && !['--full','--dark','--reduced-motion','--console','--here','--no-touch'].includes(argv[i - 1]); }
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const flag = k => argv.includes('--' + k);
if (!url) { console.error('usage: node tools/shoot.mjs <url> [--width 1440] [--scroll steps:6] ...'); process.exit(2); }

const W = +opt('width', 1440), H = +opt('height', 900), WAIT = +opt('wait', 1200);
const EVAL_MS = +opt('eval-timeout', 45) * 1000, READY_MS = +opt('ready-timeout', 30) * 1000;
const OUT = path.resolve(opt('out', 'shots'));
const STEM = opt('name', url.replace(/^https?:\/\/[^/]+\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'page');

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/Mac' + 'OS/Google Chrome',
];
const exe = BROWSERS.find(p => existsSync(p));
if (!exe) { console.error('no Edge/Chrome found'); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 500);
const prof = path.join(os.tmpdir(), 'fd3-shoot-' + port);
const proc = spawn(exe, ['--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--disable-features=msImplicitSignin', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, 'about:blank'],
  { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error('browser did not expose a page target');
}

let ws, seq = 0, keepFront = null; const pending = new Map(); const listeners = [];
/* Every call answers or fails: a protocol call that never comes back (a
   renderer stuck in a dialog, a crashed browser) rejects after `ms` instead
   of leaving node waiting forever. */
function send(method, params = {}, ms = 60000) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    const t = setTimeout(() => { pending.delete(id); rej(new Error(method + ' did not answer within ' + Math.round(ms / 1000) + ' s')); }, ms);
    pending.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
  });
}
/* Evaluate in the page with a bounded wait (--eval-timeout): a promise that
   never settles is an error, not a hang. */
async function evalJS(expr, ms = EVAL_MS) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, ms)
    .catch(e => { throw new Error(/did not answer/.test(e.message) ? 'evaluation did not settle within ' + Math.round(ms / 1000) + ' s (--eval-timeout): ' + expr.slice(0, 80) : e.message); });
  if (r.exceptionDetails) throw new Error('evaluation threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
/* READY: loaded (a long page fully parsed) and, where FG3 is on the page,
   booted. Polled from node so a navigation that replaces the document
   mid-check is simply asked again. */
const READY = `(() => { const d = document.documentElement;
  return { url: location.href, readyState: document.readyState, fg3: d ? d.getAttribute('data-fg3') : null, hasFG3: !!window.FG3 }; })()`;
async function waitReady(ms) {
  const t0 = Date.now(); let st = null;
  while (Date.now() - t0 < ms) {
    try { st = await evalJS(READY, 5000); } catch { st = null; }
    if (st && st.url !== 'about:blank' && st.readyState === 'complete' && (!st.hasFG3 || st.fg3 === 'ready')) return { ready: true, ms: Date.now() - t0 };
    await sleep(100);
  }
  return { ready: false, ms: Date.now() - t0, state: st };
}
let threw = false;
async function main() {
  ws = new WebSocket(await target());
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('close', () => { for (const [id, p] of pending) { pending.delete(id); p.rej(new Error('the browser closed the connection')); } });
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method) listeners.forEach(fn => fn(m));
  });
  await send('Page.enable'); await send('Runtime.enable');
  /* Headless Edge on Windows flips the page to visibilityState=hidden ~12 s in,
     after which rAF and scroll events stop — a long --eval then reads like a
     hang. Focus emulation plus a periodic bringToFront keeps it rendering. */
  try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
  keepFront = setInterval(() => { send('Page.bringToFront').catch(() => {}); }, 4000);
  listeners.push(m => {
    if (m.method === 'Runtime.exceptionThrown') { threw = true; console.log('[exception]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); }
    if (flag('console') && m.method === 'Runtime.consoleAPICalled') console.log(`[console.${m.params.type}]`, m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
  if (W < 600 && !flag('no-touch')) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const media = [];
  if (flag('dark')) media.push({ name: 'prefers-color-scheme', value: 'dark' });
  if (flag('reduced-motion')) media.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  if (media.length) await send('Emulation.setEmulatedMedia', { features: media });

  const nav = await send('Page.navigate', { url });
  if (nav.errorText) throw new Error('navigation failed: ' + nav.errorText);
  /* Not the load event alone: a race against it let an --eval run while a
     long page was still parsing (documentHeight 10,470 of 34,010, an empty
     querySelectorAll). The page's own state decides. */
  const rd = await waitReady(READY_MS);
  if (!rd.ready) console.error(`[not ready] after ${Math.round(rd.ms / 1000)} s: readyState=${rd.state?.readyState ?? '?'}, data-fg3=${rd.state?.fg3 ?? 'none'}${rd.state?.hasFG3 ? '' : ' (no FG3)'}; going on`);
  await sleep(WAIT);

  if (opt('eval')) {
    /* A snippet that throws is reported (exit 1) and the capture still runs;
       one that never settles ends the run: the page may be wedged. */
    let out;
    try { out = await evalJS(opt('eval')); console.log(JSON.stringify(out, null, 2)); }
    catch (e) { if (!/^evaluation threw/.test(e.message)) throw e; threw = true; console.log('[eval]', e.message); }
  }

  await mkdir(OUT, { recursive: true });
  const docH = await evalJS('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)');
  let offsets = [0];
  const sc = opt('scroll');
  if (sc && sc.startsWith('steps:')) { const n = +sc.slice(6); offsets = Array.from({ length: n }, (_, i) => Math.round(i * Math.max(0, docH - H) / Math.max(1, n - 1))); }
  else if (sc) offsets = sc.split(',').map(Number);
  if (flag('here')) offsets = [await evalJS('Math.round(scrollY)')];

  const files = [];
  if (flag('full')) {
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.min(docH, 16000), deviceScaleFactor: 1, mobile: W < 600 });
    await sleep(WAIT);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(OUT, `${STEM}-${W}-full.png`); await writeFile(f, Buffer.from(shot.data, 'base64')); files.push(f);
  } else {
    for (const y of offsets) {
      // Step there rather than jump, so scroll-driven and IO-driven reveals see the travel.
      const cur = await evalJS('scrollY');
      if (flag('here')) { await sleep(WAIT); const shot = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(OUT, STEM + '-' + W + '-here.png'); await writeFile(f, Buffer.from(shot.data, 'base64')); files.push(f); break; }
      const steps = Math.max(1, Math.round(Math.abs(y - cur) / 300));
      for (let i = 1; i <= steps; i++) { await evalJS(`scrollTo(0, ${Math.round(cur + (y - cur) * i / steps)})`); await sleep(40); }
      await sleep(WAIT);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const f = path.join(OUT, `${STEM}-${W}-y${y}.png`); await writeFile(f, Buffer.from(shot.data, 'base64')); files.push(f);
    }
  }
  console.log(JSON.stringify({ url, width: W, height: H, ready: rd.ready, documentHeight: docH, threw, files }, null, 2));
}
main().catch(e => { console.error(e.message); threw = true; })
  .finally(async () => { clearInterval(keepFront); try { ws?.close(); } catch {} proc.kill(); await sleep(300); rm(prof, { recursive: true, force: true }).catch(() => {}); process.exit(threw ? 1 : 0); });
