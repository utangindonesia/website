# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm test            # node:test — runs scripts/lib/*.test.js and public/*.test.js
npm run build        # node scripts/build-state.js — regenerates all build output (see below)
node --test scripts/lib/debt-math.test.js   # run a single test file
node --test --test-name-pattern="precision" # run tests matching a name pattern
python3 -m http.server 8080 --directory public   # preview the built site (or any static server)
```

No bundler, no lint config, no other dependencies — this is intentionally plain Node + vanilla
browser JS (`<script type="module">`), zero npm packages.

## Architecture

**Source vs. generated files — do not hand-edit generated output.** `scripts/build-state.js` reads
`data/debt.json` + `templates/index.{id,en}.html` and writes `public/index.html`,
`public/en/index.html`, `public/state.json`, `public/sitemap.xml`, and `public/robots.txt`. Those
five files are build output; edits to them are silently overwritten on the next `npm run build`.
The only files a human (or Claude) should edit directly are `data/debt.json`, `templates/*.html`,
`public/style.css`, `public/app.js`, `public/counter.js`, and the `scripts/**` build logic itself.

**Template rendering** is a single `render()` function in `build-state.js` doing `{{TOKEN}}` string
substitution (see `baseTokens()` for the full token map) — no templating library. Adding a new
displayed value means: add the field to `data/debt.json`, add a token to `baseTokens()`, reference
`{{TOKEN}}` in both `templates/index.id.html` and `templates/index.en.html` (the EN template needs
an `_EN`-suffixed token for anything with locale-specific wording, e.g. `CARD_TENOR_VALUE_EN`).

**Precision**: Indonesia's total debt and GDP are at or beyond `Number.MAX_SAFE_INTEGER` (2^53 − 1).
`debt_idr` (in `data/debt.json`'s `debt_series`) and `gdp_idr.value` are therefore JSON **strings**
of digits, never numbers — parse them with `BigInt(str)`, never `Number(str)`. This BigInt-safe
path runs end-to-end: `scripts/lib/debt-math.js` (build-time) and `public/counter.js` (browser,
duplicated rather than imported since `public/` ships standalone with no cross-directory imports)
both keep the running total as `BigInt` and only ever pass small, safely-sized quantities (the
per-second rate, elapsed seconds) through floating point. Any other large-rupiah field you add
above roughly 9×10^15 needs the same string/BigInt treatment; smaller figures (hundreds of
trillions, e.g. `interest_annual_idr`) are fine as plain JSON numbers.

**Staleness cadence**: Kemenkeu switched central-government debt reporting from monthly to
quarterly in October 2025. `STALE_DAYS_THRESHOLD` (120 days) lives in both
`scripts/lib/debt-math.js` and `public/counter.js` and must be kept in sync between them — it's not
imported because `public/` has no dependency on `scripts/`. Don't reintroduce a ~45-day threshold;
that assumes a monthly cadence that no longer matches how Kemenkeu actually publishes this figure.

**Domain-agnostic by design**: the only place an absolute domain appears is `SITE_ORIGIN` in
`scripts/site-config.js` (used for canonical/OG URLs, sitemap, JSON-LD). Every internal link is
root-relative (`/style.css`, `/en/`, etc.) so a fork can redeploy under a different domain by
changing that one constant — don't hardcode `utangindonesia.org` anywhere else.

**Design fidelity**: `public/style.css` and `templates/*.html` were extracted from
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
