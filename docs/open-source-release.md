# Open Source Release Surface

Overview is designed to be useful without accounts, API keys, or a build system.

## Contributor Surface

- `assets/signal-schema.js` is the stable point and provenance contract.
- `assets/layer-registry.js` is the source and licensing index.
- `docs/layer-authoring.md` explains adapter development.
- `scripts/create-layer.mjs` creates a safe starting adapter.
- `replay-packs/` holds deterministic scenes for demos and tests.
- `npm test` is the no-dependency contributor gate.

## Data Surface

Live observations can be exported as canonical history JSON, GeoJSON, or CSV. JSON preserves snapshots and provenance. GeoJSON is useful for GIS tools. CSV is intended for spreadsheets and lightweight analysis.

The history archive is browser-local by default. A managed relay can provide shared history, but it must keep credentials and ingestion tokens server-side.

## Trust Surface

The UI distinguishes source-reported observations from proximity-based context. Fusion cards are not causal claims. Missing history, unavailable feeds, provider fallbacks, and visual-only orbital context remain explicitly labeled.
