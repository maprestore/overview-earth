# Layer Authoring Guide

Overview layers are small adapters around public data sources. The engine owns scheduling, validation, rendering, filtering, clustering, history, and status. A layer owns source-specific parsing and licensing.

## Start

```sh
node scripts/create-layer.mjs wildfires \
  --label "Wildfires (NASA)" \
  --source "NASA FIRMS" \
  --url https://example.org/fires
```

Then add `<script src="assets/layers/wildfires.js"></script>` to `index.html`, add an entry to `assets/layer-registry.js`, and document the source terms.

## Point Contract

Every returned point needs:

```js
{ id, lat, lon, size, label, observedAt }
```

`lat` must be between -90 and 90. `lon` must be between -180 and 180. Use `time`, `timestamp`, `seendate`, or `observedAt` when the provider supplies observation time. Use `line` or `lines` only for geometry provided by the source.

The engine normalizes valid points through `OverviewSignalSchema`. Each point receives provenance containing source, URL, observed time, fetched time, attribution, license, and confidence.

## Requirements

- Prefer official or documented public endpoints.
- Use `OverviewSources.json`, `.text`, or `.request` so timeouts and fallback URLs remain visible.
- Return `{ points, source, fallback }` when a fallback changes provenance.
- Keep credentialed or quota-sensitive sources behind a relay.
- Set `defaultOn: false` when a key, relay, or heavy query is required.
- Add a deterministic replay pack when the source is difficult to test live.

## Verify

```sh
npm test
```

Do not merge an adapter that fabricates coordinates, hides source failures, or omits attribution and licensing notes.
