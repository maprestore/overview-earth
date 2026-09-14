/**
 * Source request helpers
 * -------------------------------------------------------------
 * Providers fail for different reasons. Try documented alternatives in
 * order, but let the caller decide how to label the resulting state.
 */

const OverviewSources = (() => {
  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      ['username', 'password', 'token', 'api_key', 'apikey', 'key'].forEach(name => {
        if (url.searchParams.has(name)) url.searchParams.set(name, '[redacted]');
      });
      return url.toString();
    } catch (error) {
      return String(value).slice(0, 180);
    }
  }

  async function read(urls, init = {}, parse = response => response) {
    const errors = [];
    const { timeoutMs = 12000, ...fetchInit } = init;
    for (const url of (Array.isArray(urls) ? urls : [urls])) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const callerSignal = fetchInit.signal;
      const forwardAbort = () => controller.abort(callerSignal.reason);
      try {
        if (callerSignal) {
          if (callerSignal.aborted) controller.abort(callerSignal.reason);
          else callerSignal.addEventListener('abort', forwardAbort, { once: true });
        }
        const response = await fetch(url, { ...fetchInit, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { data: await parse(response), url };
      } catch (error) {
        errors.push(`${safeUrl(url)} (${error.message || 'request failed'})`);
      } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', forwardAbort);
      }
    }
    throw new Error(`all source attempts failed: ${errors.join('; ')}`);
  }

  async function request(urls, init) {
    const result = await read(urls, init);
    return { response: result.data, url: result.url };
  }

  async function json(urls, init) {
    return read(urls, init, response => response.json());
  }

  async function text(urls, init) {
    return read(urls, init, response => response.text());
  }

  return { request, json, text };
})();
