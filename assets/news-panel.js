/**
 * Global News Radar
 * -------------------------------------------------------------
 * GDELT provides a broad, source-aware view of recent reporting. This module
 * makes freshness and geographic coverage legible without claiming that a
 * reporting-country centroid is the location of the underlying event.
 */

(() => {
  const elements = {
    status: document.getElementById('news-status'),
    list: document.getElementById('news-list'),
    count: document.getElementById('news-count'),
    countryCount: document.getElementById('news-country-count'),
    sourceCount: document.getElementById('news-source-count'),
    freshCount: document.getElementById('news-fresh-count'),
    coverage: document.getElementById('news-coverage-list'),
    coverageNote: document.getElementById('news-coverage-note'),
    search: document.getElementById('news-search'),
    sort: document.getElementById('news-sort'),
    focus: document.getElementById('news-focus'),
    focusPlace: document.getElementById('news-focus-place'),
    focusClear: document.getElementById('news-focus-clear'),
    ticker: document.getElementById('news-ticker-link'),
    tickerMeta: document.getElementById('news-ticker-meta')
  };
  if (!elements.status || !elements.list) return;

  const regionCountries = Object.freeze({
    americas: ['argentina', 'bahamas', 'barbados', 'belize', 'bolivia', 'brazil', 'canada', 'chile', 'colombia', 'cuba', 'ecuador', 'guyana', 'guatemala', 'haiti', 'honduras', 'jamaica', 'mexico', 'nicaragua', 'panama', 'paraguay', 'peru', 'suriname', 'unitedstates', 'uruguay', 'venezuela'],
    'latin-america': ['argentina', 'bahamas', 'barbados', 'belize', 'bolivia', 'brazil', 'chile', 'colombia', 'cuba', 'ecuador', 'guyana', 'guatemala', 'haiti', 'honduras', 'jamaica', 'mexico', 'nicaragua', 'panama', 'paraguay', 'peru', 'suriname', 'uruguay', 'venezuela'],
    mena: ['algeria', 'bahrain', 'egypt', 'iran', 'iraq', 'israel', 'jordan', 'kuwait', 'lebanon', 'libya', 'morocco', 'oman', 'qatar', 'saudiarabia', 'syria', 'tunisia', 'turkey', 'unitedarabemirates', 'yemen'],
    europe: ['albania', 'andorra', 'austria', 'belarus', 'belgium', 'bosnia', 'bulgaria', 'croatia', 'cyprus', 'czechia', 'denmark', 'estonia', 'finland', 'france', 'georgia', 'germany', 'greece', 'hungary', 'iceland', 'ireland', 'italy', 'latvia', 'liechtenstein', 'lithuania', 'luxembourg', 'malta', 'moldova', 'monaco', 'montenegro', 'netherlands', 'northmacedonia', 'norway', 'poland', 'portugal', 'romania', 'russia', 'sanmarino', 'serbia', 'slovakia', 'slovenia', 'spain', 'sweden', 'switzerland', 'ukraine', 'unitedkingdom', 'vatican'],
    asia: ['afghanistan', 'armenia', 'azerbaijan', 'bangladesh', 'bhutan', 'brunei', 'cambodia', 'china', 'india', 'indonesia', 'japan', 'kazakhstan', 'kyrgyzstan', 'laos', 'malaysia', 'maldives', 'mongolia', 'myanmar', 'nepal', 'northkorea', 'pakistan', 'philippines', 'singapore', 'southkorea', 'srilanka', 'taiwan', 'tajikistan', 'thailand', 'timorleste', 'turkmenistan', 'uzbekistan', 'vietnam'],
    africa: ['algeria', 'angola', 'benin', 'botswana', 'burkinafaso', 'burundi', 'cameroon', 'chad', 'comoros', 'congo', 'cotedivoire', 'djibouti', 'egypt', 'eritrea', 'eswatini', 'ethiopia', 'gabon', 'gambia', 'ghana', 'guinea', 'kenya', 'lesotho', 'liberia', 'libya', 'madagascar', 'malawi', 'mali', 'mauritania', 'mauritius', 'morocco', 'mozambique', 'namibia', 'niger', 'nigeria', 'rwanda', 'senegal', 'seychelles', 'sierraleone', 'somalia', 'southafrica', 'southsudan', 'sudan', 'tanzania', 'togo', 'tunisia', 'uganda', 'zambia', 'zimbabwe'],
    oceania: ['australia', 'fiji', 'kiribati', 'newzealand', 'papuanewguinea', 'samoa', 'solomonislands', 'tonga', 'tuvalu', 'vanuatu']
  });

  const regionLabels = {
    global: 'WORLDWIDE',
    americas: 'AMERICAS',
    mena: 'MENA',
    europe: 'EUROPE',
    asia: 'ASIA',
    japan: 'JAPAN',
    'latin-america': 'LATIN AMERICA',
    africa: 'AFRICA',
    oceania: 'OCEANIA'
  };

  const state = {
    articles: [],
    region: 'global',
    window: 'all',
    query: '',
    sort: 'freshest',
    status: 'idle',
    replay: false,
    fetchedAt: null,
    focusedArticle: null
  };

  function countryKey(country) {
    return String(country || '').toLowerCase().replace(/[ .'-]/g, '');
  }

  function articleTimestamp(article) {
    const value = String(article?.seendate || '').trim();
    const match = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})/);
    if (!match) return null;
    const timestamp = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function ageHours(article) {
    const timestamp = articleTimestamp(article);
    if (!timestamp) return null;
    return Math.max(0, (Date.now() - timestamp) / 3_600_000);
  }

  function relativeAge(article) {
    const hours = ageHours(article);
    if (hours == null) return 'RECENT';
    if (hours < 1 / 60) return 'JUST NOW';
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}M AGO`;
    if (hours < 24) return `${Math.round(hours)}H AGO`;
    return 'YESTERDAY';
  }

  function freshness(article) {
    const hours = ageHours(article);
    if (hours == null || hours > 24) return 'RECENT';
    if (hours <= 1) return 'FAST SIGNAL';
    if (hours <= 6) return 'FRESH';
    return 'RECENT';
  }

  function inRegion(article) {
    if (state.region === 'global') return true;
    const key = countryKey(article.sourcecountry);
    if (state.region === 'japan') return key === 'japan';
    return (regionCountries[state.region] || []).includes(key);
  }

  function inWindow(article) {
    const hours = ageHours(article);
    if (state.window === 'all' || hours == null) return true;
    return hours <= (state.window === '1h' ? 1 : 6);
  }

  function matchesQuery(article) {
    if (!state.query) return true;
    return `${article.title || ''} ${article.domain || ''} ${article.sourcecountry || ''}`
      .toLowerCase()
      .includes(state.query);
  }

  function visibleArticles() {
    const filtered = state.articles.filter(article => inRegion(article) && inWindow(article) && matchesQuery(article));
    if (state.sort === 'coverage') {
      const counts = new Map();
      state.articles.forEach(article => {
        const key = article.sourcecountry || 'GLOBAL';
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      return filtered.sort((a, b) => (counts.get(b.sourcecountry || 'GLOBAL') || 0) - (counts.get(a.sourcecountry || 'GLOBAL') || 0));
    }
    return filtered.sort((a, b) => (articleTimestamp(b) || 0) - (articleTimestamp(a) || 0));
  }

  function articleOrigin(article) {
    const rawLat = article?.sourceLat;
    const rawLon = article?.sourceLon;
    const lat = Number(rawLat);
    const lon = Number(rawLon);
    if (rawLat != null && rawLon != null && rawLat !== '' && rawLon !== '' && Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon };
    }
    return window.OverviewNewsGeo?.centroid?.(article?.sourcecountry) || null;
  }

  function originLabel(article) {
    return article?.sourcecountry ? `${article.sourcecountry} / REPORTING ORIGIN` : 'GLOBAL / ORIGIN UNKNOWN';
  }

  function setStatus(text, tone) {
    elements.status.textContent = text;
    elements.status.className = `news-status${tone ? ` is-${tone}` : ''}`;
  }

  function renderStats(articles) {
    const countries = new Set(articles.map(article => article.sourcecountry).filter(Boolean));
    const sources = new Set(articles.map(article => article.domain).filter(Boolean));
    const fresh = articles.filter(article => {
      const hours = ageHours(article);
      return hours != null && hours <= 6;
    }).length;
    elements.count.textContent = `${articles.length} SIGNAL${articles.length === 1 ? '' : 'S'}`;
    elements.countryCount.textContent = String(countries.size);
    elements.sourceCount.textContent = String(sources.size);
    elements.freshCount.textContent = String(fresh);
  }

  function renderCoverage(articles) {
    if (!elements.coverage) return;
    const counts = new Map();
    articles.forEach(article => {
      const country = article.sourcecountry || 'GLOBAL';
      counts.set(country, (counts.get(country) || 0) + 1);
    });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const max = top[0]?.[1] || 1;
    elements.coverage.replaceChildren();
    top.forEach(([country, count]) => {
      const row = document.createElement('div');
      row.className = 'coverage-row';
      const label = document.createElement('span');
      label.textContent = country;
      const track = document.createElement('span');
      track.className = 'coverage-track';
      const bar = document.createElement('i');
      bar.style.width = `${Math.max(8, (count / max) * 100)}%`;
      track.appendChild(bar);
      const value = document.createElement('strong');
      value.textContent = String(count).padStart(2, '0');
      row.append(label, track, value);
      elements.coverage.appendChild(row);
    });
    if (elements.coverageNote) {
      elements.coverageNote.textContent = top.length
        ? `${regionLabels[state.region] || 'WORLDWIDE'} / TOP REPORTING ORIGINS`
        : 'WAITING FOR FEED';
    }
  }

  function renderTicker(articles) {
    if (!elements.ticker) return;
    const article = articles[0];
    if (!article) {
      elements.ticker.href = '#news-panel';
      elements.ticker.removeAttribute('target');
      elements.ticker.textContent = state.status === 'idle'
        ? 'ENABLE NEWS TO SURFACE GLOBAL COVERAGE'
        : 'NO HEADLINE IN THE CURRENT FILTER';
      if (elements.tickerMeta) elements.tickerMeta.textContent = 'SOURCE-REPORTED / VERIFY BEFORE AMPLIFYING';
      return;
    }
    elements.ticker.href = /^https?:\/\//i.test(article.url) ? article.url : '#news-panel';
    elements.ticker.target = '_blank';
    elements.ticker.rel = 'noreferrer';
    elements.ticker.textContent = article.title || 'Untitled article';
    if (elements.tickerMeta) {
      elements.tickerMeta.textContent = `${article.sourcecountry || 'GLOBAL'} // ${relativeAge(article)} // ${article.domain || 'GDELT'}`;
    }
  }

  function renderFocus() {
    const article = state.focusedArticle;
    const origin = articleOrigin(article);
    if (!elements.focus || !elements.focusPlace || !article || !origin) {
      if (elements.focus) elements.focus.hidden = true;
      return;
    }
    elements.focus.hidden = false;
    elements.focusPlace.textContent = originLabel(article);
  }

  function focusArticle(article) {
    const origin = articleOrigin(article);
    if (!origin) return;
    state.focusedArticle = article;
    renderFocus();
    if (typeof Overview !== 'undefined' && Overview.focusCoordinates) {
      Overview.focusCoordinates({ ...origin, label: originLabel(article) });
    }
  }

  function renderArticles(articles) {
    elements.list.replaceChildren();
    if (!articles.length) {
      const empty = document.createElement('div');
      empty.className = 'news-empty';
      empty.textContent = state.status === 'unavailable'
        ? 'GLOBAL FEED UNAVAILABLE / MAP SIGNALS UNCHANGED'
        : 'NO REPORTING SIGNALS MATCH THE CURRENT FILTER';
      elements.list.appendChild(empty);
      return;
    }

    articles.slice(0, 8).forEach((article, index) => {
      const item = document.createElement('article');
      item.className = 'news-item';

      const top = document.createElement('div');
      top.className = 'news-item-top';
      const meta = document.createElement('div');
      meta.className = 'news-item-meta';
      meta.textContent = `${String(index + 1).padStart(2, '0')} // ${article.sourcecountry || 'GLOBAL'} // ${relativeAge(article)}`;
      const badge = document.createElement('span');
      badge.className = `news-badge is-${freshness(article).toLowerCase().replace(' ', '-')}`;
      badge.textContent = freshness(article);
      top.append(meta, badge);

      const link = document.createElement('a');
      link.className = 'news-item-title';
      link.href = /^https?:\/\//i.test(article.url) ? article.url : '#';
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = article.title || 'Untitled article';

      const domain = document.createElement('div');
      domain.className = 'news-item-domain';
      domain.textContent = `${article.domain || 'GDELT DOC 2.0'} // SOURCE-REPORTED`;

      const foot = document.createElement('div');
      foot.className = 'news-item-foot';
      const origin = document.createElement('span');
      origin.className = 'news-item-origin';
      origin.textContent = originLabel(article);
      const focusButton = document.createElement('button');
      focusButton.className = 'news-focus-button';
      focusButton.type = 'button';
      focusButton.textContent = articleOrigin(article) ? 'FOCUS ORIGIN' : 'NO GEO';
      focusButton.disabled = !articleOrigin(article);
      focusButton.addEventListener('click', () => focusArticle(article));
      foot.append(origin, focusButton);

      item.append(top, link, domain, foot);
      elements.list.appendChild(item);
    });
  }

  function render() {
    const articles = visibleArticles();
    renderStats(articles);
    renderCoverage(articles);
    renderArticles(articles);
    renderTicker(articles);
    renderFocus();
  }

  function clearNews() {
    state.articles = [];
    state.status = 'idle';
    state.fetchedAt = null;
    state.focusedArticle = null;
    render();
    setStatus('ENABLE NEWS TO LOAD CURRENT COVERAGE');
  }

  document.querySelectorAll('[data-news-window]').forEach(button => {
    button.addEventListener('click', () => {
      state.window = button.dataset.newsWindow || 'all';
      document.querySelectorAll('[data-news-window]').forEach(item => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      render();
    });
  });

  elements.search?.addEventListener('input', event => {
    state.query = String(event.target.value || '').trim().toLowerCase();
    render();
  });

  elements.sort?.addEventListener('change', event => {
    state.sort = event.target.value === 'coverage' ? 'coverage' : 'freshest';
    render();
  });

  elements.focusClear?.addEventListener('click', () => {
    state.focusedArticle = null;
    renderFocus();
  });

  window.addEventListener('overview:gdelt', event => {
    const detail = event.detail || {};
    if (state.replay && !detail.replay) return;
    if (detail.status === 'loading') {
      state.status = 'loading';
      setStatus('SCANNING THE LAST 24H / GDELT DOC', 'loading');
      return;
    }
    if (detail.status === 'unavailable') {
      state.status = 'unavailable';
      state.articles = [];
      render();
      setStatus('GLOBAL FEED UNAVAILABLE // MAP SIGNALS UNCHANGED', 'warn');
      return;
    }

    state.status = 'online';
    state.replay = Boolean(detail.replay);
    state.articles = Array.isArray(detail.articles) ? detail.articles : [];
    state.fetchedAt = detail.fetchedAt || Date.now();
    render();
    const visible = visibleArticles().length;
    setStatus(
      state.replay
        ? 'REPLAY FIXTURE // SOURCE-SHAPED GLOBAL CONTEXT'
        : `${visible} SIGNAL${visible === 1 ? '' : 'S'} / ${regionLabels[state.region] || 'WORLDWIDE'} / SYNCED ${new Date(state.fetchedAt).toISOString().slice(11, 16)}Z`,
      state.replay ? 'replay' : visible ? 'live' : 'warn'
    );
  });

  window.addEventListener('overview:region-changed', event => {
    state.region = event.detail?.region || 'global';
    render();
  });

  window.addEventListener('overview:view-changed', event => {
    state.replay = event.detail?.mode === 'replay';
    if (!event.detail?.layerIds?.includes('news')) clearNews();
  });
})();
