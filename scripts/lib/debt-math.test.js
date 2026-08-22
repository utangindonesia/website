import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDebtSeries,
  computeRate,
  checkRateSanity,
  projectDebt,
  perCapita,
  debtToGdpPct,
  interestRatePerSec,
  staleDays,
  isStale,
  MAX_RATE_PER_SEC,
} from './debt-math.js';

test('validateDebtSeries accepts a well-formed increasing series', () => {
  const { ok, errors } = validateDebtSeries([
    { date: '2026-04-30', debt_idr: '8500000000000000' },
    { date: '2026-05-31', debt_idr: '8551000000000000' },
    { date: '2026-06-30', debt_idr: '8602000000000000' },
  ]);
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateDebtSeries rejects non-monotonic dates', () => {
  const { ok, errors } = validateDebtSeries([
    { date: '2026-05-31', debt_idr: '8551000000000000' },
    { date: '2026-04-30', debt_idr: '8500000000000000' },
  ]);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('strictly increasing')));
});

test('validateDebtSeries rejects non-digit debt_idr', () => {
  const { ok, errors } = validateDebtSeries([
    { date: '2026-04-30', debt_idr: '8500000000000000' },
    { date: '2026-05-31', debt_idr: '8.551e15' },
  ]);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('debt_idr must be a string of digits')));
});

test('validateDebtSeries rejects fewer than 2 entries', () => {
  const { ok, errors } = validateDebtSeries([{ date: '2026-06-30', debt_idr: '8602000000000000' }]);
  assert.equal(ok, false);
  assert.ok(errors.length > 0);
});

test('computeRate averages the last two monthly deltas', () => {
  const { baseline, ratePerSec, officialDate } = computeRate([
    { date: '2026-04-30', debt_idr: '8500000000000000' },
    { date: '2026-05-31', debt_idr: '8551000000000000' }, // +51T over 31 days
    { date: '2026-06-30', debt_idr: '8602000000000000' }, // +51T over 30 days
  ]);
  assert.equal(baseline, 8602000000000000n);
  assert.equal(officialDate, '2026-06-30');
  // both monthly deltas are ~51T; per-second rate should be in a tight, sane band
  assert.ok(ratePerSec > 19_000_000 && ratePerSec < 20_000_000, `unexpected rate: ${ratePerSec}`);
});

test('computeRate sorts out-of-order input by date', () => {
  const a = computeRate([
    { date: '2026-06-30', debt_idr: '8602000000000000' },
    { date: '2026-04-30', debt_idr: '8500000000000000' },
    { date: '2026-05-31', debt_idr: '8551000000000000' },
  ]);
  const b = computeRate([
    { date: '2026-04-30', debt_idr: '8500000000000000' },
    { date: '2026-05-31', debt_idr: '8551000000000000' },
    { date: '2026-06-30', debt_idr: '8602000000000000' },
  ]);
  assert.equal(a.baseline, b.baseline);
  assert.equal(a.ratePerSec, b.ratePerSec);
});

test('checkRateSanity flags a negative rate', () => {
  const errors = checkRateSanity(-100);
  assert.ok(errors.some((e) => e.includes('negative')));
});

test('checkRateSanity flags a rate above the sanity ceiling', () => {
  const errors = checkRateSanity(MAX_RATE_PER_SEC + 1);
  assert.ok(errors.some((e) => e.includes('exceeds sanity ceiling')));
});

test('checkRateSanity passes a realistic rate', () => {
  assert.deepEqual(checkRateSanity(19_500_000), []);
});

test('projectDebt: zero elapsed time returns baseline exactly', () => {
  const baseline = 8602000000000000n;
  const now = Date.parse('2026-06-30T00:00:00Z');
  assert.equal(projectDebt(baseline, now, 19_500_000, now), baseline);
});

test('projectDebt: no precision loss at 1e16 scale after a year of ticking', () => {
  // Baseline chosen just above Number.MAX_SAFE_INTEGER (2^53 - 1 = 9007199254740991)
  // to prove BigInt carries the value exactly where a Number would round.
  const baseline = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2, deliberately unsafe as a Number
  const baselineTs = Date.parse('2026-01-01T00:00:00Z');
  const ratePerSec = 19_500_000;
  const oneYearLaterMs = baselineTs + 365 * 86400 * 1000;

  const result = projectDebt(baseline, baselineTs, ratePerSec, oneYearLaterMs);
  const expectedIncrement = BigInt(Math.floor(ratePerSec * 365 * 86400));
  const expected = baseline + expectedIncrement;

  assert.equal(result, expected);
  assert.equal(typeof result, 'bigint');
  // Sanity: the naive float path really would have lost precision here —
  // round-tripping baseline through Number and back does NOT reproduce it,
  // because doubles cannot represent every integer at this magnitude.
  assert.notEqual(BigInt(Number(baseline)), baseline);
});

test('projectDebt: elapsed time never produces a value lower than baseline', () => {
  const baseline = 8602000000000000n;
  const baselineTs = Date.parse('2026-06-30T00:00:00Z');
  const later = baselineTs + 86400 * 1000;
  const result = projectDebt(baseline, baselineTs, 19_500_000, later);
  assert.ok(result >= baseline);
});

test('perCapita divides a BigInt total by population', () => {
  const result = perCapita(8_617_234_567_890_123n, 283_100_000);
  assert.equal(result, 8_617_234_567_890_123n / 283_100_000n);
  assert.ok(result > 30_000_000n && result < 31_000_000n);
});

test('debtToGdpPct computes a percentage from two BigInt values beyond 2^53', () => {
  const debt = 8_602_000_000_000_000n;
  const gdp = 21_827_000_000_000_000n; // ~Rp 21.8 quadrillion, already > 2^53
  const pct = debtToGdpPct(debt, gdp);
  assert.ok(pct > 39 && pct < 40, `unexpected pct: ${pct}`);
});

test('interestRatePerSec divides the annual ceiling by seconds in a year', () => {
  const rate = interestRatePerSec(583_200_000_000_000);
  assert.ok(Math.abs(rate - 583_200_000_000_000 / 31_536_000) < 1e-6);
});

test('staleDays and isStale respect the 120-day threshold', () => {
  const officialDate = '2026-06-30';
  const now100 = Date.parse('2026-06-30T00:00:00Z') + 100 * 86400 * 1000;
  const now121 = Date.parse('2026-06-30T00:00:00Z') + 121 * 86400 * 1000;

  assert.equal(staleDays(officialDate, now100), 100);
  assert.equal(isStale(officialDate, now100), false);

  assert.equal(staleDays(officialDate, now121), 121);
  assert.equal(isStale(officialDate, now121), true);
});
