# Tools

Everything runs from the repo root with Node 24 and the local Edge (no npm
install, no Playwright, no Python). Each tool's header comment is the full
reference; this is the map.

## Serve

```
node tools/serve.mjs [root] [port]            # default root = repo root, port 8810
node tools/serve.mjs . 8800 --dist <dir>      # emulate a dist built elsewhere
node tools/serve.mjs . 8800 --drop-charset    # emulator routes decode as windows-1252
```

- `/<path>`: the source tree. `charset=utf-8` on every text type, `no-store`,
  `nosniff`, byte ranges (video scrubbing needs 206), and a listing for
  folders without an `index.html`. Always serve; under `file://` a
  stylesheet is cross-origin to its page and `document.styleSheets` throws.
- `/a/` (desktop entry) and `/m/` (mobile entry): the Artifact host. The
  routes, entry files and file sets come from `dist/publish-map.json`, re-read
  after every build. The entry is wrapped in the host's skeleton (charset and
  viewport meta with `viewport-fit=cover`, the host's small reset on an
  off-white ground). `?theme=dark|light` stamps `html[data-theme]` the way the
  viewer's toggle does.
- Supporting files come only from `dist/`, and only if the map lists them. An
  unpublished file is a 404, exactly as on the host. The CSP names no external
  origin, which is stricter than the host's CDN allowlist; Fluid Design Open ships no network.
- Check the emulator itself: delete a file from `dist/` (keep it in the
  source), request it under `/a/`, and expect a 404.
- Binds to 127.0.0.1. Pass `--host 0.0.0.0` to reach it from a phone.

## See a page: shoot

```
node tools/shoot.mjs <url> --width 1440|402 [--scroll steps:6] [--dark] [--reduced-motion]
                     [--eval "<js>"] [--here] [--console] [--full] --out <dir> [--name stem]
                     [--eval-timeout 45] [--ready-timeout 30]
```

- Nothing is evaluated or captured until the page is **ready**: loaded
  (`readyState` complete, so a long page is fully parsed) and, where FG3 is
  on the page, booted (`html[data-fg3="ready"]`). A page that is still not
  ready after `--ready-timeout` seconds is reported on stderr and as
  `"ready": false`, and the run goes on.
- `--eval` runs once the page is ready and prints the JSON result (a
  returned promise is awaited). `--here` then captures where the page is,
  without scrolling, so an overlay, menu or sheet the eval opened is still
  on screen.
- Every evaluation is bounded by `--eval-timeout` seconds. A promise that
  never settles ends the run with an error and exit 1 instead of hanging.
  A snippet that throws is printed and exits 1, but the capture still runs.
- Read the PNGs afterwards. Exit 1 means the page threw, or an evaluation
  or protocol call did not answer in time.

### Measuring gotchas (every CDP tool here)

- **Hidden after ~12 s.** Headless Edge on Windows flips a page to
  `visibilityState=hidden` about 12 s in, and rAF and scroll events stop.
  shoot, run-audit and run-selftest already handle it (focus emulation plus a
  periodic `Page.bringToFront`). A new driver needs the same, or long runs
  read as hangs.
- **`captureScreenshot`'s `clip` is in DOCUMENT coordinates.** A
  `getBoundingClientRect()` box is in viewport coordinates, so on a scrolled
  page a clip lands on the wrong pixels (a white-on-white 1.0:1 reading).
  Capture the viewport and crop in code, as `run-audit.mjs --verify` does,
  or add `scrollX`/`scrollY` to the box.
- **Overflow at 402.** Under mobile emulation a page that overflows grows
  its layout viewport (`innerWidth` read 428 at `--width 402`). An overflow
  check must compare `scrollWidth` against the width you asked for, not
  against `innerWidth`.

## Every accessibility mode: emulate

```
node tools/emulate.mjs <url> [--widths 1440,402] [--only dark,forced-colors]
                       [--tone dark] [--scroll 0,900 | --full] [--eval "<js>"]
                       [--strict] [--json out.json] --out <dir>
```

- Six configurations: `light`, `dark`, `reduced-motion`,
  `reduced-transparency`, `contrast-more`, `forced-colors`. Each one runs in
  its own isolated context, at each width (402 = mobile viewport + touch).
- The colour scheme is always set explicitly (`--tone` picks it for the four
  accessibility modes), so the machine's theme never leaks in.
- Per run it prints:
  - whether the feature really matched in the page (`NOT MATCHED` fails)
  - `data-tone`, the `fd-*` gate, LG3's engine and refracting count
  - exceptions, console and Log errors (CSP refusals land here), and failed
    requests
  - `= light` when the capture is byte-identical to the light one
- Exit 1 on any exception or emulation that did not take. With `--strict`,
  also on console errors and failed or blocked requests.
- Forced colours **can** be emulated over the raw protocol (CDP), not through a browser tool.

## Frame timing: perf

```
node tools/perf.mjs <url> [--width 1440,402] [--gpu on|off|both] [--runs 3] [--dpr 2]
                    [--duration 6] [--scroll gesture|raf] [--trace] [--json out.json]
node tools/perf.mjs <url> --before "<js>" --interact "<js returning a promise>" [--window 1500]
```

- Every configuration and every run gets a **fresh** headless Edge. A reused
  process gives chaotic numbers.
- The scroll is a real wheel gesture on the compositor
  (`Input.synthesizeScrollGesture`). Headless Edge 153 ignores synthetic touch
  scrolls, so phone width scrolls by wheel too.
- If a gesture does not move the page, perf says so and re-runs on rAF.
  `scrolled` shows how far the page really moved.
- Columns:
  - `ceil`: the idle rAF rate of that process. It is 128 Hz on the dev box
    with the GPU and 60 in software, so read `fps` against it.
  - `fps`, `mean`, `p95`, `max`: main-thread frames from rAF timestamps.
  - `slow` = frames over 1.5 × the ceiling interval. `janks` = frames over
    50 ms.
  - `lt n/max`: long tasks.
  - `glass`: LG3 engine and refracting min–max / budget.
  - `dropped frames` (with `--trace`): the compositor's own per-frame verdict
    (PipelineReporter). It is the share of frames that had something to draw
    and were dropped.
- `worst frames` lists the long animation frames, with the scripts to blame
  or the style/layout/render split.
- `--interact` records frames from the snippet's start for `--window` ms, and
  prints `LG3.perf` (morph JS per frame) when present.
- Exit 1 means the page threw or never loaded.
- A 200 ms block in a page task reads as `lt 1/200`, 1 jank, and a long frame
  blamed on `user-callback 200ms`. The idle control reads 127 fps against a
  128 ceiling with 0 janks. Blocking through `Runtime.evaluate` is not a page
  task and is not reported as a long task, so test with `setTimeout`.

## Build and publish: artifact-build

```
node tools/artifact-build.mjs                          # dist/ from tools/pages.json
node tools/artifact-build.mjs --url desktop=<artifact url>   # once the site artifact exists
node tools/artifact-build.mjs --strict                 # unresolved cross-artifact links refuse
node tools/artifact-build.mjs --selftest               # the gates, each seen red
node tools/artifact-build.mjs --manifest <file> --out <dir>  # any page set, anywhere
```

- **`tools/pages.json`** lists:
  - the entries: `desktop` = `index.html` at `/a/` (scope `site`: every page
    plus assets), and optionally a `mobile` entry at `/m/` (scope `single`:
    its entry plus assets, linking into the site by `--url`)
  - the SPEC §8 pages (globs such as `dir/*.html` allowed)
  - the self-test count rule and a vars ignore list

  A listed page that does not exist yet is skipped with a warning. A link to
  it still refuses the build.
- **Output:**
  - `dist/artifact-<id>.html`: the entry as body content, `<title>` first.
    A parse-time script restores the page's `<html>`/`<body>` attributes and
    sets `data-tone` with FG3's precedence (stored > author > host
    `data-theme` > OS). It mirrors a theme flip until FG3 takes over.
  - `dist/pages/…`: the supporting pages.
  - `dist/assets/…`
  - `dist/files/…`: any other referenced file.
  - `dist/publish-map.json`
- **Transforms:**
  - references are re-based from the source location to the published one
  - `index.html` links become `./` (the host reserves it)
  - non-ASCII is escaped per context (HTML `&#x…;`, CSS `\XXXXXX`, JS
    `\uXXXX`), so a host that drops the charset changes nothing
  - every `replace()` takes a function
- **Gates** (exit 1, previous `dist/` untouched):
  - an unbalanced block comment in any stylesheet or `<style>`
  - a missing file, including fonts named relative to a stylesheet
  - a link to a page this artifact does not publish. A `data-*` value that
    reads like a path counts as a link, except display text: DEVICE's
    `data-url` (the address a browser frame shows) is never checked
  - an external subresource or a root-absolute URL
  - `var(--x)` with no fallback that nothing declares (also runs
    `tools/check-vars.mjs`)
  - a script that does not parse
  - a quoted assertion count that disagrees with `selftest.html` (skipped
    while it does not exist)
  - non-ASCII left in the output
  - an entry that leaks `<html>/<head>/<body>` or does not open with `<title>`
  - a published file that did not land in the written tree (read back
    before the swap)
- It never replaces an `--out` directory it did not write.
- **Publish** one artifact: `file_path = dist/<artifacts.<id>.file_path>`,
  `root = dist`, `files = artifacts.<id>.files`. Pass the **whole** map every
  time, because a republish *replaces* the supporting-file set. Rebuild with
  `--url desktop=<url>` after the first publish, so `mobile` links resolve.
- The host strips the query string (only a bare `#anchor` reaches the page),
  so `?tone=`, `?fd-enhanced` and similar work locally but not published.

## Self-test and audit, headless

```
node tools/run-selftest.mjs [--width 1440|402] [--dark] [--reduced-motion] [--mutants [--only id,id]] [--json f]
node tools/run-audit.mjs [--width 1440|402] [--tones light,dark] [--pages a.html,b.html] [--verify] [--rings] [--dump dir] [--json f]
```

- run-selftest drives `selftest.html`, prints every row and exits 1 on a
  failure, or when the number of `T(` lines differs from the number of rows
  that ran. `--mutants` serves one broken asset per run and requires the
  rows it names to go red.
- run-audit drives `audit.html` (`assets/audit.js`) over `tools/pages.json`.
  It exits 1 on a contrast failure, a keyboard problem or a page that could
  not load.
- The walk scrolls only inside the measured frame (never `scrollIntoView`,
  which also scrolls the page that holds the frame), and the frame takes no
  pointer input, so audit.html stays scrollable while it runs.
- Specimens are measured but never gated: `[data-specimen]`,
  `[data-audit-exempt]`, and the specimen half of a `.doc-dont` (no marking
  needed). A don't's verdict and caption are still gated. Specimens below
  threshold are listed apart per page as `specimen … (exempt, not gated)`.
- A `cursor:pointer` root counts as reachable when a focusable
  `role=slider`/`role=button`, `<button>` or range input inside it takes the
  keys (a detent rail and its thumb).
- Each scroll stop is measured at rest: running MOTION springs
  (`[data-m-moving]`) and CSS transitions about to end are waited for, up to
  a second. A tab bar that minimises as the walk scrolls fades its labels,
  and a label read mid-fade failed at 1.9-2.8:1 where the screen read 4.3.
- A rolled number (`FG3.rollNumber`) draws its digits from `data-g`, so its
  only text is the `.sr-only` twin. That twin is measured on the drawing
  (`.fg3-roll-vis`: its box, colour and size), not skipped as hidden.
- `--rings` measures every focus ring on the screen, per tone (WCAG
  2.4.13's method). Each control the keyboard walk reached is captured, its
  box + 8 px, unfocused twice, then focused with `focusVisible`. A pixel
  counts as ring when the focus changed it by more than it moves between
  the two unfocused captures. Every such pixel is read against the same
  pixel unfocused. It is a keyboard problem when nothing changed (`ring
  not drawn`), or when the median changed pixel is under 3:1 and the pixels
  at 3:1 would not make a 2 px perimeter of the control, rounded corners
  included (`ring contrast`). A control that moves when focused, hands
  focus on, is larger than the viewport, or whose ground moves more than
  its ring is skipped, with its reason. It
  is slow (about 0.3 s a control per tone) and runs only headless, since a
  page cannot read its own pixels. With `--dump`, the off/on pair of every
  ring under 3:1 is saved.

## Node tests and generators

```
node tools/artifact-build.mjs --selftest   # 47 checks: the fixture, 14 mutants, 6 transform hooks
node tools/test-geom.mjs assets/geom.js    # continuous corners vs the reference curve
node tools/test-motion.mjs [--quick]       # springs, anim expressions; mutants unless --quick
node tools/test-color.mjs                  # generated palettes, contrast recomputed independently
node tools/check-vars.mjs [--all]          # every bare var() read in assets/*.css is declared
node tools/gen-springs.mjs [--check]       # assets/fg3-springs.css from spring.js
node tools/gen-palettes.mjs [--check]      # assets/fg3-color*.css from palette.js
```
