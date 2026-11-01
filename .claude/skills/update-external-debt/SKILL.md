---
name: update-external-debt
description: Update Indonesia's quarterly external-debt/ULN series from Bank Indonesia SULNI Table I.1 in data/external-debt.json. Use whenever the user mentions SULNI, ULN, utang luar negeri, external debt, BI borrower-group data, or refreshing the external-debt chart—even without naming this skill or the data file.
---

# Update external debt (ULN)

Append the next quarter-end position from Bank Indonesia's SULNI publication and update the edition metadata. Keep values in USD millions as ordinary JSON numbers.

Read `AGENTS.md`, then §2, §3b, T2, and §5 of `docs/plans/recurring-quarterly-data-update.md`. The plan is authoritative for release timing, URL naming, validation, and PR requirements. When running as part of a full quarterly refresh, the orchestrator handles branching and the final PR.

## Get the official edition

1. Identify the next missing quarter-end. Find the SULNI edition published two months after that quarter-end: March → May, June → August, September → November, December → February of the following year.
2. Confirm the edition on BI's SULNI listing. If it is not available, report "expected but not yet published" and leave the data unchanged.
3. Download the edition's ZIP and PDF to a session scratch directory, not the repository. BI may reject curl's default user agent; use the HTTP/1.1 browser-user-agent command in T2 when needed. Extract the `_value.xlsx` workbook, not `_growth` or the separate government/private workbooks.

## Read and cross-check Table I.1

Run the bundled zero-dependency reader with the target year and English three-letter month:

```sh
node .claude/skills/update-external-debt/scripts/read-tab.js "<path-to-xlsx>" 2026 Sep
```

The reader selects sheet `TabI.1`, handles BI's year/month headers and provisional asterisks, rounds unrounded cell values to whole USD millions, and prints:

- `1.1 Pemerintah / Government` → `government`
- `1.2 Bank Sentral / Central Bank` → `central_bank`
- `2 Swasta / Private` → `private`
- `TOTAL (1+2)` → `total`

Cross-check all four values exactly against the same edition's PDF Table I.1 (`pdftotext -layout` is suitable). If both official formats cannot be read or disagree, stop without guessing. If the workbook layout changes, fix or extend the reader based on the actual XML; never transcribe from memory or a screenshot.

Also check the previously stored quarter against the new edition because BI revises historical values. Update that prior row only when the official source changed, and call the revision out explicitly in the PR.

## Edit and verify

Append the row in ascending order and update `edition`, `edition_en`, `source_url`, and only the workbook filename inside `_note`; preserve the rest of the note. Do not convert USD millions to billions or rupiah, and do not reconcile SULNI government debt against DJPPR's foreign-currency share—they measure different things.

Before building, check the component sum within 0.5% of total and the plan's quarter-over-quarter sanity limits. Run `npm test && npm run build`, confirm the new last row in `public/external-debt.json`, and review the ULN section in both languages. Never hand-edit generated output or relax validators.

For a standalone update, follow the recurring plan's branch, `data:` commit, and unmerged-PR requirements. Do not commit partial or unverified figures, push to `main`, or merge the PR.
