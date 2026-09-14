# Contributing To Overview

Overview is intentionally small and source-aware. Contributions should make the console more useful without making its claims less precise.

## Before You Start

1. Run the project from a local HTTP server.
2. Read the adapter and provider documentation for the source you are changing.
3. Check that the source permits the proposed browser or redistribution use.

For a quick pre-commit syntax check, run `node scripts/check.mjs`. The same check runs in GitHub Actions from `.github/workflows/quality.yml`.

## Adding A Layer

1. Create one adapter in `assets/layers/`.
2. Register it with `Overview.registerLayer`.
3. Return valid `{ lat, lon, size, label }` points.
4. Add an optional `line` route only when the source provides real geometry.
5. A fetcher may return `{ points, source, fallback }` to keep fallback provenance visible.
6. Document refresh limits, credentials, CORS behavior, and licensing.
7. Keep the layer disabled by default if it needs a key or relay.

## Pull Request Checklist

- The source URL and terms are documented.
- A failed request does not break unrelated layers.
- Live, standby, syncing, and unavailable states remain truthful.
- No API keys, private data, or fabricated observations are committed.
- Desktop and mobile layouts remain usable.
- The README explains any new user-facing behavior.

Small, focused pull requests are easier to review and safer to deploy.
