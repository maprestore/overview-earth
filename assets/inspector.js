/**
 * Evidence dossier and local watchlist
 * -------------------------------------------------------------
 * Keeps a selected signal useful on touch and keyboard, while making the
 * distinction between observation, provenance, and interpretation explicit.
 */

(() => {
  const empty = document.getElementById('signal-inspector-empty');
  const content = document.getElementById('signal-inspector-content');
  const close = document.getElementById('signal-inspector-close');
  const label = document.getElementById('inspector-label');
  const mode = document.getElementById('inspector-mode');
  const layerBadge = document.getElementById('inspector-layer-badge');
  const freshnessBadge = document.getElementById('inspector-freshness-badge');
  const confidenceBadge = document.getElementById('inspector-confidence-badge');
  const origin = document.getElementById('inspector-origin');
  const locationNote = document.getElementById('inspector-location-note');
  const layer = document.getElementById('inspector-layer');
  const position = document.getElementById('inspector-position');
  const time = document.getElementById('inspector-time');
  const source = document.getElementById('inspector-source');
  const fetched = document.getElementById('inspector-fetched');
  const confidence = document.getElementById('inspector-confidence');
  const license = document.getElementById('inspector-license');
  const sourceLink = document.getElementById('inspector-source-link');
  const focusButtons = [document.getElementById('inspector-focus'), document.getElementById('inspector-focus-action')].filter(Boolean);
  const watch = document.getElementById('inspector-watch');
  const brief = document.getElementById('inspector-brief');
  const copy = document.getElementById('inspector-copy');
  const evidenceState = document.getElementById('inspector-evidence-state');
  const relatedCount = document.getElementById('inspector-related-count');
  const relatedList = document.getElementById('inspector-related-list');
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
    if (!value) return 'SOURCE FRESHNESS UNAVAILABLE';
    return `${new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC'
    }).format(new Date(value))} UTC`;
  }

  function freshness(signal) {
    const value = timestamp(signal);
    if (!value) return 'FRESHNESS UNKNOWN';
    const ageMinutes = Math.max(0, (Date.now() - value) / 60000);
    if (ageMinutes < 1) return 'JUST NOW';
    if (ageMinutes < 60) return `${Math.round(ageMinutes)}M AGO`;
    if (ageMinutes < 1440) return `${Math.round(ageMinutes / 60)}H AGO`;
    return 'OLDER OBSERVATION';
  }

  function coordinates(signal) {
    const lat = Number(signal?.lat);
    const lon = Number(signal?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }

  function distanceKm(a, b) {
    const first = coordinates(a);
    const second = coordinates(b);
    if (!first || !second) return Infinity;
    const radians = value => value * Math.PI / 180;
    const dLat = radians(second.lat - first.lat);
    const dLon = radians(second.lon - first.lon);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const arc = 2 * Math.atan2(Math.sqrt(sinLat * sinLat + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * sinLon * sinLon), Math.sqrt(1 - (sinLat * sinLat + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * sinLon * sinLon)));
    return 6371 * arc;
  }

  function formatDistance(value) {
    if (!Number.isFinite(value)) return '';
    return value < 1000 ? `${Math.round(value)} KM` : `${(value / 1000).toFixed(1)}K KM`;
  }

  function isWatched(signal) {
    const key = signalKey(signal);
    return readWatchlist().some(entry => entry.key === key);
  }

  function relatedSignals(signal) {
    if (!signal || signal.isCluster || typeof Overview === 'undefined' || (!Overview.getVisibleContext && !Overview.getLayerSnapshots)) return [];
    return (Overview.getVisibleContext?.() || Overview.getLayerSnapshots())
      .filter(snapshot => snapshot.enabled && Array.isArray(snapshot.points))
      .flatMap(snapshot => snapshot.points.map(point => ({
        ...point,
        layerId: snapshot.id,
        layerLabel: snapshot.label,
        source: snapshot.source,
        distance: distanceKm(signal, point)
      })))
      .filter(point => signalKey(point) !== signalKey(signal) && Number.isFinite(point.distance) && point.distance <= 1200)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);
  }

  function renderRelated(signal) {
    if (!relatedList || !relatedCount) return;
    const related = relatedSignals(signal);
    relatedList.replaceChildren();
    relatedCount.textContent = `${related.length} NEARBY`;
    if (!related.length) {
      const emptyRelated = document.createElement('span');
      emptyRelated.className = 'related-empty';
      emptyRelated.textContent = 'NO SOURCE-BOUNDED CONTEXT WITHIN 1,200 KM';
      relatedList.appendChild(emptyRelated);
      return;
    }
    related.forEach(point => {
      const row = document.createElement('div');
      row.className = 'related-row';
      const title = document.createElement('strong');
      title.textContent = point.label || point.name || point.place || 'Unnamed nearby signal';
      const meta = document.createElement('span');
      meta.textContent = `${point.layerLabel || point.layerId || 'SIGNAL'} // ${formatDistance(point.distance)}`;
      row.append(title, meta);
      relatedList.appendChild(row);
    });
  }

  function focusSelected() {
    const point = coordinates(selected);
    if (!selected || !point || typeof Overview === 'undefined' || !Overview.focusCoordinates) return;
    Overview.focusCoordinates({ ...point, label: selected.label || 'selected signal' });
    status.textContent = 'MAP FOCUSED ON SELECTED OBSERVATION';
  }

  function render(signal) {
    selected = signal;
    empty.hidden = true;
    content.hidden = false;
    const provenance = signal.provenance || {};
    const point = coordinates(signal);
    const signalConfidence = String(provenance.confidence || 'SOURCE-REPORTED').toUpperCase();
    const signalFreshness = freshness(signal);
    const replay = typeof Overview !== 'undefined' && Overview.getMode?.() === 'replay';

    label.textContent = signal.label || 'Unnamed observation';
    mode.textContent = replay ? 'REPLAY / FIXTURE' : 'LIVE / SOURCE-BOUND';
    layerBadge.textContent = String(signal.layerLabel || signal.layerId || 'SIGNAL').toUpperCase();
    freshnessBadge.textContent = signalFreshness;
    confidenceBadge.textContent = signalConfidence;
    confidenceBadge.className = `inspector-badge inspector-badge-confidence is-${signalConfidence.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    origin.textContent = point ? `${point.lat.toFixed(3)}°, ${point.lon.toFixed(3)}°` : 'LOCATION UNAVAILABLE';
    locationNote.textContent = signal.layerId === 'news'
      ? 'Reporting-origin centroid; not confirmed event location.'
      : signal.isCluster
        ? `${signal.clusterCount || 'Multiple'} observations grouped at this display point.`
        : 'Coordinates supplied by the documented source.';
    layer.textContent = signal.layerLabel || signal.layerId || 'Unknown layer';
    position.textContent = point ? `${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}` : 'SOURCE DID NOT PROVIDE COORDINATES';
    time.textContent = formatTime(signal);
    source.textContent = signal.source || 'Source status attached to layer';
    fetched.textContent = provenance.fetchedAt ? formatTime({ observedAt: provenance.fetchedAt }) : 'SOURCE FETCH TIME UNAVAILABLE';
    confidence.textContent = signalConfidence;
    license.textContent = provenance.license || 'SOURCE TERMS APPLY';
    const link = signal.url || signal.sourceUrl || '';
    const validLink = /^https?:\/\//i.test(link);
    sourceLink.hidden = !validLink;
    if (validLink) sourceLink.href = link;
    focusButtons.forEach(button => { button.disabled = signal.isCluster || !point; });
    watch.disabled = Boolean(signal.isCluster);
    if (brief) brief.disabled = Boolean(signal.isCluster);
    if (copy) copy.disabled = Boolean(signal.isCluster);
    watch.textContent = signal.isCluster ? 'CLUSTER NOT WATCHABLE' : isWatched(signal) ? 'REMOVE WATCH' : 'WATCH SIGNAL';
    evidenceState.textContent = signal.isCluster ? 'AGGREGATED DISPLAY' : validLink ? 'SOURCE ATTACHED' : 'SOURCE LINK UNAVAILABLE';
    status.textContent = signal.isCluster ? `${signal.clusterCount} observations grouped here. Zoom in to split the cluster.` : '';
    renderRelated(signal);
  }

  function clear() {
    selected = null;
    empty.hidden = false;
    content.hidden = true;
    status.textContent = '';
    relatedList?.replaceChildren();
  }

  function toggleWatch() {
    if (!selected || selected.isCluster) return;
    const key = signalKey(selected);
    const entries = readWatchlist();
    const index = entries.findIndex(entry => entry.key === key);
    const message = index >= 0 ? 'REMOVED FROM LOCAL WATCHLIST' : 'ADDED TO LOCAL WATCHLIST';
    if (index >= 0) entries.splice(index, 1);
    else entries.push({
      key,
      layerId: selected.layerId,
      label: selected.label || 'Unnamed observation',
      id: selected.id || '',
      lat: selected.lat,
      lon: selected.lon,
      addedAt: new Date().toISOString()
    });
    writeWatchlist(entries);
    render(selected);
    status.textContent = message;
  }

  async function copyEvidence() {
    if (!selected || selected.isCluster) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      observation: selected,
      relatedContext: relatedSignals(selected).map(point => ({
        layer: point.layerLabel || point.layerId,
        label: point.label || point.name || point.place,
        distanceKm: Math.round(point.distance)
      })),
      boundary: 'Source-bounded observation. Related context does not establish causality.'
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else throw new Error('clipboard unavailable');
      status.textContent = 'EVIDENCE PACKET COPIED';
    } catch (error) {
      status.textContent = 'COPY BLOCKED / USE EXPORT BRIEF';
    }
  }

  window.addEventListener('overview:signal-selected', event => render(event.detail || {}));
  window.addEventListener('overview:layer', event => {
    const detail = event.detail || {};
    const watched = readWatchlist().filter(entry => entry.layerId === detail.id);
    if (!watched.length || !Array.isArray(detail.points)) return;
    const ids = new Set(detail.points.map(point => point.id).filter(Boolean));
    const active = watched.filter(entry => entry.id && ids.has(entry.id));
    if (selected && active.some(entry => entry.key === signalKey(selected))) {
      status.textContent = `WATCHED SIGNAL PRESENT / ${String(detail.status || 'ACTIVE').toUpperCase()}`;
      renderRelated(selected);
    }
  });
  close?.addEventListener('click', clear);
  focusButtons.forEach(button => button.addEventListener('click', focusSelected));
  watch?.addEventListener('click', toggleWatch);
  copy?.addEventListener('click', copyEvidence);
  brief?.addEventListener('click', () => {
    if (!selected || selected.isCluster) return;
    window.dispatchEvent(new CustomEvent('overview:brief-requested', { detail: selected }));
  });

  window.OverviewWatchlist = Object.freeze({
    list: readWatchlist,
    clear: () => writeWatchlist([])
  });
})();
