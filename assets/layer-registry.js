/**
 * Public adapter registry
 * -------------------------------------------------------------
 * Metadata is intentionally separate from fetch logic so the community can
 * review sources, terms, and operating requirements without executing code.
 */

const OverviewLayerRegistry = (() => {
  const entries = [
    { id: 'earthquakes', label: 'Earthquakes (USGS)', source: 'USGS all-day feed', sourceUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/', license: 'USGS public domain; verify source terms', requirements: 'none' },
    { id: 'satellites', label: 'Satellites (stations)', source: 'CelesTrak stations', sourceUrl: 'https://celestrak.org/NORAD/elements/', license: 'CelesTrak terms apply', requirements: 'satellite.js CDN' },
    { id: 'flights', label: 'Flights (OpenSky)', source: 'OpenSky / ADS-B fallback', sourceUrl: 'https://openskynetwork.github.io/opensky-api/', license: 'OpenSky terms and attribution apply', requirements: 'optional relay' },
    { id: 'ships', label: 'Ships (AISHub)', source: 'AISHub', sourceUrl: 'https://www.aishub.net/api', license: 'AISHub terms apply', requirements: 'relay and contributor key' },
    { id: 'news', label: 'News (GDELT)', source: 'GDELT DOC 2.0', sourceUrl: 'https://api.gdeltproject.org/api/v2/doc/doc', license: 'GDELT terms apply', requirements: 'public endpoint' },
    { id: 'cables', label: 'Submarine cables', source: 'TeleGeography cable map', sourceUrl: 'https://www.submarinecablemap.com/', license: 'Source terms apply', requirements: 'public endpoint' },
    { id: 'buildings', label: 'Building footprints', source: 'OpenStreetMap / Overpass', sourceUrl: 'https://www.openstreetmap.org/', license: 'ODbL attribution required', requirements: 'public endpoint' }
  ];
  const byId = new Map(entries.map(entry => [entry.id, Object.freeze({ ...entry })]));
  return Object.freeze({
    list: () => entries.map(entry => ({ ...entry })),
    get: id => byId.get(id) || null
  });
})();
