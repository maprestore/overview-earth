Overview.registerLayer({
  id: 'example-layer',
  label: 'Example Layer',
  source: 'Documented source name',
  sourceUrl: 'https://example.org/feed',
  color: '#3FB6FF',
  defaultOn: false,
  refreshMs: 5 * 60 * 1000,
  async fetchPoints() {
    const result = await OverviewSources.json('https://example.org/feed');
    return {
      points: (result.data?.items || []).map(item => ({
        id: item.id,
        lat: Number(item.lat),
        lon: Number(item.lon),
        size: 3,
        observedAt: item.observedAt,
        label: item.label || item.id
      })),
      source: 'Documented source name'
    };
  }
});
