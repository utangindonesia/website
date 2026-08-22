// Pure functions for debt-figure math. No I/O, no Date.now() — every function
// takes "now" as an argument so it stays deterministic and unit-testable.
// Large rupiah figures (central government debt, GDP) already exceed or are
// about to exceed Number.MAX_SAFE_INTEGER (2^53 - 1 ~= 9.007e15), so they are
// carried as BigInt end-to-end and only ever touch floating point for small,
// safely-sized quantities (rates, percentages, day counts).

export const SECONDS_PER_DAY = 86400;
export const MS_PER_DAY = SECONDS_PER_DAY * 1000;
export const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;

// Generous ceiling for sanity-checking the derived per-second growth rate.
// Real-world growth is on the order of Rp 15-30 million/sec; anything above
// this points at a data-entry error (wrong units, misplaced digit) in
// data/debt.json rather than a genuine market move.
export const MAX_RATE_PER_SEC = 200_000_000;

// A release older than this makes the page show the stale-data badge. Kemenkeu
// has reported the debt position quarterly (not monthly) since October 2025,
// with each release landing 5-7 weeks after quarter-end — so a new release is
// typically ~130-140 days after the previous one. 120 days gives a couple of
// weeks' buffer before flagging a release as overdue, rather than firing for
// most of every quarter's normal life (a monthly-cadence 45-day threshold would).
export const STALE_DAYS_THRESHOLD = 120;

/**
 * @param {{date: string, debt_idr: string}[]} series sorted or unsorted, ISO date strings
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateDebtSeries(series) {
  const errors = [];
  if (!Array.isArray(series) || series.length < 2) {
    errors.push('debt_series must contain at least 2 entries');
    return { ok: false, errors };
  }
  for (const entry of series) {
    if (typeof entry.debt_idr !== 'string' || !/^\d+$/.test(entry.debt_idr)) {
      errors.push(`debt_idr must be a string of digits, got: ${JSON.stringify(entry.debt_idr)}`);
    }
    if (Number.isNaN(Date.parse(entry.date))) {
      errors.push(`invalid date: ${entry.date}`);
    }
  }
  for (let i = 1; i < series.length; i++) {
    const prev = Date.parse(series[i - 1].date);
    const cur = Date.parse(series[i].date);
    if (!(cur > prev)) {
      errors.push(`debt_series dates are not strictly increasing at index ${i} (${series[i - 1].date} -> ${series[i].date})`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Average daily growth over the last 2-3 release-to-release deltas, converted to a
 * per-second rate. Series must already have passed validateDebtSeries.
 * @param {{date: string, debt_idr: string}[]} series
 * @returns {{baseline: bigint, baselineTs: number, ratePerSec: number, officialDate: string}}
 */
export function computeRate(series) {
  const sorted = [...series].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const tail = sorted.slice(-3); // up to 3 points -> up to 2 deltas
  const dailyRates = [];
  for (let i = 1; i < tail.length; i++) {
    const prev = tail[i - 1];
    const cur = tail[i];
    const deltaRupiah = BigInt(cur.debt_idr) - BigInt(prev.debt_idr);
    const deltaDays = (Date.parse(cur.date) - Date.parse(prev.date)) / MS_PER_DAY;
    dailyRates.push(Number(deltaRupiah) / deltaDays);
  }
  const avgDailyRate = dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length;
  const latest = tail[tail.length - 1];
  return {
    baseline: BigInt(latest.debt_idr),
    baselineTs: Date.parse(latest.date),
    ratePerSec: avgDailyRate / SECONDS_PER_DAY,
    officialDate: latest.date,
  };
}

/**
 * Sanity-check a computed rate. Returns failure reasons; empty array = pass.
 * @param {number} ratePerSec
 * @returns {string[]}
 */
export function checkRateSanity(ratePerSec) {
  const errors = [];
  if (ratePerSec < 0) errors.push(`rate_per_sec is negative (${ratePerSec}): debt appears to have decreased`);
  if (ratePerSec > MAX_RATE_PER_SEC) errors.push(`rate_per_sec (${ratePerSec}) exceeds sanity ceiling (${MAX_RATE_PER_SEC}); check data/debt.json for a units/typo error`);
  return errors;
}

/**
 * Precision-safe projection: baseline (BigInt) advanced by ratePerSec (float,
 * always small enough to be exact in a double) over the elapsed time between
 * baselineTs and now. The float-derived increment is rounded to an integer
 * rupiah amount and only then folded into BigInt arithmetic, so the result is
 * exact regardless of how large `baseline` grows.
 * @param {bigint} baseline
 * @param {number} baselineTs ms epoch
 * @param {number} ratePerSec rupiah/sec
 * @param {number} now ms epoch
 * @returns {bigint}
 */
export function projectDebt(baseline, baselineTs, ratePerSec, now) {
  const elapsedSec = Math.max(0, (now - baselineTs) / 1000);
  const increment = Math.floor(ratePerSec * elapsedSec);
  return baseline + BigInt(increment);
}

/**
 * @param {bigint} debtValue
 * @param {number} population
 * @returns {bigint} integer rupiah, truncated
 */
export function perCapita(debtValue, population) {
  return debtValue / BigInt(Math.round(population));
}

/**
 * Debt-to-GDP ratio as a percentage, computed via scaled BigInt division to
 * avoid precision loss when both operands exceed 2^53.
 * @param {bigint} debtValue
 * @param {bigint} gdpValue
 * @returns {number} percentage with 2 decimal places
 */
export function debtToGdpPct(debtValue, gdpValue) {
  const scaled = (debtValue * 10000n) / gdpValue;
  return Number(scaled) / 100;
}

/**
 * @param {number} interestAnnualIdr full-year APBN interest ceiling
 * @returns {number} rupiah/sec
 */
export function interestRatePerSec(interestAnnualIdr) {
  return interestAnnualIdr / SECONDS_PER_YEAR;
}

/**
 * @param {string} officialDate ISO date string
 * @param {number} now ms epoch
 * @returns {number} whole days old, floor
 */
export function staleDays(officialDate, now) {
  return Math.floor((now - Date.parse(officialDate)) / MS_PER_DAY);
}

export function isStale(officialDate, now) {
  return staleDays(officialDate, now) > STALE_DAYS_THRESHOLD;
}
