/**
 * Signal Brief panel
 * -------------------------------------------------------------
 * GDELT owns the request. This module only renders the event it emits,
 * keeping the presentation separate from source-specific parsing.
 */

(() => {
  const statusEl = document.getElementById('news-status');
  const listEl = document.getElementById('news-list');
  if (!statusEl || !listEl) return;

  function formatSeenDate(value) {
    const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})/);
    if (!match) return 'RECENT';
    return `${match[2]}.${match[3]} / ${match[4]}:${match[5]}Z`;
  }

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.className = `news-status${tone ? ` is-${tone}` : ''}`;
  }

  function renderArticles(articles) {
    listEl.replaceChildren();
    for (const article of articles.slice(0, 5)) {
      const item = document.createElement('article');
      item.className = 'news-item';

      const meta = document.createElement('div');
      meta.className = 'news-item-meta';
      meta.textContent = `${article.sourcecountry || 'GLOBAL'} // ${formatSeenDate(article.seendate)}`;

      const link = document.createElement('a');
      link.className = 'news-item-title';
      link.href = /^https?:\/\//i.test(article.url) ? article.url : '#';
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = article.title || 'Untitled article';

      const domain = document.createElement('div');
      domain.className = 'news-item-domain';
      domain.textContent = article.domain || 'GDELT DOC 2.0';

      item.append(meta, link, domain);
      listEl.appendChild(item);
    }
  }

  function clearNews() {
    renderArticles([]);
    setStatus('ENABLE NEWS TO LOAD CURRENT COVERAGE');
  }

  window.addEventListener('overview:gdelt', event => {
    const detail = event.detail || {};
    if (detail.status === 'loading') {
      setStatus('REQUESTING 24H COVERAGE…', 'loading');
      return;
    }
    if (detail.status === 'unavailable') {
      setStatus('GDELT UNAVAILABLE // MAP SIGNALS UNCHANGED', 'warn');
      listEl.replaceChildren();
      return;
    }

    const articles = Array.isArray(detail.articles) ? detail.articles : [];
    renderArticles(articles);
    setStatus(
      detail.replay
        ? 'REPLAY FIXTURE // SOURCE-SHAPED CONTEXT'
        : articles.length ? `${articles.length} RECENT REPORTING SIGNALS` : 'NO STORIES RETURNED // FEED ONLINE',
      detail.replay ? 'replay' : articles.length ? 'live' : 'warn'
    );
  });

  window.addEventListener('overview:view-changed', event => {
    if (!event.detail?.layerIds?.includes('news')) clearNews();
  });
})();
