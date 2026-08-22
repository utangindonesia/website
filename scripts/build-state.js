#!/usr/bin/env node
// Reads data/debt.json, derives the ticking-counter state and every stat
// card value, then emits public/state.json, public/index.html, public/en/index.html,
// public/sitemap.xml and public/robots.txt. No dependencies beyond Node itself.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  validateDebtSeries,
  computeRate,
  checkRateSanity,
  perCapita,
  debtToGdpPct,
  interestRatePerSec,
  staleDays,
  isStale,
  STALE_DAYS_THRESHOLD,
} from './lib/debt-math.js';
import { fmtId, fmtId1dp, groupsToHtml, formatTriliunIdr, formatUsdBillions, humanDate } from './lib/format.js';
import { validateExternalSeries } from './lib/external-debt.js';
import { SITE_ORIGIN, GITHUB_REPO_URL, CF_BEACON_TOKEN } from './site-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const now = Date.now();

function fail(messages) {
  for (const m of messages) console.error(`[build-state] ERROR: ${m}`);
  process.exit(1);
}

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(ROOT, relPath), 'utf8'));
}

const data = readJson('data/debt.json');

const seriesCheck = validateDebtSeries(data.debt_series);
if (!seriesCheck.ok) fail(seriesCheck.errors);

const externalDebt = readJson('data/external-debt.json');
const externalDebtCheck = validateExternalSeries(externalDebt.series);
if (!externalDebtCheck.ok) fail(externalDebtCheck.errors);

const { baseline, baselineTs, ratePerSec, officialDate } = computeRate(data.debt_series);
const rateErrors = checkRateSanity(ratePerSec);
if (rateErrors.length) fail(rateErrors);

if (isStale(officialDate, now)) {
  console.warn(`[build-state] WARNING: official_date ${officialDate} is ${staleDays(officialDate, now)} days old (threshold ${STALE_DAYS_THRESHOLD})`);
}

const gdpValue = BigInt(data.gdp_idr.value);
const debtToGdp = debtToGdpPct(baseline, gdpValue);
const perCapitaValue = perCapita(baseline, data.population.value);
const perWorkerValue = perCapita(baseline, data.workers.value);
const interestRate = interestRatePerSec(data.interest_annual_idr.value);
const deficitPdbPct = debtToGdpPct(BigInt(Math.round(data.deficit_ytd_idr.value)), gdpValue);

// --- public/state.json -----------------------------------------------------
const state = {
  baseline: baseline.toString(),
  baseline_ts: baselineTs,
  rate_per_sec: ratePerSec,
  official_date: officialDate,
  per_capita: perCapitaValue.toString(),
  debt_to_gdp: debtToGdp,
  interest_annual_idr: data.interest_annual_idr.value,
  interest_rate_per_sec: interestRate,
  generated_at: new Date(now).toISOString(),
};

mkdirSync(path.join(ROOT, 'public'), { recursive: true });
mkdirSync(path.join(ROOT, 'public/en'), { recursive: true });
writeFileSync(path.join(ROOT, 'public/state.json'), JSON.stringify(state));

// --- shared display tokens ---------------------------------------------------
const staleDaysAtBuild = staleDays(officialDate, now);
const staleAtBuild = isStale(officialDate, now);
const officialTriliun = baseline / 1_000_000_000_000n;

const bunga = data.interest_ytd_idr;
const bungaPct = fmtId1dp((bunga.value / data.interest_annual_idr.value) * 100);

const pdbRows = [
  { country: 'Indonesia', country_en: 'Indonesia', pct: debtToGdp, isId: true },
  ...data.gdp_comparison.map((c) => ({ country: c.country, country_en: c.country_en, pct: c.pct, isId: false })),
];

function renderPdbRows() {
  return pdbRows
    .map((row) => {
      const fillClass = row.isId ? 'bar-fill' : 'bar-fill bar-fill--neutral';
      const pctLabel = row.isId ? `${fmtId1dp(row.pct)}%` : `${fmtId(row.pct)}%`;
      return `              <div class="bar-row"><span>${row.country}</span><span class="bar-track"><span class="${fillClass}" style="width: ${row.pct}%;"></span></span><span>${pctLabel}</span></div>`;
    })
    .join('\n');
}

function renderPdbRowsEn() {
  return pdbRows
    .map((row) => {
      const fillClass = row.isId ? 'bar-fill' : 'bar-fill bar-fill--neutral';
      const pctLabel = row.isId ? `${fmtId1dp(row.pct)}%` : `${fmtId(row.pct)}%`;
      return `              <div class="bar-row"><span>${row.country_en}</span><span class="bar-track"><span class="${fillClass}" style="width: ${row.pct}%;"></span></span><span>${pctLabel}</span></div>`;
    })
    .join('\n');
}

function jsonLd(lang) {
  const isId = lang === 'id';
  const faqs = isId
    ? [
        ['Apakah angka ini resmi?', 'Tidak. Situs ini tidak berafiliasi dengan pemerintah. Angka resminya adalah yang tertulis di baris kecil di bawah penghitung, bersumber dari Kemenkeu.'],
        ['Mengapa berbeda dengan angka di berita?', 'Berita umumnya mengutip posisi akhir triwulan, sedangkan penghitung ini menambahkan estimasi sejak tanggal tersebut. Perbedaan juga muncul bila sumber lain memasukkan utang BUMN.'],
        ['Seberapa sering data diperbarui?', 'Setiap triwulan, mengikuti rilis posisi utang DJPPR Kemenkeu. Bila rilis terlambat, sebuah penanda kecil muncul di dekat penghitung dan menyebutkan umur data.'],
        ['Bolehkah angka ini dipakai untuk liputan?', 'Boleh, dengan menyebut posisi resmi dan tanggalnya, bukan angka estimasi per detik. Berkas data mentah tersedia di repositori.'],
      ]
    : [
        ['Is this an official figure?', 'No. This site is not affiliated with the government. The official figure is the one printed in the small line under the counter, sourced from the Ministry of Finance.'],
        ['Why does it differ from the figure in the news?', 'News reports typically cite the end-of-quarter position, while this counter adds an estimate on top of that date. Differences also arise when another source includes state-owned enterprise debt.'],
        ['How often is the data updated?', 'Every quarter, following DJPPR’s debt position release. If a release is late, a small badge appears near the counter noting the age of the data.'],
        ['Can this figure be used for reporting?', 'Yes, if you cite the official position and its date, not the per-second estimate. The raw data file is available in the repository.'],
      ];

  const graph = [
    {
      '@type': 'Dataset',
      name: isId ? 'Utang Pemerintah Pusat Republik Indonesia' : 'Central Government Debt, Republic of Indonesia',
      description: isId
        ? 'Posisi utang pemerintah pusat Indonesia, diperbarui setiap triwulan dari rilis resmi Kementerian Keuangan.'
        : "Indonesia's central government debt position, updated quarterly from official Ministry of Finance releases.",
      url: isId ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/en/`,
      temporalCoverage: officialDate,
      creator: { '@type': 'Organization', name: 'utangindonesia.org' },
      distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE_ORIGIN}/state.json` }],
      variableMeasured: [
        { '@type': 'PropertyValue', name: 'Central government debt', value: state.baseline, unitText: 'IDR' },
        { '@type': 'PropertyValue', name: 'Debt-to-GDP ratio', value: debtToGdp, unitText: '%' },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ];

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/<\/script/gi, '<\\/script');
}

function baseTokens(lang) {
  const isId = lang === 'id';
  const titleFigure = `Rp ${fmtId(officialTriliun)} T`;
  const title = isId
    ? `Utang Negara Indonesia: ${titleFigure} — Live`
    : `Indonesia National Debt: ${titleFigure} — Live`;
  const metaDescription = isId
    ? `Penghitung utang pemerintah pusat Indonesia. Angka resmi terakhir Rp ${fmtId(officialTriliun)} triliun (${humanDate(officialDate, 'id')}, Kemenkeu), diinterpolasi per detik. Termasuk utang per penduduk, rasio PDB, dan utang luar negeri.`
    : `A live counter for Indonesia's central government debt. Last official figure Rp ${fmtId(officialTriliun)} trillion (${humanDate(officialDate, 'en')}, Ministry of Finance), interpolated per second. Includes debt per resident, debt-to-GDP ratio, and external debt.`;
  const canonical = isId ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/en/`;

  // Shared text (see OFFICIAL_FIGURE_TEXT below) so the shared card never
  // goes stale — built from the same live official figure as the rest of
  // the page, not a hardcoded placeholder like the design handoff's mock.
  const officialFigureText = `Rp ${fmtId(officialTriliun)} triliun`;
  const shareUrl = canonical;
  const shareText = isId
    ? `Utang pemerintah pusat Indonesia: ${officialFigureText} per ${humanDate(officialDate, lang)} (Kemenkeu).`
    : `Indonesia's central government debt: ${officialFigureText} as of ${humanDate(officialDate, lang)} (Ministry of Finance).`;
  const encShareText = encodeURIComponent(shareText);
  const encShareUrl = encodeURIComponent(shareUrl);

  return {
    TITLE: title,
    META_DESCRIPTION: metaDescription,
    CANONICAL_URL: canonical,
    URL_ID: `${SITE_ORIGIN}/`,
    URL_EN: `${SITE_ORIGIN}/en/`,
    OG_URL: canonical,
    OG_IMAGE_URL: `${SITE_ORIGIN}/og-image.png`,
    JSONLD: jsonLd(lang),

    COUNTER_GROUPS_HTML: groupsToHtml(baseline),
    OFFICIAL_FIGURE_TEXT: officialFigureText,
    OFFICIAL_DATE_HUMAN: humanDate(officialDate, lang),
    OFFICIAL_DATE_ISO: officialDate,
    INTEREST_VALUE: fmtId(Math.round(interestRate)),

    SHARE_TEXT: shareText,
    SHARE_URL: shareUrl,
    SHARE_WA: `https://wa.me/?text=${encShareText}%20${encShareUrl}`,
    SHARE_X: `https://twitter.com/intent/tweet?text=${encShareText}&url=${encShareUrl}`,
    SHARE_FB: `https://www.facebook.com/sharer/sharer.php?u=${encShareUrl}`,
    SHARE_TG: `https://t.me/share/url?url=${encShareUrl}&text=${encShareText}`,
    SHARE_THREADS: `https://www.threads.net/intent/post?text=${encShareText}%20${encShareUrl}`,
    SHARE_LINE: `https://social-plugins.line.me/lineit/share?url=${encShareUrl}&text=${encShareText}`,

    STALE_HIDDEN_ATTR: staleAtBuild ? '' : ' hidden',
    STALE_DAYS: String(Math.max(0, staleDaysAtBuild)),

    CARD_PER_PENDUDUK_VALUE: `Rp ${fmtId(perCapitaValue)}`,
    CARD_PER_PENDUDUK_NOTE: data.population.note,
    CARD_PER_PENDUDUK_NOTE_EN: data.population.note_en,
    CARD_PER_PENDUDUK_SOURCE: data.population.source_url,

    CARD_PER_PEKERJA_VALUE: `Rp ${fmtId(perWorkerValue)}`,
    CARD_PER_PEKERJA_NOTE: data.workers.note,
    CARD_PER_PEKERJA_NOTE_EN: data.workers.note_en,
    CARD_PER_PEKERJA_SOURCE: data.workers.source_url,

    CARD_KOMPOSISI_VALUE: `${fmtId1dp(data.sbn_share_pct.value)}% SBN`,
    CARD_KOMPOSISI_VALUE_EN: `${fmtId1dp(data.sbn_share_pct.value)}% securities`,
    CARD_KOMPOSISI_NOTE: `${fmtId1dp(data.fx_debt_share_pct.value)}% dari SBN dalam valuta asing`,
    CARD_KOMPOSISI_NOTE_EN: `${fmtId1dp(data.fx_debt_share_pct.value)}% of government securities (SBN) is foreign-currency denominated`,
    CARD_KOMPOSISI_SOURCE: data.sbn_share_pct.source_url,
    SBN_PCT: data.sbn_share_pct.value,
    SBN_PCT_ID: fmtId1dp(data.sbn_share_pct.value),
    PINJAMAN_PCT_ID: fmtId1dp(100 - data.sbn_share_pct.value),

    CARD_BUNGA_VALUE: formatTriliunIdr(bunga.value),
    CARD_BUNGA_PAGU_VALUE: formatTriliunIdr(data.interest_annual_idr.value),
    CARD_BUNGA_NOTE: bunga.period,
    CARD_BUNGA_NOTE_EN: bunga.period_en,
    CARD_BUNGA_SOURCE: bunga.source_url,
    BUNGA_PCT: bungaPct,
    BUNGA_PCT_ID: bungaPct,

    CARD_DEFISIT_VALUE: formatTriliunIdr(data.deficit_ytd_idr.value),
    CARD_DEFISIT_NOTE: data.deficit_ytd_idr.period,
    CARD_DEFISIT_NOTE_EN: data.deficit_ytd_idr.period_en,
    CARD_DEFISIT_SOURCE: data.deficit_ytd_idr.source_url,
    DEFISIT_PDB_PCT: fmtId1dp(deficitPdbPct),
    DEFISIT_PDB_PCT_ID: fmtId1dp(deficitPdbPct),
    DEFICIT_LAW_LIMIT_ID: fmtId1dp(data.deficit_law_limit_pct_gdp),

    CARD_TENOR_VALUE: `${fmtId1dp(data.avg_tenor_years.value)} tahun`,
    CARD_TENOR_VALUE_EN: `${fmtId1dp(data.avg_tenor_years.value)} years`,
    CARD_TENOR_NOTE: data.avg_tenor_years.note,
    CARD_TENOR_NOTE_EN: data.avg_tenor_years.note_en,
    CARD_TENOR_SOURCE: data.avg_tenor_years.source_url,

    CARD_PDB_VALUE: `${fmtId1dp(debtToGdp)}%`,
    CARD_PDB_NOTE: `Batas UU Keuangan Negara: ${fmtId1dp(data.debt_law_limit_pct_gdp)}% PDB`,
    CARD_PDB_NOTE_EN: `Statutory ceiling: ${fmtId1dp(data.debt_law_limit_pct_gdp)}% of GDP`,
    CARD_PDB_SOURCE: data.debt_to_gdp_source_url,
    PDB_BAR_ROWS: isId ? renderPdbRows() : renderPdbRowsEn(),

    CARD_ULN_VALUE: formatUsdBillions(data.external_debt_usd.value),
    CARD_ULN_NOTE: `Bagian dari total utang yang berdenominasi valas; ${data.external_debt_usd.as_of}`,
    CARD_ULN_NOTE_EN: `Part of total debt denominated in foreign currency; ${data.external_debt_usd.as_of_en}`,
    CARD_ULN_SOURCE: data.external_debt_usd.source_url,

    CARD_CADEV_VALUE: formatUsdBillions(data.fx_reserves_usd.value),
    CARD_CADEV_NOTE: `Setara ${fmtId1dp(data.fx_reserves_usd.months_equiv)} bulan impor dan pembayaran utang luar negeri pemerintah`,
    CARD_CADEV_NOTE_EN: `Equivalent to ${fmtId1dp(data.fx_reserves_usd.months_equiv)} months of imports and government external debt payments`,
    CARD_CADEV_SOURCE: data.fx_reserves_usd.source_url,

    SRC_APBN_KITA: data.sources_general.apbn_kita,
    SRC_PROFIL_UTANG: data.sources_general.profil_utang,
    SRC_SULNI: data.sources_general.sulni,
    SRC_BPS: data.sources_general.bps,

    GITHUB_REPO_URL,
    CF_ANALYTICS_SNIPPET: CF_BEACON_TOKEN
      ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${CF_BEACON_TOKEN}"}'></script>`
      : '',
  };
}

function render(template, tokens) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in tokens)) throw new Error(`Missing template token: ${key}`);
    return String(tokens[key]);
  });
}

const idTemplate = readFileSync(path.join(ROOT, 'templates/index.id.html'), 'utf8');
const enTemplate = readFileSync(path.join(ROOT, 'templates/index.en.html'), 'utf8');

writeFileSync(path.join(ROOT, 'public/index.html'), render(idTemplate, baseTokens('id')));
writeFileSync(path.join(ROOT, 'public/en/index.html'), render(enTemplate, baseTokens('en')));

// --- sitemap.xml + robots.txt ----------------------------------------------
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${SITE_ORIGIN}/</loc>
    <xhtml:link rel="alternate" hreflang="id" href="${SITE_ORIGIN}/"/>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE_ORIGIN}/en/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/"/>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/en/</loc>
    <xhtml:link rel="alternate" hreflang="id" href="${SITE_ORIGIN}/"/>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE_ORIGIN}/en/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/"/>
  </url>
</urlset>
`;
writeFileSync(path.join(ROOT, 'public/sitemap.xml'), sitemap);

const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
writeFileSync(path.join(ROOT, 'public/robots.txt'), robots);

console.log(`[build-state] OK — baseline ${state.baseline} @ ${officialDate}, rate ${ratePerSec.toFixed(2)} IDR/sec, generated_at ${state.generated_at}`);
if (staleAtBuild) console.log(`[build-state] stale badge WILL show at build time (${staleDaysAtBuild} days old)`);
