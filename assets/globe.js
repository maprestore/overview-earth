/**
 * Overview — core engine
 * -------------------------------------------------------------
 * This file knows nothing about earthquakes, satellites, or any
 * specific data source. It only knows how to:
 *   1. Draw a world map
 *   2. Accept "layers" that each provide points, with optional line routes
 *   3. Render a toggle in the sidebar for each registered layer
 *   4. Refresh each layer on its own schedule
 *
 * TO ADD A NEW LAYER: see assets/layers/earthquakes.js for the
 * full pattern. In short, call:
 *
 *   Overview.registerLayer({
 *     id: 'earthquakes',
 *     label: 'Earthquakes (USGS)',
 *     color: '#F0C419',
 *     defaultOn: true,
 *     refreshMs: 60000,
 *     fetchPoints: async () => [{ lat, lon, size, label }, ...]
 *   });
 *
 * Then add a <script> tag for your new layer file in index.html.
 */

const Overview = (() => {
  const WORLD_ATLAS_URLS = [
    'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json',
    'https://unpkg.com/world-atlas@2/land-110m.json'
  ];

  const width = 960, height = 500;
  const projection = d3.geoNaturalEarth1().scale(155).translate([width / 2, height / 2]);
  const path = d3.geoPath(projection);
  const svg = d3.select('#map');
  const scene = svg.append('g').attr('class', 'map-scene');
  let zoomScale = 1;
  const zoomBehavior = d3.zoom()
    .scaleExtent([1, 8])
    .on('zoom', event => {
      zoomScale = event.transform.k;
      scene.attr('transform', event.transform);
      for (const [id] of layers) render(id);
    });
  svg.call(zoomBehavior);

  const regionBounds = {
    global: null,
    americas: [-170, 72, -30, -56],
    mena: [25, 42, 65, 10],
    europe: [-25, 72, 45, 35],
    asia: [40, 78, 180, -10],
    japan: [122, 46, 146, 24],
    'latin-america': [-120, 33, -30, -56],
    africa: [-20, 38, 55, -35],
    oceania: [110, 10, 180, -50]
  };

  const layers = new Map(); // id -> { config, points: [], layerGroup, enabled }
  let currentStory = 'baseline';
  let dataMode = 'live';
  let focusRegion = 'global';
  let searchTerm = '';
  let focusWindow = '24h';
  let timeCursor = null;
  let anomalyMode = false;
  let worldLoadError = false;

  function setStatus(text, hide = false) {
    const el = document.getElementById('status');
    el.textContent = text;
    el.classList.toggle('hidden', hide);
  }

  function updateClock() {
    document.getElementById('clock').textContent =
      new Date().toISOString().slice(11, 19) + 'Z';
  }

  function emitLayerEvent(id) {
    const layer = layers.get(id);
    if (!layer) return;
    window.dispatchEvent(new CustomEvent('overview:layer', {
      detail: {
        id,
        label: layer.config.label,
        status: layer.status,
        enabled: layer.enabled,
        count: layer.points.length,
        points: layer.points,
        lastUpdated: layer.lastUpdated,
        error: layer.error,
        mode: layer.mode,
        source: layer.source
      }
    }));
  }

  function emitViewEvent() {
    window.dispatchEvent(new CustomEvent('overview:view-changed', {
      detail: { story: currentStory, layerIds: getViewState(), mode: dataMode }
    }));
  }

  function formatLayerStatus(layer) {
    if (!layer.enabled) return 'STANDBY';
    if (layer.status === 'loading') return 'SYNCING';
    if (layer.status === 'standby') return 'NOT CONFIGURED';
    if (layer.status === 'replay') return 'REPLAY';
    if (layer.status === 'fallback') return 'FALLBACK';
    if (layer.status === 'unavailable') return 'UNAVAILABLE';
    if (layer.status === 'online' && layer.lastUpdated) {
      return `LIVE ${new Date(layer.lastUpdated).toISOString().slice(11, 16)}Z`;
    }
    return 'READY';
  }

  function updateLayerRow(id) {
    const layer = layers.get(id);
    if (!layer?.row) return;
    const meta = layer.row.querySelector('[data-layer-meta]');
    if (meta) meta.textContent = formatLayerStatus(layer);
    layer.row.dataset.state = layer.status;
    layer.row.title = layer.error
      ? `${layer.config.label} — ${layer.error}`
      : `${layer.config.label} — ${formatLayerStatus(layer).toLowerCase()}${layer.source ? ` — ${layer.source}` : ''}`;
  }

  async function loadWorld() {
    const world = typeof OverviewSources !== 'undefined'
      ? (await OverviewSources.json(WORLD_ATLAS_URLS)).data
      : await d3.json(WORLD_ATLAS_URLS[0]);
    const land = topojson.feature(world, world.objects.land);
    scene.insert('g', ':first-child')
      .selectAll('path')
      .data(land.features)
      .join('path')
      .attr('class', 'land')
      .attr('d', path);
  }

  function pointIsVisible(point) {
    const haystack = `${point?.label || ''} ${point?.name || ''} ${point?.place || ''} ${point?.id || ''}`.toLowerCase();
    if (searchTerm && !haystack.includes(searchTerm)) return false;
    const timestamp = pointTimestamp(point);
    if (timestamp != null) {
      if (focusWindow === '7d' && timeCursor != null && timestamp > timeCursor) return false;
      const age = Date.now() - timestamp;
      const windowMs = focusWindow === '7d' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      if (age < -5 * 60 * 1000 || age > windowMs) return false;
    }
    const bounds = regionBounds[focusRegion];
    if (!bounds) return true;
    const [west, north, east, south] = bounds;
    const lat = Number(point?.lat);
    const lon = Number(point?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat <= north && lat >= south && lon >= west && lon <= east;
  }

  function pointIsRendered(point, layerId) {
    if (!pointIsVisible(point)) return false;
    if (!anomalyMode || layerId !== 'earthquakes') return true;
    return Number(point.magnitude ?? point.mag ?? point.size) >= 4.5;
  }

  function pointTimestamp(point) {
    const value = point?.time ?? point?.timestamp ?? point?.seendate ?? point?.observedAt;
    if (value == null || value === '') return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clusterPoints(points) {
    const threshold = 12 / zoomScale;
    const buckets = new Map();
    for (const point of points) {
      const projected = projection([point.lon, point.lat]);
      if (!projected) continue;
      const key = `${Math.floor(projected[0] / threshold)}:${Math.floor(projected[1] / threshold)}`;
      const bucket = buckets.get(key) || [];
      bucket.push(point);
      buckets.set(key, bucket);
    }

    return [...buckets.values()].map(bucket => {
      if (bucket.length === 1) return bucket[0];
      const lat = bucket.reduce((sum, point) => sum + Number(point.lat), 0) / bucket.length;
      const lon = bucket.reduce((sum, point) => sum + Number(point.lon), 0) / bucket.length;
      return {
        id: `cluster-${Math.round(lat * 100)}:${Math.round(lon * 100)}:${bucket.length}`,
        lat,
        lon,
        size: Math.min(12, 4 + Math.sqrt(bucket.length)),
        isCluster: true,
        clusterCount: bucket.length,
        label: `${bucket.length} observations in this area`
      };
    });
  }

  function inspectSignal(point, layerId) {
    const layer = layers.get(layerId);
    if (!layer) return;
    const registry = typeof OverviewLayerRegistry !== 'undefined' ? OverviewLayerRegistry.get(layerId) : null;
    window.dispatchEvent(new CustomEvent('overview:signal-selected', {
      detail: {
        ...point,
        layerId,
        layerLabel: layer.config.label,
        source: layer.source,
        sourceUrl: layer.config.sourceUrl || registry?.sourceUrl || '',
        provenance: point.provenance || {
          source: layer.source || registry?.source || '',
          sourceUrl: layer.config.sourceUrl || registry?.sourceUrl || '',
          fetchedAt: layer.lastUpdated ? new Date(layer.lastUpdated).toISOString() : '',
          attribution: registry?.license || layer.source || '',
          license: registry?.license || 'Source terms apply',
          confidence: 'source-reported'
        }
      }
    }));
  }

  function bindSignalSelection(selection, layerId) {
    return selection
      .on('click', (event, point) => {
        event.stopPropagation();
        if (point.isCluster) zoomToPoint(point);
        inspectSignal(point, layerId);
      })
      .on('keydown', (event, point) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (point.isCluster) zoomToPoint(point);
        inspectSignal(point, layerId);
      })
      .on('focus', (event, point) => inspectSignal(point, layerId));
  }

  function zoomToPoint(point) {
    const projected = projection([point.lon, point.lat]);
    if (!projected) return;
    const scale = Math.min(8, Math.max(zoomScale * 1.8, 2.2));
    const transform = d3.zoomIdentity
      .translate(width / 2 - projected[0] * scale, height / 2 - projected[1] * scale)
      .scale(scale);
    svg.transition().duration(260).call(zoomBehavior.transform, transform);
  }

  function zoomBy(factor) {
    svg.transition().duration(180).call(zoomBehavior.scaleBy, factor);
  }

  function resetZoom() {
    svg.transition().duration(180).call(zoomBehavior.transform, d3.zoomIdentity);
  }

  function registerLayer(config) {
    const lineGroup = scene.append('g').attr('class', `layer-lines layer-lines-${config.id}`);
    const group = scene.append('g').attr('class', `layer layer-${config.id}`);
    const enabled = config.defaultOn !== false;
    lineGroup.style('display', enabled ? null : 'none');
    group.style('display', enabled ? null : 'none');
    layers.set(config.id, {
      config,
      points: [],
      currentPoints: [],
      lineGroup,
      group,
      enabled,
      row: null,
      status: enabled ? 'ready' : 'standby',
      lastUpdated: null,
      error: null,
      mode: dataMode,
      source: config.source || '',
      requestId: 0
    });
    addPanelToggle(config);
  }

  function addPanelToggle(config) {
    const panel = document.getElementById('layer-panel');
    const list = document.getElementById('layer-list') || panel;
    const row = document.createElement('label');
    row.className = 'layer-toggle';
    row.innerHTML = `
      <input type="checkbox" ${config.defaultOn !== false ? 'checked' : ''} data-layer="${config.id}" aria-label="Toggle ${config.label}">
      <span class="swatch" style="background:${config.color}"></span>
      <span class="layer-copy">
        <span class="layer-name">${config.label}</span>
        <span class="layer-meta" data-layer-meta> ${config.defaultOn !== false ? 'READY' : 'STANDBY'}</span>
      </span>
    `;
    row.querySelector('input').addEventListener('change', (e) => {
      setLayerEnabled(config.id, e.target.checked);
      currentStory = 'custom';
      emitViewEvent();
    });
    layers.get(config.id).row = row;
    list.appendChild(row);
    updateLayerRow(config.id);
  }

  function setLayerEnabled(id, enabled, refresh = true) {
    const layer = layers.get(id);
    if (!layer) return;
    layer.enabled = enabled;
    layer.group.style('display', enabled ? null : 'none');
    layer.lineGroup.style('display', enabled ? null : 'none');
    const input = layer.row?.querySelector('input');
    if (input) input.checked = enabled;
    if (!enabled) {
      layer.requestId += 1;
      layer.currentPoints = [];
      layer.points = [];
      layer.status = 'standby';
      layer.error = null;
      layer.mode = dataMode;
      updateLayerRow(id);
    } else if (refresh) {
      refreshLayer(id);
    } else {
      layer.status = layer.lastUpdated ? 'online' : 'ready';
      layer.mode = dataMode;
      updateLayerRow(id);
    }
    updateStatsRow();
  }

  async function applyDisplayWindow(layer) {
    const currentPoints = layer.currentPoints || layer.points;
    layer.points = currentPoints;
    if (focusWindow !== '7d' || dataMode !== 'live' || typeof OverviewHistory === 'undefined') return;
    const history = await OverviewHistory.pointsFor(layer.config.id);
    if (!history.length) return;
    const existing = new Set(history.map(point => `${pointKey(point)}:${point.time || point.observedAt || ''}`));
    layer.points = [...history, ...currentPoints.filter(point => (
      !existing.has(`${pointKey(point)}:${point.time || point.observedAt || ''}`)
    ))];
  }

  function render(id) {
    const layer = layers.get(id);
    if (!layer) return;
    const visiblePoints = layer.points.filter(point => pointIsRendered(point, id));

    const lineData = visiblePoints.flatMap(point => {
      const routes = Array.isArray(point.lines) ? point.lines : [point.line];
      return routes
        .filter(route => Array.isArray(route) && route.length > 1)
        .map((lineRoute, segment) => ({ ...point, line: lineRoute, segment }));
    });
    const line = d3.line()
      .defined(point => projection(point))
      .x(point => projection(point)[0])
      .y(point => projection(point)[1]);
    const lineSel = layer.lineGroup.selectAll('path').data(lineData, point => `${pointKey(point)}:${point.segment || 0}`);
    lineSel.exit().remove();
    lineSel.enter()
      .append('path')
      .merge(lineSel)
      .attr('class', 'layer-line')
      .attr('stroke', layer.config.color)
      .attr('stroke-width', id === 'buildings' ? 0.55 : 1.25)
      .attr('d', point => line(point.line));

    const isAircraft = id === 'flights';
    const isFootprint = id === 'buildings';
    const aircraftPath = 'M0,-8 L2,-2 L7,2 L7,4 L2,3 L1,8 L-1,8 L-2,3 L-7,4 L-7,2 L-2,-2 Z';
    const flightSel = layer.group.selectAll('path.aircraft-marker').data(isAircraft ? visiblePoints : [], pointKey);
    flightSel.exit().remove();
    const aircraft = flightSel.enter()
      .append('path')
      .merge(flightSel)
      .attr('class', 'layer-dot aircraft-marker')
      .attr('fill', layer.config.color)
      .attr('d', aircraftPath)
      .attr('tabindex', '0')
      .attr('role', 'img')
      .attr('aria-label', d => d.label || 'Aircraft')
      .attr('transform', d => {
        const p = projection([d.lon, d.lat]);
        return p ? `translate(${p[0]},${p[1]}) rotate(${Number(d.heading) || 0}) scale(${Math.max(0.55, (d.size || 3) / 3)})` : 'translate(-10,-10)';
      });
    bindSignalSelection(aircraft, id);

    const pointData = !isAircraft && !isFootprint ? clusterPoints(visiblePoints) : [];
    const clusterSel = layer.group.selectAll('circle.cluster-marker')
      .data(pointData.filter(point => point.isCluster), pointKey);
    clusterSel.exit().remove();
    const clusters = clusterSel.enter()
      .append('circle')
      .merge(clusterSel)
      .attr('class', 'layer-dot cluster-marker')
      .attr('fill', layer.config.color)
      .attr('tabindex', '0')
      .attr('role', 'img')
      .attr('aria-label', d => d.label)
      .attr('cx', d => projection([d.lon, d.lat])?.[0] ?? -10)
      .attr('cy', d => projection([d.lon, d.lat])?.[1] ?? -10)
      .attr('r', d => d.size);
    bindSignalSelection(clusters, id);

    const sel = layer.group.selectAll('circle.signal-marker')
      .data(pointData.filter(point => !point.isCluster), pointKey);
    sel.exit().remove();
    const dots = sel.enter()
      .append('circle')
      .merge(sel)
      .attr('class', 'layer-dot signal-marker')
      .attr('fill', layer.config.color)
      .attr('tabindex', '0')
      .attr('role', 'img')
      .attr('aria-label', d => d.label || 'Data point')
      .attr('cx', d => {
        const p = projection([d.lon, d.lat]);
        return p ? p[0] : -10;
      })
      .attr('cy', d => {
        const p = projection([d.lon, d.lat]);
        return p ? p[1] : -10;
      })
      .attr('r', d => d.size || 3);
    bindSignalSelection(dots, id);

    aircraft.selectAll('title')
      .data(d => [d])
      .join('title')
      .text(d => d.label || '');
    dots.selectAll('title')
      .data(d => [d])
      .join('title')
      .text(d => d.label || '');
    clusters.selectAll('title')
      .data(d => [d])
      .join('title')
      .text(d => d.label || '');
  }

  function pointKey(point) {
    return point.id || `${point.lat}:${point.lon}:${point.label || ''}`;
  }

  function updateStatsRow() {
    const row = document.getElementById('stats-row');
    row.innerHTML = '';
    for (const [id, layer] of layers) {
      if (!layer.enabled) continue;
      const el = document.createElement('div');
      el.className = 'stat';
      el.innerHTML = `
        <div class="stat-label">${layer.config.label.toUpperCase()}</div>
         <div class="stat-value">${layer.points.filter(point => pointIsRendered(point, id)).length}</div>
      `;
      row.appendChild(el);
    }
  }

  async function refreshLayer(id) {
    const layer = layers.get(id);
    if (!layer) return;
    const requestId = ++layer.requestId;
    const requestMode = dataMode;
    layer.status = 'loading';
    layer.error = null;
    layer.mode = requestMode;
    updateLayerRow(id);
    emitLayerEvent(id);
    try {
      const result = requestMode === 'replay' && typeof OverviewReplay !== 'undefined'
        ? OverviewReplay.pointsFor(id)
        : await layer.config.fetchPoints();
      if (layer.requestId !== requestId || dataMode !== requestMode) return;
      const points = Array.isArray(result) ? result : result?.points;
      if (!Array.isArray(points)) throw new Error('layer returned a non-array result');
      const sourceName = requestMode === 'replay'
        ? 'bundled replay fixture'
        : Array.isArray(result) ? layer.config.source || '' : result.source || layer.config.source || '';
      const normalized = typeof OverviewSignalSchema !== 'undefined'
        ? OverviewSignalSchema.normalizePoints(points, {
          layerId: id,
          source: sourceName,
          sourceUrl: layer.config.sourceUrl || '',
          fetchedAt: Date.now()
        }).points
        : points;
      const capturedAt = Date.now();
      layer.currentPoints = normalized.filter(point => (
        Number.isFinite(point?.lat) && Number.isFinite(point?.lon)
      )).map(point => point.observedAt || pointTimestamp(point) != null
        ? point
        : { ...point, observedAt: capturedAt });
      layer.points = layer.currentPoints;
      layer.source = sourceName;
      layer.status = requestMode === 'replay'
        ? 'replay'
        : result.status || (Array.isArray(result) || !result.fallback ? 'online' : 'fallback');
      if (layer.status !== 'standby') layer.lastUpdated = Date.now();
      if (requestMode === 'live' && typeof OverviewHistory !== 'undefined') {
        void OverviewHistory.record(id, layer.currentPoints, layer.lastUpdated || Date.now());
      }
      await applyDisplayWindow(layer);
      if (layer.requestId !== requestId || dataMode !== requestMode) return;
      layer.error = null;
      layer.row?.classList.remove('layer-error');
      updateLayerRow(id);
      render(id);
      updateStatsRow();
      emitLayerEvent(id);
      if (dataMode === 'replay' && id === 'news' && typeof OverviewReplay !== 'undefined') {
        window.dispatchEvent(new CustomEvent('overview:gdelt', {
          detail: { status: 'online', replay: true, articles: OverviewReplay.articles }
        }));
      }
    } catch (err) {
      if (layer.requestId !== requestId || dataMode !== requestMode) return;
      layer.status = 'unavailable';
      layer.error = err.message || 'feed unavailable';
      layer.row?.classList.add('layer-error');
      updateLayerRow(id);
      emitLayerEvent(id);
      console.error(`Overview: layer "${id}" failed to refresh`, err);
    }
  }

  function getViewState() {
    return [...layers]
      .filter(([, layer]) => layer.enabled)
      .map(([id]) => id);
  }

  function setRegion(region) {
    focusRegion = regionBounds[region] ? region : 'global';
    const regionInput = document.getElementById('region-filter');
    if (regionInput) regionInput.value = focusRegion;
    for (const [id] of layers) render(id);
    updateStatsRow();
    window.dispatchEvent(new CustomEvent('overview:region-changed', { detail: { region: focusRegion } }));
  }

  function setSearch(value) {
    searchTerm = String(value || '').trim().toLowerCase();
    for (const [id] of layers) render(id);
    updateStatsRow();
    window.dispatchEvent(new CustomEvent('overview:search-changed', { detail: { search: searchTerm } }));
  }

  async function setWindow(value) {
    focusWindow = value === '7d' ? '7d' : '24h';
    if (focusWindow !== '7d') timeCursor = null;
    window.dispatchEvent(new CustomEvent('overview:window-changed', { detail: { window: focusWindow } }));
    await Promise.all([...layers].map(async ([id, layer]) => {
      await applyDisplayWindow(layer);
      render(id);
      emitLayerEvent(id);
    }));
    updateStatsRow();
  }

  function getLayerSnapshot(id) {
    const layer = layers.get(id);
    if (!layer) return null;
    return {
      id,
      label: layer.config.label,
      status: layer.status,
      enabled: layer.enabled,
      points: layer.points,
      count: layer.points.length,
      visibleCount: layer.points.filter(point => pointIsRendered(point, id)).length,
      lastUpdated: layer.lastUpdated,
      error: layer.error,
      mode: layer.mode,
      source: layer.source,
      sourceUrl: layer.config.sourceUrl || ''
    };
  }

  function setTimeCursor(value) {
    const numeric = Number(value);
    timeCursor = Number.isFinite(numeric) ? numeric : null;
    for (const [id] of layers) render(id);
    updateStatsRow();
    window.dispatchEvent(new CustomEvent('overview:time-changed', { detail: { cursor: timeCursor } }));
  }

  function setAnomalyMode(value) {
    anomalyMode = Boolean(value);
    for (const [id] of layers) render(id);
    updateStatsRow();
    window.dispatchEvent(new CustomEvent('overview:anomaly-changed', { detail: { enabled: anomalyMode } }));
  }

  async function setMode(mode, options = {}) {
    dataMode = mode === 'replay' ? 'replay' : 'live';
    for (const [, layer] of layers) {
      layer.mode = dataMode;
      layer.requestId += 1;
    }
    if (options.refresh !== false) {
      if (dataMode === 'replay' && typeof OverviewReplay !== 'undefined' && OverviewReplay.loadPack) {
        await OverviewReplay.loadPack();
      }
      await Promise.all([...layers]
        .filter(([, layer]) => layer.enabled)
        .map(([id]) => refreshLayer(id)));
    }
    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent('overview:mode-changed', { detail: { mode: dataMode } }));
    }
  }

  async function applyView(layerIds, options = {}) {
    const requested = new Set(layerIds || []);
    currentStory = options.story || 'custom';
    for (const [id] of layers) setLayerEnabled(id, requested.has(id), false);
    updateStatsRow();
    if (options.refresh !== false) {
      await Promise.all([...layers]
        .filter(([, layer]) => layer.enabled)
        .map(([id]) => refreshLayer(id)));
    }
    if (options.emit !== false) emitViewEvent();
  }

  async function init(options = {}) {
    setInterval(updateClock, 1000);
    updateClock();

    if (options.mode) dataMode = options.mode === 'replay' ? 'replay' : 'live';
    focusRegion = Object.prototype.hasOwnProperty.call(regionBounds, options.region) ? options.region : 'global';
    searchTerm = String(options.search || '').trim().toLowerCase();
    focusWindow = options.window === '7d' ? '7d' : '24h';
    timeCursor = options.window === '7d' && Number.isFinite(Number(options.at)) ? Number(options.at) : null;
    anomalyMode = Boolean(options.anomaly);
    const regionInput = document.getElementById('region-filter');
    const searchInput = document.getElementById('command-search');
    if (regionInput) regionInput.value = focusRegion;
    if (searchInput) searchInput.value = options.search || '';
    document.querySelectorAll('[data-window]').forEach(button => {
      const active = button.dataset.window === focusWindow;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (Array.isArray(options.layerIds)) {
      currentStory = options.story || 'custom';
      const requested = new Set(options.layerIds);
      for (const [id] of layers) setLayerEnabled(id, requested.has(id), false);
    }

    try {
      await loadWorld();
    } catch (err) {
      console.error('Overview: failed to load base map', err);
      worldLoadError = true;
      setStatus('MAP GEOMETRY FAILED TO LOAD');
    }

    setStatus('LOADING LAYERS…');

    await Promise.all([...layers]
      .filter(([, layer]) => layer.enabled)
      .map(([id]) => refreshLayer(id)));
    for (const [id, layer] of layers) {
      setInterval(() => {
        if (layer.enabled) refreshLayer(id);
      }, layer.config.refreshMs || 5 * 60 * 1000);
    }

    if (worldLoadError) setStatus('MAP GEOMETRY FAILED TO LOAD');
    else setStatus('', true);
  }

  function refreshActive() {
    return Promise.all([...layers]
      .filter(([, layer]) => layer.enabled)
      .map(([id]) => refreshLayer(id)));
  }

  return {
    registerLayer,
    init,
    refreshLayer,
    applyView,
    setMode,
    setRegion,
    setSearch,
    setWindow,
    refreshActive,
    zoomBy,
    resetZoom,
    getMode: () => dataMode,
    getRegion: () => focusRegion,
    getSearch: () => searchTerm,
    getWindow: () => focusWindow,
    getViewState,
    getLayerSnapshot,
    getLayerSnapshots: () => [...layers.keys()].map(getLayerSnapshot).filter(Boolean),
    setTimeCursor,
    getTimeCursor: () => timeCursor,
    setAnomalyMode,
    getAnomalyMode: () => anomalyMode
  };
})();
