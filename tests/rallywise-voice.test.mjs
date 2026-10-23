// Voice Log Match: parse result -> Log Match draft, player resolution and match type (project/rallywise-voice.js).
//   node --test tests/rallywise-voice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const V = createRequire(import.meta.url)('../project/rallywise-voice.js');
const players = [{ id: 'me', name: 'Sam Rivera' }, { id: 'alex', name: 'Alex Chen' }, { id: 'priya', name: 'Priya Nair' }, { id: 'marcus', name: 'Marcus Lee' },
  { id: 'jordan', name: 'Jordan Kim' }, { id: 'leo', name: 'Leo Park' }, { id: 'mei', name: 'Mei Tan' }, { id: 'ravi', name: 'Ravi Shah' },
  { id: 'chris', name: 'Chris Wong' }, { id: 'chrisl', name: 'Chris Lam' }];
const draft = (scenario, lang, ps = players) => V.toDraft(V.mockParse(V.sample(scenario, lang).text, lang, scenario), ps, 21);
const states = d => Object.fromEntries(Object.entries(d.slots).map(([k, s]) => [k, s.state]));

test('one known opponent: singles, confirmed, three scored games, notes by side', () => {
  for (const lang of ['en', 'zh']) {
    const d = draft('complete', lang);
    assert.equal(d.type, 'Singles'); assert.equal(d.opp1, 'alex'); assert.deepEqual(states(d), { opp1: 'confirmed' });
    assert.deepEqual(d.games, [{ w: 'them', l: 18 }, { w: 'us', l: 17 }, { w: 'them', l: 15 }]);
    assert.deepEqual([d.wt, d.lt], [['Smash'], ['Net']]);
    assert.deepEqual(d.flags, { players: null, result: null, notes: null });
  }
});

test('missing opponent: slot is missing, players flagged unknown, nothing invented', () => {
  for (const lang of ['en', 'zh']) {
    const d = draft('missing', lang);
    assert.equal(d.type, 'Singles'); assert.equal(d.opp1, null);
    assert.deepEqual(d.slots.opp1, { heard: '', id: null, cands: [], state: 'missing' });
    assert.equal(d.flags.players, 'unknown'); assert.equal(d.flags.result, null);
  }
});

test('ambiguous name: candidates kept, heard name kept, no id picked', () => {
  const d = draft('ambiguous', 'en');
  assert.equal(d.opp1, null);
  assert.deepEqual(d.slots.opp1, { heard: 'Chris', id: null, cands: ['chris', 'chrisl'], state: 'ambiguous' });
  assert.equal(d.flags.players, 'unknown');
});

test('new name: state new, no player is created', () => {
  const d = draft('new', 'zh');
  assert.deepEqual(d.slots.opp1, { heard: 'David', id: null, cands: [], state: 'new' });
  assert.equal(players.some(p => /david/i.test(p.name)), false);
});

test('doubles with three unclear roles: ask for the partner, then the other two become opponents', () => {
  const d = draft('partner', 'en');
  assert.equal(d.type, 'Doubles'); assert.deepEqual(d.pool.map(p => p.heard), ['Leo', 'Mei', 'Ravi']);
  assert.deepEqual(states(d), { partner: 'missing', opp1: 'missing', opp2: 'missing' });
  const s = V.choosePartner(d.slots, d.pool, 1);
  assert.deepEqual([s.partner.id, s.opp1.id, s.opp2.id], ['mei', 'leo', 'ravi']);
});

test('several lineups: the result is flagged and never becomes a lineup', () => {
  const r = V.mockParse(V.sample('lineup', 'en').text, 'en');
  assert.equal(r.multiple_lineups, true);
  const d = V.toDraft(r, players, 21);
  assert.equal(d.partner, null); assert.equal(d.opp1, null);
});

test('match type: explicit wins, otherwise inferred, otherwise left open', () => {
  const r = (match_type, ps) => V.mockParse('', 'en') && { match_type, multiple_lineups: false, players: ps.map(([name, role]) => ({ name, role })) };
  assert.equal(V.inferType(r('singles', [['A', 'unknown'], ['B', 'unknown']])), 'Singles');
  assert.equal(V.inferType(r(null, [['A', 'opponent']])), 'Singles');
  assert.equal(V.inferType(r(null, [['A', 'partner']])), 'Doubles');
  assert.equal(V.inferType(r(null, [['A', 'unknown'], ['B', 'unknown']])), 'Doubles');
  assert.equal(V.inferType(r(null, [['A', 'unknown'], ['B', 'opponent'], ['C', 'opponent']])), 'Doubles');
  assert.equal(V.inferType(r(null, [['A', 'unknown']])), null);
  assert.equal(V.inferType(r(null, [])), null);
  const d = draft('type', 'en');
  assert.equal(d.type, null); assert.equal(d.flags.players, 'type'); assert.equal(d.people[0].heard, 'Marcus');
});

test('doubles: one unclear person with two named opponents is the partner', () => {
  const l = V.lineup('Doubles', [{ ...V.resolve('Leo', players), role: 'unknown' }, { ...V.resolve('Alex', players), role: 'opponent' }, { ...V.resolve('Ravi', players), role: 'opponent' }]);
  assert.deepEqual([l.slots.partner.id, l.slots.opp1.id, l.slots.opp2.id], ['leo', 'alex', 'ravi']); assert.deepEqual(l.pool, []);
});

test('unknown placeholder ids keep the heard name', () => {
  assert.equal(V.unknownId('Chris'), 'unknown:Chris'); assert.equal(V.isUnknown('unknown:'), true);
  assert.equal(V.heardOf('unknown:Chris'), 'Chris'); assert.equal(V.isUnknown('alex'), false);
});

test('text the mock cannot read: no invented match data, words kept as a note to check', () => {
  const d = V.toDraft(V.mockParse('Good session today', 'en', 'complete'), players, 21);
  assert.equal(d.type, null); assert.equal(d.flags.result, 'missing'); assert.equal(d.flags.players, 'type');
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
