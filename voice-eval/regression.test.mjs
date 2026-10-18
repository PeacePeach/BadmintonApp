// Regression tests for bugs Han found while testing the functional prototype (2026-10-18).
//   node --test voice-eval/regression.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { guard, validate, namedAreas } from '../supabase/functions/_shared/voice-parse-core.js';

const { mapResult } = createRequire(import.meta.url)('../project/voice-v2/map-result.js');

const base = over => ({
  language: 'zh', match_type: null, game_count: null, order_known: false, totals: { wins: null, losses: null },
  players: [], games: [], observations: [], missing: [], ambiguities: [], ...over
});
const obs = (text, area, category = 'lost_points') => ({ text, category, area, about: null });
let n = 0;
const deps = { resolve: name => ({ key: name.toLowerCase(), heard: name }), nid: p => `${p}${++n}` };

// 1. "网前失误比较多" came back as Footwork.
test('net mistakes in Chinese are Net, not Footwork', () => {
  const out = base({ observations: [obs('网前失误比较多', 'Footwork')] });
  assert.equal(validate(out).length, 0);
  guard(out, '今天网前失误比较多');
  assert.equal(out.observations[0].area, 'Net');
  assert.equal(mapResult(out, deps).notes[0].tag, 'Net');
});

test('net mistakes in English are Net', () => {
  const out = base({ language: 'en', observations: [obs('Too many errors at the net', 'Footwork')] });
  guard(out, 'Too many errors at the net today');
  assert.equal(out.observations[0].area, 'Net');
});

test('a named area the model already chose is kept', () => {
  const out = base({ observations: [obs('网前步法慢', 'Footwork'), obs('杀球很有效', 'Smash', 'won_points')] });
  guard(out, '网前步法慢，杀球很有效');
  assert.deepEqual(out.observations.map(o => o.area), ['Footwork', 'Smash']);
});

test('return of serve is Return, not Serve', () => {
  assert.deepEqual(namedAreas('接发球太被动'), ['Return']);
  assert.deepEqual(namedAreas('发球下网两次'), ['Serve']);
});

test('opponent notes never get an area', () => {
  const out = base({ observations: [obs('对手网前很强', 'Net', 'opponent')] });
  guard(out, '对手网前很强');
  assert.equal(out.observations[0].area, null);
});

// 2. Notes-only sessions showed an empty "Game 1 — Not set".
test('notes-only: placeholder game and count are removed by the guard', () => {
  const t = '今天主要练了步法，网前失误比较多';
  const out = base({ game_count: 1, games: [{ number: 1, result: null, my_score: null, their_score: null, partners: [] }], observations: [obs('网前失误比较多', 'Net')] });
  guard(out, t);
  assert.deepEqual(out.games, []);
  assert.equal(out.game_count, null);
  const d = mapResult(out, deps);
  assert.equal(d.games.length, 0);
  assert.equal(d.notes.length, 1);
});

test('notes-only in English with "no games" keeps an empty list', () => {
  const out = base({ language: 'en', game_count: 1, observations: [obs('My clears were short', 'Placement')] });
  guard(out, "Didn't play any games, just drills. My clears were short.");
  assert.equal(out.game_count, null);
  assert.equal(mapResult(out, deps).games.length, 0);
});

test('screen mapping alone never invents a game from an empty entry', () => {
  const r = base({ games: [{ number: 1, result: null, my_score: null, their_score: null, partners: [] }] });
  const d = mapResult(r, deps);
  assert.equal(d.games.length, 0);
  assert.equal(d.type, null);
  assert.deepEqual(d.partners, []);
  assert.deepEqual(d.opponents, []);
});

test('a stated game count without results still gives unset rows', () => {
  const out = base({ language: 'en', game_count: 3 });
  guard(out, 'Played three games tonight, had fun.');
  assert.equal(out.game_count, 3);
  const d = mapResult(out, deps);
  assert.equal(d.games.length, 3);
  assert.ok(d.games.every(g => g.r === null));
});

test('aggregate results still give rows plus totals', () => {
  const out = base({ language: 'en', match_type: 'singles', game_count: 4, totals: { wins: 1, losses: 3 } });
  guard(out, 'Played four games, lost three.');
  const d = mapResult(out, deps);
  assert.equal(d.games.length, 4);
  assert.deepEqual(d.totals, { w: 1, l: 3 });
});
