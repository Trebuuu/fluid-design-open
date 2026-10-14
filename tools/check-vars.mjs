/* check-vars.mjs — every var(--x) a stylesheet reads must be declared somewhere.

     node tools/check-vars.mjs            exit 1 on an unexplained miss
     node tools/check-vars.mjs --all      also list the intentional ones in full
     node tools/check-vars.mjs --strict   count only CSS declarations: what a page
                                          sees before any script runs (no JS, pre-boot)

   A custom property read bare — var(--x) with no fallback — that nothing declares
   is invalid at computed-value time: the WHOLE declaration silently drops (a
   `transition` shorthand loses every longhand, an `animation` runs 0 s). No
   browser logs it. This reads every assets/*.css and collects:

     DECLARED  `--x:` in any assets/*.css (rules, @keyframes, the palettes),
               `@property --x`, and every `--x` a script names OUTSIDE var() —
               setProperty('--x'), style strings, template literals (a script
               that names a property is setting it; the same rule test-color uses).
     READ      var(--x) in any assets/*.css, with its fallback (if any).

   A read with a fallback resolves on its own and is skipped — unless the
   fallback is itself a bare var() of an undeclared name (a dead fallback).
   Reads listed in INTENTIONAL are printed with their reason, not failed:
   they are author inputs a page is expected to set, read where an unset value
   is the designed behaviour. Anything else fails.

   Not cascade-aware: "declared somewhere" is the bar, not "declared on an
   ancestor of every reader". That is the class of bug this exists for (a token
   renamed or deleted in one file, still read in another). */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'assets');
const all = process.argv.includes('--all');
const strict = process.argv.includes('--strict');

/* name → why an unset value is correct there. Keep this short; every entry is
   a claim a reviewer should be able to check against the file it names. */
const INTENTIONAL = {
  'm-name': 'fg3-motion.css .m-shared: MOTION.shared(el, name) sets it with the class; unset = no view-transition-name, which is the point',
  'fg3-r': 'fg3.css [data-fg3-corner="square"]:focus-visible: FG3 sets it on exactly the elements that selector matches'
};

const files = readdirSync(DIR);
const css = files.filter(f => f.endsWith('.css')).map(f => ({ f, text: readFileSync(path.join(DIR, f), 'utf8') }));
const js = files.filter(f => f.endsWith('.js')).map(f => ({ f, text: readFileSync(path.join(DIR, f), 'utf8') }));

const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));   /* keep line numbers */
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

const declared = new Map();                        /* name → first place it is declared */
const note = (n, where) => { if (!declared.has(n)) declared.set(n, where); };
const noteJs = strict ? () => {} : note;           /* --strict: a script's write is not there before boot */
for (const { f, text } of css) {
  const t = stripCss(text);
  for (const m of t.matchAll(/(?:^|[;{\s])--([\w-]+)\s*:/g)) note(m[1], f);
  for (const m of t.matchAll(/@property\s+--([\w-]+)/g)) note(m[1], f + ' @property');
}
for (const { f, text } of js) {
  const t = stripJs(text);
  for (const m of t.matchAll(/(var\(\s*)?--([a-zA-Z][\w-]*)/g)) if (!m[1]) noteJs(m[2], f + ' (script)');
}

/* var() reads with their fallback text, balanced parens. */
function reads(text) {
  const out = [];
  let i = 0;
  while ((i = text.indexOf('var(', i)) >= 0) {
    let depth = 0, j = i + 3;
    for (; j < text.length; j++) { if (text[j] === '(') depth++; else if (text[j] === ')' && --depth === 0) break; }
    const inner = text.slice(i + 4, j), comma = inner.indexOf(',');
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const fb = comma < 0 ? null : inner.slice(comma + 1).trim();
    if (name.startsWith('--')) out.push({ name: name.slice(2), fb, at: i });
    i += 4;                                        /* nested var() in the fallback are read too */
  }
  return out;
}
const lineOf = (text, at) => text.slice(0, at).split('\n').length;

const misses = [], intentional = [];
for (const { f, text } of css) {
  const t = stripCss(text);
  for (const r of reads(t)) {
    if (declared.has(r.name)) continue;
    /* A fallback that is not ONLY a var() of an undeclared name resolves. */
    if (r.fb != null) {
      const only = /^var\(\s*--([\w-]+)\s*\)$/.exec(r.fb);
      if (!only || declared.has(only[1])) continue;
    }
    const hit = { file: f, line: lineOf(t, r.at), name: r.name, fb: r.fb };
    (INTENTIONAL[r.name] ? intentional : misses).push(hit);
  }
}

const group = list => {
  const by = new Map();
  for (const h of list) { const k = h.name; if (!by.has(k)) by.set(k, []); by.get(k).push(`${h.file}:${h.line}`); }
  return by;
};
console.log(`check-vars${strict ? ' --strict' : ''}: ${css.length} stylesheets, ${strict ? 'scripts not counted' : js.length + ' scripts'}, ${declared.size} custom properties declared`);
for (const [n, at] of group(intentional)) console.log(`  intentional --${n}  ${INTENTIONAL[n]}${all ? '\n      ' + at.join(' ') : ` (${at.length} read${at.length > 1 ? 's' : ''})`}`);
for (const [n, at] of group(misses)) console.log(`  MISS --${n}  read bare, declared nowhere: ${at.join(' ')}`);
console.log(misses.length ? `\n${misses.length} unexplained read(s) of undeclared custom properties` : '\nno unexplained reads');
process.exit(misses.length ? 1 : 0);
