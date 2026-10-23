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

test('totals without game order or scores: a valid aggregate, no game outcome invented (Han, 2026-10-23)', () => {
  const r = V.mockParse('x', 'en'); Object.assign(r, { match_type: 'singles', game_count: 5, totals: { wins: 3, losses: 2 } });
  const d = V.toDraft(r, players, 21);
  assert.equal(d.flags.result, null); assert.equal(d.games.length, 5);
  assert.ok(d.games.every(g => g.w === null && g.l === null)); assert.deepEqual(d.totals, { w: 3, l: 2 });
  assert.deepEqual(V.tally(d.games, d.totals), { w: 3, l: 2, open: 0, ok: true, state: 'ok' });
  // Saved: every result counts, none is placed on a game number.
  const saved = V.savedGames(d.games, d.totals, 21);
  assert.deepEqual(saved.map(g => g.r).sort(), ['L', 'L', 'W', 'W', 'W']); assert.ok(saved.every(g => g.u === 1));
  assert.deepEqual(V.fromSaved(saved), { games: d.games, totals: d.totals });
});

test('result: games heard without scores keep their result and no score', () => {
  const r = V.mockParse('x', 'en'); Object.assign(r, { match_type: 'singles', game_count: 2, totals: { wins: 1, losses: 1 },
    games: [{ number: 1, result: 'win', my_score: null, their_score: null, interrupted: false }, { number: 2, result: 'loss', my_score: 19, their_score: 21, interrupted: false }] });
  const d = V.toDraft(r, players, 21);
  assert.deepEqual(d.games, [{ w: 'us', l: null }, { w: 'them', l: 19 }]);
  assert.equal(d.flags.result, null);
  assert.deepEqual(V.tally(d.games, d.totals), { w: 1, l: 1, open: 0, ok: true, state: 'ok' }); // a tie is valid
  assert.deepEqual(V.savedGames(d.games, d.totals, 21), [{ r: 'W' }, [19, 21]]);
});

test('result: a game whose result was not said stays open and blocks until set', () => {
  const r = V.mockParse('x', 'en'); Object.assign(r, { match_type: 'singles', game_count: 3,
    games: [{ number: 1, result: 'win', my_score: 21, their_score: 15, interrupted: false }, { number: 2, result: 'loss', my_score: null, their_score: null, interrupted: false }] });
  const d = V.toDraft(r, players, 21);
  assert.deepEqual(d.games, [{ w: 'us', l: 15 }, { w: 'them', l: null }, { w: null, l: null }]);
  assert.equal(d.totals, null);
  assert.deepEqual(V.tally(d.games, d.totals), { w: 1, l: 1, open: 1, ok: false, state: 'incomplete' });
});

test('result: totals that contradict the games are flagged and do not count; games kept as heard', () => {
  const r = V.mockParse('x', 'en'); Object.assign(r, { match_type: 'singles', game_count: 2, totals: { wins: 2, losses: 0 },
    games: [{ number: 1, result: 'win', my_score: 21, their_score: 15, interrupted: false }, { number: 2, result: 'loss', my_score: 18, their_score: 21, interrupted: false }] });
  const d = V.toDraft(r, players, 21);
  assert.equal(d.flags.result, 'conflict'); assert.equal(V.fits(d.games, d.totals), false);
  assert.deepEqual(d.games, [{ w: 'us', l: 15 }, { w: 'them', l: 18 }]);
  assert.deepEqual(V.tally(d.games, d.totals), { w: 1, l: 1, open: 0, ok: true, state: 'ok' });
});

test('result: an aggregate counts only while it fits, and never fills a game in', () => {
  const open = n => Array.from({ length: n }, () => ({ w: null, l: null }));
  const t = { w: 3, l: 2 }, W = { w: 'us', l: null }, L = { w: 'them', l: null };
  assert.equal(V.fits([W].concat(open(4)), t), true);
  assert.deepEqual(V.tally([W, W, W].concat(open(2)), t), { w: 3, l: 2, open: 0, ok: true, state: 'ok' });
  assert.equal(V.fits([L, L, L].concat(open(2)), t), false);
  assert.deepEqual(V.tally([L, L, L].concat(open(2)), t), { w: 0, l: 3, open: 2, ok: false, state: 'incomplete' });
  assert.equal(V.fits(open(6), t), false); // a game added: 3 + 2 no longer covers 6 games
  assert.equal(V.fits(open(5), t), true);  // ...and counts again once it is removed
  assert.deepEqual(V.savedGames([W, W, W].concat(open(2)), t, 21), [{ r: 'W' }, { r: 'W' }, { r: 'W' }, { r: 'L', u: 1 }, { r: 'L', u: 1 }]);
});

test('result: an unstorable score is dropped and flagged, the result is kept', () => {
  const r = V.mockParse('x', 'en'); Object.assign(r, { match_type: 'singles', game_count: 1,
    games: [{ number: 1, result: 'win', my_score: 21, their_score: 20, interrupted: false }] });
  const d = V.toDraft(r, players, 21);
  assert.deepEqual(d.games, [{ w: 'us', l: null }]); assert.equal(d.flags.result, 'scores');
});

test('live cues', () => {
  assert.deepEqual(V.cues('今天和小王打了六局单打，赢了四局。杀球不错', []), { players: true, games: true, results: true, notes: true });
  assert.deepEqual(V.cues('', []), { players: false, games: false, results: false, notes: false });
});

test('doubles saved before the partner is chosen: every heard name kept, nobody placed on a side', () => {
  const d = draft('partner', 'en');
  const pl = V.savedPlayers(d.type, d.slots, d.pool, () => null);
  assert.deepEqual(pl, { partner: null, opps: ['unknown:?Leo', 'unknown:?Mei', 'unknown:?Ravi'] });
  const m = { type: 'Doubles', ...pl };
  assert.deepEqual(V.sidesOf(m), { partner: null, opps: [], others: pl.opps });
  assert.ok(pl.opps.every(V.isUnknown)); assert.equal(V.heardOf('unknown:?Leo'), 'Leo');
  // A named opponent keeps their side; only the unclear people stay unplaced.
  const l = V.lineup('Doubles', [{ ...V.resolve('Leo', players), role: 'unknown' }, { ...V.resolve('Mei', players), role: 'unknown' }, { ...V.resolve('Alex', players), role: 'opponent' }]);
  assert.deepEqual(V.savedPlayers('Doubles', l.slots, l.pool, k => l.slots[k].id), { partner: null, opps: ['alex', 'unknown:?Leo', 'unknown:?Mei'] });
  // Once the partner is chosen, the regular placement applies.
  const s = V.choosePartner(d.slots, d.pool, 1);
  assert.deepEqual(V.savedPlayers('Doubles', s, [], k => s[k].id), { partner: 'mei', opps: ['leo', 'ravi'] });
});
