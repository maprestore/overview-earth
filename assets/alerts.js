/**
 * Browser-local alert rules
 * -------------------------------------------------------------
 * Rules are intentionally local and notification-safe. They evaluate the
 * latest loaded points, but never claim to deliver a server-side alert.
 */

(() => {
  const STORAGE_KEY = 'overview.alertRules.v1';
  const form = document.getElementById('alert-rule-form');
  const layerInput = document.getElementById('alert-layer');
  const thresholdInput = document.getElementById('alert-threshold');
  const list = document.getElementById('alert-list');
  const status = document.getElementById('alert-status');

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function write(rules) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rules.slice(-20))); } catch (error) { /* optional */ }
  }

  function metric(point, layerId) {
    if (layerId === 'earthquakes') return Number(point.magnitude ?? point.mag ?? point.size);
    return Number(point.size ?? point.value ?? 0);
  }

  function matches(rule) {
    const snapshot = Overview.getLayerSnapshot?.(rule.layerId);
    return (snapshot?.points || []).filter(point => metric(point, rule.layerId) >= rule.threshold).length;
  }

  function render() {
    if (!list) return;
    const rules = read();
    list.replaceChildren();
    rules.forEach(rule => {
      const row = document.createElement('div');
      row.className = 'alert-rule';
      const copy = document.createElement('span');
      copy.textContent = `${rule.layerId.toUpperCase()} >= ${rule.threshold}`;
      const count = document.createElement('small');
      count.textContent = `${matches(rule)} MATCHES`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'DISARM';
      remove.addEventListener('click', () => {
        write(read().filter(item => item.id !== rule.id));
        render();
      });
      row.append(copy, count, remove);
      list.append(row);
    });
    if (status) status.textContent = rules.length ? `${rules.length} ARMED / LOCAL ONLY` : 'BROWSER ONLY';
  }

  form?.addEventListener('submit', event => {
    event.preventDefault();
    const threshold = Number(thresholdInput?.value);
    if (!layerInput?.value || !Number.isFinite(threshold) || threshold < 0) return;
    const rules = read().filter(rule => rule.layerId !== layerInput.value);
    rules.push({
      id: `${layerInput.value}:${threshold}`,
      layerId: layerInput.value,
      threshold,
      createdAt: new Date().toISOString()
    });
    write(rules);
    render();
  });

  window.addEventListener('overview:layer', render);
  window.addEventListener('overview:view-changed', render);
  window.OverviewAlerts = Object.freeze({ list: read, clear: () => write([]) });
  render();
})();
