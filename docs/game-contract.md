# Arked Warga game contract

**Version 1** · What a game must do to live in Arked Warga, wherever it is hosted.

Arked Warga (this repo, `nullifye/arcade`) is the hub: one AppsWarga tile that lists the games,
holds one player profile for all of them, and adds up their points. A game is any web page the
hub opens: in the `warga-games` repo on GitHub Pages, or on another host (Vercel, …). Games
never rely on sharing a site with the hub. Everything between the two goes through what is
listed here.

The [shared kit](https://github.com/nullifye/warga-games/tree/main/shared) (`warga-games/shared/`)
implements this contract. A game in `warga-games` imports it; a game elsewhere copies the
folder. Using the kit is optional, but following this contract is not.

"Must" means the hub or other games break without it; "should" is a convention every game
follows so they feel like one app.

---

## 1. Registering a game

| What | Where | Rule |
|---|---|---|
| Game id | everywhere below | lowercase letters, digits and single hyphens (`^[a-z0-9]+(-[a-z0-9]+)*$`), never changed once live |
| Catalogue entry | `js/games.js` (`GAMES`) | `id`, `name`, `desc`, `url` (https), `icon` (`icons/<id>.svg`), `category`, up to 3 `tags` (`Harian` when it has a daily challenge), `status` |
| Score limits | `supabase/arked.sql` (`arked_games`) | `name`, `max_points` (1–100000) and `max_points_per_sec`, each derived from the rules in a comment; run the SQL **before** the game goes live |
| Host | AppsWarga's Mini Apps manager | a game on a new host must be added to Arked Warga's allowed hosts |

`npm test` checks the catalogue entry.

## 2. Opening and leaving

- The hub opens a game at its `url` with **`?dari=arked`** added (other query values are kept).
- With `?dari=arked`, the game **must** offer a way back to the hub (‹ at the top left, instead
  of ✕). Without it, the game is on its own (opened from a link or bookmark).
- Going back **should** walk the browser history to the hub's page (so the hub comes back as it
  was) when the game was opened straight from the hub, and otherwise open the hub's address:
  **`https://nullifye.github.io/arcade/`**. The return address is never taken from the link.
- A game **should not** leave entries of its own screens under its home screen in the history,
  so going back is one step and never flashes a game screen.

The kit: `arked-link.js` (`initFromArked()`, `backToArked()`, `hubUrl()`).

## 3. Inside AppsWarga

AppsWarga injects a bridge, `window.appswarga`, and fires `appswargaReady` when it is ready
(AppsWarga's own docs: `docs/webapp-bridge.md` in the AppsWarga repo). A game:

- **must** keep shared values in the bridge's storage (section 4): `storage.get`, `storage.set`;
- **should** hide AppsWarga's close button while it loads (`setCloseButton { visible: false }`),
  as it has its own way back, and call `close` from its own close button;
- **should** call `ready` once its first screen is drawn, so AppsWarga drops its loading screen;
- **should** follow the user's theme (`getTheme`), and may use `haptic` and `share`;
- **must** work without the bridge too (in a plain browser), for testing.

Back (the swipe in from the left edge, Android's back) is AppsWarga's: games don't add their
own edge swipes.

The kit: `appswarga.js`, `theme-boot.js`.

## 4. Shared values

Values every game and the hub read and write, as JSON. Inside AppsWarga they live in the
bridge's storage, which belongs to the Arked Warga listing and the signed-in user, not to a
site: so a game on any host sees the same values. A local copy in `localStorage` keeps reads
synchronous; outside AppsWarga, `localStorage` is the only store (shared only by pages on the
same site).

| Key | Value | Written by |
|---|---|---|
| `arked.profile` | `{ playerId, nickname, userType, campus }` | the hub, or a game's profile form |
| `arked.game.<id>` | `{ lastPlayedAt, daily }` | the game (the hub writes `lastPlayedAt` when it opens it) |

- `playerId`: a random UUID, made once per player and never shown to anyone.
- `nickname`: 1–20 characters. `userType`: `pelajar`, `staf`, `alumni` or `awam`. `campus`:
  1–60 characters, one of the campuses in the kit's `profile-options.js`; `Bukan warga UiTM`
  for `awam`. Inside AppsWarga, only the user types AppsWarga allows for the signed-in user may
  be chosen.
- `lastPlayedAt`: milliseconds since 1970 (the hub's Sambung bermain card).
- `daily`: `{ date, status: 'playing' | 'done', won?, score? }` or `null`; `date` is
  `YYYY-MM-DD` in Malaysia time.

Rules: write the local copy and the bridge together; on load (and when the page comes back into
view) bring the local copies in line with the bridge, where the stored value wins; never delete
another game's key. A game without a profile asks for one before play (and writes it here).

`arked.theme` (the last AppsWarga palette) is a same-site convenience only, so the first paint
already has the user's colours; a game on another host simply doesn't get it.

The kit: `shared-store.js`, `profile.js`, `profile-options.js`.

## 5. Scores

Scores go to Supabase over plain HTTPS (`POST <SUPABASE_URL>/rest/v1/rpc/<function>`, with the
project's publishable key), so any host can send them.

**Recording a round.** After every finished round, the game **must** call:

```
arked_record(p_player_id, p_game, p_points, p_seconds, p_nickname, p_user_type, p_campus,
             p_daily = false, p_play_date = null)
```

with the player's current profile. The database checks every round and rejects:

| Error code | When |
|---|---|
| `22023` | unknown game; bad profile; `p_play_date` more than a day from today (Malaysia); points over `max_points`, or over `p_seconds × max_points_per_sec`; `p_seconds` not 1–86400 |
| `23505` | a second daily-challenge round (`p_daily = true`) for the same player, game and day |
| `54000` | another round from the same player and game within 10 seconds |

A game **should** show the round as sent, or the error with a way to retry; a daily round
already recorded (`23505`) counts as sent. Only rounds that score (e.g. against the AI, not
2 players on one phone) are recorded.

**Reading the boards.**

| Function | Gives |
|---|---|
| `arked_top(p_game, p_player_id, p_play_date, p_limit)` | players by total points for one game (`p_game`, or null for all), one day (`p_play_date`) or all time (null); top `p_limit` (1–100) plus the caller's own row (`is_me`). Rows: `rank, nickname, user_type, campus, total_points, total_seconds, plays, is_me` |
| `arked_campus_rank(p_game, p_limit)` | campuses by total points. Rows: `rank, campus, players, total_points, total_seconds, plays` |
| `arked_player_summary(p_player_id)` | one player's totals per game (the hub's Jumlah markah card) |

The kit: `leaderboard.js` (with `config.js` holding the Supabase address and key).

## 6. Conventions (should)

So every game feels like one app:

- Malay text throughout; the page's `lang="ms"`.
- **Papan Markah** with three tabs, **Hari Ini** · **Keseluruhan** · **Kampus**, always opening
  on Hari Ini (the kit: `board.js`, with the markup in its header comment).
- A one-try daily challenge (Cabaran Harian), if any: the same challenge for everyone that day
  (Malaysia time), one try per player (kept in `arked.game.<id>.daily`), labelled `Harian` in the
  catalogue. Its round **must** be sent with `p_daily = true` and `p_play_date` = the
  challenge's day, so the database refuses a second one that day even if the phone's record is
  lost; a `23505` reply then counts as sent (Teka Kata, Duga Kata, Congak Matematik,
  Letup-Letup). A daily course that may be replayed all day (Kejar Lapan's Harian) is not a
  one-try challenge: its runs are ordinary rounds, without the mark.
- Icons: a 64×64 SVG on the purple `#4a2380` rounded square (`rx="14"`), the same file in the
  game and in the hub's `icons/`.
- A version shown on the home screen, raised when the game changes.

## Changing the contract

Additions that old games can ignore keep the version. Anything an existing game would have to
change for (a renamed key or field, a new required call) raises it, says what changed here, and
goes into the kit in the same step.
