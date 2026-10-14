/* ═══════════════════════════════════════════════════════════════════════════
   audit.js → AUDIT — the page audit engine (Fluid Design Open, instruments)
   ───────────────────────────────────────────────────────────────────────────
   Loaded by audit.html ONLY. Product pages never load it: it reaches INTO a
   same-origin frame and measures what that frame actually painted.

   TWO WALKS PER PAGE
   1 CONTRAST — every text node against the ground it really sits on. The
     ground is not "the nearest background-color": it is every layer the
     browser paints under that point, in paint order, composited bottom-up:
       · document.elementsFromPoint() gives the stack at a sample point
         (a style is injected into the frame for the walk so pointer-events:
         none layers — art canvases, scrims, glass tints — are hit-tested too)
       · background-color and gradient backgrounds — linear, radial, conic
         and their repeating forms — evaluated at the point with their
         background-size / -position / -repeat (a 1 px divider drawn as a
         gradient is a line, not a wash), masks the same way (a ring's
         radial mask leaves its centre clear), absolutely placed
         ::before/::after layers with their own masks, SVG fills
       · ART3 art: the canvas's own PIXELS under the text box (getImageData),
         with the canvas's opacity and any linear-gradient mask applied
       · glass: the ground under the host is sampled over the blur radius,
         averaged, and put through the host's backdrop-filter chain (blur,
         saturate, contrast, brightness …) — or, for LG3's refraction path
         (a url() filter), through LG3.material(host)'s measured colour
         transform. Refraction displaces pixels only at the rim, so it is
         ignored for text inside the host.
     Each text box is sampled at several points; the WORST ratio is the
     result (a flat ground stops after three points). A point where
     something opaque covers the text is skipped; text nobody sees (a closed
     <details>, .sr-only, opacity 0) is "not visible", not a pass — except a
     rolled number's .sr-only twin, whose digits are drawn from data-g
     (FG3.rollNumber) and have no text node: it is measured on the drawing
     (.fg3-roll-vis: its box, its colour, its size). What
     cannot be resolved is UNMEASURABLE with its reason (an image or video
     under the text, glass on glass, a transformed pseudo-element, a canvas
     that cannot be read) — never counted as a pass.
     CHECKED AGAINST THE SCREEN: tools/run-audit.mjs --verify exposes
     window.__auditVerify (a CDP binding); every failing box, and a sample
     of passes on art and glass, is then screenshotted and re-measured from
     its pixels. Disagreements are listed (small text in a scaled device
     screen reads low in pixels; a box half under an overlay differs).
     Inactive controls ([disabled], [aria-disabled=true], [inert]) are exempt
     (WCAG 1.4.3 names them) and counted apart. SPECIMENS are exempt too:
     anything a page marks [data-audit-exempt] / [data-specimen] (a specimen
     SHOWS a colour), and, with no marking needed, the specimen half of a
     .doc-dont (a "don't" fails on purpose). The don't's own words, its
     .doc-verdict and a caption (figcaption, .doc-specimen__label) outside
     its .doc-specimen, are prose a reader needs and stay gated. Specimens
     are still measured: those below threshold are reported apart
     (specimenFailures), never counted as failures.
     Thresholds (SPEC §9 + the colour module's contract): 4.5:1, or 3:1 for large text =
     ≥24px, or ≥19px at weight ≥600. (WCAG: 18.66px at 700.)
   2 KEYBOARD — positive tabindex · a :focus rule that removes the ring and
     puts nothing back · clickable (cursor:pointer) but not focusable (a
     root whose focusable descendant is a role=slider / role=button, a
     <button> or a range input is reached through it: a detent rail takes
     the pointer, its thumb the keys) ·
     focusable but invisible (opacity 0 with no :focus rule to bring it
     back) · focusable off-screen (outside the scrollable document, with no
     scroll container to bring it into view) · focusable inside
     aria-hidden="true".
     With tools/run-audit.mjs --rings, also THE RING ON THE SCREEN (7b):
     every control it reached is captured unfocused and focused, and a ring
     that is not drawn, or reads under 3:1 against the same pixels
     unfocused, is a keyboard finding for that tone.

   API (window.AUDIT)
     run(opts) → Promise<report>
       opts: { pages:[…] (default: tools/pages.json), width (px, default the
       window's), height, tones:['light','dark'], host: element for the frame,
       base: true (load pages with ?no-fd-enhanced: every reveal in its final
       state — what a reduced-motion reader sees), raw: false (show each page
       unscaled at 0,0 over everything: what a window screenshot sees; the
       runner's --verify uses it), onPage(r, i, n), onStatus(msg, i, n),
       settleMs: 500 }
     Each tone is set with the page's own FG3.setTone(), and the reader's
     stored choice (localStorage 'fg3-tone') is put back afterwards.
       report: { pages:[pageResult], totals, done:true, ms }
     pageList(url='tools/pages.json') → Promise<[{path, status}]>  (globs
       'dir/*.html' expand through a server folder listing when there is one)
     contrast(win, {tone}) → Promise<{checked, pass, failures[], worst,
       unmeasurable, reasons{}, exempt, specimens, specimenFailures[],
       hidden, onArt, onGlass, items}>   (exempt counts inactive controls
       and specimens; specimens = specimen texts measured; run()'s totals
       carry specimenFailures as a count)
     keyboard(win, stops?) → {checked, rules, findings[{kind, where, detail, text}]}
       (stops: an array it fills with the controls it reached)
     rings(win, shoot, stops, {tone}) → Promise<{checked, skipped, reasons{},
       findings[], worst}>  (shoot: the runner's __auditRing channel; run()
       walks it per tone when the binding exists, reports pr.rings[tone] and
       totals.ringChecked / ringSkipped, and adds its findings to the page's
       keyboard findings)
     ratio(rgbA, rgbB) · color(str) → [r,g,b,a] · gradientAt(str, w, h, x, y)
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var doc = global.document;
  var DOT = String.fromCharCode(183);

  /* ── 1 · COLOUR ─────────────────────────────────────────────────────────── */
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(rgb) { return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]); }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function over(fg, bg) {
    var a = fg[3] == null ? 1 : fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  }
  function hex(rgb) {
    return '#' + rgb.slice(0, 3).map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join('');
  }
  /* getComputedStyle does not always hand back rgb(): color-mix() computes
     to color(srgb …) or oklab(…), a declared oklch() stays oklch(). Reading
     those as an RGB triple is fiction, so anything that is not plain rgb()
     is painted into a 1×1 canvas and read back — exact for every form the
     engine can compute. An unparseable value is null, never a guess. */
  var cache = new Map(), px1 = null;
  function color(s) {
    s = String(s == null ? '' : s).trim();
    if (!s || s === 'none' || s === 'transparent') return s === 'transparent' ? [0, 0, 0, 0] : null;
    if (cache.has(s)) return cache.get(s);
    var out = null, m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (m) {
      var p = m[1].split(/[\s,\/]+/).filter(Boolean);
      if (p.length >= 3) out = [parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2]),
        p.length > 3 ? (p[3].slice(-1) === '%' ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1];
    }
    if (!out) {
      if (!px1) { var c = doc.createElement('canvas'); c.width = c.height = 1; px1 = c.getContext('2d', { willReadFrequently: true }); }
      px1.clearRect(0, 0, 1, 1);
      px1.fillStyle = '#010203';
      px1.fillStyle = s;
      if (px1.fillStyle !== '#010203' || /^#010203$/i.test(s)) {
        px1.fillRect(0, 0, 1, 1);
        var d = px1.getImageData(0, 0, 1, 1).data;
        out = [d[0], d[1], d[2], d[3] / 255];
        /* the canvas stores premultiplied, 8-bit: undo the premultiply */
        if (out[3] > 0 && out[3] < 1) {
          var a = alphaOf(s);
          if (a != null) out[3] = a;
        }
      }
    }
    cache.set(s, out);
    return out;
  }
  function alphaOf(s) {
    var m = /\/\s*([\d.]+%?)\s*\)\s*$/.exec(s);
    if (!m) return null;
    return m[1].slice(-1) === '%' ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  }

  /* ── 2 · GRADIENTS (backgrounds, masks, text fills) ─────────────────────── */
  function splitTop(s, sep) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(') depth++; else if (c === ')') depth--;
      if (c === sep && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  /* A length inside a gradient ("40%", "22px", "calc(100% - 22px)") along a
     line of length L, resolved by the browser itself so calc() is exact. */
  var probeHost = null;
  function lengthAlong(v, L) {
    v = String(v).trim();
    if (/^-?[\d.]+%$/.test(v)) return parseFloat(v) / 100 * L;
    if (/^-?[\d.]+px$/.test(v)) return parseFloat(v);
    if (/^-?[\d.]+$/.test(v)) return parseFloat(v);
    if (!probeHost) {
      probeHost = doc.createElement('div');
      probeHost.style.cssText = 'position:absolute;left:-99999px;top:0;height:0;visibility:hidden;contain:strict';
      probeHost.appendChild(doc.createElement('div'));
      doc.body.appendChild(probeHost);
    }
    probeHost.style.width = L + 'px';
    var p = probeHost.firstChild;
    p.style.marginLeft = '0';
    p.style.marginLeft = v;
    var got = parseFloat(getComputedStyle(p).marginLeft);
    return isFinite(got) ? got : null;
  }
  function angleOf(dir, w, h) {
    dir = dir.trim();
    var m = /^(-?[\d.]+)(deg|turn|rad|grad)$/.exec(dir);
    if (m) {
      var v = parseFloat(m[1]);
      return m[2] === 'deg' ? v : m[2] === 'turn' ? v * 360 : m[2] === 'rad' ? v * 180 / Math.PI : v * 0.9;
    }
    var t = dir.replace(/^to\s+/, '').split(/\s+/).sort().join(' ');
    var corner = Math.atan2(h, w) * 180 / Math.PI;
    var map = { top: 0, right: 90, bottom: 180, left: 270,
      'right top': corner, 'bottom right': 180 - corner, 'bottom left': 180 + corner, 'left top': 360 - corner };
    return map[t] != null ? map[t] : null;
  }
  /* Parse a computed linear-, radial- or conic-gradient() (and repeating-*)
     into {kind, stops:[{c,pos}], …}: stop positions in px along the gradient
     line (linear), the horizontal ray (radial) or in degrees (conic). A
     gradient this cannot read comes back null and the caller says so. */
  function readStops(args, L, unitDeg) {
    var stops = [];
    for (var i = 0; i < args.length; i++) {
      var part = args[i], k = 0, depth = 0;
      /* the colour is the first token (balanced parens), positions follow */
      for (; k < part.length; k++) {
        if (part[k] === '(') depth++; else if (part[k] === ')') depth--;
        else if (part[k] === ' ' && depth === 0) break;
      }
      var cstr = part.slice(0, k), rest = part.slice(k).trim();
      var col = color(cstr);
      if (!col) {
        if (/^-?[\d.]/.test(cstr) || /^calc/.test(cstr)) continue;    /* an interpolation hint */
        return null;
      }
      var poss = rest ? splitTop(rest.replace(/\s+(?![^(]*\))/g, '\u0001'), '\u0001') : [];
      if (!poss.length) stops.push({ c: col, pos: null });
      for (var q = 0; q < poss.length; q++) {
        var p = poss[q], v;
        if (unitDeg) {
          var m = /^(-?[\d.]+)(deg|turn|rad|grad|%)?$/.exec(p);
          if (!m) return null;
          v = parseFloat(m[1]);
          v = m[2] === '%' ? v * 3.6 : m[2] === 'turn' ? v * 360 : m[2] === 'rad' ? v * 180 / Math.PI : m[2] === 'grad' ? v * 0.9 : v;
        } else v = lengthAlong(p, L);
        if (v == null) return null;
        stops.push({ c: col, pos: v });
      }
    }
    if (stops.length < 2) return null;
    /* CSS fix-up: first 0, last L, monotone, gaps spread evenly */
    if (stops[0].pos == null) stops[0].pos = 0;
    if (stops[stops.length - 1].pos == null) stops[stops.length - 1].pos = L;
    for (var j = 1; j < stops.length; j++) if (stops[j].pos != null && stops[j].pos < stops[j - 1].pos) stops[j].pos = stops[j - 1].pos;
    for (j = 1; j < stops.length; j++) {
      if (stops[j].pos != null) continue;
      var e = j; while (stops[e].pos == null) e++;
      var a0 = stops[j - 1].pos, a1 = stops[e].pos;
      for (var z = j; z < e; z++) stops[z].pos = a0 + (a1 - a0) * (z - j + 1) / (e - j + 1);
    }
    return stops;
  }
  var INTERP = /\s*in\s+[\w-]+(\s+(shorter|longer|increasing|decreasing)\s+hue)?\s*/;
  function posAt(v, len) {
    v = String(v).trim();
    var kw = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
    return lengthAlong(kw[v] || v, len);
  }
  function center(at, w, h) {
    if (!at) return [w / 2, h / 2];
    var p = at.trim().split(/\s+(?![^(]*\))/);
    if (p.length === 1) p.push('center');
    if (/^(top|bottom)$/.test(p[0]) || /^(left|right)$/.test(p[1])) p = [p[1], p[0]];
    var x = posAt(p[0], w), y = posAt(p[1], h);
    return x == null || y == null ? null : [x, y];
  }
  function parseGradient(s, w, h) {
    var m = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/i.exec(String(s).trim());
    if (!m) return null;
    var repeating = !!m[1], kind = m[2].toLowerCase(), args = splitTop(m[3], ','), g = { kind: kind, repeating: repeating };
    var first = args.length ? args[0] : '', isColour = !!color(first.split(/\s+(?![^(]*\))/)[0]);
    if (kind === 'linear') {
      var angle = 180;
      if (!isColour && /^(to\s|-?[\d.]+(deg|turn|rad|grad)\b|in\s)/.test(first)) {
        var head = args.shift().replace(INTERP, ' ').trim();
        if (head) { var a = angleOf(head, w, h); if (a == null) return null; angle = a; }
      }
      var rad = angle * Math.PI / 180;
      g.angle = angle; g.L = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
      g.stops = readStops(args, g.L, false);
      return g.stops ? g : null;
    }
    var headR = !isColour ? args.shift().replace(INTERP, ' ').trim() : '';
    if (kind === 'radial') {
      var at = null, i = headR.indexOf('at ');
      if (i >= 0) { at = headR.slice(i + 3); headR = headR.slice(0, i).trim(); }
      var c = center(at, w, h); if (!c) return null;
      var circle = /\bcircle\b/.test(headR), size = headR.replace(/\b(circle|ellipse)\b/, '').trim() || 'farthest-corner';
      var dx0 = c[0], dx1 = w - c[0], dy0 = c[1], dy1 = h - c[1], rx, ry;
      if (/^(closest|farthest)-(side|corner)$/.test(size)) {
        var far = /^farthest/.test(size), sx = far ? Math.max(dx0, dx1) : Math.min(dx0, dx1), sy = far ? Math.max(dy0, dy1) : Math.min(dy0, dy1);
        if (circle) { rx = ry = /side$/.test(size) ? (far ? Math.max(sx, sy) : Math.min(sx, sy)) : Math.hypot(sx, sy); }
        else if (/side$/.test(size)) { rx = sx; ry = sy; }
        else { rx = sx * Math.SQRT2; ry = sy * Math.SQRT2; }
      } else {
        var sz = size.split(/\s+(?![^(]*\))/);
        rx = lengthAlong(sz[0], w); ry = sz[1] ? lengthAlong(sz[1], h) : rx;
        if (rx == null || ry == null) return null;
      }
      if (!(rx > 0 && ry > 0)) return null;
      g.cx = c[0]; g.cy = c[1]; g.rx = rx; g.ry = ry;
      g.stops = readStops(args, rx, false);
      return g.stops ? g : null;
    }
    /* conic: from <angle> at <position> */
    var from = 0, atC = null, fm = /from\s+(-?[\d.]+)(deg|turn|rad|grad)?/.exec(headR), ai = headR.indexOf('at ');
    if (fm) { var fv = parseFloat(fm[1]); from = fm[2] === 'turn' ? fv * 360 : fm[2] === 'rad' ? fv * 180 / Math.PI : fm[2] === 'grad' ? fv * 0.9 : fv; }
    if (ai >= 0) atC = headR.slice(ai + 3);
    var cc = center(atC, w, h); if (!cc) return null;
    g.cx = cc[0]; g.cy = cc[1]; g.from = from;
    g.stops = readStops(args, 360, true);
    return g.stops ? g : null;
  }
  /* the gradient's colour at (x, y) inside a w×h box (premultiplied lerp) */
  function gradientAt(s, w, h, x, y) {
    var g = parseGradient(s, w, h);
    if (!g) return null;
    var t;
    if (g.kind === 'linear') {
      var rad = g.angle * Math.PI / 180;
      t = (x - w / 2) * Math.sin(rad) - (y - h / 2) * Math.cos(rad) + g.L / 2;
    } else if (g.kind === 'radial') {
      t = Math.hypot((x - g.cx) / g.rx, (y - g.cy) / g.ry) * g.rx;
    } else {
      t = ((Math.atan2(x - g.cx, -(y - g.cy)) * 180 / Math.PI - g.from) % 360 + 720) % 360;
    }
    var st = g.stops;
    if (g.repeating) {
      var p0 = st[0].pos, per = st[st.length - 1].pos - p0;
      if (per > 0.01) t = p0 + (((t - p0) % per) + per) % per;
    }
    if (t <= st[0].pos) return st[0].c.slice();
    if (t >= st[st.length - 1].pos) return st[st.length - 1].c.slice();
    for (var i = 1; i < st.length; i++) {
      if (t <= st[i].pos) {
        var A = st[i - 1], B = st[i], span = B.pos - A.pos, f = span > 0 ? (t - A.pos) / span : 1;
        var aa = A.c[3], ba = B.c[3], alpha = aa + (ba - aa) * f;
        if (alpha <= 0) return [0, 0, 0, 0];
        var mix = function (k) { return (A.c[k] * aa + (B.c[k] * ba - A.c[k] * aa) * f) / alpha; };
        return [mix(0), mix(1), mix(2), alpha];
      }
    }
    return st[st.length - 1].c.slice();
  }

  /* ── 3 · CSS FILTER CHAINS (for backdrop-filter and filter) ─────────────── */
  function amount(v, pct) {
    v = String(v).trim();
    if (!v) return pct;
    return v.slice(-1) === '%' ? parseFloat(v) / 100 : parseFloat(v);
  }
  function applyFilters(str, rgb, W) {
    /* returns {rgb, blur, url:boolean} — blur is only reported (the caller
       samples the neighbourhood); url() is left to the caller */
    var out = rgb.slice(0, 3).map(function (v) { return v / 255; }), blur = 0, url = false;
    var re = /([a-z-]+)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, m;
    while ((m = re.exec(str))) {
      var fn = m[1].toLowerCase(), arg = m[2];
      if (fn === 'url') { url = true; continue; }
      if (fn === 'blur') { blur = Math.max(blur, parseFloat(arg) || 0); continue; }
      if (fn === 'saturate') {
        var s = amount(arg, 1), r = out[0], g = out[1], b = out[2];
        out = [(0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
               (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
               (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b];
      } else if (fn === 'contrast') {
        var c = amount(arg, 1); out = out.map(function (v) { return (v - 0.5) * c + 0.5; });
      } else if (fn === 'brightness') {
        var br = amount(arg, 1); out = out.map(function (v) { return v * br; });
      } else if (fn === 'grayscale') {
        var gs = Math.min(1, amount(arg, 1)), L = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
        out = out.map(function (v) { return v + (L - v) * gs; });
      } else if (fn === 'invert') {
        var iv = Math.min(1, amount(arg, 1)); out = out.map(function (v) { return v * (1 - iv) + (1 - v) * iv; });
      } else if (fn === 'opacity') {
        /* opacity() on a backdrop fades the filtered result back toward the
           unfiltered one — rare; treated as identity with a note */
      } else if (fn === 'drop-shadow' || fn === 'hue-rotate' || fn === 'sepia') {
        /* no effect on the ground under text worth modelling (hue-rotate
           and sepia would be; none of the materials use them) */
      }
      out = out.map(function (v) { return Math.max(0, Math.min(1, v)); });
    }
    return { rgb: [out[0] * 255, out[1] * 255, out[2] * 255, 1], blur: blur, url: url };
  }
  /* LG3's refraction path draws a url() filter; its colour part is
     sat → linear(scale, offset), readable from LG3.material(host). */
  function applyLG3(mat, rgb) {
    var f = applyFilters('saturate(' + mat.sat + ')', rgb).rgb.map(function (v) { return v / 255; });
    return [0, 1, 2].map(function (k) { return Math.max(0, Math.min(1, f[k] * mat.scale + mat.offset)) * 255; }).concat(1);
  }

  /* ── 4 · THE PAINT STACK AT A POINT ─────────────────────────────────────── */
  function Ctx(win, el) {
    this.win = win; this.doc = win.document; this.el = el;
  }
  function cs(ctx, el, pseudo) {
    var key = pseudo || '';
    var store = el.__auditCS || (el.__auditCS = {});
    if (store.pass === ctx.pass && store[key]) return store[key];
    if (store.pass !== ctx.pass) { el.__auditCS = store = { pass: ctx.pass }; }
    return (store[key] = ctx.win.getComputedStyle(el, pseudo || null));
  }
  function opacityChain(ctx, el) {
    var o = 1;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.__auditOp && n.__auditOp.pass === ctx.pass) { o *= n.__auditOp.v; break; }
      var v = parseFloat(cs(ctx, n).opacity);
      if (isFinite(v)) o *= v;
    }
    return o;
  }
  /* Does `o`, painted ABOVE the text, hide it at (x, y)? Only something that
     would actually cover glyphs counts: media, glass (text under glass is
     another question), or a fill at least half opaque at that point. A
     blended highlight (plus-lighter rim), a 1 px edge ring, a faint sheen or
     an invisible hit area is decoration over the text, not a cover. */
  function coversAt(ctx, o, x, y) {
    var t = o.tagName;
    if (t === 'CANVAS' || t === 'IMG' || t === 'VIDEO' || t === 'IFRAME') return true;
    if (o.namespaceURI === 'http://www.w3.org/2000/svg') return false;
    var s = cs(ctx, o);
    if (s.mixBlendMode && s.mixBlendMode !== 'normal') return false;
    if ((s.backdropFilter && s.backdropFilter !== 'none') || (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none')) return true;
    if (/text/.test(s.backgroundClip || '')) return false;
    var r = o.getBoundingClientRect(), got = boxColors(ctx, s, r, x, y, 1);
    if (!got.unmeasurable && got.colors) {
      var a = 0;
      got.colors.forEach(function (c) { a = a + c[3] * (1 - a); });
      if (a >= 0.5) return true;
    }
    return pseudoCovers(ctx, o, x, y);
  }
  /* …or its ::before / ::after does. A scroll edge is exactly that: a
     zero-height host whose pseudo-elements lay ~90 % ground and a 12 px blur
     over what scrolls under a bar, so text there is covered, not text on
     the bar's ground (a phone-frame page at 1440: the trio under the navbar
     read 15:1 here and 1.07:1 on the screen). */
  function pseudoCovers(ctx, o, x, y) {
    for (var i = 0; i < 2; i++) {
      var which = i ? '::after' : '::before', s = cs(ctx, o, which);
      if (!s || s.content === 'none' || s.content === 'normal' || s.display === 'none' || s.visibility !== 'visible') continue;
      if (s.mixBlendMode && s.mixBlendMode !== 'normal') continue;
      var pl = pseudoBox(ctx, o, s, x, y);
      if (!pl || pl.unknown) continue;
      var m = maskOf(ctx, s, pl.box, x, y, where(o) + which);
      var a = opacityChain(ctx, o) * pl.opacity * (m == null ? 0 : m);
      if (a < 0.5) continue;
      var bf = s.backdropFilter || s.webkitBackdropFilter;
      if (bf && bf !== 'none') return true;
      var got = boxColors(ctx, s, pl.box, x, y, a);
      if (got.unmeasurable || !got.colors) continue;
      var cov = 0;
      got.colors.forEach(function (c) { cov = cov + c[3] * (1 - cov); });
      if (cov >= 0.5) return true;
    }
    return false;
  }
  function negZ(ctx, o) {
    var s = cs(ctx, o);
    return s.position !== 'static' && parseInt(s.zIndex, 10) < 0;
  }
  /* The alpha a mask-image contributes at (x, y), for the layer and every
     ancestor that is NOT also an ancestor of the text (a mask there masks
     the text with it). null = a mask this engine cannot evaluate. */
  /* One style's mask at (x, y) over box r: 1 when it has none, null when it
     cannot be evaluated (the reason goes to ctx.maskWhy). */
  function maskOf(ctx, s, r, x, y, who) {
    var mi = s.maskImage || s.webkitMaskImage;
    if (!mi || mi === 'none') return 1;
    var layers = splitTop(mi, ','), got = 0;
    var mc = (s.maskComposite || s.webkitMaskComposite || 'add').split(',')[0].trim();
    if (layers.length > 1 && !/^(add|source-over)$/.test(mc)) { ctx.maskWhy = who + ' ' + mc + ' composite'; return null; }   /* exclude / intersect rings */
    for (var i = 0; i < layers.length; i++) {
      if (layers[i] === 'none') continue;              /* a transparent layer */
      var mt = tileAt(s, i, r, x, y, true);
      if (mt === null) continue;                       /* this mask layer adds nothing here */
      if (mt.unknown) { ctx.maskWhy = who + ' mask size'; return null; }
      var g = gradientAt(layers[i], mt.w, mt.h, mt.x, mt.y);
      if (!g) { ctx.maskWhy = who + ' ' + layers[i].slice(0, 48); return null; }
      got = got + g[3] * (1 - got);                    /* 'add': the layers unite */
    }
    return got;
  }
  function maskAlpha(ctx, layer, x, y) {
    var a = 1;
    for (var n = layer; n && n.nodeType === 1 && !n.contains(ctx.el); n = n.parentElement) {
      var m = maskOf(ctx, cs(ctx, n), n.getBoundingClientRect(), x, y, where(n));
      if (m == null) return null;
      a *= m;
    }
    return a;
  }
  var pixelCache = new Map();
  function canvasPixel(ctx, cv, x, y) {
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height || !cv.width || !cv.height) return null;
    var data = pixelCache.get(cv);
    if (!data || data.pass !== ctx.pass || data.w !== cv.width || data.h !== cv.height) {
      var id = null;
      try {
        var g = cv.getContext('2d', { willReadFrequently: true });
        if (g) id = g.getImageData(0, 0, cv.width, cv.height);
      } catch (e) { id = null; }
      if (!id) {
        try {                                    /* a WebGL canvas: copy it */
          var tmp = doc.createElement('canvas'); tmp.width = cv.width; tmp.height = cv.height;
          var tg = tmp.getContext('2d', { willReadFrequently: true });
          tg.drawImage(cv, 0, 0);
          id = tg.getImageData(0, 0, cv.width, cv.height);
        } catch (e2) { return null; }
      }
      data = { pass: ctx.pass, w: cv.width, h: cv.height, d: id.data };
      pixelCache.set(cv, data);
    }
    /* a small neighbourhood (±2 CSS px): the eye integrates the art's grain */
    var sx = cv.width / r.width, sy = cv.height / r.height;
    var cx = (x - r.left) * sx, cy = (y - r.top) * sy, rad = Math.max(1, Math.round(2 * sx));
    var sum = [0, 0, 0, 0], n = 0;
    for (var yy = Math.round(cy) - rad; yy <= Math.round(cy) + rad; yy += Math.max(1, rad)) {
      for (var xx = Math.round(cx) - rad; xx <= Math.round(cx) + rad; xx += Math.max(1, rad)) {
        if (xx < 0 || yy < 0 || xx >= data.w || yy >= data.h) continue;
        var i = (yy * data.w + xx) * 4;
        sum[0] += data.d[i]; sum[1] += data.d[i + 1]; sum[2] += data.d[i + 2]; sum[3] += data.d[i + 3]; n++;
      }
    }
    if (!n) return null;
    return [sum[0] / n, sum[1] / n, sum[2] / n, sum[3] / n / 255];
  }
  var imgCanvas = null;
  function imagePixel(ctx, img, x, y) {
    if (!img.complete || !img.naturalWidth) return null;
    try {
      var r = img.getBoundingClientRect();
      if (!imgCanvas) { imgCanvas = doc.createElement('canvas'); imgCanvas.width = imgCanvas.height = 1; }
      var g = imgCanvas.getContext('2d', { willReadFrequently: true });
      g.clearRect(0, 0, 1, 1);
      var ix = (x - r.left) / r.width * img.naturalWidth, iy = (y - r.top) / r.height * img.naturalHeight;
      g.drawImage(img, ix, iy, 1, 1, 0, 0, 1, 1);
      var d = g.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    } catch (e) { return null; }          /* cross-origin: tainted */
  }
  /* The positioned pseudo-element box, where the engine can know it. */
  function pseudoLayer(ctx, el, which, x, y) {
    var s = cs(ctx, el, which);
    if (!s || s.content === 'none' || s.content === 'normal' || s.display === 'none' || s.visibility !== 'visible') return null;
    var bg = color(s.backgroundColor), img = s.backgroundImage && s.backgroundImage !== 'none';
    if ((!bg || bg[3] <= 0.02) && !img) return null;
    return pseudoBox(ctx, el, s, x, y);
  }
  /* Where a pseudo-element with style s paints, when it is absolutely placed
     and (x, y) is inside it; { unknown } when its place cannot be known. */
  function pseudoBox(ctx, el, s, x, y) {
    if (s.position !== 'absolute' && s.position !== 'fixed') return { unknown: true };
    /* moved by a transform or translate: its painted place is not its box
       (a ring's end-cap dot); left out, and counted as such */
    if ((s.transform && s.transform !== 'none') || (s.translate && s.translate !== 'none' && s.translate !== '0px')) return { unknown: true };
    var w = parseFloat(s.width), h = parseFloat(s.height);
    if (!(w > 0 && h > 0)) return null;
    var host = el.getBoundingClientRect(), es = cs(ctx, el);
    var left = host.left + (parseFloat(es.borderLeftWidth) || 0) + (parseFloat(s.left) || 0);
    var top = host.top + (parseFloat(es.borderTopWidth) || 0) + (parseFloat(s.top) || 0);
    if (s.position === 'fixed') { left = parseFloat(s.left) || 0; top = parseFloat(s.top) || 0; }
    if (x < left || x > left + w || y < top || y > top + h) return null;
    var op = parseFloat(s.opacity); if (!isFinite(op)) op = 1;
    return { style: s, box: { left: left, top: top, width: w, height: h }, opacity: op };
  }
  /* Where layer i of a background (or mask) tiles: its size, position and
     repeat, from the computed lists (a list shorter than the layers
     repeats). Returns the tile and the point's coordinates inside it, or
     null when a no-repeat tile does not reach the point: a 1 px divider
     drawn as a gradient is a line, not a wash over the whole box. */
  function listAt(v, i) { var l = splitTop(String(v || ''), ','); return l.length ? l[i % l.length].trim() : ''; }
  function tileAt(s, i, box, x, y, mask) {
    var size = listAt(mask ? (s.maskSize || s.webkitMaskSize) : s.backgroundSize, i) || 'auto';
    var px = listAt(mask ? (s.maskPositionX || s.webkitMaskPositionX) : s.backgroundPositionX, i) || '0%';
    var py = listAt(mask ? (s.maskPositionY || s.webkitMaskPositionY) : s.backgroundPositionY, i) || '0%';
    var rep = listAt(mask ? (s.maskRepeat || s.webkitMaskRepeat) : s.backgroundRepeat, i) || 'repeat';
    var W = box.width, H = box.height, tw = W, th = H;
    if (!/^(auto|auto auto|cover|contain)$/.test(size)) {
      var sp = size.split(/\s+(?![^(]*\))/);
      tw = sp[0] === 'auto' ? W : lengthAlong(sp[0], W);
      th = !sp[1] || sp[1] === 'auto' ? H : lengthAlong(sp[1], H);
      if (tw == null || th == null) return { unknown: true };
    }
    if (!(tw > 0 && th > 0)) return null;
    var ox = lengthAlong(px, W - tw), oy = lengthAlong(py, H - th);
    if (ox == null || oy == null) return { unknown: true };
    var lx = x - box.left - ox, ly = y - box.top - oy;
    var parts = rep.split(/\s+/), rx, ry;
    if (parts.length === 2) { rx = parts[0] !== 'no-repeat'; ry = parts[1] !== 'no-repeat'; }
    else { rx = rep === 'repeat' || rep === 'repeat-x' || rep === 'space' || rep === 'round'; ry = rep === 'repeat' || rep === 'repeat-y' || rep === 'space' || rep === 'round'; }
    if (rx) lx = ((lx % tw) + tw) % tw; else if (lx < 0 || lx > tw) return null;
    if (ry) ly = ((ly % th) + th) % th; else if (ly < 0 || ly > th) return null;
    return { w: tw, h: th, x: lx, y: ly };
  }
  function boxColors(ctx, s, box, x, y, alpha) {
    /* background-color, then background-image layers (the first listed is on top) */
    var out = [], bg = color(s.backgroundColor);
    if (bg && bg[3] > 0) out.push([bg[0], bg[1], bg[2], bg[3] * alpha]);
    var bi = s.backgroundImage;
    if (bi && bi !== 'none') {
      var all = splitTop(bi, ',');
      for (var i = all.length - 1; i >= 0; i--) {
        var L = all[i];
        if (L === 'none') continue;
        var tile = tileAt(s, i, box, x, y, false);
        if (tile === null) continue;                       /* this layer does not paint here */
        if (tile.unknown) return { unmeasurable: 'background size' };
        if (/^url\(/i.test(L)) return { unmeasurable: 'image background' };
        if (!/^(repeating-)?(linear|radial|conic)-gradient/i.test(L)) return { unmeasurable: L.split('(')[0] };
        var g = gradientAt(L, tile.w, tile.h, tile.x, tile.y);
        if (!g) return { unmeasurable: 'gradient' };
        if (g[3] > 0) { out.push([g[0], g[1], g[2], g[3] * alpha]); out.gradient = true; }
      }
    }
    return { colors: out, gradient: !!out.gradient };
  }

  /* Paint contributions of ONE element at (x, y), bottom → top. */
  function layerOf(ctx, o, x, y, flags) {
    var tag = o.tagName, alpha = opacityChain(ctx, o), out = [];
    if (alpha <= 0.001) return { colors: [] };
    var ma = maskAlpha(ctx, o, x, y);
    if (ma == null) return { unmeasurable: 'mask', detail: ctx.maskWhy };
    alpha *= ma;
    if (alpha <= 0.001) return { colors: [] };
    var s = cs(ctx, o);
    if (s.visibility !== 'visible') return { colors: [] };
    if (o === ctx.doc.documentElement || o === ctx.doc.body) return { colors: [] };   /* the canvas colour is the base */
    if (tag === 'CANVAS') {
      var p = canvasPixel(ctx, o, x, y);
      if (!p) return { unmeasurable: 'canvas unreadable' };
      flags.art = true;
      if (o.getAttribute('data-art') === 'fixture') flags.fixture = true;
      return { colors: [[p[0], p[1], p[2], p[3] * alpha]], filter: s.filter };
    }
    if (tag === 'IMG') {
      var ip = imagePixel(ctx, o, x, y);
      if (!ip) return { unmeasurable: 'image' };
      flags.image = true;
      return { colors: [[ip[0], ip[1], ip[2], ip[3] * alpha]] };
    }
    if (tag === 'VIDEO') return { unmeasurable: 'video' };
    if (tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED') return { unmeasurable: 'embedded document' };
    if (o.namespaceURI === 'http://www.w3.org/2000/svg') {
      if (tag === 'svg' || tag === 'g' || tag === 'text' || tag === 'tspan' || tag === 'use' || tag === 'symbol') return { colors: [] };
      var fill = s.fill;
      if (!fill || fill === 'none') return { colors: [] };
      if (/url\(/.test(fill)) return { unmeasurable: 'svg paint server' };
      var fc = color(fill);
      if (!fc) return { unmeasurable: 'svg fill' };
      var fo = parseFloat(s.fillOpacity); if (!isFinite(fo)) fo = 1;
      return { colors: [[fc[0], fc[1], fc[2], fc[3] * fo * alpha]] };
    }
    var r = o.getBoundingClientRect();
    var clipText = /text/.test(s.backgroundClip || '') || /text/.test(s.webkitBackgroundClip || '');
    if (!clipText) {
      var own = boxColors(ctx, s, r, x, y, alpha);
      if (own.unmeasurable) return own;
      if (own.gradient) flags.gradient = true;
      out = out.concat(own.colors);
    }
    ['::before', '::after'].forEach(function (w) {
      if (out.unmeasurable) return;
      var pl = pseudoLayer(ctx, o, w, x, y);
      if (!pl) return;
      if (pl.unknown) { flags.pseudoUnknown = (flags.pseudoUnknown || 0) + 1; return; }
      var pm = maskOf(ctx, pl.style, pl.box, x, y, where(o) + w);
      if (pm == null) { out.unmeasurable = 'mask'; return; }
      if (pm <= 0.001) return;                            /* masked out here (a ring's hole) */
      var pc = boxColors(ctx, pl.style, pl.box, x, y, alpha * pl.opacity * pm);
      if (pc.unmeasurable) { out.unmeasurable = pc.unmeasurable; return; }
      out = out.concat(pc.colors);
    });
    if (out.unmeasurable) return { unmeasurable: out.unmeasurable };
    var bf = s.backdropFilter || s.webkitBackdropFilter;
    return { colors: out, backdrop: bf && bf !== 'none' ? bf : null, filter: s.filter };
  }

  function baseColor(ctx) {
    var h = cs(ctx, ctx.doc.documentElement), b = ctx.doc.body ? cs(ctx, ctx.doc.body) : null;
    var c = color(h.backgroundColor);
    if (c && c[3] > 0) return over(c, [255, 255, 255, 1]);
    c = b && color(b.backgroundColor);
    if (c && c[3] > 0) return over(c, h.colorScheme === 'dark' ? [18, 18, 18, 1] : [255, 255, 255, 1]);
    return /dark/.test(h.colorScheme) ? [18, 18, 18, 1] : [255, 255, 255, 1];
  }

  /* Composite the elements `list` (bottom → top) at (x, y) onto the base.
     A glass host (backdrop-filter) filters what is under it: that ground is
     re-sampled over the blur radius and averaged before the filter runs. */
  function composite(ctx, list, x, y, flags, depth) {
    var acc = baseColor(ctx);
    for (var i = 0; i < list.length; i++) {
      var o = list[i], L = layerOf(ctx, o, x, y, flags);
      if (L.unmeasurable) return { unmeasurable: L.unmeasurable, detail: L.detail };
      if (L.backdrop) {
        if (depth > 0) return { unmeasurable: 'glass on glass' };
        var f = applyFilters(L.backdrop, acc);
        var b = Math.min(24, f.blur), ground = acc;
        if (b > 0.5) {
          var sum = [0, 0, 0], n = 0;
          for (var gy = -1; gy <= 1; gy++) for (var gx = -1; gx <= 1; gx++) {
            var g = gx === 0 && gy === 0 ? { rgb: acc } : below(ctx, o, x + gx * b, y + gy * b, flags);
            if (g.unmeasurable) return g;
            sum[0] += g.rgb[0]; sum[1] += g.rgb[1]; sum[2] += g.rgb[2]; n++;
          }
          ground = [sum[0] / n, sum[1] / n, sum[2] / n, 1];
        }
        if (f.url) {
          var LG = ctx.win.LG3, mat = null;
          try { mat = LG && LG.material ? LG.material(o) : null; } catch (e) { mat = null; }
          if (!mat) return { unmeasurable: 'glass filter' };
          acc = applyLG3(mat, ground);
        } else acc = applyFilters(L.backdrop, ground).rgb;
        flags.glass = true;
      }
      for (var k = 0; k < L.colors.length; k++) {
        var c = L.colors[k];
        if (L.filter && L.filter !== 'none') c = applyFilters(L.filter, c).rgb.slice(0, 3).concat(c[3]);
        acc = over(c, acc);
      }
    }
    return { rgb: acc };
  }
  /* what is painted under `host` at (x, y) — for the blur neighbourhood */
  function below(ctx, host, x, y, flags) {
    var W = ctx.win;
    if (x < 0 || y < 0 || x >= W.innerWidth || y >= W.innerHeight) return { rgb: baseColor(ctx) };
    var st = ctx.doc.elementsFromPoint(x, y), i = st.indexOf(host);
    var list = (i < 0 ? st : st.slice(i + 1)).slice().reverse();
    return composite(ctx, list, x, y, flags, 1);
  }

  /* ── 5 · ONE TEXT ELEMENT ───────────────────────────────────────────────── */
  var SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE|DESC|TEXTAREA|OPTION|SELECT|DATALIST|METADATA)$/i;
  /* A rolled number (FG3.rollNumber) has one text node, in its visually
     hidden twin (.fg3-roll-sr); the digits a reader sees are generated from
     data-g inside the .fg3-roll-vis sibling and are no text at all. The
     twin's words are measured on that drawing: its box, its colour, its
     size. Anything else is null. */
  function rollDrawing(el) {
    if (!el.classList || !el.classList.contains('fg3-roll-sr')) return null;
    var host = el.parentElement;
    if (!host || !host.classList.contains('fg3-roll')) return null;
    return host.querySelector(':scope > .fg3-roll-vis');
  }
  function collect(win) {
    var d = win.document, byEl = new Map(), order = [], drawn = new Set();
    if (!d.body) return order;
    var tw = d.createTreeWalker(d.body, 4 /* SHOW_TEXT */, null), n;
    while ((n = tw.nextNode())) {
      if (!/\S/.test(n.nodeValue)) continue;
      var el = n.parentElement;
      if (!el || SKIP_TAGS.test(el.tagName) || el.closest('script,style,noscript,template,svg title,svg desc,select,datalist')) continue;
      var vis = rollDrawing(el);
      if (vis) { el = vis; drawn.add(vis); }
      if (!byEl.has(el)) { byEl.set(el, []); order.push(el); }
      byEl.get(el).push(n);
    }
    return order.map(function (el) { return { el: el, nodes: byEl.get(el), drawn: drawn.has(el) }; });
  }
  function rectsOf(item) {
    var out = [], d = item.el.ownerDocument;
    if (item.drawn) {                      /* generated glyphs: the drawing's own boxes */
      var own = item.el.getClientRects();
      for (var k = 0; k < own.length; k++) if (own[k].width > 1 && own[k].height > 1) out.push(own[k]);
      return out;
    }
    item.nodes.forEach(function (n) {
      var r = d.createRange(); r.selectNodeContents(n);
      var list = r.getClientRects();
      for (var i = 0; i < list.length; i++) if (list[i].width > 1 && list[i].height > 1) out.push(list[i]);
    });
    return out;
  }
  function where(el) {
    var parts = [], n = el;
    for (var depth = 0; n && n.nodeType === 1 && depth < 4; depth++, n = n.parentElement) {
      var p = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(p + '#' + n.id); break; }
      var cls = typeof n.className === 'string' ? n.className.trim().split(/\s+/).filter(function (c) { return c && !/^(anim-|lg3-text)/.test(c); }).slice(0, 2) : [];
      if (cls.length) p += '.' + cls.join('.');
      parts.unshift(p);
      if (n.tagName === 'BODY') break;
    }
    return parts.join(' > ');
  }
  function textOf(item) {
    return item.nodes.map(function (n) { return n.nodeValue; }).join(' ').replace(/\s+/g, ' ').trim().slice(0, 64);
  }
  function inkAt(ctx, el, s, x, y) {
    var ink = null;
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') {
      if (!s.fill || s.fill === 'none') return { none: true };
      if (/url\(/.test(s.fill)) return { unmeasurable: 'svg text paint server' };
      ink = color(s.fill);
      var fo = parseFloat(s.fillOpacity); if (ink && isFinite(fo)) ink = [ink[0], ink[1], ink[2], ink[3] * fo];
    } else {
      ink = color(s.webkitTextFillColor || s.color) || color(s.color);
      var clipText = /text/.test(s.backgroundClip || '') || /text/.test(s.webkitBackgroundClip || '');
      if (ink && ink[3] < 0.02 && clipText) {
        /* gradient type (a sweep headline): the ink IS the element's own
           background, clipped to the glyphs */
        var r = el.getBoundingClientRect(), layers = splitTop(s.backgroundImage || 'none', ',');
        if (layers.length !== 1 || !/^linear-gradient/.test(layers[0])) return { unmeasurable: 'image-filled text' };
        /* background-size / position change which part of the gradient is
           under the glyphs; only the plain 100%-sized case is evaluated */
        if (!/^(auto|100% 100%|auto auto)$/.test(s.backgroundSize) && s.backgroundSize !== '100%') return { unmeasurable: 'animated gradient text' };
        ink = gradientAt(layers[0], r.width, r.height, x - r.left, y - r.top);
        if (!ink) return { unmeasurable: 'gradient text' };
      }
    }
    if (!ink) return { unmeasurable: 'ink colour' };
    return { ink: [ink[0], ink[1], ink[2], ink[3] * opacityChain(ctx, el)] };
  }
  /* The first and last line's centres first, then a grid over up to three
     lines: a flat ground is settled by the first three points, a gradient or
     art ground gets the whole grid (the walk stops early on a flat one). */
  function samplePoints(rects, W, H) {
    var pts = [], add = function (x, y, r) { if (x >= 1 && y >= 1 && x < W - 1 && y < H - 1) pts.push([x, y, r]); };
    var a = rects[0], b = rects[rects.length - 1];
    add(a.left + a.width / 2, a.top + a.height * 0.5, a);
    if (b !== a) add(b.left + b.width / 2, b.top + b.height * 0.5, b);
    var lines = rects.length <= 3 ? rects : [a, rects[rects.length >> 1], b];
    lines.forEach(function (r) {
      var cols = Math.max(1, Math.min(4, Math.round(r.width / 110)));
      for (var c = 0; c < cols; c++) {
        var x = r.left + r.width * (cols === 1 ? 0.5 : 0.08 + 0.84 * c / (cols - 1));
        add(x, r.top + r.height * 0.36, r); add(x, r.top + r.height * 0.7, r);
      }
    });
    return pts.slice(0, 16);
  }
  /* Measure one element now (it must be in view). Returns null when it is
     not visible at any of its points (clipped, covered, scrolled away). */
  function measureItem(ctx, item) {
    var el = item.el, s = cs(ctx, el);
    /* a live readout re-renders its text while the walk runs: the nodes
       collected at the start are detached by now, so read the current ones */
    if (item.nodes.some(function (n) { return !n.isConnected; })) {
      var src = item.drawn ? el.parentElement && el.parentElement.querySelector(':scope > .fg3-roll-sr') : el;
      var now = src ? Array.prototype.filter.call(src.childNodes, function (n) { return n.nodeType === 3 && /\S/.test(n.nodeValue); }) : [];
      if (now.length) item.nodes = now;
    }
    var rects = rectsOf(item);
    if (!rects.length || s.visibility !== 'visible') return { hidden: 'no box' };
    /* not rendered at all: a closed <details>, content-visibility: hidden,
       display: none or visibility: hidden somewhere above */
    try { if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })) return { hidden: 'not rendered' }; } catch (e) {}
    /* visually hidden on purpose (.sr-only: a 1 px clipped box) is not text
       anyone sees, so it has no contrast to hold */
    var eb = el.getBoundingClientRect();
    if (eb.width <= 1.5 && eb.height <= 1.5 && s.position !== 'static') return { hidden: 'visually hidden' };
    if (/inset\(\s*50%/.test(s.clipPath || '') || /rect\(0(px)?,?\s*0(px)?,?\s*0(px)?,?\s*0(px)?\)/.test(s.clip || '')) return { hidden: 'visually hidden' };
    var W = ctx.win.innerWidth, H = ctx.win.innerHeight;
    var inView = rects.filter(function (r) { return r.top >= 0 && r.bottom <= H && r.left >= 0 && r.right <= W; });
    if (!inView.length) return null;
    var op = opacityChain(ctx, el);
    if (op < 0.02) return { hidden: 'transparent' };
    var size = parseFloat(s.fontSize) || 16, weight = parseInt(s.fontWeight, 10) || 400;
    var large = size >= 23.99 || (size >= 18.99 && weight >= 600);
    var need = large ? 3 : 4.5;
    var pts = samplePoints(inView, W, H), worst = null, hit = 0, unm = null, unmDetail = null, flags = { };
    ctx.el = el;
    for (var i = 0; i < pts.length; i++) {
      var x = pts[i][0], y = pts[i][1];
      var st = ctx.doc.elementsFromPoint(x, y), idx = st.indexOf(el);
      if (idx < 0) continue;
      var covered = false, neg = [];
      for (var k = 0; k < idx; k++) {
        var o = st[k];
        if (el.contains(o)) { if (negZ(ctx, o)) neg.push(o); continue; }
        if (opacityChain(ctx, o) > 0.05 && coversAt(ctx, o, x, y)) { covered = o; break; }
      }
      if (covered) continue;
      hit++;
      var list = st.slice(idx + 1).reverse();
      list.push(el);
      for (var q = neg.length - 1; q >= 0; q--) list.push(neg[q]);
      var f = {};
      var g = composite(ctx, list, x, y, f, 0);
      if (g.unmeasurable) { unm = g.unmeasurable; unmDetail = g.detail || null; break; }
      var ink = inkAt(ctx, el, s, x, y);
      if (ink.none) return { hidden: 'no ink' };
      if (ink.unmeasurable) { unm = ink.unmeasurable; break; }
      if (ink.ink[3] < 0.02) return { hidden: 'transparent ink' };
      var fg = over(ink.ink, g.rgb), rr = ratio(fg, g.rgb);
      if (f.art) flags.art = true;
      if (f.glass) flags.glass = true;
      if (f.image) flags.image = true;
      if (f.fixture) flags.fixture = true;
      if (f.pseudoUnknown) flags.pseudoUnknown = true;
      if (f.gradient) flags.gradient = true;
      if (!worst || rr < worst.ratio) worst = { ratio: rr, fg: fg, bg: g.rgb, x: Math.round(x), y: Math.round(y), box: pts[i][2] };
      if (hit >= 3 && !flags.art && !flags.glass && !flags.gradient && !flags.image) break;   /* a flat ground */
    }
    if (!hit) return null;
    var base = { where: where(el), text: textOf(item), size: size, weight: weight, need: need, flags: flags };
    if (unm) { base.unmeasurable = unm; if (unmDetail) base.detail = unmDetail; return base; }
    if (!worst) return null;
    base.ratio = worst.ratio; base.fg = hex(worst.fg); base.bg = hex(worst.bg); base.inkDark = lum(worst.fg) < lum(worst.bg);
    if (worst.box) {
      base.box = { x: Math.round(worst.box.left), y: Math.round(worst.box.top), w: Math.round(worst.box.width), h: Math.round(worst.box.height) };
      /* the ground ends where the text's box does: a glyph box can stand a px
         or two outside a badge's capsule, and what is outside is not its
         ground (the verifier crops to this) */
      var gnd = el;
      while (gnd.parentElement && /^(inline|contents)$/.test(cs(ctx, gnd).display)) gnd = gnd.parentElement;
      var gb = gnd.getBoundingClientRect();
      base.clip = { x: Math.round(gb.left), y: Math.round(gb.top), w: Math.round(gb.width), h: Math.round(gb.height) };
    }
    base.pass = worst.ratio + 0.005 >= need;
    return base;
  }

  /* ── 6 · THE CONTRAST WALK ──────────────────────────────────────────────── */
  /* A SPECIMEN shows a colour, or a mistake, rather than speaking in it. */
  var SPECIMEN = '[data-audit-exempt],[data-specimen]', DONT_WORDS = '.doc-verdict,figcaption,.doc-specimen__label';
  function isSpecimen(el) {
    if (el.closest(SPECIMEN)) return true;
    var d = el.closest('.doc-dont');
    if (!d || el === d) return false;
    var w = el.closest(DONT_WORDS);
    if (w && d.contains(w)) {
      var sp = w.closest('.doc-specimen');
      if (!(sp && d.contains(sp))) return false;       /* the don't's own words */
    }
    return true;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function frames(win, n) {
    return new Promise(function (res) {
      var k = 0, done = false;
      function tick() { if (done) return; if (++k >= n) { done = true; res(); } else win.requestAnimationFrame(tick); }
      win.requestAnimationFrame(tick);
      setTimeout(function () { if (!done) { done = true; res(); } }, 60 + n * 40);   /* rAF stops on a hidden page */
    });
  }
  /* CSS transitions about to end (a state change settling). Keyframe
     animations are left alone: an autoplay's progress fill or a chart's grow
     is an indicator that is meant to keep moving, and waiting for one cost
     a second at every stop of the long pages. */
  function transitionsDone(win) {
    var list = [];
    try {
      list = win.document.getAnimations().filter(function (a) {
        if (a.playState !== 'running' || !a.effect || typeof a.transitionProperty !== 'string') return false;
        var t = a.effect.getComputedTiming();
        return isFinite(t.endTime) && t.endTime - (t.localTime || 0) <= 900;
      });
    } catch (e) { list = []; }
    if (!list.length) return Promise.resolve();
    return Promise.race([Promise.all(list.map(function (a) { return a.finished.catch(function () {}); })), sleep(900)]);
  }
  /* A stop is measured AT REST. Scrolling can set a spring going: the phone's
     tab bar minimises when its scroller moves and its labels fade with it
     (opacity 1 - 2.5 x --tb-min), and a label read mid-fade failed at 1.9-2.8:1
     while the screen, a moment later, read 4.3-4.9. MOTION marks every
     running spring [data-m-moving] (API.md); that and the CSS transitions
     about to end are waited for, up to a second: a page that never stops is
     measured as it is. An element still moving after a whole second is
     not waited for again on that page (a phone-frame page's .tabbar__lens kept
     [data-m-moving] through a whole ring walk: every wait ran the full
     second, and the page took 344 s instead of 46). */
  async function still(win) {
    var t0 = performance.now(), d = win.document;
    var restless = win.__auditRestless || (win.__auditRestless = new WeakSet());
    function moving() { return Array.prototype.some.call(d.querySelectorAll('[data-m-moving]'), function (e) { return !restless.has(e); }); }
    await transitionsDone(win);
    while (moving() && performance.now() - t0 < 1000) await frames(win, 2);
    if (performance.now() - t0 >= 1000) Array.prototype.forEach.call(d.querySelectorAll('[data-m-moving]'), function (e) { restless.add(e); });
  }
  /* scrollIntoView({block:'center', inline:'nearest'}) done by hand, and only
     inside the measured document. The real one scrolls every scroll
     container up the chain, and the chain does not stop at the frame: it
     scrolls the page that holds the frame too, so audit.html's reader was
     pulled back to the frame on every retry and could not scroll away.
     scrollIntoView({container: 'nearest'}) is not a portable way out: an
     engine that does not know the option ignores it without a word and
     scrolls the parent anyway. The frame's own scrollers are moved
     innermost first, then its window. */
  function reveal(win, el) {
    var d = win.document, root = d.documentElement;
    for (var p = el.parentElement; p && p !== root; p = p.parentElement) {
      var ps = win.getComputedStyle(p);
      if (!/(auto|scroll|hidden|overlay)/.test(ps.overflowX + ' ' + ps.overflowY)) continue;
      if (p.scrollHeight <= p.clientHeight && p.scrollWidth <= p.clientWidth) continue;
      var pr = p.getBoundingClientRect(), er = el.getBoundingClientRect();
      var top = pr.top + p.clientTop, left = pr.left + p.clientLeft;
      p.scrollTop += (er.top + er.height / 2) - (top + p.clientHeight / 2);
      if (er.left < left) p.scrollLeft += er.left - left;
      else if (er.right > left + p.clientWidth) p.scrollLeft += Math.min(er.right - left - p.clientWidth, er.left - left);
    }
    var fb = el.getBoundingClientRect(), x = win.scrollX;
    if (fb.left < 0) x += fb.left;
    else if (fb.right > win.innerWidth) x += Math.min(fb.right - win.innerWidth, fb.left);
    win.scrollTo(Math.max(0, x), Math.max(0, win.scrollY + fb.top + fb.height / 2 - win.innerHeight / 2));
  }
  /* where the measured document's viewport sits in the TOP window's
     viewport: the runner captures the top window, so every box it is sent
     is moved by this (a frame's border or place would otherwise shift it) */
  function frameOffset(win) {
    var x = 0, y = 0;
    for (var w = win; w && w.parent && w !== w.parent; w = w.parent) {
      var fe = null;
      try { fe = w.frameElement; } catch (e) { fe = null; }
      if (!fe) break;
      var r = fe.getBoundingClientRect();
      x += r.left + fe.clientLeft; y += r.top + fe.clientTop;
    }
    return { x: x, y: y };
  }
  function shift(b, o) { return { x: Math.round(b.x + o.x), y: Math.round(b.y + o.y), w: b.w, h: b.h }; }
  var passSeq = 0;
  async function contrast(win, opts) {
    opts = opts || {};
    var d = win.document, t0 = performance.now();
    var hitStyle = d.createElement('style');
    hitStyle.setAttribute('data-fg3-ignore', '');
    hitStyle.textContent = '*,*::before,*::after{pointer-events:auto !important}html{scroll-behavior:auto !important}';
    d.head.appendChild(hitStyle);
    var items = collect(win), res = { checked: 0, pass: 0, failures: [], passes: [], unmeasurable: 0, reasons: {},
      unmeasured: [], exempt: 0, specimens: 0, specimenFailures: [], hidden: 0, hiddenList: [], verifiedPasses: [],
      onArt: 0, onGlass: 0, worst: null, items: items.length };
    var todo = [];
    items.forEach(function (it) {
      var el = it.el;
      if (el.closest('[disabled],[aria-disabled="true"],fieldset[disabled],[inert]')) { res.exempt++; return; }
      /* measured with the rest, reported apart (res.specimenFailures) */
      if (isSpecimen(el)) it.specimen = true;
      todo.push(it);
    });
    var sx = win.scrollX, sy = win.scrollY;
    /* Where each item sits in the document, once: a scroll position then
       measures only the items that can be in view (a page of 2,800 text
       nodes would otherwise re-measure the whole list at every stop). */
    win.scrollTo(0, 0);
    /* not rendered (closed <details>, content-visibility, display:none):
       set aside now, or each would cost a scroll stop to find out */
    todo = todo.filter(function (it) {
      var ok = true;
      try { ok = !it.el.checkVisibility || it.el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true }); } catch (e) {}
      if (!ok) { if (it.specimen) res.exempt++; else { res.hidden++; if (res.hiddenList.length < 60) res.hiddenList.push(where(it.el) + ' (not rendered)'); } }
      return ok;
    });
    todo.forEach(function (it) {
      var rs = rectsOf(it);
      if (!rs.length) { it.top = it.bottom = -1; return; }
      it.top = Math.min.apply(null, rs.map(function (r) { return r.top; })) + win.scrollY;
      it.bottom = Math.max.apply(null, rs.map(function (r) { return r.bottom; })) + win.scrollY;
      it.left = Math.min.apply(null, rs.map(function (r) { return r.left; })) + win.scrollX;
      it.right = Math.max.apply(null, rs.map(function (r) { return r.right; })) + win.scrollX;
    });
    todo.sort(function (a, b) { return a.top - b.top; });
    var remaining = todo.slice(), guard = 0, ctx = new Ctx(win, null), verify = opts.verify || null, vFail = 0, vPass = 0;
    res.steps = 0;                        /* scroll stops the walk made */
    while (remaining.length && guard++ < 1500) {
      var first = remaining[0]; res.steps++;
      /* Move the WINDOW first: moving inner scrollers too can drive state (a
         tab bar minimises, a header collapses), so the walk would measure a
         page it had changed. Only a retry (the item is inside something that
         scrolls) moves them, through reveal(), never scrollIntoView. */
      if (!first.tries) {
        var fb = first.el.getBoundingClientRect();
        win.scrollTo(win.scrollX, Math.max(0, win.scrollY + fb.top + fb.height / 2 - win.innerHeight / 2));
      } else {
        reveal(win, first.el);
      }
      await frames(win, 2);
      await still(win);
      await sleep(opts.settle == null ? 70 : opts.settle);
      ctx.pass = ++passSeq;
      pixelCache.clear();
      var next = [], Y0 = win.scrollY - 8, Y1 = win.scrollY + win.innerHeight + 8, X0 = win.scrollX - 8, X1 = win.scrollX + win.innerWidth + 8;
      for (var i = 0; i < remaining.length; i++) {
        var it = remaining[i], r = null;
        if (it !== first) {
          /* a cheap live check first: content that moved (an inner scroller,
             a panel that opened) is found where it is now, not where it was */
          var br = it.el.getBoundingClientRect();
          if (!(br.bottom > 0 && br.top < win.innerHeight && br.right > 0 && br.left < win.innerWidth) && !(br.width === 0 && br.height === 0)) { next.push(it); continue; }
        }
        try { r = measureItem(ctx, it); } catch (e) { r = { where: where(it.el), text: textOf(it), unmeasurable: 'threw: ' + e.message }; }
        if (r === null) {
          if (it === first) { it.tries = (it.tries || 0) + 1; if (it.tries < 2) { next.push(it); } else if (it.specimen) res.exempt++; else { res.hidden++; if (res.hiddenList.length < 60) res.hiddenList.push(where(it.el) + ' (never hit)'); } }
          else next.push(it);
          continue;
        }
        if (it.specimen) {
          /* exempt either way; a specimen below threshold is listed apart */
          res.exempt++;
          if (!r.hidden && !r.unmeasurable) { res.specimens++; if (!r.pass) { r.specimen = true; res.specimenFailures.push(r); } }
          continue;
        }
        if (r.hidden) { res.hidden++; if (res.hiddenList.length < 60) res.hiddenList.push(where(it.el) + ' (' + r.hidden + ')'); continue; }
        if (r.unmeasurable) {
          res.unmeasurable++;
          res.reasons[r.unmeasurable] = (res.reasons[r.unmeasurable] || 0) + 1;
          res.unmeasured.push(r);
          continue;
        }
        res.checked++;
        if (r.flags.art) res.onArt++;
        if (r.flags.glass) res.onGlass++;
        if (!res.worst || r.ratio < res.worst.ratio) res.worst = r;
        /* the headless runner can check a verdict against the SCREEN: it
           exposes window.__auditVerify (a CDP binding), screenshots the box
           and answers through window.__auditVerified(id, {pixel}) */
        if (verify && r.box && (!r.pass ? vFail++ < 12 : (r.flags.art || r.flags.glass) && vPass++ < 6)) {
          var fo = frameOffset(win);
          r.verified = await verify({ box: shift(r.box, fo), clip: r.clip && shift(r.clip, fo), inkDark: r.inkDark, ratio: r.ratio, where: r.where });
        }
        if (r.pass) { res.pass++; if (opts.keepPasses) res.passes.push(r); if (r.verified) res.verifiedPasses.push(r); }
        else res.failures.push(r);
      }
      /* the first item must leave the queue even if nothing could be done */
      if (next.length && next[0] === first && (first.tries || 0) >= 2) next.shift();
      remaining = next;
    }
    remaining.forEach(function (it) { if (it.specimen) res.exempt++; else res.hidden++; });
    win.scrollTo(sx, sy);
    hitStyle.remove();
    res.failures.sort(function (a, b) { return (a.ratio / a.need) - (b.ratio / b.need); });
    res.specimenFailures.sort(function (a, b) { return (a.ratio / a.need) - (b.ratio / b.need); });
    res.ms = Math.round(performance.now() - t0);
    return res;
  }

  /* ── 7 · THE KEYBOARD WALK ──────────────────────────────────────────────── */
  var FOCUSABLE = 'a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,iframe,' +
                  '[tabindex]:not([tabindex="-1"]),[contenteditable=""],[contenteditable="true"]';
  /* A control drawn around its real input: the root takes the pointer (a
     detent rail clicked anywhere) while a focusable descendant with a role a
     screen reader announces takes the keys. The root and its parts are then
     reachable through it. */
  var KEYED_PART = '[role="slider"],[role="button"],button,input[type="range"]';
  function keyedInside(el) {
    var list = el.querySelectorAll(KEYED_PART);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.tabIndex >= 0 && !c.disabled && c.matches(FOCUSABLE) && c.getClientRects().length) return true;
    }
    return false;
  }
  /* the selector with every :not(…) group taken out (nested parentheses kept together) */
  function withoutNot(sel) {
    var out = '', i = 0;
    while (i < sel.length) {
      if (sel.substr(i, 5) !== ':not(') { out += sel[i++]; continue; }
      for (var depth = 0; i < sel.length; i++) {
        if (sel[i] === '(') depth++;
        else if (sel[i] === ')' && --depth === 0) { i++; break; }
      }
    }
    return out;
  }
  function focusRules(d) {
    var out = [];
    for (var i = 0; i < d.styleSheets.length; i++) {
      var rules;
      try { rules = d.styleSheets[i].cssRules; } catch (e) { return null; }
      (function walk(list) {
        for (var j = 0; j < list.length; j++) {
          var r = list[j];
          /* read the selector BEFORE descending: a style rule has a (usually
             empty, still truthy) cssRules list since CSS nesting */
          if (r.selectorText && r.selectorText.indexOf(':focus') >= 0) {
            splitTop(r.selectorText, ',').forEach(function (sel) {
              /* ':not(:focus-visible){outline:none}' styles the UNfocused
                 state: it removes no ring, so it is not a focus rule */
              if (withoutNot(sel).indexOf(':focus') < 0) return;
              out.push({ sel: sel.replace(/:focus(-visible|-within)?/g, '') || '*', raw: sel, decl: r.style });
            });
          }
          if (r.cssRules && r.cssRules.length) walk(r.cssRules);
        }
      })(rules || []);
    }
    return out;
  }
  function keyboard(win, stops) {
    var d = win.document, rules = focusRules(d), findings = [], checked = 0;
    if (rules === null) return { unreadable: true, checked: 0, rules: 0, findings: [], note: 'the stylesheets are cross-origin to their page: serve over http' };
    d.querySelectorAll('[tabindex]').forEach(function (el) {
      var t = parseInt(el.getAttribute('tabindex'), 10);
      if (t > 0) findings.push({ kind: 'positive tabindex', el: el, detail: 'tabindex="' + t + '" moves this ahead of the entire document' });
    });
    rules.forEach(function (r) {
      var o = r.decl.outline || '', os = r.decl.outlineStyle || '', ow = r.decl.outlineWidth || '';
      var removes = /\bnone\b/.test(o) || /^0(px)?$/.test(o.trim()) || os === 'none' || ow === '0' || ow === '0px';
      if (!removes) return;
      var replaces = r.decl.boxShadow || r.decl.border || r.decl.borderColor || r.decl.borderWidth ||
        r.decl.background || r.decl.backgroundColor || r.decl.textDecoration || r.decl.textDecorationLine ||
        r.decl.color || r.decl.getPropertyValue('--focus-ring');
      /* a sibling/child selector is how a custom control draws its ring on
         another element (.switch input:focus-visible ~ .track) */
      /* …or a second rule draws the ring on this element's pseudo-element or
         a relative: '.x:focus-visible{outline:none}' + '.x:focus-visible::after{outline:…}' */
      if (!replaces) replaces = rules.some(function (o2) {
        if (o2 === r || o2.raw.indexOf(r.raw) !== 0 || o2.raw.length === r.raw.length) return false;
        var o3 = o2.decl.outline || o2.decl.outlineStyle || '';
        return (o3 && !/none/.test(o3)) || !!o2.decl.boxShadow || !!o2.decl.border || !!o2.decl.borderColor;
      });
      if (!replaces && !/[~+>]/.test(r.raw.split(':focus')[1] || '')) {
        findings.push({ kind: 'ring removed', el: null, where: r.raw, detail: r.raw + ' cancels the outline and declares nothing in its place' });
      }
    });
    var all = d.body ? d.body.querySelectorAll('*') : [], reported = [];
    var docW = Math.max(d.documentElement.scrollWidth, win.innerWidth), docH = Math.max(d.documentElement.scrollHeight, win.innerHeight);
    for (var i = 0; i < all.length; i++) {
      var el = all[i], s = win.getComputedStyle(el);
      if (s.display === 'none' || s.visibility !== 'visible') continue;
      if (el.closest('[inert]')) continue;
      var focusable = el.matches(FOCUSABLE) && !el.disabled;
      /* in the TAB ORDER, which is what these findings are about: an explicit
         negative tabindex (a roving group, a pointer-only paddle) or an inert
         ancestor takes a button out of it (it was counted, and flagged) */
      if (focusable && ((el.hasAttribute('tabindex') && el.tabIndex < 0) || el.closest('[inert]'))) focusable = false;
      var box = el.getClientRects().length > 0;
      if (s.cursor === 'pointer' && box && !focusable && el.tagName !== 'LABEL' && !el.closest(FOCUSABLE) &&
          !el.closest('label') && !el.closest('[disabled],[aria-disabled="true"]')) {
        if (!reported.some(function (p) { return p.contains(el); })) {
          reported.push(el);                /* its parts inherit the cursor: one verdict for the whole */
          if (!keyedInside(el)) findings.push({ kind: 'clickable, not focusable', el: el, detail: 'cursor:pointer, but a keyboard cannot reach it' });
        }
        continue;
      }
      if (!focusable || !box) continue;
      checked++;
      var hiddenFromAT = el.closest('[aria-hidden="true"]');
      if (hiddenFromAT) {
        findings.push({ kind: 'focusable in aria-hidden', el: el, detail: 'reachable by Tab inside aria-hidden="true" (' + where(hiddenFromAT) + '): focus lands on nothing a screen reader can name' });
        continue;
      }
      /* visually hidden on purpose (a real input under a custom switch) */
      var vhidden = /inset\(\s*50%/.test(s.clipPath || '') || /rect\(0(px)?,?\s*0/.test(s.clip || '') ||
                    (el.offsetWidth <= 1 && el.offsetHeight <= 1);
      if (vhidden) { if (stops) stops.push(el); continue; }
      var faded = null;
      for (var a = el; a && a.nodeType === 1; a = a.parentElement) {
        if (parseFloat(win.getComputedStyle(a).opacity) === 0) { faded = a; break; }
      }
      if (faded) {
        /* rescued when a focus rule brings it back (opacity), or draws the
           ring somewhere a sighted reader sees it: on an ancestor through
           :has(input:focus-visible), or on a sibling (input:focus-visible + .disc) */
        var rescued = rules.some(function (r) {
          var d2 = r.decl, o2 = d2.opacity;
          var draws = (d2.outline && !/none/.test(d2.outline)) || (d2.outlineStyle && d2.outlineStyle !== 'none') || !!d2.boxShadow;
          try {
            if (o2 && parseFloat(o2) > 0 && (el.matches(r.sel) || faded.matches(r.sel))) return true;
            if (!draws) return false;
            if (/:has\(/.test(r.raw)) return !!el.closest(r.sel);
            var m = /^(.*?):focus(-visible|-within)?\s*[~+>]/.exec(r.raw);
            return !!(m && m[1] && el.matches(m[1]));
          } catch (e) { return false; }
        });
        if (!rescued) findings.push({ kind: 'focusable, invisible', el: el, detail: 'in the tab order at opacity 0' +
          (faded === el ? '' : ' (ancestor ' + where(faded) + ')') + ', and no :focus rule brings it back' });
        else if (stops) stops.push(el);
        continue;
      }
      var rc = el.getBoundingClientRect(), left = rc.left + win.scrollX, top = rc.top + win.scrollY, off = false;
      if (rc.right + win.scrollX < 0 || rc.bottom + win.scrollY < 0 || left > docW || top > docH) {
        var scroller = null;
        for (var p = el.parentElement; p && p !== d.body; p = p.parentElement) {
          var ps = win.getComputedStyle(p);
          if (/(auto|scroll)/.test(ps.overflowX + ps.overflowY)) { scroller = p; break; }
        }
        if (!scroller) { off = true; findings.push({ kind: 'focusable off-screen', el: el, detail: 'in the tab order at x=' + Math.round(left) + ', y=' + Math.round(top) + ', outside anything that scrolls' }); }
      }
      if (stops && !off) stops.push(el);
    }
    findings.forEach(function (f) {
      if (!f.el) return;
      f.where = where(f.el);
      f.text = (f.el.getAttribute('aria-label') || f.el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
      delete f.el;
    });
    return { checked: checked, rules: rules.length, findings: findings };
  }

  /* ── 7b · THE RING ON THE SCREEN (headless: tools/run-audit.mjs --rings) ─
     A ring is only as visible as its contrast with what it is drawn over,
     and that is a question for the pixels, which a page cannot read. The
     runner exposes window.__auditRing (a CDP binding). Every control the
     keyboard walk reached is captured, its box + 8 px, unfocused (twice: a
     change no bigger than what moves between the two is not the ring) and
     then focused with focusVisible. Every pixel the focus changed is compared
     with the same pixel unfocused (WCAG 2.4.13's measure). A finding when
     focus changes nothing there ("ring not drawn"), or when the median
     changed pixel is under 3:1 and the pixels at 3:1 or more would not
     make a 2 px perimeter of the control ("ring contrast"; a faint focus
     fill beside a clear ring passes). A control with no box of its own (the
     real input under a custom switch) is captured through the nearest
     ancestor that has one. A control that moves when focused, hands focus
     on, or whose ground moves more than its ring changes it (a verdict
     that would fail there is noise) is skipped with its reason, never
     passed. */
  var ringSeq = 0;
  function hasBox(el) { var r = el.getBoundingClientRect(); return r.width >= 8 && r.height >= 8; }
  /* the control's own perimeter, px: each rounded corner of radius r is
     (2 - pi/2) r shorter than a square one (a pill: 2(w - h) + pi h). Read
     focused and unfocused, the shorter one kept: a square chart card that
     rounds its corners on focus drew a clear 2 px ring that fell 8 px short
     of the square perimeter and failed. */
  function perimeter(win, el, w, h) {
    var s = win.getComputedStyle(el), m = Math.min(w, h) / 2, cut = 0;
    ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].forEach(function (k) {
      var v = String(s[k] || '0').trim().split(/\s+/)[0], r = /%$/.test(v) ? parseFloat(v) / 100 * Math.min(w, h) : parseFloat(v) || 0;
      cut += (2 - Math.PI / 2) * Math.min(r, m);
    });
    return 2 * (w + h) - cut;
  }
  async function rings(win, shoot, stops, opts) {
    opts = opts || {};
    var d = win.document, out = { checked: 0, skipped: 0, reasons: {}, skippedList: [], findings: [], worst: null }, el = null;
    function skip(why) { out.skipped++; out.reasons[why] = (out.reasons[why] || 0) + 1; if (out.skippedList.length < 30) out.skippedList.push(where(el) + ' (' + why + ')'); }
    var noSmooth = d.createElement('style');
    noSmooth.setAttribute('data-fg3-ignore', '');
    noSmooth.textContent = 'html{scroll-behavior:auto !important}';
    d.head.appendChild(noSmooth);
    var sx = win.scrollX, sy = win.scrollY;
    for (var i = 0; i < stops.length; i++) {
      el = stops[i]; var boxEl = el;
      if (!el.isConnected || !el.getClientRects().length) { skip('no longer rendered'); continue; }
      while (boxEl && boxEl !== d.body && !hasBox(boxEl)) boxEl = boxEl.parentElement;
      if (!boxEl || boxEl === d.body) { skip('no box'); continue; }
      reveal(win, boxEl);
      await frames(win, 2);
      await still(win);
      await sleep(opts.settle == null ? 70 : opts.settle);
      var W = win.innerWidth, H = win.innerHeight, r = boxEl.getBoundingClientRect();
      if (r.width + 16 > W || r.height + 16 > H) { skip('larger than the viewport'); continue; }
      var x0 = Math.max(0, Math.floor(r.left - 8)), y0 = Math.max(0, Math.floor(r.top - 8));
      var x1 = Math.min(W, Math.ceil(r.right + 8)), y1 = Math.min(H, Math.ceil(r.bottom + 8));
      if (x1 - x0 < 8 || y1 - y0 < 8) { skip('outside the viewport'); continue; }
      var key = ++ringSeq, box = shift({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, frameOffset(win));
      var a = await shoot({ phase: 'base', key: key, box: box });
      if (!a || a.error) { skip('capture failed'); continue; }
      try { el.focus({ focusVisible: true, preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
      var focused = d.activeElement === el, fv = false;
      try { fv = el.matches(':focus-visible'); } catch (e) {}
      await frames(win, 2);
      await still(win);
      await frames(win, 1);
      var r2 = boxEl.getBoundingClientRect(), stayed = Math.abs(r2.left - r.left) < 1 && Math.abs(r2.top - r.top) < 1;
      var c = focused && fv && stayed ? await shoot({ phase: 'focus', key: key, box: box }) : null;
      var perim = perimeter(win, boxEl, r.width, r.height);
      /* whatever took the focus lets it go, or its ring is in the next capture
         (the next control waits for the page to come to rest before its own) */
      try { var ae = d.activeElement; if (ae && ae !== d.body && ae.blur) ae.blur(); } catch (e) {}
      if (!focused) { skip('focus went elsewhere'); continue; }
      if (!fv) { skip('not :focus-visible'); continue; }
      if (!stayed) { skip('moved when focused'); continue; }
      if (!c || c.error) { skip('capture failed'); continue; }
      var need = Math.round(2 * Math.min(perim, perimeter(win, boxEl, r.width, r.height)));   /* a 2 px perimeter, px² */
      var bad = !c.changed || (c.median < 3 && c.strong < need);
      /* more of the box moved on its own than the focus changed: no verdict */
      if (bad && c.unstable > c.changed) { skip('the ground keeps moving'); continue; }
      out.checked++;
      var rec = { kind: '', where: where(el), tone: opts.tone || '', median: c.median, strong: c.strong, changed: c.changed, need: need, ring: c.ring,
        text: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48) };
      if (!c.changed) {
        rec.kind = 'ring not drawn';
        rec.detail = (rec.tone ? rec.tone + ': ' : '') + 'focus changed no pixel within 8 px of the control' + (boxEl === el ? '' : ' (' + where(boxEl) + ')');
      } else if (c.median < 3 && c.strong < need) {
        rec.kind = 'ring contrast';
        rec.detail = (rec.tone ? rec.tone + ': ' : '') + 'the ring (' + c.ring + ') reads ' + c.median.toFixed(2) + ':1 against the same pixels unfocused (median of ' + c.changed +
          ' changed; ' + c.strong + ' at 3:1 or more, a 2 px perimeter is ' + need + '); needs 3:1';
      }
      if (rec.kind) { if (c.dump) rec.detail += ' [' + c.dump + ']'; out.findings.push(rec); }
      if (c.changed && (!out.worst || c.median < out.worst.median)) out.worst = rec;
    }
    win.scrollTo(sx, sy);
    noSmooth.remove();
    return out;
  }

  /* ── 8 · THE PAGE LIST ──────────────────────────────────────────────────── */
  async function expand(pattern) {
    var m = /^(.*\/)?([^/]*\*[^/]*)$/.exec(pattern);
    if (!m) return [pattern];
    var dir = m[1] || '', re = new RegExp('^' + m[2].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
    try {
      var r = await fetch(dir || './', { cache: 'no-store' });
      if (!r.ok) return [];
      var html = await r.text(), out = [], seen = {};
      html.replace(/href="([^"]+)"/g, function (_, h) {
        var name = decodeURIComponent(h.split('?')[0]).replace(/^.*\//, '');
        if (re.test(name) && !seen[name]) { seen[name] = 1; out.push(dir + name); }
        return _;
      });
      return out.sort();
    } catch (e) { return []; }
  }
  /* The manifest's address comes from the page's own link to it
     ([data-audit-manifest]) when there is one, so a build that re-bases
     links re-bases this too. Where the manifest cannot be read (a published
     copy that did not ship it), the pages this page's navigation links to
     are audited instead, and the list says so. */
  function navPages() {
    var seen = {}, out = [];
    doc.querySelectorAll('.globalnav a[href], body > footer a[href]').forEach(function (a) {
      var h = a.getAttribute('href');
      if (!h || /^(#|https?:|mailto:)/.test(h) || !/(\.html$|^\.{1,2}\/$)/.test(h.split('#')[0])) return;
      h = h.split('#')[0];
      if (!seen[h]) { seen[h] = 1; out.push({ path: h, status: 'navigation' }); }
    });
    return out;
  }
  async function pageList(url) {
    var link = doc.querySelector('[data-audit-manifest]');
    url = url || (link && link.getAttribute('href')) || 'tools/pages.json';
    var r = null;
    try { r = await fetch(url, { cache: 'no-store' }); } catch (e) { r = null; }
    if (!r || !r.ok) {
      var nav = navPages();
      if (nav.length) return nav;
      throw new Error(url + ' answered ' + (r ? r.status : 'nothing'));
    }
    var j = await r.json(), out = [];
    for (var i = 0; i < (j.pages || []).length; i++) {
      var p = j.pages[i];
      if (p.indexOf('*') >= 0) {
        var got = await expand(p);
        if (!got.length) out.push({ path: p, status: 'glob' });
        got.forEach(function (g) { out.push({ path: g, status: 'listed' }); });
      } else out.push({ path: p, status: 'listed' });
    }
    return out;
  }
  async function exists(path) {
    try {
      var r = await fetch(path, { method: 'GET', cache: 'no-store' });
      return r.ok;
    } catch (e) { return false; }
  }

  /* ── 9 · RUN ────────────────────────────────────────────────────────────── */
  function withQuery(path, q) { return path + (path.indexOf('?') >= 0 ? '&' : '?') + q; }
  function load(host, src, width, height, timeout) {
    return new Promise(function (resolve) {
      var f = doc.createElement('iframe'), done = false;
      f.setAttribute('data-audit-frame', '');
      f.setAttribute('title', 'Page under audit');
      f.setAttribute('tabindex', '-1');
      f.setAttribute('aria-hidden', 'true');
      f.style.width = width + 'px'; f.style.height = height + 'px';
      /* no UA border: its 2px inset made a 402 frame a 398 px page, and moved
         every box the runner crops 2 px off what it measured (.au-stage
         iframe clears it; the ?raw host does not) */
      f.style.border = '0';
      /* the reader's wheel and pointer pass through to the audit page: over
         the frame they would scroll the page being walked (not the one being
         read) and hover its controls into states it is not measured in */
      f.style.pointerEvents = 'none';
      function finish(err) { if (done) return; done = true; resolve({ frame: f, error: err || null }); }
      f.addEventListener('load', function () { finish(null); });
      f.addEventListener('error', function () { finish('failed to load'); });
      setTimeout(function () { finish('timed out after ' + Math.round(timeout / 1000) + 's'); }, timeout);
      f.src = src;
      host.appendChild(f);
      /* lay the frame out NOW: until the parent's next layout the page in it
         can start parsing in a viewport with no size, and a page that picks
         its layout from matchMedia at parse time (a phone-frame page homes its
         app in the phone from 735px) then builds its narrow layout at 1440,
         on some runs and not others */
      try { void f.getBoundingClientRect(); void f.contentWindow.innerWidth; } catch (e) {}
    });
  }
  async function settle(win, ms) {
    var d = win.document, t0 = performance.now();
    try { if (d.fonts && d.fonts.ready) await Promise.race([d.fonts.ready, sleep(3000)]); } catch (e) {}
    while (performance.now() - t0 < 6000) {
      var ready = d.documentElement.getAttribute('data-fg3') === 'ready' || !win.FG3;
      if (ready) break;
      await sleep(60);
    }
    /* a page that exposes window.fg3AuditReady (a Promise) is waited for:
       the self-test runs its suite first, then is measured as it is read */
    if (win.fg3AuditReady && typeof win.fg3AuditReady.then === 'function') {
      await Promise.race([win.fg3AuditReady, sleep(90000)]);
    }
    await sleep(ms);
  }
  function setTone(win, tone) {
    var F = win.FG3;
    var key = 'fg3-tone', prev = null;
    try { prev = global.localStorage.getItem(key); } catch (e) {}
    if (F && F.setTone) F.setTone(tone);
    else win.document.documentElement.setAttribute('data-tone', tone);
    /* FG3 persists the choice; this is a measurement, not the reader's
       choice, so put their stored value back exactly */
    try { if (prev == null) global.localStorage.removeItem(key); else global.localStorage.setItem(key, prev); } catch (e) {}
    return win.document.documentElement.getAttribute('data-tone');
  }
  async function run(opts) {
    opts = opts || {};
    var t0 = performance.now();
    var status = opts.onStatus || function () {};
    var list = opts.pages ? opts.pages.map(function (p) { return { path: p, status: 'listed' }; }) : await pageList(opts.manifest);
    var width = opts.width || global.innerWidth, height = opts.height || global.innerHeight;
    var tones = opts.tones || ['light', 'dark'];
    var host = opts.host || doc.body;
    if (opts.raw) {                       /* unscaled, on top, at 0,0: what a screenshot of the window sees */
      host = doc.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;background:#fff';
      doc.body.appendChild(host);
    }
    /* the runner's CDP bindings: it calls back[name](id, result) */
    function channel(name, back) {
      if (typeof global[name] !== 'function') return null;
      var seq = 0, waiting = {};
      global[back] = function (id, result) { if (waiting[id]) { waiting[id](result); delete waiting[id]; } };
      return function (info) {
        return new Promise(function (res) {
          var id = ++seq; waiting[id] = res;
          global[name](JSON.stringify(Object.assign({ id: id }, info)));
          setTimeout(function () { if (waiting[id]) { delete waiting[id]; res(null); } }, 15000);
        });
      };
    }
    var verify = channel('__auditVerify', '__auditVerified'), ringShoot = channel('__auditRing', '__auditRinged');
    var report = { pages: [], width: width, height: height, tones: tones, base: opts.base !== false, rings: !!ringShoot,
      totals: { pages: 0, missing: 0, errors: 0, checked: 0, failures: 0, unmeasurable: 0, exempt: 0, specimenFailures: 0, onArt: 0, onGlass: 0,
        worst: null, kbChecked: 0, kbFindings: 0, ringChecked: 0, ringSkipped: 0 }, done: false };
    global.__audit = report;
    for (var i = 0; i < list.length; i++) {
      var p = list[i], path = p.path, pr = { path: path, tones: {}, keyboard: null, status: 'ok', ms: 0 };
      var pt = performance.now();
      if (p.status === 'glob') { pr.status = 'missing'; pr.note = 'a glob this server cannot list'; }
      else if (!(await exists(path))) {
        /* a published copy serves the entry page at its root, not as index.html */
        var brand = path === 'index.html' && doc.querySelector('.globalnav__brand[href]');
        if (brand && await exists(brand.getAttribute('href'))) { path = pr.path = brand.getAttribute('href'); pr.label = 'index.html'; }
        else { pr.status = 'missing'; pr.note = 'not written yet (404)'; }
      }
      if (pr.status === 'missing') {
        report.totals.missing++; report.pages.push(pr); if (opts.onPage) opts.onPage(pr, i, list.length); continue;
      }
      status('Loading ' + path, i, list.length);
      var src = opts.base === false ? path : withQuery(path, 'no-fd-enhanced');
      var L = null;
      for (var attempt = 1; attempt <= 2; attempt++) {
        L = await load(host, src, width, height, 30000);
        if (!L.error) {
          try { void L.frame.contentWindow.document.body; } catch (e) { L.error = 'cross-origin: ' + e.message; }
        }
        if (!L.error) break;
        L.frame.remove();
        pr.retried = true;
      }
      if (L.error) { pr.status = 'error'; pr.note = L.error; report.totals.errors++; report.pages.push(pr); if (opts.onPage) opts.onPage(pr, i, list.length); continue; }
      var win = L.frame.contentWindow;
      try {
        await settle(win, opts.settleMs == null ? 500 : opts.settleMs);
        /* The Artifact host strips the query string, so ?no-fd-enhanced may
           not have reached the page: put it in the base experience by its own
           gate classes (every preset keys on html.fd-enhanced). */
        var gcl = win.document.documentElement.classList;
        if (opts.base !== false && gcl.contains('fd-enhanced')) {
          gcl.remove('fd-enhanced'); gcl.add('no-fd-enhanced');
          win.document.documentElement.setAttribute('data-fd-cause', 'override');
          try { if (win.ANIM && win.ANIM.refresh) win.ANIM.refresh(); } catch (e) {}
          pr.forcedBase = true;
          await sleep(300);
        }
        var errs = (win.FG3 && win.FG3.state && win.FG3.state.errors) || [];
        if (errs.length) pr.bootErrors = errs.map(function (e) { return e.step + ': ' + e.error; });
        for (var t = 0; t < tones.length; t++) {
          status('Measuring ' + path + ' ' + DOT + ' ' + tones[t], i, list.length);
          setTone(win, tones[t]);
          await sleep(420);
          if (win.LG3 && win.LG3.adapt) { try { win.LG3.adapt(); } catch (e) {} await sleep(160); }
          var c = await contrast(win, { tone: tones[t], verify: verify });
          pr.tones[tones[t]] = c;
          report.totals.checked += c.checked; report.totals.failures += c.failures.length;
          report.totals.unmeasurable += c.unmeasurable; report.totals.exempt += c.exempt;
          report.totals.specimenFailures += c.specimenFailures.length;
          report.totals.onArt += c.onArt; report.totals.onGlass += c.onGlass;
          if (c.worst && (!report.totals.worst || c.worst.ratio < report.totals.worst.ratio)) {
            report.totals.worst = Object.assign({ page: path, tone: tones[t] }, c.worst);
          }
        }
        var stops = ringShoot ? [] : null;
        pr.keyboard = keyboard(win, stops);
        /* after every contrast walk: focusing controls can leave state behind */
        if (ringShoot && stops.length) {
          pr.rings = {};
          for (var t2 = 0; t2 < tones.length; t2++) {
            status('Rings ' + path + ' ' + DOT + ' ' + tones[t2], i, list.length);
            setTone(win, tones[t2]);
            await sleep(420);
            if (win.LG3 && win.LG3.adapt) { try { win.LG3.adapt(); } catch (e) {} await sleep(160); }
            var rg = await rings(win, ringShoot, stops, { tone: tones[t2] });
            pr.rings[tones[t2]] = { checked: rg.checked, skipped: rg.skipped, reasons: rg.reasons, skippedList: rg.skippedList, worst: rg.worst };
            rg.findings.forEach(function (f) { pr.keyboard.findings.push(f); });
            report.totals.ringChecked += rg.checked; report.totals.ringSkipped += rg.skipped;
          }
        }
        report.totals.kbChecked += pr.keyboard.checked;
        report.totals.kbFindings += pr.keyboard.findings.length;
      } catch (e) {
        pr.status = 'error'; pr.note = 'the walk threw: ' + (e && e.message || e); report.totals.errors++;
      }
      pr.ms = Math.round(performance.now() - pt);
      report.totals.pages++;
      report.pages.push(pr);
      L.frame.remove();
      if (opts.onPage) opts.onPage(pr, i, list.length);
    }
    if (opts.raw && host.parentNode) host.remove();
    report.ms = Math.round(performance.now() - t0);
    report.done = true;
    report.ok = report.totals.failures === 0 && report.totals.kbFindings === 0 && report.totals.errors === 0;
    return report;
  }

  global.AUDIT = {
    run: run, pageList: pageList, contrast: contrast, keyboard: keyboard, rings: rings,
    ratio: ratio, color: color, gradientAt: gradientAt, applyFilters: applyFilters,
    version: '3.0.0',
    _internals: { collect: collect, measureItem: measureItem, Ctx: Ctx, rectsOf: rectsOf }
  };
})(window);
