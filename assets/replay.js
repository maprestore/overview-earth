/**
 * Replay fixture
 * -------------------------------------------------------------
 * This is a deterministic, source-shaped scene for demos and review.
 * It is never presented as live data.
 */

const OverviewReplay = (() => {
  const now = Date.now();

  const earthquakeSeeds = [
    [14.5, -92.1, 5.2, 'off the coast of Chiapas', 1],
    [-38.1, -73.4, 4.8, 'near Araucania, Chile', 3],
    [36.4, 141.2, 4.6, 'near Honshu, Japan', 4],
    [-6.2, 130.4, 4.5, 'Banda Sea', 5],
    [38.2, 20.6, 4.2, 'Ionian Sea', 7],
    [35.7, -117.5, 3.9, 'near Ridgecrest, California', 8],
    [60.2, -152.4, 3.8, 'southern Alaska', 9],
    [-23.4, -66.8, 3.7, 'Jujuy, Argentina', 10],
    [19.3, -155.1, 3.6, 'near Hawaii', 11],
    [1.2, 127.4, 3.6, 'Halmahera, Indonesia', 12],
    [40.8, 142.1, 3.4, 'off northern Japan', 13],
    [-17.9, -178.2, 3.4, 'Fiji region', 14],
    [52.6, 160.8, 3.2, 'Kamchatka region', 15],
    [10.7, 42.6, 3.1, 'East African Rift', 16],
    [-33.1, 179.2, 3.0, 'Kermadec Islands', 17],
    [28.4, 51.8, 2.9, 'southern Iran', 18],
    [43.7, 12.1, 2.8, 'central Italy', 20],
    [-5.4, 151.7, 2.7, 'New Britain region', 21]
  ];

  const earthquakes = earthquakeSeeds.map(([lat, lon, magnitude, place, hours], index) => ({
    id: `replay-quake-${index + 1}`,
    lat,
    lon,
    magnitude,
    place,
    depthKm: 8 + (index * 7) % 95,
    time: now - hours * 60 * 60 * 1000,
    size: Math.max(2, magnitude * 1.8),
    label: `REPLAY FIXTURE / M${magnitude.toFixed(1)} — ${place}`
  }));

  const satellites = Array.from({ length: 20 }, (_, index) => {
    const angle = (index / 20) * Math.PI * 2;
    return {
      id: `replay-satellite-${index + 1}`,
      lat: Math.sin(angle * 1.7) * 52,
      lon: -170 + index * 17.5,
      altitudeKm: 420 + (index % 4) * 38,
      size: 4,
      label: `REPLAY FIXTURE / STATION-${String(index + 1).padStart(2, '0')}`
    };
  });

  const flights = Array.from({ length: 28 }, (_, index) => ({
    id: `replay-flight-${index + 1}`,
    lat: -38 + ((index * 19) % 104),
    lon: -168 + ((index * 43) % 330),
    size: 3.5,
    heading: (index * 47) % 360,
    altitudeKm: 8.4 + (index % 5) * 0.5,
    speedKmh: 730 + (index % 6) * 22,
    label: `REPLAY FIXTURE / OV${String(100 + index)} — global route`
  }));

  const ships = Array.from({ length: 18 }, (_, index) => ({
    id: `replay-ship-${index + 1}`,
    lat: -35 + ((index * 11) % 70),
    lon: -160 + ((index * 29) % 315),
    size: 3,
    label: `REPLAY FIXTURE / AIS-${String(7000 + index)}`
  }));

  const news = [
    [40.7, -74, 'North America'], [51.2, 10.4, 'Europe'], [35.8, 104.2, 'East Asia'],
    [-14.2, -51.9, 'South America'], [8.7, 34.8, 'East Africa'], [23.4, 78.9, 'South Asia']
  ].map(([lat, lon, region], index) => ({
    id: `replay-news-${index + 1}`,
    lat,
    lon,
    size: 3,
    label: `REPLAY FIXTURE / reporting signal / ${region}`
  }));

  const cables = [
    [[-73, 40], [-32, 30], [2, 43], [14, 51]],
    [[-118, 34], [-150, 28], [145, 35], [139, 36]],
    [[-74, -34], [-20, -6], [18, 6], [32, 31]],
    [[-3, 51], [18, 36], [40, 8], [57, 1], [103, 1]],
    [[-80, 25], [-45, 10], [-17, -8], [18, -34]],
    [[103, 1], [125, 5], [151, -33], [153, -27]]
  ].map((line, index) => {
    const midpoint = line[Math.floor(line.length / 2)];
    return {
      id: `replay-cable-${index + 1}`,
      lat: midpoint[1],
      lon: midpoint[0],
      line,
      size: 2.5,
      label: `REPLAY FIXTURE / cable route ${index + 1}`
    };
  });

  const buildings = [
    [40.713, -74.006, 0.008, 0.004, 'Manhattan'],
    [40.719, -73.997, 0.005, 0.006, 'Manhattan'],
    [40.728, -74.011, 0.006, 0.004, 'Manhattan'],
    [51.507, -0.120, 0.006, 0.005, 'London'],
    [51.515, -0.095, 0.004, 0.008, 'London'],
    [51.522, -0.135, 0.008, 0.004, 'London'],
    [35.674, 139.742, 0.005, 0.006, 'Tokyo'],
    [35.681, 139.756, 0.004, 0.004, 'Tokyo'],
    [35.690, 139.705, 0.006, 0.005, 'Tokyo'],
    [25.205, 55.271, 0.008, 0.006, 'Dubai'],
    [25.218, 55.286, 0.006, 0.004, 'Dubai'],
    [25.195, 55.258, 0.004, 0.008, 'Dubai']
  ].map(([lat, lon, height, width, city], index) => ({
    id: `replay-building-${index + 1}`,
    lat,
    lon,
    size: 1.5,
    line: [[lon - width, lat - height], [lon + width, lat - height], [lon + width, lat + height], [lon - width, lat + height], [lon - width, lat - height]],
    label: `REPLAY FIXTURE / BUILDING FOOTPRINT / ${city}`
  }));

  const articles = [
    ['Infrastructure signals converge around the North Atlantic', 'North Atlantic', 'REPLAY FIXTURE'],
    ['Seismic activity remains concentrated along the Pacific Rim', 'Pacific Rim', 'REPLAY FIXTURE'],
    ['Orbital and terrestrial systems share one visible surface', 'Global', 'REPLAY FIXTURE'],
    ['Public feeds become more useful when provenance stays attached', 'Global', 'REPLAY FIXTURE'],
    ['A source-aware console separates observation from interpretation', 'Global', 'REPLAY FIXTURE']
  ].map(([title, country, domain], index) => ({
    title: `Replay fixture: ${title}`,
    url: 'https://github.com/maprestore/overview-earth',
    domain,
    sourcecountry: country,
    seendate: new Date(now - index * 2 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  }));

  function clone(points) {
    return points.map(point => ({
      ...point,
      line: Array.isArray(point.line) ? point.line.map(([lon, lat]) => [lon, lat]) : undefined
    }));
  }

  function pointsFor(id) {
    return clone({ earthquakes, satellites, flights, ships, news, cables, buildings }[id] || []);
  }

  return { pointsFor, articles };
})();
