// Single place to change the canonical domain (see README "Deploy your own" /
// mirror instructions) — every absolute URL on the site is built from this.
// The site itself never hardcodes utangindonesia.org anywhere else; internal
// links stay relative so a fork/mirror works unmodified.
export const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://utangindonesia.org';
export const GITHUB_REPO_URL = 'https://github.com/utangindonesia/website';

// Cloudflare Web Analytics beacon token (Cloudflare dashboard > Analytics >
// Web Analytics > Add site). Left unset here — the site ships with analytics
// off until the owner sets CF_BEACON_TOKEN as a repo secret/variable and it's
// passed into the build environment; see README "Analytics".
export const CF_BEACON_TOKEN = process.env.CF_BEACON_TOKEN || '';
