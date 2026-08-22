// Build-time SVG line chart for the external-debt (ULN) section. Pure
// function, no I/O, no Date.now() — matches debt-math.js/external-debt.js.
// Values in `series` are USD millions; the chart itself always displays USD
// billions (divide by 1000), per the design handoff's axis unit.
import { fmt1dp, humanDate } from './format.js';

// Layout constants reproduce design_handoff_utangindonesia/ULNCell.dc.html
// exactly (viewBox, plot area, baseline/top y) — see the plan's
// ## Reconciliation section for why these are two fixed variants rather than
// one responsive SVG.
const LAYOUT = {
  wide: { viewBox: '0 0 1096 280', plotXStart: 46, plotXEnd: 1088, baselineY: 244, topY: 10, xLabelY: 264, yLabelX: 36 },
  narrow: { viewBox: '0 0 320 210', plotXStart: 26, plotXEnd: 314, baselineY: 168, topY: 8, xLabelY: 188, yLabelX: 20 },
};

const TARGET_TICKS = 5;

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Smallest "nice" (1/2/5 x 10^n) axis max at or above dataMax, split into
 * ~TARGET_TICKS even steps.
 * @param {number} dataMax
 * @returns {{max: number, step: number, tickCount: number}}
 */
export function niceAxisMax(dataMax) {
  if (dataMax <= 0) return { max: TARGET_TICKS, step: 1, tickCount: TARGET_TICKS };
  const rawStep = dataMax / TARGET_TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  let niceResidual;
  if (residual <= 1) niceResidual = 1;
  else if (residual <= 2) niceResidual = 2;
  else if (residual <= 5) niceResidual = 5;
  else niceResidual = 10;
  const step = niceResidual * magnitude;
  const max = Math.ceil(dataMax / step) * step;
  return { max, step, tickCount: Math.round(max / step) };
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function usdLabel(valueMillion, lang) {
  const bn = fmt1dp(valueMillion / 1000, lang);
  return lang === 'en' ? `USD ${bn} bn` : `USD ${bn} mi`;
}

/**
 * Colors come entirely from CSS via `currentColor`: `className` sets the
 * line/dot color (`color: var(--accent)` etc.), `labelClassName` sets the
 * last-point value label's color, which the design handoff makes distinct
 * from the line for legibility (`--accent-hover` / `--text-answer`).
 * @param {object} opts
 * @param {{date:string,[field:string]:number}[]} opts.series sorted ascending by date, USD millions
 * @param {{field:string,className:string,labelClassName:string,label:string,strokeWidth:number}[]} opts.keys lines to plot
 * @param {'wide'|'narrow'} opts.variant
 * @param {'id'|'en'} opts.lang
 * @param {string} opts.ariaLabel already-localized, already-parameterized
 * @returns {string} SVG markup
 */
export function renderLineChart({ series, keys, variant, lang, ariaLabel }) {
  const layout = LAYOUT[variant];
  const n = series.length;
  const dataMaxBn = Math.max(...keys.map((k) => Math.max(...series.map((p) => p[k.field])))) / 1000;
  const { max, step, tickCount } = niceAxisMax(dataMaxBn);

  const xAt = (i) => round1(layout.plotXStart + (i * (layout.plotXEnd - layout.plotXStart)) / (n - 1));
  const yAt = (valueMillion) => round1(layout.baselineY - ((valueMillion / 1000) / max) * (layout.baselineY - layout.topY));

  const gridLines = [];
  const yLabels = [];
  for (let t = 0; t <= tickCount; t++) {
    const y = round1(layout.baselineY - (t * (layout.baselineY - layout.topY)) / tickCount);
    if (t === 0) {
      gridLines.push(`<line x1="${layout.plotXStart}" y1="${y}" x2="${layout.plotXEnd}" y2="${y}" stroke="var(--line-strong)" stroke-width="1"/>`);
    } else {
      gridLines.push(`<line x1="${layout.plotXStart}" y1="${y}" x2="${layout.plotXEnd}" y2="${y}" stroke="var(--line-soft)" stroke-width="1"/>`);
    }
    const showLabel = variant === 'wide' || t % 2 === 0;
    if (showLabel) {
      yLabels.push(`<text x="${layout.yLabelX}" y="${round1(y + 4)}">${t * step}</text>`);
    }
  }

  let yearMarks = [];
  let lastYear = null;
  series.forEach((p, i) => {
    const year = p.date.slice(0, 4);
    if (year !== lastYear) {
      yearMarks.push({ x: xAt(i), year });
      lastYear = year;
    }
  });
  // Narrow shows every other year (design handoff); a first/last calendar
  // year covered by only 1-2 quarters (this edition's 2014 has only Q4) can
  // still sit closer to its neighbor than a full year-gap would, so thin
  // again below, regardless of variant, always keeping both ends.
  if (variant === 'narrow') yearMarks = yearMarks.filter((_, idx) => idx % 2 === 0 || idx === yearMarks.length - 1);

  // Anchors are fixed by each mark's position in the (pre-thinning) list —
  // only the true first/last labels ever get 'start'/'end' — so extents can
  // be computed before deciding which marks survive thinning.
  const CHAR_WIDTH = 6.6; // approx IBM Plex Mono width at font-size 11
  const LABEL_GAP = 4; // minimum breathing room between adjacent label edges
  const withExtent = yearMarks.map((mark, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === yearMarks.length - 1;
    const anchor = isFirst ? 'start' : (isLast && variant === 'narrow' ? 'end' : 'middle');
    const w = mark.year.length * CHAR_WIDTH;
    const left = anchor === 'start' ? mark.x : anchor === 'end' ? mark.x - w : mark.x - w / 2;
    const right = left + w;
    return { ...mark, anchor, left, right };
  });

  // Both variants render year labels at the same font-size (11), so overlap
  // math is identical regardless of the narrower viewBox's tighter space.
  const thinned = [];
  withExtent.forEach((mark, idx) => {
    const isLast = idx === withExtent.length - 1;
    const lastKept = thinned[thinned.length - 1];
    if (!lastKept || isLast || mark.left >= lastKept.right + LABEL_GAP) thinned.push(mark);
  });
  yearMarks = thinned;

  const xLabels = yearMarks.map((mark) => {
    return `<text x="${mark.x}" y="${layout.xLabelY}" text-anchor="${mark.anchor}">${mark.year}</text>`;
  });

  const lines = keys.map((k) => {
    const points = series.map((p, i) => `${xAt(i)},${yAt(p[k.field])}`).join(' ');
    const last = series[n - 1];
    const title = escapeXml(`${k.label} — ${usdLabel(last[k.field], lang)} (${humanDate(last.date, lang)})`);
    return `<polyline fill="none" stroke="currentColor" class="${k.className}" stroke-width="${k.strokeWidth}" stroke-linejoin="round" points="${points}"><title>${title}</title></polyline>`;
  });

  const lastMarkers = keys.map((k) => {
    const last = series[n - 1];
    const cx = xAt(n - 1);
    const cy = yAt(last[k.field]);
    const label = fmt1dp(last[k.field] / 1000, lang);
    return `<circle cx="${cx}" cy="${cy}" r="2.5" fill="currentColor" class="${k.className}"/><text x="${round1(cx - 8)}" y="${round1(cy - 8)}" font-size="11" text-anchor="end" fill="currentColor" class="${k.labelClassName}">${label}</text>`;
  });

  return `<svg viewBox="${layout.viewBox}" width="100%" height="auto" role="img" aria-label="${escapeXml(ariaLabel)}" style="display:block;overflow:visible" class="chart-svg"><g fill="none">${gridLines.join('')}</g><g class="chart-axis-y" text-anchor="end" font-size="11">${yLabels.join('')}</g><g class="chart-axis-x" text-anchor="middle" font-size="11">${xLabels.join('')}</g>${lines.join('')}${lastMarkers.join('')}</svg>`;
}
