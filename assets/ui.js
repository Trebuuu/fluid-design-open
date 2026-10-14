/* ═══════════════════════════════════════════════════════════════════════════
   ui.js → UI — behaviour for the components components (Fluid Design Open)
   ───────────────────────────────────────────────────────────────────────────
   Small on purpose: the platform already gives the top layer (popover,
   <dialog>), Escape, focus return and real form controls. What is left is
   what it does not do: anchoring (CSS anchor positioning where it exists, a
   measured fallback elsewhere), entrances that grow out of their trigger
   (LG3.morph for glass, a spring scale otherwise), the segmented indicator,
   steppers that repeat, the detent slider's wiring, toasts, alerts, tooltips.
   Plain script, one global, never mounts itself: FG3.boot() calls
   UI.mount(document). Works without LG3 / MOTION / SPRING / SYM (each is
   feature-detected); every component still renders from CSS alone.

   PUBLIC API (window.UI)
     mount(root=document) → n        wire everything below found under root
                                     (idempotent): .segmented, .stepper,
                                     input.slider, .slider-detent, [data-tip],
                                     [data-menu=id], [data-popover=id] (or a
                                     popovertarget pointing at .menu/.popover),
                                     .card-hover, .progress-ring[data-value]
     LEGIBILITY  text-bearing glass is stamped data-lg3-text (LG3's veil):
                 .btn-glass[data-lg3] that is not .btn-icon/.btn-primary and
                 .segmented-glass (mount, segmented), toasts; glass menus,
                 popovers and alerts get data-lg3-text="dense". An author's
                 own data-lg3-text is kept. Glass text UI never sees takes
                 fg3-components.css's fallback share instead.
     anchor(panel, trigger, {placement:'bottom'|'top'|'left'|'right',
            align:'start'|'center'|'end', gap:8, native:true})
                                     → {placement, path:'css'|'js', rect}
                                     CSS anchor positioning when supported
                                     (flips itself), else measured fixed
                                     left/top that flips and clamps to an 8px
                                     margin. Writes transform-origin at the
                                     trigger and [data-placed]. ?ui-anchor=js
                                     forces the fallback.
     menu(trigger, panel, opts) / popover(trigger, panel, opts)
                                     opts {placement, align, gap, native, spring}
                                     → {open(focus:'first'|'last'), close(returnFocus),
                                        toggle(), isOpen, state, configure(opts), destroy()}
                                     One controller per panel: calling again on a
                                     wired panel (e.g. after UI.mount) returns it
                                     with the new opts MERGED in (later keys win).
                                     popover="manual" + own light dismiss so
                                     the exit can animate. Glass panel + glass
                                     trigger sharing data-lg3-id → LG3.morph
                                     (the button BECOMES the menu); glass panel
                                     otherwise → LG3.materialize from the
                                     trigger side; opaque → spring scale from
                                     the trigger. Menu keys: ↑ ↓ Home End,
                                     type-ahead, Enter/Space, Esc, Tab.
                                     Emits 'ui:select' {item, value} on the menu.
     toast(message, {kind:'ok'|'bad'|'info', action:{label, run}, duration,
           glass:true}) → {el, dismiss()}
                                     glass capsule that rises on a spring and
                                     dematerializes out; actionable toasts wait.
     alert({title, message, actions:[{label, value, role:'default'|'cancel'|
            'destructive'}], from, glass:true, container}) → Promise<value>
                                     centred glass alert grown from `from`
                                     (morph if `from` is glass with a
                                     data-lg3-id). Esc resolves the cancel value.
                                     container: an element (pane, device screen)
                                     to hold it — show() in place, not the top
                                     layer, over a .alert-scrim scoped to that box
                                     ([data-alert-scoped]); Tab loops inside;
                                     materializes (no morph). A static container
                                     is made relative while it is open.
     tooltip(el, text?) · tooltips(root)   420ms in, instant out, on focus too
     segmented(host, {onChange}) → {index, items, select(i,{focus,silent}), place(),
                                     configure(opts), destroy()}
                                     calling again on a wired host returns the same
                                     controller with the new opts merged in
                                     roles: tablist→aria-selected, radiogroup→
                                     aria-checked, else aria-pressed. Arrow keys
                                     (RTL aware), Home/End, roving tabindex,
                                     aria-controls panels toggled [hidden].
                                     Indicator measured by a ResizeObserver +
                                     visibilitychange + fonts.ready, armed one
                                     frame after first placement; if it cannot
                                     be measured the selected item paints the
                                     fill itself (no [data-seg-ready]).
                                     Press lifts, drag scrubs (select on release).
                                     Emits 'change' {index, value, item}.
     stepper(el) → {value, set(v)}   data-min/-max/-step/-value; repeats while
                                     held (450ms, then 90→45ms); arrows/Home/End;
                                     emits 'change' {value}.
     slider(input) → {paint()}       writes --v (the filled part)
     detent(el, {detents, labels, value, stretchMax}) → handle
                                     MOTION.detent wiring (data-detents,
                                     data-labels, data-value); keyboard-only
                                     fallback without MOTION. Emits 'change'
                                     {value, index, label}. Writes --at (its
                                     detent) on each child of a following
                                     .slider-detent-labels that has none.
     progress(el, value|null)        --value + aria-valuenow on .progress-ring,
                                     value on <progress>; null = indeterminate
     reduced                         MediaQueryList (prefers-reduced-motion)
   EVENTS  change (segmented, stepper, detent) · ui:select (menu) · native
           toggle on popovers
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var doc = global.document;
  var RM = (function () {
    try { return global.matchMedia('(prefers-reduced-motion: reduce)'); }
    catch (e) { return { matches: false, addEventListener: function () {} }; }
  })();
  var uid = 0;
  function reduced() { return RM.matches; }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ident(el, p) { if (!el.id) el.id = (p || 'ui') + '-' + (++uid); return el.id; }
  function assign(to, from) { if (from) for (var k in from) if (Object.prototype.hasOwnProperty.call(from, k)) to[k] = from[k]; return to; }
  function qsa(root, sel) {
    var out = [].slice.call((root || doc).querySelectorAll(sel));
    if (root && root.nodeType === 1 && root.matches(sel)) out.unshift(root);
    return out;
  }
  function emit(el, name, detail) {
    try { el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail })); } catch (e) {}
  }
  function frame(fn) {
    if (global.requestAnimationFrame && doc.visibilityState !== 'hidden') requestAnimationFrame(fn);
    else setTimeout(fn, 16);
  }
  function isRTL(el) { try { return getComputedStyle(el).direction === 'rtl'; } catch (e) { return false; } }
  function lg3() { return global.LG3 && global.LG3.morph ? global.LG3 : null; }
  /* text on glass asks LG3 for its legibility veil (data-lg3-text: the engine
     raises the smallest share that holds 4.5:1 over what is actually behind
     it; "dense" holds it for the secondary inks too). An author's own value
     is kept. */
  function textGlass(el, dense) {
    if (el && el.hasAttribute('data-lg3') && !el.hasAttribute('data-lg3-text')) el.setAttribute('data-lg3-text', dense ? 'dense' : '');
  }

  /* ─────────────────────────────────────────────────────────────────────────
     1 · ANCHOR
     Native anchor positioning where it exists: it re-places on scroll and
     flips at the viewport edge with no script. Elsewhere — and whenever LG3
     will morph the panel, because a morph works in viewport coordinates and
     inline left/top would be read relative to a position-area cell — a
     measured fixed placement that flips and clamps.
     ───────────────────────────────────────────────────────────────────────── */
  var ANCHOR_CSS = (function () {
    try { return CSS.supports('anchor-name: --a') && CSS.supports('position-area: block-end'); }
    catch (e) { return false; }
  })();
  var FORCE_JS = /[?&]ui-anchor=js\b/.test(global.location ? global.location.search : '');
  var AREA = {
    bottom: { start: 'block-end span-inline-end', center: 'block-end', end: 'block-end span-inline-start' },
    top: { start: 'block-start span-inline-end', center: 'block-start', end: 'block-start span-inline-start' },
    right: { start: 'inline-end span-block-end', center: 'inline-end', end: 'inline-end span-block-start' },
    left: { start: 'inline-start span-block-end', center: 'inline-start', end: 'inline-start span-block-start' }
  };
  var GAP_SIDE = { bottom: 'marginTop', top: 'marginBottom', right: 'marginInlineStart', left: 'marginInlineEnd' };

  function clearNative(s) {
    ['position-anchor', 'position-area', 'position-try-fallbacks', 'position-try-options'].forEach(function (p) { s.removeProperty(p); });
    s.marginTop = s.marginBottom = s.marginInlineStart = s.marginInlineEnd = '';
  }
  function anchor(panel, trigger, opts) {
    opts = opts || {};
    var place = opts.placement || panel.getAttribute('data-placement') || 'bottom';
    var align = opts.align || panel.getAttribute('data-align') || 'start';
    var gap = opts.gap != null ? +opts.gap : num(panel.getAttribute('data-gap'), 8);
    if (!AREA[place]) place = 'bottom';
    if (!AREA[place][align]) align = 'start';
    var s = panel.style, useCSS = opts.native !== false && ANCHOR_CSS && !FORCE_JS;
    s.position = 'fixed'; s.inset = 'auto'; s.margin = '0';
    if (useCSS) {
      var name = trigger.style.getPropertyValue('anchor-name');
      if (!name) { name = '--ui-anchor-' + (++uid); trigger.style.setProperty('anchor-name', name); }
      s.left = s.top = '';
      s.setProperty('position-anchor', name);
      s.setProperty('position-area', AREA[place][align]);
      var flips = place === 'top' || place === 'bottom' ? 'flip-block, flip-inline, flip-block flip-inline' : 'flip-inline, flip-block, flip-inline flip-block';
      s.setProperty('position-try-fallbacks', flips);
      if (!s.getPropertyValue('position-try-fallbacks')) s.setProperty('position-try-options', flips);
      s[GAP_SIDE[place]] = gap + 'px';
      panel.setAttribute('data-anchor', 'css');
    } else {
      clearNative(s);
      s.left = '0px'; s.top = '0px';
      var r0 = panel.getBoundingClientRect(), t0 = trigger.getBoundingClientRect();
      var W = r0.width, H = r0.height, vw = global.innerWidth, vh = global.innerHeight, M = 8, x, y, p = place;
      var a = align;
      if (isRTL(trigger)) a = a === 'start' ? 'end' : a === 'end' ? 'start' : a;
      if (p === 'bottom' || p === 'top') {
        var below = vh - t0.bottom - gap, above = t0.top - gap;
        if (p === 'bottom' && below < H && above > below) p = 'top';
        else if (p === 'top' && above < H && below > above) p = 'bottom';
        y = p === 'bottom' ? t0.bottom + gap : t0.top - gap - H;
        x = a === 'start' ? t0.left : a === 'end' ? t0.right - W : t0.left + t0.width / 2 - W / 2;
      } else {
        var right = vw - t0.right - gap, left = t0.left - gap;
        if (isRTL(trigger)) p = p === 'right' ? 'left' : 'right';
        if (p === 'right' && right < W && left > right) p = 'left';
        else if (p === 'left' && left < W && right > left) p = 'right';
        x = p === 'right' ? t0.right + gap : t0.left - gap - W;
        y = align === 'start' ? t0.top : align === 'end' ? t0.bottom - H : t0.top + t0.height / 2 - H / 2;
      }
      x = clamp(x, M, Math.max(M, vw - W - M)); y = clamp(y, M, Math.max(M, vh - H - M));
      s.left = Math.round(x) + 'px'; s.top = Math.round(y) + 'px';
      panel.setAttribute('data-anchor', 'js');
    }
    /* where it actually landed (either path), for the grow-from-trigger origin */
    var t = trigger.getBoundingClientRect(), r = panel.getBoundingClientRect();
    var placed = r.top >= t.bottom - 1 ? 'bottom' : r.bottom <= t.top + 1 ? 'top' : r.left >= t.right - 1 ? 'right' : 'left';
    s.transformOrigin = clamp(t.left + t.width / 2 - r.left, 0, r.width).toFixed(1) + 'px ' +
                        clamp(t.top + t.height / 2 - r.top, 0, r.height).toFixed(1) + 'px';
    panel.setAttribute('data-placed', placed);
    return { placement: placed, path: useCSS ? 'css' : 'js', rect: r };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     2 · SPRING ENTRANCES for opaque panels (glass uses LG3). MOTION.spring is
     re-aimable and keeps velocity, so an open interrupted by a close turns
     round where it is. Reduced motion or no MOTION: it just happens.
     ───────────────────────────────────────────────────────────────────────── */
  function springTo(el, props, done) {
    var M = global.MOTION, keys = Object.keys(props), left = keys.length;
    if (!M || !M.spring || reduced()) {
      keys.forEach(function (k) {
        if (k === 'scale') el.style.transform = props[k].to === 1 ? '' : 'scale(' + props[k].to + ')';
        else if (k === 'opacity') el.style.opacity = props[k].to === 1 ? '' : String(props[k].to);
      });
      if (done) done();
      return;
    }
    keys.forEach(function (k) {
      var o = props[k];
      M.spring(el, k, o.to, { from: o.from, spring: o.spring || 'snappy', done: function () { if (--left === 0 && done) done(); } });
    });
  }
  function springIn(el) {
    return new Promise(function (res) {
      springTo(el, { scale: { from: 0.6, to: 1, spring: 'snappy' }, opacity: { from: 0, to: 1, spring: 'smooth' } }, res);
    });
  }
  function springOut(el) {
    return new Promise(function (res) {
      springTo(el, { scale: { to: 0.88, spring: 'snap' }, opacity: { to: 0, spring: 'snap' } }, res);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     3 · MENU / POPOVER — one controller. popover="manual": the top layer and
     the focus behaviour of a popover, but the CLOSE is ours, so a glass menu
     can morph back into its button before it leaves.
     ───────────────────────────────────────────────────────────────────────── */
  function focusables(root) {
    return [].filter.call(root.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'),
      function (e) { return !e.disabled && e.getAttribute('aria-disabled') !== 'true' && e.offsetParent !== null; });
  }
  function menuItems(panel) {
    return [].filter.call(panel.querySelectorAll('[role^="menuitem"],.menu-item'),
      function (e) { return !e.disabled && e.getAttribute('aria-disabled') !== 'true'; });
  }
  function controller(trigger, panel, o, kind) {
    /* already wired (UI.mount got there first): the SAME controller, with the
       new opts merged in — they are read at open time, so they take effect */
    if (panel.__ui) { if (o) panel.__ui.configure(o); return panel.__ui; }
    var opts = assign({}, o);
    var L = lg3(), glass = panel.hasAttribute('data-lg3'), state = 'closed';
    panel.setAttribute('popover', 'manual');
    if (kind === 'menu' && !panel.getAttribute('role')) panel.setAttribute('role', 'menu');
    if (kind === 'popover' && !panel.getAttribute('role')) panel.setAttribute('role', 'dialog');
    if (kind === 'menu') [].forEach.call(panel.querySelectorAll('.menu-item:not([role])'), function (i) { i.setAttribute('role', 'menuitem'); });
    [].forEach.call(panel.querySelectorAll('.menu-item'), function (i) { i.tabIndex = -1; });
    [].forEach.call(panel.querySelectorAll('.menu-separator:not([role])'), function (i) { i.setAttribute('role', 'separator'); });
    trigger.setAttribute('aria-haspopup', kind === 'menu' ? 'menu' : 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', ident(panel, kind));
    if (glass) { panel.setAttribute('data-lg3-away', ''); textGlass(panel, true); }
    function morphs() {
      var id = panel.getAttribute('data-lg3-id');
      return !!(L && glass && id && trigger.hasAttribute('data-lg3') && trigger.getAttribute('data-lg3-id') === id);
    }
    function isOpen() { return state === 'open' || state === 'opening'; }
    function focusIn(which) {
      if (kind === 'menu') {
        var it = menuItems(panel);
        var f = which === 'last' ? it[it.length - 1] : it[0];
        if (f) f.focus({ preventScroll: true });
      } else {
        var fs = focusables(panel);
        if (fs[0]) fs[0].focus({ preventScroll: true });
        else { if (!panel.hasAttribute('tabindex')) panel.tabIndex = -1; panel.focus({ preventScroll: true }); }
      }
    }
    function open(which) {
      if (isOpen()) return Promise.resolve();
      state = 'opening';
      if (!panel.matches(':popover-open')) { try { panel.showPopover(); } catch (e) {} }
      var m = morphs();
      anchor(panel, trigger, { placement: opts.placement, align: opts.align, gap: opts.gap, native: m ? false : opts.native });
      trigger.setAttribute('aria-expanded', 'true');
      panel.setAttribute('data-open', '');
      listen(true);
      var p;
      if (m) p = L.morph(trigger, panel, opts.spring || { duration: 0.5, bounce: 0.18 });
      else if (glass && L) { if (L.refresh) L.refresh(panel); p = L.materialize(panel, { duration: 0.45, bounce: 0.12 }); }
      else p = springIn(panel);
      focusIn(which);
      return Promise.resolve(p).then(function () { if (state === 'opening') state = 'open'; });
    }
    function close(returnFocus) {
      if (!isOpen()) return Promise.resolve();
      state = 'closing';
      listen(false);
      trigger.setAttribute('aria-expanded', 'false');
      panel.removeAttribute('data-open');
      var p;
      if (morphs()) p = L.morph(panel, trigger, { duration: 0.4, bounce: 0 });
      else if (glass && L) p = L.dematerialize(panel, { duration: 0.3, bounce: 0 });
      else p = springOut(panel);
      if (returnFocus !== false) trigger.focus({ preventScroll: true });
      return Promise.resolve(p).then(function () {
        if (state !== 'closing') return;              /* reopened meanwhile */
        state = 'closed';
        try { panel.hidePopover(); } catch (e) {}
        if (glass) panel.setAttribute('data-lg3-away', '');
      });
    }
    function toggle() { return isOpen() ? close(true) : open('first'); }

    /* light dismiss + keys, only while open */
    function onDown(e) { if (!panel.contains(e.target) && !trigger.contains(e.target)) close(false); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
      if (kind !== 'menu') return;
      var it = menuItems(panel), i = it.indexOf(doc.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = e.key === 'ArrowDown' ? i + 1 : i - 1;
        if (it.length) it[(n + it.length) % it.length].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault(); if (it.length) it[e.key === 'Home' ? 0 : it.length - 1].focus();
      } else if (e.key === 'Tab') {
        close(true);                                     /* focus moves on from the trigger */
      } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var ch = e.key.toLowerCase();
        for (var k = 1; k <= it.length; k++) {
          var cand = it[(i + k) % it.length];
          if ((cand.textContent || '').trim().toLowerCase().indexOf(ch) === 0) { cand.focus(); break; }
        }
      }
    }
    function onFocusOut(e) {
      var to = e.relatedTarget;
      if (to && !panel.contains(to) && !trigger.contains(to)) close(false);
    }
    function onScroll() {
      if (state === 'open' && panel.getAttribute('data-anchor') === 'js' && !panel.hasAttribute('data-lg3-morphing'))
        anchor(panel, trigger, { placement: opts.placement, align: opts.align, gap: opts.gap, native: false });
    }
    function listen(on) {
      var f = on ? 'addEventListener' : 'removeEventListener';
      doc[f]('pointerdown', onDown, true);
      panel[f]('keydown', onKey);
      panel[f]('focusout', onFocusOut);
      global[f]('scroll', onScroll, { passive: true, capture: true });
      global[f]('resize', onScroll);
    }
    function onItem(e) {
      var item = e.target.closest('[role^="menuitem"],.menu-item');
      if (!item || !panel.contains(item) || item.disabled || item.getAttribute('aria-disabled') === 'true') return;
      var role = item.getAttribute('role');
      if (role === 'menuitemcheckbox') item.setAttribute('aria-checked', String(item.getAttribute('aria-checked') !== 'true'));
      if (role === 'menuitemradio') {
        var grp = item.closest('[role="group"]') || panel;
        [].forEach.call(grp.querySelectorAll('[role="menuitemradio"]'), function (r) { r.setAttribute('aria-checked', String(r === item)); });
      }
      emit(panel, 'ui:select', { item: item, value: item.getAttribute('data-value') || (item.textContent || '').trim() });
      if (!item.hasAttribute('data-keep-open')) close(true);
    }
    function onTrigger(e) { e.preventDefault(); if (isOpen()) close(true); else open('first'); }
    function onTriggerKey(e) {
      if (kind === 'menu' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault(); if (!isOpen()) open(e.key === 'ArrowUp' ? 'last' : 'first'); else focusIn(e.key === 'ArrowUp' ? 'last' : 'first');
      }
    }
    trigger.addEventListener('click', onTrigger);
    trigger.addEventListener('keydown', onTriggerKey);
    if (kind === 'menu') panel.addEventListener('click', onItem);
    var api = {
      open: open, close: close, toggle: toggle, trigger: trigger, panel: panel,
      get isOpen() { return isOpen(); }, get state() { return state; },
      configure: function (x) { assign(opts, x); return api; },
      destroy: function () {
        listen(false);
        trigger.removeEventListener('click', onTrigger); trigger.removeEventListener('keydown', onTriggerKey);
        panel.removeEventListener('click', onItem); panel.__ui = null;
      }
    };
    panel.__ui = api;
    return api;
  }
  function menu(trigger, panel, opts) { return controller(trigger, panel, opts, 'menu'); }
  function popover(trigger, panel, opts) { return controller(trigger, panel, opts, 'popover'); }

  /* ─────────────────────────────────────────────────────────────────────────
     4 · TOOLTIP — delayed in (a pointer crossing the control is not asking),
     immediate out, on keyboard focus too; the text is the accessible name
     when the control has none, otherwise its description.
     ───────────────────────────────────────────────────────────────────────── */
  var tipEl = null, tipTimer = 0, tipFor = null;
  function tipHost() {
    if (!tipEl || !tipEl.isConnected) {
      tipEl = doc.createElement('div');
      tipEl.className = 'tooltip'; tipEl.id = 'ui-tooltip';
      tipEl.setAttribute('popover', 'manual'); tipEl.setAttribute('role', 'tooltip');
      doc.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function tooltip(el, text) {
    if (text != null) el.setAttribute('data-tip', text);
    if (el.__uiTip) return el.__uiTip;
    if (!el.getAttribute('aria-label') && !(el.textContent || '').trim()) el.setAttribute('aria-label', el.getAttribute('data-tip'));
    function show(delay) {
      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () {
        var t = tipHost(), words = el.getAttribute('data-tip');
        if (!words) return;
        t.textContent = words;
        try { if (!t.matches(':popover-open')) t.showPopover(); } catch (e) {}
        anchor(t, el, { placement: el.getAttribute('data-tip-placement') || 'top', align: 'center', gap: 8 });
        tipFor = el;
        if (el.getAttribute('aria-label') !== words) el.setAttribute('aria-describedby', t.id);
      }, delay);
    }
    function hide() {
      clearTimeout(tipTimer);
      if (tipEl && tipFor === el) {
        try { tipEl.hidePopover(); } catch (e) {}
        tipFor = null; el.removeAttribute('aria-describedby');
      }
    }
    el.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') show(420); });
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focusin', function () { if (el.matches(':focus-visible')) show(120); });
    el.addEventListener('focusout', hide);
    el.addEventListener('pointerdown', hide);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    el.__uiTip = { show: function () { show(0); }, hide: hide };
    return el.__uiTip;
  }
  function tooltips(root) { return qsa(root || doc, '[data-tip]').map(function (el) { return tooltip(el); }).length; }

  /* ─────────────────────────────────────────────────────────────────────────
     5 · TOAST — floating chrome: a glass capsule that rises on a spring and
     leaves by dematerializing (never opacity on glass). The host is a manual
     popover re-raised per toast, so a toast about what a modal just did
     shows above that modal.
     ───────────────────────────────────────────────────────────────────────── */
  var toastHost = null;
  var GLYPH = { ok: 'checkmark-circle', bad: 'exclamation-triangle', info: 'info' };
  function toastsHost() {
    if (!toastHost || !toastHost.isConnected) {
      toastHost = doc.querySelector('.toasts');
      if (!toastHost) {
        toastHost = doc.createElement('div');
        toastHost.className = 'toasts';
        doc.body.appendChild(toastHost);
      }
      toastHost.setAttribute('popover', 'manual');
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
    }
    return toastHost;
  }
  function raise(host) {
    try { if (host.matches(':popover-open')) host.hidePopover(); host.showPopover(); } catch (e) {}
  }
  function toast(message, opts) {
    opts = opts || {};
    var host = toastsHost(), L = global.LG3, M = global.MOTION, S = global.SYM;
    var el = doc.createElement('div'), kind = opts.kind || 'info', glass = opts.glass !== false && !!(L && L.mount);
    el.className = 'toast toast-' + kind;
    if (kind === 'bad') el.setAttribute('role', 'alert');
    if (glass) {
      el.setAttribute('data-lg3', ''); el.setAttribute('data-lg3-recipe', 'pill');
      el.setAttribute('data-lg3-adaptive', ''); el.setAttribute('data-lg3-priority', '0');
      textGlass(el);
    }
    if (S && S.build && S.has && S.has(GLYPH[kind])) {
      if (S.sprite) S.sprite(doc);
      el.appendChild(S.build(GLYPH[kind], 'sym'));
    }
    var span = doc.createElement('span'); span.textContent = message; el.appendChild(span);
    var timer = 0, gone = false;
    function dismiss() {
      if (gone) return; gone = true;
      clearTimeout(timer);
      var done = function () {
        if (!el.isConnected) return;
        el.remove(); if (!host.querySelector('.toast')) { try { host.hidePopover(); } catch (e) {} }
      };
      setTimeout(done, 1200);                 /* the exit animates on frames; removal must not wait for them */
      if (M && M.glide && !reduced()) M.glide(el, 'y', 14, { spring: 'snap' });
      if (glass && L.dematerialize) L.dematerialize(el, { duration: 0.32, bounce: 0 }).then(done);
      else if (reduced()) done();
      else springTo(el, { opacity: { to: 0, spring: 'snap' } }, done);
    }
    if (opts.action) {
      var b = doc.createElement('button');
      b.type = 'button'; b.className = 'toast-action'; b.textContent = opts.action.label;
      b.addEventListener('click', function () { try { opts.action.run && opts.action.run(); } finally { dismiss(); } });
      el.appendChild(b);
    }
    host.appendChild(el);
    raise(host);
    if (glass) { L.mount(el); L.materialize(el, { duration: 0.5, bounce: 0.2 }); }
    if (M && M.glide) M.glide(el, 'y', 0, { from: 28, spring: 'snappy' });
    /* An actionable toast waits for its decision; an informational one waits
       longer than its own reading time, and pauses while it is looked at. */
    function arm() {
      if (opts.action || gone) return;
      clearTimeout(timer);
      timer = setTimeout(dismiss, opts.duration || Math.min(8000, 2200 + String(message).length * 45));
    }
    el.addEventListener('pointerenter', function () { clearTimeout(timer); });
    el.addEventListener('pointerleave', arm);
    el.addEventListener('focusin', function () { clearTimeout(timer); });
    el.addEventListener('focusout', arm);
    arm();
    return { el: el, dismiss: dismiss };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     6 · ALERT — centred glass, grown out of the control that presented
     it; Esc (the dialog's cancel) resolves the cancel action.
     ───────────────────────────────────────────────────────────────────────── */
  function alertBox(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var L = global.LG3, glass = o.glass !== false && !!(L && L.mount);
      var d = doc.createElement('dialog');
      d.className = 'alert'; d.setAttribute('role', 'alertdialog');
      if (glass) { d.setAttribute('data-lg3', ''); d.setAttribute('data-lg3-size', 'large'); textGlass(d, true); }
      var h = doc.createElement('h2'); h.className = 'alert-title'; h.textContent = o.title || ''; d.appendChild(h);
      d.setAttribute('aria-labelledby', ident(h, 'alert-t'));
      if (o.message) {
        var p = doc.createElement('p'); p.className = 'alert-message'; p.textContent = o.message; d.appendChild(p);
        d.setAttribute('aria-describedby', ident(p, 'alert-m'));
      }
      var acts = o.actions && o.actions.length ? o.actions : [{ label: 'OK', value: true, role: 'default' }];
      var row = doc.createElement('div'); row.className = 'alert-actions'; d.appendChild(row);
      var cancelValue = null, focusBtn = null;
      acts.forEach(function (a) {
        var b = doc.createElement('button');
        b.type = 'button'; b.className = 'btn btn-l' + (a.role === 'default' ? ' btn-primary' : '');
        if (a.role) b.setAttribute('data-role', a.role);
        b.textContent = a.label;
        b.addEventListener('click', function () { finish(a.value); });
        row.appendChild(b);
        if (a.role === 'cancel') cancelValue = a.value;
        if (a.role === 'default' || (!focusBtn && a.role !== 'destructive')) focusBtn = b;
      });
      /* {container}: a pane or a device screen owns the alert — show() in
         place (not the top layer) over a scrim scoped to that box; Esc and a
         Tab loop are ours, since a non-modal dialog does neither. No morph
         there: LG3.morph works in viewport coordinates, a scaled device
         screen does not. */
      var box = o.container && o.container.nodeType === 1 ? o.container : null, scrim = null, boxPos = null;
      var from = o.from || null, id = from && from.getAttribute('data-lg3-id');
      var morph = !box && glass && from && id && from.hasAttribute('data-lg3');
      if (morph) d.setAttribute('data-lg3-id', id);
      if (box) {
        d.setAttribute('data-alert-scoped', '');
        if (getComputedStyle(box).position === 'static') { boxPos = box.style.position; box.style.position = 'relative'; }
        scrim = doc.createElement('div'); scrim.className = 'alert-scrim'; scrim.setAttribute('aria-hidden', 'true');
        box.appendChild(scrim); box.appendChild(d);
        d.show();
        void scrim.offsetWidth; scrim.setAttribute('data-open', '');   /* fade in from the committed 0 */
        d.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(cancelValue); return; }
          if (e.key !== 'Tab') return;
          var fs = focusables(d), n = fs.length, i = fs.indexOf(doc.activeElement);
          if (!n) return;
          e.preventDefault();
          fs[i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? n - 1 : 1)) % n].focus({ preventScroll: true });
        });
      } else {
        doc.body.appendChild(d);
        d.showModal();
      }
      if (glass) L.mount(d);
      if (from && !morph) {
        var fr = from.getBoundingClientRect(), dr = d.getBoundingClientRect();
        d.style.transformOrigin = clamp(fr.left + fr.width / 2 - dr.left, 0, dr.width) + 'px ' + clamp(fr.top + fr.height / 2 - dr.top, 0, dr.height) + 'px';
      }
      if (morph) L.morph(from, d, { duration: 0.5, bounce: 0.16 });
      else if (glass) L.materialize(d, { duration: 0.45, bounce: 0.14 });
      else springIn(d);
      (focusBtn || row.firstChild).focus({ preventScroll: true });
      var done = false;
      d.addEventListener('cancel', function (e) { e.preventDefault(); finish(cancelValue); });
      function finish(v) {
        if (done) return; done = true;
        if (scrim) scrim.removeAttribute('data-open');
        var end = function () {
          try { d.close(); } catch (e) {}
          d.remove();
          if (scrim) scrim.remove();
          if (boxPos != null) box.style.position = boxPos;
          if (from && from.isConnected) from.focus({ preventScroll: true });
          resolve(v);
        };
        if (morph) L.morph(d, from, { duration: 0.4, bounce: 0 }).then(end);
        else if (glass) L.dematerialize(d, { duration: 0.28, bounce: 0 }).then(end);
        else springOut(d).then(end);
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     7 · SEGMENTED — the sliding pill (a tab nav) and the merged glass
     lens. Placement is MEASURED (offsetLeft/offsetWidth of the selected item),
     re-measured whenever anything could have moved it; the first placement
     snaps and transitions are armed one frame later, so a page never loads
     with a pill flying in from the left. If there is nothing to measure (a
     hidden tab, display:none ancestor) [data-seg-ready] is dropped and the
     selected item paints the fill itself.
     ───────────────────────────────────────────────────────────────────────── */
  function segmented(host, o) {
    /* already wired: the same controller, new opts (onChange) merged in */
    if (host.__uiSeg) { if (o) host.__uiSeg.configure(o); return host.__uiSeg; }
    var opts = assign({}, o);
    var role = host.getAttribute('role');
    var attr = role === 'tablist' ? 'aria-selected' : role === 'radiogroup' ? 'aria-checked' : 'aria-pressed';
    var itemRole = role === 'tablist' ? 'tab' : role === 'radiogroup' ? 'radio' : null;
    var glass = host.classList.contains('segmented-glass');
    if (glass) textGlass(host);
    function items() {
      return [].filter.call(host.children, function (c) {
        return c.tagName === 'BUTTON' || c.tagName === 'A' || (itemRole && c.getAttribute('role') === itemRole);
      });
    }
    var list = items();
    var idx = -1;
    list.forEach(function (it, i) {
      if (itemRole && !it.getAttribute('role')) it.setAttribute('role', itemRole);
      if (it.tagName === 'BUTTON' && !it.getAttribute('type')) it.type = 'button';
      if (idx < 0 && (it.getAttribute(attr) === 'true' || it.getAttribute('aria-current') === 'page' || it.getAttribute('aria-current') === 'true')) idx = i;
    });
    if (idx < 0) idx = 0;
    var ind = host.querySelector(':scope > .segmented-indicator'), created = false;
    if (!ind) {
      ind = doc.createElement('span'); ind.className = 'segmented-indicator';
      host.insertBefore(ind, host.firstChild); created = true;
    }
    ind.setAttribute('aria-hidden', 'true');
    if (glass) {
      var track = host.querySelector(':scope > .segmented-track');
      if (!track) {
        track = doc.createElement('span'); track.className = 'segmented-track';
        host.insertBefore(track, host.firstChild); created = true;
      }
      track.setAttribute('aria-hidden', 'true');
      if (!track.hasAttribute('data-lg3-shape')) { track.setAttribute('data-lg3-shape', ''); created = true; }
      if (!ind.hasAttribute('data-lg3-shape')) { ind.setAttribute('data-lg3-shape', ''); created = true; }
      if (!host.hasAttribute('data-lg3-container')) { host.setAttribute('data-lg3-container', '10'); created = true; }
    }

    function overflow() {
      var sw = host.scrollWidth, cw = host.clientWidth;
      if (sw <= cw + 1) { host.removeAttribute('data-overflow'); return; }
      var x = Math.abs(host.scrollLeft), atStart = x < 2, atEnd = x > sw - cw - 2;
      host.setAttribute('data-overflow', atStart ? 'end' : atEnd ? 'start' : 'both');
    }
    function reveal(it) {
      var sw = host.scrollWidth, cw = host.clientWidth;
      if (sw <= cw + 1) return;
      var l = it.offsetLeft - 24, r = it.offsetLeft + it.offsetWidth + 24;
      if (l < host.scrollLeft) host.scrollTo({ left: l, behavior: reduced() ? 'auto' : 'smooth' });
      else if (r > host.scrollLeft + cw) host.scrollTo({ left: r - cw, behavior: reduced() ? 'auto' : 'smooth' });
    }
    function place(animate, at) {
      var it = list[at == null ? idx : at];
      if (!it || !host.isConnected) return false;
      var w = it.offsetWidth;
      if (!w || !host.offsetWidth) {
        host.removeAttribute('data-seg-ready'); host.removeAttribute('data-seg-armed');
        return false;
      }
      var snap = !animate || !host.hasAttribute('data-seg-armed');
      if (snap) host.setAttribute('data-seg-snap', '');
      host.style.setProperty('--seg-x', it.offsetLeft + 'px');
      host.style.setProperty('--seg-w', w + 'px');
      host.setAttribute('data-seg-ready', '');
      if (snap) {
        void ind.offsetWidth;                                   /* commit the snapped box */
        frame(function () { host.removeAttribute('data-seg-snap'); host.setAttribute('data-seg-armed', ''); });
      }
      overflow();
      return true;
    }
    function paint() {
      list.forEach(function (it, i) {
        var on = i === idx;
        it.setAttribute(attr, String(on));
        it.tabIndex = on ? 0 : -1;
        var pid = it.getAttribute('aria-controls'), panel = pid && doc.getElementById(pid);
        if (panel && role === 'tablist') panel.hidden = !on;
      });
    }
    function select(i, o) {
      o = o || {};
      i = clamp(i | 0, 0, list.length - 1);
      var it = list[i];
      if (!it || it.disabled || it.getAttribute('aria-disabled') === 'true') return;
      var changed = i !== idx;
      idx = i; paint(); place(true); reveal(it);
      if (o.focus) it.focus({ preventScroll: true });
      if (changed && !o.silent) {
        var detail = { index: i, value: it.getAttribute('data-value') || (it.textContent || '').trim(), item: it };
        emit(host, 'change', detail);
        if (opts.onChange) opts.onChange(detail);
      }
    }
    function step(d) {
      var n = list.length, i = idx;
      for (var k = 0; k < n; k++) {
        i = (i + d + n) % n;
        if (!list[i].disabled && list[i].getAttribute('aria-disabled') !== 'true') break;
      }
      select(i, { focus: true });
    }
    function onKey(e) {
      var rtl = isRTL(host);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(e.key === 'ArrowRight' && rtl ? -1 : 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(e.key === 'ArrowLeft' && rtl ? 1 : -1); }
      else if (e.key === 'Home') { e.preventDefault(); select(0, { focus: true }); }
      else if (e.key === 'End') { e.preventDefault(); select(list.length - 1, { focus: true }); }
    }
    /* press lifts; dragging scrubs the pill over the items; the item
       under the finger on release is selected */
    var pressed = false, hover = -1, downAt = -1;
    function itemAt(x, y) {
      var el = doc.elementFromPoint(x, y), it = el && el.closest && el.closest('.segmented > *');
      return it ? list.indexOf(it) : -1;
    }
    function onDown(e) {
      if (e.button !== 0) return;
      downAt = hover = list.indexOf(e.target.closest && e.target.closest('.segmented > *'));
      if (downAt < 0) return;
      pressed = true;
      host.setAttribute('data-seg-press', '');
    }
    function onMove(e) {
      if (!pressed) return;
      var i = itemAt(e.clientX, e.clientY);
      if (i >= 0 && i !== hover) { hover = i; place(true, i); }
    }
    function onUp() {
      if (!pressed) return;
      pressed = false;
      host.removeAttribute('data-seg-press');
      if (hover >= 0 && hover !== downAt) select(hover);       /* a scrub: the click will not land on an item */
      else place(true);
    }
    function onClick(e) {
      var it = e.target.closest && e.target.closest('.segmented > *'), i = list.indexOf(it);
      if (i >= 0) select(i);
    }
    function onMoving(on) {
      return function (e) {
        if (e.target !== ind || (e.propertyName !== 'translate' && e.propertyName !== 'width')) return;
        if (on) host.setAttribute('data-m-moving', ''); else host.removeAttribute('data-m-moving');
      };
    }
    host.addEventListener('keydown', onKey);
    host.addEventListener('click', onClick);
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    global.addEventListener('pointerup', onUp);
    global.addEventListener('pointercancel', onUp);
    host.addEventListener('scroll', overflow, { passive: true });
    var run = onMoving(true), end = onMoving(false);
    host.addEventListener('transitionrun', run);
    host.addEventListener('transitionend', end);
    host.addEventListener('transitioncancel', end);
    var ro = global.ResizeObserver ? new ResizeObserver(function () { place(false); }) : null;
    if (ro) { ro.observe(host); list.forEach(function (it) { ro.observe(it); }); }
    function onVis() { if (doc.visibilityState === 'visible') place(false); }
    doc.addEventListener('visibilitychange', onVis);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { place(false); });
    paint();
    place(false);
    if (created && glass && host.classList.contains('lg3') && global.LG3 && global.LG3.refresh) global.LG3.refresh(host);
    var api = {
      get index() { return idx; }, get items() { return list.slice(); },
      select: select, place: function () { return place(false); },
      configure: function (x) { assign(opts, x); return api; },
      destroy: function () {
        host.removeEventListener('keydown', onKey); host.removeEventListener('click', onClick);
        host.removeEventListener('pointerdown', onDown); host.removeEventListener('pointermove', onMove);
        global.removeEventListener('pointerup', onUp); global.removeEventListener('pointercancel', onUp);
        host.removeEventListener('scroll', overflow);
        host.removeEventListener('transitionrun', run); host.removeEventListener('transitionend', end);
        host.removeEventListener('transitioncancel', end);
        doc.removeEventListener('visibilitychange', onVis);
        if (ro) ro.disconnect();
        host.__uiSeg = null;
      }
    };
    host.__uiSeg = api;
    return api;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     8 · STEPPER — press steps at once (touch-DOWN, no delay), holding
     repeats (450ms, then every 90ms, 45ms after ten); keyboard clicks step
     once; arrows/Home/End on the group. Bounds use aria-disabled so focus is
     never dropped from a button that just hit its limit.
     ───────────────────────────────────────────────────────────────────────── */
  function stepper(el) {
    if (el.__uiStep) return el.__uiStep;
    var btns = el.querySelectorAll(':scope > button');
    if (btns.length < 2) return null;
    var dec = btns[0], inc = btns[btns.length - 1], out = el.querySelector(':scope > output');
    var min = num(el.getAttribute('data-min'), -Infinity), max = num(el.getAttribute('data-max'), Infinity);
    var stepBy = num(el.getAttribute('data-step'), 1);
    var dp = (String(stepBy).split('.')[1] || '').length;
    var value = num(el.getAttribute('data-value'), out ? num(out.textContent, 0) : 0);
    if (!el.getAttribute('role')) el.setAttribute('role', 'group');
    [dec, inc].forEach(function (b) { if (!b.getAttribute('type')) b.type = 'button'; });
    if (!dec.getAttribute('aria-label')) dec.setAttribute('aria-label', 'Decrease');
    if (!inc.getAttribute('aria-label')) inc.setAttribute('aria-label', 'Increase');
    if (out) { out.setAttribute('aria-live', 'polite'); }
    function set(v, fire) {
      v = clamp(+(+v).toFixed(dp), min, max);
      var changed = v !== value;
      value = v;
      el.setAttribute('data-value', String(v));
      if (out) out.textContent = String(v);
      dec.setAttribute('aria-disabled', String(v <= min));
      inc.setAttribute('aria-disabled', String(v >= max));
      if (fire && changed) emit(el, 'change', { value: v });
      return changed;
    }
    var timer = 0, n = 0;
    function stop() { clearTimeout(timer); timer = 0; n = 0; }
    function nudge(d) { return set(value + d * stepBy, true); }
    function hold(d) {
      if (!nudge(d)) { stop(); return; }
      n++;
      timer = setTimeout(function () { hold(d); }, n === 1 ? 450 : n > 10 ? 45 : 90);
    }
    function down(d) {
      return function (e) {
        if (e.button !== 0) return;
        var b = e.currentTarget;
        if (b.getAttribute('aria-disabled') === 'true') return;
        stop(); hold(d);
      };
    }
    function click(d) { return function (e) { if (e.detail === 0) nudge(d); }; }   /* keyboard / AT click */
    dec.addEventListener('pointerdown', down(-1)); inc.addEventListener('pointerdown', down(1));
    dec.addEventListener('click', click(-1)); inc.addEventListener('click', click(1));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { dec.addEventListener(t, stop); inc.addEventListener(t, stop); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
      else if (e.key === 'Home' && isFinite(min)) { e.preventDefault(); set(min, true); }
      else if (e.key === 'End' && isFinite(max)) { e.preventDefault(); set(max, true); }
    });
    set(value, false);
    el.__uiStep = { get value() { return value; }, set: function (v) { return set(v, true); } };
    return el.__uiStep;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     9 · SLIDER · DETENT · PROGRESS · CARD HOVER
     ───────────────────────────────────────────────────────────────────────── */
  function slider(input) {
    if (input.__uiSlider) return input.__uiSlider;
    function paint() {
      var mn = num(input.min, 0), mx = num(input.max, 100), v = num(input.value, 50);
      input.style.setProperty('--v', (mx > mn ? (v - mn) / (mx - mn) * 100 : 0).toFixed(3) + '%');
    }
    input.addEventListener('input', paint);
    input.addEventListener('change', paint);
    paint();
    input.__uiSlider = { paint: paint };
    return input.__uiSlider;
  }

  function detent(el, opts) {
    if (el.__uiDet) return el.__uiDet;
    opts = opts || {};
    var dets = opts.detents || (el.getAttribute('data-detents') || '').split(',').map(parseFloat).filter(isFinite);
    if (!dets.length) dets = [0, 1 / 3, 1];
    var labels = opts.labels || (el.getAttribute('data-labels') ? el.getAttribute('data-labels').split(',').map(function (s) { return s.trim(); }) : null);
    /* a .slider-detent-labels row right after the rail: each label without
       its own --at sits under the detent of the same index */
    var row = el.nextElementSibling;
    if (row && row.classList.contains('slider-detent-labels')) [].forEach.call(row.children, function (c, i) {
      if (dets[i] != null && !getComputedStyle(c).getPropertyValue('--at').trim()) c.style.setProperty('--at', String(dets[i]));
    });
    var thumb = el.querySelector('[data-detent-thumb]');
    if (!thumb) { thumb = doc.createElement('span'); thumb.setAttribute('data-detent-thumb', ''); el.appendChild(thumb); }
    if (!thumb.getAttribute('aria-label') && !thumb.getAttribute('aria-labelledby')) {
      if (el.getAttribute('aria-label')) thumb.setAttribute('aria-label', el.getAttribute('aria-label'));
      else if (el.getAttribute('aria-labelledby')) thumb.setAttribute('aria-labelledby', el.getAttribute('aria-labelledby'));
    }
    var value = opts.value != null ? opts.value : num(el.getAttribute('data-value'), dets[0]);
    function changed(v, i) {
      el.setAttribute('data-value', String(+v.toFixed(4)));
      emit(el, 'change', { value: v, index: i, label: labels ? labels[i] : null });
    }
    var M = global.MOTION, h;
    if (M && M.detent) {
      h = M.detent(el, { detents: dets, value: value, thumb: thumb, labels: labels,
        stretchMax: opts.stretchMax != null ? opts.stretchMax : num(el.getAttribute('data-stretch-max'), 28),
        onChange: changed });
    } else {
      /* no MOTION: still a real, keyboard-operable slider that lands on detents */
      var index = 0;
      var paintV = function (i) {
        index = i; var v = dets[i];
        el.style.setProperty('--detent-value', v);
        el.setAttribute('data-detent-index', i);
        thumb.setAttribute('aria-valuenow', Math.round(v * 100));
        thumb.setAttribute('aria-valuetext', Math.round(v * 100) + '%' + (labels ? ', ' + labels[i] : ''));
      };
      thumb.setAttribute('role', 'slider'); thumb.tabIndex = 0;
      thumb.setAttribute('aria-valuemin', '0'); thumb.setAttribute('aria-valuemax', '100');
      var near = dets.reduce(function (b, d, i) { return Math.abs(d - value) < Math.abs(dets[b] - value) ? i : b; }, 0);
      paintV(near);
      thumb.addEventListener('keydown', function (e) {
        var i = index;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') i = Math.min(dets.length - 1, i + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') i = Math.max(0, i - 1);
        else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = dets.length - 1; else return;
        e.preventDefault(); paintV(i); changed(dets[i], i);
      });
      h = { get value() { return dets[index]; }, get index() { return index; },
            set: function (v) { var i = dets.reduce(function (b, d, k) { return Math.abs(d - v) < Math.abs(dets[b] - v) ? k : b; }, 0); paintV(i); changed(dets[i], i); },
            destroy: function () {} };
    }
    el.__uiDet = h;
    return h;
  }

  function progress(el, v) {
    var ind = v == null || v === '' || isNaN(+v);
    if (el.tagName === 'PROGRESS') {
      if (ind) el.removeAttribute('value'); else el.value = clamp(+v, 0, 1) * (num(el.max, 1));
      return el;
    }
    if (!el.getAttribute('role')) el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
    if (ind) { el.setAttribute('data-indeterminate', ''); el.removeAttribute('aria-valuenow'); }
    else {
      var x = clamp(+v, 0, 1);
      el.removeAttribute('data-indeterminate');
      el.style.setProperty('--value', x);
      el.setAttribute('aria-valuenow', String(Math.round(x * 100)));
    }
    return el;
  }

  /* The card hover grows by a constant 6px: scale (w + 6) / w, per card */
  var cardRO = global.ResizeObserver ? new ResizeObserver(function (es) {
    es.forEach(function (e) {
      var w = e.target.getBoundingClientRect().width / (parseFloat(getComputedStyle(e.target).scale) || 1);
      if (w > 0) e.target.style.setProperty('--card-scale', ((w + 6) / w).toFixed(5));
    });
  }) : null;

  /* ─────────────────────────────────────────────────────────────────────────
     10 · MOUNT
     ───────────────────────────────────────────────────────────────────────── */
  function byRef(trigger, attr) {
    var ref = trigger.getAttribute(attr);
    return ref ? doc.getElementById(ref) : null;
  }
  function mount(root) {
    root = root || doc;
    var n = 0;
    /* text-bearing glass controls (not icon-only, not the tinted primary,
       whose body is the accent) get LG3's legibility veil */
    qsa(root, '.btn-glass[data-lg3]:not(.btn-icon):not(.btn-primary)').forEach(function (b) { textGlass(b); });
    qsa(root, '.segmented').forEach(function (h) { if (!h.__uiSeg) { segmented(h); n++; } });
    qsa(root, '.stepper').forEach(function (s) { if (!s.__uiStep && stepper(s)) n++; });
    qsa(root, 'input.slider[type="range"],.slider input[type="range"]').forEach(function (i) { if (!i.__uiSlider) { slider(i); n++; } });
    qsa(root, '.slider-detent').forEach(function (d) { if (!d.__uiDet) { detent(d); n++; } });
    qsa(root, '[data-tip]').forEach(function (t) { if (!t.__uiTip) { tooltip(t); n++; } });
    qsa(root, '[data-menu]').forEach(function (t) { var p = byRef(t, 'data-menu'); if (p && !p.__ui) { menu(t, p); n++; } });
    qsa(root, '[data-popover]').forEach(function (t) { var p = byRef(t, 'data-popover'); if (p && !p.__ui) { popover(t, p); n++; } });
    /* a native popovertarget pointing at one of ours: take it over, so it is
       anchored and animated (the platform would open it centred, unanchored) */
    qsa(root, '[popovertarget]').forEach(function (t) {
      var p = byRef(t, 'popovertarget');
      if (!p || p.__ui || !(p.classList.contains('menu') || p.classList.contains('popover'))) return;
      t.removeAttribute('popovertarget');
      (p.classList.contains('menu') ? menu : popover)(t, p); n++;
    });
    if (cardRO) qsa(root, '.card-hover').forEach(function (c) { if (!c.__uiCard) { c.__uiCard = true; cardRO.observe(c); n++; } });
    qsa(root, '.progress-ring[data-value],progress.progress[data-value]').forEach(function (r) { progress(r, r.getAttribute('data-value')); n++; });
    return n;
  }

  global.UI = {
    version: '3.0.0', mount: mount, anchor: anchor, menu: menu, popover: popover,
    toast: toast, alert: alertBox, tooltip: tooltip, tooltips: tooltips,
    segmented: segmented, stepper: stepper, slider: slider, detent: detent, progress: progress,
    reduced: RM, get anchorPath() { return ANCHOR_CSS && !FORCE_JS ? 'css' : 'js'; }
  };
})(window);
