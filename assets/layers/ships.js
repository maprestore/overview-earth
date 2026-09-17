/**
 * Layer: Ships
 * -------------------------------------------------------------
 * Data source: AISHub
 * https://www.aishub.net/api
 *
 * AISHub requires a contributor username/API key and does not currently
 * send a CORS header, so this layer is opt-in and intentionally returns no
 * points until a browser-compatible relay is available.
 *
 * Configure the key outside source control with either:
 *   window.OVERVIEW_AISHUB_USERNAME = 'your-key';
 * or localStorage.setItem('overview.aishub.username', 'your-key');
 */

const AISHUB_USERNAME_KEY = 'overview.aishub.username';
let aishubMissingKeyWarningShown = false;
const configuredShipRelay = typeof window !== 'undefined'
  ? String(window.OVERVIEW_SHIPS_RELAY_URL || '').trim()
  : '';
const sameOriginShipRelay = typeof window !== 'undefined' && window.location.origin !== 'null' &&
  !window.location.hostname.endsWith('.github.io') &&
  !window.location.hostname.endsWith('usercontent.browser-use.tools')
  ? `${window.location.origin}/api/ships`
  : '';
const SHIP_RELAY_URLS = [...new Set([configuredShipRelay, sameOriginShipRelay].filter(Boolean))];

function getAishubUsername() {
  const configured = window.OVERVIEW_AISHUB_USERNAME;
  if (typeof configured === 'string' && configured.trim()) return configured.trim();

  try {
    return localStorage.getItem(AISHUB_USERNAME_KEY)?.trim() || '';
  } catch (err) {
    return '';
  }
}

function mapAishubShips(data, source) {
  const points = (Array.isArray(data) ? data : []).map(ship => {
    if (ship.LATITUDE == null || ship.LONGITUDE == null ||
        String(ship.LATITUDE).trim() === '' || String(ship.LONGITUDE).trim() === '') return null;
    const lat = Number(ship.LATITUDE);
    const lon = Number(ship.LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const name = String(ship.NAME || ship.CALLSIGN || ship.MMSI || 'UNKNOWN').trim();
    const speed = Number(ship.SOG);
    const destination = String(ship.DEST || '').trim();
    const speedLabel = Number.isFinite(speed) ? `${speed.toFixed(1)}kn` : 'speed n/a';
    return {
      id: `aishub-${ship.MMSI || `${lat}:${lon}:${name}`}`,
      lat,
      lon,
      size: 3,
      name,
      speedKnots: Number.isFinite(speed) ? speed : null,
      label: `${name} — ${destination || 'destination unknown'} — ${speedLabel}`
    };
  }).filter(Boolean);
  return { points, source };
}

async function fetchShipRelay() {
  if (!SHIP_RELAY_URLS.length) throw new Error('ship relay is not configured');
  const result = typeof OverviewSources !== 'undefined'
    ? await OverviewSources.json(SHIP_RELAY_URLS, { timeoutMs: 10000 })
    : { data: await (await fetch(SHIP_RELAY_URLS[0])).json(), url: SHIP_RELAY_URLS[0] };
  if (!Array.isArray(result.data?.points)) throw new Error('ship relay returned an unexpected response');
  const points = result.data.points.map(point => {
    const lat = Number(point.lat);
    const lon = Number(point.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      ...point,
      id: point.id || `relay-ship-${lat}:${lon}:${point.name || point.label || 'unknown'}`,
      lat,
      lon,
      size: Number(point.size) || 3,
      label: point.label || point.name || 'Unknown vessel'
    };
  }).filter(Boolean);
  return { points, source: result.data.source || 'AISHub via managed relay' };
}

Overview.registerLayer({
  id: 'ships',
  label: 'Ships (AISHub)',
  source: 'AISHub contributor feed',
  sourceUrl: 'https://www.aishub.net/api',
  color: '#FF8C42',
  defaultOn: false,
  refreshMs: 60 * 1000,

  async fetchPoints() {
    try {
      return await fetchShipRelay();
    } catch (relayError) {
      console.info(`Overview ships: relay unavailable — ${relayError.message || relayError}`);
    }

    const username = getAishubUsername();
    if (!username) {
      if (!aishubMissingKeyWarningShown) {
        console.info('Overview ships: AISHub username/API key not configured; layer is idle.');
        aishubMissingKeyWarningShown = true;
      }
        return { points: [], status: 'standby', source: 'AISHub relay or local key required' };
    }

    const params = new URLSearchParams({
      username,
      format: '1',
      output: 'json',
      compress: '0'
    });
    const url = `https://data.aishub.net/ws.php?${params}`;
    const result = typeof OverviewSources !== 'undefined'
      ? await OverviewSources.json([url], { timeoutMs: 10000 })
      : { data: await (await fetch(url)).json() };
    const data = result.data;
    if (!Array.isArray(data)) throw new Error('AISHub returned an unexpected response');
    if (data[0]?.ERROR) throw new Error(data[0].ERROR_MESSAGE || 'AISHub rejected the configured key');

    return mapAishubShips(data, result.url === url ? 'AISHub direct local access' : 'AISHub fallback');
  }
});
