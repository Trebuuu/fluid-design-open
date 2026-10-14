/* docs.js → DOCS — behaviour for the documentation SITE's furniture
   (fg3-docs.css): every page of this site loads it; a product app built
   outside this site does not need it. Load after ui.js. It is not in FG3's
   module list, so pages call DOCS.mount() after FG3.boot().

     DOCS.mount(root)   · a Copy button on every pre.doc-code (writes the text
                          to the clipboard; confirms with UI.toast when present).
                          It stays in the pre's corner while a height-capped
                          (or wide) pre scrolls — no wrapper, so page rules
                          such as .x > .doc-code and .doc-code + .doc-code
                          keep matching
                        · .doc-toc links get aria-current="true" for the
                          section currently in view (IntersectionObserver, with
                          a scroll fallback — IO's first callback is not
                          guaranteed on a hidden page)
*/
(function (global) {
  'use strict';
  var doc = global.document;

  function copyButtons(root) {
    root.querySelectorAll('pre.doc-code:not([data-doc-wired])').forEach(function (pre) {
      pre.setAttribute('data-doc-wired', '');
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-s doc-code__copy';
      b.textContent = 'Copy';
      b.addEventListener('click', function () {
        var text = (pre.querySelector('code') || pre).textContent;
        var done = function (ok) {
          b.textContent = ok ? 'Copied' : 'Copy failed';
          if (global.UI && UI.toast) UI.toast(ok ? 'Copied to the clipboard' : 'The clipboard is not available here', { kind: ok ? 'ok' : 'bad' });
          setTimeout(function () { b.textContent = 'Copy'; }, 1600);
        };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
          else done(false);
        } catch (e) { done(false); }
      });
      pre.appendChild(b);
      /* An absolutely positioned child of a scroll container scrolls with the
         content, so the button left its corner in a height-capped pre. Counter
         the scroll offset — only while the pre is the button's containing
         block (a page that made the pre static pinned it to an outer box). */
      pre.addEventListener('scroll', function () {
        b.style.translate = b.offsetParent === pre ? pre.scrollLeft + 'px ' + pre.scrollTop + 'px' : '';
      }, { passive: true });
    });
  }

  function tocSpy(root) {
    var toc = root.querySelector('.doc-toc');
    if (!toc) return;
    var links = [].slice.call(toc.querySelectorAll('a[href^="#"]'));
    var targets = links.map(function (a) { return doc.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); });
    function mark() {
      var y = 120, best = -1;
      targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top <= y) best = i; });
      if (best < 0) best = 0;
      links.forEach(function (a, i) { if (i === best) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    }
    var pending = false;
    global.addEventListener('scroll', function () {
      if (pending) return; pending = true;
      setTimeout(function () { pending = false; mark(); }, 60);   /* not rAF: it does not run on a hidden page */
    }, { passive: true });
    mark();
  }

  function mount(root) {
    root = root || doc;
    copyButtons(root);
    tocSpy(root);
  }

  global.DOCS = { mount: mount };
})(window);
