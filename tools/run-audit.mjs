/* run-audit.mjs — drive audit.html in headless Edge over every page in
   tools/pages.json, print one row per page and the failures, exit 1 on any
   contrast failure, keyboard problem or page that could not load. A page
   that is not written yet is reported, not failed.

     node tools/run-audit.mjs [url] [options]

     url                  default: a fresh tools/serve.mjs on a free port,
                          /audit.html on it
     --width 1440         the width every page is audited at (402 = phone:
                          the frame is 402 × 874; the audit window stays 1440)
     --tones light,dark   which appearances to walk (default both)
     --pages a.html,b     audit these instead of tools/pages.json
     --verify             check the audit against the SCREEN: every failing
                          text box (and a sample of passes on art and glass)
                          is screenshotted and its contrast re-measured from
                          the pixels (median ground vs the 2 % ink extreme).
                          Pages are shown unscaled on top of the audit for this
                          (?raw). Reported, not gated: anti-aliasing makes the
                          pixel figure read low on small thin text. The box is
                          cropped in code from a capture of the whole viewport,
                          never taken with captureScreenshot's clip: clip is in
                          DOCUMENT coordinates, so on a scrolled page a
                          viewport box lands on the wrong pixels.
     --dump <dir>         with --verify: save the screenshot of every box whose
                          pixels disagree with the audit, to look at; with
                          --rings: the unfocused/focused pair of every ring
                          whose median reads under 3:1 or that is not drawn
     --rings              also measure every focus ring ON THE SCREEN, per
                          tone: each control the keyboard walk reached is
                          captured (its box + 8 px) unfocused, twice (a change
                          no bigger than what moves between the two is not
                          the ring), then focused with focusVisible; each
                          pixel the focus changed is compared with the same
                          pixel unfocused (WCAG 2.4.13). Not drawn, or a
                          median under 3:1 (unless the pixels at 3:1 would
                          make a 2 px perimeter), is a keyboard problem; with
                          more moving pixels than ring pixels it is skipped
                          ("the ground keeps moving"). Pages are
                          shown unscaled (?raw), and the clip is moved into
                          DOCUMENT coordinates by the visual viewport's offset
                          (Page.getLayoutMetrics). Slow: about 0.3 s a
                          control per tone
     --timeout 1800       seconds for the whole run
     --json <file>        write the full report
     --max 6              failures listed per page

   Specimens (audit.js: [data-specimen], [data-audit-exempt], the specimen
   half of a .doc-dont) are measured but never gated; the ones below
   threshold are listed apart per page, as "specimen".

   Reuses the CDP driver in tools/perf.mjs. */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, emulateViewport, sleep } from './perf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const flag = k => argv.includes('--' + k);
const VALUED = new Set(['--width', '--tones', '--pages', '--timeout', '--json', '--max', '--dump']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));
const WIDTH = +opt('width', 1440), TONES = opt('tones', 'light,dark'), TIMEOUT = +opt('timeout', 1800) * 1000, MAX = +opt('max', 6);
const VERIFY = flag('verify'), RINGS = flag('rings');

async function server() {
  if (positional[0]) return { url: positional[0], stop() {} };
  const port = 8900 + Math.floor(Math.random() * 90);
  const proc = spawn(process.execPath, [path.join(HERE, 'serve.mjs'), ROOT, String(port), '--quiet'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('serve.mjs did not start')), 10000);
    proc.stdout.on('data', d => { if (/serving/.test(String(d))) { clearTimeout(t); res(); } });
    proc.on('exit', c => { clearTimeout(t); rej(new Error('serve.mjs exited ' + c)); });
  });
  return { url: `http://127.0.0.1:${port}/audit.html`, stop() { proc.kill(); } };
}

/* ── PNG → RGBA (8-bit, non-interlaced: what captureScreenshot writes) ───── */
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = ct === 6 ? 4 : 3, stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
/* the w × h region at (x, y) of a decoded image, clamped to it */
function crop(img, x, y, w, h) {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(img.w, Math.round(x + w)), y1 = Math.min(img.h, Math.round(y + h));
  if (x1 <= x0 || y1 <= y0) return null;
  const cw = x1 - x0, ch = y1 - y0, px = Buffer.alloc(cw * ch * img.bpp);
  for (let r = 0; r < ch; r++) img.px.copy(px, r * cw * img.bpp, ((y0 + r) * img.w + x0) * img.bpp, ((y0 + r) * img.w + x1) * img.bpp);
  return { w: cw, h: ch, bpp: img.bpp, px };
}
/* RGBA/RGB → PNG (filter 0), for --dump */
function encodePNG(img) {
  const chunk = (type, data) => { const len = Buffer.alloc(4), crc = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    len.writeUInt32BE(data.length); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = img.bpp === 4 ? 6 : 2;
  const stride = img.w * img.bpp, raw = Buffer.alloc((stride + 1) * img.h);
  for (let y = 0; y < img.h; y++) img.px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
/* the focus ring from three captures of one box: a1, a2 unfocused, c
   focused. A pixel the focus changed differs from BOTH unfocused captures
   (RGB distance ≥ 40) by more than they differ from each other (+ 24): a
   ground that keeps moving (art under glass) is not a ring, and a white
   ring over it still is. It is read against the same pixel before, the
   lower of the two readings. */
function ringStats(a1, a2, c) {
  if (a1.w !== c.w || a1.h !== c.h || a2.w !== c.w || a2.h !== c.h) throw new Error('the captures differ in size');
  const Y = (img, i) => { const k = i * img.bpp; return 0.2126 * lin(img.px[k]) + 0.7152 * lin(img.px[k + 1]) + 0.0722 * lin(img.px[k + 2]); };
  const dist = (p, q, i) => { const a = i * p.bpp, b = i * q.bpp; return Math.abs(p.px[a] - q.px[b]) + Math.abs(p.px[a + 1] - q.px[b + 1]) + Math.abs(p.px[a + 2] - q.px[b + 2]); };
  const rs = [], mean = [0, 0, 0]; let unstable = 0, strong = 0;
  for (let i = 0; i < c.w * c.h; i++) {
    const d = Math.min(dist(a1, c, i), dist(a2, c, i));
    if (d < 40) continue;
    if (d < dist(a1, a2, i) + 24) { unstable++; continue; }
    const yc = Y(c, i), rr = y => (Math.max(y, yc) + 0.05) / (Math.min(y, yc) + 0.05), r = Math.min(rr(Y(a1, i)), rr(Y(a2, i)));
    rs.push(r); if (r >= 3) strong++;
    for (let k = 0; k < 3; k++) mean[k] += c.px[i * c.bpp + k];
  }
  rs.sort((p, q) => p - q);
  const hex = rs.length ? '#' + mean.map(v => Math.round(v / rs.length).toString(16).padStart(2, '0')).join('') : null;
  return { changed: rs.length, unstable, strong, median: rs.length ? +rs[rs.length >> 1].toFixed(2) : null, p10: rs.length ? +rs[Math.floor(rs.length * 0.1)].toFixed(2) : null, ring: hex };
}
function pixelRatio(img, inkDark) {
  const L = [];
  for (let i = 0; i < img.w * img.h; i++) { const k = i * img.bpp; L.push(0.2126 * lin(img.px[k]) + 0.7152 * lin(img.px[k + 1]) + 0.0722 * lin(img.px[k + 2])); }
  L.sort((a, b) => a - b);
  const ground = L[L.length >> 1], ink = inkDark ? L[Math.floor(L.length * 0.02)] : L[Math.floor(L.length * 0.98)];
  return (Math.max(ground, ink) + 0.05) / (Math.min(ground, ink) + 0.05);
}

async function main() {
  const srv = await server();
  const browser = await launch({ width: 1440, height: 900 });
  let code = 0;
  try {
    const page = await browser.newPage({ isolated: true });
    await emulateViewport(page, { width: 1440, height: 900 });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    try { await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
    await page.send('Page.enable'); await page.send('Runtime.enable');
    const exceptions = [];
    page.on('Runtime.exceptionThrown', p => exceptions.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    let verified = 0, agree = 0; const disagreements = [];
    if (VERIFY) {
      await page.send('Runtime.addBinding', { name: '__auditVerify' });
      page.on('Runtime.bindingCalled', async p => {
        if (p.name !== '__auditVerify') return;
        const info = JSON.parse(p.payload);
        let result = null;
        try {
          const b = info.box, pad = 2;
          /* the box is in the audit window's VIEWPORT coordinates (audit.js
             adds the frame's place and border); captureScreenshot's clip
             would read it as DOCUMENT coordinates, so capture the viewport
             and crop here */
          let x0 = b.x - pad, y0 = b.y - pad, x1 = b.x + b.w + pad, y1 = b.y + b.h + pad;
          /* …and only the part inside the box the text stands in (info.clip):
             a glyph box that pokes out of a badge's capsule would otherwise
             bring the bar around the capsule in as "ground" */
          const c = info.clip;
          if (c) {
            const cx0 = Math.max(x0, c.x), cy0 = Math.max(y0, c.y), cx1 = Math.min(x1, c.x + c.w), cy1 = Math.min(y1, c.y + c.h);
            if (cx1 > cx0 && cy1 > cy0 && (cx1 - cx0) * (cy1 - cy0) >= 0.5 * b.w * b.h) { x0 = cx0; y0 = cy0; x1 = cx1; y1 = cy1; }
          }
          const shot = await page.send('Page.captureScreenshot', { format: 'png' });
          const box = crop(decodePNG(Buffer.from(shot.data, 'base64')), x0, y0, x1 - x0, y1 - y0);
          if (!box) throw new Error('box outside the viewport');
          const pr = pixelRatio(box, info.inkDark);
          result = { pixel: +pr.toFixed(2) };
          verified++;
          const close = Math.abs(pr - info.ratio) / info.ratio < 0.2;
          if (close) agree++; else {
            disagreements.push(`${info.where}: audit ${info.ratio.toFixed(2)}, pixels ${pr.toFixed(2)}`);
            if (opt('dump')) { mkdirSync(opt('dump'), { recursive: true }); writeFileSync(path.join(opt('dump'), `differs-${disagreements.length}.png`), encodePNG(box)); }
          }
        } catch (e) { result = { error: e.message }; }
        page.send('Runtime.evaluate', { expression: `window.__auditVerified(${info.id}, ${JSON.stringify(result)})` }).catch(() => {});
      });
    }
    let ringBase = null, ringDumps = 0;
    if (RINGS) {
      await page.send('Runtime.addBinding', { name: '__auditRing' });
      page.on('Runtime.bindingCalled', async p => {
        if (p.name !== '__auditRing') return;
        const info = JSON.parse(p.payload);
        let result = null;
        try {
          /* the box is in the audit window's VIEWPORT coordinates; a clip is
             in DOCUMENT coordinates, so it is moved by where the visual
             viewport sits (a scrolled audit.html would shift every capture) */
          const grab = async () => {
            const m = await page.send('Page.getLayoutMetrics'), vv = m.cssVisualViewport || m.visualViewport, b = info.box;
            const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: b.x + vv.pageX, y: b.y + vv.pageY, width: b.w, height: b.h, scale: 1 } });
            return { img: decodePNG(Buffer.from(shot.data, 'base64')), png: shot.data };
          };
          if (info.phase === 'base') {
            const a1 = await grab(); await sleep(60); const a2 = await grab();
            ringBase = { key: info.key, a1, a2 }; result = { ok: true };
          } else {
            if (!ringBase || ringBase.key !== info.key) throw new Error('no unfocused capture for this control');
            const c = await grab();
            result = ringStats(ringBase.a1.img, ringBase.a2.img, c.img);
            if (opt('dump') && (!result.changed || result.median < 3)) {
              mkdirSync(opt('dump'), { recursive: true }); ringDumps++;
              writeFileSync(path.join(opt('dump'), `ring-${ringDumps}-off.png`), Buffer.from(ringBase.a1.png, 'base64'));
              writeFileSync(path.join(opt('dump'), `ring-${ringDumps}-on.png`), Buffer.from(c.png, 'base64'));
              result.dump = `ring-${ringDumps}`;
            }
            ringBase = null;
          }
        } catch (e) { result = { error: e.message }; }
        page.send('Runtime.evaluate', { expression: `window.__auditRinged(${info.id}, ${JSON.stringify(result)})` }).catch(() => {});
      });
    }
    const q = new URLSearchParams({ run: '', tones: TONES });
    if (WIDTH === 402) q.set('width', '402');
    if (opt('pages')) q.set('pages', opt('pages'));
    if (VERIFY || RINGS) q.set('raw', '');   /* unscaled at 0,0: the boxes are the screen's */
    const url = srv.url + (srv.url.includes('?') ? '&' : '?') + q.toString().replace(/=(&|$)/g, '$1');
    const keep = setInterval(() => { page.send('Page.bringToFront').catch(() => {}); }, 3000);
    let rep = null;
    try {
      await page.navigate(url, { timeout: 30000 });
      const t0 = Date.now();
      let last = '';
      while (Date.now() - t0 < TIMEOUT) {
        await sleep(1500);
        const st = await page.eval('JSON.stringify({done: !!(window.__audit && window.__audit.done), n: window.__audit ? window.__audit.pages.length : 0, s: (document.getElementById("au-status")||{}).textContent})', { timeout: 30000 }).catch(() => null);
        if (!st) continue;
        const s = JSON.parse(st);
        if (s.s && s.s !== last) { last = s.s; process.stderr.write('\r' + s.s.slice(0, 100).padEnd(100)); }
        if (s.done) { rep = JSON.parse(await page.eval('JSON.stringify(window.__audit)', { timeout: 60000 })); break; }
      }
      process.stderr.write('\r' + ' '.repeat(100) + '\r');
    } finally { clearInterval(keep); }
    if (!rep) { console.log('ERROR the audit did not finish in ' + TIMEOUT / 1000 + ' s'); return 1; }

    const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n), rpad = (s, n) => (' '.repeat(n) + String(s)).slice(-n);
    console.log(`\naudit at ${rep.width} px, ${rep.tones.join(' + ')}, base experience (every reveal at rest)\n`);
    console.log(pad('page', 28) + rpad('measured', 10) + rpad('fail', 6) + rpad('unmeas', 8) + rpad('art', 6) + rpad('glass', 7) + rpad('worst', 9) + rpad('keys', 6) + rpad('kbd!', 6) + rpad('s', 7));
    for (const p of rep.pages) {
      if (p.status !== 'ok') { console.log(pad(p.path, 28) + '  ' + (p.status === 'missing' ? 'missing: ' : 'ERROR: ') + (p.note || '')); continue; }
      const tones = Object.values(p.tones), sum = k => tones.reduce((a, c) => a + (c[k] || 0), 0);
      const fails = tones.reduce((a, c) => a + c.failures.length, 0);
      const worst = tones.map(c => c.worst).filter(Boolean).sort((a, b) => a.ratio - b.ratio)[0];
      console.log(pad(p.path, 28) + rpad(sum('checked'), 10) + rpad(fails, 6) + rpad(sum('unmeasurable'), 8) + rpad(sum('onArt'), 6) + rpad(sum('onGlass'), 7) +
        rpad(worst ? worst.ratio.toFixed(2) : '-', 9) + rpad(p.keyboard ? p.keyboard.checked : '-', 6) + rpad(p.keyboard ? p.keyboard.findings.length : '-', 6) + rpad((p.ms / 1000).toFixed(1), 7));
    }
    const t = rep.totals;
    console.log(`\n${t.pages} pages, ${t.checked} text measurements, ${t.failures} below threshold, ${t.unmeasurable} unmeasurable, ${t.exempt} exempt` +
      (t.specimenFailures ? ` (${t.specimenFailures} specimen${t.specimenFailures === 1 ? '' : 's'} below threshold, not gated)` : '') + '; ' +
      `${t.kbChecked} controls, ${t.kbFindings} keyboard problems; ${t.missing} not written yet, ${t.errors} could not load; ${(rep.ms / 1000).toFixed(0)} s`);
    if (rep.rings) {
      const why = {};
      rep.pages.forEach(p => Object.values(p.rings || {}).forEach(r => Object.entries(r.reasons).forEach(([k, v]) => { why[k] = (why[k] || 0) + v; })));
      console.log(`rings on the screen: ${t.ringChecked} measured (a control once per tone), ${t.ringSkipped} skipped` +
        (Object.keys(why).length ? ' (' + Object.entries(why).map(([k, v]) => `${v} ${k}`).join(', ') + ')' : ''));
    }
    for (const p of rep.pages) {
      if (p.status === 'error') console.log(`\n${p.path}: could not load: ${p.note}`);
      if (p.status !== 'ok') continue;
      const fails = Object.entries(p.tones).flatMap(([tone, c]) => c.failures.map(f => ({ tone, ...f })));
      const kb = p.keyboard ? p.keyboard.findings : [];
      const specs = Object.entries(p.tones).flatMap(([tone, c]) => (c.specimenFailures || []).map(f => ({ tone, ...f })));
      if (!fails.length && !kb.length && !p.bootErrors && !specs.length) continue;
      console.log(`\n${p.path}`);
      (p.bootErrors || []).forEach(e => console.log('  boot error  ' + e));
      fails.slice(0, MAX).forEach(f => console.log(`  ${f.ratio.toFixed(2)}:1 < ${f.need}  ${f.tone.padEnd(5)} ${f.fg} on ${f.bg}  ${Math.round(f.size)}px/${f.weight}${f.flags.art ? ' art' : ''}${f.flags.glass ? ' glass' : ''}  ${f.where}  "${f.text.slice(0, 40)}"` +
        (f.verified && f.verified.pixel ? `  [pixels ${f.verified.pixel}]` : '')));
      if (fails.length > MAX) console.log(`  … ${fails.length - MAX} more`);
      specs.slice(0, MAX).forEach(f => console.log(`  specimen ${f.ratio.toFixed(2)}:1 < ${f.need}  ${f.tone.padEnd(5)} ${f.fg} on ${f.bg}  ${f.where}  "${f.text.slice(0, 40)}"  (exempt, not gated)`));
      if (specs.length > MAX) console.log(`  … ${specs.length - MAX} more specimens`);
      kb.slice(0, MAX).forEach(k => console.log(`  keyboard: ${k.kind}  ${k.where || ''}  ${k.detail}`));
      if (kb.length > MAX) console.log(`  … ${kb.length - MAX} more keyboard findings`);
    }
    if (VERIFY) {
      console.log(`\nverified against the screen: ${verified} boxes, ${agree} within 20 % of the audit's figure`);
      disagreements.slice(0, 12).forEach(d => console.log('  differs: ' + d));
    }
    if (exceptions.length) { console.log('\nexceptions in the audit page:'); exceptions.forEach(e => console.log('  ' + e)); code = 1; }
    if (flag('json')) writeFileSync(opt('json'), JSON.stringify(rep, null, 2));
    if (t.failures || t.kbFindings || t.errors) code = 1;
  } finally { await browser.close(); srv.stop(); }
  return code;
}
main().then(c => process.exit(c), e => { console.error(e.stack || e.message); process.exit(1); });
