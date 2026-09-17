/**
 * Layer: Buildings
 * -------------------------------------------------------------
 * Data source: OpenStreetMap through Overpass.
 * This shows live public building-footprint records in a small set of
 * watch zones. It is not a construction-progress feed; tagged construction
 * records are called out separately in the point label.
 */

const BUILDING_OVERPASS_QUERY = `
[out:json][timeout:18];
(
  way["building"](40.700,-74.020,40.755,-73.970);
  way["building:construction"](40.700,-74.020,40.755,-73.970);
  way["building"](51.490,-0.150,51.530,-0.080);
  way["building:construction"](51.490,-0.150,51.530,-0.080);
  way["building"](35.640,139.680,35.700,139.780);
  way["building:construction"](35.640,139.680,35.700,139.780);
);
out tags geom;
`;

const BUILDING_OVERPASS_URLS = [
  `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(BUILDING_OVERPASS_QUERY)}`,
  `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(BUILDING_OVERPASS_QUERY)}`
];

const BUILDING_MAP_URLS = [
  'https://api.openstreetmap.org/api/0.6/map?bbox=-74.01,40.71,-74.00,40.72',
  'https://api.openstreetmap.org/api/0.6/map?bbox=-0.13,51.50,-0.12,51.51',
  'https://api.openstreetmap.org/api/0.6/map?bbox=139.74,35.67,139.75,35.68'
];

function mapBuildingXml(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const nodes = new Map([...xml.querySelectorAll('node')].map(node => [
    node.getAttribute('id'),
    [Number(node.getAttribute('lon')), Number(node.getAttribute('lat'))]
  ]));
  return [...xml.querySelectorAll('way')]
    .filter(way => [...way.children].some(child => child.tagName === 'tag' && child.getAttribute('k')?.startsWith('building')))
    .map(way => {
      const tags = Object.fromEntries([...way.children]
        .filter(child => child.tagName === 'tag')
        .map(tag => [tag.getAttribute('k'), tag.getAttribute('v')]));
      const element = {
        id: way.getAttribute('id'),
        tags,
        geometry: [...way.children]
          .filter(child => child.tagName === 'nd')
          .map(nd => nodes.get(nd.getAttribute('ref')))
          .filter(Boolean)
          .map(([lon, lat]) => ({ lon, lat }))
      };
      return mapBuildingElement(element);
    })
    .filter(Boolean);
}

function mapBuildingElement(element) {
  const geometry = Array.isArray(element.geometry) ? element.geometry : [];
  const line = geometry
    .map(point => [Number(point.lon), Number(point.lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (line.length < 3) return null;

  const tags = element.tags || {};
  const midpoint = line[Math.floor(line.length / 2)];
  const construction = tags['building:construction'] || tags.construction;
  const name = tags.name || tags.building || 'building footprint';
  return {
    id: `osm-building-${element.id}`,
    lat: midpoint[1],
    lon: midpoint[0],
    size: 1.5,
    line,
    construction: construction || null,
    label: `${construction ? 'CONSTRUCTION TAG' : 'BUILDING FOOTPRINT'} / ${name}${construction ? ` / ${construction}` : ''}`
  };
}

Overview.registerLayer({
  id: 'buildings',
  label: 'Buildings (OSM)',
  source: 'OpenStreetMap Overpass',
  sourceUrl: 'https://www.openstreetmap.org/',
  color: '#F08CFF',
  defaultOn: false,
  refreshMs: 30 * 60 * 1000,

  async fetchPoints() {
    const livePoints = [];
    let mapFailures = 0;
    for (const url of BUILDING_MAP_URLS) {
      try {
        const result = typeof OverviewSources !== 'undefined'
          ? await OverviewSources.text([url], { timeoutMs: 12000 })
          : { data: await (await fetch(url)).text(), url };
        livePoints.push(...mapBuildingXml(result.data));
      } catch (error) {
        mapFailures += 1;
      }
    }
    if (livePoints.length) {
      return { points: livePoints, source: 'OpenStreetMap live map extracts' };
    }

    const result = typeof OverviewSources !== 'undefined'
      ? await OverviewSources.json(BUILDING_OVERPASS_URLS, { timeoutMs: 20000 })
      : { data: await (await fetch(BUILDING_OVERPASS_URLS[0])).json(), url: BUILDING_OVERPASS_URLS[0] };
    const elements = Array.isArray(result.data?.elements) ? result.data.elements : [];
    const points = elements.map(mapBuildingElement).filter(Boolean);
    if (!points.length) throw new Error(`OpenStreetMap building extracts unavailable (${mapFailures} map requests failed)`);
    return {
      points,
      fallback: result.url.includes('kumi.systems'),
      source: result.url.includes('kumi.systems') ? 'OpenStreetMap Overpass mirror' : 'OpenStreetMap Overpass'
    };
  }
});
