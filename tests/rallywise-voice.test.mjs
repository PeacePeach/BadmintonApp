// Voice Log Match: parse result -> Log Match draft, player resolution and match type (project/rallywise-voice.js).
//   node --test tests/rallywise-voice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const V = createRequire(import.meta.url)('../project/rallywise-voice.js');
import { guard } from '../supabase/functions/_shared/voice-parse-core.js';
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
    games: [{ number: 1, result: 'win', my_score: 25, their_score: 21, interrupted: false }] });
  const d = V.toDraft(r, players, 21);
  assert.deepEqual(d.games, [{ w: 'us', l: null }]); assert.equal(d.flags.result, 'scores');
});

// ---------- Scoring format (Han 2026-10-26) ----------
test('scoring: valid final scores for 11, 15 and 21, including extended games', () => {
  const ok = { 21: [[21, 0], [21, 19], [22, 20], [28, 26], [30, 28], [30, 29]], 15: [[15, 13], [16, 14], [20, 18], [21, 19], [21, 20]], 11: [[11, 0], [11, 9], [12, 10], [14, 12], [15, 13], [15, 14]] };
  const bad = { 21: [[21, 20], [22, 19], [31, 29], [30, 27], [11, 9], [15, 13], [20, 18]], 15: [[15, 14], [21, 18], [22, 20], [11, 9], [21, 19.5]], 11: [[11, 10], [16, 14], [15, 12], [21, 19], [12, 9]] };
  for (const t of [11, 15, 21]) {
    for (const [a, b] of ok[t]) { assert.equal(V.validScore(a, b, t), true, `${a}-${b} in ${t}`); assert.equal(V.validScore(b, a, t), true); }
    for (const [a, b] of bad[t]) assert.equal(V.validScore(a, b, t), false, `${a}-${b} in ${t}`);
  }
  assert.equal(V.validScore(21, 19, 18), false);
});

test('scoring: only an explicitly said format is detected (EN/ZH); scores never decide it', () => {
  const cases = [['Played 11-point games with Alex, won 11-9, 11-7', 11], ['first to 15 today, lost 13-15', 15], ['We used the 21 point format', 21],
    ['games to eleven', 11], ['twenty-one point games', 21], ['今天打的11分制，11比9', 11], ['一局15分，赢了15比12', 15], ['打到21分', 21], ['赛制是15分', 15],
    ['won 11-9 and 11-7', null], ['won by 11 points 21-10', null], ['had an 11-point lead', null], ['lost 19 to 21', null], ['打了21分钟', null],
    ['11-point and 15-point games', null], ['', null], ['赢了11比9', null]];
  for (const [t, f] of cases) assert.equal(V.scoringOf(t), f, t);
});

test('scoring: changing the format never changes a score; conflicts are reported', () => {
  const games = [{ w: 'us', l: 17 }, { w: 'them', l: 19 }, { w: 'us', l: null }, { w: null, l: null }];
  const to11 = V.reformat(games, 21, 11);
  assert.deepEqual(V.savedGames(to11, null, 11).slice(0, 3), [[21, 17], [19, 21], { r: 'W' }]);
  assert.deepEqual(V.badScores(to11, 11), [0, 1]);
  assert.deepEqual(V.badScores(games, 21), []);
  // ...and back: the scores fit again and nothing is held apart from the format.
  assert.deepEqual(V.reformat(to11, 11, 21), games);
  assert.deepEqual(V.badScores(V.reformat(to11, 11, 21), 21), []);
  // A score valid in both formats needs no override (21-19 is a 15-point extended game too).
  assert.deepEqual(V.reformat([{ w: 'us', l: 19 }], 21, 15), [{ w: 'us', l: 19 }]);
});

test('scoring: voice keeps a heard score that fits another format, flagged until the format fits', () => {
  const r = V.mockParse('x', 'en'); Object.assign(r, { match_type: 'singles', game_count: 2,
    games: [{ number: 1, result: 'win', my_score: 11, their_score: 9, interrupted: false }, { number: 2, result: 'loss', my_score: 7, their_score: 11, interrupted: false }] });
  const d21 = V.toDraft(r, players, 21);
  assert.deepEqual(d21.games, [{ w: 'us', l: 9, ws: 11 }, { w: 'them', l: 7, ws: 11 }]); assert.equal(d21.flags.result, 'scores');
  assert.deepEqual(V.badScores(d21.games, 21), [0, 1]);
  assert.deepEqual(V.badScores(V.reformat(d21.games, 21, 11), 11), []);
  const d11 = V.toDraft(r, players, 11);
  assert.deepEqual(d11.games, [{ w: 'us', l: 9 }, { w: 'them', l: 7 }]); assert.equal(d11.flags.result, null);
  assert.deepEqual(V.savedGames(d11.games, null, 11), [[11, 9], [7, 11]]);
});

test('scoring: Edit restores saved scores exactly under their format', () => {
  assert.deepEqual(V.fromSaved([[11, 9], [12, 14], { r: 'W' }], 11).games, [{ w: 'us', l: 9 }, { w: 'them', l: 12 }, { w: 'us', l: null }]);
  // A historical score that its format would show differently keeps its points.
  const fs = V.fromSaved([[11, 9]], 21);
  assert.deepEqual(fs.games, [{ w: 'us', l: 9, ws: 11 }]);
  assert.deepEqual(V.savedGames(fs.games, null, 21), [[11, 9]]);
  assert.deepEqual(V.badScores(fs.games, 21), [0]);
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

test('real AI answers after the engine guard: unclear doubles asks for the partner, explicit doubles is confirmed', () => {
  // What the deployed model returned on 2026-10-23 (roles guessed from name order) goes through the guard first.
  const ai = (text, lang, ps) => { const r = V.mockParse('', lang); Object.assign(r, { language: lang, match_type: 'doubles', game_count: 2, order_known: true,
    totals: { wins: 2, losses: 0 }, missing: [], players: ps.map(([name, role]) => ({ name, role })),
    games: [{ number: 1, result: 'win', my_score: 21, their_score: 19, interrupted: false }, { number: 2, result: 'win', my_score: 21, their_score: 17, interrupted: false }] });
    guard(r, text); return V.toDraft(r, players, 21); };
  for (const [t, lang] of [['Doubles tonight with Leo, Mei and Ravi. We won 21-19 and 21-17.', 'en'], ['今晚和Leo、Mei、Ravi打双打，21比19、21比17赢了。', 'zh']]) {
    const d = ai(t, lang, [['Leo', 'partner'], ['Mei', 'opponent'], ['Ravi', 'opponent']]);
    assert.deepEqual(d.pool.map(p => p.heard), ['Leo', 'Mei', 'Ravi']);
    assert.deepEqual(states(d), { partner: 'missing', opp1: 'missing', opp2: 'missing' });
    assert.equal(d.flags.players, 'unknown');
  }
  const d = ai('今天和Priya搭档打双打，对手是Marcus和Jordan。', 'zh', [['Priya', 'partner'], ['Marcus', 'opponent'], ['Jordan', 'opponent']]);
  assert.deepEqual([d.partner, d.opp1, d.opp2], ['priya', 'marcus', 'jordan']); assert.equal(d.flags.players, null);
});

test('opponent notes: prefilled from opponent observations, kept apart from the other notes', () => {
  for (const lang of ['en', 'zh']) {
    const d = draft('opponent', lang);
    assert.equal(d.opp1, 'alex');
    assert.equal(d.on, lang === 'en' ? 'Alex kept attacking my backhand. His drop shots were hard to read.' : 'Alex一直压我反手。吊球很难判断。');
    assert.deepEqual([d.wt, d.lt, d.lost], [['Smash'], [], '']);
    assert.equal(d.flags.notes, null);
  }
});

test('opponent notes stay with the match while the opponent is unresolved', () => {
  const r = V.mockParse(V.sample('ambiguous', 'en').text, 'en');
  r.observations.push({ text: 'Chris lifts a lot under pressure', category: 'opponent', area: null, about: 'Chris' });
  const d = V.toDraft(r, players, 21);
  assert.equal(d.slots.opp1.state, 'ambiguous'); assert.equal(d.opp1, null);
  assert.equal(d.on, 'Chris lifts a lot under pressure.');
  // Saved before resolution: the opponent is an Unknown Player placeholder, the note is kept on the match.
  assert.deepEqual(V.savedPlayers(d.type, d.slots, d.pool, () => null), { partner: null, opps: ['unknown:Chris'] });
});

test('a note the parser says is about the partner never becomes an opponent note', () => {
  const r = V.mockParse('', 'en');
  Object.assign(r, { match_type: 'doubles', players: [{ name: 'Priya', role: 'partner' }, { name: 'Marcus', role: 'opponent' }, { name: 'Jordan', role: 'opponent' }],
    observations: [{ text: 'Priya covered the back well', category: 'opponent', area: null, about: 'Priya' }, { text: 'Marcus serves short', category: 'opponent', area: null, about: 'Marcus' }] });
  const d = V.toDraft(r, players, 21);
  assert.equal(d.on, 'Marcus serves short.');
  assert.equal(d.lost, 'Priya covered the back well.'); assert.equal(d.flags.notes, 'check');
});
