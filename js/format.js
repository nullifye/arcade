// Small formatting helpers for the hub (no DOM, so they're unit-tested).

/** Today's date in Malaysia as YYYY-MM-DD (the games' daily challenges roll over at midnight MYT). */
export function todayKL(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** "baru sahaja", "5 minit lalu", "3 jam lalu", "semalam", "4 hari lalu". */
export function timeAgo(ms, now = Date.now()) {
  const min = Math.floor((now - ms) / 60000);
  if (min < 1) return 'baru sahaja';
  if (min < 60) return `${min} minit lalu`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'semalam' : `${days} hari lalu`;
}

/** Play time, e.g. "45s", "12m", "3j 05m". */
export function formatPlayTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}j ${String(m % 60).padStart(2, '0')}m`;
}

export const formatPoints = (n) => new Intl.NumberFormat('ms-MY').format(n);

/** One line about today's daily challenge, from a game's arked.game.<id> record. */
export function dailyLine(game, record, today) {
  if (!game.daily) return '';
  const d = record?.daily;
  if (d?.date !== today) return 'Cabaran Harian baharu menanti';
  if (d.status === 'playing') return 'Cabaran Harian sedang berjalan';
  return d.won ? `Cabaran Harian selesai · ${formatPoints(d.score ?? 0)} mata` : 'Cabaran Harian: cuba lagi esok';
}

