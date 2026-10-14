/* ═══════════════════════════════════════════════════════════════════════════
   showcase.js → SHOW — the product-page section kit's behaviour
   ───────────────────────────────────────────────────────────────────────────
   Plain script, one global, never mounts itself: FG3.boot() calls
   SHOW.mount(document) after ANIM, DEVICE, UI and CHROME. Every component
   reads complete without this file; SHOW adds the motion and the controls.
   Scroll choreography is AUTHORED as ANIM markup (data-anim-*, data-scene,
   data-clip-expand, data-scrub) — SHOW writes those attributes onto a
   component's parts and hands them back to ANIM.mount, it does not run its
   own scroll maths. Touch is a spring (MOTION.progress / DEVICE.fold);
   Curves are used only for fire-and-forget page moves.

   PUBLIC API (global SHOW)
     mount(root=document) → {count}      enhance every component under root
                                         (idempotent; also accepts a component)
     instances                           [{kind, el, api}]
     get(el) → api                       the instance behind a component root
     tweenScroll(el, left, ms=1000, done)  the page move: snap off, a
                                         scrollLeft tween on easeInOutQuad,
                                         snap back; a wheel/touch/pointer
                                         takes over; reduced motion jumps
     version
   PER COMPONENT (get(el) returns these)
     .gallery      {go(i), play(), pause(), index, playing}
     .scroller     {page(±1), update()}
     .feature-tabs {select(i)}
     .pose         {open(i), close(), index}
     .compare      {select(i)}
     .card-overlay {open(), close(), isOpen}   target: .card-overlay-panel (in
                   card), dialog.card-overlay-sheet, or the chrome module's .sheet (CHROME.sheet)
     .swatches     {select(value)}
     .hero         {fold(v), owned}   owned turns true on a drag or key on the
                   device, or on any .device-fold-slider bound to its duo
     .faq          {expandAll(), collapseAll()}
   EVENTS (bubbling CustomEvent on the component root)
     show:gallery {index} · show:tab {index} · show:pose {index, pose|null}
     show:compare {index} · show:overlay {open} · show:swatch {value, finish}
   ATTRIBUTES WRITTEN
     gallery: --autoplay-progress, --i, data-m-moving. With the chrome module's .control-bar
       inside and CHROME loaded (data-bar="control-bar") it drives that bar
       (CHROME.controlBar.select/play; listens to chrome:controlbar). Else it
       builds .gallery-bar-track > .gallery-bar > .gallery-dots + .gallery-play,
       with data-playing / data-ended, and ANIM recipe 14 (is-in) on the bar.
     scroller: --hover-scale on cards, paddles (built when absent), disabled.
     tabs: role/aria, --ind-x/--ind-w (MOTION 'select'), data-active, inert,
       data-ready, data-overflow.
     pose: --chip-w, --card-h, --progress (MOTION 'tour'), data-open, inert.
     scene: data-scene, data-scene-sticky, and the TextOverMedia keyframes on .scene-media / .scene-copy unless authored;
       --scene-copy-end / --scene-note-h (px) on the root for the base
       experience's scrim mask.
     faq: a chevron in any summary without one; on its .faq-expand
       aria-controls, aria-expanded and the label (built with its .faq-bar
       when the .faq has data-expand-all).
     clip-expand: data-clip-expand masked to small/xsmall unless authored.
     glow-ring: its .glow-ring-edge / .glow-ring-bloom layers (each a turning
       .glow-ring-cone), data-glow-idle while off screen; once, in idle
       time, a still copy in a [data-lg3-warm] deck on <html> for three
       frames (its shader programs compile before it scrolls in).
     hero: data-scrub on .hero-media (fold follows scroll), role=slider.
     html: --show-sbw (classic scrollbar width), data-show-modal (scroll lock).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc) return;
  var html = doc.documentElement;
  var VERSION = '3.0.0';

  /* ── small helpers ─────────────────────────────────────────────────────── */
  function mq(q) { try { return global.matchMedia(q); } catch (e) { return { matches: false, addEventListener: function () {} }; } }
  var RM = mq('(prefers-reduced-motion: reduce)');
  function reduced() { return RM.matches || html.classList.contains('fd-reduced-motion'); }
  function enhanced() { return html.classList.contains('fd-enhanced'); }
  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || doc).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return global.performance ? performance.now() : Date.now(); }
  var uid = 0;
  function idOf(el, p) { if (!el.id) el.id = 'show-' + (p || 'el') + '-' + (++uid); return el.id; }
  function emit(el, name, detail) {
    try { el.dispatchEvent(new CustomEvent('show:' + name, { bubbles: true, detail: detail })); } catch (e) {}
  }
  function raf(fn) { return global.requestAnimationFrame ? requestAnimationFrame(fn) : setTimeout(fn, 16); }
  var FALLBACK_GLYPH = { 'chevron-left': '\u2039', 'chevron-right': '\u203a', 'chevron-up': '\u2303', 'chevron-down': '\u2304',
    play: '\u25b6', pause: '\u275a\u275a', xmark: '\u00d7', plus: '+', 'arrow-clockwise': '\u21bb' };
  /* A symbol is type (SYM); without SYM a text glyph keeps the control labelled. */
  function glyph(name) {
    if (global.SYM && SYM.build && (!SYM.has || SYM.has(name))) return SYM.build(name, '', '');
    var s = doc.createElement('span');
    s.setAttribute('aria-hidden', 'true');
    s.textContent = FALLBACK_GLYPH[name] || '';
    return s;
  }
  function setGlyph(btn, name) {
    var cur = btn.querySelector('svg.sym,span[aria-hidden]');
    if (cur && cur.getAttribute('data-sym-name') === name) return;
    if (cur && global.SYM && SYM.replace && !reduced()) { SYM.replace(cur, name); return; }
    if (cur) cur.remove();
    btn.appendChild(glyph(name));
  }
  function mkButton(cls, label, name) {
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = cls;
    if (label) b.setAttribute('aria-label', label);
    if (name) b.appendChild(glyph(name));
    return b;
  }
  function inert(el, on) {
    if (!el) return;
    if ('inert' in el) el.inert = !!on;
    if (on) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
  }
  /* Density follows motion: [data-m-moving] while a rail scrolls. */
  function movingFlag(el) {
    var t = 0;
    return function () {
      el.setAttribute('data-m-moving', '');
      clearTimeout(t);
      t = setTimeout(function () { el.removeAttribute('data-m-moving'); }, 180);
    };
  }
  function whenSeen(el, fn) {
    if (global.FG3 && FG3.whenSeen) return FG3.whenSeen(el, fn);
    if (!global.IntersectionObserver) { fn(el); return function () {}; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); fn(el); } });
    }, { threshold: 0.3 });
    io.observe(el);
    return function () { io.disconnect(); };
  }
  /* Hand fresh ANIM markup back to ANIM (it only collects unmounted nodes). */
  function animMount(el) { if (global.ANIM && ANIM.mount) try { ANIM.mount(el); } catch (e) { warn(e); } }
  function warn(e) { if (global.console) console.warn('SHOW:', e && e.message ? e.message : e); }

  /* ── The page move: snap off, scrollLeft tween, 1s
     easeInOutQuad, snap back. The finger always wins: wheel / touch /
     pointer on the rail ends the tween where it is. A deadline lands it if
     rAF never runs (hidden page). Reduced motion: an instant jump. ─────── */
  function easeInOutQuad(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
  function tweenScroll(el, to, ms, done) {
    if (el.__showTween) el.__showTween.finish(false);
    ms = ms == null ? 1000 : ms;
    var from = el.scrollLeft;
    if (Math.abs(to - from) < 1 || reduced() || !ms) {
      try { el.scrollTo({ left: to, behavior: 'instant' }); } catch (e) { el.scrollLeft = to; }
      if (done) done();
      return;
    }
    var ease = (global.ANIM && ANIM.ease) ? ANIM.ease('easeInOutQuad') : easeInOutQuad;
    var t0 = now(), st = { done: false, raf: 0, timer: 0 };
    function stop() { st.finish(false); }
    function off() {
      el.removeEventListener('wheel', stop); el.removeEventListener('touchstart', stop); el.removeEventListener('pointerdown', stop);
    }
    st.finish = function (jump) {
      if (st.done) return;
      st.done = true;
      if (global.cancelAnimationFrame) cancelAnimationFrame(st.raf);
      clearTimeout(st.timer);
      if (jump) el.scrollLeft = to;
      el.style.scrollSnapType = '';
      el.__showTween = null;
      off();
      if (done) done();
    };
    function step(t) {
      if (st.done) return;
      var p = clamp((t - t0) / ms, 0, 1);
      el.scrollLeft = from + (to - from) * ease(p);
      if (p < 1) st.raf = raf(step); else st.finish(false);
    }
    el.__showTween = st;
    el.style.scrollSnapType = 'none';
    el.addEventListener('wheel', stop, { passive: true });
    el.addEventListener('touchstart', stop, { passive: true });
    el.addEventListener('pointerdown', stop);
    st.raf = raf(step);
    st.timer = setTimeout(function () { st.finish(true); }, ms + 250);
  }
  /* Where the browser would snap item: honours scroll-snap-align (inline
     value) and scroll-padding, clamped to the scroll range. */
  /* scroll-padding with a % inside max()/calc() comes back from
     getComputedStyle UNRESOLVED ("max(6.25%, 50% - 210px)" — measured,
     Edge 153); the kit sets it equal to the padding, which does resolve. */
  function scrollPad(rs, side) {
    var v = rs['scrollPadding' + side];
    return /^-?[0-9.]+px$/.test(v) ? parseFloat(v) : (parseFloat(rs['padding' + side]) || 0);
  }
  function snapLeft(rail, item) {
    var rs = global.getComputedStyle(rail), al = (global.getComputedStyle(item).scrollSnapAlign || 'start').split(' ');
    var a = al[1] || al[0], pl = scrollPad(rs, 'Left'), pr = scrollPad(rs, 'Right');
    var x = item.offsetLeft, w = item.offsetWidth, cw = rail.clientWidth, left;
    if (a === 'center') left = x + w / 2 - (pl + (cw - pl - pr) / 2);
    else if (a === 'end') left = x + w - (cw - pr);
    else left = x - pl;
    return clamp(left, 0, Math.max(0, rail.scrollWidth - cw));
  }
  function stepOf(items) { return items.length > 1 ? (items[1].offsetLeft - items[0].offsetLeft) || 1 : 1; }

  /* ═══ HERO ═════════════════════════════════════════════════════════════════
     The duo opens as you arrive and as you scroll, or under your finger.
     Authored final state is the open device (data-fold on the markup); when
     the page is enhanced and motion is allowed, SHOW closes it, unfolds it to
     The ⅓ landing pose on entry (DEVICE's hinge spring) and lets the
     scroll carry it the rest of the way (ANIM data-scrub → DEVICE.set). A
     drag or a key — on the device, or on any fold slider bound to this duo —
     hands the hinge to the reader for good. */
  function Hero(root) {
    var media = $('.hero-media', root), duo = media && $('.device[data-device="duo"]', media);
    if (!duo || !global.DEVICE) return null;
    var D = global.DEVICE, BASE = 1 / 3, DET = D.DETENTS || [0, 1 / 3, 1];
    var api = { owned: false, fold: function (v) { api.owned = true; return D.fold(duo, v); } };
    var scrollP = 0, introDone = false;
    media.tabIndex = 0;
    media.setAttribute('role', 'slider');
    if (!media.hasAttribute('aria-label')) media.setAttribute('aria-label', 'Open and close the device');
    media.setAttribute('aria-valuemin', '0');
    media.setAttribute('aria-valuemax', '100');
    function stateText(v) { return v < 0.04 ? 'closed' : v > 0.96 ? 'open' : Math.abs(v - BASE) < 0.04 ? 'half open' : Math.round(v * 100) + '% open'; }
    function aria() {
      var v = D.value(duo);
      media.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      media.setAttribute('aria-valuetext', stateText(v));
    }
    aria();
    duo.addEventListener('device:fold', function (e) { if (e.detail && e.detail.settled) aria(); });
    /* A fold slider bound to this duo is the reader's hand too (DEVICE binds
       .device-fold-slider[data-for=id], or the nearest duo above it — the
       same rule here). Delegated and in the capture phase, so a slider
       mounted later counts, and the scroll stops following before the
       slider's own listeners move the hinge. */
    function sliderDuo(sl) {
      var id = sl.getAttribute('data-for');
      if (id) return doc.getElementById(id);
      for (var n = sl.parentElement; n; n = n.parentElement) { var d = n.querySelector('.device[data-device="duo"]'); if (d) return d; }
      return null;
    }
    function takeHinge(e) {
      var sl = e.target && e.target.closest && e.target.closest('.device-fold-slider');
      if (!sl || api.owned || sliderDuo(sl) !== duo) return;
      if (e.type === 'keydown' && !/^(Arrow|Home$|End$|Page)/.test(e.key)) return;
      if (e.type === 'pointerdown' && e.button !== 0) return;
      api.owned = true;
    }
    doc.addEventListener('pointerdown', takeHinge, true);
    doc.addEventListener('keydown', takeHinge, true);

    if (enhanced() && !reduced() && global.ANIM) {
      D.set(duo, 0);
      aria();
      media.setAttribute('data-scrub', JSON.stringify({ start: 'a0t', end: 'a0t + 60vh', anchors: ['#' + idOf(root, 'hero')] }));
      ANIM.onScrub(media, function (p) {
        scrollP = p;
        if (!api.owned && introDone) D.set(duo, BASE + (1 - BASE) * p);
      });
      animMount(media);
      whenSeen(media, function () {
        setTimeout(function () {
          if (api.owned) { introDone = true; return; }
          D.fold(duo, BASE + (1 - BASE) * scrollP, { spring: { duration: 0.9, bounce: 0 } }).then(function () {
            if (api.owned) return;
            var t = BASE + (1 - BASE) * scrollP;
            if (Math.abs(D.value(duo) - t) > 0.01) D.fold(duo, t).then(function () { introDone = true; });
            else introDone = true;
          });
        }, 350);
      });
    }

    /* drag: horizontal travel over ~90% of the device width is a full fold;
       release projects the velocity and lands on the nearest detent. */
    var drag = null;
    media.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('a,button,input,select')) return;
      drag = { x: e.clientX, v0: D.value(duo), w: duo.getBoundingClientRect().width * 0.9 || 600, id: e.pointerId, moved: false, lx: e.clientX, lt: now(), vel: 0 };
    });
    media.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) { drag.moved = true; try { media.setPointerCapture(e.pointerId); } catch (err) {} media.setAttribute('data-dragging', ''); api.owned = true; }
      var t = now(), dt = Math.max(1, t - drag.lt);
      drag.vel = 0.7 * drag.vel + 0.3 * ((e.clientX - drag.lx) / drag.w) / (dt / 1000);
      drag.lx = e.clientX; drag.lt = t;
      D.set(duo, clamp(drag.v0 + dx / drag.w, 0, 1));
    });
    function end(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var d = drag; drag = null;
      media.removeAttribute('data-dragging');
      if (!d.moved) return;
      var target = clamp(D.value(duo) + d.vel * 0.18, 0, 1), best = DET[0];
      DET.forEach(function (x) { if (Math.abs(x - target) < Math.abs(best - target)) best = x; });
      D.fold(duo, best);
    }
    media.addEventListener('pointerup', end);
    media.addEventListener('pointercancel', end);
    media.addEventListener('keydown', function (e) {
      var v = D.value(duo), i, to = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { for (i = 0; i < DET.length; i++) if (DET[i] > v + 0.01) { to = DET[i]; break; } }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { for (i = DET.length - 1; i >= 0; i--) if (DET[i] < v - 0.01) { to = DET[i]; break; } }
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = 1;
      else return;
      e.preventDefault();
      if (to == null) return;
      api.owned = true;
      D.fold(duo, to);
    });
    return api;
  }

  /* ═══ HIGHLIGHTS GALLERY ═══════════════════════════════════════════════════
     One float, --autoplay-progress, is the card index under the viewport's
     centre; CSS derives the caption parallax, the dots' widths and the
     current pill. Autoplay: 6.15s per card, only in view, never under
     reduced motion (the reader can still press play), paused for good once
     the reader takes the rail; the last card ends in a replay. */
  function Gallery(root) {
    var rail = $('.gallery-rail', root), items = $$('.gallery-item', root), n = items.length;
    if (!rail || !n) return null;
    var band = root.closest('.band') || root.parentElement;
    var api = { index: 0, playing: false, go: go, play: play, pause: pause };
    var userPaused = false, ended = false, inView = false;
    root.setAttribute('aria-roledescription', 'carousel');
    items.forEach(function (it, i) {
      it.style.setProperty('--i', i);
      it.setAttribute('aria-roledescription', 'slide');
      if (!it.hasAttribute('aria-label')) it.setAttribute('aria-label', (i + 1) + ' of ' + n);
    });
    function labelOf(it, i) {
      var l = it.getAttribute('data-label'), c = $('.gallery-caption', it);
      return l || (c ? c.textContent.replace(/\s+/g, ' ').trim() : 'Item ' + (i + 1));
    }
    /* the chrome module's .control-bar is THE floating media bar (drop → bubbles intro,
       dots, the 6.15s pill, play/pause). When the author put one in the
       gallery and CHROME is loaded, the gallery drives it instead of
       building its own — one bar in the system, not two. */
    var cb = $('.control-bar', root);
    if (cb && global.CHROME && CHROME.controlBar) return withControlBar(root, rail, items, cb, api, labelOf);

    /* the bar: authored or built */
    var track = $('.gallery-bar-track', root), bar = track && $('.gallery-bar', track);
    if (!track) { track = doc.createElement('div'); track.className = 'gallery-bar-track'; root.appendChild(track); }
    if (!bar) { bar = doc.createElement('div'); bar.className = 'gallery-bar'; track.appendChild(bar); }
    var dotsWrap = $('.gallery-dots', bar);
    if (!dotsWrap) { dotsWrap = doc.createElement('div'); dotsWrap.className = 'gallery-dots gallery-bubble'; bar.appendChild(dotsWrap); }
    dotsWrap.setAttribute('role', 'group');
    if (!dotsWrap.hasAttribute('aria-label')) dotsWrap.setAttribute('aria-label', 'Choose a highlight');
    dotsWrap.textContent = '';
    var dots = items.map(function (it, i) {
      var b = mkButton('gallery-dot', labelOf(it, i));
      b.style.setProperty('--di', i);
      b.tabIndex = i ? -1 : 0;
      b.setAttribute('aria-controls', idOf(it, 'slide'));
      b.addEventListener('click', function () { go(i); });
      dotsWrap.appendChild(b);
      return b;
    });
    dots[0].setAttribute('aria-current', 'true');
    var playBtn = $('.gallery-play', bar);
    if (!playBtn) { playBtn = mkButton('gallery-play gallery-bubble', 'Play', 'play'); bar.appendChild(playBtn); }
    playBtn.setAttribute('aria-controls', idOf(rail, 'rail'));
    function updatePlay() {
      var name = ended ? 'arrow-clockwise' : api.playing ? 'pause' : 'play';
      playBtn.setAttribute('aria-label', ended ? 'Replay' : api.playing ? 'Pause' : 'Play');
      setGlyph(playBtn, name);
    }
    playBtn.addEventListener('click', function () { if (api.playing) pause(true); else play(); });

    /* position → one variable; the current index flips at the half-way */
    var ticking = 0, moving = movingFlag(root);
    function position() { return (rail.scrollLeft - snapLeft(rail, items[0])) / stepOf(items); }
    function sync() {
      ticking = 0;
      var p = position();
      root.style.setProperty('--autoplay-progress', p.toFixed(4));
      var i = clamp(Math.round(p), 0, n - 1);
      if (i !== api.index) setCurrent(i);
    }
    rail.addEventListener('scroll', function () { moving(); if (!ticking) ticking = raf(sync); }, { passive: true });
    function setCurrent(i) {
      api.index = i;
      dots.forEach(function (d, k) {
        if (k === i) { d.setAttribute('aria-current', 'true'); d.tabIndex = 0; }
        else { d.removeAttribute('aria-current'); d.tabIndex = -1; }
      });
      if (ended && i !== n - 1) { ended = false; root.removeAttribute('data-ended'); updatePlay(); }
      emit(root, 'gallery', { index: i });
    }
    function go(i) { tweenScroll(rail, snapLeft(rail, items[clamp(i, 0, n - 1)]), 1000); }
    function play() {
      if (ended) {
        ended = false; root.removeAttribute('data-ended');
        if (api.index === 0) { var d = dots[0]; d.setAttribute('data-restart', ''); void d.offsetWidth; d.removeAttribute('data-restart'); }
        go(0);
      }
      api.playing = true; userPaused = false;
      root.setAttribute('data-playing', '');
      updatePlay();
    }
    function pause(byUser) {
      api.playing = false;
      if (byUser) userPaused = true;
      root.removeAttribute('data-playing');
      updatePlay();
    }
    /* the current pill finished filling → next card, or the end */
    dotsWrap.addEventListener('animationend', function (e) {
      if (e.animationName !== 'show-dot-fill' || !api.playing) return;
      if (api.index < n - 1) go(api.index + 1);
      else { ended = true; root.setAttribute('data-ended', ''); pause(false); }
    });
    /* the reader takes the rail: a horizontal swipe or wheel pauses */
    rail.addEventListener('touchstart', function () { if (api.playing) pause(true); }, { passive: true });
    rail.addEventListener('wheel', function (e) { if (api.playing && Math.abs(e.deltaX) > Math.abs(e.deltaY)) pause(true); }, { passive: true });
    /* dots: one tab stop, arrows move (roving tabindex) */
    dotsWrap.addEventListener('keydown', function (e) {
      var k = e.key, i = api.index;
      if (k === 'ArrowRight' || k === 'ArrowDown') i++;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') i--;
      else if (k === 'Home') i = 0;
      else if (k === 'End') i = n - 1;
      else return;
      e.preventDefault();
      i = clamp(i, 0, n - 1);
      if (api.playing) pause(true);
      go(i);
      dots[i].focus({ preventScroll: true });
    });
    /* in view: autoplay (once allowed); out of view: hold */
    if (global.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          inView = e.isIntersecting && e.intersectionRatio >= 0.5;
          if (inView && !api.playing && !userPaused && !ended && !reduced()) play();
          else if (!inView && api.playing) pause(false);
        });
      }, { threshold: [0, 0.5] }).observe(rail);
    }
    /* the bar's entrance: ANIM recipe 14 — in when 60% of the rail has
       entered, out 75vh before the band ends; dots spread on the 'dots'
       spring the first time. Without ANIM, an observer does the same. */
    if (enhanced()) {
      bar.setAttribute('data-armed', '');
      if (global.ANIM && ANIM.mount && band) {
        bar.setAttribute('data-anim-classname', JSON.stringify({ start: 'a0t - 100vh + 60a0h', end: 'a1b - 75vh',
          anchors: ['#' + idOf(rail, 'rail'), '#' + idOf(band, 'band')], cssClass: 'is-in', toggle: true }));
        animMount(bar);
      } else if (global.IntersectionObserver) {
        new IntersectionObserver(function (es) { es.forEach(function (e) { bar.classList.toggle('is-in', e.intersectionRatio >= 0.6); }); },
          { threshold: [0, 0.6] }).observe(rail);
      } else bar.classList.add('is-in');
      var introduced = false;
      var intro = function () {
        if (introduced || !bar.classList.contains('is-in')) return;
        introduced = true;
        if (global.MOTION && MOTION.progress && !reduced()) MOTION.progress(bar, 1, { var: '--progress-intro', spring: 'dots', from: 0 });
      };
      if (global.MutationObserver) new MutationObserver(intro).observe(bar, { attributes: true, attributeFilter: ['class'] });
      intro();
    }
    updatePlay();
    sync();
    api.resize = sync;
    return api;
  }

  /* The gallery on the chrome module's control bar: the bar owns the clock (its dots, fill,
     play state and intro); the gallery owns the rail. Bar → rail on the
     bar's 'user' / 'auto' selections; rail → bar (reason 'api', ignored on
     the way back) when the reader swipes. In view it plays, out of view it
     holds; a press of the bar's pause is the reader's and is kept. */
  function withControlBar(root, rail, items, cb, api, labelOf) {
    var C = CHROME.controlBar, n = items.length, userPaused = false, self = false;
    $$('.control-bar__dot', cb).forEach(function (d, i) {
      if (!items[i]) return;
      if (!d.hasAttribute('aria-label')) d.setAttribute('aria-label', labelOf(items[i], i));
      d.setAttribute('aria-controls', idOf(items[i], 'slide'));
    });
    api.playing = cb.hasAttribute('data-autoplay') && !reduced();
    function go(i) { tweenScroll(rail, snapLeft(rail, items[clamp(i, 0, n - 1)]), 1000); }
    function set(on, byUser) {
      api.playing = on;
      if (byUser) userPaused = !on;
      self = true; C.play(cb, on); self = false;
    }
    api.go = go;
    api.play = function () { set(true, true); };
    api.pause = function (byUser) { set(false, byUser); };
    cb.addEventListener('chrome:controlbar', function (e) {
      var d = e.detail || {};
      if (d.reason === 'play') { if (!self) { api.playing = d.playing; userPaused = !d.playing; } return; }
      if ((d.reason === 'user' || d.reason === 'auto') && d.index !== api.index) go(d.index);
    });
    var ticking = 0, moving = movingFlag(root);
    function sync() {
      ticking = 0;
      var p = (rail.scrollLeft - snapLeft(rail, items[0])) / stepOf(items);
      root.style.setProperty('--autoplay-progress', p.toFixed(4));
      var i = clamp(Math.round(p), 0, n - 1);
      if (i !== api.index) {
        api.index = i;
        self = true; C.select(cb, i); self = false;
        emit(root, 'gallery', { index: i });
      }
    }
    rail.addEventListener('scroll', function () { moving(); if (!ticking) ticking = raf(sync); }, { passive: true });
    rail.addEventListener('touchstart', function () { if (api.playing) set(false, true); }, { passive: true });
    rail.addEventListener('wheel', function (e) { if (api.playing && Math.abs(e.deltaX) > Math.abs(e.deltaY)) set(false, true); }, { passive: true });
    if (global.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var inView = e.isIntersecting && e.intersectionRatio >= 0.5;
          if (inView && !api.playing && !userPaused && !reduced()) set(true, false);
          else if (!inView && api.playing) set(false, false);
        });
      }, { threshold: [0, 0.5] }).observe(rail);
    }
    root.setAttribute('data-bar', 'control-bar');
    sync();
    api.resize = sync;
    return api;
  }

  /* ═══ CARD SCROLLER ════════════════════════════════════════════════════════
     Paddles page by the number of whole cards that fit; the ends disable
     (opacity .42) and focus moves to the live paddle rather than vanish. */
  function Scroller(root) {
    var rail = $('.scroller-rail', root), items = $$('.scroller-item', root), n = items.length;
    if (!rail || !n) return null;
    var pads = $('.scroller-paddles', root);
    if (!pads) { pads = doc.createElement('div'); pads.className = 'scroller-paddles viewport-content'; root.appendChild(pads); }
    var prev = $('.scroller-paddle[data-dir="-1"]', pads), next = $('.scroller-paddle[data-dir="1"]', pads);
    if (!prev) { prev = mkButton('scroller-paddle', 'Previous', 'chevron-left'); prev.setAttribute('data-dir', '-1'); pads.appendChild(prev); }
    if (!next) { next = mkButton('scroller-paddle', 'Next', 'chevron-right'); next.setAttribute('data-dir', '1'); pads.appendChild(next); }
    [prev, next].forEach(function (b) { b.setAttribute('aria-controls', idOf(rail, 'scroller')); });
    if (!pads.hasAttribute('role')) { pads.setAttribute('role', 'group'); pads.setAttribute('aria-label', 'Scroll the cards'); }
    function update() {
      var max = rail.scrollWidth - rail.clientWidth, x = rail.scrollLeft;
      var focused = doc.activeElement;
      prev.disabled = x <= 2;
      next.disabled = x >= max - 2;
      if (focused === prev && prev.disabled) next.focus({ preventScroll: true });
      if (focused === next && next.disabled) prev.focus({ preventScroll: true });
    }
    function page(dir) {
      var rs = global.getComputedStyle(rail), pl = scrollPad(rs, 'Left'), pr = scrollPad(rs, 'Right');
      var step = stepOf(items), gap = step - items[0].offsetWidth;
      var per = Math.max(1, Math.floor((rail.clientWidth - pl - pr + gap) / step));
      var cur = Math.round((rail.scrollLeft - snapLeft(rail, items[0])) / step);
      tweenScroll(rail, snapLeft(rail, items[clamp(cur + dir * per, 0, n - 1)]), 1000, update);
    }
    prev.addEventListener('click', function () { page(-1); });
    next.addEventListener('click', function () { page(1); });
    var ticking = 0;
    rail.addEventListener('scroll', function () { if (!ticking) ticking = raf(function () { ticking = 0; update(); }); }, { passive: true });
    /* the hover grow is 3px a side whatever the card: (w + 6) / w */
    function measure() {
      items.forEach(function (it) {
        var c = $('.scroller-card', it) || it, w = c.offsetWidth;
        if (w) c.style.setProperty('--hover-scale', ((w + 6) / w).toFixed(4));
      });
      update();
    }
    measure();
    return { page: page, update: update, resize: measure };
  }

  /* ═══ FEATURE TABS ═════════════════════════════════════════════════════════
     A tablist (automatic activation, arrows/Home/End). The indicator is two
     springs (x, width) on MOTION's 'select'; labels invert only after it
     lands (CSS delay). Panels cross-fade and go inert; captions follow. */
  function Tabs(root) {
    var list = $('.feature-tabs-list', root), tabs = $$('.feature-tabs-tab', root);
    if (!list || !tabs.length) return null;
    var panels = $$('.feature-tabs-panel', root), caps = $$('.feature-tabs-caption', root), nav = $('.feature-tabs-nav', root) || list.parentNode;
    var ind = $('.feature-tabs-indicator', list);
    if (!ind) { ind = doc.createElement('span'); ind.className = 'feature-tabs-indicator'; ind.setAttribute('aria-hidden', 'true'); list.insertBefore(ind, list.firstChild); }
    list.setAttribute('role', 'tablist');
    tabs.forEach(function (t, i) {
      t.setAttribute('role', 'tab');
      if (t.tagName === 'BUTTON' && !t.type) t.type = 'button';
      var p = panels[i];
      if (p) {
        p.setAttribute('role', 'tabpanel');
        t.setAttribute('aria-controls', idOf(p, 'panel'));
        p.setAttribute('aria-labelledby', idOf(t, 'tab'));
      }
      t.addEventListener('click', function () { select(i); });
    });
    var more = $('.feature-tabs-more', nav);
    if (!more) { more = mkButton('feature-tabs-more', 'More tabs', 'chevron-right'); nav.appendChild(more); }
    /* a pointer affordance (a paddle): keyboard readers move through the
       tabs with the arrow keys, so an authored button must leave the tab order
       too, or Tab lands inside aria-hidden */
    more.tabIndex = -1; more.setAttribute('aria-hidden', 'true');
    more.addEventListener('click', function () {
      var dir = list.scrollLeft < 2 ? 1 : (list.scrollLeft >= list.scrollWidth - list.clientWidth - 2 ? -1 : 1);
      tweenScroll(list, list.scrollLeft + dir * list.clientWidth * 0.6, 500);
    });
    var cur = Math.max(0, tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; }));
    function place(i, animate) {
      var t = tabs[i], x = t.offsetLeft, w = t.offsetWidth;
      if (global.MOTION && MOTION.progress) {
        var o = animate ? { var: '--ind-x', spring: 'select' } : { var: '--ind-x', spring: 'select', from: x };
        MOTION.progress(ind, x, o);
        MOTION.progress(ind, w, { var: '--ind-w', spring: 'select', from: animate ? undefined : w });
      } else { ind.style.setProperty('--ind-x', x); ind.style.setProperty('--ind-w', w); }
    }
    function overflow() {
      var max = list.scrollWidth - list.clientWidth, v = [];
      if (max > 1) { if (list.scrollLeft > 1) v.push('start'); if (list.scrollLeft < max - 1) v.push('end'); }
      if (v.length) { list.setAttribute('data-overflow', v.join(' ')); nav.setAttribute('data-overflow', ''); }
      else { list.removeAttribute('data-overflow'); nav.removeAttribute('data-overflow'); }
      setGlyph(more, v.indexOf('end') >= 0 ? 'chevron-right' : 'chevron-left');
    }
    list.addEventListener('scroll', function () { raf(overflow); }, { passive: true });
    function select(i, focus) {
      i = clamp(i, 0, tabs.length - 1);
      var animate = i !== cur;
      cur = i;
      tabs.forEach(function (t, k) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t.tabIndex = k === i ? 0 : -1; });
      panels.forEach(function (p, k) { if (k === i) p.setAttribute('data-active', ''); else p.removeAttribute('data-active'); inert(p, k !== i); });
      caps.forEach(function (c, k) { if (k === i) c.setAttribute('data-active', ''); else c.removeAttribute('data-active'); if (k === i) c.removeAttribute('aria-hidden'); else c.setAttribute('aria-hidden', 'true'); });
      place(i, animate);
      if (list.scrollWidth > list.clientWidth + 1) {
        var t = tabs[i], target = t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2;
        tweenScroll(list, clamp(target, 0, list.scrollWidth - list.clientWidth), animate ? 400 : 0, overflow);
      }
      if (focus) tabs[i].focus({ preventScroll: true });
      if (animate) emit(root, 'tab', { index: i });
    }
    list.addEventListener('keydown', function (e) {
      var k = e.key, i = cur;
      if (k === 'ArrowRight' || k === 'ArrowDown') i = (cur + 1) % tabs.length;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') i = (cur - 1 + tabs.length) % tabs.length;
      else if (k === 'Home') i = 0;
      else if (k === 'End') i = tabs.length - 1;
      else return;
      e.preventDefault();
      select(i, true);
    });
    select(cur);
    list.setAttribute('data-ready', '');
    overflow();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { place(cur, false); overflow(); });
    return { select: function (i) { select(i); }, resize: function () { place(cur, false); overflow(); } };
  }

  /* ═══ POSE CHIPS → GLASS CARDS ═════════════════════════════════════════════
     One open at a time. Opening morphs the item on MOTION's 'tour' spring
     (.5 / .42 — the tour morph) while the previous one folds back on the
     same spring; the device takes the chip's pose (data-pose →
     DEVICE.fold). Focus moves into the card; Escape or the close disc folds
     it and returns focus to its chip. */
  function Pose(root) {
    var items = $$('.pose-item', root);
    if (!items.length) return null;
    var stage = root.closest('.pose-stage') || root.parentNode;
    var forId = root.getAttribute('data-for'), duo = forId ? doc.getElementById(forId) : $('.device[data-device="duo"]', stage);
    var api = { index: -1, open: open, close: close };
    var chips = [], cards = [];
    items.forEach(function (it, i) {
      var chip = $('.pose-chip', it), card = $('.pose-card', it);
      if (!chip || !card) return;
      if (chip.tagName === 'BUTTON' && !chip.type) chip.type = 'button';
      chips[i] = chip; cards[i] = card;
      chip.setAttribute('aria-expanded', 'false');
      chip.setAttribute('aria-controls', idOf(card, 'pose'));
      card.setAttribute('role', 'region');
      card.setAttribute('aria-labelledby', idOf(chip, 'chip'));
      card.tabIndex = -1;
      inert(card, true);
      chip.addEventListener('click', function () { if (api.index === i) close(true); else open(i, true); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); close(true); } });
    });
    var paddles = $('.pose-paddles', root), up, down;
    if (paddles) {
      up = $('.pose-paddle[data-dir="-1"]', paddles); down = $('.pose-paddle[data-dir="1"]', paddles);
      if (!up) { up = mkButton('pose-paddle', 'Previous', 'chevron-up'); up.setAttribute('data-dir', '-1'); paddles.appendChild(up); }
      if (!down) { down = mkButton('pose-paddle', 'Next', 'chevron-down'); down.setAttribute('data-dir', '1'); paddles.appendChild(down); }
      up.addEventListener('click', function () { open(api.index <= 0 ? 0 : api.index - 1); });
      down.addEventListener('click', function () { open(Math.min(items.length - 1, api.index + 1)); });
    }
    var closeBtn = $('.pose-close', stage);
    if (!closeBtn && stage) { closeBtn = mkButton('pose-close', 'Close', 'xmark'); stage.appendChild(closeBtn); }
    if (closeBtn) closeBtn.addEventListener('click', function () { close(true); });
    function paddleState() {
      if (!up) return;
      up.disabled = api.index <= 0;
      down.disabled = api.index >= items.length - 1;
    }
    function measure() {
      items.forEach(function (it, i) {
        if (!chips[i]) return;
        chips[i].style.width = 'max-content';
        it.style.setProperty('--chip-w', Math.ceil(chips[i].offsetWidth) + 'px');
        chips[i].style.width = '';
        it.style.setProperty('--card-h', Math.ceil(cards[i].offsetHeight) + 'px');
      });
    }
    function morph(it, to) {
      if (global.MOTION && MOTION.progress) MOTION.progress(it, to, { spring: 'tour' });
      else it.style.setProperty('--progress', to);
    }
    function poseOf(it) {
      var p = it.getAttribute('data-pose');
      if (p == null || p === '') return null;
      return isNaN(+p) ? p : +p;
    }
    function open(i, focus) {
      i = clamp(i, 0, items.length - 1);
      if (api.index === i || !chips[i]) return;
      if (api.index >= 0) fold(api.index);
      var it = items[i];
      it.setAttribute('data-open', '');
      chips[i].setAttribute('aria-expanded', 'true');
      inert(cards[i], false);
      morph(it, 1);
      api.index = i;
      if (stage) stage.setAttribute('data-open', '');
      paddleState();
      var pose = poseOf(it);
      if (pose != null && duo && global.DEVICE) DEVICE.fold(duo, pose);
      var list = it.parentNode;
      if (list && list.scrollWidth > list.clientWidth + 1) tweenScroll(list, clamp(it.offsetLeft - 26, 0, list.scrollWidth - list.clientWidth), 400);
      if (focus) cards[i].focus({ preventScroll: true });
      emit(root, 'pose', { index: i, pose: pose });
    }
    function fold(i) {
      var it = items[i];
      it.removeAttribute('data-open');
      chips[i].setAttribute('aria-expanded', 'false');
      inert(cards[i], true);
      morph(it, 0);
    }
    function close(focus) {
      if (api.index < 0) return;
      var i = api.index;
      fold(i);
      api.index = -1;
      if (stage) stage.removeAttribute('data-open');
      paddleState();
      if (focus) chips[i].focus({ preventScroll: true });
      emit(root, 'pose', { index: -1, pose: null });
    }
    /* arrows walk the chips (focus only); Escape folds */
    root.addEventListener('keydown', function (e) {
      var k = e.key, at = chips.indexOf(doc.activeElement);
      if (k === 'Escape' && api.index >= 0) { e.preventDefault(); close(true); return; }
      if (at < 0) return;
      if (k === 'ArrowDown' || k === 'ArrowRight') at = Math.min(chips.length - 1, at + 1);
      else if (k === 'ArrowUp' || k === 'ArrowLeft') at = Math.max(0, at - 1);
      else return;
      e.preventDefault();
      chips[at].focus();
    });
    measure();
    paddleState();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);
    api.resize = measure;
    return api;
  }

  /* ═══ COMPARE ══════════════════════════════════════════════════════════════
     Each [data-compare] cell holds one {lead, value, caption} per option.
     Values ROLL digit by digit (FG3.rollNumber, a spring); lead and caption
     cross-fade 200ms. */
  function Compare(root) {
    var sel = $('select', root), cells = $$('[data-compare]', root);
    if (!sel || !cells.length) return null;
    var data = cells.map(function (c) { try { return JSON.parse(c.getAttribute('data-compare')); } catch (e) { warn('bad data-compare JSON'); return []; } });
    function num(s) { var m = /-?\d[\d,]*\.?\d*/.exec(s || ''); return m ? parseFloat(m[0].replace(/,/g, '')) : 0; }
    function apply(i, animate) {
      cells.forEach(function (c, k) {
        var d = data[k][i];
        if (!d) return;
        var lead = $('.stat-lead', c), cap = $('.stat-caption', c), val = $('.stat-value', c);
        var texts = function () {
          if (lead) { lead.textContent = d.lead || ''; lead.hidden = !d.lead; }
          if (cap) cap.textContent = d.caption || '';
        };
        if (animate && !reduced()) {
          c.setAttribute('data-swapping', '');
          setTimeout(function () { texts(); c.removeAttribute('data-swapping'); }, 200);
        } else texts();
        if (val) {
          if (global.FG3 && FG3.rollNumber) FG3.rollNumber(val, num(d.value), { format: function () { return d.value; }, animate: !!animate });
          else val.textContent = d.value;
        }
      });
    }
    sel.addEventListener('change', function () { apply(sel.selectedIndex, true); emit(root, 'compare', { index: sel.selectedIndex }); });
    apply(sel.selectedIndex, false);
    return { select: function (i) { sel.selectedIndex = i; apply(i, true); } };
  }

  /* ═══ SCENE (text over media) ═════════════════════════════
     Writes the keyframes as ANIM markup and gives the parts back to
     ANIM: --frame 0→1 over a0b − 100vh → a0b − 40vh on the media (it frames
     down as it leaves), the scrim in on entry and out at the end (0→1,
     scaled in CSS by --scene-scrim-max so the keyframes stay linear and
     compile to a scroll timeline), and
     the copy fading t − 30vh → t − 10vh as it scrolls over the pinned media.
     Anything the author already wrote wins. */
  function Scene(root) {
    var id = '#' + idOf(root, 'scene'), sticky = $('.scene-sticky', root), media = $('.scene-media', root), copy = $('.scene-copy', root);
    if (!root.hasAttribute('data-scene')) root.setAttribute('data-scene', '');
    if (sticky && !sticky.hasAttribute('data-scene-sticky')) sticky.setAttribute('data-scene-sticky', '');
    var shared = { easeFunction: 'easeInOutQuad', anchors: [id] };
    function kf(extra) { var o = {}, k; for (k in shared) o[k] = shared[k]; for (k in extra) o[k] = extra[k]; return JSON.stringify(o); }
    if (media && !media.hasAttribute('data-anim-keyframe')) {
      media.setAttribute('data-anim-keyframe', kf({ start: 'a0b - 100vh', end: 'a0b - 40vh', '--frame': [0, 1] }));
      media.setAttribute('data-anim-keyframe-0', kf({ start: 'a0t - 110vh', end: 'a0t - 90vh', '--scene-scrim': [0, 1] }));
      media.setAttribute('data-anim-keyframe-1', kf({ start: 'a0b - 25vh', end: 'a0b - 5vh', '--scene-scrim': [1, 0] }));
    }
    if (copy && !copy.hasAttribute('data-anim-keyframe'))
      copy.setAttribute('data-anim-keyframe', JSON.stringify({ start: 't - 30vh', end: 't - 10vh', opacity: [1, 0], easeFunction: 'easeInOutQuad' }));
    animMount(root);
    /* The base experience keeps the scrim behind the words only: where the
       copy ends below the media's top, and how tall the note is (px). Read
       as offsets, so the page's scroll position does not matter. */
    var note = $('.scene-note', root);
    function measure() {
      if (!media) return;
      var top = media.getBoundingClientRect().top, last = copy && copy.lastElementChild;
      if (last) root.style.setProperty('--scene-copy-end', Math.round(last.getBoundingClientRect().bottom - top) + 'px');
      if (note) root.style.setProperty('--scene-note-h', Math.ceil(note.getBoundingClientRect().height) + 'px');
    }
    measure();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);
    return { resize: measure };
  }

  /* ═══ GLOW RING ════════════════════════════════════════════════════════════
     Builds the ring's two layers (.glow-ring-edge, .glow-ring-bloom), each
     holding one conic cone that CSS turns with a transform — the compositor
     rotates a layer rastered once instead of the page repainting a gradient
     and re-blurring the bloom every frame — and parks the turn while the
     ring is off screen ([data-glow-idle]) — and draws it once, still, in
     idle time before it scrolls in (the warm-up below). */
  var glowIO = null;
  function Glow(root) {
    ['edge', 'bloom'].forEach(function (k) {
      var cls = 'glow-ring-' + k;
      if ([].some.call(root.children, function (c) { return c.classList.contains(cls); })) return;
      var layer = doc.createElement('span'), cone = doc.createElement('span');
      layer.className = cls;
      layer.setAttribute('aria-hidden', 'true');
      cone.className = 'glow-ring-cone';
      layer.appendChild(cone);
      root.insertBefore(layer, root.firstChild);
    });
    if (global.IntersectionObserver) {
      if (!glowIO) glowIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) e.target.removeAttribute('data-glow-idle');
          else e.target.setAttribute('data-glow-idle', '');
        });
      }, { rootMargin: '64px 0px' });
      glowIO.observe(root);
    }
    queueGlowWarm(root);
    return {};
  }

  /* ── warm-up: compile a ring's programs before it scrolls in ──────────────
     With the turn on the compositor, what was left of the ring's cost was
     its FIRST frame: docs.html's phone ring compiled 7–8 shader programs
     inside one tile-raster flush as it came in (79–115 ms at 1440, 97 at
     402, a fresh process; style, layout and script ≈ 0) — the bloom's
     13-stop mask, the conic, and what the ring hugs drawn in its own layer
     over the turning cone. DEVICE warms a device alone (device.js, LG3 §18's
     way); a copy of the layers alone still left 3–4 compiles and a 43–55 ms
     frame. So this draws one still copy of each ring that is not on screen —
     layers, cones and contents, at its own size, corner and tone, on its
     ground — at 1/255 opacity for three frames in idle time, a few per
     batch. Measured (perf.mjs, docs.html 41000→45000 at 1440, 5 runs): max
     frame 36–42 ms and none over 50 (was 79–109, 2–3 over 50); what still
     compiles as the ring comes in is the phone's own, as with the ring's
     layers hidden. The copy is a snapshot (no ids, names, scripts, frames or
     media) in LG3's kind of deck ([data-lg3-warm] on <html>: outside FG3's
     body observer; the glass engine and DEVICE ignore it), inert and
     aria-hidden. */
  var GLOW_WARM_ALPHA = String(1 / 255), GLOW_WARM_BATCH = 3;
  var glowWarmList = [], glowWarmQueued = false, glowWarmRunning = false, glowWarmAgain = false, glowWarmWake = false;
  function idle(fn, timeout) {
    if (global.requestIdleCallback) return global.requestIdleCallback(fn, { timeout: timeout });
    return setTimeout(fn, 32);
  }
  function queueGlowWarm(el) {
    if (el && !el.__glowWarm && glowWarmList.indexOf(el) < 0) glowWarmList.push(el);
    if (glowWarmRunning) { glowWarmAgain = true; return; }
    if (glowWarmQueued || !global.requestAnimationFrame) return;
    glowWarmQueued = true;
    idle(function () {
      glowWarmQueued = false;
      if (doc.visibilityState === 'hidden') {           /* nothing is drawn: wait to be seen */
        if (!glowWarmWake) {
          glowWarmWake = true;
          doc.addEventListener('visibilitychange', function wake() {
            if (doc.visibilityState === 'hidden') return;
            doc.removeEventListener('visibilitychange', wake); glowWarmWake = false; queueGlowWarm();
          });
        }
        return;
      }
      runGlowWarm();
    }, 1000);
  }
  function groundOf(el) {
    for (var a = el.parentElement; a; a = a.parentElement) {
      var bg = getComputedStyle(a).backgroundColor;
      if (bg && bg !== 'transparent' && !/^rgba\(0, 0, 0, 0\)$/.test(bg)) return bg;
    }
    return '';
  }
  function glowCopy(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    var cs = getComputedStyle(el), c = el.cloneNode(true), s = c.style, sh = doc.createElement('div'), ss = sh.style;
    $$('iframe,video,audio,object,embed,script', c).forEach(function (n) { n.remove(); });
    [c].concat($$('*', c)).forEach(function (n) {
      n.removeAttribute('id'); n.removeAttribute('name'); n.removeAttribute('autofocus'); n.removeAttribute('data-chart-held');
    });
    c.removeAttribute('data-glow-idle');
    /* the bloom reaches 3σ + the ring's width past the box: all of it on screen */
    var M = Math.ceil(3 * (parseFloat(cs.getPropertyValue('--glow-blur')) || 22) + (parseFloat(cs.getPropertyValue('--glow-w')) || 3)) + 8;
    /* the page's own rules (its radius, corner, sizes) do not reach the deck:
       the copy carries what they computed */
    s.position = 'absolute'; s.left = s.top = M + 'px'; s.margin = '0'; s.boxSizing = 'border-box';
    s.width = r.width + 'px'; s.height = r.height + 'px'; s.maxWidth = s.maxHeight = 'none';
    s.transform = s.translate = s.scale = s.rotate = 'none'; s.animation = s.transition = 'none';
    s.opacity = '1'; s.visibility = 'visible';
    ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].forEach(function (k) { s['border' + k + 'Radius'] = cs['border' + k + 'Radius']; });
    ['corner-shape', '--glow-w', '--glow-blur', '--glow-cone'].forEach(function (p) {
      var v = cs.getPropertyValue(p).trim();
      if (v) s.setProperty(p, v);
    });
    var tone = el.closest('[data-tone]');
    if (tone) sh.setAttribute('data-tone', tone.getAttribute('data-tone'));
    ss.position = 'absolute'; ss.left = ss.top = '0px'; ss.opacity = GLOW_WARM_ALPHA; ss.background = groundOf(el);
    ss.width = (r.width + 2 * M) + 'px'; ss.height = (r.height + 2 * M) + 'px';
    sh.appendChild(c);
    return sh;
  }
  function runGlowWarm() {
    var vh = global.innerHeight || html.clientHeight, later = [];
    var plan = glowWarmList.splice(0).filter(function (el) {
      if (!el.isConnected || el.__glowWarm) return false;
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) { later.push(el); return false; }          /* no box yet: a later mount */
      if (r.bottom > 0 && r.top < vh) { el.__glowWarm = true; return false; }     /* on screen: drawn already */
      return true;
    });
    glowWarmList = later.concat(glowWarmList);
    if (!plan.length) return;
    glowWarmRunning = true;
    var deck = doc.createElement('div');
    deck.setAttribute('data-lg3-warm', ''); deck.setAttribute('aria-hidden', 'true'); deck.inert = true;
    deck.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483647;margin:0;padding:0;border:0';
    html.appendChild(deck);
    (function step() {
      deck.textContent = '';
      var batch = plan.splice(0, GLOW_WARM_BATCH);
      if (!batch.length || doc.visibilityState === 'hidden') {
        deck.remove(); glowWarmRunning = false;
        var left = batch.concat(plan);                  /* hidden: these drew nothing */
        left.forEach(function (el) { glowWarmList.push(el); });
        if (left.length || glowWarmAgain) { glowWarmAgain = false; queueGlowWarm(); }
        return;
      }
      batch.forEach(function (el) {
        try { var c = glowCopy(el); if (c) { deck.appendChild(c); el.__glowWarm = true; } } catch (e) { /* a copy is best effort */ }
      });
      /* three frames on screen, so the compositor draws the batch at least
         once whatever it skips; then the next batch in idle time */
      raf(function () { raf(function () { raf(function () { idle(step, 250); }); }); });
    })();
  }

  /* ═══ CLIP-EXPAND (phones: inset card → full bleed) ════════════════════════ */
  function ClipExpand(el) {
    if (!el.hasAttribute('data-clip-expand')) {
      el.setAttribute('data-clip-expand', JSON.stringify({ breakpointMask: ['small', 'xsmall'] }));
      animMount(el);
    }
    return {};
  }

  /* ═══ SWATCHES ═════════════════════════════════════════════════════════════
     Native radios do the choosing (and the arrow keys); SHOW names the
     choice, pops the discs in on entry and re-finishes the target device
     inside a 200ms cross-fade (a typed 'morph' view transition, so only the
     device's snapshot fades — the page does not move). */
  function Swatches(root) {
    var inputs = $$('input[type="radio"]', root);
    if (!inputs.length) return null;
    var nameEl = $('.swatches-name', root), forId = root.getAttribute('data-for');
    var target = forId ? doc.getElementById(forId) : null;
    $$('.swatch', root).forEach(function (s, i) { s.style.setProperty('--si', i); });
    function labelOf(input) {
      var sw = input.closest('.swatch'), sr = sw && $('.sr-only', sw);
      return (sr && sr.textContent.trim()) || input.getAttribute('aria-label') || input.value;
    }
    function crossfade(el, update) {
      if (reduced() || !doc.startViewTransition) { update(); return; }
      el.style.viewTransitionName = 'show-finish-' + idOf(el, 'finish');
      el.style.viewTransitionClass = 'show-finish';
      var done = function () { el.style.viewTransitionName = ''; el.style.viewTransitionClass = ''; };
      var vt;
      try { vt = doc.startViewTransition({ update: update, types: ['morph'] }); }
      catch (e) { html.setAttribute('data-nav', 'morph'); vt = doc.startViewTransition(update); }
      if (vt && vt.finished) vt.finished.then(done, done); else done();
    }
    function sync(animate) {
      var on = inputs.filter(function (i) { return i.checked; })[0];
      if (!on) return;
      if (nameEl) nameEl.textContent = labelOf(on);
      var sw = on.closest('.swatch'), finish = (sw && sw.getAttribute('data-finish')) || on.value;
      if (target && target.getAttribute('data-finish') !== finish) {
        var set = function () { target.setAttribute('data-finish', finish); };
        if (animate) crossfade(target, set); else set();
      }
      if (animate) emit(root, 'swatch', { value: on.value, finish: finish });
    }
    inputs.forEach(function (i) { i.addEventListener('change', function () { sync(true); }); });
    sync(false);
    if (enhanced() && !reduced()) {
      root.setAttribute('data-armed', '');
      whenSeen(root, function () { root.classList.add('is-in'); });
    }
    return { select: function (v) { inputs.forEach(function (i) { i.checked = i.value === v; }); sync(true); } };
  }

  /* ═══ CARD OVERLAY → SHEET ═════════════════════════════════════════════════
     The toggle is the whole card. With a .card-overlay-panel it reveals the
     in-card overlay; with data-sheet="#dialog" it opens that <dialog
     class="card-overlay-sheet"> modally: the scrim and blur rise together
     and the sheet climbs from 100vh over .8s easeInOutCubic; closing
     reverses on easeInOutQuad. Both run as CSS transitions keyed on
     data-state, so an interruption simply turns around mid-flight. */
  var SHEET_MS = 800;
  function sheetOf(dialog) {
    if (dialog.__showSheet) return dialog.__showSheet;
    var s = { opener: null, timer: 0 };
    dialog.__showSheet = s;
    if (!$('.card-overlay-close', dialog)) {
      var x = mkButton('card-overlay-close', 'Close', 'xmark');
      dialog.insertBefore(x, dialog.firstChild);
    }
    $('.card-overlay-close', dialog).addEventListener('click', function () { closeSheet(dialog); });
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); closeSheet(dialog); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeSheet(dialog); });
    return s;
  }
  function openSheet(dialog, opener) {
    var s = sheetOf(dialog);
    clearTimeout(s.timer);
    s.opener = opener || s.opener;
    if (!dialog.open) {
      dialog.setAttribute('data-state', 'closed');
      html.setAttribute('data-show-modal', '');
      try { dialog.showModal(); } catch (e) { dialog.setAttribute('open', ''); }
      void dialog.offsetWidth;                              /* commit the start state */
    }
    dialog.setAttribute('data-state', 'open');
    var host = s.opener && s.opener.closest('.card-overlay');
    if (host) host.setAttribute('data-open', '');
    if (s.opener) s.opener.setAttribute('aria-expanded', 'true');
    emit(host || dialog, 'overlay', { open: true });
  }
  function closeSheet(dialog) {
    var s = sheetOf(dialog);
    if (!dialog.open || dialog.getAttribute('data-state') === 'closing') return;
    dialog.setAttribute('data-state', 'closing');
    var host = s.opener && s.opener.closest('.card-overlay');
    if (host) host.removeAttribute('data-open');
    if (s.opener) s.opener.setAttribute('aria-expanded', 'false');
    var ms = reduced() ? 200 : SHEET_MS;
    s.timer = setTimeout(function () {
      if (dialog.getAttribute('data-state') !== 'closing') return;
      dialog.setAttribute('data-state', 'closed');
      try { dialog.close(); } catch (e) { dialog.removeAttribute('open'); }
      if (!doc.querySelector('dialog.card-overlay-sheet[open]')) html.removeAttribute('data-show-modal');
      if (s.opener) s.opener.focus({ preventScroll: true });
    }, ms);
    emit(host || dialog, 'overlay', { open: false });
  }
  function Overlay(root) {
    var toggle = $('.card-overlay-toggle', root);
    if (!toggle) return null;
    if (toggle.tagName === 'BUTTON' && !toggle.type) toggle.type = 'button';
    var panel = $('.card-overlay-panel', root);
    var sheetSel = toggle.getAttribute('data-sheet') || root.getAttribute('data-sheet');
    var sheet = sheetSel ? doc.querySelector(sheetSel) : null;
    if (!$('.card-overlay-icon', root)) {
      var icon = doc.createElement('span');
      icon.className = 'card-overlay-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.appendChild(glyph('plus'));
      root.appendChild(icon);
    }
    var api = { isOpen: false };
    if (sheet && sheet.classList.contains('sheet') && global.CHROME && CHROME.sheet) {
      /* the sheet (detents, glass → opaque, morphs from its button):
         CHROME opens and closes it; the card only turns its "+" with it. */
      toggle.setAttribute('aria-haspopup', 'dialog');
      toggle.setAttribute('aria-controls', idOf(sheet, 'sheet'));
      toggle.setAttribute('aria-expanded', 'false');
      sheet.addEventListener('chrome:sheet', function (e) {
        var on = !!(e.detail && e.detail.open);
        api.isOpen = on;
        if (on) root.setAttribute('data-open', ''); else root.removeAttribute('data-open');
        toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
        emit(root, 'overlay', { open: on });
      });
      api.open = function () { CHROME.sheet.open(sheet, { from: toggle }); };
      api.close = function () { CHROME.sheet.close(sheet); };
      toggle.addEventListener('click', api.open);
    } else if (sheet) {
      toggle.setAttribute('aria-haspopup', 'dialog');
      toggle.setAttribute('aria-controls', idOf(sheet, 'sheet'));
      toggle.setAttribute('aria-expanded', 'false');
      sheetOf(sheet);
      api.open = function () { openSheet(sheet, toggle); api.isOpen = true; };
      api.close = function () { closeSheet(sheet); api.isOpen = false; };
      toggle.addEventListener('click', api.open);
    } else if (panel) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', idOf(panel, 'overlay'));
      inert(panel, true);
      api.open = function () {
        api.isOpen = true; root.setAttribute('data-open', ''); toggle.setAttribute('aria-expanded', 'true'); inert(panel, false);
        emit(root, 'overlay', { open: true });
      };
      api.close = function () {
        api.isOpen = false; root.removeAttribute('data-open'); toggle.setAttribute('aria-expanded', 'false'); inert(panel, true);
        emit(root, 'overlay', { open: false });
      };
      toggle.addEventListener('click', function () { if (api.isOpen) api.close(); else api.open(); });
      root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && api.isOpen) { e.preventDefault(); api.close(); toggle.focus(); } });
    }
    return api;
  }

  /* ═══ FAQ ══════════════════════════════════════════════════════════════════
     The rows are native <details> (they open without JS and from
     find-in-page); SHOW only draws a missing chevron and runs "Expand all":
     a .faq-expand inside the .faq (or one whose aria-controls names it), or
     one it builds in a .faq-bar when the .faq has data-expand-all. The
     button reads "Collapse all" (aria-expanded="true") while every row is
     open; labels come from data-expand-label / data-collapse-label. */
  function Faq(root) {
    var items = $$('details', root).filter(function (d) { return d.closest('.faq') === root; });
    if (!items.length) return null;
    items.forEach(function (d) {
      var s = $('summary', d);
      if (s && !s.querySelector('.sym,[data-sym]')) s.appendChild(glyph('chevron-down'));
    });
    var btn = $('.faq-expand', root) || (root.id ? doc.querySelector('.faq-expand[aria-controls="' + root.id + '"]') : null);
    if (!btn && root.hasAttribute('data-expand-all')) {
      var bar = doc.createElement('div');
      bar.className = 'faq-bar';
      btn = mkButton('faq-expand');
      var lab = doc.createElement('span');
      lab.className = 'faq-expand-label';
      btn.appendChild(lab);
      btn.appendChild(glyph('chevron-down'));
      bar.appendChild(btn);
      root.insertBefore(bar, root.firstChild);
    }
    function allOpen() { return items.every(function (d) { return d.open; }); }
    function setAll(open) { items.forEach(function (d) { d.open = open; }); if (btn) sync(); }
    var api = { expandAll: function () { setAll(true); }, collapseAll: function () { setAll(false); } };
    if (!btn) return api;
    if (btn.tagName === 'BUTTON' && !btn.type) btn.type = 'button';
    btn.setAttribute('aria-controls', idOf(root, 'faq'));
    var words = { open: btn.getAttribute('data-expand-label') || 'Expand all', close: btn.getAttribute('data-collapse-label') || 'Collapse all' };
    /* the label is the .faq-expand-label, the button's only text, or its
       first run of text — a glyph beside it is kept */
    function label(text) {
      var l = $('.faq-expand-label', btn);
      if (l) { l.textContent = text; return; }
      if (!btn.children.length) { btn.textContent = text; return; }
      for (var n = btn.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) { n.nodeValue = text + ' '; return; }
      btn.insertBefore(doc.createTextNode(text + ' '), btn.firstChild);
    }
    function sync() {
      var all = allOpen();
      btn.setAttribute('aria-expanded', all ? 'true' : 'false');
      label(all ? words.close : words.open);
    }
    btn.addEventListener('click', function () { setAll(!allOpen()); });
    items.forEach(function (d) { d.addEventListener('toggle', sync); });
    sync();
    return api;
  }

  /* ═══ MOUNT ════════════════════════════════════════════════════════════════ */
  var KINDS = [
    ['.hero', Hero], ['.gallery', Gallery], ['.scroller', Scroller], ['.feature-tabs', Tabs], ['.pose', Pose],
    ['.compare', Compare], ['.scene', Scene], ['.clip-expand', ClipExpand], ['.swatches', Swatches], ['.card-overlay', Overlay],
    ['.faq', Faq], ['.glow-ring', Glow]
  ];
  var instances = [], wired = false;
  /* A classic scrollbar is 0–24px; anything wider is a zoomed-out mobile
     layout viewport (content overflowing), not a scrollbar — read as 0. */
  function sbw() {
    var w = global.innerWidth - html.clientWidth;
    html.style.setProperty('--show-sbw', (w > 0 && w <= 24 ? w : 0) + 'px');
  }
  function wire() {
    if (wired) return;
    wired = true;
    var t = 0;
    global.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        sbw();
        instances.forEach(function (x) { if (x.api && x.api.resize) try { x.api.resize(); } catch (e) { warn(e); } });
      }, 120);
    });
  }
  function mount(root) {
    root = root || doc;
    sbw();
    wire();
    var count = 0;
    KINDS.forEach(function (k) {
      var list = $$(k[0], root);
      if (root.nodeType === 1 && root.matches(k[0])) list.unshift(root);
      list.forEach(function (el) {
        if (el.__show && el.__show[k[0]]) return;
        (el.__show = el.__show || {})[k[0]] = true;
        try {
          var api = k[1](el);
          if (api) { instances.push({ kind: k[0].slice(1), el: el, api: api }); count++; }
        } catch (e) { warn(e); }
      });
    });
    return { count: count };
  }
  function get(el) {
    for (var i = 0; i < instances.length; i++) if (instances[i].el === el) return instances[i].api;
    return null;
  }

  global.SHOW = { mount: mount, get: get, instances: instances, tweenScroll: tweenScroll, version: VERSION };
})(typeof window !== 'undefined' ? window : this);
