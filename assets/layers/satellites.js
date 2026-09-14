/**
 * Layer: Satellites
 * -------------------------------------------------------------
 * Data source: CelesTrak (free, public, no API key)
 * https://celestrak.org/NORAD/elements/
 *
 * Unlike earthquakes (which come with ready-made lat/lon), satellite
 * position has to be *computed* from orbital elements (TLE data) for
 * the current moment — that's what makes this layer more involved.
 *
 * We deliberately use CelesTrak's plain-text TLE format (not their
 * newer JSON/OMM format) because it's the universally standard input
 * that satellite.js expects (`twoline2satrec(line1, line2)`), and
 * every satellite.js example/tutorial confirms this exact contract —
 * safer than guessing at JSON field names without live testing.
 *
 * GROUP options (swap in the URL below to track different sets):
 *   stations   — ISS, Tiangong, etc. (small, fast — used here as the
 *                reliable starting point)
 *   active     — all active satellites (~7,000+ objects — heavier)
 *   cosmos-1408-debris, iridium-33-debris, fengyun-1c-debris
 *                — famous anti-satellite-test debris clouds (the
 *                  genuinely "wow" dataset once you're ready for it)
 * Full group list: https://celestrak.org/NORAD/elements/index.php
 *
 * Requires satellite.js (loaded via CDN in index.html) for SGP4
 * orbit propagation — this library is the de facto standard for
 * doing this calculation in the browser.
 */

Overview.registerLayer({
  id: 'satellites',
  label: 'Satellites (stations)',
  source: 'CelesTrak stations',
  sourceUrl: 'https://celestrak.org/NORAD/elements/',
  color: '#B39DDB',
  defaultOn: true,
  refreshMs: 5 * 60 * 1000, // TLE data itself only needs refreshing every few hours,
                             // but we recompute position every refresh regardless

  async fetchPoints() {
    const urls = [
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
      'https://celestrak.com/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle'
    ];
    const result = typeof OverviewSources !== 'undefined'
      ? await OverviewSources.text(urls)
      : { data: await (await fetch(urls[0])).text(), url: urls[0] };
    const text = result.data;

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const satrecs = [];

    // TLE format is 3 lines per object: name, line1, line2
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const name = lines[i];
      const line1 = lines[i + 1];
      const line2 = lines[i + 2];
      if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue; // skip malformed groups
      try {
        const satrec = satellite.twoline2satrec(line1, line2);
        satrecs.push({ name, satrec });
      } catch (e) {
        console.warn(`Overview satellites: failed to parse TLE for ${name}`, e);
      }
    }

    const now = new Date();
    const gmst = satellite.gstime(now);
    const points = [];

    for (const { name, satrec } of satrecs) {
      const posVel = satellite.propagate(satrec, now);
      if (!posVel.position) continue; // decayed/invalid orbit

      const geodetic = satellite.eciToGeodetic(posVel.position, gmst);
      const lat = satellite.degreesLat(geodetic.latitude);
      const lon = satellite.degreesLong(geodetic.longitude);
      const altKm = geodetic.height;

      points.push({
        lat,
        lon,
        size: 4,
        name,
        altitudeKm: altKm,
        label: `${name} — altitude ${altKm.toFixed(0)}km`
      });
    }

    return { points, fallback: result.url !== urls[0], source: result.url === urls[0] ? 'CelesTrak stations' : 'CelesTrak mirror fallback' };
  }
});
