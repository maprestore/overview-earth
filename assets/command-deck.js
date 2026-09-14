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
