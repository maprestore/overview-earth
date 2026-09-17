/**
 * Evidence ledger and local planetary copilot
 * -------------------------------------------------------------
 * This is intentionally evidence-bound. It can explain loaded observations,
 * surface gaps, and build a reproducible ledger without inventing facts.
 */

(() => {
  const elements = {
    status: document.getElementById('copilot-status'),
    intent: document.getElementById('copilot-intent'),
    summary: document.getElementById('copilot-summary'),
    confidence: document.getElementById('copilot-confidence'),
    streams: document.getElementById('copilot-streams'),
    observations: document.getElementById('copilot-observations'),
    known: document.getElementById('copilot-known'),
    unknown: document.getElementById('copilot-unknown'),
    notEstablished: document.getElementById('copilot-not-established'),
    sources: document.getElementById('copilot-sources'),
    ledger: document.getElementById('ledger-list'),
    ledgerPosture: document.getElementById('ledger-posture'),
    ledgerExport: document.getElementById('ledger-export')
  };
  if (!elements.summary || !elements.ledger) return;

  const state = { query: '', displayQuery: '', selected: null, latest: null };

  function snapshots() {
    return typeof Overview !== 'undefined' && (Overview.getVisibleContext || Overview.getLayerSnapshots)
      ? (Overview.getVisibleContext?.() || Overview.getLayerSnapshots())
      : [];
  }

  function pointTime(point) {
    const value = point?.time ?? point?.timestamp ?? point?.seendate ?? point?.observedAt;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatTime(value) {
    if (!value) return 'TIME UNAVAILABLE';
    return `${new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
    }).format(new Date(value))}Z`;
  }

  function signalLabel(point, layer) {
    return point?.place || point?.name || point?.label || layer?.label || 'Unnamed observation';
  }

  function activeContext() {
    const all = snapshots();
    const active = all.filter(layer => layer.enabled);
    const available = active.filter(layer => ['online', 'fallback', 'replay'].includes(layer.status));
    const observations = active.reduce((total, layer) => total + Number(layer.visibleCount ?? layer.count ?? 0), 0);
    const timeline = active.flatMap(layer => (layer.points || []).slice(0, 500).map(point => ({
      layer,
      point,
      observedAt: pointTime(point)
    }))).filter(item => item.observedAt).sort((a, b) => b.observedAt - a.observedAt).slice(0, 7);
    const mode = typeof Overview !== 'undefined' && Overview.getMode?.() === 'replay' ? 'replay' : 'live';
    const region = typeof Overview !== 'undefined' ? Overview.getRegion?.() || 'global' : 'global';
    const known = [];
    const unknown = [];
    const notEstablished = [
      'Nearby signals are context, not proof of causality.',
      'Coverage is not evidence that nothing happened outside the loaded sources.'
    ];

    if (active.length) known.push(`${available.length}/${active.length} enabled source streams returned a usable state.`);
    else unknown.push('No source streams are enabled in the current view.');
    if (observations) known.push(`${observations.toLocaleString()} observations are visible in the current filters.`);
    else unknown.push('The current source window contains no visible observations.');
    if (region !== 'global') known.push(`The current geographic focus is ${region.toUpperCase()}.`);
    if (mode === 'replay') known.push('A deterministic replay fixture is active; this is not live provider data.');
    const quakeLayer = active.find(layer => layer.id === 'earthquakes');
    const largest = (quakeLayer?.points || []).reduce((best, point) => (
      Number(point.magnitude ?? point.mag ?? point.size) > Number(best?.magnitude ?? best?.mag ?? best?.size ?? -Infinity) ? point : best
    ), null);
    if (largest) known.push(`Largest loaded seismic observation is M${Number(largest.magnitude ?? largest.mag ?? largest.size).toFixed(1)} / ${signalLabel(largest, quakeLayer)}.`);
    const newsLayer = active.find(layer => layer.id === 'news');
    if (newsLayer) notEstablished.push('News map points represent reporting origins, not confirmed event locations.');
    if (typeof Overview !== 'undefined' && Overview.getAnomalyMode?.()) known.push('Anomaly focus is enabled using the current earthquake threshold.');
    if (state.selected) known.push(`Selected signal: ${signalLabel(state.selected, { label: state.selected.layerLabel })}.`);
    if (active.some(layer => layer.points?.some(point => !pointTime(point)))) unknown.push('Some loaded observations do not include a source timestamp.');
    active.filter(layer => ['unavailable', 'standby'].includes(layer.status)).forEach(layer => unknown.push(`${layer.label} is ${layer.status}; no claim is made from that stream.`));

    const ratio = active.length ? available.length / active.length : 0;
    const posture = mode === 'replay' ? 'REPLAY' : !active.length ? 'NO DATA' : ratio === 1 ? 'SUPPORTED' : ratio >= 0.5 ? 'GUARDED' : 'LIMITED';
    const intent = state.query
      ? /anomal|unusual|outlier/.test(state.query) ? 'ANOMALY REVIEW'
        : /why|cause|caused|reason/.test(state.query) ? 'CAUSALITY CHECK'
          : /risk|alert|danger|threat/.test(state.query) ? 'RISK POSTURE'
            : /where|location|near|focus/.test(state.query) ? 'LOCATION REVIEW'
              : 'PLANETARY EVIDENCE REVIEW'
      : 'EVIDENCE-BOUND ANALYSIS';
    const observationPhrase = `${observations} visible observation${observations === 1 ? '' : 's'}`;
    const summary = state.query
      ? `The ledger covers ${state.displayQuery || state.query} using ${available.length} source streams and ${observationPhrase}. No unsupported conclusion is added.`
      : 'Ask a question to turn loaded observations into a traceable answer. The copilot only uses evidence already loaded in this browser.';

    return {
      generatedAt: new Date().toISOString(),
      query: state.query,
      displayQuery: state.displayQuery || state.query,
      mode,
      region,
      window: typeof Overview !== 'undefined' ? Overview.getWindow?.() || '24h' : '24h',
      posture,
      activeCount: active.length,
      availableCount: available.length,
      observations,
      known,
      unknown,
      notEstablished,
      sources: active.map(layer => ({
        id: layer.id,
        label: layer.label,
        status: layer.status,
        count: layer.visibleCount ?? layer.count ?? 0,
        source: layer.source || '',
        sourceUrl: layer.sourceUrl || '',
        lastUpdated: layer.lastUpdated ? new Date(layer.lastUpdated).toISOString() : ''
      })),
      timeline,
      intent,
      summary
    };
  }

  function renderList(element, values, emptyText) {
    if (!element) return;
    element.replaceChildren();
    const items = values.length ? values : [emptyText];
    items.slice(0, 4).forEach(value => {
      const item = document.createElement('li');
      item.textContent = value;
      element.appendChild(item);
    });
  }

  function renderSources(context) {
    if (!elements.sources) return;
    elements.sources.replaceChildren();
    context.sources.slice(0, 5).forEach(item => {
      const row = document.createElement('div');
      row.className = 'copilot-source-row';
      const label = document.createElement('span');
      label.textContent = item.label || item.id;
      const meta = document.createElement('small');
      meta.textContent = `${String(item.status || 'unknown').toUpperCase()} / ${item.count} OBS`;
      row.append(label, meta);
      elements.sources.appendChild(row);
    });
  }

  function renderLedger(context) {
    elements.ledger.replaceChildren();
    context.timeline.forEach(item => {
      const row = document.createElement('div');
      row.className = 'ledger-row';
      const time = document.createElement('span');
      time.textContent = formatTime(item.observedAt);
      const detail = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = signalLabel(item.point, item.layer);
      const meta = document.createElement('small');
      meta.textContent = `${item.layer.label} / ${item.layer.source || 'SOURCE ATTACHED'}`;
      detail.append(title, meta);
      row.append(time, detail);
      elements.ledger.appendChild(row);
    });
    if (!context.timeline.length) {
      const empty = document.createElement('div');
      empty.className = 'ledger-empty';
      empty.textContent = 'NO TIMESTAMPED OBSERVATIONS IN THE CURRENT VIEW';
      elements.ledger.appendChild(empty);
    }
  }

  function render() {
    const context = activeContext();
    state.latest = context;
    elements.status.textContent = 'LOCAL / NO UNSOURCED CLAIMS';
    elements.intent.textContent = context.intent;
    elements.summary.textContent = context.summary;
    elements.confidence.textContent = context.posture;
    elements.streams.textContent = `${context.availableCount} / ${context.activeCount}`;
    elements.observations.textContent = context.observations.toLocaleString();
    renderList(elements.known, context.known, 'No loaded observations yet.');
    renderList(elements.unknown, context.unknown, 'No current data gap reported.');
    renderList(elements.notEstablished, context.notEstablished, 'No boundary note available.');
    renderSources(context);
    elements.ledgerPosture.textContent = `${context.posture} / ${context.timeline.length} TIMESTAMPED EVENTS`;
    renderLedger(context);
  }

  function exportLedger() {
    if (!state.latest) render();
    const blob = new Blob([JSON.stringify(state.latest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overview-evidence-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    elements.ledgerExport.textContent = 'LEDGER READY ↓';
    window.setTimeout(() => { elements.ledgerExport.textContent = 'EXPORT LEDGER JSON'; }, 1800);
  }

  elements.ledgerExport?.addEventListener('click', exportLedger);
  window.addEventListener('overview:copilot-query', event => {
    state.query = String(event.detail?.query || '').trim().toLowerCase();
    state.displayQuery = String(event.detail?.displayQuery || state.query).trim();
    render();
  });
  window.addEventListener('overview:signal-selected', event => {
    state.selected = event.detail || null;
    render();
  });
  ['overview:layer', 'overview:view-changed', 'overview:region-changed', 'overview:window-changed', 'overview:time-changed', 'overview:anomaly-changed'].forEach(eventName => {
    window.addEventListener(eventName, render);
  });

  window.OverviewLedger = Object.freeze({ snapshot: () => activeContext(), export: exportLedger });
  window.setTimeout(render, 250);
})();
