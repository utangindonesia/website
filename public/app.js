import { projectDebt, formatRupiahGroups, staleDays, isStale } from './counter.js';

const counterEl = document.getElementById('counter-number');
const interestEl = document.getElementById('interest-value');
const staleBadgeEl = document.getElementById('stale-badge');
const staleTextEl = document.getElementById('stale-text');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function renderCounter(value) {
  const groups = formatRupiahGroups(value);
  // Reuse existing <span> nodes where possible instead of replacing
  // innerHTML every tick, to avoid unnecessary layout churn.
  const spans = counterEl.children;
  if (spans.length !== groups.length) {
    counterEl.innerHTML = groups.map((g) => `<span>${g}</span>`).join('');
  } else {
    for (let i = 0; i < groups.length; i++) {
      if (spans[i].textContent !== groups[i]) spans[i].textContent = groups[i];
    }
  }
}

function updateStaleBadge(officialDate) {
  const now = Date.now();
  if (isStale(officialDate, now)) {
    staleTextEl.textContent = staleTextEl.textContent.replace(/\d+/, String(staleDays(officialDate, now)));
    staleBadgeEl.hidden = false;
  } else {
    staleBadgeEl.hidden = true;
  }
}

async function main() {
  let state;
  try {
    const res = await fetch('/state.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`state.json ${res.status}`);
    state = await res.json();
  } catch {
    // Fetch failed: leave the server-rendered static figure in place —
    // it already shows the correct last-official value (see build-state.js).
    return;
  }

  const baseline = BigInt(state.baseline);
  const baselineTs = state.baseline_ts;
  const ratePerSec = state.rate_per_sec;
  const interestRatePerSec = state.interest_rate_per_sec;

  updateStaleBadge(state.official_date);

  function tick() {
    const now = Date.now();
    renderCounter(projectDebt(baseline, baselineTs, ratePerSec, now));

    // The interest ticker shows a derived per-second rate (annual ceiling ÷
    // seconds/year), not an accumulating total — see templates' "/detik"
    // unit. A small cosmetic jitter keeps it visually "live" without
    // implying it grows over time; reduced-motion users get the bare rate.
    const jitter = reducedMotion ? 0 : Math.floor(Math.random() * 40) - 20;
    interestEl.textContent = `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(interestRatePerSec) + jitter)}`;
  }

  tick();
  const intervalMs = reducedMotion ? 1000 : 100;
  setInterval(tick, intervalMs);

  // Re-check staleness roughly once an hour — cheap and keeps a long-open
  // tab honest without a full state.json re-fetch.
  setInterval(() => updateStaleBadge(state.official_date), 60 * 60 * 1000);
}

main();
