#!/usr/bin/env node
// inject-sw-shell.js
// Run after `vite build`. Does three things:
//   1. Injects /_app/immutable/ bundle URLs into build/sw.js SHELL array
//   2. Rewrites __BASE_PATH__ tokens in build/404.html and build/manifest.json
//   3. Ties SW CACHE key to git short-SHA for reliable cache busting

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const BASE_PATH = process.env.BASE_PATH || '/musicplayer';
const BUILD = join(process.cwd(), 'build');
const SW    = join(BUILD, 'sw.js');

// ── 1. SW shell injection ─────────────────────────────────────────────────────
const html = readFileSync(join(BUILD, 'index.html'), 'utf8');

const immutableRe = /\/_app\/immutable\/[^"'\s>]+/g;
const found = [...new Set(html.match(immutableRe) || [])];

if (!found.length) {
  console.error('[inject-sw-shell] ERROR: no /_app/immutable/ URLs found in build/index.html');
  process.exit(1);
}

const shellEntries = [
  "  BASE + '/'",
  "  BASE + '/index.html'",
  "  BASE + '/manifest.json'",
  "  BASE + '/sw.js'",
  "  BASE + '/icon-192.png'",
  "  BASE + '/icon-512.png'",
  "  BASE + '/apple-touch-icon.png'",
  ...found.map(p => `  BASE + '${p}'`),
].join(',\n');

let sw = readFileSync(SW, 'utf8');

sw = sw.replace(
  /const SHELL = \[[\s\S]*?\];/,
  `const SHELL = [\n${shellEntries},\n];`
);

// ── 3. SW cache key: tie to git short-SHA ────────────────────────────────────
let sha = 'local';
try {
  sha = execSync('git rev-parse --short HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
} catch {}

const apiSrc = readFileSync(join(process.cwd(), 'src/lib/api.js'), 'utf8');
const appVerMatch = apiSrc.match(/APP_VERSION\s*=\s*'([^']+)'/);
const appVersion = appVerMatch ? appVerMatch[1] : JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version;
const cacheKey = `mbx-sk-v${appVersion}-${sha}`;
sw = sw.replace(/const CACHE = '[^']+';/, `const CACHE = '${cacheKey}';`);

writeFileSync(SW, sw);
console.log(`[inject-sw-shell] CACHE key: ${cacheKey}`);
console.log(`[inject-sw-shell] Injected ${found.length} immutable bundle(s) into build/sw.js`);
found.forEach(p => console.log(`  + ${p}`));

// ── 2. Rewrite __BASE_PATH__ in 404.html and manifest.json ───────────────────
const files404 = [join(BUILD, '404.html')];
for (const f of files404) {
  if (!existsSync(f)) continue;
  const content = readFileSync(f, 'utf8').replace(/__BASE_PATH__/g, BASE_PATH);
  writeFileSync(f, content);
  console.log(`[inject-sw-shell] Patched ${f.replace(process.cwd(), '.')}`);
}

const manifestPath = join(BUILD, 'manifest.json');
if (existsSync(manifestPath)) {
  let manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.start_url = BASE_PATH + '/';
  manifest.scope     = BASE_PATH + '/';
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[inject-sw-shell] Patched build/manifest.json (start_url + scope → ${BASE_PATH}/)`);
}
