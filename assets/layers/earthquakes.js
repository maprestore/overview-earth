/**
 * Layer: Earthquakes
 * -------------------------------------------------------------
 * Data source: USGS Earthquake Hazards Program
 * https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/
 *
 * This is a real, official US government feed — no API key, no
 * rate limit issues reported, updates roughly every minute. Use
 * this layer's structure as the template for every other layer.
 *
 * Feed options (swap the URL below to change sensitivity):
 *   all_hour.geojson  — most recent, smallest earthquakes included
 *   all_day.geojson   — last 24 hours, all magnitudes (used here)
 *   2.5_day.geojson    — last 24 hours, magnitude 2.5+ only (less noisy)
 */

Overview.registerLayer({
  id: 'earthquakes',
  label: 'Earthquakes (USGS)',
  source: 'USGS all-day feed',
  sourceUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/',
  color: '#F0C419',
  defaultOn: true,
  refreshMs: 60 * 1000, // USGS updates this feed roughly every minute

  async fetchPoints() {
    const urls = [
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
    ];
    const result = typeof OverviewSources !== 'undefined'
      ? await OverviewSources.json(urls)
      : { data: await (await fetch(urls[0])).json(), url: urls[0] };
    const data = result.data;

    const points = (data.features || []).map(f => {
      const [lon, lat, depthKm] = f.geometry.coordinates;
      const magnitude = f.properties.mag || 0;
      return {
        lat,
        lon,
        // Scale dot size by magnitude so bigger quakes are visually obvious
        size: Math.max(2, magnitude * 1.8),
        magnitude,
        place: f.properties.place || 'location unavailable',
        depthKm,
        time: f.properties.time,
        url: f.properties.url || '',
        label: `M${magnitude.toFixed(1)} — ${f.properties.place} (depth ${depthKm.toFixed(0)}km)`
      };
    });
    return { points, fallback: result.url !== urls[0], source: result.url === urls[0] ? 'USGS all-day feed' : 'USGS 2.5+ day fallback' };
  }
});
