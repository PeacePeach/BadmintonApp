// Voice Log Match, Phase 1: the mock parse -> Log Match draft mapping (project/rallywise-voice.js).
//   node --test tests/rallywise-voice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const V = createRequire(import.meta.url)('../project/rallywise-voice.js');
const players = [{ id: 'me', name: 'Sam Rivera' }, { id: 'alex', name: 'Alex Chen' }, { id: 'priya', name: 'Priya Nair' }, { id: 'ab', name: 'Alex Brown' }];
const draft = (scenario, lang, ps = players) => V.toDraft(V.mockParse(V.sample(scenario, lang).text, lang, scenario), ps, 21);

test('complete sample: singles vs Alex, three scored games, notes by side', () => {
  for (const lang of ['en', 'zh']) {
    const d = draft('complete', lang, players.filter(p => p.id !== 'ab'));
    assert.equal(d.type, 'Singles'); assert.equal(d.opp1, 'alex');
    assert.deepEqual(d.games, [{ w: 'them', l: 18 }, { w: 'us', l: 17 }, { w: 'them', l: 15 }]);
    assert.deepEqual([d.wt, d.lt], [['Smash'], ['Net']]);
    assert.deepEqual(d.flags, { players: null, result: null, notes: null });
  }
});

test('two players share a first name: players are flagged, nothing is picked', () => {
  const d = draft('complete', 'en');
  assert.equal(d.opp1, null); assert.equal(d.flags.players, 'check'); assert.deepEqual(d.heard[0].cands, ['alex', 'ab']);
});

test('missing sample: partner linked, new opponent kept as heard, empty slot flagged', () => {
  const d = draft('missing', 'en');
  assert.equal(d.type, 'Doubles'); assert.equal(d.partner, 'priya'); assert.equal(d.opp1, null);
  assert.equal(d.heard[0].heard, 'Chris'); assert.equal(d.flags.players, 'missing');
});

test('text the mock cannot read: no invented match data, words kept as a note to check', () => {
  const d = V.toDraft(V.mockParse('Good session today', 'en', 'complete'), players, 21);
  assert.equal(d.type, null); assert.equal(d.flags.result, 'missing'); assert.equal(d.flags.players, 'missing');
  assert.equal(d.flags.notes, 'check'); assert.equal(d.lost, 'Good session today.');
});

test('totals without game order or scores never become invented games', () => {
  const r = V.mockParse('x', 'en'); Object.assign(r, { match_type: 'singles', game_count: 6, totals: { wins: 4, losses: 2 } });
  const d = V.toDraft(r, players, 21);
  assert.equal(d.flags.result, 'missing'); assert.equal(d.games.length, 1);
});

test('live cues', () => {
  assert.deepEqual(V.cues('今天和小王打了六局单打，赢了四局。杀球不错', []), { players: true, games: true, results: true, notes: true });
  assert.deepEqual(V.cues('', []), { players: false, games: false, results: false, notes: false });
});
