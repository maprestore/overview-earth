/**
 * Local observation history
 * -------------------------------------------------------------
 * Keeps a bounded seven-day archive in IndexedDB so the static app can show
 * real history collected by this browser without pretending a provider has
 * an historical API. A hosted deployment can replace this adapter later.
 */

const OverviewHistory = (() => {
  const DB_NAME = 'overview-earth-history';
  const DB_VERSION = 1;
  const STORE_NAME = 'snapshots';
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_POINTS_PER_SNAPSHOT = 2500;
  const MAX_DISPLAY_POINTS = 5000;
  const SAMPLE_BUCKET_MS = 15 * 60 * 1000;
  const remoteUrl = typeof window !== 'undefined' ? String(window.OVERVIEW_HISTORY_URL || '').trim() : '';
  let database;

  function open() {
    if (database) return database;
    if (!window.indexedDB) return Promise.reject(new Error('IndexedDB unavailable'));
    database = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('layerId', 'layerId', { unique: false });
          store.createIndex('capturedAt', 'capturedAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('history database failed to open'));
    });
    return database;
  }

  function clonePoint(point, observedAt) {
    const copy = { ...point, observedAt: point.observedAt || observedAt };
    if (Array.isArray(point.line)) copy.line = point.line.map(([lon, lat]) => [lon, lat]);
    if (Array.isArray(point.lines)) copy.lines = point.lines.map(line => line.map(([lon, lat]) => [lon, lat]));
    return copy;
  }

  function transaction(mode, callback) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try {
        result = callback(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('history transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('history transaction aborted'));
    }));
  }

  async function record(layerId, points, capturedAt = Date.now()) {
    if (!layerId || !Array.isArray(points) || !points.length) return false;
    const snapshot = {
      key: `${layerId}:${capturedAt}:${Math.random().toString(36).slice(2)}`,
      layerId,
      capturedAt,
      points: points.slice(0, MAX_POINTS_PER_SNAPSHOT).map(point => clonePoint(point, capturedAt))
    };
    try {
      await transaction('readwrite', store => store.put(snapshot));
      void prune();
      return true;
    } catch (error) {
      console.info(`Overview history: ${error.message || error}`);
      return false;
    }
  }

  async function read(layerId, since) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
          .index('layerId').getAll(IDBKeyRange.only(layerId));
        request.onsuccess = () => resolve(request.result
          .filter(snapshot => snapshot.capturedAt >= since)
          .sort((a, b) => a.capturedAt - b.capturedAt));
        request.onerror = () => reject(request.error || new Error('history read failed'));
      });
    } catch (error) {
      return [];
    }
  }

  async function allSnapshots(layerIds) {
    const ids = Array.isArray(layerIds) ? layerIds : [];
    const groups = await Promise.all(ids.map(id => read(id, Date.now() - RETENTION_MS)));
    return groups.flat();
  }

  function pointKey(point) {
    return point.id || `${point.lat}:${point.lon}:${point.label || ''}`;
  }

  async function pointsFor(layerId, since = Date.now() - RETENTION_MS) {
    const snapshots = await read(layerId, since);
    if (remoteUrl) {
      try {
        const url = new URL(remoteUrl, window.location.href);
        url.searchParams.set('layer', layerId);
        url.searchParams.set('since', String(since));
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data?.snapshots)) snapshots.push(...data.snapshots);
          else if (Array.isArray(data?.points)) snapshots.push({ capturedAt: Date.now(), points: data.points });
        }
      } catch (error) {
        // The local archive remains authoritative when a managed history API is offline.
      }
    }
    snapshots.sort((a, b) => a.capturedAt - b.capturedAt);
    const points = [];
    const seen = new Set();
    for (const snapshot of snapshots) {
      const capturedAt = Number(snapshot.capturedAt) || Date.now();
      const bucket = Math.floor(capturedAt / SAMPLE_BUCKET_MS);
      for (const point of (Array.isArray(snapshot.points) ? snapshot.points : [])) {
        const key = `${pointKey(point)}:${point.time || bucket}`;
        if (seen.has(key)) continue;
        seen.add(key);
        points.push(point);
      }
    }
    if (points.length <= MAX_DISPLAY_POINTS) return points;
    const step = Math.ceil(points.length / MAX_DISPLAY_POINTS);
    return points.filter((point, index) => index % step === 0);
  }

  async function prune() {
    const cutoff = Date.now() - RETENTION_MS;
    try {
      await transaction('readwrite', store => {
        const request = store.index('capturedAt').openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (cursor.value.capturedAt < cutoff) cursor.delete();
          cursor.continue();
        };
      });
    } catch (error) {
      // History is optional; a provider refresh must never fail because it cannot prune.
    }
  }

  async function bounds(layerIds) {
    const snapshots = await allSnapshots(layerIds);
    const values = snapshots.map(snapshot => Number(snapshot.capturedAt)).filter(Number.isFinite);
    return {
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null
    };
  }

  async function statsFor(layerIds, since = Date.now() - RETENTION_MS) {
    const ids = Array.isArray(layerIds) ? layerIds : [];
    const result = {};
    await Promise.all(ids.map(async id => {
      const snapshots = (await read(id, since)).filter(snapshot => Array.isArray(snapshot.points));
      const counts = snapshots.map(snapshot => snapshot.points.length);
      result[id] = {
        snapshots: counts.length,
        average: counts.length ? counts.reduce((sum, count) => sum + count, 0) / counts.length : null,
        latest: counts.at(-1) ?? null
      };
    }));
    return result;
  }

  return {
    record,
    pointsFor,
    bounds,
    statsFor,
    available: () => Boolean(window.indexedDB || remoteUrl),
    remote: Boolean(remoteUrl),
    retentionDays: 7
  };
})();
