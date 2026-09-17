# Replay Packs

Replay packs are portable, deterministic scenes for demos, documentation, and tests. They never claim to be live data.

## Contract

Each JSON file must use `overview.replay.v1` and include:

- `id`, `label`, `description`, and `capturedAt`
- `sources[]` with a source URL and license note
- `layers.<layerId>.points[]` with valid `lat`, `lon`, and `label`, `name`, or `id`

Validate all packs with:

```sh
npm test
```

The current pack is `pacific-rim-demo.json`. The built-in browser replay remains available when no external pack loader is configured.
