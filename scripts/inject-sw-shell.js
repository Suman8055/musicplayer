#!/usr/bin/env node
// inject-sw-shell.js
// Run after `vite build`. Reads build/index.html, extracts all /_app/immutable/ URLs,
// and injects them into build/sw.js SHELL array so the SW caches the full app on install.

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BUILD = join(process.cwd(), 'build');
const SW    = join(BUILD, 'sw.js');

const html = readFileSync(join(BUILD, 'index.html'), 'utf8');

// Extract all /_app/immutable/... paths from href/src attributes and preload links
const immutableRe = /\/_app\/immutable\/[^"'\s>]+/g;
const found = [...new Set(html.match(immutableRe) || [])];

if (!found.length) {
  console.error('[inject-sw-shell] ERROR: no /_app/immutable/ URLs found in build/index.html');
  process.exit(1);
}

// Add the CSS bundle too (it's in a <link rel="stylesheet"> — same pattern)
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

// Replace the SHELL array content
sw = sw.replace(
  /const SHELL = \[[\s\S]*?\];/,
  `const SHELL = [\n${shellEntries},\n];`
);

writeFileSync(SW, sw);
console.log(`[inject-sw-shell] Injected ${found.length} immutable bundle(s) into build/sw.js`);
found.forEach(p => console.log(`  + ${p}`));
