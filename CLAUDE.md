# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm test            # node:test — runs scripts/lib/*.test.js and assets/*.test.js
npm run build        # node scripts/build-state.js — regenerates all build output (see below)
node --test scripts/lib/debt-math.test.js   # run a single test file
node --test --test-name-pattern="precision" # run tests matching a name pattern
python3 -m http.server 8080 --directory public   # preview the built site (or any static server)
```

No bundler, no lint config, no other npm dependency — this is intentionally plain Node + vanilla
browser JS (`<script type="module">`), zero npm packages. The one thing that pushes against this is
`scripts/lib/minify.js`: a hand-rolled ~250-line comment/whitespace-stripping minifier (no AST, no
variable renaming/mangling) written specifically to keep that rule intact rather than adding a
minifier dependency. Its newline-preserving behavior for JS is load-bearing (see its own comments) —
never extend it toward joining lines or renaming identifiers; that needs a real parser.

## Architecture

**Source vs. generated files — do not hand-edit generated output.** `scripts/build-state.js` reads
`data/debt.json` + `data/external-debt.json` + `templates/index.{id,en}.html` + `templates/404.html`,
minifies and content-hashes `assets/{style.css,app.js,counter.js}` (`scripts/build-assets.js`), and
writes `public/index.html`, `public/en/index.html`, `public/404.html`, `public/state.json`,
`public/external-debt.json`, `public/sitemap.xml`, `public/robots.txt`, `public/_headers`, and the
three hashed asset files (`style.<hash>.css`, `app.<hash>.js`, `counter.<hash>.js`). Those are all
build output; edits to them are silently overwritten (or, for the hashed assets, deleted as stale) on
the next `npm run build`. The only files a human (or Claude) should edit directly are `data/debt.json`,
`data/external-debt.json`, `templates/*.html`, `assets/style.css`, `assets/app.js`, `assets/counter.js`,
and the `scripts/**` build logic itself (including `scripts/lib/external-debt.js` and
`scripts/lib/chart.js`, which validate and render the "Utang luar negeri" quarterly chart — see
`docs/plans/2026-08-external-debt-history.md` for the full design/data rationale). `public/` also
holds a handful of hand-maintained static images — `favicon.svg`, `favicon-16.png`, `favicon-32.png`,
`apple-touch-icon.png`, `og-image.png` — deliberately **not** content-hashed, since they change
essentially never and `og-image.png` is referenced by absolute URL for external scrapers. The same
goes for `public/fonts/*.woff2` and `public/fonts/OFL.txt` (self-hosted IBM Plex, sourced from
Google Fonts' own latin-subset files so glyphs/hinting match, replaced by renaming rather than by
a hash) — if a file there needs replacing, rename it. Never reintroduce a Google Fonts `<link>` in
any template; the site's privacy posture depends on making zero third-party requests. The
`PRIVACY_ANALYTICS_SENTENCE` / `PRIVACY_ANALYTICS_SENTENCE_EN` tokens in `baseTokens()` must stay
guarded by `CF_BEACON_TOKEN` exactly like `CF_ANALYTICS_SNIPPET` — the privacy paragraph can never
claim less or more tracking than the build actually ships.

**Caching**: `public/_headers` is generated (Cloudflare Pages reads it natively) — the three hashed
assets get a year-long `immutable` Cache-Control, since a hashed URL provably can't change content
underneath it; every HTML page and `state.json`/`external-debt.json` get `max-age=0, must-revalidate`,
which is what makes it safe that the old `/style.css`/`/app.js`/`/counter.js` URLs no longer exist at
all — every page load always revalidates and gets current hash references. Never hardcode those three
fixed filenames anywhere (templates, docs, tests); reference `{{ASSET_CSS_URL}}`/`{{ASSET_JS_URL}}`.

**Template rendering** is a single `render()` function in `build-state.js` doing `{{TOKEN}}` string
substitution (see `baseTokens()` for the full token map) — no templating library. Adding a new
displayed value means: add the field to `data/debt.json`, add a token to `baseTokens()`, reference
`{{TOKEN}}` in both `templates/index.id.html` and `templates/index.en.html` (the EN template needs
an `_EN`-suffixed token for anything with locale-specific wording, e.g. `CARD_TENOR_VALUE_EN`).

**Precision**: Indonesia's total debt and GDP are at or beyond `Number.MAX_SAFE_INTEGER` (2^53 − 1).
`debt_idr` (in `data/debt.json`'s `debt_series`) and `gdp_idr.value` are therefore JSON **strings**
of digits, never numbers — parse them with `BigInt(str)`, never `Number(str)`. This BigInt-safe
path runs end-to-end: `scripts/lib/debt-math.js` (build-time) and `assets/counter.js` (browser,
duplicated rather than imported since the served `public/` output ships standalone with no
cross-directory imports at runtime) both keep the running total as `BigInt` and only ever pass small,
safely-sized quantities (the
per-second rate, elapsed seconds) through floating point. Any other large-rupiah field you add
above roughly 9×10^15 needs the same string/BigInt treatment; smaller figures (hundreds of
trillions, e.g. `interest_annual_idr`) are fine as plain JSON numbers.

**Staleness cadence**: Kemenkeu switched central-government debt reporting from monthly to
quarterly in October 2025. `STALE_DAYS_THRESHOLD` (120 days) lives in both
`scripts/lib/debt-math.js` and `assets/counter.js` and must be kept in sync between them — it's not
imported because the served `public/` output has no dependency on `scripts/`. Don't reintroduce a
~45-day threshold; that assumes a monthly cadence that no longer matches how Kemenkeu actually
publishes this figure.

**Domain-agnostic by design**: the only place an absolute domain appears is `SITE_ORIGIN` in
`scripts/site-config.js` (used for canonical/OG URLs, sitemap, JSON-LD). Every internal link is
root-relative (`/en/`, `/style.<hash>.css`, etc.) so a fork can redeploy under a different domain by
changing that one constant — don't hardcode `utangindonesia.org` anywhere else.

**Design fidelity**: `assets/style.css` and `templates/*.html` were extracted from
`design_handoff_utangindonesia/` (a Claude Design handoff bundle — see its `README.md` for the full
design-token spec). Match that source of truth rather than inventing new styling; if a change isn't
in the handoff bundle, treat it as a deliberate deviation worth calling out, not a default.

**Anonymity**: this project is published pseudonymously (see git config — repo-local identity is
already set, not `--global`). No personal names, emails, usernames, or local filesystem paths in
code, comments, commit messages, or generated output.

**Sanity checks are load-bearing**: `scripts/lib/debt-math.js`'s `checkRateSanity` /
`validateDebtSeries` make `build-state.js` exit non-zero (and the GitHub Action fail) on a negative
rate, an implausibly large rate, or non-monotonic dates in `debt_series`. Don't relax these without
a real reason — they're the only thing standing between a data-entry typo and a wrong number
shipping live.
