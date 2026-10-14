/* ═══════════════════════════════════════════════════════════════════════════
   serve.mjs — the static server and the Artifact-host emulator (T1)
   ───────────────────────────────────────────────────────────────────────────
     node tools/serve.mjs [root] [port] [options]

       root               the design directory (default: this script's parent)
       port / --port N    default 8810
       --host H           default 127.0.0.1 (use 0.0.0.0 to reach it from a phone)
       --dist DIR         the built tree the emulator serves (default <root>/dist)
       --drop-charset     emulator routes send NO charset and the wrapper has no
                          <meta charset>, so the document decodes as windows-1252:
                          proves the build's non-ASCII escaping (a page that
                          still reads right under this flag survives a host that
                          drops the charset)
       --quiet            do not log 404s

   WHY A SERVER AT ALL: a file:// stylesheet is cross-origin to its own page, so
   document.styleSheets throws and FG3's corner walk (it fetch()es same-origin
   sheets) finds nothing — a structural assertion becomes a protocol artefact.

   THE SOURCE TREE  /<path>  — every file under root, content types WITH
   charset=utf-8 for text (some servers send none), no-store, nosniff
   (a wrong type is refused the way the host refuses it), byte ranges (video
   seeking for data-scrub needs 206), and a directory listing for folders
   without an index.html.

   THE ARTIFACT HOST  /a/ (desktop entry) · /m/ (mobile entry) — the routes,
   entry files and published file sets are read from <dist>/publish-map.json,
   written by tools/artifact-build.mjs, on EVERY request (rebuild, reload; no
   restart). What it reproduces, from the Artifact tool's page contract:
     · the entry is BODY CONTENT: the host wraps it in its own doctype/head/body.
       The head carries only charset + viewport(viewport-fit=cover) + a small
       reset (light color-scheme on :root, safe-area padding, body margin 0 on
       an off-white 14px system ground, img max-width, [hidden] !important).
     · ?theme=dark|light on the entry stamps html[data-theme] the way the
       viewer's theme toggle does (absent = the "system" setting).
     · supporting files are served ONLY if the publish map lists them, and only
       from <dist>. Nothing falls back to the source tree: that would never catch
       a republish that dropped the assets (a republish
       REPLACES the supporting-file set). Unpublished
       → 404 text/plain, which the browser reports as a MIME refusal, exactly
       as on the host.
     · a CSP naming no external origin at all (stricter than the host's CDN
       allowlist, on purpose: the system ships no network at runtime).
   ═══════════════════════════════════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const flag = k => args.includes('--' + k);
const valued = new Set(['--port', '--host', '--dist']);
const positional = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));

const ROOT = path.resolve(positional.find(a => !/^\d+$/.test(a)) ?? path.join(HERE, '..'));
const PORT = +(opt('port') ?? positional.find(a => /^\d+$/.test(a)) ?? 8810);
const HOST = opt('host', '127.0.0.1');
const DIST = path.resolve(ROOT, opt('dist', 'dist'));
const DROP_CHARSET = flag('drop-charset');
const QUIET = flag('quiet');

const TEXT = { '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.map': 'application/json',
  '.svg': 'image/svg+xml', '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.xml': 'application/xml' };
const BINARY = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.wasm': 'application/wasm', '.pdf': 'application/pdf' };
function typeOf(file, charset = true) {
  const ext = path.extname(file).toLowerCase();
  if (TEXT[ext]) return TEXT[ext] + (charset ? '; charset=utf-8' : '');
  return BINARY[ext] ?? 'application/octet-stream';
}

/* Every source is 'self' or inline; no host is named, so any external
   subresource is refused. connect-src 'self' is load-bearing: FG3's corner
   fallback fetch()es its own stylesheets. Navigations are not subresources, so
   cross-artifact <a href> links still work, as they do on the host. */
const CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:", "media-src 'self' data: blob:",
  "connect-src 'self'", "worker-src 'self' blob:", "frame-src 'self'", "object-src 'none'",
  "base-uri 'none'"].join('; ');

/* The host's skeleton, per the Artifact page contract. Deliberately thin:
   anything richer would hide a page that leans on styling the host does not
   give. The off-white ground and 14px system font are the host's, so a page
   that forgets to paint its own body shows it here too. */
function wrap(content, theme) {
  return '<!doctype html>\n<html' + (theme ? ' data-theme="' + theme + '"' : '') + '>\n<head>\n' +
    (DROP_CHARSET ? '' : '<meta charset="utf-8">\n') +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px)}' +
    'body{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#faf9f7;color:#1f1f1f}' +
    'img{max-width:100%}[hidden]{display:none!important}</style>\n' +
    '</head>\n<body>\n' + content + '\n</body>\n</html>\n';
}

const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
function notFound(res, msg, extra) {
  if (!QUIET) console.log('404 ' + msg);
  res.writeHead(404, Object.assign({ 'content-type': 'text/plain; charset=utf-8' }, BASE_HEADERS, extra || {}));
  res.end(msg + '\n');
}
/* Inside root, never beside it: path.relative, not startsWith — "design-x"
   starts with "design". */
function inside(base, p) {
  const r = path.relative(base, p);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

async function sendFile(req, res, file, extra, charset = true) {
  const st = await stat(file);
  const headers = Object.assign({ 'content-type': typeOf(file, charset), 'accept-ranges': 'bytes' },
    BASE_HEADERS, extra || {});
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? +range[1] : st.size - +range[2];
    let end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    if (start < 0) start = 0;
    if (start > end || start >= st.size) {
      res.writeHead(416, Object.assign({ 'content-range': 'bytes */' + st.size }, BASE_HEADERS)); res.end(); return;
    }
    res.writeHead(206, Object.assign(headers, { 'content-range': `bytes ${start}-${end}/${st.size}`,
      'content-length': end - start + 1 }));
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, Object.assign(headers, { 'content-length': st.size }));
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
}

async function listing(res, dir, url) {
  const items = (await readdir(dir, { withFileTypes: true }))
    .sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const body = '<!doctype html><meta charset="utf-8"><title>' + esc(url) + '</title>' +
    '<style>body{font:14px/1.6 ui-monospace,Consolas,monospace;margin:24px}a{text-decoration:none}</style>' +
    '<h1 style="font-size:16px">' + esc(url) + '</h1><ul>' +
    (url !== '/' ? '<li><a href="../">../</a></li>' : '') +
    items.map(d => { const n = d.name + (d.isDirectory() ? '/' : ''); return '<li><a href="' + encodeURI(n) + '">' + esc(n) + '</a></li>'; }).join('') +
    '</ul>';
  res.writeHead(200, Object.assign({ 'content-type': 'text/html; charset=utf-8' }, BASE_HEADERS));
  res.end(body);
}

/* ── the publish map ─────────────────────────────────────────────────────── */
let mapCache = { mtime: -1, map: null };
async function loadMap() {
  /* Re-read whenever the build rewrites it; parse once per build. */
  const f = path.join(DIST, 'publish-map.json');
  try {
    const m = (await stat(f)).mtimeMs;
    if (m !== mapCache.mtime) mapCache = { mtime: m, map: JSON.parse(await readFile(f, 'utf8')) };
    return mapCache.map;
  } catch { mapCache = { mtime: -1, map: null }; return null; }
}
function routeOf(map, url) {
  if (!map || !map.artifacts) return null;
  for (const [id, a] of Object.entries(map.artifacts)) {
    const r = (a.route || '').replace(/\/$/, '');
    if (r && (url === r || url.startsWith(r + '/'))) return { id, a, rest: url.slice(r.length).replace(/^\//, '') };
  }
  return null;
}

async function artifactRoute(req, res, hit, query) {
  const { id, a, rest } = hit;
  const csp = { 'content-security-policy': CSP };
  if (rest === '' || rest === 'index.html') {
    if (!a.file_path) { notFound(res, 'artifact "' + id + '" has no entry: ' + (a.missing || 'not built'), csp); return; }
    const file = path.resolve(DIST, a.file_path);
    if (!inside(DIST, file)) { res.writeHead(403, BASE_HEADERS).end(); return; }
    let content;
    try { content = await readFile(file, 'utf8'); }
    catch { notFound(res, 'entry missing from dist: ' + a.file_path, csp); return; }
    const theme = /^(light|dark)$/.test(query.get('theme') || '') ? query.get('theme') : '';
    const body = wrap(content, theme);
    res.writeHead(200, Object.assign({ 'content-type': 'text/html' + (DROP_CHARSET ? '' : '; charset=utf-8') },
      BASE_HEADERS, csp));
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(body);
    return;
  }
  /* Only what the map publishes, only from dist. */
  const src = a.files && Object.prototype.hasOwnProperty.call(a.files, rest) ? a.files[rest] : null;
  if (src == null) { notFound(res, 'not published in "' + id + '": ' + rest, csp); return; }
  const file = path.resolve(DIST, src);
  if (!inside(DIST, file)) { res.writeHead(403, BASE_HEADERS).end(); return; }
  try { await sendFile(req, res, file, csp, !DROP_CHARSET); }
  catch { notFound(res, 'published but missing from dist: ' + rest + ' -> ' + src, csp); }
}

createServer(async (req, res) => {
  let url, query;
  try {
    const u = new URL(req.url, 'http://x');
    url = decodeURIComponent(u.pathname); query = u.searchParams;
  } catch { res.writeHead(400, BASE_HEADERS).end('bad url'); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, BASE_HEADERS).end(); return; }

  /* ── artifact-host emulation ─────────────────────────────────────────── */
  const map = await loadMap();
  const hit = routeOf(map, url);
  if (hit) {
    if (url === hit.a.route.replace(/\/$/, '')) { res.writeHead(301, { location: hit.a.route }).end(); return; }
    await artifactRoute(req, res, hit, query); return;
  }
  if (/^\/[am](\/|$)/.test(url)) {
    notFound(res, map ? 'no artifact is routed at ' + url + ' — see dist/publish-map.json'
      : 'dist/ is not built (' + path.join(DIST, 'publish-map.json') + ' missing) — run node tools/artifact-build.mjs',
      { 'content-security-policy': CSP });
    return;
  }

  /* ── the plain source tree ───────────────────────────────────────────── */
  const file = path.resolve(ROOT, '.' + url);
  if (!inside(ROOT, file)) { res.writeHead(403, BASE_HEADERS).end(); return; }
  try {
    const st = await stat(file);
    if (st.isDirectory()) {
      if (!url.endsWith('/')) { res.writeHead(301, { location: url + '/' }).end(); return; }
      const idx = path.join(file, 'index.html');
      try { await stat(idx); await sendFile(req, res, idx); } catch { await listing(res, file, url); }
      return;
    }
    await sendFile(req, res, file);
  } catch { notFound(res, 'not found: ' + url); }
}).listen(PORT, HOST, () => {
  const base = 'http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT;
  console.log('serving ' + ROOT + ' on ' + base + '/');
  console.log('  artifact host (desktop) -> ' + base + '/a/   (?theme=dark|light)');
  console.log('  artifact host (mobile)  -> ' + base + '/m/');
  console.log('  emulator serves ONLY ' + DIST + ', as listed in publish-map.json' +
    (DROP_CHARSET ? '  [charset DROPPED]' : ''));
}).on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'port ' + PORT + ' is taken — pass another' : e.message); process.exit(1); });
