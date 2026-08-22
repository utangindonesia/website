export const MS_PER_DAY = 86400 * 1000;
export const STALE_DAYS_THRESHOLD = 120;
const GROUP_FORMATTER = new Intl.NumberFormat('id-ID');
export function projectDebt(baseline, baselineTs, ratePerSec, now) {
const elapsedSec = Math.max(0, (now - baselineTs) / 1000);
const increment = Math.floor(ratePerSec * elapsedSec);
return baseline + BigInt(increment);
}
export function formatRupiahGroups(value) {
const parts = GROUP_FORMATTER.format(value).split('.');
return parts.map((p, i) => (i < parts.length - 1 ? p + '.' : p));
}
export function staleDays(officialDate, now) {
return Math.floor((now - Date.parse(officialDate)) / MS_PER_DAY);
}
export function isStale(officialDate, now) {
return staleDays(officialDate, now) > STALE_DAYS_THRESHOLD;
}