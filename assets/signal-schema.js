/**
 * Public signal contract
 * -------------------------------------------------------------
 * Every adapter may return source-shaped data, but the engine stores and
 * exposes points through this small, portable contract.
 */

const OverviewSignalSchema = (() => {
  const VERSION = 'overview.signal.v1';

  function timestamp(value) {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function validatePoint(point) {
    const errors = [];
    if (!point || typeof point !== 'object') errors.push('point must be an object');
    const lat = Number(point?.lat);
    const lon = Number(point?.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push('lat must be between -90 and 90');
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) errors.push('lon must be between -180 and 180');
    if (!String(point?.label || point?.name || point?.id || '').trim()) errors.push('label, name, or id is required');
    return { ok: errors.length === 0, errors };
  }

  function normalizePoint(point, context = {}) {
    const check = validatePoint(point);
    if (!check.ok) return null;
    const observed = timestamp(point.observedAt ?? point.time ?? point.timestamp ?? point.seendate);
    const fetched = timestamp(context.fetchedAt) || Date.now();
    return {
      ...point,
      lat: Number(point.lat),
      lon: Number(point.lon),
      label: String(point.label || point.name || point.id),
      observedAt: observed ? new Date(observed).toISOString() : point.observedAt,
      provenance: {
        schema: VERSION,
        layerId: context.layerId || '',
        source: context.source || '',
        sourceUrl: context.sourceUrl || '',
        observedAt: observed ? new Date(observed).toISOString() : '',
        fetchedAt: new Date(fetched).toISOString(),
        attribution: context.attribution || context.source || '',
        license: context.license || 'Source terms apply',
        confidence: context.confidence || 'source-reported'
      }
    };
  }

  function normalizePoints(points, context = {}) {
    const accepted = [];
    const rejected = [];
    for (const point of Array.isArray(points) ? points : []) {
      const normalized = normalizePoint(point, context);
      if (normalized) accepted.push(normalized);
      else rejected.push({ point, errors: validatePoint(point).errors });
    }
    return { points: accepted, rejected };
  }

  function validateManifest(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== 'object') errors.push('manifest must be an object');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(manifest?.id || ''))) errors.push('id must be kebab-case');
    if (!String(manifest?.label || '').trim()) errors.push('label is required');
    if (!String(manifest?.source || '').trim()) errors.push('source is required');
    if (!String(manifest?.sourceUrl || '').startsWith('http')) errors.push('sourceUrl must be an http(s) URL');
    return { ok: errors.length === 0, errors };
  }

  function toGeoJSON(points, properties = {}) {
    return {
      type: 'FeatureCollection',
      features: (Array.isArray(points) ? points : []).filter(point => validatePoint(point).ok).map(point => ({
        type: 'Feature',
        id: point.id,
        geometry: { type: 'Point', coordinates: [Number(point.lon), Number(point.lat)] },
        properties: { ...properties, ...point, lat: undefined, lon: undefined }
      }))
    };
  }

  return Object.freeze({ VERSION, timestamp, validatePoint, normalizePoint, normalizePoints, validateManifest, toGeoJSON });
})();
