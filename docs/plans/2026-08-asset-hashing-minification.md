# Plan: content-hashed + minified CSS/JS, with Cloudflare `_headers` caching

**Status:** done — all 5 tasks executed and verified on `feat/asset-hashing`, pending post-deploy
checks (§10) and merge. **Models:** planned on Opus, design-reviewed against the live repo ·
executed on Sonnet 5 · no escalation was needed.

## Context

Three tech-debt ideas were raised for `utangindonesia.org`'s static-site build:

1. `public/style.css`, `public/app.js`, `public/counter.js` never change filename when their content
   changes, so a browser (or CDN) holding a cached copy from a previous deploy can keep serving stale
   CSS/JS indefinitely.
2. Those same three files ship to production exactly as hand-written — full comments, indentation,
   never minified.
3. A recalled "Cloudflare doesn't play well with inlined CSS/JS" issue — **investigated and
   dismissed**: nothing in this codebase is currently inlined (no `<style>` blocks, no inline
   `<script>` logic — only JSON-LD, which is data, not code), and the user confirmed the actual memory
   was an unrelated SSL misconfiguration on a *different* deployment (a VPS behind Cloudflare's proxy,
   not this repo's actual Cloudflare Pages setup). **Nothing is designed for item 3.**

This plan addresses items 1 and 2 together, because they compose: minifying first and hashing the
*minified* output means a comment-only or whitespace-only source edit produces no new URL and no
deploy churn, and solving both at once is also the natural moment to add Cloudflare's `_headers` file
so the new hashed URLs actually get told they're cacheable forever — otherwise the browser-side half
of the fix ships without the CDN-side half that makes it worth doing.

**Constraint that shapes every decision below:** `CLAUDE.md`/`README.md` state, repeatedly and
deliberately, "no bundler, no lint config, no other dependencies... zero npm packages." The user
explicitly chose to keep this literal: a hand-rolled minifier, not a devDependency. That constraint is
respected throughout — see §5 "Things a cheaper model gets wrong" for exactly where the temptation to
reach for something easier (a real parser, `npm install`, joining lines) must be resisted.

**Honest expectation-setting:** current combined page weight is ~12.4 KB gzipped against a
**100 KB budget already documented** in `docs/plans/2026-08-external-debt-history.md`. The realistic
gzip saving from minification here is a few hundred bytes. This is a code-hygiene and cache-correctness
fix, not a performance fix — say so plainly when reporting results; don't oversell the numbers.

## 1. Decisions (already made — do not re-litigate)

| # | Decision | Chosen |
|---|----------|--------|
| D1 | Cache-busting mechanism | **Content-hashed filenames** (`style.<hash>.css`), not query strings — query strings have well-known CDN/proxy cache-key inconsistencies, which is part of why hashing is the standard fix |
| D2 | Minifier | **Hand-rolled**, in `scripts/lib/minify.js`, zero new npm dependency. Comment + whitespace stripping only — explicitly **no** variable renaming/mangling (too risky without a real parser) |
| D3 | Hash algorithm | Node's built-in `crypto.createHash('sha256')`, first 10 hex chars, computed over the **minified** output |
| D4 | New source directory | **`assets/`** — houses hand-edited `style.css`, `app.js`, `counter.js`, `counter.test.js` (moved via `git mv` to preserve blame). Matches the existing noun-style naming of `data/`, `templates/`, `scripts/` |
| D5 | Item 3 (Cloudflare + inlining) | **Out of scope**, dismissed per Context above |
| D6 | Old unhashed URLs (`/style.css`, `/app.js`, `/counter.js`) | **Removed immediately, no transitional copies.** With `public/_headers` (added in this same plan) setting HTML to `max-age=0, must-revalidate`, every page load revalidates and gets fresh hash references — the exposure window for a stale reference is effectively zero, so the extra complexity of keeping old URLs alive isn't justified |
| D7 | Where hashing/minifying runs | **In-process inside `scripts/build-state.js`**, not a chained npm script — CI invokes `node scripts/build-state.js` directly (not `npm run build`), so a separate script would need workflow changes and a manifest hand-off; in-process keeps the existing "one script, one command" build contract |

## 2. Why `assets/` and not coexistence in `public/`

Once `public/` holds `style.<hash>.css`, keeping `public/style.css` as its editable source in the
*same* directory recreates exactly the ambiguity CLAUDE.md's "do not hand-edit generated output" rule
exists to prevent — a human could edit either file and not know which one is "real." Moving source out
to `assets/` mirrors `data/` and `templates/` (root-level source, `public/` is the deploy artifact) and
makes `counter.js` (which has **no HTML reference at all** — it's reached only via `app.js`'s
`import './counter.js'`) unambiguous. Cost is near-zero: only `app.js`'s import and
`counter.test.js`'s import reference `counter.js`, and both move together so both stay byte-identical.

`public/` remains build output **plus** the hand-maintained static images that are deliberately **not**
hashed: `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `og-image.png`.
These change essentially never and `og-image.png` is referenced by absolute URL for external scrapers
— hashing images is an explicit non-goal.

## 3. The minifier — `scripts/lib/minify.js`

New pure module, same shape/location as `scripts/lib/chart.js` (pure functions, sibling
`scripts/lib/minify.test.js`, no I/O). This is the one place needing real care.

### `minifyCss(source) -> string`

A **character-scanner**, not a regex chain (a regex chain eventually eats a `/*` that's actually inside
a string). States: `NORMAL`, `IN_STRING(quoteChar)`, `IN_COMMENT`.

```
NORMAL:
  '/' followed by '*'      -> enter IN_COMMENT, emit nothing
  quote char (' or ")      -> emit, enter IN_STRING(that quote)
  a run of whitespace      -> collapse to a single ' '
  otherwise                -> emit char
IN_STRING:
  '\' escape                -> emit both chars, stay in IN_STRING
  the matching quote        -> emit, return to NORMAL
  otherwise                 -> emit
IN_COMMENT:
  consume until '*' + '/'   -> return to NORMAL, emit nothing
```

Then a second, structural pass on the whitespace-collapsed text: drop the single space immediately
before/after any of `{ } ; : ,`; drop a `;` immediately before `}`; trim overall leading/trailing
whitespace.

**Deliberately do not** strip spaces around `+ - * / > ~` — those are selector combinators but also
`calc()` operators where the spaces are *mandatory* (`calc(100% - 20px)` breaks as `calc(100%-20px)`).
Verified today's `public/style.css` (692 lines, 112 `{` braces) has zero `calc()`, zero `url()`, zero
`@import`, zero `//` sequences, and only three short single-quoted string literals with no escapes
(`'IBM Plex Sans'`, `'IBM Plex Mono'`, `'tnum'`) — but keep the combinator-safety rule anyway since it
costs nothing and removes a future footgun if `calc()` is ever added.

**Sanity check to add, matching this repo's existing "sanity checks are load-bearing" culture** (see
`scripts/lib/debt-math.js`'s `checkRateSanity`): count `{` in input vs. minified output (both outside
strings/comments) and throw if they differ. This catches "the minifier ate a rule" mechanically.

### `minifyJs(source) -> string`

Scoped **deliberately narrow**: strip `//` line comments and `/* */` block comments, strip per-line
leading/trailing whitespace, drop lines that become empty — **and keep every remaining newline.**

That last point is the safety guarantee and must be a comment in the code: joining lines requires
correctly reasoning about automatic semicolon insertion (ASI), which you cannot do without a real
parser — a bare `return` followed by a line starting with `(`, `[`, `` ` ``, `+`, or `-` changes meaning
if the newline between them disappears. Preserving every newline makes ASI behave identically to the
source, so the transform is semantics-preserving modulo comment removal. It still captures most of the
size: `counter.js` is roughly half comments, `app.js` roughly a quarter comments plus deep indentation.

The comment-scanner must track, in addition to `NORMAL`/`IN_STRING`/`IN_COMMENT`:
- **Template literals** (backtick strings) with `${ }` interpolation — `app.js` has
  `` `<span>${g}</span>` `` (line 16), `` `${shareText} ${shareUrl}` `` (48), `` `state.json ${res.status}` ``
  (69), `` `Rp ${...}` `` (93). None contain comment-like sequences, but the scanner must not treat a
  `//` or `/*` inside a template literal as a real comment.
- **Regex literals** — `app.js:27` has a genuine one: `.replace(/\d+/, ...)`. Rule: a `/` in `NORMAL`
  state starts a regex literal if the previous non-whitespace, non-comment token is one of
  `( , = : [ ! & | ? { } ; + - * % ~ ^ < >`, a keyword among
  `return typeof case in of new delete void instanceof do else yield await`, or start-of-file;
  otherwise it's division. Inside a regex literal, track `\` escapes and `[...]` character classes (a
  `/` inside a class is not a terminator).

**Mandatory adversarial test cases** for `scripts/lib/minify.test.js` (this is the load-bearing test
file for the whole plan):
- `x.replace(/\d+/, 'a')` — the real case from `app.js`.
- `const r = /[/]/;` — `/` inside a character class.
- `const q = a / b / c;` — division, not a regex.
- `const s = '// not a comment';` and `const s = "/* not a comment */";`
- `` const t = `a/*b*/c`; `` and a line comment inside a template interpolation.
- `s.split('\\/')` — escaped slash in a string.
- Idempotence: `minifyJs(minifyJs(x)) === minifyJs(x)`.
- CSS equivalent: `content: "/*"` (not present today; lock the behavior in anyway).

**Second, independent safety net** — parse the minified output for real, using Node itself
(zero-dependency, verified working in this environment on Node v26.7.0):

```js
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['--input-type=module', '--check', '-'], { input: minified });
```

Exits 0 on valid ESM, throws (non-zero exit) with a `SyntaxError` on bad input —
`execFileSync` throwing on non-zero exit means this fails the build loudly, matching
`build-state.js`'s existing `fail()` posture. Run this on both `app` and `counter`'s minified output,
**after** the import-specifier rewrite (§4).

**Optional escape hatch**, matching `scripts/site-config.js`'s `process.env.X || ''` convention:
honor `SKIP_MINIFY=1` to hash-and-copy without minifying, for debugging a suspected minifier bug.
Hashing still runs so URLs and `_headers` stay coherent.

## 4. The build step — `scripts/build-assets.js`

New file, exporting `buildAssets(root) -> { cssName, appName, counterName }`, called once from
`scripts/build-state.js`'s top level (**not** from inside `baseTokens()`, which runs twice — once per
language — and would otherwise minify/hash/write/log everything twice).

**Order is load-bearing:**

```js
import { createHash } from 'node:crypto';
const shortHash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

// 1. counter.js FIRST
const counterMin = minifyJs(readFileSync('assets/counter.js', 'utf8'));
const counterName = `counter.${shortHash(counterMin)}.js`;

// 2. app.js: minify, THEN rewrite its import specifier, THEN hash
let appMin = minifyJs(readFileSync('assets/app.js', 'utf8'));
const rewritten = appMin.replace(
  /(\bfrom\s*['"])\.\/counter\.js(['"])/,
  `$1./${counterName}$2`,
);
if (rewritten === appMin) fail(['assets/app.js: expected import specifier "./counter.js" not found']);
appMin = rewritten;
const appName = `app.${shortHash(appMin)}.js`;

// 3. style.css
const cssMin = minifyCss(readFileSync('assets/style.css', 'utf8'));
const cssName = `style.${shortHash(cssMin)}.css`;
```

Three things that must not be simplified away:
- **Hash the minified output**, not the source — a whitespace/comment-only edit produces no new URL.
- **Hash `app.js` after the import rewrite**, and after `counter.js` is hashed. This makes an edit to
  `counter.js` alone cascade into a new `app.<hash>.js` filename (because its content, including the
  import string, changed), which cascades into a new HTML reference. **Skipping this cascade is the
  one way this whole scheme silently breaks**: editing `counter.js` would produce a new
  `counter.<hash>.js` that the still-unchanged `app.<hash>.js` never imports, so the browser keeps
  fetching the *old* `app.js`, which imports the *old* `counter.js` — the fix would ship invisibly
  broken.
- The import-rewrite regex is anchored on `from` + the exact literal path, uses non-global `replace`
  (fires at most once), and **asserts it actually matched, failing the build otherwise** — do not
  relax that assertion. A future refactor that renames or dynamic-imports `counter.js` should be a
  loud build failure, not a silently stale import.

**Stale-file cleanup.** Before writing the three new files, scan the **top level of `public/` only**
(`readdirSync`, no recursion) and delete anything matching
`/^(style|app|counter)\.[0-9a-f]{10}\.(css|js)$/` that isn't in this build's keep-set. Keep the regex
exact-anchored on both ends with the literal 10-hex-char group so it can never match `app.js` (doesn't
exist anymore after the move, but be exact anyway), `counter.test.js`, `index.html`, or an image. This
is the only place the build deletes files — log each deletion. Prefer this over a manifest file: a
manifest is itself a generated artifact that can drift; the filename pattern is already a
self-describing index.

**Wiring into `build-state.js`:**

```js
import { buildAssets } from './build-assets.js';
const assets = buildAssets(ROOT); // once, at module top level
```

Add to `baseTokens()`'s returned map: `ASSET_CSS_URL: '/' + assets.cssName`,
`ASSET_JS_URL: '/' + assets.appName`.

**Template edits** (`templates/index.id.html` and `templates/index.en.html`, same two lines in both):
- line 35: `<link rel="stylesheet" href="/style.css">` → `<link rel="stylesheet" href="{{ASSET_CSS_URL}}">`
- line 288: `<script type="module" src="/app.js"></script>` → `<script type="module" src="{{ASSET_JS_URL}}"></script>`

`render()`'s existing behavior (throws `Missing template token: …` for any `{{TOKEN}}` in a template
absent from `baseTokens()`) already guards against a typo here — no new machinery needed.

## 5. `public/404.html` → `templates/404.html`

Currently hand-maintained (verified: `<link rel="stylesheet" href="/style.css">` at line 12) and
**not** generated by `build-state.js` at all — absent from its six `writeFileSync` targets and from
`build.yml`'s git-add list. Under this plan it *must* move into the template system, or it silently
breaks (pointing at a `/style.css` that no longer exists):

- `git mv public/404.html templates/404.html`.
- Change its stylesheet line to `{{ASSET_CSS_URL}}`.
- In `build-state.js`, alongside the two existing template `render()` calls:
  ```js
  const notFoundTemplate = readFileSync(path.join(ROOT, 'templates/404.html'), 'utf8');
  writeFileSync(path.join(ROOT, 'public/404.html'), render(notFoundTemplate, baseTokens('id')));
  ```
  Passing the full `baseTokens('id')` map is safe (render only throws on template tokens *missing*
  from the map, never the reverse).
- Leave everything else in `404.html` as-is, including its inline `style="font-size: clamp(...)"`
  attribute on the `<h1>` — pre-existing, harmless, and out of scope for this plan (not the "inlined
  CSS" concern from item 3, which was about `<style>` blocks/inline scripts and was dismissed anyway).
- Routing is unchanged — both Cloudflare Pages and the GitHub Pages mirror already serve `/404.html`
  for unmatched paths automatically.

## 6. `public/_headers` — generated, not hand-written

Hand-writing isn't viable since the rules must name the current hashed filenames. Generate it from
`build-state.js` as a new `writeFileSync` target, using the `assets` object from §4:

```
/{{cssName}}
  Cache-Control: public, max-age=31536000, immutable
/{{appName}}
  Cache-Control: public, max-age=31536000, immutable
/{{counterName}}
  Cache-Control: public, max-age=31536000, immutable

/state.json
  Cache-Control: public, max-age=60, must-revalidate
/external-debt.json
  Cache-Control: public, max-age=60, must-revalidate

/
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate
/en/
  Cache-Control: public, max-age=0, must-revalidate
/en/index.html
  Cache-Control: public, max-age=0, must-revalidate
/404.html
  Cache-Control: public, max-age=0, must-revalidate

/sitemap.xml
  Cache-Control: public, max-age=3600
/robots.txt
  Cache-Control: public, max-age=3600

/og-image.png
  Cache-Control: public, max-age=86400
/apple-touch-icon.png
  Cache-Control: public, max-age=86400
/favicon.svg
  Cache-Control: public, max-age=86400
/favicon-32.png
  Cache-Control: public, max-age=86400
/favicon-16.png
  Cache-Control: public, max-age=86400
```

Format: path at column 0, header line indented two spaces, blank line between rules. **Deliberately no
`/*` catch-all** — Cloudflare Pages applies every matching `_headers` rule, so a catch-all plus a
specific rule would emit two conflicting `Cache-Control` values on one response. Enumerating is
verbose but unambiguous, and it's generated so the verbosity is free.

Rationale for the specific values: `immutable` + 1 year *only* on hashed files, because the URL
provably cannot change content underneath it. Images get 1 day, deliberately *not* `immutable`, since
they're the one thing in `public/` that isn't hashed. `state.json`/`external-debt.json` at 60s covers
the CDN/intermediary cold path — `app.js` already fetches `state.json` with `{ cache: 'no-store' }` on
the browser side, and the counter/staleness badge both compute from real client-side time against the
fetched timestamps, so a 60s-stale response at the edge is invisible to a reader. HTML at
`max-age=0, must-revalidate` is what makes D6 (no transitional URLs) safe — every page load always
revalidates and gets current hash references.

**Two things to verify empirically after the first deploy, don't assume:**
1. `curl -sI https://utangindonesia.org/style.<hash>.css` and check `cache-control` — confirms
   Cloudflare Pages honors `_headers` for the response the browser sees. Whether it also drives Pages'
   own *edge*-cache TTL is the part worth double-checking via `cf-cache-status` on a repeat request.
2. **GitHub Pages ignores `_headers` entirely** — the standby mirror (`pages-mirror.yml`, uploads
   `public/` wholesale, no change needed there) will serve it as an inert file and fall back to GitHub
   Pages' own default caching. Harmless — hashed filenames still work correctly there, just without
   the year-long TTL. Worth one sentence in README's mirror section.

This takes `build-state.js`'s generated-file count from six to **eleven**: `state.json`,
`external-debt.json`, `index.html`, `en/index.html`, `sitemap.xml`, `robots.txt`, `404.html`,
`_headers`, plus the three hashed assets.

## 7. `.github/workflows/build.yml`

The "Commit generated output" step currently does:
```
git add public/state.json public/external-debt.json public/index.html public/en/index.html public/sitemap.xml public/robots.txt
```
This breaks under content hashing in a non-obvious way: it won't stage the *deletion* of a previous
build's `style.<oldhash>.css` (explicit paths can't reference files whose names aren't known when the
workflow is written), and even a glob like `public/*.css` wouldn't stage deletions either (shell globs
only expand to files that currently exist) — `public/` would accumulate every historical hashed file in
git forever while local cleanup deletes them from disk, leaving CI's tree permanently dirty.

**Replace with `git add -A public`** — stages adds, modifies, and deletes under `public/` in one
command, and needs no maintenance the next time the generated-file set changes. Verified safe:
`.gitignore` already covers `.DS_Store`, `*.log`, `node_modules/` — nothing transient lives under
`public/` that this would accidentally commit.

No other change needed in this workflow — `node --test` and `node scripts/build-state.js` remain the
whole build; `assets/counter.test.js` (moved in T1) is picked up automatically since `package.json`'s
`"test": "node --test"` is bare recursive discovery (verified: this is the exact current script, no
explicit path list to update).

## 8. Doc updates

**`CLAUDE.md`:**
- Line 15-16 ("No bundler... zero npm packages") — keep, add one sentence: the minifier is
  hand-rolled comment/whitespace stripping (`scripts/lib/minify.js`), no AST, no mangling; explicitly
  warn against ever extending it toward line-joining or renaming — the newline-preserving property is
  what makes it provably ASI-safe.
- Lines 20-29 (source vs. generated) — rewrite: `build-state.js` now writes eleven files (list them);
  human-edited set becomes `data/debt.json`, `data/external-debt.json`, `templates/*.html` (now
  including `templates/404.html`), `assets/style.css`, `assets/app.js`, `assets/counter.js`,
  `scripts/**`. Add a line: `public/` also holds the unhashed static images
  (`favicon*`, `apple-touch-icon.png`, `og-image.png`), deliberately not content-hashed.
- Line 8 (`npm test` description) — `public/*.test.js` → `assets/*.test.js`.
- Lines 40-41, 47-51 (Precision, Staleness — both reference `public/counter.js`) — repoint to
  `assets/counter.js`. The substance is unchanged: it still ships with no imports from `scripts/`, and
  `STALE_DAYS_THRESHOLD` still has to be hand-kept in sync between the two copies.
- Line 55 (Domain-agnostic example `/style.css`) — swap to `/en/` to avoid restating a hash in an
  example, or note it's now `/style.<hash>.css`.
- Line 58 (Design fidelity) — `public/style.css` → `assets/style.css`.
- New short paragraph, same terse register as the rest: caching is handled by generated
  `public/_headers` (immutable for hashed assets, must-revalidate for HTML/state.json) — never
  hardcode `/style.css` or `/app.js` anywhere; those fixed URLs no longer exist.

**`README.md`:**
- Lines 30, 65 (`public/counter.js` mentions) — repoint to `assets/counter.js`.
- Lines 18-29 (`build-state.js` bullet list) — add a bullet for minifying/hashing `assets/*` into
  `public/` and writing `public/_headers`; add `404.html` to the rendered-pages bullet.
- Line 86-87 ("no bundler and no build step for `public/*.js`") — this becomes **factually wrong** and
  must change: replace with something like "`assets/*.js` still ship as authored ES modules — the
  build only strips comments/indentation and adds a content hash to the filename; no transpiling, no
  mangling, no module-graph rewriting beyond the one `./counter.js` import specifier."
- Line 82 (`npm run build` comment) — mention hashed assets.
- "Standby mirror" section — one sentence noting GitHub Pages ignores `_headers` (see §6).

## 9. Task breakdown for execution

Each task is a separate commit, green on `npm test && npm run build` before committing.

- [x] **T1 — `feat(assets): hand-rolled minifier`**: `scripts/lib/minify.js` + `scripts/lib/minify.test.js`
  per §3. 24 tests, all passing, covering every mandatory adversarial case plus the brace-count and
  syntax-check safety nets. Smoke-tested against the real files pre-move: style.css 13.7KB→11.0KB
  (brace count unchanged, 112=112), app.js 3.8KB→2.8KB, counter.js 2.1KB→0.75KB, all syntactically valid.
- [x] **T2 — `feat(assets): relocate to assets/ and add the hashing build step`**: `git mv` the four
  files (§2), `scripts/build-assets.js` (§4), wired into `build-state.js`, both templates updated.
  `npm run build` produces exactly one hashed file per asset; both HTML outputs reference them; `npm
  test` reports 69 (45 baseline + 24 new), `assets/counter.test.js` confirmed actually running via
  `--test-reporter=spec` (not silently skipped). Cascade check, idempotency, and browser check all
  passed — see §10 below for the full record.
- [x] **T3 — `feat(assets): template the 404 page and generate _headers`**: §5 and §6. Rebuilt;
  `public/404.html` references the current hash; `public/_headers` names the current three hashes plus
  every static rule; no `/*` catch-all. Loaded in Chrome — fully styled, no unstyled flash.
- [x] **T4 — `chore(assets): fix CI staging and update docs`**: §7 and §8. Verified locally (not just
  reasoned about) that `git add -A public` stages a hash-rename's deletion+addition together (git
  reports it as a rename) after a real `assets/counter.js` edit + rebuild, then confirmed the reverse
  after reverting. Grepped `templates/`, `public/*.html`, `README.md`, `CLAUDE.md` for the three old
  fixed filenames — zero remaining references.
- [x] **T5 — `chore(assets): verify`**: see §10 for the full evidence-based record, matching
  `docs/plans/2026-08-external-debt-history.md`'s T5 discipline.

## 10. Verification (results)

- [x] **Tests**: `node --test` reports 69 (45 baseline + 24 new minify tests), zero failures.
  `assets/counter.test.js` confirmed actually running via `--test-reporter=spec | grep`, not just
  inferred from the total count.
- [x] **Idempotency**: built twice in a row three separate times (after T2, after T3, after the CSS/JS
  content-change tests below). Hashed filenames identical every time; only `state.json`/
  `external-debt.json`'s `generated_at` differed.
- [x] **Hash changes on real content change**: appended a real declaration to `assets/style.css`,
  rebuilt — `style.a5138312cc.css` → `style.2b56366667.css`, old file removed. Reverted, rebuilt —
  hash returned to `style.a5138312cc.css` exactly.
- [x] **Cascade check (the correctness crux, §4)**: first tried editing `assets/counter.js` with only a
  comment — correctly produced **no** hash change (comments are stripped before hashing, exactly as
  designed — not a bug). Redid it with a real statement
  (`export const CASCADE_TEST_MARKER = 1;`): `app.14a59b52cc.js` → `app.9a9805a1e9.js` **and**
  `counter.23833d4172.js` → `counter.fddba58f17.js`, with the new app.js's import correctly rewritten
  to `./counter.fddba58f17.js`; stale-file cleanup removed both old files. Reverted, rebuilt — both
  hashes returned to their originals exactly.
- [x] **Browser**: loaded `/`, `/en/`, and `/404.html` via `python3 -m http.server`. Zero console
  messages (errors or otherwise), all requests succeeded (hashed CSS/JS + `state.json`), the counter
  visibly advanced past its static SSR fallback value (10,293,690,000,000,000 → 10,488,072,431,260,612
  moments later) proving the minified `app.js` → hashed `counter.js` import chain resolves and executes
  at runtime, both page titles rendered correctly (ID and EN), and `/404.html` rendered fully styled
  via the hashed CSS with no unstyled flash.
- [x] **Numbers** — better than the "a few hundred bytes" expectation set going in, worth noting
  honestly rather than either underselling or overselling:

  | File | Before (raw / gz) | After (raw / gz) | gz saving |
  |---|---|---|---|
  | style.css | 13,706 / 2,913 | 10,996 / 2,511 | −402 B (−13.8%) |
  | app.js | 3,819 / 1,660 | 2,775 / 1,169 | −491 B (−29.6%) |
  | counter.js | 2,105 / 1,059 | 748 / 410 | −649 B (−61.3%) |
  | combined page (html+css+js) | ~12,370 | 10,892 | −1,478 B (−12.0%) |

  Combined page weight is still ~11 KB against the 100 KB budget — the point was never to chase that
  budget, and it remains comfortably met either way. `counter.js`'s outsized drop matches the plan's
  own prediction that it's roughly half comments.
- [ ] **Post-deploy, once** — not yet possible from this environment (branch not deployed). Before or
  shortly after merging: `curl -sI` the live hashed CSS URL and confirm
  `cache-control: public, max-age=31536000, immutable`; `curl -sI` the root and confirm
  `max-age=0, must-revalidate`; `curl -sI /style.css` (the old URL) and confirm it now 404s; check
  `cf-cache-status` on a repeat request to see whether `_headers` also drives Cloudflare's own edge TTL
  (the browser/intermediary win from `_headers` is certain per Cloudflare's docs; the edge-cache win is
  the part this plan flagged as worth confirming empirically rather than assuming).

## 11. Things a cheaper model gets wrong here — read before each of T1/T2

1. **Do not join JS lines to save more bytes.** The newline-preservation rule in §3 is not a
   simplification left for later — it's the entire reason the JS minifier is safe to hand-roll at all.
   Removing it reopens ASI bugs that a regex-based minifier cannot detect.
2. **Do not skip the `node --input-type=module --check -` safety net** to save a step. It's the second
   of three independent guards (adversarial tests, syntax-check, brace-count invariant) — dropping any
   one to save time defeats the point of having three.
3. **Hash `app.js` *after* rewriting its import and *after* `counter.js` is hashed — never before.**
   Getting this ordering backwards is the one way this whole feature silently ships broken (§4).
4. **`git add -A public` is required, not optional** — an explicit file list or a glob both fail to
   stage deletions of stale hashed files (§7). Don't "simplify" it back to a path list.
5. **Never reintroduce `/style.css`, `/app.js`, `/counter.js` as fixed references anywhere** — not in
   a template, not in a doc example, not in a test fixture. Grep for these three literal strings across
   `templates/`, `public/`, `README.md`, `CLAUDE.md` before considering T2-T4 done.
6. **`buildAssets()` must run once, at module top level in `build-state.js`, not inside `baseTokens()`**
   — that function runs twice (once per language) and would double-write/double-log/double-hash.
7. **Don't add an `npm install`.** If the minifier feels too hard to get right by hand, the fallback is
   to escalate back to the planning model (per this plan's header), not to relax D2.
