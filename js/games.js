// The game catalogue. Adding a game, wherever it's hosted, is one entry here (see README.md).
//
//   id      lowercase slug; also its arked.game.<id> key and its id in supabase/arked.sql
//   name    shown on the card
//   desc    one short sentence
//   url     the game's https address, on any host listed in AppsWarga's allowed hosts
//   icon    square image in this repo (icons/), shown at 48 px
//   category  one of CATEGORIES: the section it is listed under, and its filter chip
//   tags    up to 3 short labels shown on its row and matched by the search ('Harian': it has a
//           Cabaran Harian, and is listed under that chip)
//   status  'live' (playable) or 'soon' (listed under Akan Datang, not playable)

/** The sections of the list, in order, and the filter chips. */
export const CATEGORIES = [
  { id: 'minda', name: 'Asah Minda' }, // brain training: memory, mental arithmetic
  { id: 'arked', name: 'Arked' }, // quick reflexes, classic arcade
  { id: 'kata', name: 'Kata' }, // word games
  { id: 'tradisional', name: 'Tradisional' }, // Malaysian traditional and school-era games
  { id: 'teka-teki', name: 'Teka-teki' }, // puzzles: numbers, blocks, matching
  { id: 'sukan', name: 'Sukan' }, // sports
];

export const GAMES = [
  {
    id: 'teka-kata',
    name: 'Teka Kata',
    desc: 'Pecahkan kod nombor dan temui frasa tentang UiTM dan Malaysia.',
    url: 'https://nullifye.github.io/warga-games/teka-kata/',
    icon: 'icons/teka-kata.svg',
    category: 'kata',
    tags: ['Harian', 'Kriptogram'],
    status: 'live',
  },
  {
    id: 'ular',
    name: 'Ular',
    desc: 'Makan, membesar, dan jangan langgar diri sendiri.',
    url: 'https://nullifye.github.io/warga-games/ular/',
    icon: 'icons/ular.svg',
    category: 'arked',
    tags: ['Refleks', 'Klasik'],
    status: 'live',
  },
  {
    id: 'duga-kata',
    name: 'Duga Kata',
    desc: 'Teka perkataan lima huruf dalam enam cubaan.',
    url: 'https://nullifye.github.io/warga-games/duga-kata/',
    icon: 'icons/duga-kata.svg',
    category: 'kata',
    tags: ['Harian', 'Logik'],
    status: 'live',
  },
  {
    id: 'kejar-lapan',
    name: 'Kejar Lapan',
    desc: 'Pecut ke destinasi sebelum pukul 8:00.',
    url: 'https://nullifye.github.io/warga-games/kejar-lapan/',
    icon: 'icons/kejar-lapan.svg',
    category: 'arked',
    tags: ['Harian', 'Refleks', '3D'],
    status: 'live',
  },
  {
    id: '2048',
    name: '2048',
    desc: 'Gabungkan nombor hingga mencapai 2048.',
    url: 'https://nullifye.github.io/warga-games/2048/',
    icon: 'icons/2048.svg',
    category: 'teka-teki',
    tags: ['Nombor', 'Santai'],
    status: 'live',
  },
  {
    id: 'blok',
    name: 'Susun Blok',
    desc: 'Susun kepingan dan lengkapkan baris atau lajur.',
    url: 'https://nullifye.github.io/warga-games/blok/',
    icon: 'icons/blok.svg',
    category: 'teka-teki',
    tags: ['Santai', 'Strategi'],
    status: 'live',
  },
  {
    id: 'memori',
    name: 'Memori',
    desc: 'Cari pasangan kad sebelum masa tamat.',
    url: 'https://nullifye.github.io/warga-games/memori/',
    icon: 'icons/memori.svg',
    category: 'minda',
    tags: ['Ingatan', 'Bermasa'],
    status: 'live',
  },
  {
    id: 'congkak',
    name: 'Congkak',
    desc: 'Agih guli dan penuhkan rumah anda sebelum lawan.',
    url: 'https://nullifye.github.io/warga-games/congkak/',
    icon: 'icons/congkak.svg',
    category: 'tradisional',
    tags: ['Lawan AI', 'Strategi', '3D'],
    status: 'live',
  },
  {
    id: '9balls',
    name: '9-Ball',
    desc: 'Pukul bola mengikut urutan dan masukkan bola 9 untuk menang.',
    url: 'https://nullifye.github.io/warga-games/9balls/',
    icon: 'icons/9balls.svg',
    category: 'sukan',
    tags: ['Lawan AI', '2 Pemain', 'Fizik'],
    status: 'live',
  },
  {
    id: 'pemadam',
    name: 'Pemadam',
    desc: 'Jentik pemadam anda supaya mendarat di atas pemadam lawan.',
    url: 'https://nullifye.github.io/warga-games/pemadam/',
    icon: 'icons/pemadam.svg',
    category: 'tradisional',
    tags: ['Lawan AI', 'Fizik', '3D'],
    status: 'live',
  },
  {
    id: 'congak',
    name: 'Congak Matematik',
    desc: 'Kira di kepala dan jawab secepat mungkin di papan hitam.',
    url: 'https://nullifye.github.io/warga-games/congak/',
    icon: 'icons/congak.svg',
    category: 'minda',
    tags: ['Harian', 'Matematik', 'Bermasa'],
    status: 'live',
  },
  {
    id: 'letup-letup',
    name: 'Letup-Letup',
    desc: 'Sejajarkan tiga burung sama warna sebelum kelas penuh.',
    url: 'https://nullifye.github.io/warga-games/letup-letup/',
    icon: 'icons/letup-letup.svg',
    category: 'teka-teki',
    tags: ['Harian', 'Padan 3', 'Refleks'],
    status: 'live',
  },
  {
    id: 'silang-kata',
    name: 'Silang Kata',
    desc: 'Isi petak silang kata dengan istilah kampus dan budaya.',
    url: null,
    icon: 'icons/silang-kata.svg',
    category: 'kata',
    tags: [],
    status: 'soon',
  },
  {
    id: 'susun-nombor',
    name: 'Susun Nombor',
    desc: 'Teka-teki logik nombor yang mengasah minda.',
    url: null,
    icon: 'icons/susun-nombor.svg',
    category: 'teka-teki',
    tags: ['Nombor', 'Logik'],
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
  if (!CATEGORIES.some((c) => c.id === g.category)) out.push(`category must be one of ${CATEGORIES.map((c) => c.id).join(', ')}`);
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
