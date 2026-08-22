import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectDebt, formatRupiahGroups, staleDays, isStale } from './counter.js';

test('projectDebt matches the documented example shape (16 digits + 5 separators)', () => {
  const baseline = 8_602_000_000_000_000n;
  const baselineTs = Date.parse('2026-06-30T00:00:00Z');
  const now = baselineTs + 1000; // 1 second later
  const result = projectDebt(baseline, baselineTs, 19_500_000, now);
  assert.equal(result, baseline + 19_500_000n);
  assert.equal(result.toString().length, 16);
});

test('projectDebt: no precision loss projecting from a value already beyond MAX_SAFE_INTEGER', () => {
  const baseline = 9_007_199_254_740_995n; // MAX_SAFE_INTEGER + 4
  const baselineTs = 0;
  const now = 10_000; // 10 seconds
  const result = projectDebt(baseline, baselineTs, 19_500_000, now);
  assert.equal(result, baseline + 195_000_000n);
});

test('formatRupiahGroups splits on thousands with trailing dots per group, last group bare', () => {
  const groups = formatRupiahGroups(8_617_234_567_890_123n);
  assert.deepEqual(groups, ['8.', '617.', '234.', '567.', '890.', '123']);
  assert.equal(groups.join(''), '8.617.234.567.890.123');
});

test('formatRupiahGroups handles a small value with a single group', () => {
  assert.deepEqual(formatRupiahGroups(583n), ['583']);
});

test('staleDays/isStale: exactly at the 120-day threshold is not yet stale', () => {
  const officialDate = '2026-01-01';
  const now = Date.parse('2026-01-01T00:00:00Z') + 120 * 86400 * 1000;
  assert.equal(staleDays(officialDate, now), 120);
  assert.equal(isStale(officialDate, now), false);
});

test('staleDays/isStale: 121 days old crosses the threshold', () => {
  const officialDate = '2026-01-01';
  const now = Date.parse('2026-01-01T00:00:00Z') + 121 * 86400 * 1000;
  assert.equal(isStale(officialDate, now), true);
});
