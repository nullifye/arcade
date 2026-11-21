// Applies the last AppsWarga theme before the first paint, so a game (or the hub) never flashes
// the default colours or dark mode while it waits for the AppsWarga bridge. appswarga.js saves
// the palette under 'arked.theme' each time it applies one, which only happens inside AppsWarga,
// so normal browsers keep the default and dark themes. A plain (non-module) script, loaded in
// <head> before the stylesheets; warga-games keeps the games' copy in shared/theme-boot.js.
(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('arked.theme'));
    var palette = saved && saved.palette;
    if (!palette || typeof palette !== 'object' || !/^#[0-9a-f]{6}$/i.test(palette['--primary'])) return;
    var root = document.documentElement;
    root.setAttribute('data-theme', 'light'); // AppsWarga is light-only
    root.classList.add('in-appswarga');
    for (var name in palette) {
      if (/^--[a-z0-9-]+$/.test(name) && /^#[0-9a-f]{6}$/i.test(palette[name])) root.style.setProperty(name, palette[name]);
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', palette['--primary']);
  } catch (e) {
    /* no storage or a bad value: the bridge applies the theme as before */
  }
})();
