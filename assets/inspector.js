/**
 * Persistent signal inspector and local watchlist
 * -------------------------------------------------------------
 * Keeps selected signal details usable on touch and keyboard, where hover
 * titles are not enough. Watch entries are local browser preferences only.
 */

(() => {
  const empty = document.getElementById('signal-inspector-empty');
  const content = document.getElementById('signal-inspector-content');
  const close = document.getElementById('signal-inspector-close');
  const label = document.getElementById('inspector-label');
  const layer = document.getElementById('inspector-layer');
  const position = document.getElementById('inspector-position');
  const time = document.getElementById('inspector-time');
  const source = document.getElementById('inspector-source');
  const fetched = document.getElementById('inspector-fetched');
  const confidence = document.getElementById('inspector-confidence');
  const license = document.getElementById('inspector-license');
  const sourceLink = document.getElementById('inspector-source-link');
  const watch = document.getElementById('inspector-watch');
  const brief = document.getElementById('inspector-brief');
  const status = document.getElementById('inspector-status');
  const STORAGE_KEY = 'overview.watchlist.v1';
  let selected;

  function readWatchlist() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function writeWatchlist(entries) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-50))); } catch (error) { /* optional */ }
  }

  function signalKey(signal) {
    return `${signal.layerId}:${signal.id || `${signal.lat}:${signal.lon}:${signal.label || ''}`}`;
  }

  function timestamp(signal) {
    const value = signal?.time ?? signal?.timestamp ?? signal?.seendate ?? signal?.observedAt;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatTime(signal) {
    const value = timestamp(signal);
    if (!value) return 'SOURCE FRESHNESS';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC'
    }).format(new Date(value)) + ' UTC';
  }

  function isWatched(signal) {
    const key = signalKey(signal);
    return readWatchlist().some(entry => entry.key === key);
  }

  function render(signal) {
    selected = signal;
    empty.hidden = true;
    content.hidden = false;
    label.textContent = signal.label || 'Unnamed observation';
    layer.textContent = signal.layerLabel || signal.layerId || 'Unknown layer';
    position.textContent = `${Number(signal.lat).toFixed(3)}, ${Number(signal.lon).toFixed(3)}`;
    time.textContent = formatTime(signal);
    source.textContent = signal.source || 'Source status attached to layer';
    const provenance = signal.provenance || {};
    fetched.textContent = provenance.fetchedAt ? formatTime({ observedAt: provenance.fetchedAt }) : 'SOURCE FRESHNESS';
    confidence.textContent = provenance.confidence || 'SOURCE-REPORTED';
    license.textContent = provenance.license || 'SOURCE TERMS APPLY';
    const link = signal.url || signal.sourceUrl || '';
    const validLink = /^https?:\/\//i.test(link);
    sourceLink.hidden = !validLink;
    if (validLink) sourceLink.href = link;
    watch.disabled = Boolean(signal.isCluster);
    if (brief) brief.disabled = Boolean(signal.isCluster);
    watch.textContent = signal.isCluster ? 'CLUSTERS CANNOT BE WATCHED' : isWatched(signal) ? 'REMOVE WATCH' : 'WATCH SIGNAL';
    status.textContent = signal.isCluster ? `${signal.clusterCount} observations grouped here. Zoom in to split the cluster.` : '';
  }

  function clear() {
    selected = null;
    empty.hidden = false;
    content.hidden = true;
    status.textContent = '';
  }

  function toggleWatch() {
    if (!selected || selected.isCluster) return;
    const key = signalKey(selected);
    const entries = readWatchlist();
    const index = entries.findIndex(entry => entry.key === key);
    if (index >= 0) {
      entries.splice(index, 1);
      status.textContent = 'REMOVED FROM LOCAL WATCHLIST';
    } else {
      entries.push({
        key,
        layerId: selected.layerId,
        label: selected.label || 'Unnamed observation',
        id: selected.id || '',
        lat: selected.lat,
        lon: selected.lon,
        addedAt: new Date().toISOString()
      });
      status.textContent = 'ADDED TO LOCAL WATCHLIST';
    }
    writeWatchlist(entries);
    render({ ...selected, _status: status.textContent });
    status.textContent = selected._status;
  }

  window.addEventListener('overview:signal-selected', event => render(event.detail || {}));
  window.addEventListener('overview:layer', event => {
    const detail = event.detail || {};
    const watched = readWatchlist().filter(entry => entry.layerId === detail.id);
    if (!watched.length || !Array.isArray(detail.points)) return;
    const ids = new Set(detail.points.map(point => point.id).filter(Boolean));
    const active = watched.filter(entry => entry.id && ids.has(entry.id));
    if (selected && active.some(entry => entry.key === signalKey(selected))) {
      status.textContent = `WATCHED SIGNAL PRESENT / ${detail.status.toUpperCase()}`;
    }
  });
  close?.addEventListener('click', clear);
  watch?.addEventListener('click', toggleWatch);
  brief?.addEventListener('click', () => {
    if (!selected || selected.isCluster) return;
    window.dispatchEvent(new CustomEvent('overview:brief-requested', { detail: selected }));
  });

  window.OverviewWatchlist = Object.freeze({
    list: readWatchlist,
    clear: () => writeWatchlist([])
  });
})();
