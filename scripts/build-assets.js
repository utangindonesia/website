// Minifies + content-hashes assets/{style.css,app.js,counter.js} into
// public/, and cleans up stale hashed files from previous builds. Called
// once from build-state.js's top level (not per-language — see the
// buildAssets() call site).
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { minifyCss, minifyJs } from './lib/minify.js';

const HASHED_ASSET_RE = /^(style|app|counter)\.[0-9a-f]{10}\.(css|js)$/;

function shortHash(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 10);
}

function checkJsSyntax(label, code) {
  try {
    execFileSync(process.execPath, ['--input-type=module', '--check', '-'], { input: code });
  } catch (err) {
    throw new Error(`${label}: minified output failed a syntax check -- ${err.message}`);
  }
}

function cssBraceCount(s) {
  return (s.match(/\{/g) || []).length;
}

/**
 * @param {string} root repo root (ROOT in build-state.js)
 * @returns {{ cssName: string, appName: string, counterName: string }}
 */
export function buildAssets(root) {
  const skipMinify = process.env.SKIP_MINIFY === '1';
  const assetsDir = path.join(root, 'assets');
  const publicDir = path.join(root, 'public');

  const cssSource = readFileSync(path.join(assetsDir, 'style.css'), 'utf8');
  const counterSource = readFileSync(path.join(assetsDir, 'counter.js'), 'utf8');
  const appSource = readFileSync(path.join(assetsDir, 'app.js'), 'utf8');

  // 1. counter.js first -- app.js's hash below must depend on this.
  const counterMin = skipMinify ? counterSource : minifyJs(counterSource);
  checkJsSyntax('assets/counter.js', counterMin);
  const counterName = `counter.${shortHash(counterMin)}.js`;

  // 2. app.js: minify, then rewrite its import specifier, THEN hash. This
  // ordering is load-bearing -- see docs/plans (Claude Code plan mode)
  // "content-hashed + minified CSS/JS" §4. Hashing before the rewrite, or
  // hashing counter.js after app.js, would let an edit to counter.js alone
  // produce a new counter.<hash>.js that the still-unchanged app.<hash>.js
  // never imports -- the browser would keep fetching the old app.js, which
  // imports the old counter.js, and the fix would ship invisibly broken.
  let appMin = skipMinify ? appSource : minifyJs(appSource);
  const rewritten = appMin.replace(
    /(\bfrom\s*['"])\.\/counter\.js(['"])/,
    `$1./${counterName}$2`,
  );
  if (rewritten === appMin) {
    throw new Error('assets/app.js: expected import specifier "./counter.js" not found -- refusing to build with a stale import');
  }
  appMin = rewritten;
  checkJsSyntax('assets/app.js', appMin);
  const appName = `app.${shortHash(appMin)}.js`;

  // 3. style.css
  const cssMin = skipMinify ? cssSource : minifyCss(cssSource);
  if (cssBraceCount(cssMin) !== cssBraceCount(cssSource)) {
    throw new Error(`assets/style.css: minified brace count (${cssBraceCount(cssMin)}) does not match source (${cssBraceCount(cssSource)}) -- the minifier likely ate a rule`);
  }
  const cssName = `style.${shortHash(cssMin)}.css`;

  const keep = new Set([cssName, appName, counterName]);
  for (const entry of readdirSync(publicDir)) {
    if (HASHED_ASSET_RE.test(entry) && !keep.has(entry)) {
      unlinkSync(path.join(publicDir, entry));
      console.log(`[build-assets] removed stale ${entry}`);
    }
  }

  writeFileSync(path.join(publicDir, cssName), cssMin);
  writeFileSync(path.join(publicDir, appName), appMin);
  writeFileSync(path.join(publicDir, counterName), counterMin);

  return { cssName, appName, counterName };
}
