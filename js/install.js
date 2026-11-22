// Install Arked Warga as an app (manifest.webmanifest): it then opens from the home screen in
// full screen, and the games (same site, inside the manifest's scope) open in the same window.
//
// The Pasang aplikasi button stays hidden unless the browser can install it right now:
// navigator.install() where supported, otherwise a captured beforeinstallprompt (Chrome, Edge,
// Samsung Internet on Android). Never inside AppsWarga (its web view can't install apps) or when
// already running as the installed app. Safari has neither; the help dialog says how to add it there.

/** True when running as the installed app (Android full screen / standalone, or iOS home screen). */
export const runningAsApp = () =>
  matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;

let deferredPrompt = null;

/**
 * @param {HTMLButtonElement} button hidden at first
 * @param {(msg: string) => void} toast
 */
export function initInstall(button, toast) {
  if (runningAsApp()) {
    document.documentElement.classList.add('as-app');
    return;
  }
  const supportsWebInstall = typeof Navigator.prototype.install === 'function';
  const show = () => { button.hidden = document.documentElement.classList.contains('in-appswarga'); };
  if (supportsWebInstall) show();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // our button instead of the browser's banner
    deferredPrompt = e;
    if (!supportsWebInstall) show();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    button.hidden = true;
    toast('Arked Warga telah dipasang.');
  });

  button.addEventListener('click', async () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    // aria-disabled, not disabled, so the button keeps focus.
    button.setAttribute('aria-disabled', 'true');
    try {
      if (supportsWebInstall) {
        await navigator.install(); // straight from the click: it needs the user's tap
        button.hidden = true;
      } else if (deferredPrompt) {
        const prompt = deferredPrompt; // single use
        deferredPrompt = null;
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome !== 'accepted') toast('Pemasangan dibatalkan.');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error(err);
      toast(err?.name === 'AbortError' ? 'Pemasangan dibatalkan.' : 'Tidak dapat memasang sekarang.');
    } finally {
      button.removeAttribute('aria-disabled');
      // A used beforeinstallprompt can't be shown again: hide until the browser offers a new one.
      if (!supportsWebInstall && !deferredPrompt) button.hidden = true;
    }
  });
}
