/**
 * Overview ship relay for Cloudflare Workers.
 *
 * AISHub credentials stay in Worker secrets. The browser receives only a
 * normalized point response and never sees the contributor key.
 */

const CACHE_SECONDS = 60;
const UPSTREAM_TIMEOUT_MS = 10000;
const AISHUB_URL = 'https://data.aishub.net/ws.php';

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!origin) return '*';
  return allowed.includes(origin) ? origin : 'null';
}

function originIsAllowed(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return true;
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return allowed.includes(origin);
}

function corsHeaders(request, env) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request, env),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Vary': 'Origin'
  };
}

function jsonResponse(body, request, env, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...extra
    }
  });
}

function normalizeShips(data) {
  return (Array.isArray(data) ? data : []).map(ship => {
    const lat = Number(ship.LATITUDE);
    const lon = Number(ship.LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const name = String(ship.NAME || ship.CALLSIGN || ship.MMSI || 'UNKNOWN').trim();
    const speed = Number(ship.SOG);
    const destination = String(ship.DEST || '').trim();
    return {
      id: `aishub-${ship.MMSI || `${lat}:${lon}:${name}`}`,
      lat,
      lon,
      size: 3,
      name,
      speedKnots: Number.isFinite(speed) ? speed : null,
      label: `${name} — ${destination || 'destination unknown'} — ${Number.isFinite(speed) ? `${speed.toFixed(1)}kn` : 'speed n/a'}`
    };
  }).filter(Boolean);
}

async function fetchUpstream(env) {
  if (!env.AISHUB_USERNAME) throw new Error('AISHUB_USERNAME is not configured');
  const params = new URLSearchParams({
    username: env.AISHUB_USERNAME,
    format: '1',
    output: 'json',
    compress: '0'
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(`${AISHUB_URL}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`AISHub HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('AISHub returned invalid JSON');
    if (data[0]?.ERROR) throw new Error('AISHub rejected the configured relay credential');
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function cacheKey(request) {
  const url = new URL(request.url);
  url.search = '';
  url.searchParams.set('__origin', request.headers.get('Origin') || 'no-origin');
  return new Request(url.toString(), { method: 'GET' });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!originIsAllowed(request, env)) return jsonResponse({ error: 'origin_not_allowed' }, request, env, 403);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request, env) });
    if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, request, env, 405);
    if (url.pathname === '/health') return jsonResponse({ ok: true, service: 'overview-ship-relay' }, request, env);
    if (url.pathname !== '/api/ships') return jsonResponse({ error: 'not_found' }, request, env, 404);
    if (!request.headers.get('Origin')) return jsonResponse({ error: 'origin_required' }, request, env, 403);

    const cached = await caches.default.match(cacheKey(request));
    if (cached) return cached;

    let data;
    try {
      data = await fetchUpstream(env);
    } catch (error) {
      return jsonResponse({ error: 'upstream_unavailable' }, request, env, 502);
    }
    const response = jsonResponse({
      source: 'AISHub via Overview relay',
      fetchedAt: new Date().toISOString(),
      points: normalizeShips(data)
    }, request, env, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
    ctx.waitUntil(caches.default.put(cacheKey(request), response.clone()));
    return response;
  }
};
