import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPlayTime, formatPoints, timeAgo } from '../js/format.js';

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

test('formatPoints groups thousands', () => {
  assert.match(formatPoints(2830), /^2[.,]830$/);
});
