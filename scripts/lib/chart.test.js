import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderLineChart, renderChartTable, niceAxisMax } from './chart.js';
import { humanDate } from './format.js';

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

test('a short penultimate year does not produce an overlapping label at the end of the series either', () => {
  // Mirrors the short-first-year case but at the tail: a year with only one
  // quarter right before the series' final year would otherwise crowd the
  // true last label. The last label must always survive; its neighbor must
  // be evicted instead of coexisting in an overlapping position.
  const series = [];
  for (let i = 0; i < 44; i++) {
    const year = 2014 + Math.floor(i / 4);
    const q = ['03-31', '06-30', '09-30', '12-31'][i % 4];
    series.push({ date: `${year}-${q}`, government: 100000 + i * 1000 });
  }
  series.push({ date: '2025-03-31', government: 145000 }); // 2025: one lone quarter
  series.push({ date: '2026-03-31', government: 146000 }); // 2026: the true last year
  series.push({ date: '2026-06-30', government: 147000 });

  const svg = renderLineChart({ series, keys: [KEYS[0]], variant: 'wide', lang: 'id', ariaLabel: 'test' });
  const labels = [...svg.matchAll(/<text x="([\d.]+)" y="264"[^>]*>(\d{4})<\/text>/g)]
    .map((m) => ({ x: Number(m[1]), year: m[2] }));
  for (let i = 1; i < labels.length; i++) {
    assert.ok(labels[i].x - labels[i - 1].x >= 30, `labels ${labels[i - 1].year}/${labels[i].year} are only ${labels[i].x - labels[i - 1].x}px apart`);
  }
  // The true last year must always be shown, even if its neighbor had to go.
  assert.equal(labels[labels.length - 1].year, '2026');
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

test('aria-describedby is emitted on the svg only when supplied and is XML-escaped', () => {
  const series = synthSeries(2);
  const withRef = renderLineChart({ series, keys: KEYS, variant: 'wide', lang: 'id', ariaLabel: 'test', ariaDescribedBy: 'uln-chart-description' });
  assert.ok(withRef.includes('role="img" aria-label="test" aria-describedby="uln-chart-description"'));
  const escaped = renderLineChart({ series, keys: KEYS, variant: 'narrow', lang: 'id', ariaLabel: 'test', ariaDescribedBy: 'a&b"c' });
  assert.ok(escaped.includes('aria-describedby="a&amp;b&quot;c"'), escaped);
  const without = renderLineChart({ series, keys: KEYS, variant: 'wide', lang: 'id', ariaLabel: 'test' });
  assert.ok(!without.includes('aria-describedby'), without);
});

const TABLE_LABELS = {
  id: { date: 'Tanggal', unit: 'USD miliar' },
  en: { date: 'Date', unit: 'USD billion' },
};

function tableKeys(lang) {
  return [
    { field: 'government', label: lang === 'en' ? 'Government' : 'Pemerintah' },
    { field: 'total', label: lang === 'en' ? 'National total' : 'Total nasional' },
  ];
}

test('chart table renders exactly one table with one row per data point, each date exactly once', () => {
  const series = synthSeries(12);
  const html = renderChartTable({ series, keys: tableKeys('id'), lang: 'id', caption: 'Uji tabel', labels: TABLE_LABELS.id });
  assert.equal((html.match(/<table class="chart-table">/g) || []).length, 1);
  const rows = html.match(/<tr><th scope="row">/g) || [];
  assert.equal(rows.length, series.length);
  for (const p of series) {
    const occurrences = html.split(`>${humanDate(p.date, 'id')}<`).length - 1;
    assert.equal(occurrences, 1, `date ${p.date} appears ${occurrences} times`);
  }
});

test('chart table values are localized and formatted like the SVG labels', () => {
  const series = [{ date: '2026-06-30', government: 205432, total: 500000 }];
  const idHtml = renderChartTable({ series, keys: tableKeys('id'), lang: 'id', caption: 'c', labels: TABLE_LABELS.id });
  const enHtml = renderChartTable({ series, keys: tableKeys('en'), lang: 'en', caption: 'c', labels: TABLE_LABELS.en });
  assert.ok(idHtml.includes('USD 205,4 mi'), idHtml);
  assert.ok(idHtml.includes('USD 500,0 mi'), idHtml);
  assert.ok(enHtml.includes('USD 205.4 bn'), enHtml);
  assert.ok(enHtml.includes('USD 500.0 bn'), enHtml);
});

test('chart table header cells are scoped and carry the localized unit', () => {
  const series = synthSeries(2);
  const html = renderChartTable({ series, keys: tableKeys('en'), lang: 'en', caption: 'c', labels: TABLE_LABELS.en });
  assert.equal((html.match(/<th scope="col">/g) || []).length, 3);
  assert.ok(html.includes('<th scope="col">Government (USD billion)</th>'));
  assert.ok(html.includes('<th scope="col">National total (USD billion)</th>'));
  assert.ok(html.includes('<th scope="col">Date</th>'));
  assert.ok(html.includes('<caption>c</caption>'));
});

test('chart table escapes caption, headers, and values', () => {
  const series = [{ date: '2026-06-30', government: 205432, total: 500000 }];
  const html = renderChartTable({
    series,
    keys: [{ field: 'government', label: 'A & <B>' }],
    lang: 'en',
    caption: 'R&D <spending> & more',
    labels: { date: 'D&te', unit: 'USD bn' },
  });
  assert.ok(!html.includes('R&D <spending>'), html);
  assert.ok(html.includes('R&amp;D &lt;spending&gt; &amp; more'));
  assert.ok(html.includes('A &amp; &lt;B&gt;'));
  assert.ok(html.includes('D&amp;te'));
  assert.ok(!/<(?!table|caption|thead|tbody|tr|th|td|\/)/.test(html.replace(/<\/?(table|caption|thead|tbody|tr|th|td)[^>]*>/g, '')));
});
