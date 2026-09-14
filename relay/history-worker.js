/**
 * Optional shared history API for Cloudflare Workers + D1.
 *
 * GET is read-only for the browser. POST is reserved for a trusted ingestion
 * job and requires the HISTORY_INGEST_TOKEN Worker secret.
 */

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 900000;
const MAX_POINTS = 2500;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins(env).includes(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins(env).includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Vary': 'Origin'
  };
}

function json(body, request, env, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function validLayer(value) {
  return /^[a-z0-9-]{1,48}$/.test(String(value || ''));
}

async function prune(db) {
  await db.prepare('DELETE FROM snapshots WHERE captured_at < ?').bind(Date.now() - RETENTION_MS).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!originAllowed(request, env)) return json({ error: 'origin_not_allowed' }, request, env, 403);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request, env) });
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, service: 'overview-history' }, request, env);
    if (url.pathname !== '/api/history') return json({ error: 'not_found' }, request, env, 404);
    if (!env.HISTORY_DB) return json({ error: 'history_database_not_configured' }, request, env, 503);

    if (request.method === 'GET') {
      const layerId = url.searchParams.get('layer');
      if (!validLayer(layerId)) return json({ error: 'invalid_layer' }, request, env, 400);
      const since = Math.max(Number(url.searchParams.get('since')) || Date.now() - RETENTION_MS, Date.now() - RETENTION_MS);
      const result = await env.HISTORY_DB.prepare(
        'SELECT captured_at, payload_json FROM snapshots WHERE layer_id = ? AND captured_at >= ? ORDER BY captured_at ASC LIMIT 500'
      ).bind(layerId, since).all();
      const snapshots = (result.results || []).map(row => {
        try {
          return { capturedAt: row.captured_at, points: JSON.parse(row.payload_json) };
        } catch (error) {
          return null;
        }
      }).filter(Boolean);
      return json({ layerId, snapshots }, request, env);
    }

    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, request, env, 405);
    const authorization = request.headers.get('Authorization') || '';
    if (!env.HISTORY_INGEST_TOKEN || authorization !== `Bearer ${env.HISTORY_INGEST_TOKEN}`) {
      return json({ error: 'ingest_not_authorized' }, request, env, 401);
    }
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, request, env, 413);
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return json({ error: 'invalid_json' }, request, env, 400);
    }
    const layerId = body?.layerId;
    const capturedAt = Number(body?.capturedAt);
    const points = Array.isArray(body?.points) ? body.points.slice(0, MAX_POINTS) : null;
    if (!validLayer(layerId) || !Number.isFinite(capturedAt) || !points) {
      return json({ error: 'invalid_snapshot' }, request, env, 400);
    }
    await env.HISTORY_DB.prepare(
      'INSERT INTO snapshots (layer_id, captured_at, payload_json) VALUES (?, ?, ?)'
    ).bind(layerId, capturedAt, JSON.stringify(points)).run();
    await prune(env.HISTORY_DB);
    return json({ ok: true }, request, env, 201);
  },

  async scheduled(event, env, ctx) {
    if (env.HISTORY_DB) ctx.waitUntil(prune(env.HISTORY_DB));
  }
};
