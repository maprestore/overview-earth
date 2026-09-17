# Security

Overview's public demo is a static browser application. The optional `relay/opensky-worker.js` component is the server-side boundary for provider credentials and should be deployed separately.

## Do Not Commit

- AISHub contributor usernames or API keys
- Relay credentials or private endpoint URLs
- OpenSky usernames or passwords in client-side files
- Personal data collected during local testing
- Browser profile data or exported storage

The local Ships configuration is intentionally browser-only and should never be copied into a public deployment.

The flight and ship relays must use encrypted Worker secrets for provider credentials and an explicit `ALLOWED_ORIGINS` list. Do not use wildcard origins when adding authenticated upstream access. Both relays apply upstream timeouts and return normalized data only.

The static page ships a restrictive Content Security Policy and uses Subresource Integrity for CDN scripts. If you add a provider, update the CSP allowlist deliberately and document the provider's terms. Do not weaken `script-src` with `unsafe-inline`.

The local history and watchlist contain source observations and labels in browser storage. They are not encrypted or synchronized; do not use them for sensitive operational data without adding an authenticated server-side store.

## Reporting A Problem

Do not publish credentials or exploitable details in a public issue. Contact the repository owner through GitHub with a clear description, reproduction steps, affected source, and a safe way to follow up.
