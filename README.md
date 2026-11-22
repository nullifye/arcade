# Arked Warga

The game hub for UiTM's AppsWarga app: one tile in AppsWarga opens a list of games, one
player profile shared by every game, and combined points across all of them.

Live: https://nullifye.github.io/arcade/ (GitHub Pages, static, no build step). The games
themselves live in the [`warga-games`](https://github.com/nullifye/warga-games) repo.

## What the hub shows

- **Profile chip**: nickname, category (Pelajar, Staf, Alumni, Awam) and campus, shared by every
  game. Inside AppsWarga, only the categories the app allows for the signed-in user can be
  chosen; a saved profile with another category is switched to an allowed one.
- **Jumlah markah**: the player's total points, rounds and play time across all games, with a
  per-game breakdown once they have played more than one (`arked_player_summary`). Hidden when
  offline or before the database is set up.
- **Sambung bermain**: the game played most recently, with how long ago.
- **The game list** from `js/games.js`: a **Main** button on live games, an **Akan Datang** tag
  on the others. A game opens with `?dari=arked`, so it shows ‹ back to Arked instead of ✕.
  Main shows a spinner at once and opens the game without waiting for AppsWarga's storage.
- **Prefetch:** once the hub is idle it fetches each live game's page and small files (listed in
  warga-games `preload.json`) into the cache, a few at a time, so a tapped game opens almost at
  once. Skipped with data saver on or on 2G.
- **Pasang aplikasi:** the hub is an installable web app (`manifest.webmanifest`). Installed, it
  opens from the home screen in full screen, and the games open in the same window (the manifest's
  scope is the whole site, so `/warga-games/` is included). The button (`js/install.js`) shows
  only when the browser can install it right now (Chrome, Edge, Samsung Internet), never inside
  AppsWarga or in the installed app; the help dialog tells iPhone users to use Kongsi ▸ Tambah ke
  Skrin Utama. There is no service worker, so the installed app needs a connection, like the site.
- **The version** at the bottom (`index.html`, now 1.5); tap it for a fresh reload. Bump it when
  the hub changes.

## Run locally

```sh
npm run serve        # http://localhost:8080/arcade/  (the games at /warga-games/)
npm test             # node --test tests/
```

`tools/dev-server.mjs` serves this repo at `/arcade/` and the games repo (`../warga-games`)
at `/warga-games/`, like GitHub Pages. On the dev server, games hosted on `nullifye.github.io`
open from the local copy.

The app icons are PNGs rendered from `icon.svg` (`icon-192.png`, `icon-512.png`,
`apple-touch-icon.png`, full square as iOS rounds it) and `icon-maskable.svg`
(`icon-maskable-512.png`, artwork at 80% for Android's masks). Re-render them if the icon
changes. Never change the manifest's `id`: it is the installed app's identity.

Tests cover the catalogue (`games.test.mjs`: every entry is valid, live games have an https URL,
ids are unique, icon files exist, and launch links carry `?dari=arked`), points
(`points.test.mjs`), formatting (`format.test.mjs`), shared storage (`shared-store.test.mjs`) and
the app manifest and its icons (`manifest.test.mjs`).

## How the games share data

Games can live on any host (GitHub Pages, Vercel, …), so nothing relies on one site's storage.

- **Profile and progress:** `js/shared-store.js`. Inside AppsWarga, values go in the bridge's
  `storage.get/set`. That storage belongs to the AppsWarga listing (Arked Warga) and the
  signed-in user, so every game opened from the Arked tile sees it, whatever its host.
  localStorage keeps a copy so reads stay synchronous. Outside AppsWarga, localStorage is the
  only store.
  - `arked.profile`: `{ playerId, nickname, userType, campus }`
  - `arked.game.<id>`: `{ lastPlayedAt, daily: { date, status: 'playing' | 'done', won?, score? } | null }`
- **Combined points:** `supabase/arked.sql`. Every game reports each round with `arked_record`
  (warga-games `shared/leaderboard.js`). The hub reads `arked_player_summary(p_player_id)`.
- **Back to the hub:** each game walks the browser history back to the hub's page, so the hub
  comes back as it was. The games keep no game-screen entry under their home screen, so this is
  one step and never flashes the game (see the warga-games README).

## Boards and score limits

`supabase/arked.sql` keeps every round of every game in `arked_plays` (with the player's
nickname, category and campus), so every game gets the same Hari Ini / Keseluruhan / Kampus
boards from `arked_top(p_game, …)` and `arked_campus_rank(p_game, …)`. `p_game` null covers
all games.

- `arked_record(…, p_daily, p_play_date)`: a game with a daily challenge (Teka Kata, Duga Kata)
  sends `p_daily = true`; the database allows one per player, game and day.
- At most one round per player and game every 10 seconds.
- Each round is capped by its game's `arked_games.max_points` and `max_points_per_sec` × seconds.
  The SQL explains each limit from the game's rules; keep it in step with any scoring change.

## Adding a game

Games live in the `warga-games` repo (`https://nullifye.github.io/warga-games/<game>/`); its
README covers building one with the shared code. A game on another host (e.g. Vercel) works
too: copy `js/shared-store.js`, honour `?dari=arked`, and call `arked_record`.

1. Add an entry to `js/games.js` (`id`, `name`, `desc`, `url`, `icon`, up to 3 `tags`,
   `status: 'soon'` for an Akan Datang card) and its icon to `icons/<id>.svg`. Icons are 64×64
   SVGs on the purple `#4a2380` rounded square (`rx="14"`); use a copy of the game's own
   `icon.svg`. `npm test` checks the entry.
2. In Supabase: add the game to `arked_games` in `supabase/arked.sql`, with its point bounds and
   a comment deriving them from the rules, and run it. Do this before the game goes live, or its
   rounds are rejected ("Permainan tidak dikenali").
3. A game on a new host: add the host to Arked Warga's allowed hosts in AppsWarga.
4. Set `status: 'live'`, and bump the hub version.

## Files kept in step with warga-games

`js/appswarga.js`, `js/select.js`, `js/profile-options.js`, `js/config.js`,
`js/shared-store.js`, and the shared parts of `css/style.css` (tokens, buttons, header,
dialogs, dropdown) are copies of `warga-games/shared/`. Change them in both repos.

## Setup

1. Run `supabase/arked.sql` in the Supabase SQL Editor (it is safe to run again after changes;
   `arked_games` rows are updated in place).
2. In AppsWarga's Mini Apps manager, for the Arked Warga listing:
   - start URL `https://nullifye.github.io/arcade/`;
   - allowed hosts: every game host (`nullifye.github.io` for now);
   - icon `icon-512.png`;
   - Full screen on.
