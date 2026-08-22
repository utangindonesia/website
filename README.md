# utangindonesia.org

A live-ticking counter for Indonesia's central government debt, in the spirit of
[usdebtclock.org](https://usdebtclock.org) but calmer: one official quarterly figure, interpolated
linearly, with a hard "this is an estimate" disclaimer built into the page. Fully static, no
runtime backend, no framework.

Not affiliated with the Government of Indonesia. See the Methodology section on the site itself
for how the numbers are derived.

## How it works

- **`data/debt.json`** and **`data/external-debt.json`** are the only files a human edits.
  `debt.json` holds the last few quarters of official central government debt positions plus the
  other single-value indicator figures (population, GDP, interest ceiling, FX reserves, …), each
  with the `source_url` it came from. `external-debt.json` holds the quarterly external-debt (ULN)
  time series behind the "Utang luar negeri" chart, sourced from Bank Indonesia's SULNI.
- **`scripts/build-state.js`** (plain Node, no dependencies) reads both data files and:
  - computes a per-second growth rate from the average of the last 2–3 quarterly deltas,
  - runs sanity checks (rate can't be negative or absurdly large, dates must be increasing) and
    **fails the build** (non-zero exit) if any of them trip,
  - writes `public/state.json` — the small file the browser fetches on load to drive the ticker,
  - validates `external-debt.json` and renders the two build-time SVG line charts
    (`scripts/lib/chart.js`) for the "Utang luar negeri" section — no client-side JS involved,
  - writes `public/external-debt.json` — a copy of the ULN series for anyone who wants the raw numbers,
  - renders `public/index.html` and `public/en/index.html` from `templates/*.html`, baking in the
    current title/meta description, JSON-LD, and the *exact last official figure* as a static
    fallback (so the page is correct even if JavaScript never runs),
  - writes `public/sitemap.xml` and `public/robots.txt`.
- **`public/counter.js`** is the only client-side logic: on load it fetches `state.json` and
  advances the counter with `baseline + elapsed_seconds × rate`. Large rupiah totals are carried
  as `BigInt` end-to-end (see "Precision" below) — the small rate/elapsed pieces stay as ordinary
  numbers, which is safe because they never get large enough to lose precision.
- A GitHub Action (`.github/workflows/build.yml`) runs `build-state.js` on every push to `main`
  and weekly on a schedule, and commits the regenerated `public/*` output back to the repo.
  Cloudflare Pages watches the repo and deploys automatically — there is no separate deploy step.

### Quarterly update procedure

Kemenkeu has reported the central government debt position quarterly (not monthly) since October
2025, landing 5-7 weeks after each quarter-end. Once a new release lands (and, as needed, an
updated Bank Indonesia SULNI/SEKI or BPS figure):

1. Append the new quarterly figure to `debt_series` in `data/debt.json`, with its `source_url`.
2. Update whichever of the single-value fields changed (interest YTD, deficit YTD, FX reserves,
   etc.), each with its own `source_url`.
3. Each quarter, once Bank Indonesia publishes the SULNI edition two months after quarter-end (e.g.
   the November edition carries the September position), add one row to `series` in
   `data/external-debt.json` from that edition's Table I.1 ("External Debt Position by Group of
   Borrower") — `government`/`central_bank`/`private`/`total`, USD millions. Update `edition` /
   `edition_en` / `source_url` to the new edition.
4. `npm test && npm run build` locally to sanity-check before pushing (optional — CI does this too).
5. Push to `main`. The Action rebuilds `public/state.json`, `public/external-debt.json`, and both
   HTML pages and commits them; Cloudflare Pages deploys the new commit within a minute or two.

That's the entire update — no other files should need to change for a routine quarterly refresh.

### Precision

Indonesia's debt (~Rp 8.6 quadrillion) is close to `Number.MAX_SAFE_INTEGER` (2^53 − 1 ≈
9.007 × 10^15) and its GDP is already past it. Every place a value at that scale is handled —
`data/debt.json`'s `debt_idr`/`gdp_idr` fields, `state.json`'s `baseline`, the browser's running
total — carries it as a `BigInt` (JSON fields as digit strings, parsed with `BigInt(str)`, never
`Number(str)`). Only small, safely-sized quantities (the per-second rate, elapsed seconds,
percentages) ever touch floating point. See `scripts/lib/debt-math.js` and `public/counter.js`,
and their `*.test.js` files, which include a test proving no precision loss at 1×10^16 scale.

### Staleness

If the latest `official_date` in `state.json` is more than 120 days old, the page shows an amber
"Data terakhir berumur N hari" badge (computed client-side from the real current time, so it stays
accurate between builds) and `build-state.js` prints a warning during the build. 120 days (not the
naive "45 days" a monthly-cadence assumption would suggest) is chosen because Kemenkeu's release is
now quarterly — see `scripts/lib/debt-math.js`'s `STALE_DAYS_THRESHOLD` comment for the math. The
weekly cron keeps `generated_at` fresh even in a quarter with no data changes, so this triggers
reliably if a release is overdue.

## Development

```
npm test           # node:test — pure-function unit tests, no browser needed
npm run build       # regenerates public/state.json, public/index.html, public/en/index.html, etc.
python3 -m http.server 8080 --directory public   # or any static file server, to preview
```

There is no bundler and no build step for `public/*.js` — they're loaded directly as ES modules
(`<script type="module">`), which every evergreen browser supports natively.

## Deploy your own

This repo is public specifically so it can be forked and redeployed with zero code changes if the
primary site is ever unreachable:

1. Fork the repo.
2. In the fork's Settings → Actions, enable Actions (they're disabled by default on forks).
3. Point [Cloudflare Pages](https://pages.cloudflare.com/) (or GitHub Pages, see below) at the
   fork, build output directory `public`, no build command needed (the Action commits the built
   files).
4. If you want the canonical/OG URLs to point at your own domain instead of
   `utangindonesia.org`, set a `SITE_ORIGIN` repository variable (Settings → Secrets and
   variables → Actions → Variables) to your domain, e.g. `https://example.org` — everything else
   in the codebase uses relative URLs, so this is the only place a domain needs to change.

### Standby mirror (GitHub Pages)

`.github/workflows/pages-mirror.yml` publishes the same `public/` output to GitHub Pages. It's
disabled by default (manual `workflow_dispatch` only) since Cloudflare Pages is primary. To use it
as a live standby:

1. In Settings → Pages, set the source to "GitHub Actions".
2. Run the `Deploy standby mirror to GitHub Pages` workflow manually, or uncomment its `push`
   trigger in the workflow file to keep it continuously in sync.
3. If the primary domain (`utangindonesia.org`) is ever blocked, repoint `hutangindonesia.org` (or
   any domain you control) at the GitHub Pages mirror instead of its usual 301 redirect to
   primary, and set `SITE_ORIGIN` accordingly for a rebuild.

### DDoS / blocking resilience

- **DDoS**: nothing to configure — the site is 100% static on Cloudflare's CDN with unmetered DDoS
  protection, and there is no origin server, API, or database to target. If needed, Cloudflare's
  dashboard has an "Under Attack Mode" toggle (Overview tab) as a manual last resort.
- **Domain-level blocking**: see "Standby mirror" above. Because every internal link on the site
  is relative and the only domain reference (`SITE_ORIGIN`) is a single build-time constant, a
  fork or mirror works without touching any code.

## Analytics

The site ships with [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) wired
in but off by default (no tracking without a token). To enable it, create a site in the Cloudflare
dashboard, copy its beacon token, and set it as a `CF_BEACON_TOKEN` repository variable/secret —
`scripts/site-config.js` picks it up at build time and `build-state.js` injects the snippet.

## Scope & non-goals

Central government debt only — Surat Berharga Negara (SBN) and loans, rupiah and foreign currency.
Excludes state-owned enterprise debt, regional government debt, and contingent liabilities. No PDF
scraping (data is hand-entered quarterly from official releases — see "Quarterly update procedure").
One historical chart (quarterly external debt since 2014, build-time SVG, no JS chart library) — no
other historical series, no accounts, no comments, no runtime backend.

## License

MIT, see [LICENSE](LICENSE). Data sourced from Kementerian Keuangan (Kemenkeu), Bank Indonesia,
and BPS — see the site's Methodology section for exact source links, and `data/debt.json` /
`data/external-debt.json` for the `source_url` behind every figure.

## Contact

Open an issue on this repository — that's the only support channel.
