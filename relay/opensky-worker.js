/**
 * Overview flight relay for Cloudflare Workers.
 *
 * Deploy this worker at /api/flights (or set the full URL in
 * assets/config.js). OpenSky credentials stay server-side. The worker
 * returns a small normalized response instead of proxying raw provider data.
 */

const CACHE_SECONDS = 30;
const UPSTREAM_TIMEOUT_MS = 10000;
const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all';

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (!origin) return '*';
  if (allowed.includes(origin)) return origin;
  return 'null';
}

function originIsAllowed(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return true;
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

function corsHeaders(request, env) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request, env),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
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

function normalizeStates(data) {
  return (Array.isArray(data?.states) ? data.states : []).map(state => {
    const [icao24, callsign, originCountry, , , lon, lat, baroAltitude, onGround, velocity, trueTrack] = state;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const flight = String(callsign || icao24 || 'UNKNOWN').trim().toUpperCase();
    const altitudeKm = Number.isFinite(baroAltitude) ? baroAltitude / 1000 : null;
    const speedKmh = Number.isFinite(velocity) ? velocity * 3.6 : null;
    const altitude = altitudeKm == null ? 'altitude n/a' : `${altitudeKm.toFixed(1)}km`;
    const speed = speedKmh == null ? 'speed n/a' : `${Math.round(speedKmh)}km/h`;

    return {
      id: `opensky-${icao24 || `${lat}:${lon}:${flight}`}`,
      lat,
      lon,
      size: onGround ? 2.5 : 3.5,
      callsign: flight,
      originCountry: originCountry || 'origin unknown',
      altitudeKm,
      speedKmh,
      heading: Number.isFinite(trueTrack) ? trueTrack : 0,
      label: `${flight} — ${originCountry || 'origin unknown'} — ${altitude} — ${speed}`
    };
  }).filter(Boolean);
}

function cacheKey(request) {
  const url = new URL(request.url);
  url.search = '';
  // Keep origin-specific CORS headers from being served to another origin.
  url.searchParams.set('__origin', request.headers.get('Origin') || 'no-origin');
  return new Request(url.toString(), { method: 'GET' });
}

async function fetchOpenSky(headers) {
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      response = await fetch(OPEN_SKY_URL, { headers, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (response.ok || (response.status !== 429 && response.status < 500)) return response;
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 250));
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!originIsAllowed(request, env)) return jsonResponse({ error: 'origin_not_allowed' }, request, env, 403);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request, env) });
    if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, request, env, 405);
    if (url.pathname === '/health') return jsonResponse({ ok: true, service: 'overview-flight-relay' }, request, env);
    if (url.pathname !== '/api/flights') return jsonResponse({ error: 'not_found' }, request, env, 404);
    if (!request.headers.get('Origin')) return jsonResponse({ error: 'origin_required' }, request, env, 403);

    const cache = caches.default;
    const key = cacheKey(request);
    const cached = await cache.match(key);
    if (cached) return cached;

    const headers = { Accept: 'application/json' };
    if (env.OPENSKY_USERNAME && env.OPENSKY_PASSWORD) {
      headers.Authorization = `Basic ${btoa(`${env.OPENSKY_USERNAME}:${env.OPENSKY_PASSWORD}`)}`;
    }

    let upstream;
    try {
      upstream = await fetchOpenSky(headers);
    } catch (error) {
      return jsonResponse({ error: 'upstream_unreachable' }, request, env, 502);
    }
    if (!upstream.ok) {
      return jsonResponse({ error: 'upstream_error', status: upstream.status }, request, env, 502);
    }

    let data;
    try {
      data = await upstream.json();
    } catch (error) {
      return jsonResponse({ error: 'upstream_invalid_json' }, request, env, 502);
    }
    const response = jsonResponse({
      source: 'OpenSky via Overview relay',
      fetchedAt: new Date().toISOString(),
      points: normalizeStates(data)
    }, request, env, 200, {
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`
    });
    ctx.waitUntil(cache.put(key, response.clone()));
    return response;
  }
};
