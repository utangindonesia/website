import { projectDebt, formatRupiahGroups, staleDays, isStale } from './counter.23833d4172.js';
const counterEl = document.getElementById('counter-number');
const interestEl = document.getElementById('interest-value');
const staleBadgeEl = document.getElementById('stale-badge');
const staleTextEl = document.getElementById('stale-text');
const tickerToggle = document.getElementById('ticker-toggle');
const copyStatusEl = document.getElementById('copy-status');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
function renderCounter(value) {
const groups = formatRupiahGroups(value);
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
function announce(message) {
if (!copyStatusEl) return;
copyStatusEl.textContent = '';
clearTimeout(statusTimer);
statusTimer = setTimeout(() => { copyStatusEl.textContent = message; }, 30);
}
async function copyLink() {
const viaShare = Boolean(navigator.share);
try {
if (viaShare) {
await navigator.share({ text: shareText, url: shareUrl });
} else {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
}
} catch (error) {
if (error && error.name === 'AbortError') return;
announce(buttons[0].dataset.errorStatus);
return;
}
announce(viaShare ? buttons[0].dataset.sharedStatus : buttons[0].dataset.copiedStatus);
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
const jitter = reducedMotionQuery.matches ? 0 : Math.floor(Math.random() * 40) - 20;
    interestEl.textContent = `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(interestRatePerSec) + jitter)}`;
}
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
function setToggleLabel(paused) {
tickerToggle.textContent = paused ? tickerToggle.dataset.resumeLabel : tickerToggle.dataset.pauseLabel;
}
if (reducedMotionQuery.matches) {
setToggleLabel(true);
} else {
tick();
setToggleLabel(false);
startTicker();
}
tickerToggle.hidden = false;
tickerToggle.addEventListener('click', () => {
if (tickTimer === null) {
tick();
setToggleLabel(false);
startTicker();
} else {
stopTicker();
setToggleLabel(true);
}
});
reducedMotionQuery.addEventListener('change', (event) => {
if (event.matches) {
stopTicker();
setToggleLabel(true);
}
});
setInterval(() => updateStaleBadge(state.official_date), 60 * 60 * 1000);
}
setupShareButtons();
main();