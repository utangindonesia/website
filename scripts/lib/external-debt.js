// Pure functions for the external-debt (ULN) quarterly series. No I/O, no
// Date.now() — deterministic and unit-testable, matching debt-math.js.
// Values are USD millions, well within Number's safe integer range, so
// unlike debt-math.js this file uses plain numbers throughout, never BigInt.

const QUARTER_END_DAY = { '03': '31', '06': '30', '09': '30', '12': '31' };
const MAX_QOQ_JUMP_PCT = 25;

/**
 * @param {{date: string, total: number, government: number, central_bank: number, private: number}[]} series
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateExternalSeries(series) {
  const errors = [];
  if (!Array.isArray(series) || series.length < 8) {
    errors.push('series must contain at least 8 entries');
    return { ok: false, errors };
  }

  for (const entry of series) {
    const month = entry.date?.slice(5, 7);
    const day = entry.date?.slice(8, 10);
    if (Number.isNaN(Date.parse(entry.date)) || QUARTER_END_DAY[month] !== day) {
      errors.push(`not a quarter-end date: ${entry.date}`);
    }
    for (const key of ['total', 'government', 'central_bank', 'private']) {
      if (!(entry[key] > 0)) {
        errors.push(`${entry.date}: ${key} must be > 0, got ${entry[key]}`);
      }
    }
    const sum = entry.government + entry.central_bank + entry.private;
    const diffPct = entry.total > 0 ? (Math.abs(sum - entry.total) / entry.total) * 100 : Infinity;
    if (diffPct > 0.5) {
      errors.push(`${entry.date}: government + central_bank + private (${sum}) does not match total (${entry.total}) within 0.5%`);
    }
  }

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    if (!(Date.parse(cur.date) > Date.parse(prev.date))) {
      errors.push(`series dates are not strictly increasing at index ${i} (${prev.date} -> ${cur.date})`);
    }
    if (prev.total > 0) {
      const jumpPct = (Math.abs(cur.total - prev.total) / prev.total) * 100;
      if (jumpPct > MAX_QOQ_JUMP_PCT) {
        errors.push(`${prev.date} -> ${cur.date}: total jumped ${jumpPct.toFixed(1)}% (max ${MAX_QOQ_JUMP_PCT}%)`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {{date: string}[]} series assumed sorted ascending by date
 * @returns {object|undefined} the last entry
 */
export function latestPoint(series) {
  return series[series.length - 1];
}

/**
 * Last entry whose date is <= isoDate.
 * @param {{date: string}[]} series assumed sorted ascending by date
 * @param {string} isoDate
 * @returns {object|undefined}
 */
export function pointAtOrBefore(series, isoDate) {
  const cutoff = Date.parse(isoDate);
  let result;
  for (const entry of series) {
    if (Date.parse(entry.date) <= cutoff) {
      result = entry;
    } else {
      break;
    }
  }
  return result;
}

function change(latest, prior) {
  if (!prior) return null;
  const abs = latest.government - prior.government;
  const pct = Math.round((abs / prior.government) * 1000) / 10;
  return { abs, pct };
}

/**
 * QoQ / YoY / 5-year change in the `government` series, relative to the
 * latest point. yoy and fiveYear are rolling comparisons (4 / 20 quarters
 * before latest), not anchored to any fixed calendar date.
 * @param {{date: string, government: number}[]} series assumed sorted ascending by date
 * @returns {{qoq: {abs:number,pct:number}|null, yoy: {abs:number,pct:number}|null, fiveYear: {abs:number,pct:number}|null}}
 */
export function changes(series) {
  const n = series.length;
  const latest = series[n - 1];
  const qoq = change(latest, series[n - 2]);
  const yoy = change(latest, series[n - 5]);
  const fiveYear = change(latest, series[n - 21]);
  return { qoq, yoy, fiveYear };
}
