---
name: execute-plan
description: Execute an iteration/epic plan from docs/plans/*.md task by task — for running a pre-written plan with a cost-efficient model. Use when the user says "execute the plan", "run the plan", "/execute-plan <path>", or points at a file in docs/plans/.
---

# Execute a plan

You are executing a plan that a stronger model (or the owner) already wrote. Your job is faithful,
verified execution — not re-planning. Argument: the plan path (default: the newest file in
`docs/plans/`).

## Procedure

1. Read `CLAUDE.md`, then the whole plan. Restate in 3–5 lines: goal, non-goals, the decisions
   table (§2) as you understand them. If a decision is marked "owner decision needed" and has no
   default, stop and ask; if it has a default, proceed with the default.
2. **Harmony check.** If the plan has companion documents (a `*.design-brief.md` next to it, an
   artboard/README addendum in the design handoff bundle), read them all and compare: copy strings,
   section placement, sizes, states, token names. List every contradiction under a
   `## Reconciliation` heading in the plan file and resolve each using the precedence the plan
   states (default: artboard/handoff addendum > brief > plan for visuals; plan for data, code, and
   copy). Edit the losing document so the three agree, commit as `docs(plan): reconcile`, and only
   then proceed. Zero contradictions is a valid result — still write the heading with "none".
3. Create the branch named in the plan's "Definition of done" (or `feat/<plan-slug>`).
4. Work tasks **in order** (T1, T2, …). For each task:
   - Do only that task's checkboxes. Tick them in the plan file as you complete them
     (`- [x]`) — the plan file is the progress log and is committed with each task.
   - Run the task's acceptance checks *and* `npm test && npm run build`. Paste real output in
     your progress message; never claim green without running.
   - Commit with the prefix the task specifies. One commit per task.
5. If a step is impossible as written (missing data, failing external source, contradiction with
   CLAUDE.md), do **not** improvise around it: finish the parts that don't depend on it, write what
   blocked you under a `## Blockers` heading at the end of the plan file, commit, and stop.
6. When every task is done, run the plan's "Definition of done" list as a checklist and report
   each line as pass/fail with evidence.

## Rules

- The plan's §5 ("things a cheaper model gets wrong") overrides your instincts. Re-read it before
  each task.
- Scope is the plan. No refactors, renames, dependency additions, or style changes outside it —
  even if they look like improvements. Note them under `## Follow-ups` in the plan instead.
- Generated files (`public/index.html`, `public/en/index.html`, `public/state.json`,
  `public/sitemap.xml`, `public/robots.txt`, and any the plan adds) are never hand-edited.
- Numbers from external sources are transcribed, cross-checked against a second figure named in the
  plan, and cited with a URL in the data file. Never estimate a data value.
- Keep the anonymity rule: no names, emails, or local paths in code, commits, or the plan file.
- Prefer small, reversible steps; if `npm run build` fails, fix the cause — never relax a sanity
  check to make it pass.

## Writing a new plan (for the planning model)

Plans live in `docs/plans/YYYY-MM-<slug>.md` and follow the structure of the existing ones:
Goal · Decisions table with defaults · Data model · Numbered tasks with checkboxes, commit prefix
and acceptance criteria · "Things a cheaper model gets wrong" · Definition of done. Every task must
be completable without judgement calls the plan didn't already make.

When a plan has a design brief, keep them in harmony by construction: every user-visible string and
every shared visual default lives in **one table in the plan** (see §3b of the external-debt plan);
the brief references that table and never restates it; both documents name the same precedence rule.
Re-run the harmony check above before committing any edit to either file.
