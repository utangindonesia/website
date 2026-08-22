# Design Brief — External debt (ULN) history cell (for Claude Design)

Addendum to `design_handoff_utangindonesia/design-brief.md`. Same site, same tone, one new element.
Run on an Opus-tier model; short session. Export via Handoff to Claude Code into the existing bundle.

## Context
utangindonesia.org is a single dark page: hero debt counter → "Utang" card grid (6) → "Konteks" card
grid (3) → "Bagikan" → methodology + FAQ. Read the existing handoff README first — its tokens,
type scale, 1px-gap grid, and "Sumber →" link are **fixed**. This brief adds one section between
"Konteks" and "Bagikan". Nothing else on the page changes.

## What to design
A new section titled **"Utang luar negeri"** containing **one full-width cell** that shows
Indonesia's quarterly external-debt position (Bank Indonesia, SULNI) from 2014 to the latest quarter.
It must read as *a card that happens to be wide*, not a dashboard widget.

**All copy strings are defined in the plan, §3b** (`2026-08-external-debt-history.md`) — use them
verbatim in the artboards; if a string must change for the design to work, change it *there* and say
so in the README addendum. Precedence: your artboard > this brief > the plan for visuals; the plan for
everything else.

Cell contents, top to bottom:
1. Label (existing card-label style): plan §3b "card label"
2. Value (existing card-value style): e.g. "USD 216,3 mi" + the value date in small mono ("30 Juni 2026")
3. **Line chart**, ~50 quarter-end points, two series:
   - Pemerintah (government, incl. SBN held by non-residents) — accent red, 2px
   - Total nasional (government + BI + private) — neutral grey, 1.5px
   Y axis starts at 0, USD billions, 4–5 hairline gridlines; X labels one per year.
   Last point of each line: small dot + value label in mono.
4. Legend: two text swatches, mono 12px, no icons.
5. **Delta strip** — three chips, labels from §3b (delta 1–3), e.g. "vs triwulan lalu +USD 4,2 mi (+2,0%)".
   This is the part most readers will actually use; make it scannable.
6. Note (existing style): §3b "note", e.g. "Termasuk SBN yang dipegang nonresiden · SULNI Agustus 2026"
7. "Sumber →" pinned to the bottom, as in every card.

Illustrative numbers: government 2014 ≈ 124 bn → 2026 ≈ 216 bn; total 2014 ≈ 293 bn → 2026 ≈ 453 bn.
Plot plausible gently-rising curves with a visible 2020 bump; values are placeholders.

## Constraints (hard)
- **Static SVG, no JS.** It ships as build-time inline SVG styled by CSS classes. No hover
  tooltips, zoom, toggles, or animation. Hover may show a native `<title>` on a point — that's all.
- Budget: the SVG must stay ≲ 8 KB; no gradients, filters, shadows, or area fills.
- Colours: only existing tokens. Accent red for the government line and the Sumber link; neutral grey
  for the total line; hairline `--line-soft` for gridlines; `--dim` for axis text. **Do not** use red
  or green to signal "debt went up/down" — the brief's tone is credible, not alarmist.
- Type: IBM Plex Mono for every number, tabular-nums; axis text 11px; labels uppercase 12px per README.
- Mobile 375px: chart ≈ 340px wide, show every other year label, legend wraps under the chart,
  delta chips stack one per row, zero horizontal scroll.
- Numbers in Indonesian format (`216,3`, `1.234`). Design the ID version; EN strings are in §3b's EN
  column — check the longest of the two languages fits each slot.

## Explore (briefly, then choose)
- Chart height: 280 vs 360px at desktop (plan default 360) — which keeps the page rhythm?
- Delta chips: above vs below the chart; inline row vs a small 3-column mini-grid using the 1px-gap language.
- Whether the last-point value label is enough, or the card-value at top is redundant with it.

## States to show
1. Desktop 1140px, normal.
2. Mobile 375px.
3. No-JS — should look identical (prove the design needs nothing dynamic).
4. Stale variant (latest quarter > 150 days old, matching the plan's `ULN_STALE_BADGE`) — reuse the
   existing amber badge next to the value date, don't invent a new one.

## Deliverable
One artboard per state, added to the existing `Utang Indonesia.dc.html` bundle (or a sibling file),
plus a short README addendum listing the exact sizes/tokens used **and any §3b string or visual
default you changed**, so a cheaper model can recreate it
faithfully in `templates/*.html` + `public/style.css` (task T3 in `docs/plans/2026-08-external-debt-history.md`).
