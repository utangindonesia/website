import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderLineChart, niceAxisMax } from './chart.js';

const KEYS = [
  { field: 'government', className: 'chart-line--government', labelClassName: 'chart-label--government', label: 'Pemerintah', strokeWidth: 2 },
  { field: 'total', className: 'chart-line--total', labelClassName: 'chart-label--total', label: 'Total nasional', strokeWidth: 1.5 },
];

function synthSeries(n) {
  const series = [];
  for (let i = 0; i < n; i++) {
    const year = 2014 + Math.floor(i / 4);
    const q = ['03-31', '06-30', '09-30', '12-31'][i % 4];
    series.push({ date: `${year}-${q}`, government: 100000 + i * 1000, total: 250000 + i * 2000 });
  }
  return series;
}

test('niceAxisMax picks the smallest 1/2/5x10^n max at or above dataMax', () => {
  assert.deepEqual(niceAxisMax(453.369), { max: 500, step: 100, tickCount: 5 });
  assert.deepEqual(niceAxisMax(0), { max: 5, step: 1, tickCount: 5 });
});

test('scale math: 0 maps to the baseline y, the nice max maps to the top y (wide)', () => {
  const series = [
    { date: '2020-03-31', government: 0 },
    { date: '2020-06-30', government: 500000 }, // 500 bn -> niceAxisMax(500) = {max:500}
  ];
  const svg = renderLineChart({
    series,
    keys: [KEYS[0]],
    variant: 'wide',
    lang: 'id',
    ariaLabel: 'test',
  });
  assert.ok(svg.includes('points="46,244 1088,10"'), svg);
});

test('scale math: 0 maps to the baseline y, the nice max maps to the top y (narrow)', () => {
  const series = [
    { date: '2020-03-31', government: 0 },
    { date: '2020-06-30', government: 500000 },
  ];
  const svg = renderLineChart({
    series,
    keys: [KEYS[0]],
    variant: 'narrow',
    lang: 'id',
    ariaLabel: 'test',
  });
  assert.ok(svg.includes('points="26,168 314,8"'), svg);
});

test('polyline has exactly N points for an N-point series', () => {
  const series = synthSeries(12);
  const svg = renderLineChart({ series, keys: KEYS, variant: 'wide', lang: 'id', ariaLabel: 'test' });
  const matches = [...svg.matchAll(/points="([^"]+)"/g)];
  assert.equal(matches.length, KEYS.length);
  for (const m of matches) {
    const points = m[1].trim().split(/\s+/);
    assert.equal(points.length, 12);
  }
});

test('both variants combined stay under 8KB for a 50-point series', () => {
  const series = synthSeries(50);
  const wide = renderLineChart({ series, keys: KEYS, variant: 'wide', lang: 'id', ariaLabel: 'Grafik garis posisi utang luar negeri, 2014-2026, USD miliar' });
  const narrow = renderLineChart({ series, keys: KEYS, variant: 'narrow', lang: 'id', ariaLabel: 'Grafik garis posisi utang luar negeri, 2014-2026, USD miliar' });
  const totalBytes = Buffer.byteLength(wide, 'utf8') + Buffer.byteLength(narrow, 'utf8');
  assert.ok(totalBytes <= 8192, `combined size ${totalBytes} bytes exceeds 8KB`);
});

test('no NaN appears anywhere in the output', () => {
  const series = synthSeries(50);
  for (const variant of ['wide', 'narrow']) {
    const svg = renderLineChart({ series, keys: KEYS, variant, lang: 'en', ariaLabel: 'test' });
    assert.ok(!svg.includes('NaN'), `${variant} contains NaN`);
  }
});

test('narrow variant labels only every other year', () => {
  const series = synthSeries(52); // 2014-Q1 .. 2026-Q4, 13 full years
  const svg = renderLineChart({ series, keys: [KEYS[0]], variant: 'narrow', lang: 'id', ariaLabel: 'test' });
  const years = [...svg.matchAll(/<text x="[\d.]+" y="188"[^>]*>(\d{4})<\/text>/g)].map((m) => m[1]);
  assert.deepEqual(years, ['2014', '2016', '2018', '2020', '2022', '2024', '2026']);
});

test('a short first year does not produce an overlapping year label (real-data shape: single Q4 point before year 1)', () => {
  // Mirrors the actual external-debt.json shape: series starts at a lone
  // Dec-31 point, then full quarterly data the next year onward.
  const series = [{ date: '2014-12-31', government: 100000 }];
  for (let i = 0; i < 12; i++) {
    const year = 2015 + Math.floor(i / 4);
    const q = ['03-31', '06-30', '09-30', '12-31'][i % 4];
    series.push({ date: `${year}-${q}`, government: 101000 + i * 1000 });
  }
  const svg = renderLineChart({ series, keys: [KEYS[0]], variant: 'wide', lang: 'id', ariaLabel: 'test' });
  const labels = [...svg.matchAll(/<text x="([\d.]+)" y="264"[^>]*>(\d{4})<\/text>/g)]
    .map((m) => ({ x: Number(m[1]), year: m[2] }));
  assert.ok(labels.length >= 2, 'expected at least a first and last year label');
  for (let i = 1; i < labels.length; i++) {
    assert.ok(labels[i].x - labels[i - 1].x >= 30, `labels ${labels[i - 1].year}/${labels[i].year} are only ${labels[i].x - labels[i - 1].x}px apart`);
  }
  // 2014 (the lone point) must not silently disappear — the series' first year still shows.
  assert.equal(labels[0].year, '2014');
});

test('aria-label and title text are XML-escaped', () => {
  const series = synthSeries(8);
  const svg = renderLineChart({
    series,
    keys: KEYS,
    variant: 'wide',
    lang: 'id',
    ariaLabel: 'A & B <test>',
  });
  assert.ok(svg.includes('aria-label="A &amp; B &lt;test&gt;"'));
});
