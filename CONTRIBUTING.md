# Contributing To Overview

Overview is intentionally small and source-aware. Contributions should make the console more useful without making its claims less precise.

## Before You Start

1. Run the project from a local HTTP server.
2. Read the adapter and provider documentation for the source you are changing.
3. Check that the source permits the proposed browser or redistribution use.

Install nothing for the core checks. Run `npm test`; the same checks run in GitHub Actions from `.github/workflows/quality.yml`.

## Adding A Layer

1. Create one adapter in `assets/layers/`.
2. Register it with `Overview.registerLayer`.
3. Return valid `{ lat, lon, size, label }` points.
4. Add an optional `line` route only when the source provides real geometry.
5. A fetcher may return `{ points, source, fallback }` to keep fallback provenance visible.
6. Document refresh limits, credentials, CORS behavior, and licensing.
7. Keep the layer disabled by default if it needs a key or relay.
8. Add the layer to `assets/layer-registry.js` so its provenance and terms are visible to contributors.
9. Add or update a `replay-packs/*.json` fixture when live data is not deterministic.

## Pull Request Checklist

- The source URL and terms are documented.
- A failed request does not break unrelated layers.
- Live, standby, syncing, and unavailable states remain truthful.
- No API keys, private data, or fabricated observations are committed.
- Desktop and mobile layouts remain usable.
- The README explains any new user-facing behavior.
- `node scripts/validate-replay.mjs` passes for every replay pack.
- The adapter returns points accepted by `OverviewSignalSchema`.

Small, focused pull requests are easier to review and safer to deploy.
