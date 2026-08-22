import { projectDebt, formatRupiahGroups, staleDays, isStale } from './counter.23833d4172.js';
const counterEl = document.getElementById('counter-number');
const interestEl = document.getElementById('interest-value');
const staleBadgeEl = document.getElementById('stale-badge');
const staleTextEl = document.getElementById('stale-text');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
async function copyLink() {
try {
if (navigator.share) {
await navigator.share({ text: shareText, url: shareUrl });
} else {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
}
} catch {
return;
}
buttons.forEach((btn) => { btn.textContent = btn.dataset.copiedLabel; });
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
const jitter = reducedMotion ? 0 : Math.floor(Math.random() * 40) - 20;
    interestEl.textContent = `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(interestRatePerSec) + jitter)}`;
}
tick();
const intervalMs = reducedMotion ? 1000 : 100;
setInterval(tick, intervalMs);
setInterval(() => updateStaleBadge(state.official_date), 60 * 60 * 1000);
}
setupShareButtons();
main();