/* ═══════════════════════════════════════════════════════════════════════════
   anim.js → ANIM — the declarative scroll keyframes, CSS-first (Fluid Design Open)
   ───────────────────────────────────────────────────────────────────────────
   Reads the markup verbatim so prototypes port
   unchanged, then runs every keyframe it can on the browser's own scroll
   timeline and the rest in one rAF-batched JS loop.

   MARKUP (the attribute families, each with slots "", -0 … -10)
     data-anim-scroll-group="Name"         anchor-resolution scope
     data-anim-keyframe='{JSON}'           tween / class / event keyframe
     data-anim-classname='{JSON}'          same schema (class keyframes)
     data-anim-event='{JSON}'              same schema (event keyframes)
   JSON keys: start end anchors easeFunction ease epsilon breakpointMask
     disabledWhen cssClass toggle event hold style + animated props:
     opacity x y z scale scaleX scaleY rotation(Z|X|Y) clip --custom
     currentTime scrollLeft scrollTop and camelCase CSS lengths (width, borderRadius…)
     value = [from, to, unit?] | [to]   (numbers or expressions; unit default px,
     unitless for opacity, scale(X|Y), zIndex, fontWeight, --custom; deg for rotation)
     clip = [[t,r,b,l,rad] | [block,inline,rad] | [all,rad], same]  → clip-path: inset(%… round px)

   EXPRESSIONS (the grammar, ported from a reference implementation):
     t b l r h w %  %h %w  (N% of the metric; bare unit = 100) · aN<unit> anchors
     vh vw px deg rad · + − * / · ! && || ?? == != < <= > >= · ?: · 'strings'
     css(--x[, aN]) and var(--x[, aN]) (value evaluated as an expression; aN only
     picks the element it is READ from) · cssStr() raw · prop(name[, aN]) · calc()
     round clamp lerp random atan floor ceil abs cos sin smoothstep rad deg pow,
     Math.* (lower-case), map mapClamp norm randFloat randInt, every easing by name.

   PRESETS (same engine):
     data-reveal="up|fade|scale|stagger"  StaggeredFadeIn: t − 85vh, rise 30px/.7s,
                                          fade .9s, easeInOutQuad, .15s stagger
     data-scene[='{start,end}']           --progress 0→1 over the pinned phase (t → b − 100vh)
     data-parallax="rate"|'{JSON}'        y ±rate·50vh over t − 100vh → b (+ JSON ease = lerp)
     data-clip-expand[='{JSON}']          --clip-path-progress 1→0, t − 70vh → t, ease .3
     data-scrub[='{JSON}']                <video> currentTime, else 'anim:scrub' + onScrub()
     data-count[-from|-duration]          count-up from the authored final text at t − 85vh
     data-sweep                           gradient text sweep class at t − 80vh
   Content is authored in its FINAL state: no JS, reduced motion and the base
   experience all show it finished.

   GATE: <html> class fd-enhanced | no-fd-enhanced (+ data-fd-cause). Base when
   prefers-reduced-motion, the InvalidViewport queries, or text zoom ≥ 1.2.
   ?enhanced / ?no-enhanced (or FG3's ?fd-…) override. An existing gate (FG3) is accepted as is.
   The plain names alias in disabledWhen: no-enhanced → no-fd-enhanced.
   Tween keyframes default to disabledWhen ["no-fd-enhanced"] unless the JSON
   says otherwise (rule: reduced motion removes displacement).

   API (global ANIM) — FG3.boot() calls mount(); ANIM never mounts itself.
     mount(root=document) → stats      refresh()      destroy()
     addKeyframe(el, json) → {remove()} (also the programmatic event API: onEnter,
       onExit, onEvent, onEventReverse functions in json)
     onScrub(el, fn(progress))         gate(force?) → {enhanced, cause}
     expr(src, ctx) · parse(src) · linearize(src) · rangeOf(src) · ease(name)
     cssEasing(name) · EASE · stats() · path ('css'|'js')
     inspect(el) → [{kind, path, enabled, start, end (resolved px), startSrc,
       endSrc (the expressions, e.g. 't - 85vh'), progress, range, props, …}]
     forceJS (set before mount, or ?anim=js)
   Events: CustomEvent on the element, bubbling: name | name:reverse (points),
     name:enter | name:exit (ranges); detail {progress, direction}.
   CSS path output: <style id="anim-compiled"> (end of <body>), elements get
     data-anim-id. ANIM owns `translate` `scale` `rotate` `animation-*` of the
     elements it animates — use `transform` for your own.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ════════════════════ 1 · EXPRESSIONS ════════════════════════════════════
     Lexer → parser → AST, cached per string. Kept
     structurally identical to the so a disagreement is a bug, not taste. */
  var OBJ_UNIT = /^(t|l|b|r|%w|%h|%|h|w)$/, ANY_UNIT = /^(t|l|b|r|%w|%h|%|h|w|px|vh|vw|rad|deg)$/;
  var ARITY = { round: 1, clamp: 3, lerp: 3, random: 2, atan: 2, floor: 1, ceil: 1, abs: 1, cos: 1, sin: 1,
                smoothstep: 3, rad: 1, deg: 1, pow: 2, calc: 1 };
  var FN = {
    smoothstep: function (a, b, x) { x = Math.max(0, Math.min(1, (x - a) / (b - a))); return x * x * (3 - 2 * x); },
    deg: function (r) { return 180 * r / Math.PI; }, rad: function (d) { return d * Math.PI / 180; },
    random: function (a, b) { return Math.random() * (b - a) + a; },
    parseint: function (a, b) { return parseInt(a, b); }, parsefloat: function (a) { return parseFloat(a); },
    atan: Math.atan2,
    lerp: function (p, a, b) { return a + (b - a) * p; },
    map: function (v, a, b, c, d) { return c + (d - c) * (v - a) / (b - a); },
    mapclamp: function (v, a, b, c, d) { var r = c + (d - c) * (v - a) / (b - a); return Math.max(c, Math.min(d, r)); },
    norm: function (v, a, b) { return (v - a) / (b - a); },
    clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); },
    randfloat: function (a, b) { return Math.random() * (b - a) + a; },
    randint: function (a, b) { return Math.floor(Math.random() * (b - a) + a); }
  };
  Object.getOwnPropertyNames(Math).forEach(function (k) { var l = k.toLowerCase(); if (!(l in FN)) FN[l] = Math[k]; });

  function exprError(msg, text) { throw new Error('ANIM expression: ' + msg + ' in "' + text + '"'); }

  function lex(text) {
    var toks = [], i = 0, c;
    while (i < text.length) {
      c = text[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '.' || /\d/.test(c)) {
        var s = '';
        if (c === '.') { s = '.'; i++; }
        while (i < text.length && /\d/.test(text[i])) s += text[i++];
        if (text[i] === '.') {
          if (s.indexOf('.') >= 0) exprError('number with two decimal points', text);
          s += text[i++];
          while (i < text.length && /\d/.test(text[i])) s += text[i++];
        }
        if (s === '.') exprError('lone decimal point', text);
        toks.push({ type: s.indexOf('.') >= 0 ? 'FLOAT' : 'INT', value: parseFloat(s) });
        continue;
      }
      if (/[a-zA-Z%]/.test(c)) {
        var w = '';
        while (i < text.length && /[a-zA-Z%]/.test(text[i])) w += text[i++];
        toks.push(w === 'true' || w === 'false' ? { type: 'BOOL', value: w === 'true' } : { type: 'ALPHA', value: w });
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        var q = c, str = ''; i++;
        while (i < text.length && text[i] !== q) str += text[i++];
        if (text[i] !== q) exprError('unterminated string', text);
        i++; toks.push({ type: 'STR', value: str }); continue;
      }
      var two = text.substr(i, 2), three = text.substr(i, 3);
      if (three === '===' || three === '!==') { toks.push({ type: 'CMP', value: three }); i += 3; continue; }
      if (two === '==' || two === '!=' || two === '<=' || two === '>=') { toks.push({ type: 'CMP', value: two }); i += 2; continue; }
      if (two === '&&' || two === '||' || two === '??') { toks.push({ type: two, value: two }); i += 2; continue; }
      if ('+-*/(),:?<>!'.indexOf(c) >= 0) {
        toks.push({ type: c === '<' || c === '>' ? 'CMP' : c, value: c }); i++; continue;
      }
      exprError('unexpected character "' + c + '"', text);
    }
    toks.push({ type: 'EOF', value: null });
    return toks;
  }

  var PROGRAMS = Object.create(null);
  function parse(text) {
    text = String(text);
    if (PROGRAMS[text]) return PROGRAMS[text];
    var toks = lex(text), p = 0;
    function cur() { return toks[p]; }
    function eat(type) { var t = toks[p]; if (t.type !== type) exprError('expected ' + type + ' got "' + t.value + '"', text); p++; return t; }
    function anchorIndex() { var t = cur(); if (t.type !== 'INT') exprError('bad anchor (use a0, a1 …)', text); p++; return t.value; }
    function unit(re) {
      var t = cur();
      if (t.type === 'ALPHA' && (re || ANY_UNIT).test(t.value)) {
        p++; return t.value.replace(/%(h|w)/, '$1').replace('%', 'h');
      }
      exprError('expected a unit, got "' + t.value + '"', text);
    }
    function expr() { return ternary(); }
    function ternary() {
      var n = logical();
      while (cur().type === '?') { p++; var a = expr(); eat(':'); var b = expr(); n = { k: 'tern', c: n, a: a, b: b }; }
      return n;
    }
    function logical() {
      var n = coalesce();
      for (;;) {
        if (cur().type === '&&') { p++; n = { k: 'bin', op: '&&', a: n, b: coalesce() }; }
        else if (cur().type === '||') { p++; n = { k: 'bin', op: '||', a: n, b: logical() }; }
        else return n;
      }
    }
    function coalesce() { var n = compare(); while (cur().type === '??') { p++; n = { k: 'bin', op: '??', a: n, b: compare() }; } return n; }
    function compare() { var n = additive(); while (cur().type === 'CMP') { var op = toks[p++].value; n = { k: 'bin', op: op, a: n, b: additive() }; } return n; }
    function additive() {
      var n = term();
      while (cur().type === '+' || cur().type === '-') { var op = toks[p++].type; n = { k: 'bin', op: op, a: n, b: term() }; }
      return n;
    }
    function term() {
      var n = unary();
      while (cur().type === '*' || cur().type === '/') { var op = toks[p++].type; n = { k: 'bin', op: op, a: n, b: unary() }; }
      return n;
    }
    function unary() {
      var t = cur().type;
      if (t === '!' || t === '+' || t === '-') { p++; return { k: 'un', op: t, a: unary() }; }
      return factor();
    }
    function factor() {
      var t = cur();
      if (t.type === 'BOOL' || t.type === 'STR') { p++; return { k: 'num', v: t.value }; }
      if (t.type === 'INT' || t.type === 'FLOAT') {
        p++;
        var nx = cur();
        if ('+-*/),'.indexOf(nx.type) >= 0 || nx.type === 'EOF' || nx.type !== 'ALPHA') return { k: 'num', v: t.value };
        if (nx.value === 'a') { p++; var ai = anchorIndex(); return { k: 'ref', n: t.value, ref: ai, u: unit(ANY_UNIT) }; }
        return { k: 'ref', n: t.value, ref: null, u: unit() };
      }
      if (t.type === 'ALPHA' && OBJ_UNIT.test(t.value)) return { k: 'ref', n: 100, ref: null, u: unit() };
      if (t.type === 'ALPHA' && t.value === 'a') {
        p++; var a = anchorIndex();
        if (cur().type === 'ALPHA' && OBJ_UNIT.test(cur().value)) return { k: 'ref', n: 100, ref: a, u: unit() };
        exprError('anchor needs a metric (a0t, a0h …)', text);
      }
      if (t.type === 'ALPHA') {
        var name = t.value, lower = name.toLowerCase();
        if (name === 'calc') { p++; return expr(); }
        if (name === 'css' || name === 'cssStr' || name === 'var' || name === 'prop') {
          p++; eat('(');
          var prop = '';
          while (cur().type === 'ALPHA' || cur().type === '-' || cur().type === 'INT') prop += toks[p++].value;
          var ref = null;
          if (cur().type === ',') { p++; eat('ALPHA'); ref = anchorIndex(); }
          eat(')');
          /* var() evaluates exactly like css(); only cssStr() is raw. */
          return { k: name === 'prop' ? 'prop' : 'css', name: prop, ref: ref, evaluate: name !== 'cssStr' };
        }
        if (typeof FN[lower] === 'number') { p++; return { k: 'num', v: FN[lower] }; }
        var fn = EASE[name] || FN[lower] || FN[name];
        if (fn) {
          p++; eat('(');
          var args = [expr()];
          while (cur().type === ',') { p++; args.push(expr()); }
          eat(')');
          if (ARITY[lower] && args.length !== ARITY[lower]) exprError(name + ' takes ' + ARITY[lower] + ' arguments', text);
          return { k: 'call', fn: fn, name: name, args: args };
        }
      }
      if (t.type === '(') { p++; var e = expr(); eat(')'); return e; }
      exprError('unexpected token "' + t.value + '"', text);
    }
    var ast = expr();
    if (cur().type !== 'EOF') exprError('unexpected token "' + cur().value + '"', text);
    return (PROGRAMS[text] = ast);
  }

  /* ctx = { box(ref) → {t,b,l,r,h,w}, vh, vw, css(name, ref) → string,
             prop(name, ref) }   ref: null = the keyframe's element, N = anchor N */
  function evaluate(n, ctx) {
    switch (n.k) {
      case 'num': return n.v;
      case 'ref': {
        var u = n.u;
        if (u === 'px' || u === 'deg') return n.n;
        if (u === 'rad') return 180 * n.n / Math.PI;
        if (u === 'vh') return 0.01 * n.n * ctx.vh;
        if (u === 'vw') return 0.01 * n.n * ctx.vw;
        return 0.01 * n.n * ctx.box(n.ref)[u];
      }
      case 'un': { var a = evaluate(n.a, ctx); return n.op === '-' ? -a : n.op === '+' ? +a : !a; }
      case 'tern': return evaluate(n.c, ctx) ? evaluate(n.a, ctx) : evaluate(n.b, ctx);
      case 'call': return n.fn.apply(null, n.args.map(function (x) { return evaluate(x, ctx); }));
      case 'prop': return ctx.prop(n.name, n.ref);
      case 'css': {
        var raw = ctx.css(n.name, n.ref);
        if (!n.evaluate) return String(raw).replace(/^\s+/, '');
        /* the property's VALUE is an expression evaluated in the SAME
           context — `, aN` only chose the element it was read from. */
        return raw === '' || raw == null ? undefined : evaluate(parse(String(raw).trim()), ctx);
      }
      case 'bin': {
        var x = n.op === '??' ? null : evaluate(n.a, ctx);
        switch (n.op) {
          case '+': return x + evaluate(n.b, ctx);
          case '-': return x - evaluate(n.b, ctx);
          case '*': return x * evaluate(n.b, ctx);
          case '/': return x / evaluate(n.b, ctx);
          case '&&': return x && evaluate(n.b, ctx);
          case '||': return x || evaluate(n.b, ctx);
          case '??': { var l = evaluate(n.a, ctx); return l != null ? l : evaluate(n.b, ctx); }
          /* eslint-disable eqeqeq */
          case '==': return x == evaluate(n.b, ctx);
          case '!=': return x != evaluate(n.b, ctx);
          /* eslint-enable eqeqeq */
          case '===': return x === evaluate(n.b, ctx);
          case '!==': return x !== evaluate(n.b, ctx);
          case '<': return x < evaluate(n.b, ctx);
          case '<=': return x <= evaluate(n.b, ctx);
          case '>': return x > evaluate(n.b, ctx);
          case '>=': return x >= evaluate(n.b, ctx);
        }
      }
    }
    throw new Error('ANIM expression: bad node ' + n.k);
  }
  function expr(src, ctx) { return typeof src === 'number' ? src : evaluate(parse(src), ctx); }

  /* LINEARIZE — the CSS compiler's question: is this T + c·H + K over ONE
     subject? Returns {ref, t, h, vh, vw, px} or null. t must end up exactly 1
     for a scroll position; h → c·100 %; px/vh/vw → K. The exit-crossing
     calc(c·100% + K) was verified against the JS engine to ≤ 0.0001 progress. */
  function lin(n) {
    switch (n.k) {
      case 'num': return typeof n.v === 'number' ? { t: 0, h: 0, vh: 0, vw: 0, px: n.v } : null;
      case 'ref': {
        var f = n.n / 100, o = { t: 0, h: 0, vh: 0, vw: 0, px: 0 };
        if (n.u === 'px') { o.px = n.n; return o; }
        if (n.u === 'vh') { o.vh = n.n; return o; }
        if (n.u === 'vw') { o.vw = n.n; return o; }
        o.ref = n.ref;
        if (n.u === 't') o.t = f; else if (n.u === 'b') { o.t = f; o.h = f; } else if (n.u === 'h') o.h = f; else return null;
        return o;
      }
      case 'un': { if (n.op === '!') return null; var a = lin(n.a); return a && (n.op === '-' ? scale(a, -1) : a); }
      case 'bin': {
        var L = lin(n.a), R = lin(n.b);
        if (!L || !R) return null;
        if (n.op === '+' || n.op === '-') {
          if (L.ref !== undefined && R.ref !== undefined && L.ref !== R.ref) return null;
          var s = n.op === '-' ? -1 : 1;
          return { ref: L.ref !== undefined ? L.ref : R.ref, t: L.t + s * R.t, h: L.h + s * R.h,
                   vh: L.vh + s * R.vh, vw: L.vw + s * R.vw, px: L.px + s * R.px };
        }
        if (n.op === '*') { if (isConst(L)) return scale(R, L.px); if (isConst(R)) return scale(L, R.px); return null; }
        if (n.op === '/') return isConst(R) && R.px ? scale(L, 1 / R.px) : null;
        return null;
      }
    }
    return null;
  }
  function isConst(L) { return L.ref === undefined && !L.t && !L.h && !L.vh && !L.vw; }
  function scale(L, k) { return { ref: L.ref, t: L.t * k, h: L.h * k, vh: L.vh * k, vw: L.vw * k, px: L.px * k }; }
  function linearize(src) {
    if (typeof src === 'number') return { t: 0, h: 0, vh: 0, vw: 0, px: src };
    try { return lin(parse(src)); } catch (e) { return null; }
  }
  var r4 = function (v) { return Math.round(v * 1e4) / 1e4; };
  /* A scroll position as a CSS view-timeline range point, or null. */
  function rangeOf(src) {
    var L = linearize(src);
    if (!L || L.ref === undefined || Math.abs(L.t - 1) > 1e-9) return null;
    var terms = [];
    if (L.h) terms.push(r4(L.h * 100) + '%');
    if (L.px) terms.push(r4(L.px) + 'px');
    if (L.vh) terms.push(r4(L.vh) + 'vh');
    if (L.vw) terms.push(r4(L.vw) + 'vw');
    var off = !terms.length ? '0%' : terms.length === 1 ? terms[0]
      : 'calc(' + terms.join(' + ').replace(/\+ -/g, '- ') + ')';
    return { ref: L.ref, css: 'exit-crossing ' + off };
  }

  /* ════════════════════ 2 · EASING ═════════════════════════════════════════
     The easing library verbatim, plus bezier()
     and spring(). CSS gets these sampled into linear() — exact, where the
     easings.net cubic-bezier equivalents are only recalled approximations. */
  var EASE = {
    linear: function (e) { return e; },
    easeInQuad: function (e) { return e * e; },
    easeOutQuad: function (e) { return e * (2 - e); },
    easeInOutQuad: function (e) { return e < 0.5 ? 2 * e * e : (4 - 2 * e) * e - 1; },
    easeInSin: function (e) { return 1 + Math.sin(Math.PI / 2 * e - Math.PI / 2); },
    easeOutSin: function (e) { return Math.sin(Math.PI / 2 * e); },
    easeInOutSin: function (e) { return (1 + Math.sin(Math.PI * e - Math.PI / 2)) / 2; },
    easeInElastic: function (e) { return e === 0 ? e : (0.04 - 0.04 / e) * Math.sin(25 * e) + 1; },
    easeOutElastic: function (e) { return 0.04 * e / --e * Math.sin(25 * e); },
    easeInOutElastic: function (e) { return (e -= 0.5) < 0 ? (0.02 + 0.01 / e) * Math.sin(50 * e) : (0.02 - 0.01 / e) * Math.sin(50 * e) + 1; },
    easeOutBack: function (e) { return (e -= 1) * e * (2.70158 * e + 1.70158) + 1; },
    easeInCubic: function (e) { return e * e * e; },
    easeOutCubic: function (e) { return --e * e * e + 1; },
    easeInOutCubic: function (e) { return e < 0.5 ? 4 * e * e * e : (e - 1) * (2 * e - 2) * (2 * e - 2) + 1; },
    easeInQuart: function (e) { return e * e * e * e; },
    easeOutQuart: function (e) { return 1 - --e * e * e * e; },
    easeInOutQuart: function (e) { return e < 0.5 ? 8 * e * e * e * e : 1 - 8 * --e * e * e * e; },
    easeInQuint: function (e) { return e * e * e * e * e; },
    easeOutQuint: function (e) { return 1 + --e * e * e * e * e; },
    easeInOutQuint: function (e) { return e < 0.5 ? 16 * e * e * e * e * e : 1 + 16 * --e * e * e * e * e; }
  };
  /* The UnitBezier, exactly: Float32
     coefficients, 5 Newton steps (ε 1e-5, flat-derivative 1e-5), then
     bisection. The loop guard is ours (the bisection has none). */
  function bezier(x1, y1, x2, y2) {
    var cp = new Float32Array(6);
    cp[0] = 3 * x1; cp[1] = 3 * (x2 - x1) - cp[0]; cp[2] = 1 - cp[0] - cp[1];
    cp[3] = 3 * y1; cp[4] = 3 * (y2 - y1) - cp[3]; cp[5] = 1 - cp[3] - cp[4];
    function sx(t) { return ((cp[2] * t + cp[1]) * t + cp[0]) * t; }
    function sy(t) { return ((cp[5] * t + cp[4]) * t + cp[3]) * t; }
    function dx(t) { return (3 * cp[2] * t + 2 * cp[1]) * t + cp[0]; }
    function solveX(x) {
      var t = x, i, e, d;
      for (i = 0; i < 5; i++) { e = sx(t) - x; if (Math.abs(e) < 1e-5) return t; d = dx(t); if (Math.abs(d) < 1e-5) break; t -= e / d; }
      var lo = 0, hi = 1; t = x;
      if (t < lo) return lo;
      if (t > hi) return hi;
      for (i = 0; lo < hi && i < 64; i++) { e = sx(t); if (Math.abs(e - x) < 1e-5) return t; if (x > e) lo = t; else hi = t; t = 0.5 * (hi - lo) + lo; }
      return t;
    }
    return function (x) { return sy(solveX(x)); };
  }
  /* bezier(…) is the markup's own spelling and is parsed its way, with the regex
     /\d*\.?\d+/g, which DROPS MINUS SIGNS: Air's "bezier(-0.24,0.65,0.39,1.56)"
     plays as bezier(0.24, …), so it does here. Write
     cubic-bezier(…) for signed CSS semantics (x clamped to [0,1] as CSS
     requires, where an out-of-range x would make the declaration invalid). */
  function bezierArgs(name) {
    var legacy = name.indexOf('bezier(') === 0, inner = name.slice(name.indexOf('(') + 1, name.lastIndexOf(')'));
    var a = legacy ? (inner.match(/\d*\.?\d+/g) || []).map(Number) : inner.split(',').map(Number);
    if (a.length !== 4 || a.some(isNaN)) return null;
    if (!legacy) { a[0] = Math.max(0, Math.min(1, a[0])); a[2] = Math.max(0, Math.min(1, a[2])); }
    return a;
  }
  var EASE_CACHE = Object.create(null);
  function ease(name) {
    if (typeof name === 'function') return name;
    name = name || 'linear';
    if (EASE[name]) return EASE[name];
    if (EASE_CACHE[name]) return EASE_CACHE[name];
    var clean = String(name).replace(/\s+/g, ''), fn = null, b;
    if (/^(cubic-)?bezier\(/.test(clean) && (b = bezierArgs(clean))) fn = bezier(b[0], b[1], b[2], b[3]);
    else if (/^spring\(/.test(clean) && global.SPRING) {
      var a = clean.slice(7, -1).split(',').map(Number);
      if (a.length === 4) fn = global.SPRING.mkcEasing(a[0], a[1], a[2], a[3]);
    }
    if (!fn) { warn('unknown easeFunction "' + name + '", using linear'); fn = EASE.linear; }
    return (EASE_CACHE[name] = fn);
  }
  function cssEasing(name) {
    name = name || 'linear';
    if (name === 'linear') return 'linear';
    var clean = String(name).replace(/\s+/g, ''), b = /^(cubic-)?bezier\(/.test(clean) && bezierArgs(clean);
    if (b) return 'cubic-bezier(' + b.join(',') + ')';
    var fn = ease(name), out = [];
    for (var i = 0; i <= 40; i++) out.push(+fn(i / 40).toFixed(5) + ' ' + (i * 2.5) + '%');
    out[40] = '1 100%';
    return 'linear(' + out.join(',') + ')';
  }

  /* ════════════════════ 3 · THE GATE ═══════════════════════════════════════
     The PageExperienceManager in miniature. */
  var ENH = 'fd-enhanced', NOENH = 'no-fd-enhanced';
  var VIEWPORT_BAD = [
    '(min-width:481px) and (max-width:734px)',                        /* smallWide   */
    '(max-width:734px) and (max-height:500px)',                        /* smallShort  */
    '(max-width:734px) and (min-height:927px)',                        /* smallTall   */
    '(min-width:735px) and (max-width:1068px) and (max-height:520px)', /* mediumShort */
    '(min-width:1069px) and (max-height:620px)'                        /* largeShort  */
  ];
  var ALIAS = { 'no-enhanced': NOENH, 'enhanced': ENH };
  var gateState = { enhanced: false, cause: 'unmounted', owned: false };
  function mq(q) { return global.matchMedia ? global.matchMedia(q) : { matches: false }; }
  function textZoom() {
    var d = global.document, b = d.body || d.documentElement, p = d.createElement('div');
    p.style.cssText = 'position:absolute;visibility:hidden;font-size:16px;height:1em;width:1px;top:0;left:0';
    var m = d.createElement('div');
    m.style.cssText = 'position:absolute;visibility:hidden;font-size:medium;height:1em;width:1px;top:0;left:0';
    b.appendChild(p); b.appendChild(m);
    var z = Math.max(p.offsetHeight / 16, m.offsetHeight / 16);
    p.remove(); m.remove();
    return z;
  }
  function gate(force) {
    var d = global.document, cl = d.documentElement.classList;
    if (!force && !gateState.owned && (cl.contains(ENH) || cl.contains(NOENH))) {
      gateState.enhanced = cl.contains(ENH);
      gateState.cause = d.documentElement.dataset.fdCause || (gateState.enhanced ? 'none' : 'external');
      return gateState;
    }
    var q = (global.location && global.location.search) || '', cause = '';
    if (/[?&]no-(fd-)?enhanced\b/.test(q)) cause = 'url';
    else if (!/[?&](fd-)?enhanced\b/.test(q)) {
      if (mq('(prefers-reduced-motion: reduce)').matches) cause = 'reduced-motion';
      else if (VIEWPORT_BAD.some(function (x) { return mq(x).matches; })) cause = 'invalid-viewport';
      else if (textZoom() >= 1.2) cause = 'text-zoom';
    }
    gateState = { enhanced: !cause, cause: cause || 'none', owned: true };
    cl.toggle(ENH, !cause); cl.toggle(NOENH, !!cause);
    cl.toggle('fd-text-zoom', cause === 'text-zoom');
    d.documentElement.dataset.fdCause = gateState.cause;
    return gateState;
  }

  /* ════════════════════ 4 · KEYFRAME MODEL ═════════════════════════════════ */
  var FAMILIES = ['data-anim-keyframe', 'data-anim-classname', 'data-anim-event'];
  var ATTRS = [];
  FAMILIES.forEach(function (f) { ATTRS.push(f); for (var i = 0; i <= 10; i++) ATTRS.push(f + '-' + i); });
  var RESERVED = { start: 1, end: 1, anchors: 1, easeFunction: 1, ease: 1, epsilon: 1, breakpointMask: 1,
                   disabledWhen: 1, cssClass: 1, toggle: 1, event: 1, hold: 1, style: 1, snapAtCreation: 1,
                   preserveState: 1, onEnter: 1, onExit: 1, onEvent: 1, onEventReverse: 1, onEnterOnce: 1,
                   onExitOnce: 1, onEventOnce: 1, onEventReverseOnce: 1, _preset: 1, _scrub: 1, _count: 1 };
  var TRANSFORM = { x: 'translate', y: 'translate', z: 'translate', scale: 'scale', scaleX: 'scale', scaleY: 'scale',
                    rotation: 'rotate', rotationZ: 'rotate', rotationX: 'rotate', rotationY: 'rotate' };
  var UNITLESS = { opacity: 1, scale: 1, scaleX: 1, scaleY: 1, zIndex: 1, fontWeight: 1, currentTime: 1 };
  var DOMPROP = { currentTime: 1, scrollLeft: 1, scrollTop: 1 };
  var BP = {
    xsmall: '(max-width:480px)', small: '(min-width:481px) and (max-width:734px)',
    medium: '(min-width:735px) and (max-width:1068px)', large: '(min-width:1069px) and (max-width:1440px)',
    xlarge: '(min-width:1441px)'
  };
  var LETTER = { S: ['xsmall', 'small'], M: ['medium'], L: ['large'], X: ['xlarge'] };
  function maskList(m) {
    if (!m) return null;
    var out = [];
    if (typeof m === 'string' && !BP[m]) m.split('').forEach(function (c) { out = out.concat(LETTER[c] || []); });
    else [].concat(m).forEach(function (n) { if (BP[n]) out.push(n); });
    return out.length >= 5 ? null : out;
  }
  function kebab(s) { return s.charAt(0) === '-' ? s : s.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }

  var nextId = 1, nextAnchor = 0, records = [], state = null;
  function warn(m) { if (global.console) console.warn('ANIM: ' + m); }

  function makeRecord(el, json, src) {
    var rec = { id: nextId++, el: el, json: json, src: src || 'api', props: [],
      start: 0, end: 0, lt: 0, cur: null, on: false, inside: false, enabled: false, path: 'js' };
    rec.group = el.closest ? el.closest('[data-anim-scroll-group]') : null;
    rec.anchorEls = [].concat(json.anchors || []).map(function (a) {
      if (typeof a !== 'string') return a;
      var hit = (rec.group && rec.group.querySelector(a)) || global.document.querySelector(a);
      if (!hit) warn('anchor "' + a + '" not found for ' + describe(el));
      return hit;
    });
    rec.startSrc = json.start != null ? json.start : 0;
    rec.endSrc = json.end != null ? json.end : rec.startSrc;
    rec.easeName = json.easeFunction || 'linear';
    rec.easeFn = ease(rec.easeName);
    rec.lerp = json.ease != null ? +json.ease : 1;
    rec.hold = !!json.hold;
    rec.mask = maskList(json.breakpointMask);
    Object.keys(json).forEach(function (k) {
      if (RESERVED[k] || !Array.isArray(json[k])) return;
      var v = json[k], one = v.length === 1;
      var p = { name: k, from: one ? null : v[0], to: one ? v[0] : v[1], unit: v.length > 2 ? v[2] : null };
      if (k === 'clip') p.kind = 'clip';
      else if (k.slice(0, 2) === '--') p.kind = 'custom';
      else if (TRANSFORM[k]) p.kind = TRANSFORM[k];
      else if (DOMPROP[k]) p.kind = 'dom';
      else if (k === 'opacity') p.kind = 'opacity';
      else p.kind = 'css';
      if (p.unit == null) p.unit = p.kind === 'custom' || p.kind === 'clip' || UNITLESS[k] ? '' : p.kind === 'rotate' ? 'deg' : 'px';
      rec.props.push(p);
    });
    rec.cssClass = json.cssClass ? String(json.cssClass).split(/\s+/).filter(Boolean) : null;
    rec.kind = json._scrub ? 'scrub' : rec.props.length ? 'tween' : rec.cssClass || json.style ? 'class' : 'event';
    var dw = json.disabledWhen;
    if (dw == null) dw = rec.kind === 'tween' || rec.kind === 'scrub' ? [NOENH] : [];
    rec.disabledWhen = [].concat(dw).map(function (c) { return ALIAS[c] || c; });
    return rec;
  }
  function describe(el) { return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && el.className.baseVal == null ? '.' + String(el.className).split(' ')[0] : ''); }

  /* ════════════════════ 5 · CSS COMPILER ═══════════════════════════════════ */
  var NUMLIT = /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*(px|vh|vw|deg|%)?\s*$/;
  function literal(v, p) {
    if (v == null) return { n: null };
    if (typeof v === 'number') return { n: v, u: p.unit };
    var m = NUMLIT.exec(v);
    if (!m) return null;
    if (m[2] === '%' && p.name !== 'y') return null;         /* % = of height */
    return { n: +m[1], u: m[2] || p.unit };
  }
  function cssable(rec) {
    if (rec.kind !== 'tween' || rec.lerp < 1 || rec.hold) return false;
    var a = rangeOf(rec.startSrc), b = rangeOf(rec.endSrc);
    if (!a || !b || a.ref !== b.ref || a.css === b.css) return false;
    if (a.ref != null && !rec.anchorEls[a.ref]) return false;
    rec.range = [a, b];
    return rec.props.every(function (p) {
      if (p.kind === 'dom' || (p.kind === 'rotate' && p.name !== 'rotation' && p.name !== 'rotationZ')) return false;
      if (p.kind === 'clip') return [p.from, p.to].every(function (arr) { return arr == null || (Array.isArray(arr) && arr.every(function (x) { return typeof x === 'number'; })); });
      return literal(p.from, p) && literal(p.to, p);
    });
  }
  function inset(a, fmt) {
    var t, r, b, l, rad = 0;
    if (a.length >= 5) { t = a[0]; r = a[1]; b = a[2]; l = a[3]; rad = a[4]; }
    else if (a.length === 4) { t = a[0]; r = a[1]; b = a[2]; l = a[3]; }
    else if (a.length === 3) { t = b = a[0]; r = l = a[1]; rad = a[2]; }
    else if (a.length === 2) { t = r = b = l = a[0]; rad = a[1]; }
    else { t = r = b = l = a[0] || 0; }
    return 'inset(' + fmt(t) + '% ' + fmt(r) + '% ' + fmt(b) + '% ' + fmt(l) + '% round ' + fmt(rad) + 'px)';
  }
  function lit(x) { return x.n + (x.u || ''); }
  /* One @keyframes block per record, individual transform properties so they
     compose with MOTION's `transform` and the glass press. */
  function keyframeDecls(rec, which, priv) {
    var d = [], tr = null, sc = null;
    rec.props.forEach(function (p) {
      var raw = which === 'from' ? p.from : p.to;
      if (raw == null) return;
      if (p.kind === 'clip') { d.push('clip-path:' + inset(raw, r4)); return; }
      var x = literal(raw, p);
      if (p.kind === 'translate') { tr = tr || { x: '0px', y: '0px', z: '0px' }; tr[p.name] = lit(x); }
      else if (p.kind === 'scale') { sc = sc || { s: 1, x: 1, y: 1 }; sc[p.name === 'scale' ? 's' : p.name === 'scaleX' ? 'x' : 'y'] = x.n; }
      else if (p.kind === 'rotate') d.push('rotate:' + x.n + 'deg');
      else if (p.kind === 'custom') d.push(priv[p.name] + ':' + lit(x));
      else if (p.kind === 'opacity') d.push('opacity:' + x.n);
      else d.push(kebab(p.name) + ':' + lit(x));
    });
    if (tr) d.push('translate:' + tr.x + ' ' + tr.y + (tr.z !== '0px' ? ' ' + tr.z : ''));
    if (sc) d.push('scale:' + r4(sc.s * sc.x) + ' ' + r4(sc.s * sc.y));
    return d.join(';');
  }
  function cssProps(rec) {
    var s = {};
    rec.props.forEach(function (p) {
      s[p.kind === 'custom' ? p.name : p.kind === 'clip' ? 'clip-path' : p.kind === 'css' ? kebab(p.name) : p.kind] = 1;
    });
    return s;
  }
  function gateSel(rec) {
    var s = 'html';
    rec.disabledWhen.forEach(function (c) { s += c === NOENH ? '.' + ENH : ':not(.' + c + ')'; });
    return s;
  }
  function compile(elRecs) {
    var css = [], props = [], scopes = [];
    elRecs.forEach(function (list) {
      var el = list[0].el, id = el.getAttribute('data-anim-id');
      if (!id) { id = String(nextId++); el.setAttribute('data-anim-id', id); }
      /* Later wins in an animation list, so order by where each range STARTS
         (measured now) and let only the first writer of a property fill
         backwards — the scrim fading in then out keeps both halves. */
      list.sort(function (a, b) { return a.start - b.start; });
      var seen = {}, names = [], tf = [], fill = [], tl = [], rs = [], re = [], priv = {}, pdecl = [];
      list.forEach(function (rec) {
        rec.props.forEach(function (p) {
          if (p.kind === 'custom' && !priv[p.name]) {
            var pn = '--anim-p' + (nextId++);
            priv[p.name] = pn;
            var syn = p.unit === '' ? '<number>' : p.unit === '%' ? '<percentage>' : p.unit === 'deg' ? '<angle>' : '<length>';
            props.push('@property ' + pn + '{syntax:"' + syn + '";inherits:false;initial-value:' + (syn === '<number>' ? '0' : syn === '<angle>' ? '0deg' : syn === '<percentage>' ? '0%' : '0px') + '}');
            pdecl.push(p.name + ':var(' + pn + ')');
          }
        });
        var k = 'anim-k' + rec.id, from = keyframeDecls(rec, 'from', priv), to = keyframeDecls(rec, 'to', priv);
        css.push('@keyframes ' + k + '{' + (from ? 'from{' + from + '}' : '') + 'to{' + to + '}}');
        var P = cssProps(rec), shared = Object.keys(P).some(function (x) { return seen[x]; });
        Object.keys(P).forEach(function (x) { seen[x] = 1; });
        names.push(k); tf.push(cssEasing(rec.easeName)); fill.push(shared ? 'forwards' : 'both');
        var ref = rec.range[0].ref;
        if (ref == null) tl.push('view()');
        else {
          var a = rec.anchorEls[ref];
          if (!a.__animTimeline) {
            a.__animTimeline = '--anim-a' + (nextAnchor++);
            var aid = a.getAttribute('data-anim-id');
            if (!aid) { aid = String(nextId++); a.setAttribute('data-anim-id', aid); }
            scopes.push(a.__animTimeline);
            css.push('[data-anim-id="' + aid + '"]{view-timeline:' + a.__animTimeline + ' block}');
          } else if (scopes.indexOf(a.__animTimeline) < 0) scopes.push(a.__animTimeline);
          tl.push(a.__animTimeline);
        }
        rs.push(rec.range[0].css); re.push(rec.range[1].css);
        rec.path = 'css';
      });
      /* `animation` shorthand resets animation-timeline:
         longhands only, timeline last. */
      var rule = gateSel(list[0]) + ' [data-anim-id="' + id + '"]{' +
        'animation-name:' + names.join(',') + ';animation-duration:' + names.map(function () { return '1ms'; }).join(',') +
        ';animation-timing-function:' + tf.join(',') + ';animation-fill-mode:' + fill.join(',') +
        ';animation-delay:0s;animation-iteration-count:1;animation-direction:normal' +
        ';animation-timeline:' + tl.join(',') + ';animation-range-start:' + rs.join(',') +
        ';animation-range-end:' + re.join(',') + (pdecl.length ? ';' + pdecl.join(';') : '') + '}';
      var mask = list[0].mask;
      css.push(mask ? '@media ' + mask.map(function (m) { return BP[m]; }).join(',') + '{' + rule + '}' : rule);
    });
    return props.join('\n') + '\n@supports (animation-timeline: view()){\n' +
      (scopes.length ? 'html{timeline-scope:' + scopes.join(',') + '}\n' : '') + css.join('\n') + '\n}';
  }

  /* ════════════════════ 6 · JS ENGINE ══════════════════════════════════════
     Layout-space metrics (offsetTop chain) so our own transforms
     never feed back; all reads in measure(), all writes in the draw phase. */
  function box(el) {
    if (!el) return { t: 0, b: 0, l: 0, r: 0, h: 0, w: 0 };
    if (el.offsetParent === undefined || el.offsetTop === undefined) {
      var R = el.getBoundingClientRect(), sy = global.scrollY, sx = global.scrollX;
      return { t: R.top + sy, b: R.bottom + sy, l: R.left + sx, r: R.right + sx, h: R.height, w: R.width };
    }
    var t = 0, l = 0;
    for (var x = el; x; x = x.offsetParent) { t += x.offsetTop; l += x.offsetLeft; }
    var h = el.offsetHeight, w = el.offsetWidth;
    return { t: t, b: t + h, l: l, r: l + w, h: h, w: w };
  }
  function ctxFor(rec, cache, vh, vw) {
    function elOf(ref) { return ref == null ? rec.el : rec.anchorEls[ref]; }
    return {
      vh: vh, vw: vw,
      box: function (ref) {
        var e = elOf(ref);
        if (ref != null && !e) throw new Error('anchor a' + ref + ' missing');
        var k = cache.get(e);
        if (!k) { k = box(e); cache.set(e, k); }
        return k;
      },
      css: function (name, ref) { return global.getComputedStyle(elOf(ref)).getPropertyValue(name); },
      prop: function (name, ref) { return elOf(ref)[name]; }
    };
  }
  function readCurrent(el, p) {
    var cs = global.getComputedStyle(el);
    if (p.kind === 'opacity') return +cs.opacity;
    if (p.kind === 'custom') return parseFloat(cs.getPropertyValue(p.name)) || 0;
    if (p.kind === 'dom') return el[p.name] || 0;
    if (p.kind === 'scale') return 1;
    if (p.kind === 'translate' || p.kind === 'rotate') return 0;
    if (p.kind === 'css') return parseFloat(cs[p.name]) || 0;
    return 0;
  }
  function htmlHas(c) { return global.document.documentElement.classList.contains(c); }
  function maskOK(rec) { return !rec.mask || rec.mask.some(function (m) { return mq(BP[m]).matches; }); }

  function measure() {
    var vh = state.tracker.clientHeight || global.innerHeight, vw = state.tracker.clientWidth || global.innerWidth;
    var cache = new Map();
    records.forEach(function (rec) {
      rec.enabled = !rec.disabledWhen.some(htmlHas) && maskOK(rec);
      if (!rec.enabled && rec.path === 'js') return;
      try {
        var ctx = ctxFor(rec, cache, vh, vw);
        rec.start = +expr(rec.startSrc, ctx);
        rec.end = +expr(rec.endSrc, ctx);
        if (!isFinite(rec.start) || !isFinite(rec.end)) throw new Error('start/end is not a number');
        rec.props.forEach(function (p) {
          if (p.kind === 'clip') {
            p.a = (p.from || p.to).map(function (x) { return +expr(x, ctx); });
            p.b = p.to.map(function (x) { return +expr(x, ctx); });
            return;
          }
          if (p.from == null && p.current == null) p.current = readCurrent(rec.el, p);
          p.a = p.from == null ? p.current : +expr(p.from, ctx);
          p.b = +expr(p.to, ctx);
        });
      } catch (e) {
        rec.enabled = false;
        warn(e.message + ' — keyframe on ' + describe(rec.el) + ' disabled');
      }
    });
    state.jsTweens.forEach(function (list) { list.sort(function (a, b) { return a.start - b.start; }); });
  }

  function localT(rec, y) {
    if (rec.end === rec.start) return y >= rec.start ? 1 : 0;
    var t = (y - rec.start) / (rec.end - rec.start);
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  function dispatch(rec, name, progress, dir) {
    var ev = new global.CustomEvent(name, { bubbles: true, detail: { progress: progress, direction: dir, keyframe: rec.json } });
    rec.el.dispatchEvent(ev);
    var j = rec.json, map = { ':enter': 'onEnter', ':exit': 'onExit', '': 'onEvent', ':reverse': 'onEventReverse' };
    var suffix = name.slice(String(j.event || '').length), fn = j[map[suffix]], once = j[map[suffix] + 'Once'];
    if (typeof fn === 'function') fn(ev);
    if (typeof once === 'function') { once(ev); j[map[suffix] + 'Once'] = null; }
  }

  function frame(now, snap) {
    var dt = Math.min(now - state.last, 100) / 1000;
    state.last = now;
    var y = global.scrollY, prevY = state.prevY == null ? y : state.prevY, busy = false;
    state.prevY = y;
    var dirn = y >= prevY ? 1 : -1;
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (!rec.enabled) continue;
      var raw = localT(rec, y);
      if (rec.hold) raw = Math.max(rec.lt, raw);
      rec.lt = raw;
      if (rec.json.event) {
        var ev = rec.json.event;
        if (rec.end === rec.start) {
          if (!snap && prevY < rec.start && y >= rec.start) dispatch(rec, ev, 1, 1);
          else if (!snap && y < rec.start && prevY >= rec.start) dispatch(rec, ev + ':reverse', 0, -1);
        } else {
          var ins = y >= rec.start && y <= rec.end;
          if (!snap && ins !== rec.inside) { rec.inside = ins; dispatch(rec, ev + (ins ? ':enter' : ':exit'), raw, dirn); }
        }
      }
      if (rec.kind === 'class') {
        var point = rec.end === rec.start, inside = point ? y >= rec.start : y >= rec.start && y <= rec.end;
        var want = rec.json.toggle ? inside : rec.on || y >= rec.start;
        if (want !== rec.on) {
          rec.on = want;
          if (rec.cssClass) rec.cssClass.forEach(function (c) { rec.el.classList.toggle(c, want); });
          var st = rec.json.style && rec.json.style[want ? 'on' : 'off'];
          if (st) Object.keys(st).forEach(function (k) { rec.el.style.setProperty(kebab(k), st[k]); });
          if (want && rec.onActivate) rec.onActivate(rec);
        }
        continue;
      }
      if (rec.path !== 'js' || (rec.kind !== 'tween' && rec.kind !== 'scrub')) continue;
      var eased = rec.easeFn(raw);
      if (snap || rec.cur == null || rec.lerp >= 1) rec.cur = eased;
      else {
        /* The usual approach lerps per FRAME (`current += (target − current)·ease`), so a
           120 Hz screen settles twice as fast; this is the dt-normalised form. */
        var a = 1 - Math.pow(1 - rec.lerp, dt * 60);
        rec.cur += (eased - rec.cur) * a;
        if (Math.abs(eased - rec.cur) < 1e-4) rec.cur = eased; else busy = true;
      }
      if (rec.kind === 'scrub') scrubWrite(rec);
    }
    state.jsTweens.forEach(function (list, el) { writeElement(el, list, y); });
    return busy;
  }
  function scrubWrite(rec) {
    var p = rec.cur, el = rec.el;
    if (p === rec.lastP) return;
    rec.lastP = p;
    el.style.setProperty('--scrub-progress', r4(p));
    if (el.tagName === 'VIDEO') {
      if (el.duration && isFinite(el.duration)) el.currentTime = Math.floor(el.duration * p * 100) / 100;
    } else {
      (el.__animScrub || []).forEach(function (fn) { fn(p); });
      el.dispatchEvent(new global.CustomEvent('anim:scrub', { detail: { progress: p } }));
    }
  }
  var f3 = function (v) { return Math.round(v * 1000) / 1000; };
  function writeElement(el, list, y) {
    var byProp = {};
    list.forEach(function (rec) {
      if (!rec.enabled || rec.path !== 'js' || rec.kind !== 'tween') return;
      rec.props.forEach(function (p) {
        var g = byProp[p.name];
        /* Governor: the last keyframe whose range has begun, else the first. */
        if (!g || y >= rec.start) byProp[p.name] = { rec: rec, p: p };
      });
    });
    var out = el.__animOut || (el.__animOut = {}), tr = null, sc = null, rot = null;
    function set(key, val) { if (out[key] !== val) { out[key] = val; if (key.charAt(0) === '-') el.style.setProperty(key, val); else el.style[key] = val; } }
    Object.keys(byProp).forEach(function (name) {
      var g = byProp[name], p = g.p, c = g.rec.cur;
      if (p.kind === 'clip') { set('clipPath', inset(p.a.map(function (a, i) { return a + (p.b[i] - a) * c; }), f3)); return; }
      var v = p.a + (p.b - p.a) * c;
      if (p.kind === 'translate') { tr = tr || { x: 0, y: 0, z: 0 }; tr[name] = v; }
      else if (p.kind === 'scale') { sc = sc || { s: 1, x: 1, y: 1 }; sc[name === 'scale' ? 's' : name === 'scaleX' ? 'x' : 'y'] = v; }
      else if (p.kind === 'rotate') rot = (name === 'rotationX' ? 'x ' : name === 'rotationY' ? 'y ' : '') + f3(v) + 'deg';
      else if (p.kind === 'opacity') set('opacity', String(r4(v)));
      else if (p.kind === 'custom') set(name, r4(v) + p.unit);
      else if (p.kind === 'dom') { if (el[name] !== v) el[name] = v; }
      else set(name, f3(v) + p.unit);
    });
    if (tr) set('translate', f3(tr.x) + 'px ' + f3(tr.y) + 'px' + (tr.z ? ' ' + f3(tr.z) + 'px' : ''));
    if (sc) set('scale', r4(sc.s * sc.x) + ' ' + r4(sc.s * sc.y));
    if (rot) set('rotate', rot);
  }
  function clearElement(el) {
    var out = el.__animOut;
    if (!out) return;
    Object.keys(out).forEach(function (k) { if (k.charAt(0) === '-') el.style.removeProperty(k); else el.style[k] = ''; });
    el.__animOut = null;
  }

  function loop(now) {
    state.raf = 0;
    if (!state.alive) return;
    if (frame(now)) kick(); else state.idle = true;
  }
  function kick() {
    if (state && state.alive && !state.raf) {
      /* Waking from idle: pretend the last frame was one frame ago, or the
         first lerp step after a pause jumps by the 100 ms cap. */
      if (state.idle) { state.idle = false; state.last = global.performance.now() - 1000 / 60; }
      state.raf = global.requestAnimationFrame(loop);
    }
  }

  /* ════════════════════ 7 · PRESETS ════════════════════════════════════════ */
  function jsonAttr(el, name) {
    var v = el.getAttribute(name);
    if (v && v.trim().charAt(0) === '{') { try { return JSON.parse(v); } catch (e) { warn('bad JSON in ' + name + ' on ' + describe(el)); } }
    return null;
  }
  function cssExpr(el, name, fallback) {
    var v = global.getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }
  function assign(a, b) { if (b) Object.keys(b).forEach(function (k) { a[k] = b[k]; }); return a; }
  function presets(el, add) {
    if (el.hasAttribute('data-reveal')) {
      var kind = el.getAttribute('data-reveal') || 'up';
      var items = kind === 'stagger' ? [].slice.call(el.querySelectorAll('[data-staggered-item]')) : [];
      if (kind === 'stagger' && !items.length) items = [].slice.call(el.children);
      items.forEach(function (it, i) { it.style.setProperty('--anim-i', i); it.setAttribute('data-reveal-item', ''); });
      add(el, { start: cssExpr(el, '--reveal-start', 't - 85vh'), cssClass: 'anim-in', disabledWhen: [NOENH], _preset: 'reveal' },
        function (rec) { rec.arm = true; });
    }
    if (el.hasAttribute('data-scene')) {
      add(el, assign({ start: 't', end: 'b - 100vh', '--progress': [0, 1], _preset: 'scene' }, jsonAttr(el, 'data-scene')));
    }
    if (el.hasAttribute('data-parallax')) {
      var pj = jsonAttr(el, 'data-parallax'), rate = pj ? (pj.rate != null ? pj.rate : 0.1) : parseFloat(el.getAttribute('data-parallax'));
      if (!isFinite(rate)) rate = 0.1;
      var k = r4(rate * 50);
      add(el, assign({ start: 't - 100vh', end: 'b', y: [-k + 'vh', k + 'vh'], _preset: 'parallax' }, pj && (delete pj.rate, pj)));
    }
    if (el.hasAttribute('data-clip-expand')) {
      add(el, assign({ start: 't - 70vh', end: 't', '--clip-path-progress': [1, 0], ease: 0.3, _preset: 'clip' },
        jsonAttr(el, 'data-clip-expand')));
    }
    if (el.hasAttribute('data-scrub')) {
      add(el, assign({ start: 't - 100vh', end: 'b', _scrub: 1, _preset: 'scrub' }, jsonAttr(el, 'data-scrub')));
    }
    if (el.hasAttribute('data-count')) {
      add(el, { start: cssExpr(el, '--reveal-start', 't - 85vh'), disabledWhen: [NOENH], _preset: 'count', cssClass: 'anim-counted' },
        function (rec) { rec.onActivate = countUp; });
    }
    if (el.hasAttribute('data-sweep')) {
      add(el, { start: 't - 80vh', cssClass: 'anim-in', disabledWhen: [NOENH], _preset: 'sweep' }, function (rec) { rec.arm = true; });
    }
  }

  /* COUNT-UP. Reuses FG3.rollNumber when the host page has it; otherwise its
     own: the authored text is the truth (no-JS shows it), numbers are
     re-formatted with the authored decimals and grouping, and a deadline
     writes the final text because rAF never fires in a hidden page. */
  function countUp(rec) {
    var el = rec.el, final = el.__animFinal || (el.__animFinal = el.textContent);
    var m = /-?[\d,]*\.?\d+/.exec(final);
    if (!m) return;
    var to = parseFloat(m[0].replace(/,/g, '')), dec = (m[0].split('.')[1] || '').length, group = m[0].indexOf(',') >= 0;
    var from = parseFloat(el.getAttribute('data-count-from') || '0'), dur = +(el.getAttribute('data-count-duration') || 1400);
    var fmt = function (v) {
      var s = v.toFixed(dec);
      if (group) { var parts = s.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = parts.join('.'); }
      return final.slice(0, m.index) + s + final.slice(m.index + m[0].length);
    };
    /* FG3.rollNumber (core): the first call sets, the next one rolls the digits
       on a spring; it keeps a screen-reader copy of the text itself. */
    if (global.FG3 && typeof global.FG3.rollNumber === 'function') {
      global.FG3.rollNumber(el, from, { format: fmt, animate: false });
      global.FG3.rollNumber(el, to, { format: fmt });
      return;
    }
    el.setAttribute('aria-label', final);
    var t0 = null, done = false, finish = function () { if (done) return; done = true; el.textContent = final; el.removeAttribute('aria-label'); };
    (function step(now) {
      if (done) return;
      if (t0 == null) t0 = now;
      var p = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(from + (to - from) * EASE.easeOutCubic(p));
      if (p < 1) global.requestAnimationFrame(step); else finish();
    })(global.performance.now());
    global.setTimeout(finish, dur + 150);
  }

  /* ════════════════════ 8 · MOUNT / REFRESH / DESTROY ══════════════════════ */
  var SEL = ATTRS.map(function (a) { return '[' + a + ']'; }).concat(
    ['[data-reveal]', '[data-scene]', '[data-parallax]', '[data-clip-expand]', '[data-scrub]', '[data-count]', '[data-sweep]']).join(',');

  function addRecord(el, json, src, after) {
    var rec = makeRecord(el, json, src);
    if (after) after(rec);
    records.push(rec);
    return rec;
  }
  function collect(root) {
    var els = [].slice.call(root.querySelectorAll(SEL));
    if (root.nodeType === 1 && root.matches(SEL)) els.unshift(root);
    var fresh = [];
    els.forEach(function (el) {
      if (el.__animMounted) return;
      el.__animMounted = true;
      ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var json;
        try { json = JSON.parse(el.getAttribute(a)); } catch (e) { warn('bad JSON in ' + a + ' on ' + describe(el)); return; }
        [].concat(json).forEach(function (j) { fresh.push(addRecord(el, j, a)); });
      });
      presets(el, function (target, json, after) { fresh.push(addRecord(target, json, 'preset', after)); });
    });
    return fresh;
  }

  function plan(fresh) {
    var canCSS = state.supports && !state.forceJS, byEl = new Map();
    fresh.forEach(function (rec) {
      if (rec.kind !== 'tween') return;
      if (!byEl.has(rec.el)) byEl.set(rec.el, []);
      byEl.get(rec.el).push(rec);
    });
    var toCompile = [];
    byEl.forEach(function (list, el) {
      var ok = canCSS && list.every(cssable), sig = null, comp = {};
      if (ok) list.forEach(function (rec) {
        var s = rec.disabledWhen.join() + '|' + (rec.mask || []).join();
        if (sig != null && s !== sig) ok = false;
        sig = s;
        /* x in one keyframe and y in another both need `translate`: one CSS
           property cannot take two independent animations. */
        rec.props.forEach(function (p) {
          if (p.kind !== 'translate' && p.kind !== 'scale') return;
          var names = rec.props.filter(function (q) { return q.kind === p.kind; }).map(function (q) { return q.name; }).sort().join();
          if (comp[p.kind] != null && comp[p.kind] !== names) ok = false;
          comp[p.kind] = names;
        });
      });
      if (ok) toCompile.push(list);
      else list.forEach(function (rec) {
        rec.path = 'js';
        if (!state.jsTweens.has(el)) state.jsTweens.set(el, []);
        state.jsTweens.get(el).push(rec);
      });
    });
    return toCompile;
  }

  function applyArming() {
    records.forEach(function (rec) {
      if (!rec.arm) return;
      rec.el.classList.toggle('anim-armed', rec.enabled);
      if (!rec.enabled) rec.el.classList.remove('anim-in');
    });
  }

  function onGate() {
    if (!state || !state.alive) return;
    measure();
    applyArming();
    records.forEach(function (rec) { if (!rec.enabled && rec.path === 'js') { rec.cur = null; } });
    state.jsTweens.forEach(function (list, el) { if (!list.some(function (r) { return r.enabled; })) clearElement(el); });
    frame(global.performance.now(), true);
  }

  function refresh() {
    if (!state || !state.alive) return;
    measure();
    frame(global.performance.now(), true);
  }

  function mount(root) {
    var d = global.document;
    if (!d) return null;
    root = root || d;
    if (!state) {
      state = { alive: true, raf: 0, idle: true, last: global.performance.now(), prevY: null, jsTweens: new Map(), css: [], listeners: [] };
      var tr = d.createElement('div');
      tr.setAttribute('aria-hidden', 'true');
      tr.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;visibility:hidden;pointer-events:none;z-index:-1';
      (d.body || d.documentElement).appendChild(tr);
      state.tracker = tr;
      state.supports = !!(global.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()'));
      state.forceJS = api.forceJS || /[?&]anim=js\b/.test((global.location && global.location.search) || '');
      gate();
      wire();
    }
    var fresh = collect(root);
    measure();
    var toCompile = plan(fresh);
    if (toCompile.length) {
      state.css.push(compile(toCompile));
      var st = d.getElementById('anim-compiled');
      if (!st) { st = d.createElement('style'); st.id = 'anim-compiled'; }
      (d.body || d.documentElement).appendChild(st);     /* last in the cascade */
      st.textContent = state.css.join('\n');
    }
    applyArming();
    /* One forced style flush so content already past its trigger at load
       still animates in (armed → in is a transition, not a jump). */
    if (d.body) void d.body.offsetWidth;
    frame(global.performance.now(), true);
    /* Point events are crossings, so nothing fires at mount; ranges already
       entered report :enter after the caller has had a chance to listen. */
    global.setTimeout(function () { if (state && state.alive) { state.prevY = global.scrollY; frame(global.performance.now(), false); } }, 0);
    return stats();
  }

  function wire() {
    var d = global.document, t = 0;
    function on(target, type, fn, opt) { target.addEventListener(type, fn, opt); state.listeners.push(function () { target.removeEventListener(type, fn, opt); }); }
    var deb = function () { clearTimeout(t); t = setTimeout(refresh, 120); };
    on(global, 'scroll', kick, { passive: true });
    on(global, 'resize', deb);
    on(d, 'focusin', function (e) {
      var r = e.target.closest && e.target.closest('.anim-armed:not(.anim-in)');
      if (r) r.classList.add('anim-in');            /* never hide focused content */
    });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { refresh(); });
    if (global.ResizeObserver && d.body) { var ro = new ResizeObserver(deb); ro.observe(d.body); state.listeners.push(function () { ro.disconnect(); }); }
    var queries = ['(prefers-reduced-motion: reduce)'].concat(VIEWPORT_BAD);
    queries.forEach(function (q) {
      var m = mq(q);
      if (m.addEventListener) on(m, 'change', function () { if (gateState.owned) { gate(true); } });
    });
    if (global.MutationObserver) {
      /* React only to classes some keyframe is gated on (tone flips etc. are
         none of our business). */
      var sig = function () {
        var watch = {}; watch[ENH] = watch[NOENH] = 1;
        records.forEach(function (r) { r.disabledWhen.forEach(function (c) { watch[c] = 1; }); });
        return Object.keys(watch).filter(htmlHas).join(' ');
      }, was = sig();
      var mo = new MutationObserver(function () {
        var now = sig();
        if (now !== was) {
          was = now; gateState.enhanced = htmlHas(ENH);
          gateState.cause = d.documentElement.dataset.fdCause || (gateState.enhanced ? 'none' : 'external');
          if (!gateState.owned && gateState.enhanced) gateState.cause = 'none';
          onGate();
        }
      });
      mo.observe(d.documentElement, { attributes: true, attributeFilter: ['class'] });
      state.listeners.push(function () { mo.disconnect(); });
    }
  }

  function destroy() {
    if (!state) return;
    state.alive = false;
    if (state.raf) global.cancelAnimationFrame(state.raf);
    state.listeners.forEach(function (f) { f(); });
    state.jsTweens.forEach(function (list, el) { clearElement(el); });
    records.forEach(function (rec) {
      if (rec.cssClass && rec.on) rec.cssClass.forEach(function (c) { rec.el.classList.remove(c); });
      rec.el.classList.remove('anim-armed');
      if (rec.el.__animFinal != null) { rec.el.textContent = rec.el.__animFinal; rec.el.__animFinal = null; }
      rec.el.removeAttribute('data-anim-id');
      rec.el.__animMounted = false;
      rec.anchorEls.forEach(function (a) { if (a) { a.__animTimeline = null; a.removeAttribute('data-anim-id'); } });
    });
    var st = global.document.getElementById('anim-compiled');
    if (st) st.remove();
    state.tracker.remove();
    if (gateState.owned) {
      var cl = global.document.documentElement.classList;
      cl.remove(ENH, NOENH, 'fd-text-zoom');
      delete global.document.documentElement.dataset.fdCause;
    }
    gateState = { enhanced: false, cause: 'unmounted', owned: false };
    records = []; state = null;
  }

  function stats() {
    var s = { records: records.length, css: 0, js: 0, classes: 0, events: 0, scrub: 0, disabled: 0,
              path: state ? (state.supports && !state.forceJS ? 'css' : 'js') : null, enhanced: gateState.enhanced, cause: gateState.cause };
    records.forEach(function (r) {
      if (!r.enabled && r.path === 'js') s.disabled++;
      if (r.kind === 'tween') s[r.path]++; else if (r.kind === 'class') s.classes++; else if (r.kind === 'scrub') s.scrub++; else s.events++;
    });
    return s;
  }
  function inspect(el) {
    return records.filter(function (r) { return r.el === el; }).map(function (r) {
      return { kind: r.kind, path: r.path, enabled: r.enabled, start: r.start, end: r.end,
               startSrc: String(r.startSrc), endSrc: String(r.endSrc), progress: r.cur,
               lt: r.lt, on: r.on, src: r.src, preset: r.json._preset || null, ease: r.easeName, lerp: r.lerp,
               hold: r.hold, range: r.range ? [r.range[0].css, r.range[1].css] : null,
               props: r.props.map(function (p) { return { name: p.name, kind: p.kind, a: p.a, b: p.b, unit: p.unit }; }) };
    });
  }

  var api = {
    mount: mount, refresh: refresh, destroy: destroy, gate: gate, stats: stats, inspect: inspect,
    addKeyframe: function (el, json) {
      var rec = addRecord(el, json, 'api');
      if (!state) return { remove: function () {} };
      if (rec.kind === 'tween') {
        rec.path = 'js';
        if (!state.jsTweens.has(el)) state.jsTweens.set(el, []);
        state.jsTweens.get(el).push(rec);
      }
      measure(); frame(global.performance.now(), true);
      return {
        record: rec,
        remove: function () {
          records.splice(records.indexOf(rec), 1);
          var l = state && state.jsTweens.get(el);
          if (l) { l.splice(l.indexOf(rec), 1); if (!l.length) { clearElement(el); state.jsTweens.delete(el); } }
        }
      };
    },
    onScrub: function (el, fn) { (el.__animScrub = el.__animScrub || []).push(fn); },
    expr: expr, parse: parse, evaluate: evaluate, linearize: linearize, rangeOf: rangeOf,
    ease: ease, cssEasing: cssEasing, bezier: bezier, EASE: EASE, BREAKPOINTS: BP,
    forceJS: false,
    get path() { return state ? (state.supports && !state.forceJS ? 'css' : 'js') : null; },
    get enhanced() { return gateState.enhanced; }
  };
  api.addEvent = api.addKeyframe;
  global.ANIM = api;
})(typeof window !== 'undefined' ? window : globalThis);
