// Matches homepage / Performance / Players stats from saved matches (project/rallywise-voice.js matchRecord; Han 2026-10-26).
//   node --test tests/match-stats.test.mjs
// Total Matches counts every saved match; Win Rate is over decided matches only, and its denominator is shown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { matches, decided, undecided } from './fixtures/match-count-22.mjs';

const V = createRequire(import.meta.url)('../project/rallywise-voice.js');

test('fixture: 22 saved matches, 16 with a confirmed outcome', () => {
  assert.equal(matches.length, 22); assert.equal(decided.length, 16); assert.equal(undecided.length, 6);
  assert.equal(new Set(matches.map(m => m.id)).size, 22, 'no duplicate ids');
});

test('Total Matches = all 22 saved matches; Win Rate = 8 of 16 decided; 6 undecided shown apart', () => {
  assert.deepEqual(V.matchRecord(matches), { total: 22, w: 8, l: 8, decided: 16, open: 6, pct: 0.5 });
});

test('a match without scores, players or any result is never dropped from the total', () => {
  for (const m of undecided) assert.deepEqual(V.matchRecord([m]), { total: 1, w: 0, l: 0, decided: 0, open: 1, pct: null }, m.id);
  // Missing scores or players do not stop a confirmed outcome from counting.
  assert.equal(V.matchOutcome(matches.find(m => m.id === 'm4')), 'W');
  assert.equal(V.matchOutcome(matches.find(m => m.id === 'm7')), 'L');
  assert.equal(V.matchOutcome(matches.find(m => m.id === 'm10')), 'W');
});

test('a match with no game result saved is not a loss (it used to be counted as one)', () => {
  assert.equal(V.matchOutcome({ games: [] }), null);
  assert.equal(V.matchOutcome({}), null);
  assert.equal(V.matchOutcome({ games: [{ r: 'W' }, { r: 'L' }] }), null);
});

test('Singles / Doubles filters add up to the whole', () => {
  const s = V.matchRecord(matches.filter(m => m.type === 'Singles')), d = V.matchRecord(matches.filter(m => m.type === 'Doubles'));
  assert.equal(s.total + d.total, 22); assert.equal(s.decided + d.decided, 16); assert.equal(s.open + d.open, 6);
  assert.equal(s.w + d.w, 8); assert.equal(s.l + d.l, 8);
  assert.deepEqual(s, { total: 15, w: 5, l: 6, decided: 11, open: 4, pct: 5 / 11 });
  assert.deepEqual(d, { total: 7, w: 3, l: 2, decided: 5, open: 2, pct: 0.6 });
});

test('a deleted match leaves both counts; every outcome is counted once', () => {
  const left = matches.filter(m => m.id !== 'm18' && m.id !== 'm0');
  assert.deepEqual(V.matchRecord(left), { total: 20, w: 7, l: 8, decided: 15, open: 5, pct: 7 / 15 });
  const r = V.matchRecord(matches); assert.equal(r.w + r.l + r.open, r.total);
});

test('no matches: nothing to rate', () => {
  assert.deepEqual(V.matchRecord([]), { total: 0, w: 0, l: 0, decided: 0, open: 0, pct: null });
});
