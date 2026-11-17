// The game catalogue. Adding a game, wherever it's hosted, is one entry here (see README.md).
//
//   id      lowercase slug; also its arked.game.<id> key and its id in supabase/arked.sql
//   name    shown on the card
//   desc    one short sentence
//   url     the game's https address, on any host listed in AppsWarga's allowed hosts
//   icon    square image in this repo (icons/), shown at 56 px
//   tags    up to 3 short labels
//   status  'live' (playable) or 'soon' (an "Akan Datang" card, not playable)

export const GAMES = [
  {
    id: 'teka-kata',
    name: 'Teka Kata',
    desc: 'Pecahkan kod nombor dan temui frasa tentang UiTM dan Malaysia.',
    url: 'https://nullifye.github.io/warga-games/teka-kata/',
    icon: 'icons/teka-kata.svg',
    tags: ['Kata', 'Kriptogram'],
    status: 'live',
  },
  {
    id: 'ular',
    name: 'Ular',
    desc: 'Makan, membesar, dan jangan langgar diri sendiri.',
    url: 'https://nullifye.github.io/warga-games/ular/',
    icon: 'icons/ular.svg',
    tags: ['Arked', 'Refleks'],
    status: 'live',
  },
  {
    id: 'silang-kata',
    name: 'Silang Kata',
    desc: 'Isi petak silang kata dengan istilah kampus dan budaya.',
    url: null,
    icon: 'icons/silang-kata.svg',
    tags: ['Kata'],
    status: 'soon',
  },
  {
    id: 'susun-nombor',
    name: 'Susun Nombor',
    desc: 'Teka-teki logik nombor yang mengasah minda.',
    url: null,
    icon: 'icons/susun-nombor.svg',
    tags: ['Logik'],
    status: 'soon',
  },
];

// The host the games in this repo's account are published on. While developing, a game on
// this host is opened from the local dev server instead (tools/dev-server.mjs).
const HOME_HOST = 'nullifye.github.io';

/** Problems with one catalogue entry, as strings; empty when it's valid. */
export function gameProblems(g) {
  const out = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.id ?? '')) out.push('id must be a lowercase slug');
  if (!g.name?.trim()) out.push('name is required');
  if (!g.desc?.trim()) out.push('desc is required');
  if (!['live', 'soon'].includes(g.status)) out.push("status must be 'live' or 'soon'");
  if (!g.icon?.startsWith('icons/')) out.push('icon must be in icons/');
  if (!Array.isArray(g.tags) || g.tags.length > 3) out.push('tags: up to 3');
  if (g.status === 'live') {
    let url = null;
    try {
      url = new URL(g.url);
    } catch {
      /* reported below */
    }
    if (url?.protocol !== 'https:') out.push('a live game needs an https url');
  }
  return out;
}

/**
 * The address to open a game at: its url with ?dari=arked (so it shows a back-to-Arked
 * button). On the dev server, a game on HOME_HOST is served from this origin instead.
 */
export function launchUrl(game, here = globalThis.location) {
  let url = new URL(game.url);
  if (url.hostname === HOME_HOST && here?.hostname && here.hostname !== HOME_HOST) {
    url = new URL(url.pathname + url.search, here.origin);
  }
  url.searchParams.set('dari', 'arked');
  return url.href;
}
