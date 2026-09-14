/**
 * Mission console
 * -------------------------------------------------------------
 * Deterministic insight tools built from the points already loaded by the
 * data engine. This module never turns correlation into certainty: every
 * fusion card exposes its source count and can be opened as an evidence brief.
 */

(() => {
  const drawer = document.getElementById('mission-drawer');
  const toggle = document.getElementById('mission-toggle');
  const close = document.getElementById('mission-close');
  const queryForm = document.getElementById('planet-query');
  const queryInput = document.getElementById('planet-query-input');
  const queryStatus = document.getElementById('fusion-status');
  const fusionList = document.getElementById('fusion-list');
  const anomalyToggle = document.getElementById('anomaly-toggle');
  const playButton = document.getElementById('timeline-play');
  const timeline = document.getElementById('timeline-range');
  const timelineLabel = document.getElementById('timeline-label');
  const missionShare = document.getElementById('mission-share');
  const baselineToggle = document.getElementById('baseline-toggle');
  const baselineList = document.getElementById('baseline-list');
  const briefing = document.getElementById('briefing-overlay');
  const briefEvidence = document.getElementById('briefing-evidence');
  let timelineBounds = { min: null, max: null };
  let playTimer = null;
  let currentBrief = null;
  const initialParams = new URLSearchParams(window.location.search);
  const initialQuery = initialParams.get('ask') || '';
  const openCapsule = initialParams.get('mission') === '1';

  const layerAliases = {
    earthquake: 'earthquakes', earthquakes: 'earthquakes', seismic: 'earthquakes',
    satellite: 'satellites', satellites: 'satellites', orbit: 'satellites', orbital: 'satellites',
    flight: 'flights', flights: 'flights', aircraft: 'flights', air: 'flights',
    ship: 'ships', ships: 'ships', maritime: 'ships',
    news: 'news', media: 'news', headlines: 'news',
    cable: 'cables', cables: 'cables', infrastructure: 'cables',
    building: 'buildings', buildings: 'buildings', built: 'buildings'
  };
  const regions = ['global', 'americas', 'mena', 'europe', 'asia', 'japan', 'latin-america', 'africa', 'oceania'];

  function snapshots() {
    return typeof Overview?.getLayerSnapshots === 'function' ? Overview.getLayerSnapshots() : [];
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function timestamp(point) {
    const value = point?.time ?? point?.timestamp ?? point?.seendate ?? point?.observedAt;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed < 1e12 ? parsed * 1000 : parsed;
    const date = Date.parse(String(value || ''));
    return Number.isFinite(date) ? date : null;
  }

  function formatTime(value) {
    if (!value) return 'SOURCE FRESHNESS';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
    }).format(new Date(value)) + ' UTC';
  }

  function distanceKm(a, b) {
    const rad = Math.PI / 180;
    const lat1 = number(a.lat) * rad;
    const lat2 = number(b.lat) * rad;
    const dLat = (number(b.lat) - number(a.lat)) * rad;
    const dLon = (number(b.lon) - number(a.lon)) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  function signalTitle(signal, layer) {
    return signal.place || signal.name || signal.label || layer?.label || 'Unnamed signal';
  }

  function makeFusionCard(item) {
    const card = document.createElement('article');
    card.className = 'fusion-card';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const detail = document.createElement('span');
    detail.textContent = item.detail;
    const meta = document.createElement('small');
    meta.textContent = item.meta;
    card.append(title, detail, meta);
    if (item.signal) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'OPEN BRIEF';
      button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('overview:brief-requested', { detail: item.signal })));
      card.append(button);
    }
    return card;
  }

  function renderFusion() {
    if (!fusionList) return;
    fusionList.replaceChildren();
    const active = snapshots().filter(layer => layer.enabled && layer.status !== 'unavailable' && layer.status !== 'standby');
    const quakeLayer = active.find(layer => layer.id === 'earthquakes');
    const otherLayers = active.filter(layer => layer.id !== 'earthquakes');
    const quakes = (quakeLayer?.points || [])
      .filter(point => number(point.magnitude ?? point.mag ?? point.size) >= 4.5)
      .slice(0, 12);
    const cards = [];
    for (const quake of quakes) {
      const related = otherLayers.flatMap(layer => (layer.points || []).slice(0, 500).map(point => ({ point, layer })))
        .filter(item => !item.point.isCluster && distanceKm(quake, item.point) <= 700)
        .slice(0, 5);
      const sources = new Set(['USGS']);
      related.forEach(item => sources.add(item.layer.label));
      if (related.length) {
        cards.push({
          title: `${signalTitle(quake, quakeLayer)} / FUSED`,
          detail: `M${number(quake.magnitude ?? quake.mag ?? quake.size).toFixed(1)} seismic signal with ${related.length} nearby observations`,
          meta: `${sources.size} SOURCE STREAMS / ${formatTime(timestamp(quake))}`,
          signal: { ...quake, layerId: 'earthquakes', layerLabel: quakeLayer.label, source: quakeLayer.source, sourceUrl: quakeLayer.sourceUrl || '' }
        });
      }
    }
    if (!cards.length && active.length) {
      cards.push({
        title: 'COVERAGE POSTURE / STABLE',
        detail: `${active.length} source streams are available in the current view`,
        meta: active.map(layer => `${layer.label}: ${layer.visibleCount ?? layer.count}`).join(' / ')
      });
    }
    if (!cards.length) {
      const empty = document.createElement('div');
      empty.className = 'fusion-empty';
      empty.textContent = 'ENABLE TWO OR MORE SOURCES TO FUSE SIGNALS';
      fusionList.append(empty);
    } else {
      cards.slice(0, 3).forEach(card => fusionList.append(makeFusionCard(card)));
    }
    if (queryStatus) queryStatus.textContent = active.length ? `${active.length} STREAMS / CORRELATION IS PROXIMITY-BASED` : 'WAITING FOR SOURCES';
  }

  async function renderBaseline() {
    if (!baselineList || baselineList.hidden || typeof OverviewHistory === 'undefined') return;
    baselineList.replaceChildren();
    const active = snapshots().filter(layer => layer.enabled);
    const stats = await OverviewHistory.statsFor(active.map(layer => layer.id));
    active.forEach(layer => {
      const row = document.createElement('div');
      row.className = 'baseline-row';
      const label = document.createElement('span');
      label.textContent = layer.label;
      const value = document.createElement('strong');
      const average = stats[layer.id]?.average;
      const current = layer.visibleCount ?? layer.count;
      if (!Number.isFinite(average)) {
        value.textContent = `${current} / NO BASELINE`;
      } else {
        const delta = current - average;
        const percent = average ? Math.round((delta / average) * 100) : 0;
        value.textContent = `${percent >= 0 ? '+' : ''}${percent}% VS AVG`;
        value.className = delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : '';
      }
      row.append(label, value);
      baselineList.append(row);
    });
    if (!active.length) baselineList.textContent = 'ENABLE A SOURCE TO COMPARE IT';
  }

  function setDrawer(open) {
    if (!drawer || !toggle) return;
    drawer.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) queryInput?.focus({ preventScroll: true });
  }

  async function runQuery(value) {
    const query = String(value || '').trim().toLowerCase();
    if (!query) return;
    const url = new URL(window.location.href);
    url.searchParams.set('ask', query);
    url.searchParams.set('mission', '1');
    window.history.replaceState({}, '', url);
    const selectedLayers = [...new Set(Object.entries(layerAliases)
      .filter(([alias]) => query.includes(alias))
      .map(([, id]) => id))];
    const region = regions.find(item => query.includes(item));
    const hasAnomaly = /anomal|outlier|unusual|exception/.test(query);
    const wantsHistory = /7d|week|history|timeline|last seven/.test(query);
    const wantsLive = /live|today|24h|now/.test(query);
    if (selectedLayers.length) await Overview.applyView(selectedLayers, { story: 'custom' });
    if (region) Overview.setRegion(region);
    if (wantsHistory) await Overview.setWindow('7d');
    else if (wantsLive) await Overview.setWindow('24h');
    if (hasAnomaly && !Overview.getAnomalyMode?.()) Overview.setAnomalyMode(true);
    if (queryStatus) queryStatus.textContent = `QUERY APPLIED / ${region ? region.toUpperCase() : 'CURRENT REGION'}`;
    await refreshTimeline();
    renderFusion();
  }

  async function copyMissionCapsule() {
    const url = new URL(window.location.href);
    url.searchParams.set('mission', '1');
    if (queryInput?.value.trim()) url.searchParams.set('ask', queryInput.value.trim().toLowerCase());
    const value = url.href;
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    if (missionShare) {
      missionShare.textContent = 'MISSION CAPSULE COPIED';
      window.setTimeout(() => { missionShare.textContent = 'COPY MISSION CAPSULE LINK'; }, 1800);
    }
  }

  function updateTimelineLabel(value) {
    if (!timelineLabel) return;
    timelineLabel.textContent = value == null ? 'LIVE NOW' : formatTime(Number(value));
  }

  async function refreshTimeline() {
    if (!timeline || typeof OverviewHistory === 'undefined') return;
    const result = await OverviewHistory.bounds(Overview.getViewState());
    const now = Date.now();
    const min = result.min ?? now - 24 * 60 * 60 * 1000;
    const max = Math.max(result.max ?? now, now);
    timelineBounds = { min, max };
    timeline.min = String(min);
    timeline.max = String(max);
    timeline.value = String(max);
    timeline.disabled = max <= min;
    updateTimelineLabel(null);
  }

  function setTimeline(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric >= timelineBounds.max - 60 * 1000) {
      Overview.setTimeCursor(null);
      updateTimelineLabel(null);
      return;
    }
    Overview.setTimeCursor(numeric);
    updateTimelineLabel(numeric);
  }

  function stopPlayback() {
    if (playTimer) window.clearInterval(playTimer);
    playTimer = null;
    if (playButton) playButton.textContent = 'PLAY HISTORY';
  }

  function playHistory() {
    if (!timeline || timeline.disabled) return;
    if (playTimer) {
      stopPlayback();
      return;
    }
    let value = Number(timeline.value);
    if (value >= timelineBounds.max - 60 * 1000) value = timelineBounds.min;
    playButton.textContent = 'PAUSE HISTORY';
    playTimer = window.setInterval(() => {
      value += Math.max(60 * 1000, (timelineBounds.max - timelineBounds.min) / 90);
      if (value >= timelineBounds.max) {
        timeline.value = String(timelineBounds.max);
        Overview.setTimeCursor(null);
        updateTimelineLabel(null);
        stopPlayback();
        return;
      }
      timeline.value = String(value);
      setTimeline(value);
    }, 240);
    setTimeline(value);
  }

  function showBrief(signal) {
    if (!briefing || !signal) return;
    const all = snapshots().flatMap(layer => (layer.points || []).map(point => ({ point, layer })));
    const related = all.filter(item => item.point !== signal && !item.point.isCluster && distanceKm(signal, item.point) <= 700).slice(0, 8);
    currentBrief = { createdAt: new Date().toISOString(), signal, related };
    document.getElementById('briefing-title').textContent = signal.label || signal.place || 'SIGNAL BRIEF';
    document.getElementById('briefing-summary').textContent = `A ${signal.layerLabel || signal.layerId || 'source'} observation at ${Number(signal.lat).toFixed(3)}, ${Number(signal.lon).toFixed(3)}. Nearby evidence is shown as context, not proof of causality.`;
    document.getElementById('briefing-classification').textContent = signal.layerLabel || signal.layerId || 'OBSERVATION';
    document.getElementById('briefing-time').textContent = formatTime(timestamp(signal));
    document.getElementById('briefing-position').textContent = `${Number(signal.lat).toFixed(3)}, ${Number(signal.lon).toFixed(3)}`;
    document.getElementById('briefing-provenance').textContent = `${related.length} nearby observations / loaded source feeds only`;
    briefEvidence.replaceChildren();
    if (!related.length) {
      const item = document.createElement('li');
      item.textContent = 'No nearby cross-source evidence in the current loaded window.';
      briefEvidence.append(item);
    } else related.forEach(({ point, layer }) => {
      const item = document.createElement('li');
      item.textContent = `${layer.label}: ${signalTitle(point, layer)} / ${Math.round(distanceKm(signal, point))} km`;
      briefEvidence.append(item);
    });
    briefing.hidden = false;
    document.getElementById('briefing-close')?.focus({ preventScroll: true });
  }

  function exportBrief() {
    if (!currentBrief) return;
    const blob = new Blob([JSON.stringify(currentBrief, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overview-brief-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function refreshFromLayer() {
    renderFusion();
    if (Overview.getWindow?.() === '7d') await refreshTimeline();
    await renderBaseline();
  }

  toggle?.addEventListener('click', () => setDrawer(drawer?.hidden));
  close?.addEventListener('click', () => setDrawer(false));
  queryForm?.addEventListener('submit', event => { event.preventDefault(); void runQuery(queryInput?.value); });
  document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => {
    if (queryInput) queryInput.value = button.dataset.query || '';
    void runQuery(button.dataset.query);
  }));
  anomalyToggle?.addEventListener('click', () => Overview.setAnomalyMode(!Overview.getAnomalyMode?.()));
  playButton?.addEventListener('click', playHistory);
  missionShare?.addEventListener('click', copyMissionCapsule);
  baselineToggle?.addEventListener('click', () => {
    if (!baselineList) return;
    const open = baselineList.hidden;
    baselineList.hidden = !open;
    baselineToggle.setAttribute('aria-expanded', String(open));
    baselineToggle.lastElementChild.textContent = open ? '-' : '+';
    if (open) void renderBaseline();
  });
  timeline?.addEventListener('input', event => setTimeline(event.target.value));
  document.getElementById('briefing-close')?.addEventListener('click', () => { briefing.hidden = true; });
  document.getElementById('briefing-export')?.addEventListener('click', exportBrief);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setDrawer(false);
      if (briefing) briefing.hidden = true;
      stopPlayback();
    }
  });
  window.addEventListener('overview:layer', refreshFromLayer);
  window.addEventListener('overview:view-changed', () => { void refreshTimeline(); renderFusion(); void renderBaseline(); });
  window.addEventListener('overview:anomaly-changed', event => {
    const enabled = Boolean(event.detail?.enabled);
    if (anomalyToggle) {
      anomalyToggle.setAttribute('aria-pressed', String(enabled));
      anomalyToggle.textContent = enabled ? 'ANOMALY FOCUS / ON' : 'ANOMALY FOCUS';
    }
    renderFusion();
  });
  window.addEventListener('overview:time-changed', event => updateTimelineLabel(event.detail?.cursor));
  window.addEventListener('overview:brief-requested', event => showBrief(event.detail));
  if (initialQuery && queryInput) {
    queryInput.value = initialQuery;
    window.setTimeout(() => { setDrawer(openCapsule); void runQuery(initialQuery); }, 700);
  } else if (openCapsule) {
    window.setTimeout(() => setDrawer(true), 700);
  }
  window.setTimeout(() => { renderFusion(); void refreshTimeline(); }, 300);
})();
