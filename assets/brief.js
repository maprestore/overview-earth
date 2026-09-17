/**
 * Today's Brief
 * -------------------------------------------------------------
 * This panel summarizes only the observations already loaded into the map.
 * It never invents a conclusion when a source is missing.
 */

(() => {
  const layerIds = ['earthquakes', 'satellites', 'flights', 'ships', 'news', 'cables', 'buildings'];
  const elements = {
    sync: document.getElementById('brief-sync'),
    quakeValue: document.getElementById('brief-quake-value'),
    quakeNote: document.getElementById('brief-quake-note'),
    quakeCard: document.getElementById('brief-quake-value')?.closest('.brief-card'),
    satelliteValue: document.getElementById('brief-satellite-value'),
    satelliteNote: document.getElementById('brief-satellite-note'),
    sourceValue: document.getElementById('brief-source-value'),
    sourceNote: document.getElementById('brief-source-note'),
    pulseBars: document.getElementById('brief-pulse-bars'),
    pulseNote: document.getElementById('brief-pulse-note'),
    network: document.querySelector('.network-state'),
    networkText: document.getElementById('network-status-text')
  };

  function formatPlace(place) {
    const value = String(place || 'location unavailable').replace(/\s+/g, ' ').trim();
    return value.length > 34 ? `${value.slice(0, 31)}...` : value;
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function renderPulse(earthquakes) {
    if (!elements.pulseBars) return;
    elements.pulseBars.replaceChildren();
    if (!earthquakes?.enabled || earthquakes.status === 'unavailable') {
      setText(elements.pulseNote, earthquakes?.enabled ? 'USGS UNAVAILABLE' : 'ENABLE LIVE BASELINE');
      return;
    }

    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000;
    const bucketMs = windowMs / 12;
    const buckets = Array.from({ length: 12 }, () => 0);
    let timestamped = 0;
    for (const point of earthquakes.points) {
      const age = now - Number(point.time);
      if (!Number.isFinite(age) || age < 0 || age >= windowMs) continue;
      buckets[Math.min(11, Math.floor((windowMs - age) / bucketMs))] += 1;
      timestamped += 1;
    }

    const peak = Math.max(...buckets, 0);
    buckets.forEach((count, index) => {
      const bar = document.createElement('span');
      bar.className = 'pulse-bar';
      bar.style.height = `${peak ? Math.max(12, (count / peak) * 100) : 8}%`;
      bar.title = `${count} earthquake${count === 1 ? '' : 's'} / ${24 - (index * 2)}H window`;
      bar.setAttribute('aria-label', bar.title);
      elements.pulseBars.appendChild(bar);
    });
    setText(elements.pulseNote, earthquakes.mode === 'replay'
      ? `${timestamped} EVENTS / REPLAY FIXTURE`
      : timestamped ? `${timestamped} EVENTS / 24H` : 'TIMESTAMPS UNAVAILABLE');
  }

  function render() {
    if (typeof Overview === 'undefined' || !Overview.getLayerSnapshot) return;
    const snapshots = layerIds.map(id => Overview.getLayerSnapshot(id)).filter(Boolean);
    const earthquakes = Overview.getLayerSnapshot('earthquakes');
    const satellites = Overview.getLayerSnapshot('satellites');
    const active = snapshots.filter(layer => layer.enabled);
    const available = active.filter(layer => ['online', 'fallback', 'replay'].includes(layer.status));
    const online = active.filter(layer => ['online', 'fallback'].includes(layer.status));
    const unavailable = active.filter(layer => layer.status === 'unavailable').length;
    const fallback = active.filter(layer => layer.status === 'fallback').length;
    const unconfigured = active.filter(layer => layer.status === 'standby').length;
    const syncing = active.some(layer => ['loading', 'ready'].includes(layer.status));
    const dataMode = active.find(layer => layer.mode === 'replay')?.mode;
    const latestSync = online
      .map(layer => layer.lastUpdated)
      .filter(Boolean)
      .sort((a, b) => b - a)[0];

    if (earthquakes?.mode === 'replay' || satellites?.mode === 'replay') {
      setText(elements.sync, 'REPLAY FIXTURE / BUNDLED SCENE');
    } else if (latestSync) {
      setText(elements.sync, `LAST SYNC ${new Date(latestSync).toISOString().slice(11, 16)}Z`);
    } else {
      setText(elements.sync, active.length ? 'WAITING FOR SOURCE SYNC' : 'NO ACTIVE SOURCES');
    }

    if (!earthquakes?.enabled) {
      setText(elements.quakeValue, 'OFF');
      setText(elements.quakeNote, 'ENABLE IMPACT MAP');
      elements.quakeCard?.classList.remove('is-alert');
    } else if (earthquakes.status === 'unavailable') {
      setText(elements.quakeValue, 'N/A');
      setText(elements.quakeNote, 'USGS UNAVAILABLE');
      elements.quakeCard?.classList.remove('is-alert');
    } else if (earthquakes.count) {
      const largest = earthquakes.points.reduce((best, point) => (
        Number(point.magnitude) > Number(best?.magnitude || -Infinity) ? point : best
      ), null);
      const magnitude = Number(largest?.magnitude || 0);
      setText(elements.quakeValue, `M${magnitude.toFixed(1)}`);
      setText(elements.quakeNote, `${earthquakes.mode === 'replay' ? 'REPLAY / ' : ''}${formatPlace(largest?.place)} / ${earthquakes.count} EVENTS`);
      elements.quakeCard?.classList.toggle('is-alert', magnitude >= 5);
    } else {
      setText(elements.quakeValue, earthquakes.status === 'loading' ? 'SYNCING' : 'NONE');
      setText(elements.quakeNote, 'NO EVENTS IN CURRENT FEED');
      elements.quakeCard?.classList.remove('is-alert');
    }
    renderPulse(earthquakes);

    if (!satellites?.enabled) {
      setText(elements.satelliteValue, 'OFF');
      setText(elements.satelliteNote, 'ENABLE LIVE BASELINE');
    } else if (satellites.status === 'unavailable') {
      setText(elements.satelliteValue, 'N/A');
      setText(elements.satelliteNote, 'CELESTRAK UNAVAILABLE');
    } else {
      setText(elements.satelliteValue, satellites.status === 'loading' ? 'SYNCING' : String(satellites.count));
       setText(elements.satelliteNote, satellites.mode === 'replay'
         ? 'STATIONS VISIBLE / REPLAY FIXTURE'
         : 'STATIONS VISIBLE / CELESTRAK');
    }

    setText(elements.sourceValue, `${available.length}/${active.length}`);
    setText(elements.sourceNote, active.length
      ? (dataMode === 'replay'
        ? 'BUNDLED FIXTURE / NOT LIVE'
        : unconfigured ? 'SOURCE CONFIGURATION REQUIRED'
        : fallback ? 'FALLBACK ACTIVE / VERIFY SOURCE' : 'FEEDS ONLINE / ACTIVE VIEW')
      : 'CHOOSE A FIELD GUIDE');

    const networkStatus = dataMode === 'replay'
      ? 'REPLAY'
      : !active.length ? 'STANDBY'
      : unavailable || fallback || unconfigured ? 'PARTIAL'
      : syncing ? 'SYNCING' : 'OPERATIONAL';
    setText(elements.networkText, networkStatus);
    elements.network?.classList.toggle('is-partial', networkStatus === 'PARTIAL');
    elements.network?.classList.toggle('is-standby', networkStatus === 'STANDBY');
    elements.network?.classList.toggle('is-syncing', networkStatus === 'SYNCING');
    elements.network?.classList.toggle('is-replay', networkStatus === 'REPLAY');
  }

  window.addEventListener('overview:layer', render);
  window.addEventListener('overview:view-changed', render);
  render();
})();
