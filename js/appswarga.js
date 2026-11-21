// AppsWarga mini-app integration: follow the user's AppsWarga theme.
// Bridge docs: AppsWarga repo, docs/miniapp-bridge.md (getTheme, appswargaThemeChange).
// Outside AppsWarga nothing here runs and the CSS defaults (AppsWarga's purple theme) apply.

const HEX = /^#[0-9a-f]{6}$/i;

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes hex colour `a` toward `b` by `t` (0 = a, 1 = b). Done in JS because iOS 15 has no color-mix(). */
function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Game palette derived from an AppsWarga theme ({ primaryColor, gradient, backgroundColor }). */
export function paletteFor(theme) {
  const p = HEX.test(theme?.primaryColor ?? '') ? theme.primaryColor : null;
  if (!p) return null;
  const g1 = theme.gradient?.[1];
  const bg = HEX.test(theme.backgroundColor ?? '') ? theme.backgroundColor : mix(p, '#ffffff', 0.93);
  return {
    '--primary': p,
    '--primary-2': HEX.test(g1 ?? '') ? g1 : mix(p, '#ffffff', 0.3),
    '--bg': bg,
    '--bg-2': mix(p, '#ffffff', 0.88),
    '--surface-2': mix(p, '#ffffff', 0.86),
    '--ink': mix(p, '#111111', 0.82),
    '--ink-2': mix(p, '#333333', 0.6),
    '--muted': mix(p, '#9e9e9e', 0.6),
    '--line': mix(p, '#ffffff', 0.6),
    '--same': mix(p, '#ffffff', 0.86),
    '--key-ink': mix(p, '#111111', 0.75),
    '--key-off': mix(p, '#ffffff', 0.72),
    '--track': mix(p, '#ffffff', 0.8),
    '--key-off-ink': mix(p, '#ffffff', 0.42),
  };
}

/** Where the last AppsWarga palette is kept; theme-boot.js applies it before the first paint. */
export const THEME_KEY = 'arked.theme';

function applyTheme(theme) {
  const palette = paletteFor(theme);
  if (!palette) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(palette)) root.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette['--primary']);
  // The hub and every game share this origin, so the next page opens already in this theme.
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify({ palette }));
  } catch {
    /* storage unavailable: the next page waits for the bridge as before */
  }
}

/** Theme from the CSS variables the bridge sets on <html>, used if getTheme fails. */
function themeFromCssVars() {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => s.getPropertyValue(name).trim();
  return {
    primaryColor: v('--appswarga-primary'),
    gradient: [v('--appswarga-gradient-start')],
    backgroundColor: v('--appswarga-background') || null,
  };
}

// Settles once the AppsWarga theme is on the page, so `ready` (which takes AppsWarga's loading
// screen down) never reveals the default colours first.
let themeApplied;
const themeReady = new Promise((resolve) => { themeApplied = resolve; });

async function onBridgeReady() {
  // AppsWarga's screens are light-only, so match them even when the phone is in dark mode.
  document.documentElement.dataset.theme = 'light';
  document.documentElement.classList.add('in-appswarga');
  hideCloseButton();
  try {
    const reply = await window.appswarga.callHandler('getTheme');
    applyTheme(reply?.status === 'success' ? reply.data : themeFromCssVars());
  } catch {
    applyTheme(themeFromCssVars());
  }
  themeApplied();
}

/**
 * Hides AppsWarga's full-screen close button (bridge v2 `setCloseButton`), so the page lays
 * out like in a normal browser. People still leave by swiping in from the left edge or with
 * Android's back button. It shows again each time the mini-app opens, so this runs on every
 * load. If AppsWarga can't hide it (an older build), `aw-close-visible` on <html> makes room
 * for it under the status bar (css/style.css).
 */
async function hideCloseButton() {
  let hidden = false;
  try {
    const reply = await window.appswarga.callHandler('setCloseButton', { visible: false });
    hidden = reply?.status === 'success';
  } catch {
    /* treat as not hidden */
  }
  document.documentElement.classList.toggle('aw-close-visible', !hidden);
}

export const inAppsWarga = () => Boolean(window.appswarga?.ready);

/** Leaves the mini-app and returns to AppsWarga (bridge `close`). */
export function closeMiniApp() {
  if (inAppsWarga()) window.appswarga.callHandler('close');
}

/**
 * Tells AppsWarga the first screen is drawn, so it takes its loading screen down now
 * instead of 3 s after the page finishes loading (bridge v3 `ready`). Waits for the bridge
 * if it isn't there yet, then for the theme to be applied (at most THEME_WAIT_MS, so a slow
 * getTheme never holds the loading screen); outside AppsWarga it does nothing. An older
 * AppsWarga has no `notifyReady`, and answers `ready` with UNKNOWN_HANDLER, which is harmless.
 */
const THEME_WAIT_MS = 1500;
export function notifyAppReady() {
  const send = () => {
    const bridge = window.appswarga;
    if (typeof bridge?.notifyReady === 'function') bridge.notifyReady();
    else bridge?.callHandler?.('ready');
  };
  const afterTheme = () => Promise.race([themeReady, new Promise((r) => setTimeout(r, THEME_WAIT_MS))]).then(send);
  if (inAppsWarga()) afterTheme();
  else window.addEventListener('appswargaReady', afterTheme, { once: true });
}

/**
 * A native vibration through AppsWarga (bridge v3 `haptic`), e.g. ('notification', 'error').
 * Does nothing outside AppsWarga; an older build answers UNKNOWN_HANDLER, which is harmless.
 */
export function appsWargaHaptic(type, style) {
  if (inAppsWarga()) window.appswarga.callHandler('haptic', style ? { type, style } : { type });
}

/**
 * Opens AppsWarga's native share sheet (bridge `share`). Resolves 'shared', 'cancelled', or
 * null when AppsWarga can't do it (outside the app, or an older build without `share`), so
 * the caller falls back to the browser's own sharing.
 */
export async function appsWargaShare({ text, url, title }) {
  if (!inAppsWarga()) return null;
  try {
    const reply = await window.appswarga.callHandler('share', { text, url, title });
    if (reply?.status === 'success') return 'shared';
    if (reply?.code === 'CANCELLED') return 'cancelled';
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves once the bridge is ready, with no time limit (as AppsWarga's own
 * miniapp-bridge-test.html does). The bridge may only arrive when the page finishes loading,
 * fonts and all, which on a phone can take well over a few seconds. Outside AppsWarga it
 * never resolves, which simply means "no restriction".
 */
function whenReady() {
  if (inAppsWarga()) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('appswargaReady', () => resolve(), { once: true }));
}

/** callHandler with a time limit, like the test page; resolves an error reply on timeout. */
function callBridge(name, options = {}, timeoutMs = 30000) {
  return Promise.race([
    window.appswarga.callHandler(name, options),
    new Promise((resolve) => setTimeout(() => resolve({ status: 'error', code: 'TIMEOUT' }), timeoutMs)),
  ]);
}

// Game user types (js/profile-options.js) each AppsWarga account type may use.
// Staff and students get exactly one; a "public" account can be alumni or the general public.
// AppsWarga reports any account with the tester role as "tester"; testers are staff.
const ALLOWED_TYPES = {
  staff: ['staf'],
  tester: ['staf'],
  student: ['pelajar'],
  public: ['alumni', 'awam'],
};
let allowedPromise = null;
let lastSessionError = null;

/**
 * Why the last user-type lookup failed inside AppsWarga, e.g. TOKEN_UNAVAILABLE (no token
 * secret for this mini-app yet, offline, or not listed for this user type) or
 * UNKNOWN_USER_TYPE; null if it worked or we're outside the app.
 */
export const appsWargaSessionError = () => lastSessionError;

/**
 * The game user types the signed-in AppsWarga user may choose from, or null when there's no
 * restriction: not signed in, or TOKEN_UNAVAILABLE (offline, or the mini-app has no token
 * secret yet — getUserSession then returns no user type at all). Outside AppsWarga the
 * promise never settles, so nothing is restricted.
 */
export function appsWargaAllowedUserTypes() {
  allowedPromise ??= (async () => {
    await whenReady(); // outside AppsWarga this stays pending: no restriction, nothing to report
    try {
      // The first call may wait for AppsWarga's token server to start (cold start).
      const reply = await callBridge('getUserSession');
      if (reply?.status !== 'success') {
        lastSessionError = reply?.code || 'NO_REPLY';
        return null;
      }
      const allowed = ALLOWED_TYPES[reply.data?.userType] ?? null;
      lastSessionError = allowed ? null : `UNKNOWN_USER_TYPE:${reply.data?.userType}`;
      return allowed;
    } catch {
      lastSessionError = 'BRIDGE_ERROR';
      return null;
    }
  })().then((allowed) => {
    if (!allowed) allowedPromise = null; // try again next time (e.g. after coming back online)
    return allowed;
  });
  return allowedPromise;
}

export function initAppsWarga() {
  window.addEventListener('appswargaThemeChange', (e) => applyTheme(e.detail));
  // The bridge is injected when the page starts loading and again when it finishes.
  if (inAppsWarga()) onBridgeReady();
  else window.addEventListener('appswargaReady', onBridgeReady, { once: true });
}
