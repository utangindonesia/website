import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExternalSeries,
  latestPoint,
  pointAtOrBefore,
  changes,
} from './external-debt.js';

function point(date, government, centralBank, priv) {
  return { date, government, central_bank: centralBank, private: priv, total: government + centralBank + priv };
}

function validSeries(n) {
  const series = [];
  for (let i = 0; i < n; i++) {
    const year = 2014 + Math.floor(i / 4);
    const q = i % 4;
    const date = ['03-31', '06-30', '09-30', '12-31'][q];
    series.push(point(`${year}-${date}`, 100000 + i * 1000, 5000, 150000 + i * 500));
  }
  return series;
}

test('validateExternalSeries accepts a well-formed series', () => {
  const { ok, errors } = validateExternalSeries(validSeries(8));
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateExternalSeries rejects fewer than 8 entries', () => {
  const { ok, errors } = validateExternalSeries(validSeries(7));
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('at least 8 entries')));
});

test('validateExternalSeries rejects a non-quarter-end date', () => {
  const series = validSeries(8);
  series[3].date = '2014-05-15';
  const { ok, errors } = validateExternalSeries(series);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('not a quarter-end date: 2014-05-15')));
});

test('validateExternalSeries rejects non-increasing dates', () => {
  const series = validSeries(8);
  [series[2], series[3]] = [series[3], series[2]];
  const { ok, errors } = validateExternalSeries(series);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('strictly increasing')));
});

test('validateExternalSeries rejects a non-positive value', () => {
  const series = validSeries(8);
  series[4].private = 0;
  series[4].total = series[4].government + series[4].central_bank + series[4].private;
  const { ok, errors } = validateExternalSeries(series);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('private must be > 0')));
});

test('validateExternalSeries rejects a component/total mismatch beyond 0.5%', () => {
  const series = validSeries(8);
  series[5].total = series[5].total * 1.1;
  const { ok, errors } = validateExternalSeries(series);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('does not match total')));
});

test('validateExternalSeries rejects a total jump over 25%', () => {
  const series = validSeries(8);
  series[6].government = series[6].government * 3;
  series[6].total = series[6].government + series[6].central_bank + series[6].private;
  const { ok, errors } = validateExternalSeries(series);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('total jumped')));
});

test('latestPoint returns the last entry', () => {
  const series = validSeries(8);
  assert.equal(latestPoint(series), series[series.length - 1]);
});

test('pointAtOrBefore finds the last entry not after the cutoff', () => {
  const series = validSeries(8);
  assert.equal(pointAtOrBefore(series, series[3].date), series[3]);
  assert.equal(pointAtOrBefore(series, '2014-08-01'), series[1]); // between Q2 and Q3 2014
});

test('pointAtOrBefore returns undefined when the cutoff precedes every point', () => {
  const series = validSeries(8);
  assert.equal(pointAtOrBefore(series, '2000-01-01'), undefined);
});

test('changes computes qoq/yoy/fiveYear on a 22-point hand-built series', () => {
  // government values: 100000, 101000, 102000, ..., +1000 per quarter (index i -> 100000 + i*1000)
  const series = validSeries(22);
  const result = changes(series);

  // latest = index 21 -> 121000; qoq vs index 20 -> 120000
  assert.deepEqual(result.qoq, { abs: 1000, pct: 0.8 });
  // yoy vs index 17 (4 quarters earlier) -> 117000
  assert.deepEqual(result.yoy, { abs: 4000, pct: 3.4 });
  // fiveYear vs index 1 (20 quarters earlier) -> 101000
  assert.deepEqual(result.fiveYear, { abs: 20000, pct: 19.8 });
});

test('changes returns null for yoy when fewer than 5 points exist', () => {
  const series = validSeries(4);
  const result = changes(series);
  assert.notEqual(result.qoq, null);
  assert.equal(result.yoy, null);
});

test('changes returns null for fiveYear when fewer than 21 points exist', () => {
  const series = validSeries(8);
  const result = changes(series);
  assert.notEqual(result.qoq, null);
  assert.notEqual(result.yoy, null);
  assert.equal(result.fiveYear, null);
});
