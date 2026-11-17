// A localStorage and an AppsWarga bridge (storage.get/set only) for tests.
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    map: m,
  };
}

/** A fake bridge whose storage is `store` (a Map of strings), shared like AppsWarga's per listing. */
export function fakeBridge(store = new Map(), { delayMs = 0 } = {}) {
  const calls = [];
  return {
    ready: true,
    store,
    calls,
    async callHandler(name, opts) {
      calls.push([name, opts]);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (name === 'storage.get') return { status: 'success', data: { value: store.get(opts.key) ?? null } };
      if (name === 'storage.set') {
        store.set(opts.key, opts.value);
        return { status: 'success', data: {} };
      }
      return { status: 'error', code: 'UNKNOWN_HANDLER' };
    },
  };
}

/** A window with addEventListener/dispatch for 'appswargaReady'. */
export function fakeWindow() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    fire(type) {
      const fns = listeners.get(type) ?? [];
      listeners.delete(type);
      for (const fn of fns) fn();
    },
  };
}

let n = 0;
/** A fresh copy of shared-store.js (its pending-write state is per module instance). */
export const freshStore = () => import(`../js/shared-store.js?copy=${++n}`);
