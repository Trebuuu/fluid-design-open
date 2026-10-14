/* ═══════════════════════════════════════════════════════════════════════════
   chart.js → CHART — DATA DISPLAY (Fluid Design Open)
   ───────────────────────────────────────────────────────────────────────────
   Four primitives, plus the three a dashboard screen needs:

     sparkline  where is it now          bars   how do these compare (from zero)
     series     what happened over time  ring   how much of the whole
     rings      several proportions at once — the activity rings: one ring
                per capped action, each springing to its new value
     dial       a day on a 24-hour clock: segments by kind, a now-hand; it draws
                in clockwise from the now-hand
     strip      one mark per event: height = asked, fill = landed, an OUTLINE
                when nothing landed (an empty batch is the day's largest cost,
                never a short bar), dashed when the run timed out

   CHARTS ARE CONTENT: opaque, never on glass. A chart inside [data-lg3]/.lg3
   is marked [data-chart-refused] and fg3-chart.css says so in place — unless
   an opaque surface (.card, .list-inset, [data-surface]) sits between it and
   the glass, or the glass is a .sheet at [data-detent="large"].
   SVG, not canvas: it scales, inherits the tokens, and carries a <title>.
   Colour is a role: marks use currentColor (the host's --accent by default),
   rings take --series-N, dial kinds and strip states are classes.

   PUBLIC API (window.CHART) — nothing mounts itself; FG3.boot() calls mount().
     mount(root=document)          draw every [data-chart]:not([data-chart-drawn]); rings,
                                   dial and strip draw at once but hold their entrance
                                   until first seen (FG3.whenSeen) — see "entrance"
     draw(host, values?, opts?)    by data-chart kind; remembers values for resize
     sparkline(h, v, o) · bars(h, v, {min,max,gap,highlight}) · series(h, v, {format,idle})
     ring(h, value, {max,text,label:false})
     rings(h, [{value,max,label,color:'series-2',state:'cooling'|'restricted'}], {center, width})
                                   the stroke (and far past it the gap) narrows past five
                                   rings so the innermost radius stays positive
     dial(h, [{from,to,kind,label}], {now:'14:30'|14.5, animate, format})   times: hours or
                                   "HH:MM"; same-kind spans that touch are one mark, and
                                   format(s, i) gets it with s.n (how many) and s.items
     strip(h, [{asked,landed,people?,empty?,arrived?,at,label}], {format, idle})
   MARKUP  data-chart="kind" · data-values (CSV or JSON) · data-label (a11y override) ·
     data-value/data-max (ring) · data-now (dial) · data-area (sparkline) · data-center (rings) ·
     data-chart-static (a picture only: never a tab stop — also automatic inside a[href],
     button, [aria-hidden=true] or [inert], and an author's own tabindex is kept)
     A sibling [data-chart-out] receives the readout; [data-chart-legend] the rings legend.
   WRITES  data-chart-drawn · data-reading · data-chart-index · data-chart-missing ·
     data-chart-refused · data-chart-settled (rings/dial, when motion has landed) ·
     data-chart-held (mounted, entrance waiting to be seen; geometry already final)
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var uid = 0;

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
    return n;
  }
  function reduced() { return !!(global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function values(host, given) {
    if (given) return given.slice();
    var raw = (host.getAttribute('data-values') || '').trim();
    if (!raw) return [];
    if (raw[0] === '[') { try { return JSON.parse(raw); } catch (e) { return []; } }
    return raw.split(/[,\s]+/).filter(Boolean).map(Number);
  }
  function extent(v, opts) {
    opts = opts || {};
    var lo = opts.min != null ? opts.min : Math.min.apply(null, v);
    var hi = opts.max != null ? opts.max : Math.max.apply(null, v);
    /* A flat series has zero range; dividing by it draws NaN — nothing. */
    if (hi === lo) { hi = lo + 1; lo = lo - 1; }
    var pad = (hi - lo) * (opts.pad == null ? 0.08 : opts.pad);
    return { lo: lo - pad, hi: hi + pad };
  }
  function path(v, w, h, ext, close) {
    if (v.length < 2) return '';
    var dx = w / (v.length - 1), d = '';
    v.forEach(function (n, i) {
      d += (i ? 'L' : 'M') + (i * dx).toFixed(2) + ' ' + (h - ((n - ext.lo) / (ext.hi - ext.lo)) * h).toFixed(2);
    });
    if (close) d += 'L' + w.toFixed(2) + ' ' + h + 'L0 ' + h + 'Z';
    return d;
  }
  function title(svg, text) {
    var t = el('title'); t.textContent = text;
    svg.setAttribute('role', 'img');
    svg.insertBefore(t, svg.firstChild);
  }
  function describe(svg, host, v, kind) {
    var given = host.getAttribute('data-label');
    if (given) return title(svg, given);
    if (!v.length) return title(svg, kind + ', no data');
    var first = v[0], last = v[v.length - 1];
    title(svg, kind + ', ' + v.length + ' points, ' + (last > first ? 'rising' : last < first ? 'falling' : 'flat') +
      ' from ' + first + ' to ' + last + ' (low ' + Math.min.apply(null, v) + ', high ' + Math.max.apply(null, v) + ')');
  }
  /* Listeners are recorded on the host and dropped on every redraw: a resize
     redraws the same host, and a second keydown handler would step twice. */
  function on(host, type, fn) { (host.__chartL = host.__chartL || []).push([type, fn]); host.addEventListener(type, fn); }
  function off(host) { (host.__chartL || []).forEach(function (l) { host.removeEventListener(l[0], l[1]); }); host.__chartL = []; }
  /* Glass refusal, in JS too, so a test (and the console) can see it. The
     NEAREST of glass and an opaque surface decides: a .card / .list-inset /
     [data-surface] between the chart and the glass is the chart's ground, so
     that chart is content on content, not on glass. A sheet is glass only
     below its large detent, which changes after drawing, so a chart whose
     nearest glass is a .sheet is left to fg3-chart.css, which keys on the
     live [data-detent="large"]. A redraw re-decides (the mark is removed). */
  var GLASS = '[data-lg3],.lg3', OPAQUE = '.card,.list-inset,[data-surface]';
  function refuse(host) {
    var refused = false;
    if (host.closest && host.closest('[data-lg3],.lg3')) {
      for (var n = host; n && n.nodeType === 1; n = n.parentElement) {
        if (n.matches(GLASS)) { refused = !n.classList.contains('sheet'); break; }
        if (n.matches(OPAQUE)) break;
      }
    }
    if (!refused) { host.removeAttribute('data-chart-refused'); return; }
    if (!host.hasAttribute('data-chart-refused') && global.console) console.warn('chart on glass refused — a chart is content', host);
    host.setAttribute('data-chart-refused', '');
  }
  /* A stretched viewBox stretches corner radii, so aspect-kept kinds measure
     the host. Marking the host drawn HERE (not in draw) means a direct
     primitive call is not undone by a later mount(). */
  function frame(host, w, h, keepAspect) {
    host.textContent = ''; off(host);
    refuse(host);
    if (keepAspect) {
      var r = host.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) { w = Math.round(r.width); h = Math.round(r.height); }
    }
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: keepAspect ? 'xMidYMid meet' : 'none', class: 'chart-svg' });
    host.appendChild(svg);
    host.setAttribute('data-chart-drawn', '');
    return { svg: svg, w: w, h: h };
  }
  function outEl(host) { return host.parentElement && host.parentElement.querySelector('[data-chart-out]'); }

  /* ── 1 · SPARKLINE ─────────────────────────────────────────────────────── */
  function sparkline(host, v, opts) {
    opts = opts || {}; v = values(host, v);
    /* Aspect kept: in a stretched box the end dot drew as a 3.8:1 ellipse at
       383x28 (Chromium has no vector-effect: non-scaling-size). */
    var f = frame(host, 100, 28, true), svg = f.svg, w = f.w, h = f.h;
    watch(host, v, opts);
    if (v.length < 2) return describe(svg, host, v, 'sparkline');
    var ext = extent(v, opts);
    /* No area by default: at 28px an area reads as a highlighted band. */
    if (opts.area === true || host.hasAttribute('data-area')) svg.appendChild(el('path', { d: path(v, w, h, ext, true), class: 'ch-area' }));
    svg.appendChild(el('path', { d: path(v, w, h, ext), class: 'ch-line' }));
    svg.appendChild(el('circle', { cx: w, cy: (h - ((v[v.length - 1] - ext.lo) / (ext.hi - ext.lo)) * h).toFixed(2), r: 2.6, class: 'ch-end' }));
    describe(svg, host, v, 'sparkline');
  }

  /* ── 2 · BARS — read from ZERO unless the caller insists ──────────────── */
  function bars(host, v, opts) {
    opts = opts || {}; v = values(host, v);
    var f = frame(host, 100, 40, true), svg = f.svg, w = f.w, h = f.h;
    watch(host, v, opts);
    if (!v.length) return describe(svg, host, v, 'bar chart');
    var ext = extent(v, { min: opts.min == null ? 0 : opts.min, max: opts.max, pad: 0.04 });
    /* Headroom goes on TOP only. padding both ends would put 'zero' 4% of
       the range below the axis, and a 9 beside a 331 would draw 2.4x too tall. */
    ext.lo = opts.min == null ? 0 : opts.min;
    var gap = opts.gap == null ? 0.26 : opts.gap, step = w / v.length, bw = step * (1 - gap);
    v.forEach(function (n, i) {
      var bh = ((n - ext.lo) / (ext.hi - ext.lo)) * h;
      svg.appendChild(el('rect', { x: (i * step + (step - bw) / 2).toFixed(2), y: (h - bh).toFixed(2),
        width: bw.toFixed(2), height: Math.max(bh, 0.6).toFixed(2), rx: Math.min(bw / 2, 4).toFixed(2),
        class: 'ch-bar' + (opts.highlight === i ? ' is-on' : '') }));
    });
    describe(svg, host, v, 'bar chart');
  }

  /* ── shared readout: pointer, focus and arrow keys drive ONE index ───────
     The chart becomes a tab stop only where one can exist: not inside a link
     or a button (a nested stop), not in hidden or inert content, not when the
     author said data-chart-static or set a tabindex of their own (a redraw
     on resize used to reset an author's -1 to 0). */
  var QUIET = 'a[href],button,[aria-hidden="true"],[inert]';
  function readout(host, n, at, clear) {
    if (!host.hasAttribute('tabindex') && !host.hasAttribute('data-chart-static') && !host.closest(QUIET)) host.tabIndex = 0;
    on(host, 'keydown', function (e) {
      var k = e.key, back = k === 'ArrowLeft' || k === 'ArrowUp' || k === 'End';
      /* No reading yet: Left starts at the newest, Right at the oldest. */
      var i = host.dataset.chartIndex != null ? +host.dataset.chartIndex : back ? n : -1;
      var to = k === 'ArrowRight' || k === 'ArrowDown' ? i + 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? i - 1
             : k === 'Home' ? 0 : k === 'End' ? n - 1 : null;
      if (to == null) return;
      e.preventDefault(); at(Math.max(0, Math.min(n - 1, to)));
    });
    on(host, 'focus', function () { at(host.dataset.chartIndex != null ? +host.dataset.chartIndex : n - 1); });
    on(host, 'blur', clear);
    on(host, 'pointerleave', function () { if (document.activeElement !== host) clear(); });
  }

  /* ── 3 · SERIES ────────────────────────────────────────────────────────── */
  function series(host, v, opts) {
    opts = opts || {}; v = values(host, v);
    /* Aspect kept, as the sparkline: stretched, the reading dot was 12x6 at 564x118. */
    var f = frame(host, 300, 120, true), svg = f.svg, w = f.w, h = f.h;
    watch(host, v, opts);
    if (v.length < 2) return describe(svg, host, v, 'chart');
    var ext = extent(v, opts), grid = el('g', { class: 'ch-grid' });
    for (var i = 0; i <= 3; i++) grid.appendChild(el('line', { x1: 0, y1: (h / 3) * i, x2: w, y2: (h / 3) * i }));
    svg.appendChild(grid);
    if (opts.area !== false) svg.appendChild(el('path', { d: path(v, w, h, ext, true), class: 'ch-area' }));
    svg.appendChild(el('path', { d: path(v, w, h, ext), class: 'ch-line' }));
    /* Label the point being asked about; the rest stays quiet. */
    var rule = el('line', { class: 'ch-rule', x1: 0, y1: 0, x2: 0, y2: h }), dot = el('circle', { class: 'ch-cursor', r: 3.2 });
    svg.appendChild(rule); svg.appendChild(dot);
    var out = outEl(host);
    function at(index) {
      var x = (w / (v.length - 1)) * index, y = h - ((v[index] - ext.lo) / (ext.hi - ext.lo)) * h;
      rule.setAttribute('x1', x); rule.setAttribute('x2', x); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      host.setAttribute('data-reading', ''); host.dataset.chartIndex = index;
      if (out) out.textContent = opts.format ? opts.format(v[index], index) : v[index];
    }
    function clear() { host.removeAttribute('data-reading'); if (out) out.textContent = opts.idle || ''; }
    on(host, 'pointermove', function (e) {
      var r = host.getBoundingClientRect();
      at(Math.max(0, Math.min(v.length - 1, Math.round(((e.clientX - r.left) / r.width) * (v.length - 1)))));
    });
    readout(host, v.length, at, clear);
    clear();
    describe(svg, host, v, 'chart');
  }

  /* ── arcs from twelve o'clock, clockwise (a ring starting at three reads as
     a pie with a bite out of it) ─────────────────────────────────────────── */
  function pt(cx, cy, r, turn) {
    var a = turn * 2 * Math.PI - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arc(cx, cy, r, t0, t1) {
    var span = t1 - t0;
    if (span <= 0) return '';
    if (span >= 0.9999) {   /* a whole circle is two half arcs: one arc cannot close */
      var a = pt(cx, cy, r, t0), b = pt(cx, cy, r, t0 + 0.5);
      return 'M' + a[0].toFixed(3) + ' ' + a[1].toFixed(3) + 'A' + r + ' ' + r + ' 0 1 1 ' + b[0].toFixed(3) + ' ' + b[1].toFixed(3) +
             'A' + r + ' ' + r + ' 0 1 1 ' + a[0].toFixed(3) + ' ' + a[1].toFixed(3);
    }
    var p = pt(cx, cy, r, t0), q = pt(cx, cy, r, t1);
    return 'M' + p[0].toFixed(3) + ' ' + p[1].toFixed(3) + 'A' + r + ' ' + r + ' 0 ' + (span > 0.5 ? 1 : 0) + ' 1 ' + q[0].toFixed(3) + ' ' + q[1].toFixed(3);
  }
  function sector(cx, cy, r0, r1, t0, t1) {
    var a = pt(cx, cy, r1, t0), b = pt(cx, cy, r1, t1), c = pt(cx, cy, r0, t1), d = pt(cx, cy, r0, t0), big = t1 - t0 > 0.5 ? 1 : 0;
    return 'M' + a.map(f3).join(' ') + 'A' + r1 + ' ' + r1 + ' 0 ' + big + ' 1 ' + b.map(f3).join(' ') +
           'L' + c.map(f3).join(' ') + 'A' + r0 + ' ' + r0 + ' 0 ' + big + ' 0 ' + d.map(f3).join(' ') + 'Z';
  }
  function f3(n) { return n.toFixed(3); }

  /* ── 4 · RING ──────────────────────────────────────────────────────────── */
  function ring(host, value, opts) {
    opts = opts || {};
    var v = value != null ? value : parseFloat(host.getAttribute('data-value') || 0);
    var max = opts.max != null ? opts.max : parseFloat(host.getAttribute('data-max') || 1);
    var frac = Math.max(0, Math.min(1, max ? v / max : 0)), r = 42, c = 2 * Math.PI * r;
    host.textContent = ''; off(host); refuse(host);
    var svg = el('svg', { viewBox: '0 0 100 100', class: 'chart-svg' });
    svg.appendChild(el('circle', { cx: 50, cy: 50, r: r, class: 'ch-ring-track' }));
    var a = el('circle', { cx: 50, cy: 50, r: r, class: 'ch-ring-fill', transform: 'rotate(-90 50 50)',
      'stroke-dasharray': c.toFixed(2), 'stroke-dashoffset': (c * (1 - frac)).toFixed(2) });
    svg.appendChild(a);
    title(svg, host.getAttribute('data-label') || (Math.round(frac * 100) + ' per cent'));
    host.appendChild(svg);
    host.setAttribute('data-chart-drawn', '');
    if (opts.label !== false) {
      var lab = document.createElement('span');
      lab.className = 'ch-ring-label'; lab.setAttribute('aria-hidden', 'true');
      lab.textContent = opts.text || (Math.round(frac * 100) + '%');
      host.appendChild(lab);
    }
  }

  /* ── spring driver: SPRING.Driven when the spring engine is loaded, a timed
     ease otherwise. A deadline lands the final value even where rAF never
     runs (a hidden page), because the number is the point. ── */
  function drive(from, to, onFrame, done, name) {
    var S = global.SPRING, finished = false, d = null;
    function land() { if (finished) return; finished = true; if (d) d.stop(); onFrame(to); if (done) done(); }
    if (reduced() || from === to) { land(); return { stop: function () {}, land: land }; }
    var ms = 900;
    if (S && S.Driven) {
      d = S.Driven(name || 'snappy', from, function (v, vel, rest) { if (!finished) { onFrame(v); if (rest) land(); } });
      ms = Math.round((d.spring.settlingDuration || 0.9) * 1000);
      d.to(to);
    } else {
      var t0 = performance.now(), step = function (now) {
        if (finished) return;
        var p = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - p, 3);
        onFrame(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(step); else land();
      };
      requestAnimationFrame(step);
      ms = 600;
    }
    var timer = setTimeout(land, ms + 150);
    return { stop: function () { finished = true; clearTimeout(timer); if (d) d.stop(); }, land: land };
  }

  /* ── 5 · RINGS ─────────────────────────────────────────────────────────── */
  function colourOf(c, i) {
    if (!c) return 'var(--series-' + (i + 1) + ')';
    if (/^--/.test(c)) return 'var(' + c + ')';
    if (/^[a-z][a-z0-9-]*$/.test(c)) return 'var(--' + c + ')';   /* a role name */
    return c;
  }
  function fracOf(r) { return r.value == null || !r.max ? 0 : Math.max(0, Math.min(2, r.value / r.max)); }
  var RINGS_HOLE = 3.5;                              /* viewBox units left open at the centre */
  function rings(host, list, opts) {
    opts = opts || {};
    list = values(host, list);
    host.__chartValues = list; host.__chartOpts = opts;
    var prev = host.__ringShown || [];               /* what is on screen now, for the spring */
    host.textContent = ''; off(host); refuse(host);
    var svg = el('svg', { viewBox: '0 0 100 100', class: 'chart-svg' });
    var n = list.length, w = opts.width || (n <= 3 ? 10.5 : 8), gap = n <= 3 ? 2.2 : 1.6;
    /* Every ring must fit between the rim and a small hole (RINGS_HOLE): at
       the default 8 wide, six rings drew the innermost at r = −2. Up to five
       the defaults fit unchanged; past that the stroke (and, far past it,
       the gap) shrink so the innermost radius stays positive. */
    var room = 50 - RINGS_HOLE;
    if (n > 1 && (n - 1) * gap > room / 2) gap = room / 2 / (n - 1);
    if (n && n * w + (n - 1) * gap > room) w = (room - (n - 1) * gap) / n;
    var arcs = [];
    list.forEach(function (r, i) {
      var rad = Math.max(0.5, 50 - w / 2 - i * (w + gap));
      var g = el('g', { class: 'ch-rings-ring' + (r.state ? ' is-' + r.state : '') + (r.value == null ? ' is-missing' : ''), style: 'color:' + colourOf(r.color, i) });
      g.appendChild(el('circle', { cx: 50, cy: 50, r: rad, class: 'ch-rings-track', 'stroke-width': w }));
      var p = el('path', { class: 'ch-rings-arc', 'stroke-width': w });
      var lap = el('path', { class: 'ch-rings-lap', 'stroke-width': w });
      g.appendChild(p); g.appendChild(lap);
      svg.appendChild(g);
      arcs.push({ p: p, lap: lap, rad: rad, over: fracOf(r) > 1 || prev[i] > 1 });   /* either end of the move past the cap */
    });
    title(svg, host.getAttribute('data-label') || 'Activity rings: ' + list.map(function (r) {
      return (r.label || 'ring') + ' ' + (r.value == null ? 'not measured' : r.value + ' of ' + r.max + ' (' + Math.round(fracOf(r) * 100) + '%)') +
        (r.state ? ', ' + r.state : '');
    }).join('; '));
    host.appendChild(svg);
    var center = opts.center != null ? opts.center : host.getAttribute('data-center');
    if (center) {
      var cEl = document.createElement('span');
      cEl.className = 'ch-rings-center'; cEl.setAttribute('aria-hidden', 'true'); cEl.textContent = center;
      host.appendChild(cEl);
    }
    host.setAttribute('data-chart-drawn', '');
    host.removeAttribute('data-chart-settled');
    function paint(i, f) {
      var a = arcs[i];
      a.p.setAttribute('d', f > 0.0005 ? arc(50, 50, a.rad, 0, Math.min(1, f)) : '');
      /* Past the cap, a second lap is drawn over the first; its leading
         end carries a shadow so the overlap reads. Only a VALUE past the cap
         is a lap: the spring's overshoot on a ring that moves at or under it
         (Follow 70/70, closed) drew a shadowed lap for ~25 frames, a false
         "over the cap" — and its drop-shadow's first paint compiled GPU
         programs mid-scroll (showcase bento: 103–206 ms, 54 ms without). */
      a.lap.setAttribute('d', a.over && f > 1.0005 ? arc(50, 50, a.rad, Math.max(0, f - 1 - 0.25), f - 1) : '');
    }
    (host.__ringDrivers || []).forEach(function (d) { d.stop(); });
    if (held(host, function () { rings(host, host.__chartValues, host.__chartOpts); })) {
      /* Final geometry now (a script or a test reads it); the arcs stay
         hidden until the chart is seen, then spring in from zero. */
      list.forEach(function (r, i) { paint(i, fracOf(r)); });
      host.__ringShown = []; host.__ringDrivers = [];
      legend(host, list);
      return;
    }
    var pending = list.length, shown = prev.slice();
    host.__ringShown = shown;
    host.__ringDrivers = list.map(function (r, i) {
      var from = prev[i] != null ? prev[i] : (opts.animateIn === false ? fracOf(r) : 0), to = fracOf(r);
      return drive(from, to, function (f) { shown[i] = f; paint(i, f); }, function () {
        if (--pending === 0) host.setAttribute('data-chart-settled', '');
      }, reduced() ? 'smooth' : 'snappy');
    });
    if (!list.length) host.setAttribute('data-chart-settled', '');
    legend(host, list);
  }
  function legend(host, list) {
    var leg = host.parentElement && host.parentElement.querySelector('[data-chart-legend]');
    if (leg) {
      leg.innerHTML = '';
      list.forEach(function (r, i) {
        var li = document.createElement('li');
        li.className = 'ch-legend-item' + (r.state ? ' is-' + r.state : '');
        li.style.color = colourOf(r.color, i);
        li.innerHTML = '<i aria-hidden="true"></i><span class="ch-legend-name"></span><span class="ch-legend-value"></span>';
        li.querySelector('.ch-legend-name').textContent = r.label || '';
        li.querySelector('.ch-legend-value').textContent = r.value == null ? '—' : r.value + '/' + r.max;
        leg.appendChild(li);
      });
    }
  }

  /* ── time parsing for the dial and the strip ─────────────────────────── */
  function hours(t) {
    if (typeof t === 'number') return t;
    var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(t || '').trim());
    return m ? +m[1] + m[2] / 60 + (m[3] ? m[3] / 3600 : 0) : NaN;
  }
  function hhmm(h) {
    var m = Math.round(h * 60) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  /* Same-kind neighbours that touch, or would overlap once drawn at the
     dial's minimum width, are ONE mark (n = how many, items = the spans): at
     24 hours to a turn a gap under a minute or two is not a gap anyone can
     see, only a hairline. */
  function mergeSpans(list, minH) {
    var out = [];
    list.forEach(function (s) {
      var p = out[out.length - 1];
      if (p && p.kind === s.kind && s.from <= Math.max(p.to, p.from + minH) + 1e-9) {
        p.to = Math.max(p.to, s.to); p.n++; p.items.push(s);
      } else out.push({ from: s.from, to: s.to, kind: s.kind, label: s.label, n: 1, items: [s] });
    });
    return out;
  }

  /* ── 6 · DIAL — a 24-hour day, midnight at the top, clockwise ─────────── */
  function dial(host, segs, opts) {
    opts = opts || {};
    var all = values(host, segs).map(function (s) {
      return { from: hours(s.from), to: hours(s.to), kind: s.kind || 'done', label: s.label || '' };
    }).filter(function (s) { return !isNaN(s.from) && !isNaN(s.to); }).sort(function (a, b) { return a.from - b.from; });
    host.__chartValues = all; host.__chartOpts = opts;
    var now = hours(opts.now != null ? opts.now : host.getAttribute('data-now'));
    host.textContent = ''; off(host); refuse(host);
    var id = 'ch-dial-' + (++uid);
    var svg = el('svg', { viewBox: '0 0 100 100', class: 'chart-svg' });
    var R1 = 44, R0 = 33, MIN = 1.2 / 360;          /* a 2-minute batch still shows */
    segs = mergeSpans(all, MIN * 24);
    var face = el('g', { class: 'ch-dial-face' });
    face.appendChild(el('circle', { cx: 50, cy: 50, r: (R0 + R1) / 2, class: 'ch-dial-track', 'stroke-width': R1 - R0 }));
    for (var hr = 0; hr < 24; hr++) {
      var major = hr % 6 === 0, a = pt(50, 50, R1 + 1.4, hr / 24), b = pt(50, 50, R1 + (major ? 4.6 : 3), hr / 24);
      face.appendChild(el('line', { x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]), class: 'ch-dial-tick' + (major ? ' is-major' : '') }));
      if (major) {
        var tp = pt(50, 50, R0 - 5.5, hr / 24);
        var tx = el('text', { x: f3(tp[0]), y: f3(tp[1]), class: 'ch-dial-hour', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
        tx.textContent = String(hr).padStart(2, '0');
        face.appendChild(tx);
      }
    }
    svg.appendChild(face);
    var clip = el('clipPath', { id: id }), clipPath = el('path', { d: '' });
    clip.appendChild(clipPath);
    var defs = el('defs'); defs.appendChild(clip); svg.appendChild(defs);
    var g = el('g', { class: 'ch-dial-segs' });
    /* The minimum width never paints over the next span: a short batch with
       its warm-up right behind it keeps its true end. */
    var spans = segs.map(function (s, i) {
      var t0 = s.from / 24, t1 = Math.max(s.to / 24, t0 + MIN), nx = segs[i + 1];
      if (nx && nx.from >= s.to) t1 = Math.min(t1, nx.from / 24);
      return [t0, t1];
    });
    var nodes = segs.map(function (s, i) {
      var p = el('path', { d: sector(50, 50, R0, R1, spans[i][0], spans[i][1]), class: 'ch-dial-seg k-' + s.kind, 'data-i': i });
      g.appendChild(p);
      return p;
    });
    /* Two spans that TOUCH keep a hairline of the surface between them, so
       back-to-back reads as two; nothing else is outlined (a surface stroke
       round every short span read as a barcode). The hairline is no wider
       than the shorter span can spare. */
    spans.forEach(function (sp, i) {
      var nx = spans[i + 1];
      if (!nx || nx[0] - sp[1] > 1e-6) return;
      var len = Math.min(sp[1] - sp[0], nx[1] - nx[0]) * Math.PI * (R0 + R1);
      var a = pt(50, 50, R0 - 0.1, nx[0]), b = pt(50, 50, R1 + 0.1, nx[0]);
      g.appendChild(el('line', { x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]), class: 'ch-dial-sep', 'stroke-width': f3(Math.min(0.35, 0.3 * len)) }));
    });
    svg.appendChild(g);
    var hand = null;
    if (!isNaN(now)) {
      var ht = pt(50, 50, R1 + 3.2, now / 24);
      hand = el('g', { class: 'ch-dial-hand' });
      hand.appendChild(el('line', { x1: 50, y1: 50, x2: f3(ht[0]), y2: f3(ht[1]) }));
      hand.appendChild(el('circle', { cx: 50, cy: 50, r: 2.2 }));
      svg.appendChild(hand);
    }
    var done = all.filter(function (s) { return s.kind === 'done' || s.kind === 'active'; }).reduce(function (a, s) { return a + (s.to - s.from); }, 0);
    var byKind = {};
    all.forEach(function (s) { byKind[s.kind] = (byKind[s.kind] || 0) + 1; });
    title(svg, host.getAttribute('data-label') || '24-hour timeline' + (isNaN(now) ? '' : ', now ' + hhmm(now)) + ': ' + all.length + ' segments (' +
      Object.keys(byKind).map(function (k) { return byKind[k] + ' ' + k; }).join(', ') + '), ' + Math.round(done * 60) + ' minutes done');
    host.appendChild(svg);
    host.setAttribute('data-chart-drawn', '');

    /* The readout: the segment under the pointer, or stepped by arrow keys. */
    var out = outEl(host);
    function at(i) {
      nodes.forEach(function (n, j) { n.classList.toggle('is-on', j === i); });
      host.setAttribute('data-reading', ''); host.dataset.chartIndex = i;
      var s = segs[i];
      if (out && s) out.textContent = opts.format ? opts.format(s, i) : hhmm(s.from) + '–' + hhmm(s.to) + ' · ' + s.kind + (s.label ? ' · ' + s.label : '') +
        (s.n > 1 ? ' · ' + s.n + ' back to back' : '');
    }
    function clear() { nodes.forEach(function (n) { n.classList.remove('is-on'); }); host.removeAttribute('data-reading'); if (out) out.textContent = opts.idle || ''; }
    on(host, 'pointermove', function (e) {
      var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 100 - 50, y = (e.clientY - r.top) / r.height * 100 - 50;
      var d = Math.hypot(x, y); if (d < R0 - 4 || d > R1 + 5) return;
      var t = ((Math.atan2(y, x) + Math.PI / 2) / (2 * Math.PI) + 1) % 1, h = t * 24, best = -1, bd = Infinity;
      segs.forEach(function (s, i) { var dd = h < s.from ? s.from - h : h > s.to ? h - s.to : 0; if (dd < bd) { bd = dd; best = i; } });
      if (best >= 0 && bd < 0.25) at(best);
    });
    if (segs.length) readout(host, segs.length, at, clear);
    clear();

    /* Draw in clockwise FROM THE NOW-HAND: a clip sector that sweeps a full
       turn starting at now, on a spring. Reduced motion: it is simply there. */
    host.removeAttribute('data-chart-settled');
    if (host.__dialDriver) host.__dialDriver.stop();
    if (opts.animate === false || isNaN(now)) { host.setAttribute('data-chart-settled', ''); return; }
    var start = now / 24;
    function sweep() {
      g.setAttribute('clip-path', 'url(#' + id + ')');
      host.__dialDriver = drive(0, 1, function (p) {
        if (p >= 0.9999) { g.removeAttribute('clip-path'); return; }
        clipPath.setAttribute('d', p > 0.0005 ? sector(50, 50, 0, 50, start, start + Math.min(p, 0.9999)) : 'M0 0Z');
      }, function () { g.removeAttribute('clip-path'); host.setAttribute('data-chart-settled', ''); }, 'settle');
    }
    /* Held (mounted off-screen): the segments are in place but hidden until
       the dial is seen, and then it sweeps. */
    if (!held(host, sweep)) sweep();
  }

  /* ── 7 · STRIP — one mark per event, oldest on the left ──────────────── */
  function strip(host, items, opts) {
    opts = opts || {};
    items = values(host, items);
    /* The entrance plays once: on the first draw, or on the draw that ends a
       hold (see held). A later redraw (a resize) must not replay it. */
    var first = !!host.__chartHold || (!host.hasAttribute('data-chart-drawn') && !host.__stripSeen);
    host.__stripSeen = true;
    var f = frame(host, 380, 58, true), svg = f.svg, w = f.w, h = f.h;
    watch(host, items, opts);
    if (!items.length) return title(svg, host.getAttribute('data-label') || 'event strip, no events');
    var top = 4, base = h - 1.5, H = base - top;
    var maxA = opts.max || Math.max.apply(null, items.map(function (x) { return x.asked || 0; })) || 1;
    var step = w / items.length, gap = Math.max(2, step * 0.22), bw = Math.max(1.5, step - gap), rx = Math.min(bw / 2, 2);
    svg.appendChild(el('line', { x1: 0, x2: w, y1: base + 0.75, y2: base + 0.75, class: 'ch-strip-base' }));
    var marks = items.map(function (it, i) {
      var x = i * step + (step - bw) / 2, ah = Math.max(3, (it.asked || 0) / maxA * H);
      var got = it.people != null ? it.people : (it.landed || 0);
      var empty = it.empty || !(it.landed > 0), lost = it.arrived === false;
      var g = el('g', { class: 'ch-strip-mark' + (empty ? ' is-empty' : '') + (lost ? ' is-lost' : '') + ((it.landed || 0) > (it.asked || 0) && it.people == null ? ' is-over' : ''), 'data-i': i });
      if (first && !reduced()) g.setAttribute('style', '--i:' + i);
      if (empty) {
        /* Inset by half the stroke so the outline sits inside the mark's box. */
        g.appendChild(el('rect', { x: (x + 0.6).toFixed(2), y: (base - ah + 0.6).toFixed(2), width: (bw - 1.2).toFixed(2), height: (ah - 1.2).toFixed(2),
          rx: rx, class: 'ch-strip-outline' }));
      } else {
        g.appendChild(el('rect', { x: x.toFixed(2), y: (base - ah).toFixed(2), width: bw.toFixed(2), height: ah.toFixed(2), rx: rx, class: 'ch-strip-asked' }));
        var fh = Math.max(1.5, Math.min(got, it.asked || got) / maxA * H);
        g.appendChild(el('rect', { x: x.toFixed(2), y: (base - fh).toFixed(2), width: bw.toFixed(2), height: fh.toFixed(2), rx: rx, class: 'ch-strip-landed' }));
      }
      svg.appendChild(g);
      return g;
    });
    if (first && !reduced()) { host.classList.add('ch-enter'); held(host, null); }
    else host.classList.remove('ch-enter');
    var nEmpty = items.filter(function (x) { return x.empty || !(x.landed > 0); }).length;
    var nLost = items.filter(function (x) { return x.arrived === false; }).length;
    var landed = items.reduce(function (a, x) { return a + (x.landed || 0); }, 0), asked = items.reduce(function (a, x) { return a + (x.asked || 0); }, 0);
    /* `asked` counts PEOPLE; `landed` counts actions when a row also carries
       `people` (a Like lands several posts per person). Sum like with like:
       '388 landed of 348 asked' mixed the two units. */
    var hasPeople = items.some(function (x) { return x.people != null; });
    var reached = items.reduce(function (a, x) { return a + (x.people != null ? x.people : 0); }, 0);
    title(svg, host.getAttribute('data-label') || 'Event strip: ' + items.length + ' events, ' + nEmpty + ' landed nothing' +
      (nLost ? ' (' + nLost + ' timed out)' : '') + '; ' + (hasPeople
        ? reached.toLocaleString('en') + ' of ' + asked.toLocaleString('en') + ' tasks reached, ' + landed.toLocaleString('en') + ' actions landed'
        : landed.toLocaleString('en') + ' landed of ' + asked.toLocaleString('en') + ' asked'));
    var out = outEl(host);
    function at(i) {
      marks.forEach(function (m, j) { m.classList.toggle('is-on', j === i); });
      host.setAttribute('data-reading', ''); host.dataset.chartIndex = i;
      var it = items[i];
      if (out) out.textContent = opts.format ? opts.format(it, i) : (it.at ? it.at + ' · ' : '') + 'asked ' + (it.asked || 0) + ', landed ' + (it.landed || 0) +
        (it.arrived === false ? ' · timed out' : (it.empty || !(it.landed > 0)) ? ' · came back empty' : '') + (it.label ? ' · ' + it.label : '');
    }
    function clear() { marks.forEach(function (m) { m.classList.remove('is-on'); }); host.removeAttribute('data-reading'); if (out) out.textContent = opts.idle || ''; }
    on(host, 'pointermove', function (e) {
      var r = svg.getBoundingClientRect(), i = Math.floor((e.clientX - r.left) / r.width * items.length);
      if (i >= 0 && i < items.length) at(i);
    });
    readout(host, items.length, at, clear);
    clear();
  }

  var KINDS = { sparkline: sparkline, bars: bars, series: series, ring: ring, rings: rings, dial: dial, strip: strip };

  function draw(host, v, opts) {
    var kind = host.getAttribute('data-chart') || 'sparkline';
    if (!KINDS[kind]) { host.setAttribute('data-chart-missing', ''); return; }
    host.__chartValues = v; host.__chartOpts = opts;
    KINDS[kind](host, v, opts);
  }

  /* Aspect-kept kinds (sparkline, series, bars, strip) letterbox on resize; redraw those only,
     debounced, from the values they REMEMBER (a direct primitive call has no
     data-values attribute to fall back on). */
  var ro = null, pending = null;
  function watch(host, v, opts) {
    if (v) host.__chartValues = v;
    if (opts) host.__chartOpts = opts;
    if (typeof ResizeObserver === 'undefined' || host.__chartWatched) return;
    host.__chartWatched = true;
    if (!ro) ro = new ResizeObserver(function (entries) {
      clearTimeout(pending);
      var els = entries.map(function (e) { return e.target; });
      pending = setTimeout(function () {
        els.forEach(function (h) {
          var r = h.getBoundingClientRect(), svg = h.querySelector('svg'), vb = svg && svg.viewBox.baseVal;
          if (vb && Math.round(r.width) === vb.width && Math.round(r.height) === vb.height) return;
          draw(h, h.__chartValues, h.__chartOpts);
        });
      }, 120);
    });
    ro.observe(host);
  }

  /* ── entrance on first sight ────────────────────────────────────────────
     mount() draws rings, dial and strip at once — geometry, title and readout
     are final, for scripts, tests and print — but HOLDS their entrance (the
     rings' spring, the dial's sweep, the strip's growth) behind
     [data-chart-held] until the chart is first seen (FG3.whenSeen: 30% in
     view, or at its deadline when the page never reports), so the motion is
     not spent off-screen. A direct CHART.rings/dial/strip call plays at once. */
  var ENTRANCE = { rings: 1, dial: 1, strip: 1 };
  function held(host, release) {
    if (!host.__chartHold) return false;
    host.setAttribute('data-chart-held', '');
    host.__chartRelease = release;
    return true;
  }
  function unhold(host) {
    if (!host.__chartHold) return;
    host.__chartHold = false;
    var go = host.__chartRelease;
    host.__chartRelease = null;
    host.removeAttribute('data-chart-held');
    if (go) go();
  }
  function whenSeen(el, fn) {
    if (global.FG3 && typeof FG3.whenSeen === 'function') return FG3.whenSeen(el, fn);
    if (!global.IntersectionObserver) { fn(); return; }
    /* FG3's rule without FG3: a dead observer (a hidden page never reports)
       releases at the deadline; a live one waits for 30% in view. */
    var alive = false, io = new IntersectionObserver(function (es) {
      alive = true;
      es.forEach(function (e) {
        var vh = (e.rootBounds && e.rootBounds.height) || global.innerHeight || 1;
        if (e.isIntersecting && (e.intersectionRatio >= 0.3 || e.intersectionRect.height >= 0.3 * vh)) { io.disconnect(); fn(); }
      });
    }, { threshold: [0, 0.1, 0.2, 0.3] });
    io.observe(el);
    setTimeout(function () { if (!alive) { io.disconnect(); fn(); } }, 1600);
  }

  /* A duo's inner display is also painted as a static snapshot on its folding
     half (DEVICE), and a snapshot never sees an entrance: charts there draw at
     once, as before, so the hand-over at the flat shows no replay. */
  var MIRRORED = '.device[data-device="duo"] .device__screen:not([data-screen="outer"])';
  function mount(root) {
    (root || document).querySelectorAll('[data-chart]:not([data-chart-drawn])').forEach(function (h) {
      var hold = ENTRANCE[h.getAttribute('data-chart')] && !reduced() && !h.closest(MIRRORED);
      if (hold) h.__chartHold = true;
      draw(h);
      if (hold) whenSeen(h, function () { unhold(h); });
    });
  }

  global.CHART = { mount: mount, draw: draw, sparkline: sparkline, bars: bars, series: series, ring: ring,
                   rings: rings, dial: dial, strip: strip, hours: hours };
})(window);
