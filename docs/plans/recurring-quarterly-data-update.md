# Plan: Quarterly data update (recurring)

**Status:** recurring — run every cycle, never "done" · **Models:** planned on Fable 5 ·
**execute on Sonnet 5** (`/model sonnet`, then `/execute-plan docs/plans/recurring-quarterly-data-update.md`) ·
escalate any `## Blockers` to the planning model, not to more Sonnet retries.

**When to run:** around the **20th of February, May, August and November** — that is after both
releases for the previous quarter normally exist (Q2 2026 reference: DJPPR figure reported 12 Aug,
SULNI edition published 18 Aug). Running early is harmless: T0 exits with no changes.

Read `CLAUDE.md` first. Everything in it applies (generated files, BigInt rule, domain-agnostic,
anonymity, sanity checks). This plan only adds to it.

**Recurring-plan override of `execute-plan` step 4:** do **not** tick checkboxes in this file and do
not commit edits to it — it is reused every quarter and must stay pristine. Record per-task progress
in the pull-request description instead (T4 gives the template). If you are blocked with nothing to
open a PR for, open a GitHub issue titled `data update blocked: <quarter>` containing the
`## Blockers` text.

## 1. Goal

Bring `data/debt.json` and `data/external-debt.json` up to the newest officially published quarter
and open a **pull request** for the owner to review and merge. Merging `main` triggers
`.github/workflows/build.yml` → rebuild → Cloudflare Pages deploy; nothing else is needed.

Non-goals (do NOT do): push to `main`; estimate, interpolate or "round to what looks right" any
number; touch `scripts/`, `templates/`, `assets/`, `public/`, CI, or validators; add dependencies;
change thresholds to make a build pass; refresh fields whose source has not changed.

## 2. Decisions (defaults chosen — owner may override before execution)

| # | Decision | Default | Alternative considered |
|---|----------|---------|------------------------|
| D1 | When is a source "due"? | DJPPR: `today ≥ nextQuarterEnd(latest debt_series date) + 35 days`. SULNI: `today ≥ nextQuarterEnd(latest series date) + 45 days`. Not due → skip that source entirely. | Always search — rejected: wastes tokens 8 months of 12 |
| D2 | Source of truth, rupiah debt | The **Kemenkeu APBN KiTa press conference** figure ("posisi utang pemerintah per <bulan>", with debt-to-GDP ratio), as reported by **≥ 2 independent national outlets** that agree to the last printed digit. `source_url` = the most complete of those articles (matches current practice in `debt.json`). | `djppr.kemenkeu.go.id` / `kemenkeu.go.id` directly — they are JS-rendered SPAs; `WebFetch` returns an empty shell. Use them only if the tooling can render JS; otherwise don't loop on them |
| D3 | Source of truth, external debt | The **SULNI edition** for `<quarter-end month + 2>` at `https://www.bi.go.id/en/statistik/ekonomi-keuangan/sulni/Pages/SULNI-<BulanIndonesia>-<YYYY>.aspx`, Documents `…/Documents/SULNI-<Bulan>-<YYYY>.zip` → `TABEL_INDONESIA <Bln><YY>_value.xlsx` → sheet `TabI.1`. Cross-check against the same edition's `.pdf`. | Any secondary source — rejected: BI's own table is directly readable |
| D4 | Cross-check tolerance | Rupiah debt: two outlets must agree exactly at the precision printed (e.g. `Rp10.293,69 triliun`). Ratio: exact to 2 dp. SULNI: xlsx vs PDF exact in USD millions. Otherwise → Blocker, no commit. | ±0.1 % — rejected: the numbers are published to the same precision everywhere; disagreement means a typo somewhere |
| D5 | Output | Branch `data/<yyyy>-q<n>` from `main`, one commit per task (T1/T2 as applicable), a PR whose body lists every changed field old → new with its URL. Never merge it yourself. | Direct push — rejected by owner (2026-09-01): a human reviews numbers before they go live |
| D6 | xlsx reading | `unzip` + a throwaway Node script (§3c) in the session scratchpad, never committed. If the sheet can't be read → use the PDF's Table I.1 (`pdftotext -layout`). If neither → Blocker. | npm xlsx package — rejected: zero-dependency rule |
| D7 | Which quarter(s) | Only the single next quarter after the newest stored point. If two quarters are missing (a skipped cycle), do them in order, oldest first, each cross-checked — still one PR. | — |

Bulan Indonesia for URLs: Januari Februari Maret April Mei Juni Juli Agustus September Oktober
November Desember. Edition carrying quarter-end **Sep** = **November** edition; Dec → Februari;
Mar → Mei; Jun → Agustus.

## 3. Data model — exactly what changes

### 3a. `data/debt.json`

Append **at the end** of `debt_series` (array order is validated, not sorted):

```json
{ "date": "2026-09-30", "debt_idr": "10xxxxxxxxxxxxxxx", "source_url": "https://…" }
```

- `debt_idr` = full rupiah as a **string of digits**. `Rp10.293,69 triliun` → `"10293690000000000"`
  (17 digits: the trillions figure × 10¹²). A JSON number here fails `validateDebtSeries`.
- Then set `gdp_idr.value` (also a string) = `debt ÷ (ratio ÷ 100)`, rounded to the nearest
  **Rp 1 triliun** (i.e. ends in twelve zeros), and rewrite `gdp_idr._note` and `source_url` with the
  new ratio/date/URL. Check: `10293690000000000 / 0.4126 = 24948…` → `"24948000000000000"` ✓.

Single-value fields — refresh **only** those whose source has a newer release; each keeps its own
`source_url`:

| Field | Comes from | Changes when |
|-------|-----------|--------------|
| `sbn_share_pct` | same APBN KiTa release (SBN share of total debt) | every quarter |
| `fx_debt_share_pct` | DJPPR "porsi SBN valas" (keep the existing `_note` — it is SBN's own FX share, not total-debt FX share) | every quarter, if reported |
| `interest_ytd_idr` + `period`/`period_en` | APBN KiTa realisasi "Januari–<bulan>" belanja bunga utang | every release; period strings must name the new range in both languages |
| `deficit_ytd_idr` + `period`/`period_en` | APBN KiTa realisasi defisit | every release |
| `avg_tenor_years` | DJPPR *Profil Utang dan Penjaminan Pemerintah Pusat* (ATM, years) | if the newer profile is findable; else leave |
| `fx_reserves_usd` + `months_equiv` | BI monthly press release "Cadangan Devisa" (`bi.go.id/id/publikasi/ruang-media/news-release/Pages/sp_….aspx`) | monthly — use the release for the quarter-end month |
| `interest_annual_idr` | APBN/APBN-P full-year interest budget | only when the budget year rolls over or an outlook revision is published |
| `population`, `workers` | BPS annual projection / Sakernas Feb & Aug | only if BPS has a newer figure; usually unchanged |

Do not touch `deficit_law_limit_pct_gdp`, `debt_law_limit_pct_gdp`, `gdp_comparison`,
`debt_to_gdp_source_url`, `sources_general`.

### 3b. `data/external-debt.json`

Append **at the end** of `series` (must be ascending, a quarter-end date, all four values > 0,
`government + central_bank + private` within 0.5 % of `total`, `total` within ±25 % of the previous
row — see `scripts/lib/external-debt.js`):

```json
{ "date": "2026-09-30", "total": 4xxxxx, "government": 2xxxxx, "central_bank": xxxxx, "private": 1xxxxx }
```

USD **millions** as plain JSON numbers (no BigInt, no conversion to IDR or billions). Then update
`edition` (`"SULNI November 2026"`), `edition_en` (`"SULNI November 2026"`), `source_url` (the new
edition page), and the xlsx filename inside `_note` (`TABEL_INDONESIA Nov26_value.xlsx`). Leave the
rest of `_note` as is.

Row mapping in `TabI.1`: `1.1 Pemerintah / Government` → `government`; `1.2 Bank Sentral / Central
Bank` → `central_bank`; `2 Swasta / Private` → `private`; `TOTAL (1+2)` → `total`. Columns are months;
pick the column headed by the quarter-end month. While there, spot-check that the **previous** row
already in the file still matches the new edition (BI revises back data occasionally) — if it
differs, update that row too and say so in the PR.

### 3c. Reference xlsx reader (scratchpad only — do not commit)

Verified 2026-09-01 against `TABEL_INDONESIA Ags26_value.xlsx`: reproduces the stored rows for
2026-06, 2026-03, 2025-12 and 2014-12 exactly. Save as `read-tab.js` in the scratchpad and run
`node read-tab.js "<path to xlsx>" 2026 Sep` (three separate arguments — in zsh don't pass them
through one unquoted variable).

```js
// node read-tab.js <xlsx-path> <YYYY> <Mon>   e.g. … 2026 Jun  → prints the four Table I.1 values
const { execSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const [xlsx, year, mon] = process.argv.slice(2);
const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'xlsx-'));
execSync(`unzip -oq "${xlsx}" -d "${dir}"`);
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const rid = [...read('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find(m => m[1] === 'TabI.1')[2];
const target = read('xl/_rels/workbook.xml.rels').match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))[1];
const ss = [...read('xl/sharedStrings.xml').matchAll(/<si>(.*?)<\/si>/gs)]
  .map(m => [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(t => t[1]).join(''));
const rows = [...read('xl/' + target.replace(/^\/?xl\//, '')).matchAll(/<row [^>]*>(.*?)<\/row>/gs)].map(r => {
  const cells = {};
  for (const [, col, t, v] of r[1].matchAll(/<c r="([A-Z]+)\d+"(?: [^>]*t="([^"]+)")?[^>]*>(?:<v>(.*?)<\/v>)?/g))
    if (v !== undefined) cells[col] = (t === 's' ? ss[+v] : v).trim().replace(/\*+$/, ''); // strip provisional marks (2026*, Jun**)
  return cells;
});
const label = r => Object.values(r).join(' ');
const isYear = v => v === year;
const yearRow = rows.find(r => Object.values(r).some(isYear));           // year label sits above that year's Jan column
const monRow = rows.find(r => Object.values(r).filter(v => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(v)).length > 12);
const colNum = c => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const startCol = colNum(Object.entries(yearRow).find(([, v]) => isYear(v))[0]);
const yearCols = Object.entries(yearRow).filter(([, v]) => /^\d{4}$/.test(v)).map(([c]) => colNum(c)).sort((a, b) => a - b);
const endCol = yearCols.find(n => n > startCol) ?? Infinity;                 // next year label bounds this year's columns
const monthCols = Object.entries(monRow).filter(([c, v]) => v === mon && colNum(c) >= startCol && colNum(c) < endCol);
if (!monthCols.length && mon !== 'Dec') throw new Error(`no ${mon} ${year} column — pre-2015 years are year-end only`);
const col = monthCols.length ? monthCols[0][0] : Object.entries(yearRow).find(([, v]) => v === year)[0]; // year-end-only column (2008–2014)
const pick = re => Math.round(Number(rows.find(r => re.test(label(r)))[col]));
console.log(JSON.stringify({ date: `${year}-${mon}`, total: pick(/^TOTAL/), government: pick(/1\.1 Pemerintah/), central_bank: pick(/1\.2 Bank Sentral/), private: pick(/^2\. Swasta/) }));
```

What it already handles (don't re-derive): sheet `TabI.1` is looked up by name; cell values are
**unrounded floats** (`123805.694…`) and are rounded to whole USD millions; BI marks provisional
periods with asterisks (`2026*`, `Jun**`) which are stripped; year labels sit on one header row
above that year's `Jan` column and month names on the next row; 2008–2014 exist only as year-end
columns. If the regexes miss cells in a future edition, fix the parser — never type numbers from
memory or from a screenshot.

## 4. Tasks

Run `npm test && npm run build` before every commit; both must pass. Commit prefix: `data:`.
Progress goes in the PR body, not in this file.

### T0 — Detect what is due (no commit)
- [ ] `git checkout main && git pull`. Compute, e.g.
      `node -e 'const d=require("./data/debt.json"),u=require("./data/external-debt.json");console.log(d.debt_series.at(-1).date,u.series.at(-1).date)'`.
      `nextQuarterEnd(date)` = the last day of the third month after `date`'s month
      (`06-30 → 09-30`, `09-30 → 12-31`, `12-31 → 03-31`, `03-31 → 06-30`).
- [ ] Apply D1. Print a one-line verdict per source: `DJPPR: due since <date>` / `not due until
      <date>`; `SULNI: …`.
- [ ] If **neither** is due → stop here. Report: "Nothing due — debt latest <d>, SULNI latest <d>;
      next check after <date>." No branch, no PR, no issue.
- [ ] If at least one is due → `git checkout -b data/<yyyy>-q<n>` and continue with only the due
      tasks.
- Acceptance: the verdict line names concrete dates derived from the files, not from memory.

### T1 — DJPPR / APBN KiTa position (`data: <quarter> central government debt`)
Skip if not due per T0.
- [ ] Find the release. `WebSearch` for e.g. `"posisi utang pemerintah" "September 2026" triliun
      Kemenkeu` and `utang pemerintah kuartal III 2026 rasio PDB`. Prefer articles that quote the
      Kemenkeu press conference. Do not spend more than a few searches on `djppr.kemenkeu.go.id` /
      `kemenkeu.go.id` directly (D2).
- [ ] If no article reports a position dated the target quarter-end → stop this task with no edits:
      "expected but not yet published" (not a Blocker — just report it in the PR body / final
      message and continue with T2 if due).
- [ ] Transcribe from **two** independent outlets: position (`Rp … triliun`, 2 dp), debt-to-GDP
      ratio (2 dp). They must agree exactly (D4). Sanity: position must exceed the previous point by
      Rp 100–700 triliun (reference: +282,5 T in Q1 2026, +373,29 T in Q2 2026); a decrease or a
      > Rp 1.000 triliun jump means a typo in your reading.
- [ ] Edit `data/debt.json` per §3a: append the row, set `gdp_idr`, then refresh the single-value
      fields whose sources you actually found (table in §3a). Every changed field gets the URL it
      came from. Do not invent `period`/`period_en` wording — copy the pattern already in the file.
- [ ] `npm test && npm run build`; then
      `node -e 'const s=require("./public/state.json");console.log(s.official_date,s.rate_per_sec)'`
      — `official_date` is the new quarter-end. Compare `rate_per_sec` with the value on `main`
      (`git show main:public/state.json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).rate_per_sec))'`):
      it must be within **0.5× – 2×** of that, and in absolute terms between **10 M and 100 M
      IDR/sec** (reference: 41.9 M/sec on the 2026-06-30 data). Outside → re-check units before
      anything else (`checkRateSanity` only catches > 200 M/sec).
- [ ] Commit (this task only).
- Acceptance: build prints `[build-state] OK`; `git diff main -- data/debt.json` shows one appended
  series row, a changed `gdp_idr`, and only fields with a new URL changed.

### T2 — SULNI external debt (`data: <quarter> external debt (SULNI <edition>)`)
Skip if not due per T0.
- [ ] `WebFetch` the SULNI listing `https://www.bi.go.id/en/statistik/ekonomi-keuangan/sulni/Default.aspx`;
      confirm the expected edition (§2, month table) exists. If not → "expected but not yet
      published", no edits, continue.
- [ ] Download `…/Documents/SULNI-<Bulan>-<YYYY>.zip` and `.pdf` into the scratchpad. **bi.go.id
      returns nothing to curl's default user-agent** (exit 56, `http 000`) — use
      `curl -sL --http1.1 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" -o sulni.zip <url>`
      (verified 2026-09-01: 200, ~5.4 MB). Unzip; the file is
      `Buku dan Tabel SULNI Publikasi <Bln> <YYYY>/TABEL_INDONESIA <Bln><YY>_value.xlsx` (the
      `_value` one, not `_growth`; ignore `TABEL_PEMERINTAH`/`TABEL_SWASTA`).
- [ ] Run the §3c reader: `node read-tab.js "<xlsx>" <YYYY> <Mon>` (e.g. `2026 Sep`). It prints the
      four values. Cross-check all four against the PDF's Table I.1 (`pdftotext -layout`, or read
      the PDF directly). Exact match required (D4).
- [ ] Sanity before editing: `government + central_bank + private ≈ total` (±0.5 %); `total` within
      ±25 % of the previous row; `government` within ±10 % of the previous row.
- [ ] Edit `data/external-debt.json` per §3b (row + `edition`/`edition_en`/`source_url`/`_note`
      filename). Re-verify the previous row against the new edition.
- [ ] `npm test && npm run build`; then
      `node -e 'const u=require("./public/external-debt.json");console.log(u.series.at(-1))'` shows
      the new row. Commit.
- Acceptance: build `OK`; `git diff main -- data/external-debt.json` shows exactly one appended row
  plus the three metadata fields (and, only if BI revised it, one changed prior row that the PR
  body explains).

### T3 — Verification pass (no commit unless something is wrong)
- [ ] `npm test && npm run build` twice; the second build changes only `generated_at` in
      `public/state.json` / `public/external-debt.json`.
- [ ] `git status` shows changes only under `data/` and `public/` (public is regenerated; it is
      fine to commit it or leave it — CI rebuilds either way).
- [ ] Open `public/index.html` in a browser (or `python3 -m http.server 8080 --directory public`)
      and confirm: the hero shows the new date, no amber stale badge, the ULN card shows the new
      quarter and edition.
- [ ] `grep -rn` your new numbers in `data/*.json` against the sources one last time.

### T4 — Pull request (`gh pr create --base main`)
- [ ] Push the branch. Title: `data: Q<n> <yyyy> debt position + SULNI <edition>` (omit the part
      that wasn't updated).
- [ ] Body template — fill every line, no placeholders left:
      ```
      ## What changed
      | file | field | old | new | source |
      |------|-------|-----|-----|--------|
      | data/debt.json | debt_series[+1] | — | 2026-09-30 / Rp… | <url> |
      | data/debt.json | gdp_idr.value | … | … | derived: … ÷ 0.xxxx |
      | … | | | | |

      ## Cross-checks
      - Rupiah position: <outlet A> = <outlet B> = Rp … triliun ✓
      - SULNI xlsx vs PDF Table I.1: total/gov/BI/private … ✓
      - rate_per_sec after build: … (band 15–30 M/sec ✓)

      ## Not updated (and why)
      - …

      ## Task log
      T0 … · T1 … · T2 … · T3 …
      ```
- [ ] Leave the PR unmerged. Report its URL as the final message.
- Acceptance: CI on the PR is green; the body has no `…` left.

## 5. Things a cheaper model gets wrong here — read twice

1. **Units.** `Rp10.293,69 triliun` is `10293690000000000` (17 digits). USD in SULNI is
   **millions** (`453369`), never billions. Getting either wrong by 10³ will pass some checks and
   ship a wrong headline.
2. **Strings vs numbers.** `debt_idr` and `gdp_idr.value` are digit **strings**. Everything else in
   `debt.json`, and all of `external-debt.json`, is a plain number.
3. **Append order.** Both series validate array order. New rows go at the end.
4. **Indonesian number formatting** in sources: `.` thousands, `,` decimals. `10.293,69` = 10293.69.
5. **Never estimate.** "Roughly Rp 10.700 triliun" in an article is not a figure. If two outlets
   disagree, that is a Blocker, not a tie-break.
6. **Never relax a validator** (`MAX_RATE_PER_SEC`, `MAX_QOQ_JUMP_PCT`, the 0.5 % sum tolerance,
   `STALE_DAYS_THRESHOLD`) to make the build pass. A failing validator means *your data* is wrong.
7. **Don't fetch-loop the SPAs.** `djppr.kemenkeu.go.id` and `kemenkeu.go.id` render client-side;
   an empty page is expected, not a transient error. Search instead (D2).
8. **SULNI "Government" includes SBN held by non-residents** — it is not the same thing as the
   DJPPR foreign-currency share, and must not be reconciled against it.
9. **Never edit `public/`**, templates, scripts, or this plan file. Never push to `main`.
10. Anonymity: no names, emails, or local paths in commits or the PR body.
11. `interest_ytd_idr`/`deficit_ytd_idr` are **year-to-date** realizations; the `period` strings
    must say which months. Don't copy a full-year budget figure into a YTD field.

## 6. Definition of done (per run)

- Either: a PR open against `main` on branch `data/<yyyy>-q<n>`, CI green, body complete per T4,
  every changed field cited — **or** T0 reported "nothing due" with no branch — **or** a
  `data update blocked: <quarter>` issue with the `## Blockers` text and no half-finished PR.
- `git diff main` on the branch touches only `data/debt.json`, `data/external-debt.json`, and
  regenerated `public/` files.
- This file is byte-identical to `main`.
