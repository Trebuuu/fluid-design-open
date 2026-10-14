/* ═══════════════════════════════════════════════════════════════════════════
   fg3.js → FG3 — Fluid Design Open · boot, tone, gate, corners, numbers
   ───────────────────────────────────────────────────────────────────────────
   Plain script, one global, no dependencies. Load order (end of body):
     geom.js spring.js palette.js art3.js lg3-core.js fg3.js symbols.js chart.js
     motion.js anim.js device.js ui.js chrome.js showcase.js   then FG3.boot()

   FG3.boot(opts) → state          idempotent; never throws. In order: tone,
       stage-band tone, capability gate, concentric radii, corner fallback,
       then X.mount(document) for each present module in SPEC order —
       ART3 LG3 SYM CHART MOTION ANIM DEVICE UI CHROME SHOW — and finally
       document 'fg3:ready' (detail = state), html[data-fg3="ready"].
       opts.cornerFallback: 'auto' (default) | 'force' | 'off'
   FG3.setTone('light'|'dark'|'auto')   persisted (localStorage, try/catch)
   FG3.getTone() → {tone, mode, source}  source: user|author|host|system
   FG3.capability(opts) → {enhanced, cause, touch, forced, …}   re-evaluates
       the gate. opts.force: true | false pins it on / off (cause 'override')
       for this page — a playground toggle, an audit frame the host strips
       ?no-fd-enhanced from — and null hands it back to the validators. A
       force call always emits fg3:capability; ANIM follows the html classes.
   FG3.corners({reload}) → Promise<count>    re-run the corner pass (count =
       elements shaped in fallback mode, capsule-snapped in native mode)
   FG3.cornerState() → {mode, rules, shaped:[el], modes:{square,circle,clip},
       snapped:[el], foreign:[el], off:[el]}
   FG3.cornersReady                          Promise, resolved after boot's pass
   FG3.cornerClip(w, h, radii, k) → 'path("…")'   GEOM.clipPath or the local copy
     Marks: [data-fg3-corner="square|circle|clip"] (fallback mode per element,
     see shapeEl; its border-radius is then FG3's — the equal-mass circle is
     in the inline --fg3-r) ·
     [data-fg3-capsule] (a clamped continuous radius snapped to round) ·
     style#fg3-corner-emulation (forced fallback in a native engine)
     Opt-out (author): [data-fg3-corner="off"] — FG3 neither snaps nor
     shapes it; corner-shape written as an expression (calc/min/max/clamp,
     i.e. a morph drives it) is left alone the same way (cornerState().off)
   FG3.concentric(root)                      re-derive [data-concentric] radii
   FG3.refresh(root)                         concentric + corners (new DOM)
   FG3.rollNumber(el, to, {format, animate}) digit-roll on a spring
   FG3.whenSeen(el, fn, deadline=1600) → cancel()
   FG3.reduceMotion                          MediaQueryList
   Events on document: fg3:ready · fg3:tone {tone,mode,source} ·
     fg3:capability {enhanced,cause,touch,forced,…}

   CLASSES ON <html> (the `enhanced` gate):
     fd-js · fd-enhanced | no-fd-enhanced (+ data-fd-cause:
     reduced-motion | viewport | small-desktop | text-zoom | override) ·
     fd-reduced-motion | no-… · fd-touch | no-… (primary pointer coarse, or
     nothing can hover — never maxTouchPoints) · fd-corner-shape | no-…
     (no- = the clip-path fallback is running) · fd-refraction-capable | no-…
     (a HINT — Chromium brand + url() backdrop parses; LG3 has the final say)
     URL overrides: ?fd-enhanced ?no-fd-enhanced
     ?fd-reduced-motion ?no-fd-reduced-motion ?no-fd-corner-shape (forces the
     fallback in Chromium) ?fd-corner-shape

   TONE WITHOUT A FLASH — put this in <head>; boot() takes over from it:
     <script>try{var d=document.documentElement,t=localStorage.getItem('fg3-tone');
     if(!d.hasAttribute('data-tone')){d.setAttribute('data-tone',t||d.getAttribute(
     'data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':
     'light'));d.setAttribute('data-tone-auto','')}}catch(e){}</script>
     html[data-tone-lock] makes the author's data-tone beat a stored choice.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var doc = global.document, html = doc.documentElement;
  var VERSION = '3.0.0';
  var MODULES = ['ART3', 'LG3', 'SYM', 'CHART', 'MOTION', 'ANIM', 'DEVICE', 'UI', 'CHROME', 'SHOW'];

  function mq(q) {
    try { return global.matchMedia(q); }
    catch (e) { return { matches: false, addEventListener: function () {} }; }
  }
  function onChange(m, fn) {
    if (m.addEventListener) m.addEventListener('change', fn);
    else if (m.addListener) m.addListener(fn);
  }
  var RM = mq('(prefers-reduced-motion: reduce)');
  function emit(name, detail) {
    try { doc.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {}
  }
  var query = (function () {
    try { return new URLSearchParams(global.location.search); }
    catch (e) { return { has: function () { return false; } }; }
  })();
  function flag(name, on) {
    html.classList.toggle(name, !!on);
    html.classList.toggle('no-' + name, !on);
  }
  function debounce(fn, ms) {
    var t = 0;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
  function reduced() { return RM.matches || html.classList.contains('fd-reduced-motion'); }

  /* ─────────────────────────────────────────────────────────────────────────
     1. TONE
     Precedence: a choice the reader made (setTone) › the author's data-tone
     in markup › a host's html[data-theme] (the Artifact host toggles it) ›
     prefers-color-scheme. The author's attribute is read ONCE, before this
     file ever writes one, so our own write is never mistaken for intent.
     ───────────────────────────────────────────────────────────────────────── */
  var KEY = 'fg3-tone';
  var darkMQ = mq('(prefers-color-scheme: dark)');
  var authorTone = null, sessionTone = null, tone = { tone: 'light', mode: 'auto', source: '' };
  var toneWired = false;

  function stored() {
    try { var v = global.localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; }
    catch (e) { return null; }
  }
  function store(v) {
    try { if (v) global.localStorage.setItem(KEY, v); else global.localStorage.removeItem(KEY); }
    catch (e) { /* private window, blocked storage: the choice lasts this page */ }
  }
  function resolveTone() {
    if (sessionTone) return { tone: sessionTone, mode: sessionTone, source: 'user' };
    var s = html.hasAttribute('data-tone-lock') ? null : stored();
    if (s) return { tone: s, mode: s, source: 'user' };
    if (authorTone) return { tone: authorTone, mode: 'auto', source: 'author' };
    var host = html.getAttribute('data-theme');
    if (host === 'light' || host === 'dark') return { tone: host, mode: 'auto', source: 'host' };
    return { tone: darkMQ.matches ? 'dark' : 'light', mode: 'auto', source: 'system' };
  }
  function applyTone(quiet) {
    var r = resolveTone(), was = html.getAttribute('data-tone');
    tone = r;
    if (was !== r.tone) html.setAttribute('data-tone', r.tone);
    if (r.source !== 'author') html.setAttribute('data-tone-auto', '');
    if (was !== r.tone && quiet !== true) emit('fg3:tone', r);
    return r;
  }
  function initTone() {
    if (authorTone === null) {
      var t = html.getAttribute('data-tone');
      authorTone = (t === 'light' || t === 'dark') && !html.hasAttribute('data-tone-auto') ? t : '';
    }
    applyTone();
    if (toneWired) return tone;
    toneWired = true;
    onChange(darkMQ, function () { applyTone(); });
    if (global.MutationObserver) {
      new MutationObserver(function () { applyTone(); })
        .observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    }
    return tone;
  }
  function setTone(mode) {
    if (mode === 'light' || mode === 'dark') { sessionTone = mode; store(mode); }
    else { sessionTone = null; store(null); }
    if (authorTone === null) initTone();
    var r = applyTone(true);                 /* one event, even when mode alone changed */
    emit('fg3:tone', r);
    return getTone();
  }
  function getTone() { return { tone: tone.tone, mode: tone.mode, source: tone.source }; }

  /* A stage band is dark by definition; the colour roles are keyed on
     [data-tone], so give it one when the author left it off. */
  function stageBands(root) {
    (root || doc).querySelectorAll('.band[data-band="stage"]:not([data-tone])')
      .forEach(function (b) { b.setAttribute('data-tone', 'dark'); });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     2. THE CAPABILITY GATE — enhanced / no-enhanced, measured. Any validator true ⇒ the base experience: reduced
     motion; InvalidViewport (five exact queries); SmallDesktop (no
     touch and ≤734); TextZoom (1rem above 17px — the reader enlarged text).
     Low-power mode (an autoplay probe) is not implemented.
     ───────────────────────────────────────────────────────────────────────── */
  var VIEWPORT = [
    '(min-width:481px) and (max-width:734px)',                   /* smallWide   */
    '(max-width:734px) and (max-height:500px)',                  /* smallShort  */
    '(max-width:734px) and (min-height:927px)',                  /* smallTall   */
    '(min-width:735px) and (max-width:1068px) and (max-height:520px)', /* medShort */
    '(min-width:1069px) and (max-height:620px)'                  /* largeShort  */
  ].map(mq);
  var SMALL = mq('(max-width:734px)');
  var COARSE = mq('(pointer:coarse)');
  var NOHOVER = mq('(any-hover:none)');
  var CORNER_NATIVE = (function () {
    try { return CSS.supports('corner-shape', 'superellipse(2)'); } catch (e) { return false; }
  })();
  var gateState = null, gateWired = false, gateForce = null;

  /* Touch = the PRIMARY pointer is coarse, or nothing on the device can
     hover. Not maxTouchPoints / ontouchstart: a Windows laptop with a touch
     screen reports 10 touch points while its primary pointer is a mouse, and
     every desktop capture read as fd-touch (never small-desktop). */
  function touch() { return COARSE.matches || NOHOVER.matches; }
  function rootPx() { return parseFloat(getComputedStyle(html).fontSize) || 17; }
  function refractionHint() {
    try {
      var ua = global.navigator && navigator.userAgentData;
      var chromium = !!(ua && ua.brands && ua.brands.some(function (b) { return b.brand === 'Chromium'; }));
      return chromium && CSS.supports('backdrop-filter', 'url(#x)');
    } catch (e) { return false; }
  }
  /* opts.force: true | false pins the gate (cause 'override' when off) until
     a later call passes null. Only an object that OWNS `force` counts — the
     media listeners call this with their change event. */
  function capability(opts) {
    var explicit = !!opts && typeof opts === 'object' && Object.prototype.hasOwnProperty.call(opts, 'force');
    if (explicit) gateForce = opts.force === true || opts.force === false ? opts.force : null;
    var rm = query.has('fd-reduced-motion') ? true : query.has('no-fd-reduced-motion') ? false : RM.matches;
    var t = touch(), cause = '';
    if (rm) cause = 'reduced-motion';
    else if (VIEWPORT.some(function (m) { return m.matches; })) cause = 'viewport';
    else if (!t && SMALL.matches) cause = 'small-desktop';
    else if (rootPx() > 17.5) cause = 'text-zoom';
    var enhanced = !cause;
    if (gateForce !== null) { enhanced = gateForce; cause = gateForce ? '' : 'override'; }
    else if (query.has('fd-enhanced')) { enhanced = true; cause = ''; }
    else if (query.has('no-fd-enhanced')) { enhanced = false; cause = 'override'; }

    flag('fd-reduced-motion', rm);
    flag('fd-touch', t);
    flag('fd-enhanced', enhanced);
    if (cause) html.setAttribute('data-fd-cause', cause); else html.removeAttribute('data-fd-cause');
    flag('fd-corner-shape', cornerMode() === 'native');
    flag('fd-refraction-capable', refractionHint());

    var next = { enhanced: enhanced, cause: cause, reducedMotion: rm, touch: t,
                 cornerShape: CORNER_NATIVE, rootPx: rootPx(), forced: gateForce };
    var changed = !gateState || gateState.enhanced !== next.enhanced || gateState.cause !== next.cause;
    gateState = next;
    if (changed || explicit) emit('fg3:capability', next);
    return next;
  }
  function wireGate() {
    if (gateWired) return;
    gateWired = true;
    [RM, SMALL, COARSE, NOHOVER].concat(VIEWPORT).forEach(function (m) { onChange(m, capability); });
    /* Text zoom fires no event. A 10rem probe does resize when the root
       font-size changes, and a ResizeObserver hears it. */
    if (global.ResizeObserver && doc.body) {
      var probe = doc.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;top:0;left:-9999px;width:10rem;height:0;' +
        'overflow:hidden;visibility:hidden;pointer-events:none';
      doc.body.appendChild(probe);
      new ResizeObserver(debounce(capability, 60)).observe(probe);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     3. CORNERS — the fallback where corner-shape does not exist
     A fixed list of selectors would cover only a handful of elements, while the
     stylesheets declare corner-shape on dozens of components.
     Here the source of truth is EVERY rule in the document that declares
     corner-shape. The catch: an engine without the property DROPS it at
     parse time, so the CSSOM of Safari/Firefox never shows it. The text of
     each stylesheet does: <style> by textContent, a same-origin <link> by
     fetch (already in the HTTP cache; no new origin). Only where the text is
     unreadable do we walk cssRules (useful only where the property parses).
     Then: querySelectorAll per selector, the cascade approximated (important
     › inline › specificity › order), var() resolved on the element, and the
     silhouette drawn per element (shapeEl: exact clip, or the equal-mass
     circle where a clip would cut a painted edge). The same rule pass runs
     in native engines too, for the capsule snap only (from the CSSOM, no
     fetch). Concentric children inherit their container's shape.
     Skipped: k = 1 (border-radius already draws it), capsules (a capsule is
     a semicircle, never a squircle), pseudo-elements, :hover-style states,
     'inherit', per-corner longhands, @import-ed sheets, any element
     whose clip-path someone else owns, glass hosts ([data-lg3], .lg3:
     LG3 owns their silhouette — the fallback neither clips nor re-radiuses),
     and handsOff() elements (data-fg3-corner="off", or an expression k).
     ───────────────────────────────────────────────────────────────────────── */
  var KW = { notch: -Infinity, scoop: -1, bevel: 0, round: 1, squircle: 2, square: Infinity };
  var GLASS = '[data-lg3],.lg3';                  /* the fallback never shapes these (shapeEl) */
  var corner = { mode: '', rules: [], shaped: [], snapped: [], foreign: [], off: [], ro: null, mo: null, wired: false };
  var cornerOpt = 'auto';

  function cornerMode() {
    if (query.has('no-fd-corner-shape') || cornerOpt === 'force' || cornerOpt === true) return 'fallback';
    if (query.has('fd-corner-shape') || cornerOpt === 'off') return 'native';
    return CORNER_NATIVE ? 'native' : 'fallback';
  }
  function toK(v) {
    var G = global.GEOM;
    if (G && G.resolveK && !/^(inherit|initial|unset|revert)/.test(v)) return G.resolveK(v.split(/\s+(?![^(]*\))/)[0]);
    v = String(v).trim().split(/\s+(?![^(]*\))/)[0];         /* first corner of a list */
    if (v in KW) return KW[v];
    var m = /^superellipse\(\s*(-?[\d.]+|-?infinity)\s*\)$/i.exec(v);
    if (m) return /infinity/i.test(m[1]) ? (m[1][0] === '-' ? -Infinity : Infinity) : parseFloat(m[1]);
    return 1;                                                  /* inherit/initial/unknown: leave it round */
  }

  /* — the superellipse outline, used only when GEOM is absent. Same
       maths as geom.js: |x/r|^n + |y/r|^n = 1 with n = 2^k, samples
       pushed toward both ends as n grows so big corners are not faceted. */
  function outline(w, h, radii, k, steps) {
    var n = k === Infinity ? 1e6 : k === -Infinity ? 1e-6 : Math.pow(2, k);
    var r = { tl: radii.tl, tr: radii.tr, br: radii.br, bl: radii.bl };
    var f = Math.min(1, w / Math.max(1e-6, r.tl + r.tr), w / Math.max(1e-6, r.bl + r.br),
                        h / Math.max(1e-6, r.tl + r.bl), h / Math.max(1e-6, r.tr + r.br));
    ['tl', 'tr', 'br', 'bl'].forEach(function (c) { r[c] *= f; });
    steps = steps || 24;
    var wgt = Math.max(0, Math.min(0.85, (n - 2) / 6)), d = [];
    function corner(cx, cy, rr, sx, sy, rev) {
      var pts = [], i;
      for (i = 0; i <= steps; i++) {
        var t = i / steps, g = (1 - wgt) * t + wgt * 0.5 * (1 - Math.cos(Math.PI * t)), th = g * Math.PI / 2;
        pts.push([Math.pow(Math.abs(Math.cos(th)), 2 / n) * rr, Math.pow(Math.abs(Math.sin(th)), 2 / n) * rr]);
      }
      if (rev) pts.reverse();
      pts.forEach(function (p) { d.push((cx + sx * p[0]).toFixed(2) + ',' + (cy + sy * p[1]).toFixed(2)); });
    }
    corner(r.tl, r.tl, r.tl, -1, -1, false);
    corner(w - r.tr, r.tr, r.tr, 1, -1, true);
    corner(w - r.br, h - r.br, r.br, 1, 1, false);
    corner(r.bl, h - r.bl, r.bl, -1, 1, true);
    return 'M' + d.join('L') + 'Z';
  }
  function outlineD(w, h, radii, k) {
    var G = global.GEOM;
    return G && typeof G.outline === 'function' ? G.outline(w, h, radii, k) : outline(w, h, radii, k);
  }
  function clipFor(w, h, radii, k) { return 'path("' + outlineD(w, h, radii, k) + '")'; }

  /* — a tolerant CSS text scanner: strings, parens, nesting, @media,
       @supports, @layer/@container/@scope. Enough for real stylesheets;
       not a validator. */
  function matchClose(s, i, open, close) {
    var depth = 0, q = '';
    for (var j = i; j < s.length; j++) {
      var c = s[j];
      if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === open) depth++;
      else if (c === close && --depth === 0) return j;
    }
    return s.length;
  }
  function splitTop(s, sep) {
    var out = [], depth = 0, q = '', cur = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { cur += c; if (c === '\\') { cur += s[++i] || ''; } else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }
  function nestSel(parent, child) {
    return splitTop(child, ',').map(function (c) {
      c = c.trim();
      return c.indexOf('&') >= 0 ? c.replace(/&/g, ':is(' + parent + ')') : ':is(' + parent + ') ' + c;
    }).join(', ');
  }
  function scan(s, ctx, out, parentSel) {
    var buf = '', q = '', paren = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { buf += c; if (c === '\\') buf += s[++i] || ''; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") { q = c; buf += c; continue; }
      if (c === '(') paren++; else if (c === ')') paren--;
      if (c === '{' && paren <= 0) {
        var end = matchClose(s, i, '{', '}');
        block(buf.trim(), s.slice(i + 1, end), ctx, out, parentSel);
        buf = ''; i = end; continue;
      }
      if (c === ';' && paren <= 0) { if (parentSel) decl(buf, ctx, out, parentSel); buf = ''; continue; }
      buf += c;
    }
    if (parentSel && buf.trim()) decl(buf, ctx, out, parentSel);
  }
  function block(prelude, body, ctx, out, parentSel) {
    if (prelude.charAt(0) === '@') {
      var m = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude) || [];
      var name = (m[1] || '').toLowerCase(), cond = (m[2] || '').trim();
      if (name === 'media') scan(body, { media: ctx.media.concat(cond), supports: ctx.supports }, out, parentSel);
      else if (name === 'supports') scan(body, { media: ctx.media, supports: ctx.supports.concat(cond) }, out, parentSel);
      else if (/^(layer|container|scope|document)$/.test(name)) scan(body, ctx, out, parentSel);
      return;                          /* font-face, keyframes, property, starting-style … */
    }
    scan(body, ctx, out, parentSel ? nestSel(parentSel, prelude) : prelude);
  }
  function decl(text, ctx, out, sel) {
    var k = text.indexOf(':');
    if (k < 0 || text.slice(0, k).trim().toLowerCase() !== 'corner-shape') return;
    var val = text.slice(k + 1).trim(), imp = /!\s*important\s*$/i.test(val);
    if (imp) val = val.replace(/!\s*important\s*$/i, '').trim();
    out.push({ sel: sel, media: ctx.media, supports: ctx.supports, value: val, important: imp });
  }
  function parseText(text) {
    var out = [];
    scan(String(text).replace(/\/\*[\s\S]*?\*\//g, ''), { media: [], supports: [] }, out, '');
    return out;
  }
  /* The CSSOM route, for a sheet whose text we cannot read. Read the selector
     BEFORE descending: a CSSStyleRule has a (usually empty, still truthy)
     cssRules list since CSS nesting. */
  function walkRules(list, media, supports, out) {
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.selectorText && r.style) {
        var v = r.style.getPropertyValue('corner-shape');
        if (v) out.push({ sel: r.selectorText, media: media, supports: supports, value: v,
                          important: r.style.getPropertyPriority('corner-shape') === 'important' });
      }
      if (r.cssRules && r.cssRules.length) {
        var cond = r.conditionText || (r.media && r.media.mediaText) || '';
        var isMedia = global.CSSMediaRule && r instanceof global.CSSMediaRule;
        var isSup = global.CSSSupportsRule && r instanceof global.CSSSupportsRule;
        walkRules(r.cssRules, isMedia ? media.concat(cond) : media, isSup ? supports.concat(cond) : supports, out);
      }
    }
  }
  function sameOrigin(href) {
    try { return new URL(href, global.location.href).origin === global.location.origin; } catch (e) { return false; }
  }
  function ignored(sh) {
    var n = sh.ownerNode;
    return !!(n && n.hasAttribute && n.hasAttribute('data-fg3-ignore'));
  }
  function readSheets() {
    var sheets = Array.prototype.filter.call(doc.styleSheets, function (sh) { return !ignored(sh); });
    return Promise.all(sheets.map(function (sh) {
      var node = sh.ownerNode;
      if (node && node.tagName === 'STYLE') return Promise.resolve({ sh: sh, text: node.textContent });
      if (sh.href && sameOrigin(sh.href) && global.fetch) {
        return global.fetch(sh.href, { cache: 'force-cache', credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.text() : null; })
          .catch(function () { return null; })
          .then(function (t) { return { sh: sh, text: t }; });
      }
      return Promise.resolve({ sh: sh, text: null });
    })).then(function (items) {
      var rules = [];
      items.forEach(function (it) {
        var got = [];
        if (it.text != null) got = parseText(it.text);
        else { try { walkRules(it.sh.cssRules, [], [], got); } catch (e) { /* cross-origin */ } }
        got.forEach(function (r) { rules.push(r); });
      });
      rules.forEach(function (r, i) { r.order = i; r.parts = selectorParts(r.sel); });
      return rules;
    });
  }

  var TRANSIENT = /:(hover|active|focus|focus-visible|focus-within|visited|target)\b/;
  function specificity(sel) {
    var s = sel.replace(/"[^"]*"|'[^']*'/g, '');
    var w;
    while ((w = s.indexOf(':where(')) >= 0) s = s.slice(0, w) + s.slice(matchClose(s, w + 6, '(', ')') + 1);
    var a = (s.match(/#[\w-]+/g) || []).length;
    var attrs = (s.match(/\[[^\]]*\]/g) || []).length;
    s = s.replace(/\[[^\]]*\]/g, '');
    var b = (s.match(/\.[\w-]+/g) || []).length + attrs +
            (s.match(/:(?!:)(?!(?:is|not|has|where)\()[\w-]+/g) || []).length;
    var c = (s.replace(/[.#:][\w-]+|::?[\w-]+/g, '').match(/(^|[\s>+~(,])[a-zA-Z][\w-]*/g) || []).length;
    return a * 1e6 + b * 1e3 + c;
  }
  function selectorParts(sel) {
    return splitTop(sel, ',').map(function (p) { return p.trim(); }).filter(function (p) {
      return p && p.indexOf('::') < 0 && !/:(before|after|first-line|first-letter)\b/.test(p) && !TRANSIENT.test(p);
    }).map(function (p) { return { sel: p, spec: specificity(p) }; });
  }
  function condOK(r) {
    for (var i = 0; i < r.media.length; i++) if (!mq(r.media[i]).matches) return false;
    for (var j = 0; j < r.supports.length; j++) {
      try { if (!CSS.supports(r.supports[j])) return false; } catch (e) { /* unknown grammar: allow */ }
    }
    return true;
  }
  function beats(a, b) {
    if (!b) return true;
    if (a.imp !== b.imp) return a.imp;
    if (a.inline !== b.inline) return a.inline;
    if (a.spec !== b.spec) return a.spec > b.spec;
    return a.order >= b.order;
  }
  function resolveVars(el, v) {
    var cs = null;
    for (var guard = 0; guard < 12; guard++) {
      var i = v.lastIndexOf('var(');
      if (i < 0) break;
      var j = matchClose(v, i + 3, '(', ')'), inner = v.slice(i + 4, j);
      var parts = splitTop(inner, ','), name = parts[0].trim();
      var fb = parts.length > 1 ? inner.slice(inner.indexOf(',') + 1) : '';
      cs = cs || getComputedStyle(el);
      var got = cs.getPropertyValue(name).trim();
      v = v.slice(0, i) + (got || fb.trim()) + v.slice(j + 1);
    }
    return v.trim();
  }
  function radius(v, w, h) {
    v = String(v || '0').trim().split(/\s+/)[0];
    return v.slice(-1) === '%' ? parseFloat(v) / 100 * Math.min(w, h) : parseFloat(v) || 0;
  }
  function nOf(k) { return k === Infinity ? 1e6 : k === -Infinity ? 1e-6 : Math.pow(2, k); }
  /* Painted edges: any box-shadow (outer or inset hairline) or a border. */
  function edged(cs) {
    if (cs.boxShadow && cs.boxShadow !== 'none') return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some(function (s) {
      return parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none';
    });
  }
  /* The radii the author wrote — while the fallback holds a box's radius
     (see shapeEl) the computed value is ours, not theirs. */
  function authoredRadius(el, cs) {
    return el.__fg3R ? el.__fg3R.tl : (cs || getComputedStyle(el)).borderTopLeftRadius;
  }
  function setInlineRadius(el, v) {
    if (el.__fg3Held) el.__fg3PrevBR = v; else el.style.borderRadius = v;
  }
  /* CAPSULE SNAP (native engines). A continuous radius is scaled ×1.53, so
     on a short box it reaches half the height and the UA clamps it into a
     pill — with SQUIRCLE ends, a lozenge. There corner-shape becomes round. The computed radius
     is the specified one, not the clamped one, so the clamp is detectable.
     The fallback needs no snap: it skips capsules and border-radius alone
     draws the semicircle. */
  function clamped(el) {
    var w = el.offsetWidth, h = el.offsetHeight;
    if (w < 2 || h < 2) return false;
    var cs = getComputedStyle(el), half = Math.min(w, h) / 2 - 0.5;
    return ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']
      .every(function (p) { return radius(cs[p], w, h) >= half; });
  }
  function snapEl(el, k) {
    var snap = k !== 1 && clamped(el);
    var want = snap ? 'round' : (el.__fg3ConcShape || (el.__fg3Inline && el.__fg3Inline.value) || '');
    if (el.style.getPropertyValue('corner-shape') !== want) {
      if (want) el.style.setProperty('corner-shape', want); else el.style.removeProperty('corner-shape');
    }
    el.__fg3Snap = snap;
    if (snap) el.setAttribute('data-fg3-capsule', ''); else el.removeAttribute('data-fg3-capsule');
    return snap ? 'snap' : 'skip';
  }
  /* Undo everything the fallback did to one element. */
  function release(el) {
    if (el.__fg3Held) { el.style.borderRadius = el.__fg3PrevBR || ''; el.__fg3Held = false; }
    if (el.__fg3Clip != null) { el.style.clipPath = ''; el.__fg3Clip = null; }
    if (el.__fg3Mode) {
      el.style.removeProperty('--fg3-r');
      if (el.getAttribute('data-fg3-corner') !== 'off') el.removeAttribute('data-fg3-corner');
    }
    el.__fg3R = null; el.__fg3Mode = '';
  }
  /* HANDS OFF — neither the snap nor the fallback touches an element when
     the author says so (data-fg3-corner="off", read on every corner pass:
     call FG3.corners() after setting it at runtime) or when its corner-shape
     is an EXPRESSION (calc/min/max/clamp): a morph is driving it frame by
     frame (.pose-item's chip→card), and an inline round or a held radius
     would fight the spring. */
  function handsOff(el, value) {
    return el.getAttribute('data-fg3-corner') === 'off' || /\b(calc|min|max|clamp)\(/i.test(value);
  }
  /* THE FALLBACK SILHOUETTE — three modes, chosen per element, measured:
     · k > 1, no painted edge → "square": a superellipse with k > 1 is FULLER
       than the circle border-radius paints, and a clip only removes — a
       squircle clip over a circular fill is still a circle (a naive fallback
       draws circles in exactly the engines it is for). So the radius is
       held at 0 and the clip cuts the corners: the exact silhouette.
     · k > 1 WITH a painted edge (shadow, hairline, border) → "circle": a clip
       would cut that edge square at the corners (and a drop-shadow() patch
       cannot work: an element's filter runs BEFORE its own clip-path). So no
       clip; the radius becomes the circle with the same 45° mass,
       R(1 − 2^(−1/n))/(1 − √½) — at the calibrated k that is the nominal
       radius, i.e. exactly the circular corner.
     · k < 1 (bevel, scoop) → "clip": the shape is inside the circle already.
     The authored radii stay readable (__fg3R; --fg3-r = the equal-mass circle
     for CSS, e.g. the focus ring). */
  function shapeEl(el, k) {
    /* Glass is LG3's: a clip-path would cut the host's own shadow, and LG3
       draws its silhouette itself (and animates the radius in a morph, which
       a held radius would fight). Hands off entirely — no clip, no radius. */
    if (el.matches && el.matches(GLASS)) { release(el); return 'skip'; }
    var w = el.offsetWidth, h = el.offsetHeight;          /* untransformed box */
    if (w < 2 || h < 2 || k === 1) { release(el); return 'skip'; }
    if (el.__fg3Held) el.style.borderRadius = el.__fg3PrevBR || '';  /* read the author, not us */
    else el.__fg3PrevBR = el.style.borderRadius;
    el.__fg3Held = false;
    var cs = getComputedStyle(el);
    if (el.__fg3Clip == null && cs.clipPath && cs.clipPath !== 'none') { release(el); return 'foreign'; }
    var raw = { tl: cs.borderTopLeftRadius, tr: cs.borderTopRightRadius, br: cs.borderBottomRightRadius, bl: cs.borderBottomLeftRadius };
    var radii = { tl: radius(raw.tl, w, h), tr: radius(raw.tr, w, h), br: radius(raw.br, w, h), bl: radius(raw.bl, w, h) };
    var half = Math.min(w, h) / 2 - 0.5;
    var max = Math.max(radii.tl, radii.tr, radii.br, radii.bl);
    if (max < 0.5 || (radii.tl >= half && radii.tr >= half && radii.br >= half && radii.bl >= half)) { release(el); return 'skip'; }
    var mode = k < 1 ? 'clip' : edged(cs) ? 'circle' : 'square';
    var mass = (1 - Math.pow(2, -1 / nOf(k))) / (1 - Math.SQRT1_2);
    var circ = [radii.tl, radii.tr, radii.br, radii.bl].map(function (r) { return (Math.round(r * mass * 100) / 100) + 'px'; }).join(' ');
    el.__fg3R = raw;
    el.style.setProperty('--fg3-r', circ);
    if (mode === 'circle') {
      if (el.__fg3Clip != null) { el.style.clipPath = ''; el.__fg3Clip = null; }
      el.style.borderRadius = circ;
      el.__fg3Held = true;
    } else {
      var clip = clipFor(w, h, radii, k);
      if (mode === 'square') { el.style.borderRadius = '0'; el.__fg3Held = true; }
      if (el.__fg3Clip !== clip) el.style.clipPath = clip;
      el.__fg3Clip = clip;
    }
    el.__fg3Mode = mode;
    el.setAttribute('data-fg3-corner', mode);
    return mode;
  }
  function inlineCorner(el) {
    /* Cache it: once we write el.style, an engine that does not know the
       property re-serialises the attribute WITHOUT it. */
    if (el.__fg3Inline === undefined) {
      el.__fg3Inline = null;
      splitTop(el.getAttribute('style') || '', ';').forEach(function (d) {
        var k = d.indexOf(':');
        if (k > 0 && d.slice(0, k).trim().toLowerCase() === 'corner-shape') {
          var v = d.slice(k + 1).trim(), imp = /!\s*important\s*$/i.test(v);
          el.__fg3Inline = { value: v.replace(/!\s*important\s*$/i, '').trim(), imp: imp };
        }
      });
    }
    return el.__fg3Inline;
  }
  function applyCorners() {
    if (!corner.mode) return 0;
    var best = new Map();
    corner.rules.forEach(function (r) {
      if (!condOK(r)) return;
      r.parts.forEach(function (p) {
        var list;
        try { list = doc.querySelectorAll(p.sel); } catch (e) { return; }
        var cand = { imp: r.important, inline: false, spec: p.spec, order: r.order, value: r.value };
        for (var i = 0; i < list.length; i++) if (beats(cand, best.get(list[i]))) best.set(list[i], cand);
      });
    });
    doc.querySelectorAll('[style*="corner-shape"],[data-fg3-inline-corner]').forEach(function (el) {
      if ((el.__fg3Snap || el.__fg3ConcShape) && el.__fg3Inline === undefined) { el.__fg3Inline = null; return; } /* ours */
      el.setAttribute('data-fg3-inline-corner', '');
      var ic = inlineCorner(el);
      if (!ic) return;
      var cand = { imp: ic.imp, inline: true, spec: 0, order: Infinity, value: ic.value };
      if (beats(cand, best.get(el))) best.set(el, cand);
    });
    /* A concentric child inherits its container's corner SHAPE, not just the
       radius: a circular child in a squircle parent is the same mistake as a
       wrong radius, one level down. */
    doc.querySelectorAll('[data-concentric]').forEach(function (inner) {
      if (best.has(inner)) return;
      var outer = inner.parentElement && inner.parentElement.closest(OUTER), oc = outer && best.get(outer);
      if (!oc || handsOff(outer, oc.value)) { inner.__fg3ConcShape = ''; return; }
      var k = toK(resolveVars(outer, oc.value));
      inner.__fg3ConcShape = k === 1 ? '' : 'superellipse(' + k + ')';
      best.set(inner, { imp: false, inline: false, spec: -1, order: -1, value: 'superellipse(' + k + ')' });
    });
    var shaped = [], foreign = [], snapped = [], off = [], fallback = corner.mode === 'fallback';
    corner.shaped.forEach(function (el) { if (!best.has(el)) release(el); });
    corner.snapped.forEach(function (el) { if (!best.has(el)) snapEl(el, 1); });
    best.forEach(function (cand, el) {
      if (handsOff(el, cand.value)) {
        if (el.__fg3Snap) snapEl(el, 1);                /* undo a snap made before the opt-out */
        if (el.__fg3Mode) release(el);
        el.__fg3K = null;                               /* the ResizeObserver skips it too */
        off.push(el);
        return;
      }
      var k = toK(resolveVars(el, cand.value));
      el.__fg3K = k;
      var res = fallback ? shapeEl(el, k) : snapEl(el, k);
      if (res === 'snap') snapped.push(el);
      else if (res === 'foreign') foreign.push(el);
      else if (res !== 'skip') shaped.push(el);
      if (corner.ro) corner.ro.observe(el);            /* a box that grows or shrinks re-decides */
    });
    corner.shaped = shaped; corner.foreign = foreign; corner.snapped = snapped; corner.off = off;
    return fallback ? shaped.length : snapped.length;
  }
  var reapply = debounce(applyCorners, 80);
  function cssomRules() {
    var rules = [];
    Array.prototype.forEach.call(doc.styleSheets, function (sh) {
      if (ignored(sh)) return;
      try { walkRules(sh.cssRules, [], [], rules); } catch (e) { /* cross-origin sheet */ }
    });
    rules.forEach(function (r, i) { r.order = i; r.parts = selectorParts(r.sel); });
    return rules;
  }
  function startCorners() {
    corner.mode = cornerMode();
    flag('fd-corner-shape', corner.mode === 'native');
    /* Forcing the fallback in an engine that HAS corner-shape: switch the
       native property off, or the native squircle keeps painting underneath
       and hides every flaw of the fallback — which is how a never-working
       fallback can pass. With this, ?no-fd-corner-shape in Chromium shows what
       Safari shows. The sheet is marked so the walker never reads it. */
    if (corner.mode === 'fallback' && CORNER_NATIVE && !doc.getElementById('fg3-corner-emulation')) {
      var s = doc.createElement('style');
      s.id = 'fg3-corner-emulation';
      s.setAttribute('data-fg3-ignore', '');
      s.textContent = '*,*::before,*::after{corner-shape:round !important}';
      (doc.head || html).appendChild(s);
    }
    if (!corner.wired) {
      corner.wired = true;
      if (global.ResizeObserver) {
        corner.ro = new ResizeObserver(function (entries) {
          entries.forEach(function (e) {
            var el = e.target;
            if (el.__fg3K == null) return;
            if (corner.mode === 'fallback') shapeEl(el, el.__fg3K); else snapEl(el, el.__fg3K);
          });
        });
      }
      global.addEventListener('resize', reapply);        /* media-scoped rules */
      if (global.MutationObserver && doc.body) {
        /* New nodes and class flips can match new rules. Not `style`: our own
           writes would feed the observer back into itself. */
        corner.mo = new MutationObserver(reapply);
        corner.mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      }
    }
    /* Native engines keep corner-shape in the CSSOM: read it synchronously,
       no fetch. The fallback must read the text (see above). */
    if (corner.mode === 'native') { corner.rules = cssomRules(); return Promise.resolve(applyCorners()); }
    return readSheets().then(function (rules) { corner.rules = rules; return applyCorners(); });
  }
  function corners(opts) {
    if (!corner.mode) return Promise.resolve(0);
    if (opts && opts.reload) {
      if (corner.mode === 'native') { corner.rules = cssomRules(); return Promise.resolve(applyCorners()); }
      return readSheets().then(function (r) { corner.rules = r; return applyCorners(); });
    }
    return Promise.resolve(applyCorners());
  }
  function cornerState() {
    return { mode: corner.mode, native: CORNER_NATIVE, rules: corner.rules.length,
             shaped: corner.shaped.slice(), snapped: corner.snapped.slice(), foreign: corner.foreign.slice(), off: corner.off.slice(),
             modes: corner.shaped.reduce(function (m, el) { m[el.__fg3Mode] = (m[el.__fg3Mode] || 0) + 1; return m; }, {}) };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     4. CONCENTRIC RADII — inner = outer − measured gap, floor 6
     Measured, because a border, a gutter or a transform all change the gap
     and none of them are in the padding you wrote. A capsule's child is a
     capsule: its corner IS its end, there is no radius to subtract from.
     A CONTINUOUS outer (k > 1) subtracts the gap in points, before the
     scale: a token radius R draws at R × --r-scale, so the
     inner is (R − gap) × scale = outer − gap × scale. Subtracting after the
     scale left the inner too full — 32 outside with a 16 gap drew 32.96 px
     instead of 24.48, and the gap swelled to 1.14× at 45° (layout.html).
     ───────────────────────────────────────────────────────────────────────── */
  var OUTER = '[data-concentric-box],[data-lg3],.lg3';
  var concRO = null, concSeen = typeof WeakSet === 'function' ? new WeakSet() : null;

  function measureGap(inner, outer) {
    var G = global.GEOM;
    if (G && G.measureGap) return G.measureGap(inner, outer);
    var a = inner.getBoundingClientRect(), b = outer.getBoundingClientRect();
    if (!a.width || !b.width) return null;
    return Math.max(0, Math.min(a.left - b.left, b.right - a.right, a.top - b.top, b.bottom - a.bottom));
  }
  /* The outer corner's k: the computed corner-shape where the engine has
     the property, else the corner pass's reading of the stylesheet text
     (fallback; boot re-runs concentric once that pass lands), else --k. */
  function outerK(outer, ocs) {
    var v = corner.mode !== 'fallback' ? ocs.getPropertyValue('corner-shape').trim() : '';
    if (v) return toK(v);
    if (outer.__fg3K != null) return outer.__fg3K;
    var kv = parseFloat(ocs.getPropertyValue('--k'));
    return kv > 0 ? kv : 1;
  }
  function concentricOne(inner) {
    var outer = inner.parentElement && inner.parentElement.closest(OUTER);
    if (!outer) return;
    var ocs = getComputedStyle(outer), ow = outer.offsetWidth, oh = outer.offsetHeight;
    var or = radius(authoredRadius(outer, ocs), ow, oh);
    var gap = measureGap(inner, outer);
    if (gap == null || !inner.offsetWidth) return;
    var capsule = or >= Math.min(ow, oh) / 2 - 0.5;
    var min = parseFloat(inner.getAttribute('data-concentric-min'));
    if (!(min >= 0)) min = 6;
    /* a continuous outer: the gap in points, scaled like the radius (above) */
    if (!capsule && outerK(outer, ocs) > 1) gap *= parseFloat(ocs.getPropertyValue('--r-scale')) || 1;
    var r = capsule ? Math.min(inner.offsetWidth, inner.offsetHeight) / 2 : Math.max(min, or - gap);
    setInlineRadius(inner, capsule ? '999px' : r + 'px');
    /* The SHAPE is inherited too: a round child in a squircle parent is the
       same mistake as a wrong radius, one level down. */
    var k = capsule ? '1' : ocs.getPropertyValue('--k').trim();
    if (k) inner.style.setProperty('--k', k); else inner.style.removeProperty('--k');
    inner.setAttribute('data-concentric-r', (Math.round(r * 100) / 100) + (capsule ? ' capsule' : ''));
    var L = global.LG3;
    if (L && typeof L.apply === 'function' && inner.matches('[data-lg3],.lg3')) {
      try { L.apply(inner); } catch (e) { /* the material owns its own errors */ }
    }
    if (corner.mode === 'fallback' && inner.__fg3K != null) shapeEl(inner, inner.__fg3K);
  }
  function concentric(root) {
    var list = (root || doc).querySelectorAll('[data-concentric]');
    if (!concRO && global.ResizeObserver) {
      concRO = new ResizeObserver(function (entries) {
        entries.forEach(function (e) {
          var el = e.target;
          if (el.hasAttribute('data-concentric')) concentricOne(el);
          else el.querySelectorAll('[data-concentric]').forEach(concentricOne);
        });
      });
    }
    list.forEach(function (inner) {
      concentricOne(inner);
      if (concRO && concSeen && !concSeen.has(inner)) {
        concSeen.add(inner);
        concRO.observe(inner);
        var outer = inner.parentElement && inner.parentElement.closest(OUTER);
        if (outer && !concSeen.has(outer)) { concSeen.add(outer); concRO.observe(outer); }
      }
    });
    return list.length;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     5. A NUMBER THAT ROLLS
     Each changed digit rolls in its own slot, right to left 20ms apart
     (a short stagger), on the spring engine's snappy spring. Never animates the
     first paint (nothing to travel from), an unchanged value, or under
     reduced motion — there the value simply lands. The real text sits in a
     visually hidden twin, so a screen reader hears "1,284", not ten strips.
     That twin is the ONLY text: the strips, ghosts and separators carry their
     glyph in data-g and fg3.css draws it (content: attr(data-g)), so copy,
     find-in-page, innerText and textContent read "1,284", not "0123456789".
     ───────────────────────────────────────────────────────────────────────── */
  function mk(tag, cls, text, glyph) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (glyph != null) e.setAttribute('data-g', glyph);
    return e;
  }
  function digitSlot() {
    var slot = mk('span', 'fg3-roll-d'), strip = mk('span', 'fg3-roll-s');
    slot.appendChild(mk('span', 'fg3-roll-g', null, '0'));
    for (var i = 0; i < 10; i++) strip.appendChild(mk('span', null, null, String(i)));
    slot.appendChild(strip);
    slot.__strip = strip; slot.__d = 0;
    return slot;
  }
  function rollNumber(el, to, opts) {
    if (!el) return;
    opts = opts || {};
    var fmt = typeof opts.format === 'function' ? opts.format : function (n) { return Number(n).toLocaleString(); };
    var text = String(fmt(to)), prev = el.__fg3Roll;
    el.__fg3Roll = { value: to, text: text };
    var sr = el.querySelector(':scope > .fg3-roll-sr'), vis = el.querySelector(':scope > .fg3-roll-vis');
    if (!vis) {
      el.textContent = '';
      sr = mk('span', 'fg3-roll-sr sr-only');
      vis = mk('span', 'fg3-roll-vis');
      vis.setAttribute('aria-hidden', 'true');
      el.appendChild(sr); el.appendChild(vis);
      el.classList.add('fg3-roll');
    }
    sr.textContent = text;
    var animate = !!prev && prev.text !== text && opts.animate !== false && !reduced();
    var old = Array.prototype.slice.call(vis.children), chars = text.split(''), next = [], fresh = [];
    for (var j = 0; j < chars.length; j++) {           /* align from the right */
      var c = chars[chars.length - 1 - j], isD = c >= '0' && c <= '9';
      var o = old[old.length - 1 - j], slot = null;
      if (o && isD && o.__strip) slot = o;
      else if (o && !isD && !o.__strip && o.getAttribute('data-g') === c) slot = o;
      if (!slot) { slot = isD ? digitSlot() : mk('span', 'fg3-roll-c', null, c); if (isD) fresh.push(slot); }
      if (isD) { slot.__target = +c; slot.__strip.style.setProperty('--roll-delay', animate ? j * 20 + 'ms' : '0ms'); }
      next.unshift(slot);
    }
    while (vis.firstChild) vis.removeChild(vis.firstChild);
    next.forEach(function (s) { vis.appendChild(s); });
    var strips = next.filter(function (s) { return s.__strip; });
    if (!animate) strips.forEach(function (s) { s.__strip.style.transition = 'none'; });
    fresh.forEach(function (s) { s.__strip.style.setProperty('--d', '0'); });
    void vis.offsetWidth;                               /* commit the start state */
    strips.forEach(function (s) { s.__d = s.__target; s.__strip.style.setProperty('--d', String(s.__target)); });
    if (!animate) { void vis.offsetWidth; strips.forEach(function (s) { s.__strip.style.transition = ''; }); }
    return text;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     6. WHEN SEEN — IntersectionObserver with a deadline
     An observer's first callback is not guaranteed on a page the compositor
     treats as hidden. So: if the observer has NEVER reported by
     the deadline, it is dead — run fn anyway. If it has reported (it always
     does once, even for an off-screen target), it works: wait for the real
     sighting. "Seen" = 30% of the element, or 30% of the viewport for an
     element too tall to ever be 30% visible.
     ───────────────────────────────────────────────────────────────────────── */
  function whenSeen(el, fn, deadline) {
    if (!el || typeof fn !== 'function') return function () {};
    var done = false, alive = false, io = null, timer = 0;
    function stop() { done = true; if (io) io.disconnect(); clearTimeout(timer); }
    function go() { if (done) return; stop(); fn(el); }
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        alive = true;
        entries.forEach(function (e) {
          var vh = (e.rootBounds && e.rootBounds.height) || global.innerHeight || 1;
          if (e.isIntersecting && (e.intersectionRatio >= 0.3 || e.intersectionRect.height >= 0.3 * vh)) go();
        });
      }, { threshold: [0, 0.1, 0.2, 0.3] });
      io.observe(el);
    } else alive = false;
    timer = setTimeout(function () { if (!alive) go(); }, deadline == null ? 1600 : deadline);
    return stop;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     7. BOOT
     ───────────────────────────────────────────────────────────────────────── */
  var state = null, resolveCorners;
  var cornersReady = new Promise(function (r) { resolveCorners = r; });

  function step(name, fn) {
    try { return fn(); }
    catch (e) {
      state.errors.push({ step: name, error: String(e && e.message || e) });
      if (global.console) console.error('[FG3] ' + name + ' failed', e);
    }
  }
  function mountAll(root) {
    var out = [];
    MODULES.forEach(function (name) {
      var m = global[name];
      if (!m || typeof m.mount !== 'function') return;
      step(name + '.mount', function () { m.mount(root); out.push(name); });
    });
    return out;
  }
  function boot(opts) {
    if (state) return state;                   /* idempotent: one boot per page */
    opts = opts || {};
    cornerOpt = opts.cornerFallback == null ? 'auto' : opts.cornerFallback;
    state = { version: VERSION, ready: false, tone: null, capability: null,
              corners: { mode: '', count: null }, mounted: [], errors: [] };
    html.classList.add('fd-js');
    html.classList.remove('no-js');
    state.tone = step('tone', initTone) || null;
    step('stage', function () { stageBands(doc); });
    state.capability = step('gate', function () { var c = capability(); wireGate(); return c; }) || null;
    step('concentric', function () { concentric(doc); });
    step('corners', function () {
      startCorners().then(function (n) {
        state.corners.count = n;
        /* The fallback learns each outer's k only now (from the sheet text). */
        if (corner.mode === 'fallback') step('concentric', function () { concentric(doc); });
        resolveCorners(n);
      },
        function (e) { state.errors.push({ step: 'corners', error: String(e) }); resolveCorners(0); });
      state.corners.mode = corner.mode;
    });
    if (state.corners.mode === '') resolveCorners(0);
    state.mounted = mountAll(doc);
    step('toggles', function () { toneToggles(doc); });
    /* Again after the modules: a mounted material may have changed a radius. */
    step('concentric', function () { concentric(doc); });
    state.ready = true;
    html.setAttribute('data-fg3', 'ready');
    emit('fg3:ready', state);
    return state;
  }
  /* [data-tone-toggle]: any button flips the appearance between light and dark
     (FG3.setTone, persisted). Its label says what a press WILL do, and follows
     every tone change however it happened (system, host, another toggle). */
  function toneToggles(root) {
    var btns = (root || doc).querySelectorAll('[data-tone-toggle]:not([data-tone-wired])');
    function label(b) {
      var next = tone.tone === 'dark' ? 'light' : 'dark';
      b.setAttribute('aria-label', 'Switch to ' + next + ' appearance');
      b.setAttribute('data-tone-next', next);
    }
    btns.forEach(function (b) {
      b.setAttribute('data-tone-wired', '');
      label(b);
      b.addEventListener('click', function () { setTone(tone.tone === 'dark' ? 'light' : 'dark'); });
    });
    if (btns.length && !toneToggles.wired) {
      toneToggles.wired = true;
      doc.addEventListener('fg3:tone', function () {
        doc.querySelectorAll('[data-tone-toggle]').forEach(label);
      });
    }
  }
  function refresh(root) {
    stageBands(root);
    toneToggles(root);
    concentric(root);
    return corners();
  }

  global.FG3 = {
    version: VERSION,
    boot: boot,
    setTone: setTone,
    getTone: getTone,
    capability: capability,
    corners: corners,
    cornerState: cornerState,
    cornersReady: cornersReady,
    cornerClip: clipFor,
    concentric: concentric,
    refresh: refresh,
    rollNumber: rollNumber,
    whenSeen: whenSeen,
    reduceMotion: RM,
    get state() { return state; }
  };
})(window);
