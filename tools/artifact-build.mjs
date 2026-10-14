/* ═══════════════════════════════════════════════════════════════════════════
   artifact-build.mjs — build dist/, the publishable tree, and refuse to build
   a tree that would break on the Artifact host (T1)
   ───────────────────────────────────────────────────────────────────────────
     node tools/artifact-build.mjs [options]
       --root DIR         the design tree (default: this script's parent)
       --out DIR          where dist goes (default <root>/dist)
       --manifest FILE    the page list (default <root>/tools/pages.json)
       --url ID=URL       a published artifact's claude.ai URL, so another
                          artifact can link to it (repeatable). Needed before
                          publishing a 'single' entry that links into the site.
       --strict           unresolved cross-artifact links become refusals
       --selftest         build fixtures in a temp dir, then break each gate and
                          check the build refuses (see "SELF TEST" at the end)

   WHAT IT MAKES (read by tools/serve.mjs's /a/ and /m/ and by the publish step)
     dist/artifact-<id>.html   an ENTRY: body content only. The host supplies
                               <!doctype>, <html>, <head>, <body>, so:
                               · <title> first (the host scans the first 8KB)
                               · a parse-time script restores the source page's
                                 <html>/<body> attributes (bundling strips them)
                                 and sets data-tone on <html> with FG3's own
                                 precedence (stored choice > author data-tone >
                                 host data-theme > prefers-color-scheme),
                                 mirroring the host's data-theme until FG3 runs
                               · the head's stylesheets, <style>s and scripts
                                 are lifted, in order, into the content.
                                 Stylesheets stay LINKED, never inlined: fonts
                                 are named relative to the stylesheet.
     dist/pages/<path>         supporting pages, whole documents, at their source
                               path; links to the entry become ./ (the host
                               reserves index.html for the entry)
     dist/assets/…             assets/, copied whole
     dist/files/<path>         any other file a page references
     dist/publish-map.json     {generator, root, artifacts: {<id>: {route,
                               title, src, file_path, scope, url, files:
                               {<published path>: <path under dist>},
                               unresolved[]}}, skipped[], warnings[]}
     Publish one artifact with the Artifact tool as: file_path = dist/<file_path>,
     root = dist, files = artifacts.<id>.files — the WHOLE map every time: a
     republish REPLACES the supporting-file set.

   TRANSFORMS, applied to every text file that ships (html, css, js, json)
     · references are resolved against the SOURCE location and re-expressed
       from the PUBLISHED location (an entry moves to the artifact root)
     · non-ASCII is escaped per context — HTML text/attributes &#x…;, CSS
       \XXXXXX, JS \uXXXX in strings/regex/comments (Unicode spaces in JS code
       become plain spaces) — so the tree is pure ASCII and survives a host
       that drops the charset
     · every String#replace takes a FUNCTION: a replacement string interprets
       $& $' $` $1, and page text contains those

   GATES — the build refuses (exit 1, dist/ untouched) on:
     comments   an unbalanced block comment in any shipped stylesheet or <style>
     missing    a reference to a file that is not in the tree (including fonts
                named by url() relative to the stylesheet)
     link       an internal .html link to a page this artifact does not publish
                (a data-* attribute that reads like a path counts, except the
                display-text ones in DISPLAY_ATTRS: DEVICE's data-url is the
                address a browser frame SHOWS, not a link)
     external   a subresource on another origin (the host CSP blocks it), or a
                root-absolute URL (the artifact does not live at /)
     vars       var(--x) with no fallback and no declaration anywhere shipped
                (CSS, <style>, style="", JS strings, attributes). tools/
                check-vars.mjs also runs when it exists and must exit 0
     syntax     a shipped script (asset or inline) that does not parse
     count      a page quoting "<n> assertions" that disagrees with the count in
                selftest.html (skipped cleanly while those pages do not exist)
     ascii      any non-ASCII left in a shipped text file
     entry      an entry that leaked <html>/<head>/<body>, or whose <title> is
                not first
     out        a file the map publishes that did not land in the written tree
                (read back before the swap), or an --out it did not write
   Pages listed in the manifest that do not exist yet are SKIPPED with a
   warning, not an error — but a link to one is still a dead link.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFile, writeFile, mkdir, readdir, stat, rm, rename, mkdtemp, cp } from 'node:fs/promises';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const P = path.posix;
const GENERATOR = 'tools/artifact-build.mjs';
const TEXT_EXT = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json']);

/* ─────────────────────────────────────────────────────────────────────────
   1. ESCAPING — pure ASCII out, meaning unchanged
   ───────────────────────────────────────────────────────────────────────── */
const hex = (n, w) => n.toString(16).padStart(w, '0');
/* A non-ASCII char right after an odd run of backslashes is an identity
   escape (\é means é in JS and CSS). Escaping it again would leave "\\u00e9",
   an escaped backslash — so the lone backslash is dropped first. */
function dropIdentityBackslash(out) {
  let k = 0; while (out.length - 1 - k >= 0 && out[out.length - 1 - k] === '\\') k++;
  return k % 2 ? out.slice(0, -1) : out;
}
function escHTML(s) {
  if (!/[^\x00-\x7f]/.test(s)) return s;
  let o = '';
  for (const ch of s) { const c = ch.codePointAt(0); o += c > 0x7f ? '&#x' + c.toString(16) + ';' : ch; }
  return o;
}
function escCSS(s) {
  if (!/[^\x00-\x7f]/.test(s)) return s;
  let o = '';
  /* Six hex digits need no terminating space, so the next char can never be
     swallowed into the escape. */
  for (const ch of s) { const c = ch.codePointAt(0); o = c > 0x7f ? dropIdentityBackslash(o) + '\\' + hex(c, 6) : o + ch; }
  return o;
}
const JS_SPACE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/;
function escJSText(s, kind) {
  if (!/[^\x00-\x7f]/.test(s)) return s;
  let o = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x7f) { o += s[i]; continue; }
    if (kind === 'code') {
      /* Outside strings a Unicode space is whitespace and a line separator is a
         line break — "\u00a0" there would be an identifier escape and a
         SyntaxError. Anything else in code is an identifier char. */
      if (JS_SPACE.test(s[i])) { o += ' '; continue; }
      if (c === 0x2028 || c === 0x2029) { o += '\n'; continue; }
    }
    o = dropIdentityBackslash(o) + '\\u' + hex(c, 4);   /* UTF-16 units: astral → surrogate pair */
  }
  return o;
}
function escJS(src) { return lexJS(src).map(seg => escJSText(src.slice(seg.a, seg.b), seg.kind)).join(''); }

/* ─────────────────────────────────────────────────────────────────────────
   2. LEXERS — just enough structure to know WHERE a character is
   ───────────────────────────────────────────────────────────────────────── */
const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%',
  '<', '>', '~', '^', '/', 'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await']);
/* Segments: code | str | tmpl | regex | comment, with offsets [a, b). */
function lexJS(s) {
  const out = [], n = s.length, braces = [];
  let i = 0, codeStart = 0, prev = '';
  const push = (kind, a, b) => { if (b > a) out.push({ kind, a, b }); };
  function template(from) {             /* s[from] is ` or the } that closes ${ */
    let j = from + 1;
    while (j < n) {
      if (s[j] === '\\') { j += 2; continue; }
      if (s[j] === '`') { push('tmpl', from, j + 1); prev = 'x'; return j + 1; }
      if (s[j] === '$' && s[j + 1] === '{') { push('tmpl', from, j + 2); braces.push('tmpl'); prev = '{'; return j + 2; }
      j++;
    }
    push('tmpl', from, n); return n;
  }
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { push('code', codeStart, i); let j = s.indexOf('\n', i); if (j < 0) j = n; push('comment', i, j); i = codeStart = j; continue; }
    if (c === '/' && d === '*') { push('code', codeStart, i); let j = s.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; push('comment', i, j); i = codeStart = j; continue; }
    if (c === '"' || c === "'") {
      push('code', codeStart, i);
      let j = i + 1;
      while (j < n && s[j] !== c && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1;
      j = Math.min(j + 1, n); push('str', i, j); i = codeStart = j; prev = 'x'; continue;
    }
    if (c === '`') { push('code', codeStart, i); i = codeStart = template(i); continue; }
    if (c === '}' && braces.length && braces[braces.length - 1] === 'tmpl') { braces.pop(); push('code', codeStart, i); i = codeStart = template(i); continue; }
    if (c === '/' && REGEX_AFTER.has(prev)) {
      let j = i + 1, cls = false, ok = false;
      while (j < n) {
        const ch = s[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '\n') break;
        if (ch === '[') cls = true; else if (ch === ']') cls = false;
        else if (ch === '/' && !cls) { ok = true; break; }
        j++;
      }
      if (ok) {
        j++; while (j < n && /[a-z]/i.test(s[j])) j++;
        push('code', codeStart, i); push('regex', i, j); i = codeStart = j; prev = 'x'; continue;
      }
    }
    if (c === '{') braces.push('{');
    else if (c === '}') braces.pop();
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i; while (j < n && /[A-Za-z0-9_$]/.test(s[j])) j++;
      prev = s.slice(i, j); i = j; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  push('code', codeStart, n);
  return out;
}

/* CSS: comment ranges, and the two ways a comment goes wrong. String-aware, so
   content:"*" + "/" in a string is not a stray close. */
function scanCSS(s) {
  const comments = [], problems = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') {
      const j = s.indexOf('*/', i + 2);
      if (j < 0) { problems.push({ at: i, msg: 'opens a comment that never closes' }); comments.push([i, s.length]); break; }
      comments.push([i, j + 2]); i = j + 2; continue;
    }
    if (c === '*' && s[i + 1] === '/') {
      problems.push({ at: i, msg: 'has a */ outside a comment: the comment above it closed early, and the rule after it is being eaten' });
      i += 2; continue;
    }
    if (c === '"' || c === "'") { let j = i + 1; while (j < s.length && s[j] !== c && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1; i = j + 1; continue; }
    i++;
  }
  return { comments, problems };
}
function blankRanges(s, ranges) {
  let o = '', last = 0;
  for (const [a, b] of ranges) { o += s.slice(last, a) + s.slice(a, b).replace(/[^\n]/g, () => ' '); last = b; }
  return o + s.slice(last);
}
const lineAt = (s, at) => { let n = 1; for (let i = 0; i < at && i < s.length; i++) if (s.charCodeAt(i) === 10) n++; return n; };

/* HTML: tokens with offsets. script/style are raw text; title/textarea are
   escapable raw text (entities fine, no tags). Attribute values stay RAW
   (undecoded) so an untouched tag round-trips byte for byte. */
const RAWTEXT = new Set(['script', 'style', 'title', 'textarea']);
function tokenizeHTML(s) {
  const toks = [], n = s.length;
  let i = 0, textStart = 0;
  const flush = end => { if (end > textStart) toks.push({ t: 'text', raw: s.slice(textStart, end), at: textStart }); };
  while (i < n) {
    if (s[i] !== '<') { i++; continue; }
    if (s.startsWith('<!--', i)) { flush(i); let j = s.indexOf('-->', i + 4); j = j < 0 ? n : j + 3; toks.push({ t: 'comment', raw: s.slice(i, j), at: i }); i = textStart = j; continue; }
    if (s[i + 1] === '!' || s[i + 1] === '?') { flush(i); let j = s.indexOf('>', i); j = j < 0 ? n : j + 1; toks.push({ t: 'doctype', raw: s.slice(i, j), at: i }); i = textStart = j; continue; }
    if (s[i + 1] === '/') {
      const m = /^<\/([a-zA-Z][\w:-]*)[^>]*>/.exec(s.slice(i, i + 256));
      if (m) { flush(i); toks.push({ t: 'end', name: m[1].toLowerCase(), raw: m[0], at: i }); i = textStart = i + m[0].length; continue; }
      i++; continue;
    }
    if (!/[a-zA-Z]/.test(s[i + 1] || '')) { i++; continue; }
    flush(i);
    const at = i;
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(s[j])) j++;
    const name = s.slice(i + 1, j).toLowerCase(), attrs = [];
    let self = false;
    while (j < n) {
      while (j < n && /\s/.test(s[j])) j++;
      if (s[j] === '>') { j++; break; }
      if (s[j] === '/' && s[j + 1] === '>') { self = true; j += 2; break; }
      if (s[j] === '/') { j++; continue; }
      let k = j; while (k < n && !/[\s"'>\/=]/.test(s[k])) k++;
      if (k === j) k++;                                   /* a stray quote: consume it */
      const an = s.slice(j, k); j = k;
      while (j < n && /\s/.test(s[j])) j++;
      if (s[j] === '=') {
        j++; while (j < n && /\s/.test(s[j])) j++;
        const q = s[j] === '"' || s[j] === "'" ? s[j] : '';
        let v;
        if (q) { const e = s.indexOf(q, j + 1); v = s.slice(j + 1, e < 0 ? n : e); j = e < 0 ? n : e + 1; }
        else { let e = j; while (e < n && !/[\s>]/.test(s[e])) e++; v = s.slice(j, e); j = e; }
        attrs.push({ name: an, lname: an.toLowerCase(), value: v, q, has: true });
      } else attrs.push({ name: an, lname: an.toLowerCase(), value: '', q: '', has: false });
    }
    const tok = { t: 'start', name, attrs, self, raw: s.slice(at, j), at, dirty: false };
    toks.push(tok);
    i = textStart = j;
    if (RAWTEXT.has(name) && !self) {
      const re = new RegExp('</' + name + '[\\s>/]', 'ig'); re.lastIndex = j;
      const m = re.exec(s); const e = m ? m.index : n;
      toks.push({ t: 'raw', name, raw: s.slice(j, e), at: j, open: tok });
      i = textStart = e;
    }
  }
  flush(n);
  return toks;
}
function serializeTag(tok) {
  if (!tok.dirty) return tok.raw;
  return '<' + tok.name + tok.attrs.map(a => {
    if (!a.has) return ' ' + a.name;
    let q = a.q;
    if (!q && /[\s"'=<>`]/.test(a.value)) q = '"';
    if (q && a.value.includes(q)) q = q === '"' ? "'" : '"';
    return ' ' + a.name + '=' + q + a.value + q;
  }).join('') + (tok.self ? ' />' : '>');
}
const attrOf = (tok, n) => { const a = tok.attrs.find(x => x.lname === n); return a ? a.value : null; };
/* The named entities pages actually use; any other is left as written. */
const NAMED = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: '\u00a0', middot: '\u00b7', ndash: '\u2013',
  mdash: '\u2014', hellip: '\u2026', times: '\u00d7', rarr: '\u2192', larr: '\u2190', lsquo: '\u2018', rsquo: '\u2019',
  ldquo: '\u201c', rdquo: '\u201d', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', bull: '\u2022', deg: '\u00b0' };
function decodeEntities(v) {
  return v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : +k.slice(1));
    return NAMED[k] ?? m;
  });
}
const JS_TYPES = /^(|text\/javascript|application\/javascript|module|text\/ecmascript|application\/json|application\/ld\+json|importmap|speculationrules)$/i;

/* ─────────────────────────────────────────────────────────────────────────
   3. THE BUILD
   ───────────────────────────────────────────────────────────────────────── */
async function walk(dir, base = '') {
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + d.name : d.name;
    if (d.isDirectory()) out.push(...await walk(path.join(dir, d.name), rel));
    else out.push(rel);
  }
  return out;
}
function expandPages(list, root) {
  const out = [];
  for (const p of list) {
    if (!p.includes('*')) { out.push(p); continue; }
    const dir = P.dirname(p), re = new RegExp('^' + P.basename(p).replace(/[.+^${}()|[\]\\]/g, m => '\\' + m).replace(/\*/g, () => '[^/]*') + '$');
    let names = [];
    try { names = readdirSync(path.join(root, ...dir.split('/'))).sort(); } catch {}
    for (const f of names) if (re.test(f)) out.push(dir === '.' ? f : dir + '/' + f);
  }
  return [...new Set(out)];
}

/* The parse-time script for an entry. Runs inside the host's <body>, before
   anything of ours paints. FG3 takes over tone once fg3.js has loaded (it has
   the same precedence and its own data-theme observer); until then — and on
   pages that never load fg3.js — this mirrors the host's toggle itself. */
function bootstrap(htmlAttrs, bodyAttrs, authorTone) {
  const J = o => JSON.stringify(o).replace(/[<>&\u2028\u2029]/g, c => '\\u' + hex(c.charCodeAt(0), 4));
  return '<script>/* ' + GENERATOR + ': the host owns <html> and <body>; restore ours during parse */\n' +
    '(function(){var d=document.documentElement,b=document.body,H=' + J(htmlAttrs) + ',B=' + J(bodyAttrs) +
    ',T=' + J(authorTone) + ',k;\n' +
    'for(k in H){if(k==="class")d.className=(d.className+" "+H[k]).trim();else d.setAttribute(k,H[k]);}\n' +
    'if(b)for(k in B){if(k==="class")b.className=(b.className+" "+B[k]).trim();else b.setAttribute(k,B[k]);}\n' +
    'function pick(){var s=null;try{s=localStorage.getItem("fg3-tone")}catch(e){}\n' +
    ' if((s==="light"||s==="dark")&&!d.hasAttribute("data-tone-lock"))return s;if(T)return T;\n' +
    ' var h=d.getAttribute("data-theme");if(h==="light"||h==="dark")return h;\n' +
    ' try{return matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){return "light"}}\n' +
    'if(T)d.setAttribute("data-tone",T);else{d.setAttribute("data-tone",pick());d.setAttribute("data-tone-auto","")}\n' +
    'function sync(){if(window.FG3&&FG3.getTone)return;var t=pick();if(d.getAttribute("data-tone")!==t)d.setAttribute("data-tone",t)}\n' +
    'try{new MutationObserver(sync).observe(d,{attributes:true,attributeFilter:["data-theme"]})}catch(e){}\n' +
    'try{matchMedia("(prefers-color-scheme: dark)").addEventListener("change",sync)}catch(e){}})();</script>';
}

const URL_ATTRS = new Set(['href', 'src', 'poster', 'data', 'action', 'formaction', 'xlink:href', 'background', 'manifest']);
const SUBRESOURCE_TAGS = new Set(['script', 'link', 'img', 'source', 'video', 'audio', 'track', 'iframe', 'embed', 'object', 'image', 'use', 'input']);
const PATHLIKE = /^(?!\/)(?![a-z][a-z0-9+.-]*:)(?:\.{1,2}\/)*[\w@~+%.,-]+(?:\/[\w@~+%.,-]+)*\.(?:html?|css|m?js|json|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|mov|mp3|m4a|wav|txt|pdf|wasm)(?:[?#][^\s'"]*)?$/i;
const looksLikePath = v => PATHLIKE.test(v) && (v.includes('/') || /\.html?(?:[?#]|$)/i.test(v));
/* data-* attributes whose value is text the page SHOWS, never a reference:
   DEVICE's browser frame prints data-url in its address bar
   (data-url="fluid.example/hello.html" is not a link to hello.html). */
const DISPLAY_ATTRS = new Set(['data-url']);

export async function build(opts = {}) {
  const ROOT = path.resolve(opts.root ?? path.join(HERE, '..'));
  const OUT = path.resolve(opts.out ?? path.join(ROOT, 'dist'));
  const MANIFEST = path.resolve(opts.manifest ?? path.join(ROOT, 'tools', 'pages.json'));
  const urls = opts.urls ?? {};
  const hook = opts.__hook ?? {};                /* self-test only: switch a transform off */
  const failures = [], warnings = [], notes = [];
  const fail = (gate, msg) => failures.push({ gate, msg });
  const warn = msg => warnings.push(msg);

  const man = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const ASSETS = (man.assets ?? 'assets').replace(/\/$/, '');
  const exists = rel => { try { return statSync(path.join(ROOT, ...rel.split('/'))).isFile(); } catch { return false; } };
  const readText = async rel => readFile(path.join(ROOT, ...rel.split('/')), 'utf8');

  /* ── the page list ───────────────────────────────────────────────────── */
  const listed = expandPages(man.pages ?? [], ROOT);
  const pages = listed.filter(exists), skipped = listed.filter(p => !exists(p));
  for (const p of skipped) warn('skipped ' + p + ' (listed in ' + path.basename(MANIFEST) + ', does not exist yet)');
  const entries = (man.entries ?? []).map(e => ({ ...e, present: exists(e.src) }));
  for (const e of entries) if (!e.present) warn('entry "' + e.id + '" skipped: ' + e.src + ' does not exist yet');
  const live = entries.filter(e => e.present);

  /* ── assets ──────────────────────────────────────────────────────────── */
  const assetFiles = existsSync(path.join(ROOT, ASSETS)) ? (await walk(path.join(ROOT, ASSETS))).map(f => ASSETS + '/' + f) : [];
  const assetSet = new Set(assetFiles);

  /* ── artifacts and what each publishes ───────────────────────────────── */
  const siteOf = e => e.scope === 'single' ? live.find(x => x.id === e.site) ?? live.find(x => x.scope !== 'single') : e;
  const art = {};
  for (const e of live) {
    art[e.id] = { entry: e, files: {}, unresolved: [], pages: e.scope === 'single' ? [] : pages.filter(p => p !== e.src) };
    for (const a of assetFiles) art[e.id].files[a] = a;
  }
  /* Where does source path `target` live, seen from artifact `a`? '' = the
     entry itself; a path = published beside it; {url} = in another artifact. */
  function pubOf(a, target) {
    const e = a.entry;
    if (target === e.src) return '';
    if (a.pages.includes(target)) return target;
    const site = siteOf(e);
    if (site && site !== e && (site.src === target || art[site.id].pages.includes(target))) {
      const rest = site.src === target ? '' : target;
      if (urls[site.id]) return { url: urls[site.id].replace(/\/$/, '') + (rest ? '/' + rest : '') };
      a.unresolved.push(target);
      return { url: (site.route || '/a/') + rest, unresolved: true };
    }
    return null;
  }

  /* Everything shipped, for the vars gate: [{file, kind: css|js|attr, text}] */
  const corpus = [];
  const inlineScripts = [];                       /* {where, code, type} */
  const outputs = [];                             /* {rel: path under OUT, text|copy} */
  const shippedExtra = new Map();                 /* src → true */

  /* ── one document ────────────────────────────────────────────────────── */
  function processDoc(a, srcPath, pubPath, isEntry, html) {
    const where = srcPath + (isEntry ? ' (entry "' + a.entry.id + '")' : '');
    const srcDir = P.dirname(srcPath), pubDir = isEntry ? '.' : P.dirname(pubPath);
    const moved = srcDir !== pubDir;
    const toks = tokenizeHTML(html);
    const lineOf = at => lineAt(html, at);

    function resolve(value, { at, sub, what }) {
      const v = value.trim();
      if (!v || /^(#|data:|blob:|mailto:|tel:|sms:|javascript:|about:)/i.test(v)) return value;
      if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//')) {
        if (sub) fail('external', where + ':' + lineOf(at) + ' loads ' + v + ' from another origin; the host CSP blocks it: ship it in ' + ASSETS + '/');
        return value;
      }
      if (v.startsWith('/')) { fail('external', where + ':' + lineOf(at) + ' uses the root-absolute URL ' + v + '; the artifact does not live at /, make it relative'); return value; }
      const m = /^([^?#]*)(.*)$/s.exec(v), p = m[1], tail = m[2];
      if (!p) return value;
      let target = P.normalize(P.join(srcDir, decodeURIComponent(p)));
      if (target.startsWith('..')) { fail('missing', where + ':' + lineOf(at) + ' references ' + v + ', outside the published tree'); return value; }
      if (p.endsWith('/')) {
        const idx = (target === '.' ? '' : target.replace(/\/?$/, '/')) + 'index.html';
        const pub = pubOf(a, idx);
        if (pub === null) { warn(where + ':' + lineOf(at) + ' links to the folder ' + v + ', which publishes no page'); return value; }
        target = idx;
      }
      let pub;
      if (/\.html?$/i.test(target)) {
        pub = pubOf(a, target);
        if (pub === null) {
          fail('link', where + ':' + lineOf(at) + ' links to ' + target + ', which artifact "' + a.entry.id + '" does not publish' +
            (skipped.includes(target) ? ' (listed in the manifest, does not exist yet)' : listed.includes(target) ? '' : ' (not in the manifest)'));
          return value;
        }
        if (typeof pub === 'object') return pub.url + tail;
      } else {
        if (!exists(target)) { fail('missing', where + ':' + lineOf(at) + ' references ' + v + ' -> ' + target + ', which does not exist'); return value; }
        if (!assetSet.has(target)) { a.files[target] = 'files/' + target; shippedExtra.set(target, true); }
        pub = target;
      }
      if (!moved && pub === target && !hook.forceRewrite) return value;
      if (hook.noRebase) return value;
      let rel = P.relative(pubDir, pub === '' ? '.' : pub);
      if (pub === '') rel = rel ? rel + '/' : './';
      else if (!rel) rel = P.basename(pub);
      return rel + tail;
    }
    function rewriteCSS(css, at, whereCSS) {
      const { comments, problems } = scanCSS(css);
      for (const pr of problems) fail('comments', whereCSS + ':' + lineOf(at + pr.at) + ' ' + pr.msg);
      corpus.push({ file: whereCSS, kind: 'css', text: blankRanges(css, comments), base: lineOf(at) - 1 });
      const inC = k => comments.some(([x, y]) => k >= x && k < y);
      return css.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g, (m, q1, u1, q2, u2, off) => {
        if (inC(off)) return m;
        const u = u1 ?? u2, r = resolve(u, { at: at + off, sub: true });
        return r === u ? m : m.split(u).join(r);
      });
    }

    let htmlAttrs = {}, bodyAttrs = {}, authorTone = '', state = 'pre';
    const titleParts = [], headParts = [], bodyParts = [], docParts = [];
    let group = null;                             /* the head element being collected */
    for (let ti = 0; ti < toks.length; ti++) {
      const tok = toks[ti];
      let out;
      if (tok.t === 'start') {
        for (const at of tok.attrs) {
          if (!at.has) continue;
          if (URL_ATTRS.has(at.lname) || (at.lname === 'href' && tok.name === 'use')) {
            const sub = SUBRESOURCE_TAGS.has(tok.name) && !(tok.name === 'link' && /^(canonical|alternate|next|prev)$/i.test(attrOf(tok, 'rel') || ''));
            const nv = resolve(at.value, { at: tok.at, sub, what: at.lname });
            if (nv !== at.value) { at.value = nv; tok.dirty = true; }
          } else if (at.lname === 'srcset' || at.lname === 'imagesrcset') {
            const nv = at.value.split(',').map(part => part.replace(/^(\s*)(\S+)/, (m, sp, u) => sp + resolve(u, { at: tok.at, sub: true }))).join(',');
            if (nv !== at.value) { at.value = nv; tok.dirty = true; }
          } else if (at.lname === 'style') {
            const nv = rewriteCSS(at.value, tok.at, where + ' style=""');
            if (nv !== at.value) { at.value = nv; tok.dirty = true; }
          } else if (at.lname.startsWith('on')) {
            corpus.push({ file: where + ' ' + at.lname, kind: 'js', text: decodeEntities(at.value), base: lineOf(tok.at) - 1 });
          } else {
            corpus.push({ file: where + ' [' + at.lname + ']', kind: 'attr', text: decodeEntities(at.value), base: lineOf(tok.at) - 1 });
            if (at.lname.startsWith('data-') && !DISPLAY_ATTRS.has(at.lname) && looksLikePath(at.value.trim())) {
              const nv = resolve(at.value, { at: tok.at, sub: true });
              if (nv !== at.value) { at.value = nv; tok.dirty = true; }
            }
          }
        }
        if (tok.name === 'html') {
          for (const x of tok.attrs) if (x.lname === 'data-tone') authorTone = decodeEntities(x.value); else htmlAttrs[x.lname] = decodeEntities(x.value);
        }
        if (tok.name === 'body') for (const x of tok.attrs) bodyAttrs[x.lname] = decodeEntities(x.value);
        out = escHTML(serializeTag(tok));
      } else if (tok.t === 'raw') {
        if (tok.name === 'style') out = escCSS(rewriteCSS(tok.raw, tok.at, where + ' <style>'));
        else if (tok.name === 'script') {
          const type = (attrOf(tok.open, 'type') || '').trim();
          let code = tok.raw;
          if (JS_TYPES.test(type)) {
            if (!/json|importmap|speculationrules/i.test(type)) {
              /* path literals: validate, and re-point them when the doc moved */
              const segs = lexJS(code);
              code = segs.map(sg => {
                const txt = code.slice(sg.a, sg.b);
                if (sg.kind !== 'str' || txt.length < 3) return txt;
                const inner = txt.slice(1, -1), q = txt[0];
                if (looksLikePath(inner)) { const r = resolve(inner, { at: tok.at + sg.a, sub: false }); return r === inner ? txt : q + r + q; }
                if (moved && /^(\.{1,2}\/)+[\w-]+\/$/.test(inner)) {
                  warn(where + ':' + lineOf(tok.at + sg.a) + ' builds a URL from ' + txt + ' at runtime; re-pointed for the moved entry, but only the emulator can prove it');
                  const nv = P.relative(pubDir, P.normalize(P.join(srcDir, inner))) + '/';
                  return q + nv + q;
                }
                return txt;
              }).join('');
            }
            inlineScripts.push({ where: where + ':' + lineOf(tok.at), code, type });
            if (!/json|importmap|speculationrules/i.test(type)) corpus.push({ file: where + ' <script>', kind: 'js', text: code, base: lineOf(tok.at) - 1 });
            out = hook.noEscape ? code : escJS(code);
          } else {
            warn(where + ':' + lineOf(tok.at) + ' <script type="' + type + '"> is not JS; its non-ASCII became HTML entities');
            out = escHTML(code);
          }
        } else out = escHTML(tok.raw);
      } else out = escHTML(tok.raw);
      if (hook.noEscape) out = tok.t === 'start' ? serializeTag(tok) : (tok.t === 'raw' ? out : tok.raw);

      docParts.push(out);
      if (!isEntry) continue;
      /* ── entry: partition into title / head / body ───────────────────── */
      if (tok.t === 'doctype') continue;
      if (tok.t === 'start' && tok.name === 'html') continue;
      if (tok.t === 'end' && (tok.name === 'html' || tok.name === 'body')) { state = 'post'; continue; }
      if (tok.t === 'start' && tok.name === 'head') { state = 'head'; continue; }
      if (tok.t === 'end' && tok.name === 'head') { state = 'between'; continue; }
      if (tok.t === 'start' && tok.name === 'body') { state = 'body'; continue; }
      if (state === 'post') { if (tok.t !== 'text' || tok.raw.trim()) bodyParts.push(out); continue; }
      if (state === 'body' || (state === 'between' && !(tok.t === 'text' && !tok.raw.trim()))) {
        if (state === 'between') state = 'body';
        bodyParts.push(out); continue;
      }
      /* head (or before it) */
      if (group) { group.parts.push(out); if (tok.t === 'end' && tok.name === group.name) group = null; continue; }
      if (tok.t === 'start') {
        const rel = (attrOf(tok, 'rel') || '').toLowerCase();
        if (tok.name === 'title') { group = { name: 'title', parts: [out] }; titleParts.push(group); continue; }
        if (tok.name === 'meta') continue;                                   /* the host owns charset + viewport */
        if (tok.name === 'base') { warn(where + ': <base> dropped: it would re-root the host document'); continue; }
        if (tok.name === 'link' && /\b(icon|manifest|canonical)\b/.test(rel)) continue;
        if (tok.name === 'link') { headParts.push({ parts: [out] }); continue; }
        group = { name: tok.name, parts: [out] }; headParts.push(group);
        if (tok.self) group = null;
        continue;
      }
      if (tok.t === 'comment' || (tok.t === 'text' && !tok.raw.trim())) continue;
      headParts.push({ parts: [out] });
    }
    if (!isEntry) return docParts.join('');

    /* bundling strips <body> attrs; tone belongs on <html>, never <body> */
    if (!authorTone && bodyAttrs['data-tone']) {
      authorTone = bodyAttrs['data-tone']; delete bodyAttrs['data-tone'];
      notes.push(where + ': <body data-tone> moved to <html> (tokens live on :root)');
    }
    if (hook.dropBodyAttrs) bodyAttrs = {};
    let title = titleParts.length ? titleParts[0].parts.join('') : '';
    if (!title) {
      const t = a.entry.title || a.entry.id;
      warn(where + ' has no <title>; using "' + t + '" (the host names the artifact from it)');
      title = '<title>' + escHTML(t.replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;')) + '</title>';
    }
    const boot = hook.noEscape ? bootstrap(htmlAttrs, bodyAttrs, authorTone) : escJS(bootstrap(htmlAttrs, bodyAttrs, authorTone));
    const head = headParts.map(g => g.parts.join('')).join('\n');
    const body = bodyParts.join('').trim();
    if (hook.keepSkeleton) return docParts.join('');
    if (hook.naiveReplace) return '%TITLE%\n%BOOT%\n\n%HEAD%\n\n%BODY%\n'.replace('%TITLE%', title).replace('%BOOT%', boot).replace('%HEAD%', head).replace('%BODY%', body);
    return [title, boot, '', head, '', body, ''].join('\n');
  }

  /* ── gate: comments in every shipped stylesheet ──────────────────────── */
  for (const f of assetFiles.filter(f => f.endsWith('.css'))) {
    const css = await readText(f);
    const { comments, problems } = scanCSS(css);
    for (const pr of problems) fail('comments', f + ':' + lineAt(css, pr.at) + ' ' + pr.msg);
    corpus.push({ file: f, kind: 'css', text: blankRanges(css, comments), base: 0 });
    /* fonts and images named relative to THE STYLESHEET, not the page */
    const clean = blankRanges(css, comments);
    for (const m of clean.matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g)) {
      const u = (m[2] ?? m[4]).trim();
      if (/^(data:|blob:|#)/i.test(u)) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//') || u.startsWith('/')) { fail('external', f + ':' + lineAt(css, m.index) + ' loads ' + u + ' (not a relative, shipped file)'); continue; }
      const target = P.normalize(P.join(P.dirname(f), u.replace(/[?#].*$/, '')));
      if (!exists(target)) fail('missing', f + ':' + lineAt(css, m.index) + ' names ' + u + ' -> ' + target + ', which does not exist (a stylesheet names files relative to ITSELF)');
      else if (!assetSet.has(target)) { shippedExtra.set(target, true); for (const a of Object.values(art)) a.files[target] = 'files/' + target; }
    }
  }
  for (const f of assetFiles.filter(f => /\.m?js$/.test(f))) corpus.push({ file: f, kind: 'js', text: await readText(f), base: 0 });

  /* ── documents ───────────────────────────────────────────────────────── */
  const pageOutputs = new Map();                  /* one copy per source page */
  for (const a of Object.values(art)) {
    const e = a.entry;
    const html = await readText(e.src);
    const text = processDoc(a, e.src, '', true, html);
    outputs.push({ rel: e.out, text, entry: e.id });
    a.file_path = e.out;
    a.title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? e.title ?? e.id).trim());
    for (const pg of a.pages) {
      if (!pageOutputs.has(pg)) pageOutputs.set(pg, processDoc(a, pg, pg, false, await readText(pg)));
      a.files[pg] = 'pages/' + pg;
    }
  }
  for (const [pg, text] of pageOutputs) outputs.push({ rel: 'pages/' + pg, text });
  for (const f of assetFiles) outputs.push({ rel: f, src: f });
  for (const f of shippedExtra.keys()) outputs.push({ rel: 'files/' + f, src: f });
  for (const a of Object.values(art)) if (a.unresolved.length) {
    const msg = 'artifact "' + a.entry.id + '" links into "' + siteOf(a.entry).id + '" (' + [...new Set(a.unresolved)].join(', ') +
      ') with no --url ' + siteOf(a.entry).id + '=<artifact url>; pointed at the emulator route for now';
    if (opts.strict) fail('link', msg); else warn(msg);
  }

  /* ── gate: vars ──────────────────────────────────────────────────────── */
  {
    const decl = new Set(man.vars?.ignore ?? []), prefixes = new Set(), reads = [];
    const NAME = /--[A-Za-z0-9_-]+/g;
    for (const c of corpus) {
      const lineOfC = off => c.base + lineAt(c.text, off);
      if (c.kind === 'css') {
        for (const m of c.text.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) decl.add(m[1]);
        for (const m of c.text.matchAll(/@property\s+(--[A-Za-z0-9_-]+)/g)) decl.add(m[1]);
        for (const m of c.text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)) reads.push({ name: m[1], where: c.file + ':' + lineOfC(m.index) });
      } else if (c.kind === 'attr') {
        for (const m of c.text.matchAll(NAME)) decl.add(m[0]);
      } else {
        const segs = lexJS(c.text);
        for (let si = 0; si < segs.length; si++) {
          const sg = segs[si];
          if (sg.kind !== 'str' && sg.kind !== 'tmpl') continue;
          const txt = c.text.slice(sg.a, sg.b);
          for (const m of txt.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)) reads.push({ name: m[1], where: c.file + ':' + lineOfC(sg.a + m.index) });
          for (const m of txt.matchAll(NAME)) if (!/var\(\s*$/.test(txt.slice(0, m.index))) decl.add(m[0]);
          /* '--sp-' + name, `--anim-p${i}`: a family, declared by prefix */
          const tailM = /(--[A-Za-z0-9_-]*)(?:\$\{|['"])$/.exec(txt);
          const next = c.text.slice(sg.b).match(/^\s*(\S)/);
          if (tailM && tailM[1].length > 3 && (txt.endsWith('${') || (next && next[1] === '+'))) prefixes.add(tailM[1]);
        }
      }
    }
    const missing = reads.filter(r => !decl.has(r.name) && ![...prefixes].some(p => r.name.startsWith(p) && r.name !== p));
    const byName = new Map();
    for (const r of missing) { if (!byName.has(r.name)) byName.set(r.name, []); byName.get(r.name).push(r.where); }
    for (const [n, w] of byName) fail('vars', 'var(' + n + ') has no fallback and no declaration anywhere shipped — read at ' + w.slice(0, 4).join(', ') + (w.length > 4 ? ' (+' + (w.length - 4) + ')' : ''));
    notes.push('vars: ' + reads.length + ' fallback-less var() reads against ' + decl.size + ' declared names and ' + prefixes.size + ' JS-built families');
    const ext = path.join(ROOT, 'tools', 'check-vars.mjs');
    if (existsSync(ext) && !opts.noExternalVars) {
      const r = spawnSync(process.execPath, [ext, ROOT], { cwd: ROOT, encoding: 'utf8' });
      if (r.status !== 0) fail('vars', 'tools/check-vars.mjs refused (exit ' + r.status + '): ' + ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-6).join(' | '));
      else notes.push('vars: tools/check-vars.mjs agrees');
    }
  }

  /* ── gate: the self-test count quoted on pages ───────────────────────── */
  {
    const st = man.selftest ?? {};
    const page = st.page ?? 'selftest.html';
    if (!exists(page)) notes.push('count: skipped — ' + page + ' does not exist yet');
    else {
      const n = ((await readText(page)).match(new RegExp(st.count ?? '^\\s*T\\(', 'gm')) || []).length;
      const claimRe = new RegExp(st.claim ?? '(\\d+)\\s+assertions', 'g');
      let checked = 0;
      for (const f of st.claimedIn ?? []) {
        if (!exists(f)) continue;
        for (const m of (await readText(f)).matchAll(claimRe)) {
          checked++;
          if (+m[1] !== n) fail('count', f + ' claims ' + m[1] + ' assertions; ' + page + ' has ' + n + ' — a number typed by hand about a file that changes is wrong the day it changes');
        }
      }
      notes.push('count: ' + page + ' has ' + n + '; ' + checked + ' quote(s) checked');
    }
  }

  /* ── render outputs (escaped), then the output gates ─────────────────── */
  const rendered = [];
  for (const o of outputs) {
    if (o.text != null) { rendered.push({ rel: o.rel, text: o.text, entry: o.entry }); continue; }
    const ext = P.extname(o.src).toLowerCase();
    if (!TEXT_EXT.has(ext)) { rendered.push({ rel: o.rel, src: o.src }); continue; }
    let t = await readText(o.src);
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    if (!hook.noEscape) t = ext === '.css' ? escCSS(t) : ext === '.json' ? escJS(t) : ext === '.html' || ext === '.htm' ? escHTML(t) : escJS(t);
    rendered.push({ rel: o.rel, text: t, src: o.src });
  }
  for (const r of rendered) {
    if (r.text == null) continue;
    const bad = /[^\x00-\x7f]/.exec(r.text);
    if (bad) fail('ascii', r.rel + ':' + lineAt(r.text, bad.index) + ' still holds non-ASCII (U+' + hex(bad[0].codePointAt(0), 4).toUpperCase() + '); it will mojibake on a host that drops the charset');
    if (/\.m?js$/.test(r.rel)) {
      try { new vm.Script(r.text, { filename: r.rel }); }
      catch (e) { fail('syntax', r.rel + ' does not parse: ' + e.message); }
    }
    if (r.rel.endsWith('.json')) { try { JSON.parse(r.text); } catch (e) { fail('syntax', r.rel + ' is not JSON: ' + e.message); } }
    if (r.entry) {
      const tk = tokenizeHTML(r.text);
      const leak = tk.find(t => t.t === 'doctype' || ((t.t === 'start' || t.t === 'end') && /^(html|head|body)$/.test(t.name)));
      if (leak) fail('entry', r.rel + ' leaked the document skeleton (' + leak.raw.slice(0, 40) + '); the host supplies it');
      const first = tk.find(t => !(t.t === 'text' && !t.raw.trim()));
      if (!first || first.t !== 'start' || first.name !== 'title') fail('entry', r.rel + ' does not open with <title>; the host names the artifact from the first 8KB');
      else if (r.text.indexOf('</title>') > 8192) fail('entry', r.rel + ': </title> lies beyond the first 8KB');
    }
  }
  for (const s of inlineScripts) {
    if (/json|importmap|speculationrules/i.test(s.type)) { try { JSON.parse(s.code); } catch (e) { fail('syntax', s.where + ' <script type="' + s.type + '"> is not JSON: ' + e.message); } continue; }
    if (/module/i.test(s.type)) continue;           /* vm.Script cannot parse import/export; the browser will */
    try { new vm.Script(hook.noEscape ? s.code : escJS(s.code), { filename: s.where }); }
    catch (e) { fail('syntax', s.where + ' inline script does not parse: ' + e.message); }
  }

  const map = {
    generator: GENERATOR, built: new Date().toISOString(),
    root: P.normalize(path.relative(ROOT, OUT).split(path.sep).join('/')) || '.',
    artifacts: Object.fromEntries(Object.values(art).map(a => [a.entry.id, {
      route: a.entry.route, title: a.title, src: a.entry.src, file_path: a.file_path, scope: a.entry.scope || 'site',
      url: urls[a.entry.id] ?? null, files: Object.fromEntries(Object.entries(a.files).sort(([x], [y]) => x.localeCompare(y))),
      unresolved: [...new Set(a.unresolved)],
    }])),
    missing_entries: entries.filter(e => !e.present).map(e => ({ id: e.id, src: e.src, route: e.route })),
    skipped, warnings,
  };
  const result = { ok: failures.length === 0, failures, warnings, notes, map, out: OUT, rendered, root: ROOT };
  if (!result.ok || opts.dryRun) return result;

  /* ── write: into a sibling temp dir, then swap. A refused build never
     half-writes the tree the emulator serves; and a directory this tool did
     not write is never replaced. ─────────────────────────────────────────── */
  if (existsSync(OUT)) {
    let ours = false;
    try { ours = JSON.parse(await readFile(path.join(OUT, 'publish-map.json'), 'utf8')).generator === GENERATOR; } catch {}
    if (!ours && (await readdir(OUT)).length) {
      failures.push({ gate: 'out', msg: OUT + ' exists and was not written by ' + GENERATOR + ' (no publish-map.json of ours); refusing to replace it — pass --out' });
      result.ok = false; return result;
    }
  }
  const tmp = OUT + '.building-' + process.pid;
  await rm(tmp, { recursive: true, force: true });
  for (const r of rendered) {
    if (hook.skipWrite && r.rel.startsWith('pages/')) continue;
    const dest = path.join(tmp, ...r.rel.split('/'));
    await mkdir(path.dirname(dest), { recursive: true });
    if (r.text != null) await writeFile(dest, r.text, 'utf8');
    else await cp(path.join(ROOT, ...r.src.split('/')), dest);
  }
  await writeFile(path.join(tmp, 'publish-map.json'), JSON.stringify(map, null, 2) + '\n', 'utf8');
  /* Read back what landed before it replaces anything: every file the map
     publishes, and every entry, must exist in the new tree. */
  const landed = [];
  for (const [id, a] of Object.entries(map.artifacts)) {
    for (const src of [a.file_path, ...Object.values(a.files)]) if (!existsSync(path.join(tmp, ...src.split('/')))) landed.push(id + ': ' + src);
  }
  if (landed.length) {
    await rm(tmp, { recursive: true, force: true });
    failures.push({ gate: 'out', msg: 'the map publishes files that did not land in the build: ' + landed.slice(0, 5).join(', ') });
    result.ok = false; return result;
  }
  const old = OUT + '.old-' + process.pid;
  const retry = async fn => { for (let k = 0; ; k++) { try { return await fn(); } catch (e) { if (k > 8 || !/EBUSY|EPERM|EACCES/.test(e.code)) throw e; await new Promise(r => setTimeout(r, 150)); } } };
  if (existsSync(OUT)) await retry(() => rename(OUT, old));
  await retry(() => rename(tmp, OUT));
  await rm(old, { recursive: true, force: true });
  return result;
}

/* ─────────────────────────────────────────────────────────────────────────
   4. CLI
   ───────────────────────────────────────────────────────────────────────── */
function report(r, { quiet } = {}) {
  const log = (...x) => { if (!quiet) console.log(...x); };
  for (const w of r.warnings) log('  warn  ' + w);
  for (const n of r.notes) log('  note  ' + n);
  if (!r.ok) {
    console.log('\nREFUSED — ' + r.failures.length + ' problem(s); ' + r.out + ' left as it was:');
    for (const f of r.failures) console.log('  [' + f.gate + '] ' + f.msg);
    return;
  }
  const arts = Object.entries(r.map.artifacts);
  log('\nbuilt ' + r.out);
  if (!arts.length) log('  no entry page exists yet: dist/ holds the assets only (' + r.rendered.filter(x => x.rel.startsWith('assets/')).length + ' files)');
  for (const [id, a] of arts) {
    const size = (r.rendered.find(x => x.rel === a.file_path)?.text.length / 1024).toFixed(1);
    log('  ' + id.padEnd(9) + a.route.padEnd(5) + a.file_path.padEnd(26) + String(size).padStart(7) + ' KB  ' +
      Object.keys(a.files).length + ' supporting files  "' + a.title + '"' + (a.unresolved.length ? '  [' + a.unresolved.length + ' unresolved]' : ''));
  }
  log('  publish: file_path=' + r.map.root + '/<file_path>, root=' + r.map.root + ', files=artifacts.<id>.files from ' + r.map.root + '/publish-map.json (the WHOLE map, every time)');
}

/* ─────────────────────────────────────────────────────────────────────────
   5. SELF TEST — see every gate go red
   A fixture tree full of the known traps is built once clean (it must pass,
   and its output is checked), then once per MUTANT, each of which breaks one
   thing and must be refused by the gate that owns it. Hooks that switch a
   transform off prove the output checks can fail too.
   ───────────────────────────────────────────────────────────────────────── */
const FX = {
  'assets/fx.css': '/* fixture sheet: é in a comment */\n@font-face{font-family:Fx;src:url(./fx.woff2) format("woff2")}\n' +
    ':root{--fx-ink:#123;--fx-gap:4px}\n.fx{color:var(--fx-ink);margin:var(--fx-gap);content:"→"}\n.fx-live{width:var(--fx-live)}\n',
  'assets/fx.woff2': 'not-a-real-font',
  'assets/fx.js': '/* fixture script — comment */\nwindow.FX={label:"Déjà →",set:function(el,v){el.style.setProperty("--fx-live",v+"px");' +
    'el.style.setProperty("--fx-sp-"+"a",1)},re:/[→—]/};\n',
  'index.html': '<!doctype html>\n<html lang="en" class="fx-root" data-x="1">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width">\n<title>Fixture · hub</title>\n<link rel="icon" href="assets/fx.woff2">\n' +
    '<link rel="stylesheet" href="assets/fx.css">\n<style>.hub{color:var(--fx-ink);background:url(assets/fx.woff2)}</style>\n' +
    '<script>window.HEAD_RAN=1</script>\n</head>\n<body class="fx-body" data-page="hub">\n' +
    '<p id="t">Déjà vu → ✓ 😀 and $\' $& $1 $$ $` stay literal</p>\n' +
    '<a href="index.html">self</a> <a href="docs.html#top">docs</a> <a href="sub/deep.html">deep</a> <a href="https://example.com/">out</a>\n' +
    '<img src="assets/fx.woff2" alt="é">\n' +
    '<script src="assets/fx.js"></script>\n<script>var s="Déjà → 😀", re=/→/;\u00a0window.FXS=s;var p="docs.html";</script>\n' +
    '</body>\n</html>\n',
  'docs.html': '<!doctype html><html><head><title>Docs</title><link rel="stylesheet" href="assets/fx.css"></head>' +
    '<body><a href="index.html">hub</a> <a href="sub/deep.html">deep</a> <p class="fx">café</p>' +
    '<div data-device="browser" data-url="fluid.example/hello.html"></div></body></html>\n',
  'sub/deep.html': '<!doctype html><html data-tone="dark"><head><title>Deep</title><link rel="stylesheet" href="../assets/fx.css"></head>' +
    '<body><a href="../index.html">hub</a> <a href="../docs.html">docs</a> <img src="../media/pic.png" alt="">' +
    '<script>var base="../assets/";</script></body></html>\n',
  'media/pic.png': 'png',
  'phone.html': '<!doctype html><html><head><title>Phone</title><link rel="stylesheet" href="assets/fx.css"></head>' +
    '<body data-tone="dark"><a href="docs.html">docs</a> <a href="index.html">hub</a></body></html>\n',
  'selftest.html': '<script>\nT(1)\nT(2)\n  T(3)\n</script>\n',
  'README.md': 'The suite has 3 assertions.\n',
  'tools/pages.json': JSON.stringify({
    assets: 'assets',
    entries: [
      { id: 'desktop', src: 'index.html', out: 'artifact-desktop.html', route: '/a/', scope: 'site' },
      { id: 'mobile', src: 'phone.html', out: 'artifact-mobile.html', route: '/m/', scope: 'single', site: 'desktop' },
      { id: 'deep', src: 'sub/deep.html', out: 'artifact-deep.html', route: '/d/', scope: 'single', site: 'desktop' },
    ],
    pages: ['index.html', 'docs.html', 'sub/deep.html', 'phone.html', 'ghost.html'],
    selftest: { page: 'selftest.html', count: '^\\s*T\\(', claim: '(\\d+)\\s+assertions', claimedIn: ['README.md', 'index.html'] },
  }, null, 2),
};
async function fixture(mutate) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fg3-build-selftest-'));
  const files = { ...FX };
  if (mutate) mutate(files);
  for (const [rel, text] of Object.entries(files)) {
    if (text == null) continue;
    const f = path.join(dir, ...rel.split('/'));
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, text, 'utf8');
  }
  return dir;
}
const edit = (rel, fn) => files => { files[rel] = fn(files[rel]); };

/* The bootstrap's tone logic, run against a stub DOM. */
function runBootstrap(script, { theme = null, author = null, stored = null, dark = false } = {}) {
  const attrs = new Map(), bodyAttrs = new Map();
  if (theme) attrs.set('data-theme', theme);
  let observer = null;
  const el = m => ({ setAttribute: (k, v) => m.set(k, String(v)), getAttribute: k => m.has(k) ? m.get(k) : null,
    hasAttribute: k => m.has(k), get className() { return m.get('class') || ''; }, set className(v) { m.set('class', v); } });
  const ctx = {
    document: { documentElement: el(attrs), body: el(bodyAttrs) },
    localStorage: { getItem: () => stored }, matchMedia: () => ({ matches: dark, addEventListener() {} }),
    MutationObserver: function (fn) { observer = fn; this.observe = () => {}; }, window: {},
  };
  ctx.window = ctx;
  const code = /<script>([\s\S]*?)<\/script>/.exec(script)[1];
  vm.runInNewContext(code, ctx);
  return { attrs, bodyAttrs, flip: t => { attrs.set('data-theme', t); observer && observer(); return attrs.get('data-tone'); } };
}

async function selftest() {
  let pass = 0, failN = 0;
  const T = (ok, msg) => { ok ? pass++ : failN++; console.log((ok ? '  ok    ' : '  FAIL  ') + msg); };
  const run = async (mutate, hook, extra = {}) => {
    const dir = await fixture(mutate);
    const r = await build({ root: dir, out: path.join(dir, 'dist'), __hook: hook, urls: extra.urls ?? { desktop: 'https://claude.ai/code/artifact/fixture-hub' }, strict: extra.strict, noExternalVars: true });
    return { r, dir };
  };
  const cleanup = [];
  const decode = s => s.replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)));

  console.log('clean build of the fixture (must pass, and produce the right output):');
  const { r, dir } = await run();
  cleanup.push(dir);
  T(r.ok, 'clean fixture builds' + (r.ok ? '' : ': ' + r.failures.map(f => '[' + f.gate + '] ' + f.msg).join(' | ')));
  const get = rel => r.rendered.find(x => x.rel === rel)?.text ?? '';
  const entry = get('artifact-desktop.html');
  T(r.rendered.every(x => x.text == null || !/[^\x00-\x7f]/.test(x.text)), 'every shipped text file is pure ASCII');
  T(/^<title>Fixture &#xb7; hub<\/title>/.test(entry), 'the entry opens with its <title>, escaped');
  T(!/<(html|head|body)[\s>]|<!doctype/i.test(entry.replace(/<script>[\s\S]*?<\/script>/g, '')), 'no document skeleton leaks into the entry');
  T(entry.includes("$' $& $1 $$ $` stay literal"), 'replacement patterns in page text survive byte for byte ($\' $& $1 $$ $`)');
  T(decode(/<p id="t">(.*?)<\/p>/.exec(entry)?.[1] ?? '').startsWith('Déjà vu → ✓ 😀'), 'non-ASCII text round-trips through &#x; (including an astral char)');
  {
    const code = /<script>(var s=[\s\S]*?)<\/script>/.exec(entry)?.[1] ?? '';
    const box = {}; box.window = box;
    let val = null; try { vm.runInNewContext(code, box); val = box.FXS; } catch (e) { val = 'threw ' + e.message; }
    T(val === 'Déjà → 😀', 'an inline script\'s escaped string evaluates to the original (NBSP in code became a space)');
  }
  const js = get('assets/fx.js');
  { const box = {}; box.window = box; let lab = null; try { vm.runInNewContext(js, box); lab = box.FX.label + '|' + box.FX.re.test('—'); } catch (e) { lab = e.message; }
    T(lab === 'Déjà →|true', 'an escaped JS asset keeps its strings and regex classes'); }
  T(get('assets/fx.css').includes('content:"\\002192"'), 'an escaped CSS asset uses six-digit escapes');
  T(/B=\{"class":"fx-body","data-page":"hub"\}/.test(entry) && /H=\{"lang":"en","class":"fx-root","data-x":"1"\}/.test(entry), 'the source <html>/<body> attributes are carried into the bootstrap');
  T(entry.includes('<link rel="stylesheet" href="assets/fx.css">') && !entry.includes('rel="icon"') && entry.includes('window.HEAD_RAN=1'), 'head stylesheets and scripts are lifted (still linked), host-owned links dropped');
  T(entry.includes('<a href="./">self</a>'), 'the entry links to itself as ./');
  T(get('pages/docs.html').includes('<a href="./">hub</a>'), 'a supporting page links to the entry as ./ (index.html is the host\'s)');
  T(get('pages/sub/deep.html').includes('<a href="../">hub</a>'), 'a page in a folder reaches the entry as ../');
  T(get('pages/docs.html').includes('data-url="fluid.example/hello.html"'), 'a browser frame\'s data-url is display text: not a link, shipped as written');
  const deep = get('artifact-deep.html');
  T(deep.includes('href="assets/fx.css"') && deep.includes('src="media/pic.png"') && deep.includes('var base="assets/"'), 'an entry that moved to the root has its ../ references rebased');
  T(deep.includes('href="https://claude.ai/code/artifact/fixture-hub/docs.html"') && deep.includes('href="https://claude.ai/code/artifact/fixture-hub"'), 'a single-page artifact links into the site by its --url');
  T(get('artifact-mobile.html').includes(',T="dark",'), '<body data-tone> moves to <html> as the author tone');
  const m = r.map.artifacts;
  T(m.desktop && m.desktop.files['docs.html'] === 'pages/docs.html' && m.desktop.files['assets/fx.woff2'] === 'assets/fx.woff2' &&
    m.desktop.files['sub/deep.html'] === 'pages/sub/deep.html' && !('index.html' in m.desktop.files), 'the publish map lists pages and assets at their published paths, never index.html');
  T(m.deep && m.deep.files['media/pic.png'] === 'files/media/pic.png', 'a referenced file outside assets/ ships under files/');
  T(r.warnings.some(w => /skipped ghost\.html/.test(w)) && r.ok, 'a listed page that does not exist is skipped with a warning, not an error');
  {
    const e = get('artifact-desktop.html');
    const a = runBootstrap(e, { theme: 'dark' }), b = runBootstrap(get('artifact-deep.html'), { theme: 'light' });
    const c = runBootstrap(e, { stored: 'light', theme: 'dark' }), d = runBootstrap(e, { dark: true });
    T(a.attrs.get('data-tone') === 'dark' && a.attrs.has('data-tone-auto') && a.flip('light') === 'light', 'bootstrap: no author tone follows the host data-theme and mirrors a flip');
    T(b.attrs.get('data-tone') === 'dark' && !b.attrs.has('data-tone-auto') && b.flip('light') === 'dark', 'bootstrap: an author data-tone beats the host (FG3 precedence)');
    T(c.attrs.get('data-tone') === 'light' && d.attrs.get('data-tone') === 'dark', 'bootstrap: a stored choice beats the host; no theme falls back to the OS');
    T(a.bodyAttrs.get('class') === 'fx-body' && a.attrs.get('lang') === 'en', 'bootstrap: body class and html lang are restored');
  }
  {
    const out = path.join(dir, 'real-out');
    const w = await build({ root: dir, out, urls: { desktop: 'https://x/y' }, noExternalVars: true });
    T(w.ok && existsSync(path.join(out, 'artifact-desktop.html')) && existsSync(path.join(out, 'files', 'media', 'pic.png')), 'a passing build writes the tree to disk');
    await writeFile(path.join(dir, 'foreign.txt'), 'x');
    const f = await build({ root: dir, out: dir, noExternalVars: true });
    T(!f.ok && f.failures.some(x => x.gate === 'out'), 'it refuses to replace a directory it did not write');
  }

  console.log('\nmutants (each must be REFUSED by the named gate):');
  const MUTANTS = [
    ['comments', /closed early/, edit('assets/fx.css', s => s.replace('/* fixture sheet', () => '/* fixture */ sheet */'))],
    ['comments', /never closes/, edit('index.html', s => s.replace('<style>', () => '<style>/* open '))],
    ['missing', /assets\/nope\.js/, edit('index.html', s => s.replace('assets/fx.js', () => 'assets/nope.js'))],
    ['missing', /gone\.woff2.*relative to ITSELF/, edit('assets/fx.css', s => s.replace('./fx.woff2', () => './gone.woff2'))],
    ['link', /nope\.html.*not in the manifest/, edit('docs.html', s => s.replace('sub/deep.html', () => 'nope.html'))],
    ['link', /ghost\.html.*does not exist yet/, edit('docs.html', s => s.replace('sub/deep.html', () => 'ghost.html'))],
    ['vars', /--fx-undeclared/, edit('index.html', s => s.replace('.hub{', () => '.hub{border-color:var(--fx-undeclared);'))],
    ['vars', /--fx-live/, edit('assets/fx.js', s => s.replace('"--fx-live"', () => '"--fx-other"'))],
    ['count', /claims 4 assertions/, edit('README.md', () => 'The suite has 4 assertions.\n')],
    ['external', /another origin/, edit('index.html', s => s.replace('<script src="assets/fx.js">', () => '<script src="https://cdn.example.com/x.js">'))],
    ['external', /root-absolute/, edit('docs.html', s => s.replace('href="assets/fx.css"', () => 'href="/assets/fx.css"'))],
    ['syntax', /does not parse/, edit('index.html', s => s.replace('window.HEAD_RAN=1', () => 'window.HEAD_RAN=(1'))],
    ['syntax', /does not parse/, edit('assets/fx.js', s => s + '\nfunction(\n')],
  ];
  for (const [gate, re, mutate] of MUTANTS) {
    const { r: mr, dir: md } = await run(mutate);
    cleanup.push(md);
    const hit = mr.failures.find(f => f.gate === gate && re.test(f.msg));
    T(!mr.ok && hit, gate.padEnd(9) + (hit ? hit.msg.slice(0, 110) : 'NOT refused as expected: ' + (mr.ok ? 'build passed' : mr.failures.map(f => '[' + f.gate + '] ' + f.msg.slice(0, 80)).join(' | '))));
  }
  {
    const { r: ur, dir: ud } = await run(null, {}, { urls: {}, strict: true });
    cleanup.push(ud);
    T(!ur.ok && ur.failures.some(f => f.gate === 'link' && /no --url desktop/.test(f.msg)), 'link     --strict refuses a single entry linking into the site with no --url');
  }

  console.log('\ntransform hooks (each switches a transform off; its check must go red):');
  const HOOKS = [
    ['noEscape', o => o.failures.some(f => f.gate === 'ascii'), 'the ascii gate catches unescaped output'],
    ['naiveReplace', o => !(o.rendered.find(x => x.rel === 'artifact-desktop.html')?.text ?? '').includes("$' $& $1 $$ $` stay literal"), 'string-pattern replace corrupts $\' — the literal check sees it'],
    ['dropBodyAttrs', o => !/B=\{"class":"fx-body"/.test(o.rendered.find(x => x.rel === 'artifact-desktop.html')?.text ?? ''), 'dropped <body> attrs — the attribute check sees it'],
    ['noRebase', o => !(o.rendered.find(x => x.rel === 'artifact-deep.html')?.text ?? '').includes('href="assets/fx.css"'), 'no rebasing — the moved entry still says ../assets'],
    ['keepSkeleton', o => o.failures.some(f => f.gate === 'entry'), 'a leaked skeleton is refused by the entry gate'],
    ['skipWrite', o => o.failures.some(f => f.gate === 'out' && /did not land/.test(f.msg)), 'a published file that never landed is refused on read-back'],
  ];
  for (const [h, red, msg] of HOOKS) {
    const { r: hr, dir: hd } = await run(null, { [h]: true });
    cleanup.push(hd);
    T(red(hr), h.padEnd(14) + msg);
  }
  for (const d of cleanup) await rm(d, { recursive: true, force: true });
  console.log('\n' + pass + ' passed, ' + failN + ' failed');
  return failN === 0;
}

/* ── main ──────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf('--' + k); return i < 0 ? undefined : args[i + 1]; };
  if (args.includes('--selftest')) {
    process.exit((await selftest()) ? 0 : 1);
  }
  const urls = {};
  args.forEach((a, i) => { if (a === '--url') { const [k, ...v] = (args[i + 1] || '').split('='); if (k && v.length) urls[k] = v.join('='); } });
  const r = await build({ root: opt('root'), out: opt('out'), manifest: opt('manifest'), urls, strict: args.includes('--strict') });
  report(r);
  process.exit(r.ok ? 0 : 1);
}
