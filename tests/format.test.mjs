import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyLine, formatPlayTime, timeAgo, todayKL } from '../js/format.js';

test('todayKL rolls over at midnight Malaysia time', () => {
  assert.equal(todayKL(new Date('2026-11-17T15:59:00Z')), '2026-11-17');
  assert.equal(todayKL(new Date('2026-11-17T16:00:00Z')), '2026-11-18');
});

test('timeAgo', () => {
  const now = Date.UTC(2026, 10, 17, 12);
  assert.equal(timeAgo(now - 20_000, now), 'baru sahaja');
  assert.equal(timeAgo(now - 5 * 60_000, now), '5 minit lalu');
  assert.equal(timeAgo(now - 3 * 3_600_000, now), '3 jam lalu');
  assert.equal(timeAgo(now - 30 * 3_600_000, now), 'semalam');
  assert.equal(timeAgo(now - 4 * 86_400_000, now), '4 hari lalu');
});

test('formatPlayTime', () => {
  assert.equal(formatPlayTime(45), '45s');
  assert.equal(formatPlayTime(12 * 60 + 5), '12m');
  assert.equal(formatPlayTime(3 * 3600 + 5 * 60), '3j 05m');
});

test('dailyLine', () => {
  const g = { daily: true };
  const today = '2026-11-17';
  assert.equal(dailyLine({}, null, today), '');
  assert.equal(dailyLine(g, null, today), 'Cabaran Harian baharu menanti');
  assert.equal(dailyLine(g, { daily: { date: '2026-11-16', status: 'done', won: true, score: 9 } }, today), 'Cabaran Harian baharu menanti');
  assert.equal(dailyLine(g, { daily: { date: today, status: 'playing' } }, today), 'Cabaran Harian sedang berjalan');
  assert.match(dailyLine(g, { daily: { date: today, status: 'done', won: true, score: 1250 } }, today), /^Cabaran Harian selesai · 1.250 mata$/);
  assert.equal(dailyLine(g, { daily: { date: today, status: 'done', won: false } }, today), 'Cabaran Harian: cuba lagi esok');
});
