/**
 * Command deck
 * -------------------------------------------------------------
 * Adds the high-frequency controls that make a situation room useful:
 * region focus, signal search, source-window context, and export.
 */

(() => {
  const regionNames = {
    global: 'GLOBAL',
    americas: 'AMERICAS',
    mena: 'MENA',
    europe: 'EUROPE',
    asia: 'ASIA',
    japan: 'JAPAN',
    'latin-america': 'LATIN AMERICA',
    africa: 'AFRICA',
    oceania: 'OCEANIA'
  };

  const regionFilter = document.getElementById('region-filter');
  const search = document.getElementById('command-search');
  const readout = document.getElementById('command-readout');
  const exportButton = document.getElementById('export-snapshot');
  const refreshButton = document.getElementById('refresh-data');
  const exportHistoryButton = document.getElementById('export-history');
  const importHistoryButton = document.getElementById('import-history');
  const historyFile = document.getElementById('history-file');
  const historyFormat = document.getElementById('history-format');
  const context = document.querySelector('.map-context');
  const historyStatus = document.getElementById('history-status');
  const windowButtons = [...document.querySelectorAll('[data-window]')];
  let currentWindow = '24h';
  let windowLabel = '24H SOURCE WINDOW';

  function snapshots() {
    if (typeof Overview === 'undefined' || !Overview.getLayerSnapshot) return [];
    return ['earthquakes', 'satellites', 'flights', 'ships', 'news', 'cables', 'buildings']
      .map(id => Overview.getLayerSnapshot(id))
      .filter(Boolean);
  }

  function renderReadout() {
    const configuredWindow = Overview.getWindow?.();
    if (configuredWindow && configuredWindow !== currentWindow) {
      currentWindow = configuredWindow;
      windowLabel = currentWindow === '7d' ? '7D VIEW / SOURCE-BOUNDED' : '24H SOURCE WINDOW';
    }
    const active = snapshots().filter(layer => layer.enabled);
    const observations = active.reduce((total, layer) => total + (layer.visibleCount ?? layer.count), 0);
    const region = regionNames[regionFilter?.value] || 'GLOBAL';
    if (readout) readout.textContent = `${region} / ${observations} OBSERVATIONS`;
    if (context) context.textContent = `${region} / NATURAL EARTH PROJECTION`;
    if (historyStatus) historyStatus.textContent = currentWindow === '7d'
      ? (typeof OverviewHistory !== 'undefined' && OverviewHistory.available()
        ? (OverviewHistory.remote ? 'SHARED HISTORY' : 'LOCAL HISTORY')
        : 'SOURCE-BOUNDED')
      : 'LIVE WINDOW';
    if (exportButton) exportButton.title = `${windowLabel} / ${region} / ${observations} observations`;
  }

  function exportSnapshot() {
    const payload = {
      exportedAt: new Date().toISOString(),
      mode: typeof Overview !== 'undefined' ? Overview.getMode() : 'unknown',
      region: regionFilter?.value || 'global',
      window: windowLabel,
      search: search?.value.trim() || '',
      mission: {
        query: document.getElementById('planet-query-input')?.value.trim() || '',
        timeCursor: Overview.getTimeCursor?.() || null,
        anomalyMode: Boolean(Overview.getAnomalyMode?.()),
        alertRules: window.OverviewAlerts?.list?.() || []
      },
      layers: snapshots().map(layer => ({
        id: layer.id,
        label: layer.label,
        status: layer.status,
        enabled: layer.enabled,
        count: layer.count,
        visibleCount: layer.visibleCount ?? layer.count,
        source: layer.source,
        sourceUrl: layer.sourceUrl,
        lastUpdated: layer.lastUpdated,
        points: layer.points
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overview-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (exportButton) {
      exportButton.textContent = 'SNAPSHOT READY ↓';
      window.setTimeout(() => { exportButton.innerHTML = 'EXPORT SNAPSHOT <span>↓</span>'; }, 1800);
    }
  }

  function downloadFile(name, body, type) {
    const blob = new Blob([body], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(value) {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  async function exportHistory() {
    if (typeof OverviewHistory === 'undefined' || !OverviewHistory.exportData) return;
    exportHistoryButton.disabled = true;
    try {
      const payload = await OverviewHistory.exportData();
      const format = historyFormat?.value || 'json';
      const date = new Date().toISOString().slice(0, 10);
      if (format === 'geojson') {
        const features = payload.snapshots.flatMap(snapshot => (snapshot.points || []).map(point => ({
          ...point,
          layerId: snapshot.layerId,
          capturedAt: snapshot.capturedAt
        })));
        const geojson = typeof OverviewSignalSchema !== 'undefined'
          ? OverviewSignalSchema.toGeoJSON(features, { exportedAt: payload.exportedAt })
          : { type: 'FeatureCollection', features: [] };
        downloadFile(`overview-history-${date}.geojson`, JSON.stringify(geojson, null, 2), 'application/geo+json');
      } else if (format === 'csv') {
        const rows = [['layerId', 'capturedAt', 'id', 'lat', 'lon', 'label', 'observedAt', 'source', 'sourceUrl']];
        payload.snapshots.forEach(snapshot => (snapshot.points || []).forEach(point => rows.push([
          snapshot.layerId, new Date(snapshot.capturedAt).toISOString(), point.id || '', point.lat, point.lon,
          point.label || point.name || '', point.observedAt || '', point.provenance?.source || '', point.provenance?.sourceUrl || ''
        ])));
        downloadFile(`overview-history-${date}.csv`, rows.map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv');
      } else {
        downloadFile(`overview-history-${date}.json`, JSON.stringify(payload, null, 2), 'application/json');
      }
      if (historyStatus) historyStatus.textContent = `HISTORY EXPORTED / ${format.toUpperCase()}`;
    } finally {
      exportHistoryButton.disabled = false;
    }
  }

  async function importHistoryFile(event) {
    const file = event.target.files?.[0];
    if (!file || typeof OverviewHistory === 'undefined' || !OverviewHistory.importData) return;
    try {
      const payload = JSON.parse(await file.text());
      const result = await OverviewHistory.importData(payload);
      await Overview.setWindow('7d');
      if (historyStatus) historyStatus.textContent = `HISTORY IMPORTED / ${result.snapshots} SNAPSHOTS`;
    } catch (error) {
      if (historyStatus) historyStatus.textContent = 'HISTORY IMPORT FAILED';
    } finally {
      event.target.value = '';
    }
  }

  regionFilter?.addEventListener('change', () => {
    Overview.setRegion(regionFilter.value);
    renderReadout();
  });
  search?.addEventListener('input', () => {
    Overview.setSearch(search.value);
    renderReadout();
  });
  windowButtons.forEach(button => {
    button.addEventListener('click', () => {
      currentWindow = button.dataset.window === '7d' ? '7d' : '24h';
      Overview.setWindow(currentWindow);
      windowLabel = currentWindow === '7d' ? '7D VIEW / SOURCE-BOUNDED' : '24H SOURCE WINDOW';
      windowButtons.forEach(item => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      renderReadout();
    });
  });
  exportButton?.addEventListener('click', exportSnapshot);
  exportHistoryButton?.addEventListener('click', exportHistory);
  importHistoryButton?.addEventListener('click', () => historyFile?.click());
  historyFile?.addEventListener('change', importHistoryFile);
  refreshButton?.addEventListener('click', async () => {
    if (typeof Overview === 'undefined' || !Overview.refreshActive) return;
    refreshButton.disabled = true;
    refreshButton.textContent = 'SYNCING…';
    try {
      await Overview.refreshActive();
      refreshButton.textContent = 'SYNC COMPLETE';
    } finally {
      window.setTimeout(() => {
        refreshButton.disabled = false;
        refreshButton.textContent = 'SYNC ACTIVE ↻';
      }, 1200);
    }
  });
  document.getElementById('map-zoom-in')?.addEventListener('click', () => Overview.zoomBy?.(1.6));
  document.getElementById('map-zoom-out')?.addEventListener('click', () => Overview.zoomBy?.(0.625));
  document.getElementById('map-zoom-reset')?.addEventListener('click', () => Overview.resetZoom?.());
  window.addEventListener('overview:layer', renderReadout);
  window.addEventListener('overview:view-changed', renderReadout);
  window.addEventListener('overview:region-changed', renderReadout);
  window.addEventListener('overview:window-changed', event => {
    currentWindow = event.detail?.window === '7d' ? '7d' : '24h';
    windowLabel = currentWindow === '7d' ? '7D VIEW / SOURCE-BOUNDED' : '24H SOURCE WINDOW';
    windowButtons.forEach(button => {
      const active = button.dataset.window === currentWindow;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    renderReadout();
  });
  window.addEventListener('overview:search-changed', renderReadout);
  window.addEventListener('overview:time-changed', renderReadout);
  window.addEventListener('overview:anomaly-changed', renderReadout);
  renderReadout();
})();
