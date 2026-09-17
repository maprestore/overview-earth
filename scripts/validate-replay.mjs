import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'replay-packs');
const files = fs.readdirSync(directory).filter(file => file.endsWith('.json'));
if (!files.length) throw new Error('No replay packs found');

function validPoint(point) {
  return point && Number.isFinite(Number(point.lat)) && Number(point.lat) >= -90 && Number(point.lat) <= 90 &&
    Number.isFinite(Number(point.lon)) && Number(point.lon) >= -180 && Number(point.lon) <= 180 &&
    String(point.label || point.name || point.id || '').trim();
}

for (const file of files) {
  const fullPath = path.join(directory, file);
  const pack = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (pack.schema !== 'overview.replay.v1') throw new Error(`${file}: unsupported schema`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(pack.id || ''))) throw new Error(`${file}: invalid id`);
  if (!String(pack.label || '').trim() || !String(pack.description || '').trim()) throw new Error(`${file}: missing label or description`);
  if (!Number.isFinite(Date.parse(pack.capturedAt))) throw new Error(`${file}: invalid capturedAt`);
  if (!Array.isArray(pack.sources) || !pack.sources.length) throw new Error(`${file}: sources are required`);
  for (const source of pack.sources) {
    if (!String(source.url || '').startsWith('http')) throw new Error(`${file}: source URL is invalid`);
    if (!String(source.license || '').trim()) throw new Error(`${file}: source license is missing`);
  }
  for (const [layerId, layer] of Object.entries(pack.layers || {})) {
    if (!Array.isArray(layer.points)) throw new Error(`${file}: ${layerId} points must be an array`);
    if (layer.points.some(point => !validPoint(point))) throw new Error(`${file}: ${layerId} contains an invalid point`);
  }
}

console.log(`Replay validation passed: ${files.length} pack(s).`);
