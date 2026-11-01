import { projectDebt, formatRupiahGroups, staleDays, isStale } from './counter.js';

const counterEl = document.getElementById('counter-number');
const interestEl = document.getElementById('interest-value');
const staleBadgeEl = document.getElementById('stale-badge');
const staleTextEl = document.getElementById('stale-text');
const tickerToggle = document.getElementById('ticker-toggle');
const copyStatusEl = document.getElementById('copy-status');

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

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

function setupShareButtons() {
  const buttons = Array.from(document.querySelectorAll('.js-copy-link'));
  if (!buttons.length) return;

  const shareText = buttons[0].dataset.shareText;
  const shareUrl = buttons[0].dataset.shareUrl;
  const originalLabels = buttons.map((btn) => btn.textContent);
  let copiedTimer;
  let statusTimer;

  // role="status" region: counters must never live here, only one-shot
  // copy/share outcomes. Cleared first so an identical message re-announces.
  function announce(message) {
    if (!copyStatusEl) return;
    copyStatusEl.textContent = '';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { copyStatusEl.textContent = message; }, 30);
  }

  async function copyLink() {
    // Record which path was used before awaiting it: when the native share
    // sheet resolves, the feedback must say "Shared", not "Copied".
    const viaShare = Boolean(navigator.share);
    try {
      if (viaShare) {
        await navigator.share({ text: shareText, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      }
    } catch (error) {
      // A cancelled share sheet is not a failure — stay silent. Genuine
      // clipboard/share errors announce through the polite status region.
      if (error && error.name === 'AbortError') return;
      announce(buttons[0].dataset.errorStatus);
      return;
    }
    announce(viaShare ? buttons[0].dataset.sharedStatus : buttons[0].dataset.copiedStatus);
    // Both the hero and share-section buttons swap to the same success label.
    const successKey = viaShare ? 'sharedLabel' : 'copiedLabel';
    buttons.forEach((btn) => { btn.textContent = btn.dataset[successKey]; });
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      buttons.forEach((btn, i) => { btn.textContent = originalLabels[i]; });
    }, 2200);
  }

  buttons.forEach((btn) => btn.addEventListener('click', copyLink));
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
    // The pause/resume toggle stays hidden, so the no-JS look is preserved.
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
    const jitter = reducedMotionQuery.matches ? 0 : Math.floor(Math.random() * 40) - 20;
    interestEl.textContent = `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(interestRatePerSec) + jitter)}`;
  }

  // One timer drives both visual tickers; the hourly staleness check below
  // is a separate interval, so pausing never stops the stale badge.
  let tickTimer = null;

  function startTicker() {
    if (tickTimer !== null) return;
    tickTimer = setInterval(tick, reducedMotionQuery.matches ? 1000 : 100);
  }

  function stopTicker() {
    if (tickTimer === null) return;
    clearInterval(tickTimer);
    tickTimer = null;
  }

  // Action button whose name swaps between Pause and Resume — deliberately
  // not aria-pressed, per the design's accessibility review.
  function setToggleLabel(paused) {
    tickerToggle.textContent = paused ? tickerToggle.dataset.resumeLabel : tickerToggle.dataset.pauseLabel;
  }

  if (reducedMotionQuery.matches) {
    // Start paused on the server-rendered official figures: ticking now
    // would replace them with estimates before the user asks for any.
    setToggleLabel(true);
  } else {
    tick();
    setToggleLabel(false);
    startTicker();
  }
  tickerToggle.hidden = false;

  tickerToggle.addEventListener('click', () => {
    if (tickTimer === null) {
      tick(); // render immediately before restarting, so resume feels instant
      setToggleLabel(false);
      startTicker();
    } else {
      stopTicker();
      setToggleLabel(true);
    }
  });

  // If the user switches to reduced motion while the page is open, pause —
  // and never auto-resume when the preference flips back.
  reducedMotionQuery.addEventListener('change', (event) => {
    if (event.matches) {
      stopTicker();
      setToggleLabel(true);
    }
  });

  // Re-check staleness roughly once an hour — cheap and keeps a long-open
  // tab honest without a full state.json re-fetch.
  setInterval(() => updateStaleBadge(state.official_date), 60 * 60 * 1000);
}

setupShareButtons();
main();
