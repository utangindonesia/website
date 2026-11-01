---
name: update-central-debt
description: Update Indonesia's central-government rupiah debt and related APBN indicators in data/debt.json. Use for Kemenkeu, DJPPR, APBN KiTa, debt-to-GDP, SBN, interest, deficit, tenor, or quarterly government-debt position updates, including Indonesian requests such as "perbarui utang pemerintah". Use this even when the user does not mention the file or skill by name.
---

# Update central-government debt

Add the next officially reported central-government debt position and refresh only those related indicators with newer sourced releases.

Read `AGENTS.md`, then §2, §3a, T1, and §5 of `docs/plans/recurring-quarterly-data-update.md`. Those sections define the authoritative sources and field-by-field rules. When running as part of a full quarterly refresh, the orchestrator handles branching and the final PR.

## Source and cross-check

1. Identify the next missing quarter-end from the end of `debt_series`; do not overwrite or reorder existing points.
2. Find the Kemenkeu APBN KiTa press-conference position for that exact date. Use at least two independent national outlets reporting the same release. Prefer precise official-release reporting over summaries that say only "roughly" or round away published digits.
3. Require exact agreement at the printed precision for both the rupiah position and the two-decimal debt-to-GDP ratio. Record the most complete article as `source_url`. If the release is absent, report "expected but not yet published" and make no edit; if sources disagree, stop as a blocker.
4. Refresh a single-value field only when its own newer source was actually found, and update that field's URL and bilingual period text where applicable. Follow the §3a table; leave legal limits, comparisons, and general sources alone.

## Convert without losing precision

Indonesian source notation uses `.` for thousands and `,` for decimals. Convert the full trillions figure to rupiah by multiplying by 10^12: `Rp10.293,69 triliun` becomes the JSON string `"10293690000000000"`. Both `debt_idr` and `gdp_idr.value` must remain digit strings because they exceed JavaScript's safe-integer range.

Derive GDP from the reported ratio and round to the nearest Rp 1 trillion. Use integer arithmetic rather than floating point for the division. For a ratio printed to two decimals, such as 41.26%, use ratio basis points (`4126`):

```js
const trillion = 1_000_000_000_000n;
const ratio = BigInt(ratioBasisPoints);
const exactGdpNumerator = BigInt(debtIdr) * 10_000n;
const roundedGdp = ((exactGdpNumerator + ratio * trillion / 2n) / (ratio * trillion)) * trillion;
```

Update `gdp_idr._note` and `gdp_idr.source_url` with the new ratio, date, and URL. A lower debt position or an implausible quarter-over-quarter jump indicates a transcription or unit problem; recheck the sources rather than adjusting validators.

## Edit and verify

Append one row to `debt_series` and make only the sourced changes described above. Never hand-edit `public/`; regenerate it with `npm run build`.

Run `npm test && npm run build`, then inspect `public/state.json`: `official_date` must be the new quarter-end. Compare `rate_per_sec` with `main` as described in T1; it should remain within 0.5×–2× of the previous value and within the plan's absolute sanity band. Review the final diff against the sources and ensure every changed value has a current citation.

For a standalone update, follow the recurring plan's branch, `data:` commit, and unmerged-PR requirements. Do not commit partial or unverified figures, push to `main`, or merge the PR.
