/**
 * Deployment configuration.
 *
 * Leave the relay URL empty when running the public GitHub Pages demo. A
 * custom deployment can set this to its managed flight relay URL, for example:
 *   window.OVERVIEW_FLIGHTS_RELAY_URL = 'https://signals.example.com/api/flights';
 */
window.OVERVIEW_FLIGHTS_RELAY_URL = '';

// Set this to a managed relay that returns { points, source } for /api/ships.
// Keep AISHub credentials on the relay, never in this file.
window.OVERVIEW_SHIPS_RELAY_URL = '';

// The open build stores up to seven days locally in IndexedDB. A hosted build
// may use this value later for a read-only managed history endpoint.
window.OVERVIEW_HISTORY_URL = '';
