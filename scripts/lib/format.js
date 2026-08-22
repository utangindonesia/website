// Presentation-only pure functions: id-ID number formatting, unit
// abbreviations ("T" for triliun, "mi" for miliar/billion), and the
// inline-block group markup the hero counter needs to wrap without breaking
// mid-group (see design_handoff_utangindonesia/README.md, "Wrapping mechanism").

const ID_FORMATTER = new Intl.NumberFormat('id-ID');
const ID_FORMATTER_1DP = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** @param {bigint|number} value */
export function fmtId(value) {
  return ID_FORMATTER.format(value);
}

/** One decimal place, id-ID comma decimal separator, e.g. 39.4 -> "39,4" */
export function fmtId1dp(value) {
  return ID_FORMATTER_1DP.format(value);
}

/**
 * Splits an id-ID-formatted integer into thousands groups, each (but the
 * last) carrying its trailing "." — for the hero's per-group inline-block spans.
 * @param {bigint} value
 * @returns {string[]}
 */
export function formatRupiahGroups(value) {
  const parts = ID_FORMATTER.format(value).split('.');
  return parts.map((p, i) => (i < parts.length - 1 ? p + '.' : p));
}

/** @param {bigint} value */
export function groupsToHtml(value) {
  return formatRupiahGroups(value)
    .map((g) => `<span>${g}</span>`)
    .join('');
}

/** Rp value (number, safely under 2^53) rendered as "Rp 297,4 T" */
export function formatTriliunIdr(value) {
  return `Rp ${fmtId1dp(value / 1e12)} T`;
}

/** USD value in raw dollars rendered as "USD 205,4 mi" (miliar/billion) */
export function formatUsdBillions(value) {
  return `USD ${fmtId1dp(value / 1e9)} mi`;
}

/** @param {string} isoDate "YYYY-MM-DD" @param {'id'|'en'} lang */
export function humanDate(isoDate, lang) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = lang === 'en' ? MONTHS_EN : MONTHS_ID;
  return lang === 'en' ? `${d} ${months[m - 1]} ${y}` : `${d} ${months[m - 1]} ${y}`;
}
