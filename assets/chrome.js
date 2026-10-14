/* ═══════════════════════════════════════════════════════════════════════════
   chrome.js → CHROME — bars, tab bars, sidebars, sheets, the live capsule
   ───────────────────────────────────────────────────────────────────────────
   The behaviour half of fg3-chrome.css. Plain script, one global, never
   mounts itself: FG3.boot() calls CHROME.mount(document) after LG3 and MOTION
   have mounted. Everything degrades to the thing simply happening — no
   MOTION, reduced motion, or a starved rAF and the state still lands.

   HOW THE MOTION WORKS (one idea, used everywhere)
     A component owns ONE spring-driven number (MOTION.progress) and CSS
     derives shape from it with calc(): the local nav's --progress (pill →
     Explore panel), the tab bar's --tb-min (minimise), the live capsule's
     --lc-p (compact ↔ expanded), the sidebar's --sb-fold. [data-m-moving]
     is on the element while it moves (density follows motion). Separate
     glass elements that trade places use LG3.morph (command pill → panel,
     button → sheet). Glass never fades: LG3.materialize/dematerialize.

   MARKUP CONTRACT (canonical classes, SPEC §7; full examples in chrome.html)
     .globalnav              > .globalnav__bar > .globalnav__brand, ul.globalnav__list >
                             li.globalnav__item[data-flyout=id] > a.globalnav__link +
                             button.globalnav__trigger; .globalnav__tools; button.globalnav__menu.
                             Flyouts: .globalnav__flyout#id[hidden] > .globalnav__flyout-content >
                             .globalnav__group[data-elevated] > .globalnav__group-title + a.globalnav__flyout-link
     .localnav[data-localnav-reveal="<selector>"] > .localnav__capsule[data-lg3] >
                             a.localnav__title, button.localnav__explore, a.localnav__cta,
                             .localnav__panel (tiles, .localnav__slot > .localnav__title-slot +
                             .localnav__price + .localnav__cta-slot, .localnav__jump, .localnav__links)
     .navbar[data-navbar-scroll][data-navbar-minimize][data-scroll-edge] > .navbar__bar
                             (.navbar__leading .navbar__title .navbar__trailing);
                             + .navbar-large sibling (the large title in the content)
     .tabbar[data-tabbar-scroll="<selector>"] > .tabbar__accessory?, .tabbar__row[role=tablist] >
                             .tabbar__bar[data-lg3] > .tabbar__tabs > .tab (+ .tab__label),
                             button.tab-prominent?
     .toolbar[role=toolbar] > .toolbar__group[data-lg3] > .toolbar__item · .toolbar__primary ·
                             .toolbar__title · .toolbar__spacer   [data-axis="vertical"] = Duo side strip
     .sidebar[data-lg3][data-sidebar="floating|edge"] > .sidebar__head (.sidebar__fold) ·
                             .sidebar__section > .sidebar__heading + a.sidebar__item
     .bg-extension[data-extend-from="<selector>"][data-extend="start|end"]
     .inspector[data-lg3] > .inspector__head (.inspector__fold) · .inspector__filters · .inspector__body
     .sheet#id[data-lg3][role=dialog][data-detents="medium large"][data-sheet-dim][hidden] >
                             .sheet__grabber, .sheet__header, .sheet__body;
                             opener: [data-sheet-open="id"]; closer inside: [data-sheet-close]
                             [data-sheet-contained]: inside a positioned window (a mockup) —
                             sheet + scrim absolute, detents measured on the window
     .scroll-edge[data-edge="top|bottom"][data-edge-style="soft|hard|auto"][data-edge-fixed]
     .control-bar[data-autoplay][data-duration="6.15"][data-loop="false"] > .control-bar__dots >
                             .control-bar__dot* (+ .control-bar__play). Drop and bubble chrome are
                             built by mount. data-loop="false" stops on the last dot ([data-ended],
                             reason 'ended'); play then replays from the first.
     .live-capsule[data-anchor="start|center|end"][data-expanded] > .live-capsule__glass[data-lg3] >
                             button.live-capsule__face (.live-capsule__lead .live-capsule__summary
                             .live-capsule__trail) + .live-capsule__detail. Inside .device__island
                             omit data-lg3: the island is the capsule's frame (device). An authored
                             [data-expanded] is a static expanded capsule (lock screen): no spring,
                             face inert, not closed by an outside tap or Escape.
     .command > button.command__pill[data-lg3] + .command__panel[data-lg3][hidden] >
                             .command__field > input.command__input · ul.command__list > li.command__item

   PUBLIC API (window.CHROME)
     mount(root) → {counts}        wire every component under root (idempotent)
     refresh(root)                  re-measure (after a layout change the observers cannot see)
     globalnav.open(nav, item) · close(nav) · menu(nav, on)
     localnav.open(el) · close(el) · toggle(el) · reveal(el, on)
     navbar.sync(el)
     tabbar.select(el, i) · minimize(el, on) · sync(el)
     sidebar.fold(el, on) · inspector.fold(el, on)
     sheet.open(sheet, {from, detent}) · close(sheet) · detent(sheet, 'medium'|'large')
     scrollEdge.sync(edge)
     controlBar.intro(el) · select(el, i) · play(el, on)
     live.expand(el, on) · toggle(el) · update(el, {kind, glyph, hue, trail, summary,
                             account, line, done, asked, count, elapsed, label})
                             The words cross-fade only when the STATE changes (kind, glyph,
                             summary, account, line); trail / count / meter / elapsed are
                             written in place. count = the foot's text (else "done of asked");
                             asked: null hides the meter (a state with no progress). A face
                             with an aria-label is renamed on every update: label, else
                             "Now: <summary>, <trail>. Show details" ("4/10" read "4 of 10") —
                             until the page sets the face's aria-label itself.
                             Opened from the keyboard, focus goes to the detail's first
                             control, or to the detail itself when it has none; closed, it
                             comes back to the face.
     command.open(el) · close(el)
   EVENTS (bubbling CustomEvent, detail as listed)
     chrome:localnav {open} · chrome:tab {index} · chrome:minimize {minimized}
     chrome:sheet {open, detent} ·
     chrome:controlbar {index, playing, reason: 'user'|'play'|'auto'|'api'|'ended', user} ·
     chrome:live {expanded} · chrome:live-stop {} · chrome:command {value, label}
   CSS CUSTOM PROPERTIES WRITTEN: see fg3-chrome.css (each component's block
     documents what it reads). Nothing here names a colour.
   BEHAVIOURS PAGES CAN RELY ON
     · Escape closes the TOPMOST open surface (palette › sheet › local nav ›
       capsule › flyout › menu), wherever focus is; one level per press.
     · Every glass host inside a component gets data-tone = its LG3 appearance
       ([data-chrome-tone]), so colour roles inside resolve for the glass.
       Floating panels (palette, sheet) are pinned (data-lg3-tone,
       [data-chrome-pinned]) to the tone of the band that opened them.
     · Bars belong at --z-chrome and edges at --z-edge: give a custom bar
       z-index var(--z-chrome), and isolate a window/pane (isolation:isolate)
       so its inner stacking cannot rise over page chrome. Inside a DEVICE
       screen the island (live capsule) stacks above the app's own chrome and
       sheets (fg3-device.css); an app root that makes its own stacking
       context ABOVE it still wins — don't.
     · Text-bearing glass (command pill + palette, capsule, tab bar +
       accessory, toolbar groups [data-text], local nav, sidebar, inspector,
       sheet) is marked data-lg3-text ("dense" where secondary text sits):
       LG3 raises its veil only as far as the words need.
     · A tab bar floating over an active BOTTOM scroll edge takes the edge's
       ground tone (data-lg3-tone, [data-chrome-pinned]): it sits on the fade,
       not on the content LG3 would otherwise read under it.
     · Extra markup: .navbar[data-navbar-large="<selector>"] (else the next
       .navbar-large sibling); .tabbar__now + [data-accessory-extra] (hidden
       while the tab bar is minimised); .sheet[data-medium="0.5"]
       [data-sheet-persistent] (no swipe-to-dismiss) [data-sheet-morph] (morph
       from a non-glass opener); .tabbar[data-tabbar-static] (never minimise);
       .command[data-command-hotkey] (the ⌘K target when there are several).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var doc = global.document, html = doc.documentElement;

  /* ── 0 · UTILITIES ─────────────────────────────────────────────────────── */
  function mq(q) {
    try { return global.matchMedia(q); } catch (e) { return { matches: false, addEventListener: function () {} }; }
  }
  function onMQ(m, fn) { if (m.addEventListener) m.addEventListener('change', fn); else if (m.addListener) m.addListener(fn); }
  var RM = mq('(prefers-reduced-motion: reduce)');
  var NARROW = mq('(max-width: 833px)');            /* The nav switch */
  function reduced() { return RM.matches || html.classList.contains('fd-reduced-motion'); }
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function px(n) { return (Math.round(n * 100) / 100) + 'px'; }
  function emit(el, name, detail) {
    try { el.dispatchEvent(new CustomEvent('chrome:' + name, { bubbles: true, detail: detail || {} })); } catch (e) {}
  }
  /* rAF does not run in a hidden page: pair it with a timeout, first wins */
  function later(fn) {
    var done = false, run = function () { if (!done) { done = true; fn(); } };
    if (global.requestAnimationFrame) global.requestAnimationFrame(run);
    setTimeout(run, 100);
  }
  function springMs(name) {
    try {
      var S = global.SPRING && global.SPRING.Spring(name);
      if (S && isFinite(S.settlingDuration)) return S.settlingDuration * 1000;
    } catch (e) {}
    return 700;
  }
  /* One spring-driven number (the SPEC's MORPH primitive). Without MOTION it
     lands at once. A state that must land (hidden, inert) is ALSO committed by
     a timer at the spring's settle time, so it never waits on a frame. */
  function drive(el, to, opts) {
    opts = opts || {};
    var M = global.MOTION, name = opts.var || '--progress';
    if (!M || !M.progress) {
      el.style.setProperty(name, to);
      if (opts.onFrame) opts.onFrame(to, 0);
      if (opts.onDone) opts.onDone();
      return null;
    }
    return M.progress(el, to, opts);
  }
  function commit(el, key, fn, ms) {
    var k = '__crT_' + key, fired = false;
    clearTimeout(el[k]);
    var once = function () { if (fired) return; fired = true; clearTimeout(el[k]); fn(); };
    el[k] = setTimeout(once, ms);
    return once;
  }
  function glyph(name, cls) {
    if (global.SYM && global.SYM.build) return global.SYM.build(name, cls);
    var i = doc.createElement('i'); i.setAttribute('data-sym', name); if (cls) i.className = cls; return i;
  }
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function focusables(root) {
    return $$(FOCUSABLE, root).filter(function (e) {
      if (e.closest('[inert],[hidden],[data-lg3-away]')) return false;
      var cs = global.getComputedStyle(e);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && e.getClientRects().length > 0;
    });
  }
  function trapTab(root, ev) {
    if (ev.key !== 'Tab') return;
    var f = focusables(root); if (!f.length) { ev.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], a = doc.activeElement;
    if (ev.shiftKey && (a === first || !root.contains(a))) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (a === last || !root.contains(a))) { ev.preventDefault(); first.focus(); }
  }
  function setInert(el, on) {
    if (!el) return;
    if (on) { el.setAttribute('inert', ''); el.inert = true; } else { el.removeAttribute('inert'); el.inert = false; }
  }
  function scrollTopOf(t) { return t === global ? (global.scrollY || html.scrollTop || 0) : t.scrollTop; }
  function scrollTarget(sel, el) {
    if (!sel || sel === 'window') return global;
    if (sel === 'parent') return scrollParent(el) || global;
    return doc.querySelector(sel) || global;
  }
  function scrollParent(el) {
    for (var p = el.parentElement; p && p !== doc.body && p !== html; p = p.parentElement) {
      var o = global.getComputedStyle(p).overflowY;
      if (o === 'auto' || o === 'scroll') return p;
    }
    return null;
  }
  var RO = typeof ResizeObserver !== 'undefined';
  function observeSize(el, fn) {
    if (RO) { var ro = new ResizeObserver(function () { fn(); }); ro.observe(el); return ro; }
    global.addEventListener('resize', fn); return null;
  }
  /* Escape closes the TOPMOST open surface, wherever focus is (a panel
     opened by a pointer leaves focus on <body>, out of its own listeners) */
  var openStack = [];
  function pushOpen(el, close) { popOpen(el); openStack.push({ el: el, close: close }); }
  function popOpen(el) { openStack = openStack.filter(function (s) { return s.el !== el; }); }
  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented || !openStack.length) return;
    e.preventDefault();
    openStack[openStack.length - 1].close();
  });
  var visFns = [];
  /* the page's tone changed: grounds (and the tones pinned to them) changed */
  doc.addEventListener('fg3:tone', function () { later(function () { $$('.tabbar').forEach(tbEdgeTone); }); });
  doc.addEventListener('visibilitychange', function () {
    if (doc.visibilityState === 'visible') visFns.forEach(function (f) { try { f(); } catch (e) {} });
  });

  /* ── 1 · LABELS ON GLASS READ THE GLASS, NOT THE BAND ─────────────────────
     LG3 writes the resolved appearance to [data-lg3-appearance]. Mirroring it
     into data-tone on the host re-resolves every colour role inside (label-2,
     accent, fills) for the glass the text actually sits on — a light glass
     bar over a dark band keeps dark secondary text. An author's own data-tone
     is never overwritten. */
  var toneObs = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(function (ms) { ms.forEach(function (m) { mirrorTone(m.target); }); }) : null;
  function mirrorTone(host) {
    var a = host.getAttribute('data-lg3-appearance');
    if (a !== 'light' && a !== 'dark') return;
    if (host.hasAttribute('data-tone') && !host.hasAttribute('data-chrome-tone')) return;
    if (host.getAttribute('data-tone') !== a) host.setAttribute('data-tone', a);
    host.setAttribute('data-chrome-tone', '');
  }
  function watchTone(host) {
    if (!host || host.__crTone) return;
    host.__crTone = true;
    mirrorTone(host);
    if (toneObs) toneObs.observe(host, { attributes: true, attributeFilter: ['data-lg3-appearance'] });
  }
  function glassIn(root) {
    var list = $$('[data-lg3]', root);
    if (root.hasAttribute && root.hasAttribute('data-lg3')) list.unshift(root);
    list.forEach(watchTone);
  }
  /* A floating panel (palette, sheet) belongs to the band it was opened
     from, not to whatever happens to be behind its centre: LG3 reads a large
     host's tone from behind, so pin it (data-lg3-tone) to the context. */
  function contextTone(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hasAttribute('data-tone') && !n.hasAttribute('data-chrome-tone')) return n.getAttribute('data-tone');
    }
    return html.getAttribute('data-tone') === 'dark' ? 'dark' : 'light';
  }
  function pinTone(host, from) {
    if (!host || (host.hasAttribute('data-lg3-tone') && !host.hasAttribute('data-chrome-pinned'))) return;
    var t = contextTone(from || host.parentElement);
    if (host.getAttribute('data-lg3-tone') === t) return;
    host.setAttribute('data-lg3-tone', t); host.setAttribute('data-chrome-pinned', '');
    if (global.LG3 && global.LG3.adapt) global.LG3.adapt();
  }
  function lg3Apply(el) { if (global.LG3 && global.LG3.refresh && el && el.hasAttribute('data-lg3')) global.LG3.refresh(el); }
  /* Text on chrome glass: LG3's legibility hook (data-lg3-text) raises the
     host's veil by the smallest share that holds 4.5:1 for its ink over
     what is actually behind it; "dense" holds the SECONDARY ink (--label-2
     here, which fg3-chrome.css hands the engine as --lg3-ink-2). An
     author's own data-lg3-text / data-lg3-wash is never overwritten. */
  function textGlass(el, dense) {
    if (!el || !el.hasAttribute('data-lg3') || el.hasAttribute('data-lg3-text') || el.hasAttribute('data-lg3-wash')) return;
    el.setAttribute('data-lg3-text', dense ? 'dense' : '');
  }

  /* ═══ 2 · GLOBAL NAV ═══════════════════════════════════════════════════════
     The globalheader: 44 px (48 at ≤833), hover
     intent 120 ms, close delay 120 ms, flyout height at a rate that scales
     with distance — clamp(240, h/2, 480) ms on (.4,0,.6,1) — items cascading
     in at groupDelay + i·20 + 80 ms, leaving bottom-first in ≤ 240 ms. At
     ≤833 a hamburger opens a full-height sheet whose items drop 8 px in. */
  function gnInit(nav) {
    if (nav.__cr) return;
    var st = nav.__cr = { open: null, t: 0, anim: 0 };
    var sheet = doc.createElement('div');
    sheet.className = 'globalnav__sheet'; sheet.setAttribute('aria-hidden', 'true');
    nav.insertBefore(sheet, nav.firstChild);
    /* the curtain lives OUTSIDE the nav: a backdrop-filter on the nav would
       make it the containing block of a fixed child */
    var cur = doc.createElement('div');
    cur.className = 'globalnav__curtain'; cur.setAttribute('aria-hidden', 'true');
    nav.parentNode.insertBefore(cur, nav.nextSibling);
    st.curtain = cur;
    cur.addEventListener('click', function () { gnClose(nav); });
    st.menuBtn = $('.globalnav__menu', nav);

    $$('.globalnav__item', nav).forEach(function (item, idx) {
      item.style.setProperty('--gn-i', idx);
      var id = item.getAttribute('data-flyout'), fly = id && doc.getElementById(id);
      var trig = $('.globalnav__trigger', item);
      if (fly) {
        item.__fly = fly; fly.__item = item; gnPrep(nav, fly);
        if (trig) { trig.setAttribute('aria-controls', id); trig.setAttribute('aria-expanded', 'false'); }
      }
      item.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'mouse' || NARROW.matches) return;
        clearTimeout(st.t);
        st.t = setTimeout(function () { if (fly) gnOpen(nav, item); else gnClose(nav); }, 120);
      });
      item.addEventListener('pointerleave', function () { if (!st.open) clearTimeout(st.t); });
      if (trig) trig.addEventListener('click', function () {
        if (NARROW.matches) { gnDrill(nav, item, true); return; }
        if (st.open === item) gnClose(nav); else gnOpen(nav, item);
      });
    });
    nav.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse' || NARROW.matches) return;
      clearTimeout(st.t);
      st.t = setTimeout(function () { gnClose(nav); }, 120);   /* --r-globalnav-flyout-close-delay */
    });
    nav.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      /* one Escape, one level: mark it handled so the document stack does not close the next one too */
      if (nav.hasAttribute('data-gn-drill')) { e.preventDefault(); gnDrill(nav, null); return; }
      if (st.open) { e.preventDefault(); var it = st.open; gnClose(nav); var tr = $('.globalnav__trigger', it); if (tr) tr.focus(); return; }
      if (nav.hasAttribute('data-gn-menu')) { e.preventDefault(); gnMenu(nav, false); if (st.menuBtn) st.menuBtn.focus(); }
    });
    nav.addEventListener('focusout', function (e) {
      if (st.open && !nav.contains(e.relatedTarget)) gnClose(nav);
    });
    if (st.menuBtn) st.menuBtn.addEventListener('click', function () { gnMenu(nav, !nav.hasAttribute('data-gn-menu')); });
    onMQ(NARROW, function () { gnClose(nav, true); gnMenu(nav, false); });
    glassIn(nav);
  }
  function gnPrep(nav, fly) {
    var groups = $$('.globalnav__group', fly);
    var elev = groups.filter(function (g) { return g.hasAttribute('data-elevated'); }).length;
    var all = $$('.globalnav__group-title, .globalnav__flyout-link', fly), idx = 0;
    groups.forEach(function (g, gi) {
      /* the group delay, verbatim */
      var gd = Math.min(elev * 80 + (gi - elev) * 40, gi * 80);
      $$('.globalnav__group-title, .globalnav__flyout-link', g).forEach(function (a, i) {
        a.style.setProperty('--gn-in', Math.max(0, gd + i * 20 + 80) + 'ms');
        a.style.setProperty('--gn-out', Math.min(160 + (all.length - idx) * 20, 240) + 'ms');
        idx++;
      });
    });
    if (!$('.globalnav__back', fly)) {
      var back = doc.createElement('button');
      back.type = 'button'; back.className = 'globalnav__back'; back.setAttribute('aria-label', 'Back');
      back.appendChild(glyph('chevron-left'));
      back.addEventListener('click', function () { gnDrill(nav, null); });
      fly.insertBefore(back, fly.firstChild);
    }
  }
  function gnExp(item, on) { var t = $('.globalnav__trigger', item); if (t) t.setAttribute('aria-expanded', on ? 'true' : 'false'); }
  function gnOpen(nav, item) {
    var st = nav.__cr, fly = item && item.__fly;
    if (!st || !fly || st.open === item || NARROW.matches) return;
    var prev = st.open;
    st.open = item;
    if (prev) { prev.__fly.removeAttribute('data-open'); prev.__fly.hidden = true; gnExp(prev, false); }
    fly.hidden = false;
    var h = $('.globalnav__flyout-content', fly) ? fly.offsetHeight : fly.scrollHeight;
    /* switching between open menus is a quick height change (0.12 s) */
    var rate = prev ? 120 : clamp(h / 2, 240, 480);
    nav.style.setProperty('--gn-fh', px(h));
    nav.style.setProperty('--gn-rate', rate + 'ms');
    nav.setAttribute('data-gn-open', ''); nav.setAttribute('data-gn-animating', '');
    clearTimeout(st.anim);
    st.anim = setTimeout(function () { nav.removeAttribute('data-gn-animating'); }, rate);
    void global.getComputedStyle(fly).opacity;          /* flush: the cascade transitions from its start */
    fly.setAttribute('data-open', '');
    gnExp(item, true);
    st.curtain.setAttribute('data-open', '');
    pushOpen(nav, function () {
      var it = st.open, inside = nav.contains(doc.activeElement);
      gnClose(nav);
      var tr = it && $('.globalnav__trigger', it); if (inside && tr) tr.focus();
    });
  }
  function gnClose(nav, instant) {
    var st = nav.__cr; if (!st) return;
    clearTimeout(st.t);
    var item = st.open; if (!item) return;
    st.open = null;
    popOpen(nav);
    var fly = item.__fly, rate = instant ? 0 : clamp(fly.offsetHeight / 2, 240, 480);
    fly.removeAttribute('data-open'); gnExp(item, false);
    nav.style.setProperty('--gn-rate', rate + 'ms');
    nav.style.setProperty('--gn-fh', '0px');
    nav.setAttribute('data-gn-animating', '');
    st.curtain.removeAttribute('data-open');
    clearTimeout(st.anim);
    st.anim = setTimeout(function () {
      nav.removeAttribute('data-gn-animating');
      if (st.open) return;
      nav.removeAttribute('data-gn-open');
      fly.hidden = true;
    }, rate);
  }
  function gnMenu(nav, on) {
    var st = nav.__cr; if (!st) return;
    if (!on && !nav.hasAttribute('data-gn-menu')) return;
    nav.toggleAttribute('data-gn-menu', !!on);
    html.toggleAttribute('data-gn-menu', !!on);
    st.menuKey = st.menuKey || {};
    if (on) pushOpen(st.menuKey, function () { gnMenu(nav, false); if (st.menuBtn) st.menuBtn.focus(); });
    else popOpen(st.menuKey);
    if (st.menuBtn) {
      st.menuBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
      st.menuBtn.setAttribute('aria-label', on ? 'Close menu' : 'Menu');
      /* the three lines become the close glyph (the hamburger morphs to an X) */
      if (global.SYM && global.SYM.replace && st.menuBtn.querySelector('svg.sym')) global.SYM.replace(st.menuBtn, on ? 'xmark' : 'lines', { delay: reduced() ? 0 : 110 });
    }
    if (!on) gnDrill(nav, null);
  }
  function gnDrill(nav, item, focus) {
    var back = null;
    $$('.globalnav__flyout[data-drilled]', nav).forEach(function (f) {
      /* leaving a sub-menu that holds focus: return it to the item's trigger,
         never to <body> (it would fall out of every key handler) */
      if (f.contains(doc.activeElement) && f.__item) back = $('.globalnav__trigger', f.__item);
      f.removeAttribute('data-drilled'); f.hidden = true; if (f.__item) gnExp(f.__item, false);
    });
    if (!item || !item.__fly) { nav.removeAttribute('data-gn-drill'); if (back) back.focus(); return; }
    nav.setAttribute('data-gn-drill', '');
    item.__fly.hidden = false;
    void global.getComputedStyle(item.__fly).opacity;
    item.__fly.setAttribute('data-drilled', '');
    gnExp(item, true);
    if (focus) { var b = $('.globalnav__back', item.__fly); if (b) b.focus(); }
  }

  /* ═══ 3 · LOCAL NAV ════════════════════════════════════════════════════════
     The floating glass pill: 1024 × 52 at
     top 10, hidden at translateY(−72px) until the anchor's bottom passes the
     top of the viewport, then .23 s in. "Explore" morphs the SAME capsule into
     the product panel: ONE --progress on spring(1.5,28,28,1) in / (.75,20,20,2)
     out; CSS derives height, radius calc(32 − 14·(1 − p)), the title's size
     19 → 40 and its travel, the CTA's padding, Explore → the close disc. The
     final positions are read from placeholders in the panel's real layout. */
  function lnInit(ln) {
    if (ln.__cr) return;
    var cap = $('.localnav__capsule', ln); if (!cap) return;
    var st = ln.__cr = { open: false, cap: cap };
    st.panel = $('.localnav__panel', cap);
    st.title = $('.localnav__title', cap);
    st.explore = $('.localnav__explore', cap);
    st.cta = $('.localnav__cta', cap);
    if (st.explore && !$('.localnav__close-glyph', st.explore)) {
      var g = glyph('xmark', 'localnav__close-glyph'); st.explore.appendChild(g);
    }
    var ov = doc.createElement('div');
    ov.className = 'localnav__overlay'; ov.setAttribute('aria-hidden', 'true');
    ln.parentNode.insertBefore(ov, ln);
    st.overlay = ov;
    ov.addEventListener('click', function () { lnClose(ln); });
    $$('.localnav__tile, .localnav__jump-item, .localnav__link', cap).forEach(function (t, i, all) {
      t.style.setProperty('--i', t.classList.contains('localnav__tile') ? $$('.localnav__tile', cap).indexOf(t) : i - $$('.localnav__tile', cap).length);
    });
    /* The title and CTA fly to placeholders in the panel's second row. A page
       that left the row out got them parked at the top instead — the title over
       the tiles, the CTA over the close disc (a click on × navigated). Make the
       row when it is missing, as DEVICE makes a missing island. */
    if (st.panel && !$('.localnav__slot', st.panel)) {
      var slot = doc.createElement('div');
      slot.className = 'localnav__slot';
      slot.innerHTML = '<span class="localnav__title-slot" aria-hidden="true"></span>' +
        (st.cta ? '<span class="localnav__cta-slot" aria-hidden="true"></span>' : '');
      var after = $('.localnav__rule', st.panel) || $('.localnav__tiles', st.panel);
      if (after) after.parentNode.insertBefore(slot, after.nextSibling); else st.panel.insertBefore(slot, st.panel.firstChild);
    }
    if (st.panel) { setInert(st.panel, true); if (!st.panel.id) st.panel.id = 'localnav-panel-' + (++uid); }
    /* open, it covers the page (scroll locked, page blurred): Tab stays inside */
    ln.addEventListener('keydown', function (e) { if (st.open) trapTab(cap, e); });
    if (st.explore) {
      st.explore.setAttribute('aria-expanded', 'false');
      if (st.panel) st.explore.setAttribute('aria-controls', st.panel.id);
      st.explore.addEventListener('click', function () { lnToggle(ln); });
    }
    /* reveal after the anchor (data-reveal-keyframe="a0b") */
    var sel = ln.getAttribute('data-localnav-reveal');
    st.anchor = sel ? doc.querySelector(sel) : null;
    if (st.anchor) {
      var check = function () { lnReveal(ln, st.anchor.getBoundingClientRect().bottom <= 0); };
      global.addEventListener('scroll', check, { passive: true });
      if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(check).observe(st.anchor);
      visFns.push(check);
      check();
    } else lnReveal(ln, true);
    observeSize(cap, function () { if (!st.moving) lnMeasure(ln); });
    lnMeasure(ln);
    watchTone(cap);
    textGlass(cap);
  }
  var uid = 0;
  function lnMeasure(ln) {
    var st = ln.__cr; if (!st || !st.panel) return;
    var cap = st.cap, p0 = cap.style.getPropertyValue('--progress');
    /* read every final position with the capsule held at p = 1, collapsed ones at p = 0 */
    cap.style.setProperty('--progress', '0');
    var ctaW0 = st.cta ? st.cta.offsetWidth : 0, exW0 = st.explore ? st.explore.offsetWidth : 0;
    cap.style.setProperty('--ln-cta-w0', px(ctaW0));
    cap.style.setProperty('--ln-ex-w0', px(exW0));
    cap.style.setProperty('--ln-ex-r0', px(20 + ctaW0 + 10));
    cap.style.setProperty('--progress', '1');
    var ctaW1 = st.cta ? st.cta.offsetWidth : 0, ctaH1 = st.cta ? st.cta.offsetHeight : 0;
    cap.style.setProperty('--ln-cta-w1', px(ctaW1));
    var ts = $('.localnav__title-slot', st.panel), cs = $('.localnav__cta-slot', st.panel);
    var capW = cap.clientWidth, off = function (e) {
      var x = 0, y = 0; for (var n = e; n && n !== cap; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
      return { x: x, y: y, w: e.offsetWidth, h: e.offsetHeight };
    };
    if (ts) { var t = off(ts); cap.style.setProperty('--ln-title-x1', px(t.x)); cap.style.setProperty('--ln-title-y1', px(t.y)); }
    if (cs) {
      var c = off(cs);
      cap.style.setProperty('--ln-cta-r1', px(capW - c.x - ctaW1));
      cap.style.setProperty('--ln-cta-y1', px(c.y + (c.h - ctaH1) / 2));
    }
    cap.style.setProperty('--ln-h1', px(st.panel.offsetHeight));
    if (p0) cap.style.setProperty('--progress', p0); else cap.style.removeProperty('--progress');
  }
  function lnReveal(ln, on) {
    var st = ln.__cr; if (!st) return;
    if (!on && st.open) return;
    if (on === ln.hasAttribute('data-revealed')) return;
    ln.toggleAttribute('data-revealed', !!on);
  }
  function lnFrame(ln, v) {
    var st = ln.__cr;
    st.overlay.style.opacity = clamp(v, 0, 1).toFixed(3);
  }
  function lnOpen(ln) {
    var st = ln.__cr; if (!st || st.open) return;
    st.open = true;
    lnMeasure(ln);
    lnReveal(ln, true);
    ln.setAttribute('data-open', ''); html.setAttribute('data-localnav-open', '');
    st.overlay.setAttribute('data-open', '');
    setInert(st.panel, false);
    if (st.explore) { st.explore.setAttribute('aria-expanded', 'true'); st.explore.setAttribute('aria-label', 'Close'); }
    st.moving = true;
    var done = commit(ln, 'ln', function () { st.moving = false; }, springMs('nav-in') + 200);
    drive(st.cap, 1, { spring: 'nav-in', onFrame: function (v) { lnFrame(ln, v); }, onDone: done });
    pushOpen(ln, function () {
      var inside = ln.contains(doc.activeElement);
      lnClose(ln);
      if (inside && st.explore) st.explore.focus();
    });
    emit(ln, 'localnav', { open: true });
  }
  function lnClose(ln) {
    var st = ln.__cr; if (!st || !st.open) return;
    st.open = false;
    ln.removeAttribute('data-open'); html.removeAttribute('data-localnav-open');
    st.overlay.removeAttribute('data-open'); st.overlay.setAttribute('data-closing', '');
    ln.setAttribute('data-closing', '');
    if (st.explore) { st.explore.setAttribute('aria-expanded', 'false'); st.explore.removeAttribute('aria-label'); }
    st.moving = true;
    var done = commit(ln, 'ln', function () {
      st.moving = false;
      if (st.open) return;
      ln.removeAttribute('data-closing'); st.overlay.removeAttribute('data-closing');
      setInert(st.panel, true);
      lnFrame(ln, 0);
      if (st.anchor) lnReveal(ln, st.anchor.getBoundingClientRect().bottom <= 0);
    }, springMs('nav-out') + 200);
    drive(st.cap, 0, { spring: 'nav-out', onFrame: function (v) { lnFrame(ln, v); }, onDone: done });
    popOpen(ln);
    emit(ln, 'localnav', { open: false });
  }
  function lnToggle(ln) { if (ln.__cr && ln.__cr.open) lnClose(ln); else lnOpen(ln); }

  /* ═══ 4 · NAVIGATION BAR (app) ═════════════════════════════════════════════
     The large title lives at the top of the content and scrolls UNDER
     the bar; once it has gone, the inline title fades in. The bar can
     minimise on scroll-down. The bar
     itself is transparent — its separation is the scroll edge effect. */
  function nbInit(nb) {
    if (nb.__cr) return;
    var st = nb.__cr = { min: false, acc: 0, lastY: 0 };
    st.target = scrollTarget(nb.getAttribute('data-navbar-scroll'), nb);
    var ls = nb.getAttribute('data-navbar-large');
    st.large = ls ? doc.querySelector(ls) : (nb.nextElementSibling && nb.nextElementSibling.classList.contains('navbar-large') ? nb.nextElementSibling : null);
    var es = nb.getAttribute('data-scroll-edge');
    if (es != null && !$(':scope > .scroll-edge', nb)) {
      var e = doc.createElement('div');
      e.className = 'scroll-edge'; e.setAttribute('aria-hidden', 'true');
      e.setAttribute('data-edge-style', es || 'auto'); e.setAttribute('data-edge-owned', '');
      nb.insertBefore(e, nb.firstChild);
      st.edge = e;
    }
    var on = function () { nbSync(nb); };
    (st.target === global ? global : st.target).addEventListener('scroll', on, { passive: true });
    observeSize(nb, on);
    visFns.push(on);
    nbSync(nb);
    glassIn(nb);
  }
  function nbSync(nb) {
    var st = nb.__cr; if (!st) return;
    var y = scrollTopOf(st.target);
    var lh = st.large ? st.large.offsetHeight : 52;
    var c = clamp(y / Math.max(1, lh), 0, 1);
    nb.style.setProperty('--nb-collapse', c.toFixed(3));
    nb.toggleAttribute('data-title-inline', c >= 0.92 || !st.large);
    if (st.edge) st.edge.toggleAttribute('data-active', y > 1);
    if (nb.hasAttribute('data-navbar-minimize')) {
      var dy = y - st.lastY; st.lastY = y;
      if (y <= lh) { st.acc = 0; nbMin(nb, false); }
      else if (dy) {
        if ((dy > 0) !== (st.acc > 0)) st.acc = 0;
        st.acc += dy;
        if (st.acc > 36) nbMin(nb, true); else if (st.acc < -18) nbMin(nb, false);
      }
    }
  }
  function nbMin(nb, on) {
    var st = nb.__cr; if (st.min === !!on) return;
    st.min = !!on;
    nb.toggleAttribute('data-minimized', st.min);
    drive(nb, st.min ? 1 : 0, { var: '--nb-min', spring: 'smooth' });
  }

  /* ═══ 5 · TAB BAR ══════════════════════════════════════════════════════════
     A 62 pt glass pill; the selection lens
     travels on .4 s / .15 (the 'select' spring), stretching along its travel
     (scaleX ≤ 1.12, scaleY ≥ .84) and lifting 16 pt on press ('lift' .25/0);
     glow from the touch point is LG3's. It MINIMISES on scroll-down and comes
     back on scroll-up, on a tap, or at the top; the bottom accessory moves
     inline beside it; a prominent tab stays. Driven by scroll events +
     ResizeObserver + visibilitychange — never by a single rAF. */
  function tbInit(tb) {
    if (tb.__cr) return;
    var bar = $('.tabbar__bar', tb); if (!bar) return;
    var st = tb.__cr = { min: false, acc: 0, lastY: 0, sel: 0, bar: bar };
    st.row = $('.tabbar__row', tb) || bar.parentNode;
    st.tabs = $$('.tab', bar);
    st.prom = $('.tab-prominent', tb);
    st.acc_ = $('.tabbar__accessory', tb);
    st.lens = $('.tabbar__lens', bar);
    if (!st.lens) {
      st.lens = doc.createElement('span');
      st.lens.className = 'tabbar__lens'; st.lens.setAttribute('aria-hidden', 'true');
      var first = $('.tabbar__tabs', bar) || st.tabs[0];
      bar.insertBefore(st.lens, first);
    }
    if (!st.row.hasAttribute('role')) st.row.setAttribute('role', 'tablist');
    st.sel = Math.max(0, st.tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; }));
    var all = st.tabs.concat(st.prom ? [st.prom] : []);
    all.forEach(function (t, i) {
      t.setAttribute('role', 'tab');
      t.addEventListener('click', function (e) {
        if (st.min) { e.preventDefault(); tbMin(tb, false); return; }
        tbSelect(tb, i, true);
      });
      if (t !== st.prom) {
        t.addEventListener('pointerdown', function () { if (!st.min) st.lens.setAttribute('data-lift', ''); });
      }
    });
    var drop = function () { st.lens.removeAttribute('data-lift'); };
    global.addEventListener('pointerup', drop, true);
    global.addEventListener('pointercancel', drop, true);
    st.row.addEventListener('keydown', function (e) {
      var i = all.indexOf(doc.activeElement); if (i < 0) return;
      var n = all.length, to = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (i - 1 + n) % n;
      else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = n - 1;
      if (to == null) return;
      e.preventDefault();
      all[to].focus(); tbSelect(tb, to, true);
    });
    tb.addEventListener('focusin', function () { if (st.min) tbMin(tb, false); });
    st.target = scrollTarget(tb.getAttribute('data-tabbar-scroll'), tb);
    var onScroll = function () { tbScroll(tb); };
    (st.target === global ? global : st.target).addEventListener('scroll', onScroll, { passive: true });
    observeSize(tb, function () { tbMeasure(tb, true); });
    visFns.push(function () { tbMeasure(tb, true); tbScroll(tb); });
    tbSelect(tb, st.sel, false, true);
    tbMeasure(tb, true);
    glassIn(tb);
    textGlass(bar); textGlass(st.acc_, true);
    later(function () { tbEdgeTone(tb); });
  }
  function tbGeom(tb) {
    var st = tb.__cr, cs = global.getComputedStyle(tb);
    var gap = parseFloat(cs.getPropertyValue('--tb-gap')) || 12;
    var promW = st.prom ? st.prom.offsetWidth : 0;
    var rowW = st.row.clientWidth;
    var max = parseFloat(cs.getPropertyValue('--tb-max')) || 1e9;
    var barW = Math.min(max, rowW - (promW ? promW + gap : 0));
    var pad = parseFloat(cs.getPropertyValue('--tb-pad')) || 4;
    var n = Math.max(1, st.tabs.length), tabW = (barW - 2 * pad) / n;
    return { barW: barW, tabW: tabW, pad: pad, promW: promW, gap: gap };
  }
  function tbMeasure(tb, instant) {
    var st = tb.__cr; if (!st) return;
    var g = tbGeom(tb);
    if (!(g.barW > 0)) return;
    st.g = g;
    tb.style.setProperty('--tb-w', px(g.barW));
    tb.style.setProperty('--tab-w', px(g.tabW));
    tb.style.setProperty('--tb-prom-w', px(g.promW ? g.promW + g.gap : 0));
    var hmin = parseFloat(global.getComputedStyle(tb).getPropertyValue('--tb-hmin')) || 50;
    var center = g.pad + st.sel * g.tabW + g.tabW / 2;
    tb.style.setProperty('--tb-sel-dx', px(hmin / 2 - center));
    tbLens(tb, instant);
  }
  function tbLens(tb, instant) {
    var st = tb.__cr, g = st.g; if (!g) return;
    var lw = Math.min(g.tabW + 8, g.barW - 2 * g.pad);
    var x = clamp(g.pad + st.sel * g.tabW + (g.tabW - lw) / 2, g.pad, g.barW - g.pad - lw);
    st.lens.style.setProperty('--lens-w', px(lw));
    var M = global.MOTION;
    if (instant || !M || !M.spring || reduced()) {
      if (st.lens.__m && st.lens.__m.x) st.lens.__m.x.stop();
      if (st.lens.__m) delete st.lens.__m.x;
      st.lens.style.setProperty('--m-x', px(x));
      st.lens.style.transform = 'translate3d(' + px(x) + ',0,0)';
      st.lens.style.scale = '';
      return;
    }
    M.spring(st.lens, 'x', x, { spring: 'select', frame: function (v, vel) {
      /* stretch along the travel, squash across it — velocity-led, so the
         deformation leads the move and relaxes on entry */
      var s = clamp(Math.abs(vel || 0) / 900, 0, 1);
      st.lens.style.scale = (1 + 0.12 * s).toFixed(4) + ' ' + (1 - 0.16 * s).toFixed(4);
    }, done: function () { st.lens.style.scale = ''; } });
  }
  function tbSelect(tb, i, user, silent) {
    var st = tb.__cr; if (!st) return;
    var all = st.tabs.concat(st.prom ? [st.prom] : []);
    all.forEach(function (t, k) {
      t.setAttribute('aria-selected', k === i ? 'true' : 'false');
      t.tabIndex = k === i ? 0 : -1;
    });
    if (i < st.tabs.length) {
      st.sel = i;
      tb.removeAttribute('data-prominent-selected');
      if (st.g) {
        var hmin = parseFloat(global.getComputedStyle(tb).getPropertyValue('--tb-hmin')) || 50;
        tb.style.setProperty('--tb-sel-dx', px(hmin / 2 - (st.g.pad + i * st.g.tabW + st.g.tabW / 2)));
      }
      tbLens(tb, !user);
    } else tb.setAttribute('data-prominent-selected', '');
    if (!silent) emit(tb, 'tab', { index: i });
  }
  function tbScroll(tb) {
    var st = tb.__cr; if (!st) return;
    tbEdgeTone(tb);
    if (tb.hasAttribute('data-tabbar-static')) return;
    var y = scrollTopOf(st.target), dy = y - st.lastY;
    st.lastY = y;
    if (y <= 4) { st.acc = 0; tbMin(tb, false); return; }
    if (!dy) return;
    /* hysteresis: a direction has to be MEANT (32 px down, 16 px up) */
    if ((dy > 0) !== (st.acc > 0)) st.acc = 0;
    st.acc += dy;
    if (st.acc > 32) tbMin(tb, true); else if (st.acc < -16) tbMin(tb, false);
  }
  /* A bar floating over its content's BOTTOM SCROLL EDGE sits on the edge's
     ground, not on the content under it. LG3 reads the content (it cannot
     see the fade), so a bar over dark art under a light fade went dark glass
     with white labels on a light ground (1.8-2:1). While an active bottom
     edge covers the bar, the bar's glass takes the ground's tone. */
  function pinAs(host, tone) {
    if (!host || !host.hasAttribute('data-lg3') || (host.hasAttribute('data-lg3-tone') && !host.hasAttribute('data-chrome-pinned'))) return;
    if (tone) { if (host.getAttribute('data-lg3-tone') !== tone) { host.setAttribute('data-lg3-tone', tone); host.setAttribute('data-chrome-pinned', ''); } }
    else if (host.hasAttribute('data-chrome-pinned')) { host.removeAttribute('data-lg3-tone'); host.removeAttribute('data-chrome-pinned'); }
  }
  function tbEdgeTone(tb) {
    var st = tb.__cr; if (!st) return;
    var br = st.bar.getBoundingClientRect(); if (!br.width) return;
    var cx = br.left + br.width / 2, cy = br.top + br.height / 2, tone = null;
    $$('.scroll-edge[data-edge="bottom"][data-active]:not([data-edge-duplicate])').some(function (e) {
      var r = e.getBoundingClientRect(), h = parseFloat(global.getComputedStyle(e).getPropertyValue('--edge-h')) || 72;
      /* the lower 60% of the band, where the ground is ≥ ~65% of the fade */
      if (cx < r.left || cx > r.right || cy > r.bottom || cy < r.bottom - 0.6 * h) return false;
      tone = contextTone(e); return true;
    });
    [st.bar, st.acc_, st.prom].forEach(function (h) { pinAs(h, tone); });
  }
  function tbMin(tb, on) {
    var st = tb.__cr; if (!st || st.min === !!on) return;
    st.min = !!on;
    tb.toggleAttribute('data-minimized', st.min);
    drive(tb, st.min ? 1 : 0, { var: '--tb-min', spring: 'smooth' });
    emit(tb, 'minimize', { minimized: st.min });
  }

  /* ═══ 6 · TOOLBAR ══════════════════════════════════════════════════════════
     ≤ 3 glass groups, symbols never grouped with text, ONE tinted primary
     trailing. Behaviour is the WAI toolbar: one tab stop,
     arrow keys between items. */
  function toolInit(tl) {
    if (tl.__cr) return;
    tl.__cr = {};
    if (!tl.hasAttribute('role')) tl.setAttribute('role', 'toolbar');
    var vertical = tl.getAttribute('data-axis') === 'vertical';
    if (vertical) tl.setAttribute('aria-orientation', 'vertical');
    var items = function () { return focusables(tl).filter(function (e) { return !e.closest('.command__panel, .live-capsule__detail'); }); };
    var list = items();
    list.forEach(function (e, i) { e.tabIndex = i === 0 ? 0 : -1; });
    tl.addEventListener('keydown', function (e) {
      if (e.target.matches('input, textarea')) return;
      var l = items(), i = l.indexOf(doc.activeElement); if (i < 0) return;
      var next = vertical ? 'ArrowDown' : 'ArrowRight', prev = vertical ? 'ArrowUp' : 'ArrowLeft', to = null;
      if (e.key === next) to = (i + 1) % l.length; else if (e.key === prev) to = (i - 1 + l.length) % l.length;
      else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = l.length - 1;
      if (to == null) return;
      e.preventDefault();
      l.forEach(function (x, k) { x.tabIndex = k === to ? 0 : -1; });
      l[to].focus();
    });
    tl.addEventListener('focusin', function (e) {
      var l = items(); if (l.indexOf(e.target) < 0) return;
      l.forEach(function (x) { x.tabIndex = x === e.target ? 0 : -1; });
    });
    glassIn(tl);
    $$('.toolbar__group[data-text]', tl).forEach(function (g) { textGlass(g); });
  }

  /* ═══ 7 · SIDEBAR + BACKGROUND EXTENSION ═══════════════════════════════════
     Floating inset glass, or edge to edge (the chrome
     material), icons in the accent again. Folds 248 → 72 on --sb-fold.
     Background extension: the media next to the sidebar
     is mirrored into the region under it and blurred, so the hero seems to
     continue beneath the glass. */
  function sbInit(sb) {
    if (sb.__cr) return;
    var st = sb.__cr = { folded: sb.hasAttribute('data-folded') };
    sb.style.setProperty('--sb-fold', st.folded ? 1 : 0);
    var btn = $('.sidebar__fold', sb);
    if (btn) {
      btn.setAttribute('aria-expanded', st.folded ? 'false' : 'true');
      btn.addEventListener('click', function () { sbFold(sb, !st.folded); });
    }
    $$('.sidebar__item', sb).forEach(function (a) {
      var label = $('.sidebar__label', a);
      if (label && !a.hasAttribute('title')) a.setAttribute('data-label', label.textContent.trim());
      a.addEventListener('click', function (e) {
        if (a.getAttribute('href') === '#' || a.hasAttribute('data-sidebar-select')) e.preventDefault();
        $$('.sidebar__item[aria-current]', sb).forEach(function (x) { x.removeAttribute('aria-current'); });
        a.setAttribute('aria-current', 'page');
      });
    });
    watchTone(sb);
    textGlass(sb, true);
  }
  function sbFold(sb, on) {
    var st = sb.__cr; if (!st) return;
    st.folded = !!on;
    sb.toggleAttribute('data-folded', st.folded);
    var btn = $('.sidebar__fold', sb);
    if (btn) btn.setAttribute('aria-expanded', st.folded ? 'false' : 'true');
    drive(sb, st.folded ? 1 : 0, { var: '--sb-fold', spring: 'smooth' });
  }
  function extInit(ext) {
    if (ext.__cr) return;
    var src = doc.querySelector(ext.getAttribute('data-extend-from'));
    if (!src) return;
    ext.__cr = { src: src };
    var cv = $('canvas', ext);
    if (!cv) { cv = doc.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); ext.appendChild(cv); }
    var draw = function () { extDraw(ext, cv, src); };
    doc.addEventListener('art3:painted', function (e) { if (e.target === src || src.contains(e.target)) draw(); });
    if (src.tagName === 'IMG' && !src.complete) src.addEventListener('load', draw);
    observeSize(ext, draw);
    draw();
  }
  function extDraw(ext, cv, src) {
    var media = src.tagName === 'CANVAS' || src.tagName === 'IMG' || src.tagName === 'VIDEO' ? src : $('canvas, img, video', src);
    if (!media) return;
    var w = ext.clientWidth, h = ext.clientHeight; if (!w || !h) return;
    var mr = media.getBoundingClientRect(), er = ext.getBoundingClientRect();
    var nw = media.width || media.naturalWidth || media.videoWidth, nh = media.height || media.naturalHeight || media.videoHeight;
    if (!nw || !nh || !mr.width) return;
    var sx = nw / mr.width, sy = nh / mr.height;
    var d = Math.min(2, global.devicePixelRatio || 1) * 0.5;       /* it is blurred: half resolution is plenty */
    cv.width = Math.max(1, Math.round(w * d)); cv.height = Math.max(1, Math.round(h * d));
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var start = ext.getAttribute('data-extend') !== 'end';
    /* Mirror across the media's near edge: a point d px outside it shows the
       pixel d px inside. Flipped once, the strip lands with its edge pixel
       against the media — start: source [gap, gap + w] from the left edge;
       end: the same distances measured in from the right edge. */
    var srcW = Math.min(w, mr.width), gap = start ? mr.left - er.right : er.left - mr.right;
    var srcX = start ? gap : mr.width - gap - srcW;
    srcX = clamp(srcX, 0, mr.width - srcW);
    var srcY = clamp(er.top - mr.top, 0, Math.max(0, mr.height - 1));
    ctx.save();
    try {
      ctx.translate(cv.width, 0); ctx.scale(-1, 1);
      ctx.drawImage(media, srcX * sx, srcY * sy, srcW * sx, Math.min(h, mr.height - srcY) * sy, 0, 0, cv.width * srcW / w, cv.height);
    } catch (e) { /* a tainted or unready source: leave the ground */ }
    ctx.restore();
  }

  /* ═══ 8 · INSPECTOR ════════════════════════════════════════════════════════
     A glass side panel that folds to a 52 px strip with a
     vertical label. Filters are a single-select chip row (radio semantics). */
  function inspInit(el) {
    if (el.__cr) return;
    var st = el.__cr = { folded: el.hasAttribute('data-folded') };
    el.style.setProperty('--insp-fold', st.folded ? 1 : 0);
    var btn = $('.inspector__fold', el);
    if (btn) {
      btn.setAttribute('aria-expanded', st.folded ? 'false' : 'true');
      btn.addEventListener('click', function () { inspFold(el, !st.folded); });
    }
    var body = $('.inspector__body', el); setInert(body, st.folded);
    setInert($('.inspector__filters', el), st.folded);   /* folded: faded to 0, so out of the tab order too */
    var chips = $$('.inspector__filter', el);
    if (chips.length) {
      var grp = chips[0].parentNode; grp.setAttribute('role', 'radiogroup');
      var pick = function (c, focus) {
        chips.forEach(function (x) { var on = x === c; x.setAttribute('aria-checked', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
        if (focus) c.focus();
        var f = c.getAttribute('data-filter') || 'all';
        $$('[data-kind]', body).forEach(function (row) { row.hidden = f !== 'all' && row.getAttribute('data-kind') !== f; });
      };
      chips.forEach(function (c) { c.setAttribute('role', 'radio'); c.addEventListener('click', function () { pick(c); }); });
      grp.addEventListener('keydown', function (e) {
        var i = chips.indexOf(doc.activeElement); if (i < 0) return;
        var to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : null;
        if (to == null) return;
        e.preventDefault(); pick(chips[(to + chips.length) % chips.length], true);
      });
      pick(chips.filter(function (c) { return c.getAttribute('aria-checked') === 'true'; })[0] || chips[0]);
    }
    watchTone(el);
    textGlass(el, true);
  }
  function inspFold(el, on) {
    var st = el.__cr; if (!st) return;
    st.folded = !!on;
    el.toggleAttribute('data-folded', st.folded);
    var btn = $('.inspector__fold', el);
    if (btn) btn.setAttribute('aria-expanded', st.folded ? 'false' : 'true');
    setInert($('.inspector__body', el), st.folded);
    setInert($('.inspector__filters', el), st.folded);
    drive(el, st.folded ? 1 : 0, { var: '--insp-fold', spring: 'smooth' });
  }

  /* ═══ 9 · SHEET ════════════════════════════════════════════════════════════
     Detents medium ≈ ½ and large; INSET GLASS at
     partial height whose bottom corners follow the display, growing OPAQUE
     and anchoring to the edges as it reaches full height; it morphs out of
     the button that presented it (LG3.morph) or rises from the bottom; dim
     only when it interrupts ([data-sheet-dim]). The detent gesture is
     MOTION.draggable (1:1, projection, rubber band past large). The drag
     writes --m-y = the sheet's distance below the large detent; CSS turns it
     into HEIGHT (not translate), so the partial sheet keeps a visible,
     rounded bottom edge instead of sliding off the screen. */
  function shInit(sh) {
    if (sh.__cr) return;
    var st = sh.__cr = { open: false, detent: null, y: 0 };
    st.detents = (sh.getAttribute('data-detents') || 'medium large').split(/\s+/).filter(Boolean);
    if (!sh.hasAttribute('role')) sh.setAttribute('role', 'dialog');
    if (sh.hasAttribute('data-sheet-dim')) sh.setAttribute('aria-modal', 'true');
    sh.tabIndex = -1;
    var scrim = doc.createElement('div');
    scrim.className = 'sheet-scrim'; scrim.setAttribute('aria-hidden', 'true');
    if (!sh.hasAttribute('data-sheet-dim')) scrim.setAttribute('data-clear', '');
    /* contained in a positioned window: the scrim covers the window, not the page */
    if (sh.hasAttribute('data-sheet-contained')) scrim.setAttribute('data-sheet-contained', '');
    sh.parentNode.insertBefore(scrim, sh);
    st.scrim = scrim;
    scrim.addEventListener('click', function () { shClose(sh); });
    var grab = $('.sheet__grabber', sh);
    if (grab && st.detents.length > 1) {
      if (grab.tagName !== 'BUTTON') { grab.setAttribute('role', 'button'); grab.tabIndex = 0; }
      grab.setAttribute('aria-label', grab.getAttribute('aria-label') || 'Sheet size');
      grab.addEventListener('click', function () { shCycle(sh); });
      grab.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); shCycle(sh); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); shDetent(sh, 'large'); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); shDetent(sh, st.detents[0]); }
      });
    }
    $$('[data-sheet-close]', sh).forEach(function (b) { b.addEventListener('click', function () { shClose(sh); }); });
    if (sh.id) $$('[data-sheet-open="' + sh.id + '"]').forEach(function (b) {
      b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-controls', sh.id);
      b.addEventListener('click', function () { shOpen(sh, { from: b }); });
    });
    sh.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); shClose(sh); return; }
      if (sh.hasAttribute('data-sheet-dim')) trapTab(sh, e);
    });
    /* drags start on the chrome of the sheet (grabber, header), never on
       its scrolling body, where a vertical move is a scroll */
    var body = $('.sheet__body', sh);
    if (body) body.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    /* MOTION.draggable hears moves only on the sheet and captures after its
       10 px hysteresis — a grab at the top edge pulled upward leaves the sheet
       on the first move and never arms. Capture at pointerdown instead (on the
       grabber or the header's own surface, never a header button, whose click
       must survive); draggable's capture then takes over, so a drag never
       ends in a grabber "click". */
    sh.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      var t = e.target, onChrome = t.closest('.sheet__grabber') || (t.closest('.sheet__header') && !t.closest('button, a, input, select, textarea'));
      if (!onChrome) return;
      try { t.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    });
    var M = global.MOTION;
    if (M && M.draggable) {
      st.drag = M.draggable(sh, {
        axis: 'y',
        bounds: function () { return { min: 0, max: st.g.dismiss, size: st.g.H }; },
        snap: function () { return shSnaps(sh); },
        onStart: function () { st.dragging = true; sh.setAttribute('data-dragging', ''); },
        onMove: function (y) { shSync(sh, y); },
        onEnd: function (y) { st.dragging = false; sh.removeAttribute('data-dragging'); shLanded(sh, y); }
      });
      /* the settle spring has no frame hook: follow it until it lands */
      global.addEventListener('pointerup', function () {
        if (!st.dragging) return;
        st.dragging = false; sh.removeAttribute('data-dragging');
        shFollow(sh);
      }, true);
    }
    var reflow = function () { if (st.open && !st.dragging) { shGeom(sh); shSet(sh, st.g[st.detent] != null ? st.g[st.detent] : 0); } };
    global.addEventListener('resize', reflow);
    /* a contained sheet's detents are fractions of its WINDOW, which can resize on its own */
    if (sh.hasAttribute('data-sheet-contained') && sh.parentElement) observeSize(sh.parentElement, reflow);
    watchTone(sh);
    textGlass(sh, true);
  }
  function shGeom(sh) {
    var st = sh.__cr, cs = global.getComputedStyle(sh);
    var box = sh.offsetParent && sh.offsetParent !== doc.body ? sh.offsetParent : null;
    var H = box ? box.clientHeight : global.innerHeight;
    var top = parseFloat(cs.getPropertyValue('--sheet-top')) || 10;
    var inset = parseFloat(cs.getPropertyValue('--sheet-inset')) || 0;
    var medF = parseFloat(sh.getAttribute('data-medium')) || 0.5;
    var Hl = H - top, Hm = Math.round(H * medF) - inset;
    st.g = { H: Hl, Hm: Hm, large: 0, medium: Math.max(0, Hl - Hm), dismiss: Hl + 24 };
    if (st.detents.indexOf('large') < 0 && st.detents.length === 1 && st.detents[0] === 'medium') st.g.large = st.g.medium;
    sh.style.setProperty('--sheet-hl', px(Hl));
    return st.g;
  }
  function shSnaps(sh) {
    var st = sh.__cr, pts = st.detents.map(function (d) { return st.g[d]; }).filter(function (v) { return v != null; });
    if (!sh.hasAttribute('data-sheet-persistent')) pts.push(st.g.dismiss);
    return pts;
  }
  /* y → the two numbers CSS needs: full (0 at medium → 1 at large: glass →
     opaque, inset → anchored) and vis (0 dismissed → 1 at medium: the scrim) */
  function shSync(sh, y) {
    var st = sh.__cr, g = st.g; if (!g) return;
    st.y = y;
    var full = g.medium > 0 ? clamp(1 - y / g.medium, 0, 1) : 1;
    var vis = clamp((g.H - y) / Math.max(1, g.Hm), 0, 1);
    sh.style.setProperty('--sheet-full', full.toFixed(4));
    sh.style.setProperty('--sheet-vis', vis.toFixed(4));
    st.scrim.style.setProperty('--sheet-vis', vis.toFixed(4));
  }
  function shSet(sh, y) {
    sh.style.setProperty('--m-y', px(y));
    shSync(sh, y);
  }
  function shFollow(sh) {
    var st = sh.__cr, t0 = Date.now();
    st.settling = true;                      /* before the first pass: it reads the flag */
    (function loop() {
      if (st.dragging || !sh.isConnected) return;
      shSync(sh, parseFloat(sh.style.getPropertyValue('--m-y')) || 0);
      if (st.settling !== false && Date.now() - t0 < 1500) later(loop);
    })();
  }
  function shLanded(sh, y) {
    var st = sh.__cr;
    st.settling = false;
    shSync(sh, y);
    if (y >= st.g.dismiss - 1) { shClose(sh, true); return; }
    var best = null;
    st.detents.forEach(function (d) { if (st.g[d] != null && (best == null || Math.abs(st.g[d] - y) < Math.abs(st.g[best] - y))) best = d; });
    shMark(sh, best);
  }
  function shMark(sh, d) {
    var st = sh.__cr; st.detent = d;
    sh.setAttribute('data-detent', d);
    var grab = $('.sheet__grabber', sh);
    if (grab) grab.setAttribute('aria-valuetext', d);
    emit(sh, 'sheet', { open: st.open, detent: d });
  }
  function shSpringTo(sh, y, done) {
    var st = sh.__cr, M = global.MOTION;
    if (!M || !M.spring || reduced()) { shSet(sh, y); if (done) done(); return; }
    st.settling = true;
    M.spring(sh, 'y', y, { spring: 'sheet', frame: function (v) { shSync(sh, v); }, done: function () { st.settling = false; shSync(sh, y); if (done) done(); } });
  }
  function shOpen(sh, opts) {
    var st = sh.__cr; if (!st || st.open) return;
    opts = opts || {};
    st.open = true;
    st.trigger = opts.from || doc.activeElement;
    var d = opts.detent && st.detents.indexOf(opts.detent) >= 0 ? opts.detent : st.detents[0];
    sh.hidden = false;
    sh.removeAttribute('data-lg3-away');
    shGeom(sh);
    var y = st.g[d];
    sh.setAttribute('data-open', ''); st.scrim.setAttribute('data-open', ''); st.scrim.setAttribute('data-shown', '');
    if (sh.hasAttribute('data-sheet-dim')) html.setAttribute('data-sheet-open', '');
    shMark(sh, d);
    pinTone(sh, st.trigger || sh.parentElement);
    pushOpen(sh, function () { shClose(sh); });
    var L = global.LG3, from = st.trigger;
    var canMorph = L && L.morph && from && from.getBoundingClientRect && from.getBoundingClientRect().width > 0 &&
      (from.hasAttribute('data-lg3') || sh.hasAttribute('data-sheet-morph')) && !reduced();
    var focusIn = function () {
      var f = focusables(sh).filter(function (e) { return !e.classList.contains('sheet__grabber'); });
      (sh.hasAttribute('data-sheet-dim') && f[0] ? f[0] : sh).focus({ preventScroll: true });
    };
    if (canMorph) {
      shSet(sh, y);
      st.morphed = true;
      drive(st.scrim, 1, { var: '--sheet-vis', spring: 'sheet' });
      L.morph(from, sh, { spring: 'sheet' }).then(focusIn);
    } else {
      st.morphed = false;
      shSet(sh, st.g.dismiss);
      if (sh.hasAttribute('data-lg3') && L && L.refresh) L.refresh(sh);
      shSpringTo(sh, y);
      later(focusIn);
    }
  }
  function shClose(sh, fromDrag) {
    var st = sh.__cr; if (!st || !st.open) return;
    st.open = false;
    popOpen(sh);
    st.scrim.removeAttribute('data-open');
    html.removeAttribute('data-sheet-open');
    var trig = st.trigger, L = global.LG3;
    var done = commit(sh, 'sheet', function () {
      sh.hidden = true; st.scrim.removeAttribute('data-shown');
      sh.removeAttribute('data-open'); sh.removeAttribute('data-detent');
      if (trig) trig.removeAttribute('data-lg3-away');
      if (trig && trig.focus && (sh.contains(doc.activeElement) || doc.activeElement === doc.body)) trig.focus({ preventScroll: true });
      emit(sh, 'sheet', { open: false, detent: null });
    }, springMs('sheet') + 400);
    var back = st.morphed && !fromDrag && L && L.morph && trig && trig.classList.contains('lg3') && trig.isConnected && !reduced();
    drive(st.scrim, 0, { var: '--sheet-vis', spring: 'sheet' });
    if (back) L.morph(sh, trig, { spring: 'sheet' }).then(done);
    else shSpringTo(sh, st.g.dismiss, done);
  }
  function shDetent(sh, d) {
    var st = sh.__cr; if (!st || !st.open || st.g[d] == null || st.detents.indexOf(d) < 0) return;
    shMark(sh, d);
    shSpringTo(sh, st.g[d]);
  }
  function shCycle(sh) {
    var st = sh.__cr; if (!st) return;
    var i = st.detents.indexOf(st.detent);
    shDetent(sh, st.detents[(i + 1) % st.detents.length]);
  }

  /* ═══ 10 · SCROLL EDGE EFFECT ══════════════════════════════════════════════
     Separation between floating chrome and the content scrolling under it —
     never decoration. soft = progressive blur + fade;
     hard = near-opaque band; auto = soft, promoted to hard when the region
     holds a pinned header or dense text chrome. ONE per scroll container and
     edge: a second is refused ([data-edge-duplicate], console warning). It
     shows only once content is actually under it ([data-active]). */
  function edgeInit(edge) {
    if (edge.__cr) return;
    var st = edge.__cr = {};
    var side = edge.getAttribute('data-edge') || 'top';
    var owner = edge.closest('.navbar');
    st.target = owner && owner.__cr ? owner.__cr.target
      : edge.hasAttribute('data-edge-fixed') ? global : (scrollParent(edge) || global);
    var key = st.target === global ? html : st.target;
    key.__crEdges = key.__crEdges || {};
    if (key.__crEdges[side] && key.__crEdges[side] !== edge && key.__crEdges[side].isConnected) {
      edge.setAttribute('data-edge-duplicate', '');
      if (global.console) console.warn('CHROME: one scroll edge effect per scroll container and edge — ignoring', edge);
      return;
    }
    key.__crEdges[side] = edge;
    var style = edge.getAttribute('data-edge-style') || 'auto';
    if (style === 'auto') {
      var region = st.target === global ? doc : st.target;
      var hard = !!$('[data-pinned-header], .toolbar[data-dense], .navbar[data-dense]', region.body || region);
      edge.setAttribute('data-edge-resolved', hard ? 'hard' : 'soft');
    } else edge.setAttribute('data-edge-resolved', style);
    if (edge.hasAttribute('data-edge-owned')) return;       /* the navbar drives its own */
    var on = function () { edgeSync(edge); };
    (st.target === global ? global : st.target).addEventListener('scroll', on, { passive: true });
    visFns.push(on);
    edgeSync(edge);
  }
  function edgeSync(edge) {
    var st = edge.__cr; if (!st || !st.target) return;
    var t = st.target, y = scrollTopOf(t);
    var max = t === global ? (html.scrollHeight - global.innerHeight) : (t.scrollHeight - t.clientHeight);
    var side = edge.getAttribute('data-edge') || 'top';
    var was = edge.hasAttribute('data-active');
    edge.toggleAttribute('data-active', side === 'top' ? y > 1 : y < max - 1);
    /* a bottom edge that comes or goes changes the ground under a tab bar */
    if (side === 'bottom' && was !== edge.hasAttribute('data-active')) $$('.tabbar').forEach(tbEdgeTone);
  }

  /* ═══ 11 · CONTROL BAR (the sticky media bar) ═══════════════
     Sticky bottom 32 (20 on phones), a 240 × 56 dot bubble
     + a 56 play/pause bubble, 16 apart. Born as a liquid DROP that splits
     into bubbles, to the millisecond of playIntroAnimation(). Glass is denser
     while it moves: fill 1 − α·.28, blur 7px·(2 − α). The current dot is a
     48 px (32 on phones) pill filling over 6.15 s; neighbours stretch as a
     continuous function of the (sprung) index. */
  var CB_SPRING = { drop: 'drop', bubble: 'bubble', content: 'content', dots: 'dots' };
  function cbInit(cb) {
    if (cb.__cr) return;
    var dotsBox = $('.control-bar__dots', cb); if (!dotsBox) return;
    var st = cb.__cr = { index: 0, playing: cb.hasAttribute('data-autoplay'), introduced: false, timers: [] };
    st.dots = $$('.control-bar__dot', dotsBox);
    st.play = $('.control-bar__play', cb);
    if (!cb.hasAttribute('role')) cb.setAttribute('role', 'group');
    var drop = doc.createElement('span');
    drop.className = 'control-bar__drop'; drop.setAttribute('aria-hidden', 'true'); drop.setAttribute('data-lg3', 'platter');
    cb.insertBefore(drop, cb.firstChild);
    st.drop = drop;
    if (!dotsBox.hasAttribute('data-lg3')) dotsBox.setAttribute('data-lg3', 'platter');
    if (st.play && !st.play.hasAttribute('data-lg3')) st.play.setAttribute('data-lg3', 'platter');
    [drop, dotsBox, st.play].forEach(function (e) { if (e && global.LG3 && global.LG3.apply) global.LG3.apply(e); watchTone(e); });
    st.index = Math.max(0, st.dots.findIndex(function (d) { return d.getAttribute('aria-current') === 'true'; }));
    st.dots.forEach(function (d, i) {
      d.style.setProperty('--i', i);
      if (!$('.control-bar__pip', d)) { var p = doc.createElement('span'); p.className = 'control-bar__pip'; p.setAttribute('aria-hidden', 'true'); d.appendChild(p); }
      if (!$('.control-bar__fill', d)) { var f = doc.createElement('span'); f.className = 'control-bar__fill'; $('.control-bar__pip', d).appendChild(f); }
      d.addEventListener('click', function () { cbSelect(cb, i, 'user', true); });
      $('.control-bar__fill', d).addEventListener('animationend', function () {
        if (i !== st.index || !st.playing) return;
        /* data-loop="false": the last card is the end (a replay is shown) */
        if (i === st.dots.length - 1 && cb.getAttribute('data-loop') === 'false') { cbEnded(cb); return; }
        cbSelect(cb, (i + 1) % st.dots.length, 'auto');
      });
    });
    if (st.play) {
      if (!$('.control-bar__icon', st.play)) {
        var pi = glyph('play', 'control-bar__icon control-bar__icon--play'), pa = glyph('pause', 'control-bar__icon control-bar__icon--pause');
        st.play.appendChild(pi); st.play.appendChild(pa);
      }
      st.play.addEventListener('click', function () { cbPlay(cb, !st.playing, true); });
    }
    cb.style.setProperty('--cb-dur', (parseFloat(cb.getAttribute('data-duration')) || 6.15) + 's');
    cb.style.setProperty('--cb-n', st.dots.length);
    dotsBox.style.setProperty('--cb-p', st.index);
    /* WCAG 2.2.2: under reduced motion nothing starts moving on its own */
    if (reduced()) st.playing = false;
    cbPaint(cb);
    /* the intro plays when the bar scrolls into range; a hidden page (no IO
       callbacks) or a keyboard user landing on it plays it too */
    /* two frames after it is seen: the band's first raster (large media coming
       into view) must not eat the drop's opening beats */
    var go = function () { later(function () { later(function () { cbIntro(cb); }); }); };
    if (typeof IntersectionObserver !== 'undefined') {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); go(); } }); }, { threshold: 0.6 });
      io.observe(cb);
      setTimeout(function () {
        var r = cb.getBoundingClientRect();
        if (!st.introduced && doc.visibilityState === 'hidden' && r.top < global.innerHeight && r.bottom > 0) go();
      }, 1600);
    } else go();
    cb.addEventListener('focusin', go);
    observeSize(cb, function () { cbMeasure(cb); });
    cbMeasure(cb);
  }
  function cbMeasure(cb) {
    var st = cb.__cr, cs = global.getComputedStyle(cb);
    var pill = parseFloat(cs.getPropertyValue('--cb-pill')) || 48, n = st.dots.length;
    /* 8 px dots, 8 px margin each side, 16 px padding: 240 at 1440, 224 on phones */
    var bw = (n - 1) * 8 + pill + n * 16 + 32;
    cb.style.setProperty('--cb-bw1', px(bw));
  }
  function cbPaint(cb) {
    var st = cb.__cr;
    st.dots.forEach(function (d, i) {
      var on = i === st.index;
      if (on) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
    cb.toggleAttribute('data-paused', !st.playing);
    cb.toggleAttribute('data-ended', !!st.ended);
    if (st.play) st.play.setAttribute('aria-label', st.playing ? 'Pause' : st.ended ? 'Replay' : 'Play');
  }
  function cbSet(cb, name, to, spring, from) {
    var o = { var: name, spring: spring };
    if (from != null) o.from = from;
    drive(cb, to, o);
  }
  function cbIntro(cb) {
    var st = cb.__cr; if (!st || st.introduced) return;
    st.introduced = true;
    var dots = $('.control-bar__dots', cb);
    if (reduced() || !global.MOTION) {
      ['--cb-y', '--cb-bs'].forEach(function (n, k) { cb.style.setProperty(n, k ? 1 : 0); });
      ['--cb-bw', '--cb-bh', '--cb-alpha', '--cb-play', '--cb-slide', '--cb-intro'].forEach(function (n) { cb.style.setProperty(n, 1); });
      st.dots.forEach(function (d) { d.style.setProperty('--dot-x', 0); });
      cb.setAttribute('data-cb-ready', ''); cb.setAttribute('data-cb-bubble', ''); cb.setAttribute('data-cb-play', ''); cb.setAttribute('data-cb-icon', '');
      cbPaint(cb);
      return;
    }
    var at = function (ms, fn) { st.timers.push(setTimeout(fn, ms)); };
    cb.style.setProperty('--cb-y', 180);
    cb.setAttribute('data-cb-intro', '');
    /* playIntroAnimation(), ms after trigger */
    cb.setAttribute('data-cb-drop', '');
    cbSet(cb, '--cb-drop-s', 0.8, CB_SPRING.drop, 1.3);
    at(30, function () { cbSet(cb, '--cb-y', 0, CB_SPRING.drop, 180); });
    at(50, function () { cbSet(cb, '--cb-drop-w', 1, CB_SPRING.drop, 0); });
    at(150, function () { cbSet(cb, '--cb-drop-h', 1, CB_SPRING.drop, 0); });
    at(300, function () { cb.setAttribute('data-cb-bubble', ''); cbSet(cb, '--cb-bs', 1, CB_SPRING.bubble, 1.3); });
    at(500, function () { cbSet(cb, '--cb-bw', 1, CB_SPRING.bubble, 0); });
    at(520, function () { cb.removeAttribute('data-cb-drop'); cbSet(cb, '--cb-alpha', 1, CB_SPRING.content, 0); });
    at(540, function () { cb.setAttribute('data-cb-play', ''); cbSet(cb, '--cb-play', 1, { duration: 0.65, bounce: 0.3 }, 0); cbSet(cb, '--cb-slide', 1, CB_SPRING.bubble, 0); });
    at(700, function () { cbSet(cb, '--cb-bh', 1, CB_SPRING.bubble, 0); });
    st.dots.forEach(function (d, i) {
      at(740 + 20 * i, function () { drive(d, 0, { var: '--dot-x', spring: CB_SPRING.dots, from: 36 }); });
    });
    at(740, function () { cbSet(cb, '--cb-intro', 1, CB_SPRING.dots, 0); });
    at(940, function () { cb.setAttribute('data-cb-icon', ''); cb.setAttribute('data-cb-ready', ''); });
    /* the end state is committed by the clock, not by the last frame */
    at(2400, function () {
      cb.removeAttribute('data-cb-intro'); cb.removeAttribute('data-cb-drop');
      cb.setAttribute('data-cb-ready', ''); cb.setAttribute('data-cb-bubble', ''); cb.setAttribute('data-cb-play', ''); cb.setAttribute('data-cb-icon', '');
    });
    void dots;
  }
  /* every chrome:controlbar carries user: true for the reader's own press
     (a dot, play/pause) and false for the API, autoplay and the end */
  function cbSelect(cb, i, why, user) {
    var st = cb.__cr; if (!st) return;
    i = clamp(i, 0, st.dots.length - 1);
    var was = st.index;
    st.index = i;
    st.ended = false;
    drive($('.control-bar__dots', cb), i, { var: '--cb-p', spring: 'dots' });
    /* the fill restarts on the new dot: re-trigger even when it is the same one */
    var f = $('.control-bar__fill', st.dots[i]);
    if (f && i === was) { f.style.animation = 'none'; void f.offsetWidth; f.style.animation = ''; }
    cbPaint(cb);
    emit(cb, 'controlbar', { index: i, playing: st.playing, reason: why || 'api', user: !!user });
  }
  function cbPlay(cb, on, user) {
    var st = cb.__cr; if (!st) return;
    st.playing = !!on;
    /* play after the end is a replay: from the first dot */
    if (st.playing && st.ended) { cbSelect(cb, 0, 'play', user); return; }
    cbPaint(cb);
    emit(cb, 'controlbar', { index: st.index, playing: st.playing, reason: 'play', user: !!user });
  }
  function cbEnded(cb) {
    var st = cb.__cr;
    st.playing = false; st.ended = true;
    cbPaint(cb);
    emit(cb, 'controlbar', { index: st.index, playing: false, reason: 'ended', user: false });
  }

  /* ═══ 12 · LIVE CAPSULE ════════════════════════════════════════════════════
     A "now" capsule: compact =
     the action glyph in the item hue + "4/10"; expanded = item, the
     line, progress, elapsed, Stop. ONE --lc-p morphs size and radius;
     a state change re-springs the compact width and cross-fades the words —
     a shape morph, never a hard swap. Inside DEVICE's .device__island the
     island is the frame: no glass, dark roles, and the island grows with it. */
  function lcInit(cap) {
    if (cap.__cr) return;
    var box = $('.live-capsule__glass', cap) || cap;
    /* authored [data-expanded] = a static expanded capsule (a lock-screen
       Live Activity): it starts at --lc-p 1 with no spring, the face inert,
       and it stays open — no outside tap or Escape closes it (pinned);
       CHROME.live.expand(el, false) or a [data-live-collapse] still does. */
    var pinned = cap.hasAttribute('data-expanded');
    var st = cap.__cr = { expanded: pinned, pinned: pinned, box: box };
    st.face = $('.live-capsule__face', cap);
    st.name = st.face ? st.face.getAttribute('aria-label') : null;   /* the name update() keeps current */
    st.detail = $('.live-capsule__detail', cap);
    st.island = !!cap.closest('.device__island');
    if (st.island) { cap.setAttribute('data-island', ''); cap.setAttribute('data-tone', 'dark'); }
    /* the surface the island sits on (DEVICE's screen or scaled viewport, an
       app root, a crop) bounds its expanded width; offsetWidth is the
       logical, untransformed width */
    st.screen = st.island ? cap.closest('.device__island').parentElement : null;
    var lead = $('.live-capsule__lead [data-sym-name], .live-capsule__lead [data-sym]', cap);
    st.glyph = lead ? lead.getAttribute('data-sym-name') || lead.getAttribute('data-sym') : null;
    if (st.detail) { if (!st.detail.id) st.detail.id = 'live-detail-' + (++uid); setInert(st.detail, !pinned); }
    if (st.face) {
      st.face.setAttribute('aria-expanded', pinned ? 'true' : 'false');
      if (st.detail) st.face.setAttribute('aria-controls', st.detail.id);
      st.face.addEventListener('click', function () { lcExpand(cap, true); });
      if (pinned) setInert(st.face, true);
    }
    if (pinned) cap.style.setProperty('--lc-p', 1);
    $$('[data-live-collapse]', cap).forEach(function (b) { b.addEventListener('click', function () { lcExpand(cap, false); if (st.face) st.face.focus(); }); });
    $$('.live-capsule__stop', cap).forEach(function (b) { b.addEventListener('click', function () { emit(cap, 'live-stop', {}); }); });
    doc.addEventListener('pointerdown', function (e) { if (st.expanded && !st.pinned && !cap.contains(e.target)) lcExpand(cap, false); }, true);
    lcMeasure(cap, true);
    /* the face is absolute: its own size (a web font landing, new words) must
       be watched. The capsule's own width moves its parent (the island, a
       shrink-wrapped slot), so a measure made INSIDE the observer resized an
       observed box again: a "ResizeObserver loop" error every frame of a
       state change. It runs on the next frame instead, once per frame. */
    var remeasure = function () {
      if (st.roQueued) return;
      st.roQueued = true;
      later(function () { st.roQueued = false; if (!st.moving) lcMeasure(cap, true); });
    };
    [st.face, st.detail, cap.parentNode, st.screen].forEach(function (e) { if (e) observeSize(e, remeasure); });
    /* elapsed: information, so it keeps ticking under reduced motion */
    st.clock = $('.live-capsule__elapsed', cap);
    var start = parseFloat(cap.getAttribute('data-live-start'));
    if (st.clock && !isFinite(start) && cap.hasAttribute('data-elapsed')) start = Date.now() - parseFloat(cap.getAttribute('data-elapsed')) * 1000;
    if (st.clock && isFinite(start)) { st.start = start; lcTick(cap); }
    watchTone(box);
    textGlass(box === cap ? null : box, true);
  }
  function lcClock(s) { s = Math.max(0, Math.floor(s)); var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
  /* write the clock now and keep it ticking (one interval per capsule) */
  function lcTick(cap) {
    var st = cap.__cr, el = st.clock; if (!el) return;
    var tick = function () { if (doc.visibilityState !== 'hidden' && st.start != null) el.textContent = lcClock((Date.now() - st.start) / 1000); };
    tick();
    if (!st.tickT) st.tickT = setInterval(tick, 1000);
  }
  /* a custom property written only when it changes: an unchanged write still
     restyles the capsule */
  function lcSet(cap, name, v) { if (cap.style.getPropertyValue(name) !== v) cap.style.setProperty(name, v); }
  function lcMeasure(cap, instant) {
    var st = cap.__cr; if (!st) return;
    if (st.screen && st.screen.offsetWidth) lcSet(cap, '--lc-screen-w', px(st.screen.offsetWidth));
    var w0 = st.face ? st.face.offsetWidth : 120, h0 = st.face ? st.face.offsetHeight : 36;
    var w1 = st.detail ? st.detail.offsetWidth : w0, h1 = st.detail ? st.detail.offsetHeight : h0;
    /* the compact width: a 1 px change is rounding, not new words (a centred
       face's offsetWidth snaps with its sub-pixel left, which the width itself
       moves: 157 ↔ 158 every frame). While it springs, a re-measure re-aims
       the spring — an instant write snapped it to its end for a frame. */
    if (st.w0 == null || Math.abs(w0 - st.w0) > 1) {
      st.w0 = w0;
      if (instant && !st.w0Moving) lcSet(cap, '--lc-w0n', w0.toFixed(1));
      else { st.w0Moving = true; drive(cap, w0, { var: '--lc-w0n', spring: 'snappy', onDone: function () { st.w0Moving = false; } }); }
    }
    lcSet(cap, '--lc-h0n', h0.toFixed(1));
    lcSet(cap, '--lc-w1n', w1.toFixed(1));
    lcSet(cap, '--lc-h1n', h1.toFixed(1));
  }
  /* the first control of the detail, or — a state with nothing to press
     (nap, needs-you: no Stop) — the detail itself, named by its words, so
     focus never falls to <body> when the face goes inert */
  function lcFocusDetail(cap) {
    var st = cap.__cr, f = focusables(st.detail)[0];
    if (!f) {
      f = st.detail;
      if (!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1');
      if (!f.hasAttribute('aria-label') && !f.hasAttribute('aria-labelledby')) {
        var ids = $$('.live-capsule__account, .live-capsule__line', f).map(function (e) { if (!e.id) e.id = 'live-words-' + (++uid); return e.id; });
        f.setAttribute('role', 'group');
        if (ids.length) f.setAttribute('aria-labelledby', ids.join(' ')); else f.setAttribute('aria-label', 'Details');
      }
    }
    f.focus({ preventScroll: true });
  }
  function lcExpand(cap, on) {
    var st = cap.__cr; if (!st || st.expanded === !!on) return;
    /* read BEFORE the face goes inert: inert drops its focus to <body> */
    var had = cap.contains(doc.activeElement);
    st.expanded = !!on;
    st.pinned = false;                       /* once moved, it behaves like any capsule */
    lcMeasure(cap, true);
    cap.toggleAttribute('data-expanded', st.expanded);
    if (st.face) st.face.setAttribute('aria-expanded', st.expanded ? 'true' : 'false');
    setInert(st.detail, !st.expanded);
    setInert(st.face, st.expanded);
    st.moving = true;
    var done = commit(cap, 'lc', function () { st.moving = false; }, springMs('bouncy') + 200);
    /* expand with a little life, collapse critically (bounce only when
       the gesture carried momentum — a tap here is a small one) */
    drive(cap, st.expanded ? 1 : 0, { var: '--lc-p', spring: st.expanded ? 'bouncy' : 'smooth', onDone: done });
    if (st.expanded) {
      st.took = had;
      if (had && st.detail) later(function () { if (st.expanded) lcFocusDetail(cap); });
      pushOpen(cap, function () { var inside = cap.contains(doc.activeElement); lcExpand(cap, false); if (inside && st.face) st.face.focus(); });
    } else {
      popOpen(cap);
      /* closing hands focus back to the face — also when it had fallen to
         <body> inside this capsule (a hidden Stop, a state with nothing to
         press) after the keyboard opened it */
      var lost = !doc.activeElement || doc.activeElement === doc.body;
      if (st.face && (had || (st.took && lost))) st.face.focus({ preventScroll: true });
      st.took = false;
    }
    emit(cap, 'live', { expanded: st.expanded });
  }
  function lcText(cap, sel, v) { var e = $(sel, cap); if (e && v != null) e.textContent = v; }
  /* the face's name from what the face now shows: a halted, napping or
     warming capsule must not still say "Like, 4 of 10". "4/10" is read
     "4 of 10" plus the meter's unit (its aria-label, "People") */
  function lcName(cap) {
    var t = function (sel) { var e = $(sel, cap); return e ? e.textContent.trim() : ''; };
    var m = $('.live-capsule__meter', cap), unit = m && !m.hidden ? (m.getAttribute('aria-label') || '').toLowerCase() : '';
    var trail = t('.live-capsule__trail'), p = /^(\d+)\s*\/\s*(\d+)$/.exec(trail);
    if (p) trail = p[1] + ' of ' + p[2] + (unit ? ' ' + unit : '');
    return 'Now: ' + [t('.live-capsule__summary'), trail].filter(Boolean).join(', ') + '. Show details';
  }
  function lcUpdate(cap, d) {
    var st = cap.__cr; if (!st || !d) return;
    /* a cross-fade is under way: this update rides along with it, so a tick
       that lands inside the 120 ms is not overwritten by the older words */
    if (st.pending) { for (var k in d) st.pending[k] = d[k]; return; }
    var now = function (sel) { var e = $(sel, cap); return e ? e.textContent : null; };
    /* the words fade only when the STATE changes (what is running, where,
       for whom); a trail / count / meter / clock tick is written in place —
       a per-second countdown or a person count must not flicker */
    var swap = (d.kind != null && d.kind !== cap.getAttribute('data-kind')) ||
      (d.glyph != null && d.glyph !== st.glyph) ||
      (d.summary != null && d.summary !== now('.live-capsule__summary')) ||
      (d.account != null && d.account !== now('.live-capsule__account')) ||
      (d.line != null && d.line !== now('.live-capsule__line'));
    var apply = function (d) {
      if (d.kind) cap.setAttribute('data-kind', d.kind);
      if (d.hue) cap.style.setProperty('--lc-hue', d.hue);
      if (d.glyph && d.glyph !== st.glyph) {
        st.glyph = d.glyph;
        $$('.live-capsule__lead, .live-capsule__glyph', cap).forEach(function (h) {
          var old = $('svg.sym, i[data-sym]', h);
          if (global.SYM && global.SYM.replace && old && old.tagName === 'svg' && !reduced()) global.SYM.replace(h, d.glyph);
          else { if (old) old.remove(); h.appendChild(glyph(d.glyph)); }
        });
      }
      lcText(cap, '.live-capsule__trail', d.trail);
      lcText(cap, '.live-capsule__summary', d.summary);
      lcText(cap, '.live-capsule__account', d.account);
      lcText(cap, '.live-capsule__line', d.line);
      var m = $('.live-capsule__meter', cap);
      /* asked: null = not a progress state (warm-up, nap, halted): no meter */
      if (m && d.asked === null) m.hidden = true;
      else if (d.done != null && d.asked != null) {
        if (m) { m.hidden = false; m.setAttribute('aria-valuenow', d.done); m.setAttribute('aria-valuemax', d.asked); m.style.setProperty('--lc-meter', clamp(d.done / Math.max(1, d.asked), 0, 1)); }
        if (d.count == null) lcText(cap, '.live-capsule__count', d.done + ' of ' + d.asked);
      }
      lcText(cap, '.live-capsule__count', d.count);
      /* a state with no clock (nap, halted) shows none — the last state's
         time, frozen, read as this one's; a clock is written at once */
      if (d.elapsed === null) st.start = null;
      if (st.clock && d.elapsed !== undefined) st.clock.hidden = d.elapsed === null;
      if (d.elapsed != null) { st.start = Date.now() - d.elapsed * 1000; lcTick(cap); }
      /* an authored name is kept true to the state (a face with no
         aria-label is named by its own words already) — unless the page
         has renamed the face itself since (it owns the name then) */
      if (st.face && (d.label || (st.name != null && st.face.getAttribute('aria-label') === st.name))) {
        st.name = d.label || lcName(cap);
        st.face.setAttribute('aria-label', st.name);
      }
      lcMeasure(cap, false);
      cap.removeAttribute('data-swap');
    };
    if (!swap || reduced()) { apply(d); return; }
    /* words cross-fade (120 ms out, then in) while the shape re-springs */
    st.pending = {}; for (var j in d) st.pending[j] = d[j];
    cap.setAttribute('data-swap', '');
    setTimeout(function () { var p = st.pending; st.pending = null; apply(p); }, 120);
  }

  /* ═══ 13 · COMMAND PALETTE ═════════════════════════════════════════════════
     A glass pill that MORPHS into the palette (LG3.morph on the localnav
     springs) — pill → panel, and back into the pill on close. ⌘K / Ctrl+K
     opens the first palette on the page (or the one marked
     [data-command-hotkey]). Combobox + listbox semantics; arrows, Enter,
     Escape. Selection is announced as chrome:command {value, label}. */
  var cmdHotkey = false;
  function cmdInit(root) {
    if (root.__cr) return;
    var pill = $('.command__pill', root), panel = $('.command__panel', root);
    if (!pill || !panel) return;
    var st = root.__cr = { open: false, pill: pill, panel: panel, active: -1 };
    st.input = $('.command__input', panel);
    st.list = $('.command__list', panel);
    st.items = $$('.command__item', panel);
    if (!panel.id) panel.id = 'command-' + (++uid);
    if (st.list && !st.list.id) st.list.id = panel.id + '-list';
    panel.setAttribute('role', 'dialog');
    if (!panel.hasAttribute('aria-label')) panel.setAttribute('aria-label', 'Command palette');
    pill.setAttribute('aria-haspopup', 'dialog'); pill.setAttribute('aria-expanded', 'false'); pill.setAttribute('aria-controls', panel.id);
    if (st.list) st.list.setAttribute('role', 'listbox');
    st.items.forEach(function (it, i) {
      it.setAttribute('role', 'option'); if (!it.id) it.id = panel.id + '-o' + i;
      it.addEventListener('pointermove', function () { if (!it.hidden) cmdActive(root, st.items.indexOf(it)); });
      it.addEventListener('click', function () { cmdChoose(root, it); });
    });
    if (st.input) {
      st.input.setAttribute('role', 'combobox'); st.input.setAttribute('aria-expanded', 'true');
      st.input.setAttribute('aria-autocomplete', 'list');
      if (st.list) st.input.setAttribute('aria-controls', st.list.id);
      st.input.addEventListener('input', function () { cmdFilter(root); });
    }
    panel.addEventListener('keydown', function (e) {
      var vis = st.items.filter(function (x) { return !x.hidden; }), i = vis.indexOf(st.items[st.active]);
      if (e.key === 'Escape') { e.preventDefault(); cmdClose(root); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (vis.length) cmdActive(root, st.items.indexOf(vis[(i + 1) % vis.length])); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (vis.length) cmdActive(root, st.items.indexOf(vis[(i - 1 + vis.length) % vis.length])); }
      else if (e.key === 'Home' && e.target !== st.input) { e.preventDefault(); if (vis.length) cmdActive(root, st.items.indexOf(vis[0])); }
      else if (e.key === 'Enter') { e.preventDefault(); if (st.items[st.active] && !st.items[st.active].hidden) cmdChoose(root, st.items[st.active]); }
      else if (e.key === 'Tab') trapTab(panel, e);
    });
    pill.addEventListener('click', function () { cmdOpen(root); });
    doc.addEventListener('pointerdown', function (e) { if (st.open && !panel.contains(e.target) && !pill.contains(e.target)) cmdClose(root, true); }, true);
    if (!cmdHotkey) {
      cmdHotkey = true;
      doc.addEventListener('keydown', function (e) {
        if (!(e.metaKey || e.ctrlKey) || (e.key !== 'k' && e.key !== 'K')) return;
        var r = $('.command[data-command-hotkey]') || $('.command');
        if (!r || !r.__cr) return;
        e.preventDefault();
        if (r.__cr.open) cmdClose(r); else cmdOpen(r);
      });
    }
    watchTone(pill); watchTone(panel);
    textGlass(pill, true); textGlass(panel, true);   /* the pill holds a label-2 glyph */
  }
  function cmdActive(root, i) {
    var st = root.__cr; st.active = i;
    st.items.forEach(function (x, k) { x.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    var it = st.items[i];
    if (st.input) { if (it) st.input.setAttribute('aria-activedescendant', it.id); else st.input.removeAttribute('aria-activedescendant'); }
    if (it && it.scrollIntoView) it.scrollIntoView({ block: 'nearest' });
  }
  function cmdFilter(root) {
    var st = root.__cr, q = (st.input ? st.input.value : '').trim().toLowerCase(), first = -1;
    st.items.forEach(function (it, i) {
      var t = (it.getAttribute('data-keywords') || '') + ' ' + it.textContent;
      var hit = !q || t.toLowerCase().indexOf(q) >= 0;
      it.hidden = !hit;
      if (hit && first < 0) first = i;
    });
    $$('.command__group', root).forEach(function (g) { g.hidden = !$$('.command__item', g).some(function (x) { return !x.hidden; }); });
    var empty = $('.command__empty', root); if (empty) empty.hidden = first >= 0;
    cmdActive(root, first);
  }
  function cmdOpen(root) {
    var st = root.__cr; if (!st || st.open) return;
    st.open = true;
    st.pill.setAttribute('aria-expanded', 'true');
    root.setAttribute('data-open', '');
    pushOpen(root, function () { cmdClose(root); });
    pinTone(st.panel, root);
    if (st.input) st.input.value = '';
    cmdFilter(root);
    var L = global.LG3;
    var focus = function () { if (st.open && st.input) st.input.focus({ preventScroll: true }); };
    if (L && L.morph) { st.panel.hidden = false; L.morph(st.pill, st.panel, { spring: 'nav-in' }); focus(); }
    else { st.panel.hidden = false; st.pill.setAttribute('data-lg3-away', ''); focus(); }
  }
  function cmdClose(root, outside) {
    var st = root.__cr; if (!st || !st.open) return;
    st.open = false;
    st.pill.setAttribute('aria-expanded', 'false');
    root.removeAttribute('data-open');
    popOpen(root);
    var L = global.LG3;
    var done = commit(root, 'cmd', function () { if (!st.open) { st.panel.hidden = true; st.panel.removeAttribute('data-lg3-away'); st.pill.removeAttribute('data-lg3-away'); } }, springMs('nav-out') + 400);
    if (L && L.morph) L.morph(st.panel, st.pill, { spring: 'nav-out' }).then(done); else done();
    if (!outside || st.panel.contains(doc.activeElement)) st.pill.focus({ preventScroll: true });
  }
  function cmdChoose(root, it) {
    var v = it.getAttribute('data-value') || it.textContent.trim();
    var label = ($('.command__label', it) || it).textContent.trim();
    cmdClose(root);
    emit(root, 'command', { value: v, label: label });
  }

  /* ═══ 14 · MOUNT ═══════════════════════════════════════════════════════════ */
  var KINDS = [
    ['.globalnav', gnInit], ['.localnav', lnInit], ['.navbar', nbInit], ['.tabbar', tbInit],
    ['.toolbar', toolInit], ['.sidebar', sbInit], ['.bg-extension[data-extend-from]', extInit],
    ['.inspector', inspInit], ['.sheet', shInit], ['.scroll-edge', edgeInit],
    ['.control-bar', cbInit], ['.live-capsule', lcInit], ['.command', cmdInit]
  ];
  var fontsHooked = false;
  function mount(root) {
    root = root || doc;
    var out = {};
    /* measured geometry (CTA widths, capsule faces) depends on the web font */
    if (!fontsHooked && doc.fonts && doc.fonts.ready) { fontsHooked = true; doc.fonts.ready.then(function () { refresh(doc); }); }
    KINDS.forEach(function (k) {
      var list = $$(k[0], root);
      if (root.matches && root.matches(k[0])) list.unshift(root);
      var n = 0;
      list.forEach(function (el) {
        try { k[1](el); n++; }
        catch (e) { if (global.console) console.error('CHROME: ' + k[0] + ' failed to mount', e); }
      });
      if (n) out[k[0].replace(/^\.|\[.*$/g, '')] = n;
    });
    return out;
  }
  function refresh(root) {
    root = root || doc;
    $$('.localnav', root).forEach(lnMeasure);
    $$('.tabbar', root).forEach(function (t) { tbMeasure(t, true); });
    $$('.navbar', root).forEach(nbSync);
    $$('.scroll-edge', root).forEach(edgeSync);
    $$('.control-bar', root).forEach(function (c) { if (c.__cr) cbMeasure(c); });
    $$('.live-capsule', root).forEach(function (c) { lcMeasure(c, true); });
  }

  global.CHROME = {
    mount: mount, refresh: refresh,
    globalnav: { open: gnOpen, close: gnClose, menu: gnMenu },
    localnav: { open: lnOpen, close: lnClose, toggle: lnToggle, reveal: lnReveal, measure: lnMeasure },
    navbar: { sync: nbSync, minimize: nbMin },
    tabbar: { select: function (el, i) { tbSelect(el, i, true); }, minimize: tbMin, sync: function (el) { tbMeasure(el, true); } },
    sidebar: { fold: sbFold }, inspector: { fold: inspFold },
    sheet: { open: shOpen, close: shClose, detent: shDetent },
    scrollEdge: { sync: edgeSync },
    controlBar: { intro: cbIntro, select: function (el, i) { cbSelect(el, i, 'api'); }, play: cbPlay },
    live: { expand: lcExpand, toggle: function (el) { lcExpand(el, !(el.__cr && el.__cr.expanded)); }, update: lcUpdate, measure: lcMeasure },
    command: { open: cmdOpen, close: cmdClose }
  };
})(window);
