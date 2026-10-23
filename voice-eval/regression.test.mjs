// Regression tests for issues Han found while testing the functional prototype (2026-10-18).
//   node --test voice-eval/regression.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { guard, validate, namedAreas } from '../supabase/functions/_shared/voice-parse-core.js';

const { mapResult, notesOnly } = createRequire(import.meta.url)('../project/voice-v2/map-result.js');

const base = over => ({
  language: 'en', match_type: null, multiple_lineups: false, game_count: null, order_known: false, totals: { wins: null, losses: null },
  players: [], games: [], observations: [], missing: [], ambiguities: [], ...over
});
const game = (number, result, my_score = null, their_score = null, interrupted = false) => ({ number, result, my_score, their_score, interrupted });
const obs = (text, area, category = 'lost_points') => ({ text, category, area, about: null });
const parse = (out, transcript) => { assert.deepEqual(validate(out), []); guard(out, transcript); return out; };
let n = 0;
const deps = { resolve: name => ({ key: name.toLowerCase(), heard: name, id: null, cands: [], unclear: false }), nid: p => `${p}${++n}` };

// ---- Notes classification ----
test('net mistakes in Chinese are Net, not Footwork', () => {
  const out = parse(base({ language: 'zh', observations: [obs('网前失误比较多', 'Footwork')] }), '今天网前失误比较多');
  assert.equal(out.observations[0].area, 'Net');
  assert.equal(mapResult(out, deps).notes[0].tag, 'Net');
});

test('net mistakes in English are Net', () => {
  const out = parse(base({ observations: [obs('Too many errors at the net', 'Footwork')] }), 'Too many errors at the net today');
  assert.equal(out.observations[0].area, 'Net');
});

test('a named area the model already chose is kept', () => {
  const out = parse(base({ language: 'zh', observations: [obs('网前步法慢', 'Footwork'), obs('杀球很有效', 'Smash', 'won_points')] }), '网前步法慢，杀球很有效');
  assert.deepEqual(out.observations.map(o => o.area), ['Footwork', 'Smash']);
});

test('return of serve is Return, not Serve', () => {
  assert.deepEqual(namedAreas('接发球太被动'), ['Return']);
  assert.deepEqual(namedAreas('发球下网两次'), ['Serve']);
});

test('opponent notes never get an area', () => {
  const out = parse(base({ language: 'zh', observations: [obs('对手网前很强', 'Net', 'opponent')] }), '对手网前很强');
  assert.equal(out.observations[0].area, null);
});

// ---- Notes-only input ----
test('notes-only: placeholder game and count are removed, and the flow skips to Notes', () => {
  const out = parse(base({ language: 'zh', game_count: 1, games: [game(1, null)], observations: [obs('网前失误比较多', 'Net')] }), '今天主要练了步法，网前失误比较多');
  assert.deepEqual(out.games, []);
  assert.equal(out.game_count, null);
  const d = mapResult(out, deps);
  assert.equal(d.games.length, 0);
  assert.equal(d.notes.length, 1);
  assert.equal(notesOnly(d), true);
});

test('notes-only in English with "no games" keeps an empty list', () => {
  const out = parse(base({ game_count: 1, observations: [obs('My clears were short', 'Placement')] }), "Didn't play any games, just drills. My clears were short.");
  assert.equal(out.game_count, null);
  assert.equal(notesOnly(mapResult(out, deps)), true);
});

test('Match Details is still shown when there is anything to review', () => {
  const withGame = mapResult(base({ game_count: 3, observations: [obs('Smash worked', 'Smash', 'won_points')] }), deps);
  const withPlayer = mapResult(base({ players: [{ name: 'Leo', role: 'opponent' }], observations: [obs('Smash worked', 'Smash', 'won_points')] }), deps);
  const empty = mapResult(base({}), deps);
  assert.equal(notesOnly(withGame), false);
  assert.equal(notesOnly(withPlayer), false);
  assert.equal(notesOnly(empty), false);
});

test('screen mapping never invents a game from an empty entry', () => {
  const d = mapResult(base({ games: [game(1, null)] }), deps);
  assert.equal(d.games.length, 0);
  assert.equal(d.type, null);
});

// ---- Aggregate results ----
test('aggregate results give totals with unset rows (shown as one summary)', () => {
  const out = parse(base({ match_type: 'singles', game_count: 5, totals: { wins: 3, losses: 2 } }), 'Played five games against Leo, won three.');
  const d = mapResult(out, deps);
  assert.equal(d.games.length, 5);
  assert.ok(d.games.every(g => g.r === null));
  assert.deepEqual(d.totals, { w: 3, l: 2 });
});

test('a stated game count without results still gives unset rows', () => {
  const out = parse(base({ game_count: 3 }), 'Played three games tonight, had fun.');
  assert.equal(mapResult(out, deps).games.length, 3);
});

// ---- One lineup per match ----
test('switching partners is flagged and players are not mixed into one record', () => {
  const out = parse(base({ match_type: 'doubles', game_count: 3, players: [{ name: 'Priya', role: 'partner' }, { name: 'Kai', role: 'partner' }, { name: 'Marcus', role: 'opponent' }] }),
    'Doubles against Marcus. First two games with Priya, then I switched partners and played the last game with Kai.');
  assert.equal(out.multiple_lineups, true);
  const d = mapResult(out, deps);
  assert.deepEqual(d.partners, []);
  assert.deepEqual(d.opponents, []);
  assert.deepEqual(d.lineup.names, ['Priya', 'Kai', 'Marcus']);
  assert.equal(notesOnly(d), false);
});

test('singles and doubles in one description: no match type, flagged', () => {
  const out = parse(base({ match_type: 'doubles', players: [{ name: 'Leo', role: 'opponent' }, { name: 'Priya', role: 'partner' }] }),
    'Played singles against Leo first, then doubles with Priya.');
  assert.equal(out.match_type, null);
  assert.equal(out.multiple_lineups, true);
});

test('换搭档 in Chinese is flagged', () => {
  const out = parse(base({ language: 'zh', match_type: 'doubles', players: [{ name: '小李', role: 'partner' }] }), '双打，先和小李一起，后来换了搭档。');
  assert.equal(out.multiple_lineups, true);
});

test('a single doubles lineup fills partner and opponents', () => {
  const out = parse(base({ match_type: 'doubles', players: [{ name: 'Kevin', role: 'partner' }, { name: 'Leo', role: 'opponent' }, { name: 'Sam', role: 'opponent' }] }),
    'Doubles with Kevin against Leo and Sam.');
  assert.equal(out.multiple_lineups, false);
  const d = mapResult(out, deps);
  assert.equal(d.partners.length, 1);
  assert.equal(d.opponents.length, 2);
  assert.equal(d.lineup, null);
});

// ---- Interrupted games ----
test('an interrupted game keeps its score but gets no result from it', () => {
  const t = 'Singles against Leo. Won the first 21-16, lost the second 19-21, and the third was interrupted at 15-12 when the hall closed.';
  const out = parse(base({ match_type: 'singles', game_count: 3, totals: { wins: 2, losses: 1 },
    games: [game(1, 'win', 21, 16), game(2, 'loss', 19, 21), game(3, 'win', 15, 12, true)] }), t);
  assert.deepEqual(out.games.map(g => g.result), ['win', 'loss', null]);
  assert.deepEqual([out.games[2].my_score, out.games[2].their_score], [15, 12]);
  assert.equal(out.order_known, false);
  const d = mapResult(out, deps);
  assert.equal(d.games[2].r, null);
  assert.equal(d.games[2].cut, true);
});

test('an interruption the model missed is caught from the text', () => {
  const t = '和阿杰打了三局单打，第一局21比18赢了，第二局17比21输了，第三局我18比14领先的时候他受伤了，没打完。';
  const out = parse(base({ language: 'zh', match_type: 'singles', game_count: 3,
    games: [game(1, 'win', 21, 18), game(2, 'loss', 17, 21), game(3, null, 18, 14)] }), t);
  assert.deepEqual(out.games.map(g => g.result), ['win', 'loss', null]);
  assert.equal(out.games[2].interrupted, true);
});

test('finished games are not marked interrupted when court time runs out', () => {
  const t = 'Singles against Leo. I won the first game 21-17, lost the second 18-21, and then court time ran out, so it ended one game each.';
  const out = parse(base({ match_type: 'singles', game_count: 2, games: [game(1, 'win', 21, 17), game(2, 'loss', 18, 21)] }), t);
  assert.deepEqual(out.games.map(g => [g.result, g.interrupted]), [['win', false], ['loss', false]]);
});

test('an explicit retirement still decides an interrupted game', () => {
  const t = 'Third game was stopped at 15-12 because Leo retired injured, so I won it.';
  const out = parse(base({ game_count: 1, games: [game(1, 'win', 15, 12, true)] }), t);
  assert.equal(out.games[0].result, 'win');
});

// ---- Conversational scores and corrections ----
test('an English correction replaces the earlier score', () => {
  const out = parse(base({ game_count: 2, games: [game(1, 'loss', 18, 21), game(2, 'win', 21, 12)] }),
    'Lost the first game 18-21, no wait, it was 19-21. Then won the second 21-12 against Priya.');
  assert.deepEqual([out.games[0].my_score, out.games[0].their_score], [19, 21]);
});

test('a Chinese correction replaces the earlier score', () => {
  const out = parse(base({ language: 'zh', game_count: 2, games: [game(1, 'win', 21, 17), game(2, 'loss', 15, 21)] }),
    '第一局21比17赢了，说错了，是21比19。第二局15比21输了。');
  assert.deepEqual([out.games[0].my_score, out.games[0].their_score], [21, 19]);
  assert.equal(out.games[0].result, 'win');
});

test('a corrected score the model already used is left alone', () => {
  const out = parse(base({ game_count: 1, games: [game(1, 'loss', 19, 21)] }), 'Lost 18-21, sorry, I mean 19-21.');
  assert.deepEqual([out.games[0].my_score, out.games[0].their_score], [19, 21]);
});

test('speech-joined scores like "2115" are kept', () => {
  const out = parse(base({ game_count: 2, games: [game(1, 'win', 21, 15), game(2, 'loss', 19, 21)] }),
    'Beat Jordan 2115 in the first game of singles, then lost the second one 1921.');
  assert.deepEqual(out.games.map(g => [g.my_score, g.their_score]), [[21, 15], [19, 21]]);
});

test('winner-first score in a lost game is turned to the speaker side', () => {
  const out = parse(base({ game_count: 1, games: [game(1, 'loss', 21, 15)] }), 'Lost the first one 21-15.');
  assert.deepEqual([out.games[0].my_score, out.games[0].their_score], [15, 21]);
});

test('"won 2-1" is a game tally, not a game score', () => {
  const out = parse(base({ match_type: 'singles', game_count: 1, games: [game(1, 'win', 2, 1)] }), 'Beat Leo 2-1 in singles today.');
  assert.deepEqual(out.games, []);
  assert.deepEqual(out.totals, { wins: 2, losses: 1 });
  assert.equal(out.game_count, 3);
});

// ---- The guard must not change correct answers ----
test('guard leaves every correct eval answer unchanged', () => {
  const cases = JSON.parse(fs.readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
  const pick = v => (v && typeof v === 'object' && v.any) ? v.any[0] : v;
  for (const c of cases) {
    const e = c.expect;
    if (!('games' in e) || !('totals' in e) || !('game_count' in e)) continue;
    const ideal = base({ language: c.lang, match_type: pick(e.match_type ?? null), multiple_lineups: !!e.multiple_lineups, game_count: e.game_count, order_known: !!e.order_known, totals: e.totals,
      players: (e.players || []).map(p => ({ name: p.name, role: pick(p.role) })),
      games: e.games.map(g => game(g.number, g.result, g.my_score, g.their_score, !!g.interrupted)) });
    const out = parse(structuredClone(ideal), c.transcript);
    assert.deepEqual(out, ideal, c.id);
  }
});
