---
name: quarterly-data-update
description: Refresh this site's official quarterly debt content and open a review PR. Use whenever the user asks for a quarterly data/content update, a debt-clock refresh, or mentions new APBN KiTa, DJPPR, Kemenkeu, SULNI, or Bank Indonesia figures—even if they only say "update utang" or "refresh the site data". For just one source, also see update-central-debt or update-external-debt.
---

# Quarterly data update

Bring `data/debt.json` and `data/external-debt.json` to the newest officially published quarter, verify the built site, and leave an unmerged pull request for human review.

Read `AGENTS.md` and all of `docs/plans/recurring-quarterly-data-update.md` first. The plan is the canonical reference for due-date rules, sources, field mappings, cross-checks, and the PR template. Do not edit or tick off that recurring plan.

## Workflow

1. Inspect `git status` before changing anything. Preserve unrelated work; if existing changes overlap the data or generated files, stop and ask how to proceed.
2. Run T0 from the recurring plan using the current date and the last dates stored in the two data files. Report a concrete due/not-due verdict for each source.
   - DJPPR becomes due 35 days after the next quarter-end.
   - SULNI becomes due 45 days after the next quarter-end.
   - If neither is due, stop without creating a branch, commit, issue, or PR.
3. Create the plan's `data/<yyyy>-q<n>` branch from an up-to-date `main`. If a cycle was missed, add missing quarters oldest first rather than jumping straight to the newest.
4. For each due source, follow its focused skill:
   - `.claude/skills/update-central-debt/SKILL.md`
   - `.claude/skills/update-external-debt/SKILL.md`
   An expected release that is not published yet is not a data error: leave that source unchanged, record why, and continue with the other source.
5. Run the T3 verification pass. `npm test && npm run build` must pass; only source data and regenerated `public/` output may change. Preview both languages and check the hero date/staleness state and ULN quarter/edition.
6. Create one commit per completed source update using the plan's `data:` prefixes. Push the branch and open an unmerged PR with T4's fully populated body: every changed field, old/new values, sources, cross-checks, skipped fields, and task log. Never push directly to `main` or merge the PR.

## Data safety

Use published figures only. Never estimate, interpolate, infer a missing release, or resolve disagreeing sources by picking one. Keep large rupiah values as digit strings, SULNI values as USD-million numbers, and all validators unchanged. Do not hand-edit generated output or broaden the update into code, template, asset, CI, or dependency work.

If exact source cross-checks fail or the official files cannot be read, stop that source's update without committing partial data. Follow the recurring plan's blocker procedure rather than shipping a best guess.
