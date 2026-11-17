# Arked Warga

The game hub for UiTM's AppsWarga app: one tile in AppsWarga opens a list of games, one
player profile shared by every game, and combined points across all of them.

Live: https://nullifye.github.io/arcade/ (GitHub Pages, static, no build step).

## Run locally

```sh
npm run serve        # http://localhost:8080/arcade/  (the games at /warga-games/)
npm test             # node --test tests/
```

`tools/dev-server.mjs` serves this repo at `/arcade/` and the games repo (`../warga-games`)
at `/warga-games/`, like GitHub Pages. On the dev server, games hosted on `nullifye.github.io`
open from the local copy.

## How the games share data

Games can live on any host (GitHub Pages, Vercel, …), so nothing relies on one site's storage.

- **Profile and progress:** `js/shared-store.js`. Inside AppsWarga, values go in the bridge's
  `storage.get/set`. That storage belongs to the AppsWarga listing (Arked Warga) and the
  signed-in user, so every game opened from the Arked tile sees it, whatever its host.
  localStorage keeps a copy so reads stay synchronous. Outside AppsWarga, localStorage is the
  only store.
  - `arked.profile`: `{ playerId, nickname, userType, campus }`
  - `arked.game.<id>`: `{ lastPlayedAt, daily: { date, status: 'playing' | 'done', won?, score? } | null }`
- **Combined points:** `supabase/arked.sql`, in the same Supabase project as Teka Kata.
  Teka Kata's rounds are copied in by a trigger on `cg_scores`. Other games call
  `arked_record(p_player_id, p_game, p_points, p_seconds)`. The hub reads
  `arked_player_summary(p_player_id)`.

## Adding a game

Games live in the `warga-games` repo (`https://nullifye.github.io/warga-games/<game>/`); its
README covers building one with the shared code. A game on another host (e.g. Vercel) works
too: copy `js/shared-store.js`, honour `?dari=arked`, and call `arked_record`.

1. Add an entry to `js/games.js` (`status: 'soon'` shows an Akan Datang card) and its icon to
   `icons/`.
2. In Supabase: add the game to `arked_games` in `supabase/arked.sql` (with its point bounds)
   and run it.
3. A game on a new host: add the host to Arked Warga's allowed hosts in AppsWarga.
4. Set `status: 'live'`.

## Boards for every game

`supabase/arked.sql` keeps every round of every game in `arked_plays` (with the player's
nickname, category and campus), so any game gets Hari Ini / Keseluruhan / Kampus boards from
`arked_top(p_game, …)` and `arked_campus_rank(p_game, …)`. `p_game` null covers all games.

## Files kept in step with warga-games

`js/appswarga.js`, `js/select.js`, `js/profile-options.js`, `js/config.js`,
`js/shared-store.js`, and the shared parts of `css/style.css` (tokens, buttons, header,
dialogs, dropdown) are copies of `warga-games/shared/`. Change them in both repos.

## Setup

1. Run `supabase/arked.sql` in the Supabase SQL Editor (after Teka Kata's `schema.sql`).
2. In AppsWarga's Mini Apps manager, for the Arked Warga listing:
   - start URL `https://nullifye.github.io/arcade/`;
   - allowed hosts: every game host (`nullifye.github.io` for now);
   - icon `icon-512.png`;
   - Full screen on.
