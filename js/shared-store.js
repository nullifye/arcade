// Arked Warga shared store: what Arked Warga and its games share, wherever each is hosted.
// Keep this file identical in Arked Warga and in every game (copy it across).
//
// Inside AppsWarga, values live in the bridge's storage (storage.get / storage.set). That
// storage belongs to the AppsWarga listing (Arked Warga) and the signed-in user, not to a
// site, so a game on another host (e.g. Vercel) opened from Arked Warga sees the same values.
// localStorage keeps a copy, so reads stay synchronous. Outside AppsWarga, localStorage is the
// only store, shared only by pages on the same site; that's fine for testing in a browser.
//
// Keys and values (JSON):
//   arked.profile     { playerId, nickname, userType, campus }
//   arked.game.<id>   { lastPlayedAt, daily: { date, status: 'playing' | 'done', won?, score? } | null }
//                     lastPlayedAt is ms since 1970; daily.date is YYYY-MM-DD in Malaysia time.

export const PROFILE_KEY = 'arked.profile';
export const gameKey = (id) => `arked.game.${id}`;

const local = {
  get(key) {
    try {
      const raw = globalThis.localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable (private mode, blocked site data) */
    }
  },
};

// Writes still on their way to AppsWarga's storage (key -> count), and keys whose last push
// failed. While either applies, this page's value is the newer one, so a sync must not
// replace it with the stored copy.
const pending = new Map();
const unsent = new Set();

const bridge = () => (globalThis.window?.appswarga?.ready ? globalThis.window.appswarga : null);

/** Resolves with the bridge once AppsWarga injects it, with no time limit. Never resolves outside AppsWarga. */
function whenBridge() {
  const b = bridge();
  if (b) return Promise.resolve(b);
  return new Promise((resolve) =>
    globalThis.window?.addEventListener?.('appswargaReady', () => resolve(bridge()), { once: true }),
  );
}

async function bridgeGet(b, key) {
  const reply = await b.callHandler('storage.get', { key });
  if (reply?.status !== 'success') throw new Error(reply?.code || 'STORAGE_ERROR');
  const raw = reply.data?.value;
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function bridgeSet(b, key, value) {
  const reply = await b.callHandler('storage.set', { key, value: JSON.stringify(value) });
  if (reply?.status !== 'success') throw new Error(reply?.code || 'STORAGE_ERROR');
}

/** The value for `key` (the local copy), or `fallback`. */
export function readShared(key, fallback = null) {
  return local.get(key) ?? fallback;
}

/** Saves `value` locally now, and in AppsWarga's storage as soon as the bridge is there. */
export function writeShared(key, value) {
  local.set(key, value);
  pending.set(key, (pending.get(key) ?? 0) + 1);
  return whenBridge()
    .then(async (b) => {
      if (!b) return;
      try {
        await bridgeSet(b, key, value);
        unsent.delete(key);
      } catch {
        unsent.add(key); // the local copy stands; the next sync pushes it
      }
    })
    .finally(() => {
      const n = pending.get(key) - 1;
      if (n) pending.set(key, n);
      else pending.delete(key);
    });
}

/** Merges `patch` into the object stored at `key` and saves it. Returns the new value. */
export function updateShared(key, patch) {
  const value = { ...(readShared(key) ?? {}), ...patch };
  writeShared(key, value);
  return value;
}

/**
 * Copies a value from an older local key (e.g. Teka Kata's 'tk.profile') when `key` has
 * nothing yet. Local only: if AppsWarga's storage already has a value, syncShared() still
 * replaces it, and if it has none, syncShared() pushes this one up.
 */
export function migrateLocal(fromKey, key) {
  if (local.get(key) != null) return;
  const old = local.get(fromKey);
  if (old != null) local.set(key, old);
}

/**
 * Inside AppsWarga, brings the local copies of `keys` in line with AppsWarga's storage:
 * the stored value wins (and `onChange(key, value)` runs if it differs); a key it doesn't
 * have yet is filled from the local copy. Call it on load, and again when the page comes
 * back into view (another game may have changed the values). Outside AppsWarga it never
 * resolves.
 */
export function syncShared(keys, onChange = () => {}) {
  const busy = (key) => pending.has(key);
  return whenBridge().then(async (b) => {
    if (!b) return;
    for (const key of keys) {
      if (busy(key)) continue; // writeShared() is sending a newer value
      try {
        const mine = local.get(key);
        if (unsent.has(key)) {
          if (mine != null) await bridgeSet(b, key, mine);
          unsent.delete(key);
          continue;
        }
        const remote = await bridgeGet(b, key);
        if (busy(key)) continue; // written while we waited
        if (remote == null) {
          if (mine != null) await bridgeSet(b, key, mine);
        } else if (JSON.stringify(remote) !== JSON.stringify(local.get(key))) {
          local.set(key, remote);
          onChange(key, remote);
        }
      } catch {
        /* keep the local copy */
      }
    }
  });
}
