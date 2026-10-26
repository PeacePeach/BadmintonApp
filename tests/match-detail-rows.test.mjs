// Match Detail game table rows from saved games (project/rallywise-voice.js detailRows; Han 2026-10-26).
//   node --test tests/match-detail-rows.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const V = createRequire(import.meta.url)('../project/rallywise-voice.js');
const copy = g => JSON.parse(JSON.stringify(g));
const R = (n, r, a = null, b = null) => ({ n, r, a, b });
// Every result is counted exactly once: in a row or in unordered, never both, never dropped.
const counted = (d, k) => d.rows.filter(x => x.r === k).length + (d.unordered ? d.unordered[k === 'W' ? 'w' : 'l'] : 0);

test('known order, missing scores: one numbered row per game in the recorded W/L order, no score', () => {
  const games = [{ r: 'L' }, { r: 'W' }, { r: 'W' }], before = copy(games);
  assert.deepEqual(V.detailRows(games), { rows: [R(1, 'L'), R(2, 'W'), R(3, 'W')], unordered: null });
  assert.deepEqual(games, before, 'stored games are not changed');
});

test('Han 17:45: game 2 filled from the aggregate is shown as Game 2, not dropped or summarised', () => {
  // Heard "won 3, lost 1" with games 1, 3, 4 told: the one open game can only be the loss.
  const games = V.savedGames([{ w: 'us', l: null }, { w: null, l: null }, { w: 'us', l: 15 }, { w: 'us', l: null }], { w: 3, l: 1 }, 21);
  assert.deepEqual(games[1], { r: 'L', u: 1 });
  const d = V.detailRows(games);
  assert.deepEqual(d, { rows: [R(1, 'W'), R(2, 'L'), R(3, 'W', 21, 15), R(4, 'W')], unordered: null });
  assert.equal(counted(d, 'W'), 3); assert.equal(counted(d, 'L'), 1);
});

test('aggregate only, order unknown: numbered rows without invented results, counts kept apart', () => {
  const games = V.savedGames([{ w: null, l: null }, { w: null, l: null }, { w: null, l: null }], { w: 2, l: 1 }, 21), before = copy(games);
  const d = V.detailRows(games);
  assert.deepEqual(d, { rows: [R(1, null), R(2, null), R(3, null)], unordered: { w: 2, l: 1 } });
  assert.equal(counted(d, 'W'), 2); assert.equal(counted(d, 'L'), 1);
  assert.deepEqual(games, before, 'stored games are not changed');
});

test('aggregate where every game has the same result is certain: shown per game', () => {
  assert.deepEqual(V.detailRows([{ r: 'W', u: 1 }, { r: 'W', u: 1 }]), { rows: [R(1, 'W'), R(2, 'W')], unordered: null });
});

test('known games plus an uncertain aggregate remainder: known results kept, only the remainder is unordered', () => {
  const d = V.detailRows([{ r: 'W' }, { r: 'W', u: 1 }, { r: 'L', u: 1 }]);
  assert.deepEqual(d, { rows: [R(1, 'W'), R(2, null), R(3, null)], unordered: { w: 1, l: 1 } });
  assert.equal(counted(d, 'W'), 2); assert.equal(counted(d, 'L'), 1);
});

test('mixed complete and incomplete games: scores where recorded, null where not, saved order kept', () => {
  assert.deepEqual(V.detailRows([[21, 17], { r: 'L' }, [21, 19], { r: 'W' }]),
    { rows: [R(1, 'W', 21, 17), R(2, 'L'), R(3, 'W', 21, 19), R(4, 'W')], unordered: null });
});

test('fully scored match is unchanged', () => {
  assert.deepEqual(V.detailRows([[21, 17], [18, 21]]), { rows: [R(1, 'W', 21, 17), R(2, 'L', 18, 21)], unordered: null });
});
