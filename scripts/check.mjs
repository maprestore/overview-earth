import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'assets/config.js', 'assets/source-utils.js', 'assets/replay.js', 'assets/history.js',
  'assets/globe.js', 'assets/init.js', 'assets/orbital.js', 'assets/news-panel.js',
  'assets/brief.js', 'assets/inspector.js', 'assets/command-deck.js', 'assets/experience.js',
  'assets/layers/earthquakes.js', 'assets/layers/satellites.js', 'assets/layers/flights.js',
  'assets/layers/ships.js', 'assets/layers/gdelt.js', 'assets/layers/cables.js',
  'assets/layers/buildings.js', 'relay/opensky-worker.js', 'relay/ships-worker.js', 'relay/history-worker.js'
];

for (const relative of files) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${relative}`);
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const required of ['Content-Security-Policy', 'assets/history.js', 'assets/inspector.js', 'assets/init.js', 'id="map"', 'id="signal-inspector"']) {
  if (!html.includes(required)) throw new Error(`index.html is missing ${required}`);
}
for (const match of html.matchAll(/<script\s+src="([^"]+)"/g)) {
  if (match[1].startsWith('assets/') && !fs.existsSync(path.join(root, match[1]))) {
    throw new Error(`index.html references missing script: ${match[1]}`);
  }
}
if (!html.endsWith('</html>\n') && !html.endsWith('</html>')) throw new Error('index.html is not closed');

const config = fs.readFileSync(path.join(root, 'assets/config.js'), 'utf8');
if (/OVERVIEW_AISHUB_USERNAME\s*=\s*['"][^'"]+['"]/.test(config)) {
  throw new Error('AISHub credential appears in assets/config.js');
}

for (const relay of ['relay/opensky-worker.js', 'relay/ships-worker.js']) {
  const source = fs.readFileSync(path.join(root, relay), 'utf8');
  if (source.includes("Access-Control-Allow-Origin': '*'")) throw new Error(`${relay} contains wildcard CORS`);
  if (!source.includes('UPSTREAM_TIMEOUT_MS')) throw new Error(`${relay} has no upstream timeout`);
}

console.log(`Overview quality checks passed: ${files.length} JavaScript files, CSP, relay safeguards, and credential scan.`);
