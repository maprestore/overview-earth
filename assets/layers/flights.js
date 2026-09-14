/**
 * Layer: Flights
 * -------------------------------------------------------------
 * Data source: OpenSky Network (free anonymous access for limited use)
 * https://openskynetwork.github.io/opensky-api/
 *
 * The states endpoint returns positional arrays rather than objects:
 * [icao24, callsign, originCountry, timePosition, lastContact,
 *  longitude, latitude, baroAltitude, onGround, velocity, trueTrack,
 *  verticalRate, sensors, geoAltitude, squawk, spi, positionSource]
 *
 * The preferred path is the optional same-origin/server-side relay in
 * relay/opensky-worker.js. Direct OpenSky access remains useful on origins
 * the provider permits, followed by regional ADSB.lol fallback.
 */

const ADSB_LOL_REGIONS = [
  'https://api.adsb.lol/v2/lat/40/lon/-100/dist/250',
  'https://api.adsb.lol/v2/lat/50/lon/10/dist/250',
  'https://api.adsb.lol/v2/lat/35/lon/135/dist/250',
  'https://api.adsb.lol/v2/lat/-25/lon/135/dist/250'
];

const configuredRelay = typeof window !== 'undefined'
  ? String(window.OVERVIEW_FLIGHTS_RELAY_URL || '').trim()
  : '';
const sameOriginRelay = typeof window !== 'undefined' && window.location.origin !== 'null' &&
  !window.location.hostname.endsWith('.github.io') &&
  !window.location.hostname.endsWith('usercontent.browser-use.tools')
  ? `${window.location.origin}/api/flights`
  : '';
const FLIGHT_RELAY_URLS = [...new Set([configuredRelay, sameOriginRelay].filter(Boolean))];

function mapRelayAircraft(data) {
  return (Array.isArray(data?.points) ? data.points : []).map(point => {
    const lat = Number(point.lat);
    const lon = Number(point.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const callsign = String(point.callsign || 'UNKNOWN').trim();
    return {
      id: point.id || `relay-${lat}:${lon}:${callsign}`,
      lat,
      lon,
      size: Number(point.size) || 3.5,
      callsign,
      originCountry: point.originCountry || 'origin unknown',
      altitudeKm: Number.isFinite(Number(point.altitudeKm)) ? Number(point.altitudeKm) : null,
      speedKmh: Number.isFinite(Number(point.speedKmh)) ? Number(point.speedKmh) : null,
      heading: Number(point.heading) || 0,
      label: `OPENSKY RELAY / ${point.label || callsign}`
    };
  }).filter(Boolean);
}

async function fetchFlightRelay() {
  if (!FLIGHT_RELAY_URLS.length) throw new Error('flight relay is not configured');
  const result = typeof OverviewSources !== 'undefined'
    ? await OverviewSources.json(FLIGHT_RELAY_URLS, { timeoutMs: 8000 })
    : { data: await (await fetch(FLIGHT_RELAY_URLS[0])).json(), url: FLIGHT_RELAY_URLS[0] };
  if (!Array.isArray(result.data?.points)) throw new Error('flight relay returned an unexpected response');
  return { points: mapRelayAircraft(result.data), source: 'OpenSky via managed relay' };
}

function mapAdsbAircraft(data) {
  return (Array.isArray(data?.ac) ? data.ac : []).map(aircraft => {
    const lat = Number(aircraft.lat);
    const lon = Number(aircraft.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const flight = String(aircraft.flight || aircraft.hex || 'UNKNOWN').trim();
    const altitude = Number(aircraft.alt_baro);
    const speed = Number(aircraft.gs);
    return {
      id: `adsb-${aircraft.hex || `${lat}:${lon}:${flight}`}`,
      lat,
      lon,
      size: aircraft.on_ground ? 2.5 : 3.5,
      callsign: flight,
      originCountry: aircraft.r || 'origin unknown',
      altitudeKm: Number.isFinite(altitude) ? altitude * 0.0003048 : null,
      speedKmh: Number.isFinite(speed) ? speed * 1.852 : null,
      heading: Number(aircraft.track) || 0,
      label: `ADSB.LOL FALLBACK / ${flight} — ${aircraft.r || 'origin unknown'}`
    };
  }).filter(Boolean);
}

async function fetchAdsbLolFallback() {
  let lastError = null;
  for (const url of ADSB_LOL_REGIONS) {
    try {
      const result = typeof OverviewSources !== 'undefined'
        ? await OverviewSources.json([url], { timeoutMs: 8000 })
        : { data: await (await fetch(url)).json(), url };
      const points = mapAdsbAircraft(result.data);
      if (points.length) return { points, fallback: true, source: 'ADSB.lol regional fallback' };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw new Error(`OpenSky unavailable; ADSB.lol fallback failed: ${lastError.message}`);
  return { points: [], fallback: true, source: 'ADSB.lol regional fallback / no aircraft returned' };
}

Overview.registerLayer({
  id: 'flights',
  label: 'Flights (OpenSky)',
  source: 'OpenSky global states',
  sourceUrl: 'https://openskynetwork.github.io/opensky-api/',
  color: '#3FB6FF',
  defaultOn: true,
  refreshMs: 60 * 1000,

  async fetchPoints() {
    const url = 'https://opensky-network.org/api/states/all';
    try {
      return await fetchFlightRelay();
    } catch (relayError) {
      // Direct access remains useful on origins OpenSky explicitly permits.
      console.info(`Overview flights: relay unavailable — ${relayError.message || relayError}`);
    }
    try {
      const result = typeof OverviewSources !== 'undefined'
        ? await OverviewSources.json([url], { timeoutMs: 12000 })
        : { data: await (await fetch(url)).json(), url };
      const data = result.data;

      const points = (Array.isArray(data.states) ? data.states : [])
      .map(state => {
        const [icao24, callsign, originCountry, , , lon, lat, baroAltitude, onGround, velocity, trueTrack] = state;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        const flight = callsign?.trim() || icao24?.toUpperCase() || 'UNKNOWN';
        const altitude = Number.isFinite(baroAltitude)
          ? `${(baroAltitude / 1000).toFixed(1)}km`
          : 'altitude n/a';
        const speed = Number.isFinite(velocity)
          ? `${Math.round(velocity * 3.6)}km/h`
          : 'speed n/a';

        return {
          lat,
          lon,
          size: onGround ? 2.5 : 3.5,
          callsign: flight,
          originCountry,
          altitudeKm: Number.isFinite(baroAltitude) ? baroAltitude / 1000 : null,
          speedKmh: Number.isFinite(velocity) ? velocity * 3.6 : null,
          heading: Number.isFinite(trueTrack) ? trueTrack : 0,
          label: `${flight} — ${originCountry || 'origin unknown'} — ${altitude} — ${speed}`
        };
      })
      .filter(Boolean);
      return { points, source: 'OpenSky global states' };
    } catch (error) {
      return fetchAdsbLolFallback();
    }
  }
});
