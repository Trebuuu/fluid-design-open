/* ═══════════════════════════════════════════════════════════════════════════
   symbols.js → SYM — THE SYMBOL SET (Fluid Design Open)
   ───────────────────────────────────────────────────────────────────────────
   47 base glyphs plus 22 more (SPEC §6), the three
   tone glyphs (circle-half, sun, moon) and four the pages asked for (eye,
   eye-slash, stop, wifi): 76 glyphs on one 24 grid, one stroke language —
   round caps and joins, ~18 units of optical volume, circles drawn a little
   smaller than squares. SYM.count() is the authority; quote it, not this.

   A SYMBOL IS TYPE (see SPEC). It is sized in em,
   sits on the cap height, and takes its stroke weight from the TYPE ROLE it is
   in (fg3-symbols.css), so a caption's glyph is drawn heavier than a title's.
   One sprite of <symbol>s, `<svg class="sym"><use href="#sym-name">` at each
   site; four rendering modes are the same markup with a different class,
   because inherited custom properties cross the <use> shadow boundary.

   PATH PREFIXES  (none) ink · `1:`–`4:` a layer stroked with --sym-N ·
                  `F:` filled with currentColor
   The glyphs are drawn here, not borrowed from a platform font, so they ship freely.

   PUBLIC API (window.SYM) — nothing mounts itself; FG3.boot() calls mount().
     mount(root=document)     expand <i data-sym="name" data-sym-class data-sym-label>
                              into <svg class="sym …"><use href="#sym-name">; injects the
                              sprite once (#fg3-symbol-sprite). Unknown names get
                              [data-sym-missing] and a console warning.
     sprite(doc)              inject the sprite only
     build(name, cls, label)  → <svg>; aria-hidden unless `label` (then role=img + <title>)
     replace(host, name, {delay=110})   the .replace content transition
     names() · has(n) · count() · resolve(n)   (`shape` is an alias of `sliders`)
     DIRECTIONAL              names that mirror under [dir=rtl] (flip is on the <use>)
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CIRCLE = 'M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0';
  var SYMBOLS = {
    /* ── navigation ─────────────────────────────────────────────────── */
    'chevron-right':  'M9.5 5.5 16 12l-6.5 6.5',
    'chevron-left':   'M14.5 5.5 8 12l6.5 6.5',
    'chevron-down':   'M5.5 9.5 12 16l6.5-6.5',
    'chevron-up':     'M5.5 14.5 12 8l6.5 6.5',
    'arrow-right':    'M4 12h15M13 6l6 6-6 6',
    'arrow-left':     'M20 12H5M11 6l-6 6 6 6',
    'arrow-up':       'M12 20V5M6 11l6-6 6 6',
    'arrow-down':     'M12 4v15M6 13l6 6 6-6',
    'arrow-up-right': 'M7 17 17 7M8.5 7H17v8.5',
    'arrow-clockwise':'M20 12a8 8 0 1 1-2.6-5.9M20 4.5V10h-5.5',
    'arrow-down-tray':'M12 3.5v11M7.2 10l4.8 4.8 4.8-4.8|2:M4.5 20.5h15',
    /* An open arc, not a ring: the gap is what makes a rotation legible. */
    'spinner':        'M12 3.5a8.5 8.5 0 1 0 8.5 8.5',

    /* ── actions ─────────────────────────────────────────────────────────── */
    'plus':           'M12 5v14M5 12h14',
    'minus':          'M5 12h14',
    'xmark':          'M6 6l12 12M18 6 6 18',
    'checkmark':      'M5 12.5 9.5 17 19 7.5',
    /* Real circles, not 0.01-unit lines relying on a round cap: a degenerate
       dot vanishes the moment the cap changes (the lab checks every subpath). */
    'ellipsis':       'F:M3.65 12a1.35 1.35 0 1 0 2.7 0a1.35 1.35 0 1 0 -2.7 0' +
                      'M10.65 12a1.35 1.35 0 1 0 2.7 0a1.35 1.35 0 1 0 -2.7 0' +
                      'M17.65 12a1.35 1.35 0 1 0 2.7 0a1.35 1.35 0 1 0 -2.7 0',
    'magnifier':      'M16.2 16.2 20 20|2:M17.5 10.75a6.75 6.75 0 1 1-13.5 0 6.75 6.75 0 0 1 13.5 0',
    'pencil':         'M4 20h4L19.2 8.8a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6 4 20z',
    'trash':          'M4.5 6.5h15M9.5 6.5V4.5h5v2|2:M6.5 6.5l.9 12.1a1.4 1.4 0 0 0 1.4 1.4h6.4a1.4 1.4 0 0 0 1.4-1.4l.9-12.1',
    'link':           'M10.5 13.5a4 4 0 0 0 6 .5l2.2-2.2a4 4 0 0 0-5.7-5.7L11.8 7.3M13.5 10.5a4 4 0 0 0-6-.5l-2.2 2.2a4 4 0 0 0 5.7 5.7l1.2-1.2',

    /* ── state ───────────────────────────────────────────────────────────── */
    'info':           'M12 11.5V16.5|F:M10.85 7.95a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0|2:' + CIRCLE,
    'exclamation':    'M12 7.5V13|F:M10.85 16.4a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0|2:' + CIRCLE,
    'exclamation-triangle':'M12 9.5V14|F:M10.85 17.2a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0|2:M10.3 4.4 3 17.3a2 2 0 0 0 1.7 3h14.6a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0',
    'checkmark-circle':'M8 12.2 10.9 15 16 9.4|2:' + CIRCLE,
    'xmark-circle':   'M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6|2:' + CIRCLE,
    'clock':          'M12 7.6V12l3 2|2:' + CIRCLE,

    /* ── objects ─────────────────────────────────────────────────────────── */
    'doc':            'M14 4v5.4a.6.6 0 0 0 .6.6H20|2:M4.5 18V6a2 2 0 0 1 2-2H14l6 6v6a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2z',
    'folder':         'M3.5 8.2V6.4a1.6 1.6 0 0 1 1.6-1.6h3.6l2 2.4h7.2a1.6 1.6 0 0 1 1.6 1.6V18a1.6 1.6 0 0 1-1.6 1.6H5.1A1.6 1.6 0 0 1 3.5 18z',
    'house':          'M9.5 20.5V14h5v6.5|2:M3.5 10.6 12 4l8.5 6.6V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z',
    'person':         'M12 4.5a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2|2:M4.6 20.4c0-3.7 3.3-5.7 7.4-5.7s7.4 2 7.4 5.7',
    'bookmark':       'M6 4.5h12v15.2l-6-4.2-6 4.2z',
    'star':           'M12 4.2l2.45 5.1 5.55.75-4 3.95.95 5.6L12 16.9l-4.95 2.7.95-5.6-4-3.95 5.55-.75z',
    'bell':           'M9.6 19.4a2.5 2.5 0 0 0 4.8 0|2:M18.3 16.4a1 1 0 0 1-.8 1.6h-11a1 1 0 0 1-.8-1.6c.8-1 1.6-2 1.6-4.4a5.7 5.7 0 0 1 11.4 0c0 2.4.8 3.4 1.6 4.4',
    'gear':           'M12 9.1a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8|2:M12 3.5l1 2.2 2.4-.5 1 2.2 2.3.9-.6 2.4L20 12l-1.9 1.8.6 2.4-2.3.9-1 2.2-2.4-.5-1 2.2-1-2.2-2.4.5-1-2.2-2.3-.9.6-2.4L4 12l1.9-1.8-.6-2.4 2.3-.9 1-2.2 2.4.5z',

    /* ── layout and text ─────────────────────────────────────────────────── */
    'sidebar':        'M9.5 4.5v15|2:M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z',
    'grid':           'M4.5 6.5a2 2 0 0 1 2-2h2.5a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2zM12.9 6.5a2 2 0 0 1 2-2h2.6a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2h-2.6a2 2 0 0 1-2-2zM4.5 15a2 2 0 0 1 2-2h2.5a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2zM12.9 15a2 2 0 0 1 2-2h2.6a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2h-2.6a2 2 0 0 1-2-2z',
    'lines':          'M4.5 7h15M4.5 12h10M4.5 17h12.5',
    'bold':           'M7.5 5h5.6a3.5 3.5 0 0 1 0 7H7.5zM7.5 12h6.6a3.5 3.5 0 0 1 0 7H7.5z',
    'italic':         'M14.5 5h-4M13.5 19h-4M14.7 5 9.3 19',

    /* ── media ───────────────────────────────────────────────────────────── */
    'play':           'F:M8.5 5.4v13.2L19 12z',
    'pause':          'M9.5 5.5v13M14.5 5.5v13',
    'backward':       'M11.5 6 4.5 12l7 6zM20 6l-7 6 7 6',
    'forward':        'M12.5 6l7 6-7 6zM4 6l7 6-7 6',

    /* ── variable value: the shortest bar is PLAIN, so "no signal" still
       reads as a signal symbol and not as a broken image. ───────────────── */
    'signal':         'M4.5 19.5v-2.6|3:M9.5 19.5v-6|2:M14.5 19.5v-9.5|1:M19.5 19.5V4.5',
    'speaker':        'M4.5 9.5h3.2L12.5 5.6v12.8L7.7 14.5H4.5z|2:M15.8 9.6a3.4 3.4 0 0 1 0 4.8|1:M18.3 7.1a6.9 6.9 0 0 1 0 9.8',
    'battery':        'M21 10.5v3|2:M3.5 8.5a1.6 1.6 0 0 1 1.6-1.6h12.3a1.6 1.6 0 0 1 1.6 1.6v7a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z|1:M6 9.9h6.5v4.2H6z',

    /* ═══ additions (SPEC §6) ═══════════════════════════════════════════
       Devices first: a slab with its camera pill, and the book-style foldable
       open — two panels on a hinge. The body is the secondary layer, so in
       hierarchical mode the camera pill and the hinge carry the meaning. */
    'phone':          'M10.8 5.9h2.4|2:M9.3 3h5.4a2.8 2.8 0 0 1 2.8 2.8v12.4a2.8 2.8 0 0 1-2.8 2.8H9.3a2.8 2.8 0 0 1-2.8-2.8V5.8A2.8 2.8 0 0 1 9.3 3z',
    'phone-fold':     'M12 5v14M15.6 7.4h1.8|2:M5.6 5h12.8A2.6 2.6 0 0 1 21 7.6v8.8a2.6 2.6 0 0 1-2.6 2.6H5.6A2.6 2.6 0 0 1 3 16.4V7.6A2.6 2.6 0 0 1 5.6 5z',
    'bolt':           'M13 2.8 5.5 13.2h6l-1 8 7.5-10.4h-6z',
    'flame':          'M12 21a6.5 6.5 0 0 1-6.5-6.5c0-3 1.9-4.9 3.5-7 .6 1.3 1.3 2 2.2 2.5-.3-2.8.7-5.2 2.8-7.2.6 3 2.3 4.8 3.5 6.6.7 1.1 1 2.9 1 5.1A6.5 6.5 0 0 1 12 21z|2:M12 21a2.8 2.8 0 0 1-2.8-2.8c0-1.9 1.6-3 2.8-4.9 1.2 1.9 2.8 3 2.8 4.9A2.8 2.8 0 0 1 12 21z',
    'heart':          'M12 20.3s-8.3-4.9-8.3-10.6A4.6 4.6 0 0 1 12 7.1a4.6 4.6 0 0 1 8.3 2.6c0 5.7-8.3 10.6-8.3 10.6z',
    /* The badge is the ink: in hierarchical mode "add" and "remove" are what
       you read, the person is context. */
    'person-add':     'M18.5 8v6M15.5 11h6|2:M9.5 4.7a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8M3 20.4c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6',
    'person-remove':  'M15.5 11h6|2:M9.5 4.7a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8M3 20.4c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6',
    'bubble':         'M12 4c4.7 0 8.5 3.1 8.5 7s-3.8 7-8.5 7c-1 0-2-.1-2.9-.4L5 19.5l1.2-3.6C4.5 14.6 3.5 12.9 3.5 11c0-3.9 3.8-7 8.5-7z',
    'paperplane':     'M20.5 3.5 3.5 10.6l6.8 3.1 3.1 6.8z|2:M10.3 13.7 20.5 3.5',
    'target':         'F:M10.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0|2:M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0|3:' + CIRCLE,
    'map':            'M3.5 6.5 9 4l6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z|2:M9 4v13.5M15 6.5V20',
    /* "Shapes" are behaviour settings; the glyph is sliders. */
    'sliders':        'M17.2 6a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0M11.2 12a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0M15.2 18a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0|2:M4 6h8.8M17.2 6H20M4 12h2.8M11.2 12H20M4 18h6.8M15.2 18H20',
    'shield':         'M12 3.2 4.8 6v5.6c0 4.4 3 7.9 7.2 9.2 4.2-1.3 7.2-4.8 7.2-9.2V6z',
    'waveform':       'M12 4v16|2:M8 7.5v9M16 8.5v7|3:M4 10.5v3M20 10.5v3',
    'record':         'F:M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0|2:' + CIRCLE,
    'camera':         'M15.3 12.8a3.3 3.3 0 1 1-6.6 0 3.3 3.3 0 0 1 6.6 0|2:M4 8.5A2 2 0 0 1 6 6.5h2.2l1.3-2h5l1.3 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
    'list-bullet':    'F:M3.75 6.5a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0 -2.5 0M3.75 12a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0 -2.5 0M3.75 17.5a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0 -2.5 0|M9.5 6.5h10M9.5 12h10M9.5 17.5h10',
    'calendar':       'M4 9.5h16M8.5 3.5v3M15.5 3.5v3|2:M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
    'chart-bar':      'M10 5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v15h-4z|2:M16 10a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v10h-4z|3:M4 14a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6H4z',
    'sparkles':       'M10 5.5c.6 3.6 1.9 5.9 6 7.5-4.1 1.6-5.4 3.9-6 7.5-.6-3.6-1.9-5.9-6-7.5 4.1-1.6 5.4-3.9 6-7.5z|2:M18 3c.25 1.4.8 2.2 2.5 2.9-1.7.7-2.25 1.5-2.5 2.9-.25-1.4-.8-2.2-2.5-2.9 1.7-.7 2.25-1.5 2.5-2.9z',
    'play-pause':     'F:M3.5 6.2v11.6L11.5 12z|M15.5 6.5v11M19.5 6.5v11',
    'circle-half':    CIRCLE + '|F:M12 3.5a8.5 8.5 0 0 1 0 17z',
    'sun':            'M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0|2:M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
    'moon':           'M19.5 14.2A7.8 7.8 0 0 1 9.8 4.5a7.8 7.8 0 1 0 9.7 9.7z',
    'lock':           'M6 11.5a1.8 1.8 0 0 1 1.8-1.8h8.4a1.8 1.8 0 0 1 1.8 1.8v7.2a1.8 1.8 0 0 1-1.8 1.8H7.8A1.8 1.8 0 0 1 6 18.7z|2:M8.5 9.7V7.5a3.5 3.5 0 0 1 7 0v2.2',

    /* ── asked for by the pages (stage 3): a credential reveal, Stop, the
       phone's link. The pupil and the slash are the ink; the lid is context. */
    'eye':            'M15.2 12a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0|2:M2.8 12C4.9 8 8.2 5.8 12 5.8S19.1 8 21.2 12C19.1 16 15.8 18.2 12 18.2S4.9 16 2.8 12z',
    'eye-slash':      'M4.5 4.5l15 15|2:M15.2 12a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0M2.8 12C4.9 8 8.2 5.8 12 5.8S19.1 8 21.2 12C19.1 16 15.8 18.2 12 18.2S4.9 16 2.8 12z',
    /* Filled, like play: a stop is a state you press, and the square is
       drawn a little smaller than the triangle so the two weigh the same. */
    'stop':           'F:M8.2 6h7.6A2.2 2.2 0 0 1 18 8.2v7.6a2.2 2.2 0 0 1-2.2 2.2H8.2A2.2 2.2 0 0 1 6 15.8V8.2A2.2 2.2 0 0 1 8.2 6z',
    /* A variable-value glyph like signal: the dot is plain (still wifi at
       zero), the arcs light inner to outer as layers 3, 2, 1. */
    'wifi':           'F:M10.6 19a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0|3:M8.82 15.82A4.5 4.5 0 0 1 15.18 15.82|2:M5.99 12.99A8.5 8.5 0 0 1 18.01 12.99|1:M3.16 10.16A12.5 12.5 0 0 1 20.84 10.16'
  };
  var ALIASES = { shape: 'sliders' };

  /* Glyphs with a handedness: SF mirrors these in RTL for the same reason.
     NOT here: vertical arrows, clocks and the clockwise arrow (a clock runs
     clockwise in every locale), letterforms, devices, and symmetric shapes. */
  var DIRECTIONAL = {
    'chevron-right': 1, 'chevron-left': 1, 'arrow-right': 1, 'arrow-left': 1, 'arrow-up-right': 1,
    'play': 1, 'backward': 1, 'forward': 1, 'signal': 1,
    'paperplane': 1, 'person-add': 1, 'person-remove': 1, 'bubble': 1, 'list-bullet': 1, 'play-pause': 1
  };

  function resolve(name) { return ALIASES[name] || name; }

  /* A layer's stroke goes in a style attribute rather than a presentation
     attribute: var() is CSS, and presentation attributes are not guaranteed
     to resolve it in every engine. */
  function buildSymbol(name, spec) {
    var out = '<symbol id="sym-' + name + '" viewBox="0 0 24 24">';
    spec.split('|').forEach(function (p) {
      var m = /^([1234F]):/.exec(p), d = m ? p.slice(2) : p;
      if (!m) out += '<path d="' + d + '"/>';
      else if (m[1] === 'F') out += '<path d="' + d + '" style="fill:currentColor;stroke:none"/>';
      else out += '<path d="' + d + '" data-layer="' + m[1] + '" style="stroke:var(--sym-' + m[1] + ',currentColor)"/>';
    });
    return out + '</symbol>';
  }

  function sprite(doc) {
    doc = doc || document;
    if (doc.getElementById('fg3-symbol-sprite')) return;
    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'fg3-symbol-sprite';
    svg.setAttribute('aria-hidden', 'true');
    /* Zero-size and out of flow rather than display:none — the form that every
       engine still renders <use> references from. */
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
    svg.innerHTML = Object.keys(SYMBOLS).map(function (k) { return buildSymbol(k, SYMBOLS[k]); }).join('');
    var host = doc.body || doc.documentElement;
    host.insertBefore(svg, host.firstChild);
  }

  function setDir(svg, name) {
    if (DIRECTIONAL[name]) svg.setAttribute('data-sym-dir', ''); else svg.removeAttribute('data-sym-dir');
  }

  /* A symbol is decoration beside a label (aria-hidden) or it IS the label
     (role=img + <title>). The accessible name of a BUTTON belongs on the
     button; the glyph inside it stays hidden. */
  function build(name, cls, label) {
    name = resolve(name);
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'sym' + (cls ? ' ' + cls : ''));
    svg.setAttribute('data-sym-name', name);
    setDir(svg, name);
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#sym-' + name);
    svg.appendChild(use);
    if (label) {
      svg.setAttribute('role', 'img');
      var t = document.createElementNS(ns, 'title');
      t.textContent = label;
      svg.insertBefore(t, use);
    } else svg.setAttribute('aria-hidden', 'true');
    return svg;
  }

  function mount(root) {
    sprite(document);
    (root || document).querySelectorAll('[data-sym]:not([data-sym-done])').forEach(function (el) {
      var name = resolve(el.getAttribute('data-sym'));
      el.setAttribute('data-sym-done', '');
      if (!SYMBOLS[name]) {
        /* Missing must be visible: an icon that silently does not render
           reads as a spacing bug three screens away. */
        el.setAttribute('data-sym-missing', '');
        if (global.console) console.warn('symbol not in the set: ' + name);
        return;
      }
      var svg = build(name, el.getAttribute('data-sym-class') || '', el.getAttribute('data-sym-label'));
      if (el.tagName === 'I' && !el.className) el.replaceWith(svg); else el.appendChild(svg);
    });
  }

  /* The .replace: the old glyph leaves, the new one arrives in the same
     box. Under reduced motion the swap is immediate and the entry is a
     short fade — the information is WHICH glyph, and that survives. */
  function replace(host, name, opts) {
    opts = opts || {};
    name = resolve(name);
    var use = host.tagName.toLowerCase() === 'svg' ? host.querySelector('use') : host.querySelector('.sym use');
    if (!use) return;
    var svg = use.ownerSVGElement;
    function swap() {
      use.setAttribute('href', '#sym-' + name);
      svg.setAttribute('data-sym-name', name);
      setDir(svg, name);
      svg.classList.remove('sym-replace-out');
      svg.classList.add('sym-replace-in');
      setTimeout(function () { svg.classList.remove('sym-replace-in'); }, 360);
    }
    svg.classList.remove('sym-replace-in');
    if (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { swap(); return; }
    svg.classList.add('sym-replace-out');
    setTimeout(swap, opts.delay != null ? opts.delay : 110);
  }

  global.SYM = {
    mount: mount, sprite: sprite, build: build, replace: replace, resolve: resolve,
    names: function () { return Object.keys(SYMBOLS); },
    has: function (n) { return !!SYMBOLS[resolve(n)]; },
    count: function () { return Object.keys(SYMBOLS).length; },
    DIRECTIONAL: DIRECTIONAL
  };
})(window);
