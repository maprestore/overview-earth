# Overview Provider Relays

The GitHub Pages app cannot reliably call OpenSky or AISHub directly because provider CORS and credential policies are restrictive. These Cloudflare Workers make provider requests server-side, keep credentials out of the browser, cache responses, and return only normalized points.

This relay is intentionally separate from the static app. Forks can run Overview with no backend, while public deployments can add this boundary when they need dependable aircraft access.

## Deploy

1. Create a Cloudflare account and install Wrangler.
2. From `relay/`, deploy the flight worker with `npx wrangler deploy --config wrangler.toml`.
3. Deploy the ship worker with `npx wrangler deploy --config ships-wrangler.toml` when AISHub access is available.
4. For shared history, run `npx wrangler d1 create overview-history`, apply `history-schema.sql`, replace `database_id` in `history-wrangler.toml`, and deploy with `npx wrangler deploy --config history-wrangler.toml`.
5. Set `ALLOWED_ORIGINS` to the exact site origin, such as `https://maprestore.github.io` or your custom domain.
6. For flights, add `OPENSKY_USERNAME` and `OPENSKY_PASSWORD` as encrypted Worker secrets if authenticated access is needed.
7. For ships, add `AISHUB_USERNAME` as an encrypted Worker secret. Never put it in `assets/config.js` on a public deployment.
8. For history ingestion, add `HISTORY_INGEST_TOKEN` as an encrypted secret and keep POST access inside a trusted ingestion job.
9. Set `window.OVERVIEW_FLIGHTS_RELAY_URL`, `window.OVERVIEW_SHIPS_RELAY_URL`, and `window.OVERVIEW_HISTORY_URL` when Workers are on another origin. Add that history origin to the page CSP allowlist.

The included `wrangler.toml` allows the relay to deploy without putting credentials in the repository. Replace the example `ALLOWED_ORIGINS` value before deployment if the site uses a different origin.

## Production Checklist

1. Use an exact `ALLOWED_ORIGINS` value; do not use `*` for an authenticated deployment.
2. Keep all provider credentials in encrypted Worker secrets.
3. Monitor `/health`, Worker errors, latency, cache age, and upstream `429`/`5xx` responses.
4. Keep cache intervals aligned with each provider's access policy.
5. Review OpenSky and AISHub attribution, licensing, and terms before operating a public or commercial service.
6. Do not treat an empty response as evidence that no aircraft or ships exist globally; it may reflect provider coverage or limits.

## Contract

`GET /api/flights` returns:

```json
{
  "source": "OpenSky via Overview relay",
  "fetchedAt": "2026-01-01T00:00:00.000Z",
  "points": [{ "lat": 40.7, "lon": -74, "callsign": "ABC123", "heading": 90 }]
}
```

`GET /api/ships` returns the same shape with vessel fields such as `name` and `speedKnots`. Both endpoints accept `OPTIONS` for CORS preflight, `GET /health` for a health check, and reject other methods. Do not expose wildcard origins when the relays are used with credentials.

## History

The open static build records successful observations in browser IndexedDB for seven days. This is useful for demos and individual operators, but it is not a shared archive. A production service should add authenticated server-side retention, scheduled ingestion, and a read-only history API before promising cross-device history or compliance-grade replay.
