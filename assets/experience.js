/**
 * Guided experience
 * -------------------------------------------------------------
 * Story modes are just shareable layer presets. The data engine remains
 * the source of truth, while this module owns onboarding and navigation.
 */

(() => {
  const STORY_MODES = Object.freeze({
    baseline: {
      label: 'LIVE BASELINE',
      layers: ['earthquakes', 'satellites', 'flights']
    },
    impact: {
      label: 'IMPACT MAP',
      layers: ['earthquakes', 'news']
    },
    infrastructure: {
      label: 'INFRASTRUCTURE',
      layers: ['satellites', 'cables']
    },
    built: {
      label: 'BUILT WORLD',
      layers: ['buildings', 'flights']
    }
  });

  const params = new URLSearchParams(window.location.search);
  const storyFromUrl = params.get('view');
  const layersFromUrl = params.get('layers');
  const modeFromUrl = params.get('mode') === 'replay' ? 'replay' : 'live';
  const regionFromUrl = params.get('region') || 'global';
  const searchFromUrl = params.get('q') || '';
  const windowFromUrl = params.get('window') === '7d' ? '7d' : '24h';
  const atFromUrl = Number(params.get('at'));
  const anomalyFromUrl = params.get('anomaly') === '1';
  const initialLayerIds = layersFromUrl === null
    ? STORY_MODES[storyFromUrl]?.layers
    : layersFromUrl.split(',').filter(Boolean);
  window.OverviewInitialView = {
    ...(initialLayerIds
      ? { layerIds: initialLayerIds, story: STORY_MODES[storyFromUrl] ? storyFromUrl : 'custom' }
      : {}),
    mode: modeFromUrl,
    region: regionFromUrl,
    search: searchFromUrl,
    window: windowFromUrl,
    ...(Number.isFinite(atFromUrl) ? { at: atFromUrl } : {}),
    anomaly: anomalyFromUrl
  };
  window.OverviewStoryModes = STORY_MODES;
  let tourToken = 0;

  function setIntroSeen() {
    try { localStorage.setItem('overview.introSeen', '1'); } catch (error) { /* storage is optional */ }
  }

  function hideWelcome() {
    const overlay = document.getElementById('welcome-overlay');
    const wasVisible = overlay && !overlay.hidden;
    if (overlay) overlay.hidden = true;
    setIntroSeen();
    if (wasVisible) window.requestAnimationFrame(() => document.getElementById('run-tour')?.focus({ preventScroll: true }));
  }

  function showWelcome() {
    const overlay = document.getElementById('welcome-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    window.requestAnimationFrame(() => overlay.querySelector('button')?.focus({ preventScroll: true }));
  }

  function setActiveStory(story) {
    document.querySelectorAll('[data-story]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.story === story);
      button.setAttribute('aria-pressed', String(button.dataset.story === story));
    });
  }

  function setMapMode(story, mode = Overview.getMode()) {
    const modeLabel = document.getElementById('map-mode-label');
    const storyLabel = STORY_MODES[story]?.label || (story === 'custom' ? 'CUSTOM VIEW' : 'LIVE');
    const label = mode === 'replay' ? `REPLAY FIXTURE / ${storyLabel}` : storyLabel;
    if (modeLabel) modeLabel.textContent = `MODE / ${label}`;
    setActiveStory(story);
  }

  function setReplayButton(mode) {
    const button = document.getElementById('toggle-replay');
    if (!button) return;
    button.firstChild.textContent = mode === 'replay' ? 'RETURN TO LIVE FEEDS ' : 'OPEN REPLAY FIXTURE ';
    button.querySelector('span')?.replaceChildren(document.createTextNode(mode === 'replay' ? 'LIVE' : 'REC'));
    button.setAttribute('aria-pressed', mode === 'replay' ? 'true' : 'false');
  }

  function setTourButton(running) {
    const button = document.getElementById('run-tour');
    if (!button) return;
    button.classList.toggle('is-running', running);
    button.textContent = running ? 'TOUR RUNNING' : 'RUN 30S TOUR';
    button.disabled = running;
  }

  function syncUrl(detail) {
    const url = new URL(window.location.href);
    const preset = STORY_MODES[detail.story];
    const mode = detail.mode || Overview.getMode();
    const sameLayers = preset && preset.layers.join(',') === detail.layerIds.join(',');
    if (sameLayers) {
      url.searchParams.set('view', detail.story);
      url.searchParams.delete('layers');
    } else {
      url.searchParams.delete('view');
      url.searchParams.set('layers', detail.layerIds.join(','));
    }
    if (mode === 'replay') url.searchParams.set('mode', 'replay');
    else url.searchParams.delete('mode');
    const region = Overview.getRegion?.() || 'global';
    const search = Overview.getSearch?.() || '';
    const windowValue = Overview.getWindow?.() || '24h';
    const cursor = Overview.getTimeCursor?.();
    const anomaly = Overview.getAnomalyMode?.();
    if (region === 'global') url.searchParams.delete('region');
    else url.searchParams.set('region', region);
    if (search) url.searchParams.set('q', search);
    else url.searchParams.delete('q');
    if (windowValue === '7d') url.searchParams.set('window', windowValue);
    else url.searchParams.delete('window');
    if (cursor != null) url.searchParams.set('at', String(cursor));
    else url.searchParams.delete('at');
    if (anomaly) url.searchParams.set('anomaly', '1');
    else url.searchParams.delete('anomaly');
    window.history.replaceState({}, '', url);
  }

  async function chooseStory(story) {
    const preset = STORY_MODES[story];
    if (!preset) return;
    tourToken += 1;
    setTourButton(false);
    hideWelcome();
    window.OverviewCurrentStory = story;
    setMapMode(story, Overview.getMode());
    if (Overview.getTimeCursor?.() != null) Overview.setTimeCursor(null);
    if (Overview.getAnomalyMode?.()) Overview.setAnomalyMode(false);
    if (Overview.getWindow?.() !== '24h') await Overview.setWindow('24h');
    await Overview.applyView(preset.layers, { story });
  }

  async function runTour() {
    const token = ++tourToken;
    const steps = [
      ['baseline', 6000],
      ['impact', 8000],
      ['infrastructure', 16000]
    ];
    hideWelcome();
    setTourButton(true);
    for (const [story, duration] of steps) {
      if (token !== tourToken) return;
      window.OverviewCurrentStory = story;
      setMapMode(story, Overview.getMode());
      void Overview.applyView(STORY_MODES[story].layers, { story, emit: false });
      await new Promise(resolve => window.setTimeout(resolve, duration));
    }
    if (token !== tourToken) return;
    setMapMode('infrastructure', Overview.getMode());
    syncUrl({ story: 'infrastructure', layerIds: STORY_MODES.infrastructure.layers, mode: Overview.getMode() });
    setTourButton(false);
  }

  async function toggleReplay() {
    tourToken += 1;
    setTourButton(false);
    hideWelcome();
    const mode = Overview.getMode() === 'replay' ? 'live' : 'replay';
    setReplayButton(mode);
    await Overview.setMode(mode);
    setMapMode(window.OverviewCurrentStory || window.OverviewInitialView?.story || 'baseline', mode);
    syncUrl({
      story: window.OverviewCurrentStory || window.OverviewInitialView?.story || 'baseline',
      layerIds: Overview.getViewState(),
      mode
    });
  }

  async function copyCurrentView() {
    const detail = {
      story: 'custom',
      layerIds: Overview.getViewState()
    };
    syncUrl(detail);
    const value = window.location.href;
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch (error) {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      copied = document.execCommand('copy');
      input.remove();
    }
    const button = document.getElementById('share-view');
    if (button) {
      const original = 'SHARE CURRENT VIEW';
      button.firstChild.textContent = copied ? 'VIEW LINK COPIED' : 'VIEW LINK READY';
      window.setTimeout(() => { button.firstChild.textContent = original; }, 1800);
    }
  }

  function setup() {
    document.querySelectorAll('[data-story]').forEach(button => {
      button.addEventListener('click', () => chooseStory(button.dataset.story));
    });
    document.getElementById('share-view')?.addEventListener('click', copyCurrentView);
    document.getElementById('toggle-replay')?.addEventListener('click', toggleReplay);
    document.getElementById('enter-observatory')?.addEventListener('click', hideWelcome);
    document.getElementById('launch-impact')?.addEventListener('click', () => chooseStory('impact'));
    document.getElementById('launch-tour')?.addEventListener('click', runTour);
    document.getElementById('run-tour')?.addEventListener('click', runTour);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideWelcome();
      const overlay = document.getElementById('welcome-overlay');
      if (event.key !== 'Tab' || !overlay || overlay.hidden) return;
      const focusable = [...overlay.querySelectorAll('button')].filter(button => !button.disabled);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    window.addEventListener('overview:view-changed', event => {
      const detail = event.detail || {};
      window.OverviewCurrentStory = detail.story;
      setMapMode(detail.story);
      syncUrl(detail);
    });

    window.addEventListener('overview:mode-changed', event => {
      const mode = event.detail?.mode || Overview.getMode();
      setReplayButton(mode);
      setMapMode(window.OverviewCurrentStory || window.OverviewInitialView?.story || 'baseline', mode);
      syncUrl({
        story: window.OverviewCurrentStory || window.OverviewInitialView?.story || 'baseline',
        layerIds: Overview.getViewState(),
        mode
      });
    });

    const syncCurrentState = () => syncUrl({
      story: window.OverviewCurrentStory || window.OverviewInitialView?.story || 'baseline',
      layerIds: Overview.getViewState(),
      mode: Overview.getMode()
    });
    window.addEventListener('overview:region-changed', syncCurrentState);
    window.addEventListener('overview:search-changed', syncCurrentState);
    window.addEventListener('overview:window-changed', syncCurrentState);
    window.addEventListener('overview:time-changed', syncCurrentState);
    window.addEventListener('overview:anomaly-changed', syncCurrentState);

    const hasSeenIntro = (() => {
      try { return localStorage.getItem('overview.introSeen') === '1'; } catch (error) { return false; }
    })();
    if (!hasSeenIntro && !window.OverviewInitialView?.layerIds) {
      showWelcome();
    }

    window.OverviewCurrentStory = window.OverviewInitialView?.story || 'baseline';
    setReplayButton(window.OverviewInitialView?.mode || 'live');
    setMapMode(window.OverviewCurrentStory, window.OverviewInitialView?.mode || 'live');
  }

  document.addEventListener('DOMContentLoaded', setup);
})();
