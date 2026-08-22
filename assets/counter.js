// Pure, dependency-free counter math for the browser. Deliberately mirrors
// (but does not import — this file ships standalone to the browser, outside
// the Node-only scripts/ directory) the precision approach in
// scripts/lib/debt-math.js: large rupiah totals stay BigInt end-to-end and
// only ever pass through a float for the small per-tick increment, so a
// value near or above Number.MAX_SAFE_INTEGER never loses precision.

export const MS_PER_DAY = 86400 * 1000;
// Kept in sync with scripts/lib/debt-math.js — see its comment for why 120
// (Kemenkeu's debt position release is quarterly, not monthly, since Oct 2025).
export const STALE_DAYS_THRESHOLD = 120;

const GROUP_FORMATTER = new Intl.NumberFormat('id-ID');

/**
 * @param {bigint} baseline exact rupiah value as of baselineTs
 * @param {number} baselineTs ms epoch
 * @param {number} ratePerSec rupiah/sec (small float, safe in a double)
 * @param {number} now ms epoch
 * @returns {bigint}
 */
export function projectDebt(baseline, baselineTs, ratePerSec, now) {
  const elapsedSec = Math.max(0, (now - baselineTs) / 1000);
  const increment = Math.floor(ratePerSec * elapsedSec);
  return baseline + BigInt(increment);
}

/**
 * Formats a BigInt rupiah value with id-ID thousands separators, then splits
 * it into groups so each (except the last) carries its trailing "." — this
 * lets the caller wrap each group in an inline-block span, so a line break
 * can only happen between groups, never mid-group (see style.css .counter-number).
 * @param {bigint} value
 * @returns {string[]}
 */
export function formatRupiahGroups(value) {
  const parts = GROUP_FORMATTER.format(value).split('.');
  return parts.map((p, i) => (i < parts.length - 1 ? p + '.' : p));
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
