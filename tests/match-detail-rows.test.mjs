// Match Detail game table rows from saved games (project/rallywise-voice.js detailRows; Han 2026-10-26).
//   node --test tests/match-detail-rows.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const V = createRequire(import.meta.url)('../project/rallywise-voice.js');
const freeze = g => JSON.parse(JSON.stringify(g));

test('known order, missing scores: one numbered row per game in the recorded W/L order, no score', () => {
  const games = [{ r: 'W' }, { r: 'L' }, { r: 'W' }], before = freeze(games);
  assert.deepEqual(V.detailRows(games), { rows: [{ n: 1, r: 'W', a: null, b: null }, { n: 2, r: 'L', a: null, b: null }, { n: 3, r: 'W', a: null, b: null }], unordered: null });
  assert.deepEqual(games, before, 'stored games are not changed');
});

test('a loss first keeps the loss first (order is never re-sorted)', () => {
  assert.deepEqual(V.detailRows([{ r: 'L' }, { r: 'W' }, { r: 'W' }]).rows.map(x => x.r), ['L', 'W', 'W']);
});

test('aggregate only, order unknown: no numbered rows, only counts, nothing invented', () => {
  const games = V.savedGames([{ w: null, l: null }, { w: null, l: null }, { w: null, l: null }], { w: 2, l: 1 }, 21), before = freeze(games);
  const d = V.detailRows(games);
  assert.deepEqual(d, { rows: [], unordered: { w: 2, l: 1 } });
  assert.deepEqual(games, before, 'stored games are not changed');
});

test('aggregate with only wins or only losses', () => {
  assert.deepEqual(V.detailRows([{ r: 'W', u: 1 }, { r: 'W', u: 1 }]).unordered, { w: 2, l: 0 });
  assert.deepEqual(V.detailRows([{ r: 'L', u: 1 }]).unordered, { w: 0, l: 1 });
});

test('mixed complete and incomplete games: scores where recorded, null where not, real positions kept', () => {
  const d = V.detailRows([[21, 17], { r: 'L' }, [21, 19], { r: 'W' }]);
  assert.deepEqual(d.rows, [{ n: 1, r: 'W', a: 21, b: 17 }, { n: 2, r: 'L', a: null, b: null }, { n: 3, r: 'W', a: 21, b: 19 }, { n: 4, r: 'W', a: null, b: null }]);
  assert.equal(d.unordered, null);
});

test('known-order games plus an aggregate remainder: known games numbered at their position, the rest counted', () => {
  const d = V.detailRows([{ r: 'W' }, { r: 'W', u: 1 }, { r: 'L', u: 1 }]);
  assert.deepEqual(d, { rows: [{ n: 1, r: 'W', a: null, b: null }], unordered: { w: 1, l: 1 } });
});

test('fully scored match is unchanged', () => {
  assert.deepEqual(V.detailRows([[21, 17], [18, 21]]), { rows: [{ n: 1, r: 'W', a: 21, b: 17 }, { n: 2, r: 'L', a: 18, b: 21 }], unordered: null });
});
