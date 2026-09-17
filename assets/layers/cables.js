/**
 * Layer: Submarine cables
 * -------------------------------------------------------------
 * Primary data source: TeleGeography's public cable map data
 * https://www.submarinecablemap.com/
 *
 * TeleGeography's JSON endpoint is same-origin only, so a static site
 * cannot read it directly. The browser-compatible FAO open-data mirror is
 * used as a fallback. The core map renders both route lines and a midpoint
 * so the layer remains useful when a route is incomplete.
 */

const TELEGEOGRAPHY_CABLES_URL = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const FAO_CABLES_URL = 'https://data.apps.fao.org/map/gsrv/edit/cable_geo_sub/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=cable-geo-subarine-cables&outputFormat=application/json&count=1000';
let cableFallbackWarningShown = false;

async function fetchCableCollection(url) {
  const result = typeof OverviewSources !== 'undefined'
    ? await OverviewSources.json([url], { timeoutMs: 12000 })
    : { data: await (await fetch(url)).json() };
  const data = result.data;
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('cable feed returned an unexpected response');
  }
  return data.features;
}

function cableRoutePoints(feature) {
  const coordinates = feature.geometry?.coordinates;
  const segments = feature.geometry?.type === 'LineString' ? [coordinates] : coordinates;
  const lines = Array.isArray(segments) ? segments.filter(Array.isArray).map(segment => segment.filter(point => (
    Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
  ))).filter(segment => segment.length > 1) : [];
  const route = lines.sort((a, b) => b.length - a.length)[0] || [];
  if (!route.length) return null;

  const routeSegments = [];
  let segment = [];
  route.forEach(point => {
    if (segment.length && Math.abs(Number(point[0]) - Number(segment[segment.length - 1][0])) > 180) {
      if (segment.length > 1) routeSegments.push(segment);
      segment = [];
    }
    segment.push(point);
  });
  if (segment.length > 1) routeSegments.push(segment);
  if (!routeSegments.length) return null;
  const drawableRoute = routeSegments.sort((a, b) => b.length - a.length)[0];

  const midpoint = drawableRoute[Math.floor(drawableRoute.length / 2)];
  const name = String(feature.properties?.name || 'Unnamed cable').trim();
  return {
    lat: Number(midpoint[1]),
    lon: Number(midpoint[0]),
    size: 2.5,
    line: drawableRoute,
    lines: routeSegments.length > 1 ? routeSegments : undefined,
    name,
    label: `${name} — route midpoint`
  };
}

Overview.registerLayer({
  id: 'cables',
  label: 'Submarine cables',
  source: 'TeleGeography public cable map',
  sourceUrl: 'https://www.submarinecablemap.com/',
  color: '#7FE7C4',
  defaultOn: false,
  refreshMs: 24 * 60 * 60 * 1000,

  async fetchPoints() {
    let features;
    let fallback = false;
    try {
      features = await fetchCableCollection(TELEGEOGRAPHY_CABLES_URL);
    } catch (primaryError) {
      if (!cableFallbackWarningShown) {
        console.info('Overview cables: using the browser-compatible FAO open-data mirror.', primaryError);
        cableFallbackWarningShown = true;
      }
      features = await fetchCableCollection(FAO_CABLES_URL);
      fallback = true;
    }

    return {
      points: features.map(cableRoutePoints).filter(Boolean),
      fallback,
      source: fallback ? 'FAO open-data mirror fallback' : 'TeleGeography public cable map'
    };
  }
});
