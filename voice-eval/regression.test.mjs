// Regression tests for issues Han found while testing the functional prototype (2026-10-18).
//   node --test voice-eval/regression.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { guard, validate, namedAreas, statedRoles, cleanNote, splitSkills } from '../supabase/functions/_shared/voice-parse-core.js';

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

// ---- Sides in doubles: only what the transcript states (real AI test, 2026-10-23) ----
const P = (name, role) => ({ name, role });
const roles = out => out.players.map(p => [p.name, p.role]);
const partnerAmbiguity = out => out.ambiguities.filter(a => a.field === 'players' && a.note === 'Partner not stated.').length;
const doubles = (players, lang = 'en') => base({ language: lang, match_type: 'doubles', game_count: 2, order_known: true, totals: { wins: 2, losses: 0 },
  players, games: [game(1, 'win', 21, 19), game(2, 'win', 21, 17)] });

test('three names with no sides (English): roles become unknown and the partner is asked for', () => {
  // The deployed model guessed Leo = partner, Mei and Ravi = opponents from the order the names were said.
  const out = parse(doubles([P('Leo', 'partner'), P('Mei', 'opponent'), P('Ravi', 'opponent')]), 'Doubles tonight with Leo, Mei and Ravi. We won 21-19 and 21-17.');
  assert.deepEqual(roles(out), [['Leo', 'unknown'], ['Mei', 'unknown'], ['Ravi', 'unknown']]);
  assert.equal(partnerAmbiguity(out), 1);
  assert.equal(out.multiple_lineups, false);
});

test('three names with no sides (Chinese): roles become unknown and the partner is asked for', () => {
  const out = parse(doubles([P('Leo', 'partner'), P('Mei', 'opponent'), P('Ravi', 'opponent')], 'zh'), '今晚和Leo、Mei、Ravi打双打，21比19、21比17赢了。');
  assert.deepEqual(roles(out), [['Leo', 'unknown'], ['Mei', 'unknown'], ['Ravi', 'unknown']]);
  assert.equal(partnerAmbiguity(out), 1);
});

test('an existing "partner not stated" note is not repeated', () => {
  const out = doubles([P('Leo', 'unknown'), P('Mei', 'unknown'), P('Ravi', 'unknown')]);
  out.ambiguities.push({ field: 'players', note: 'Partner not stated.' });
  parse(out, 'Doubles tonight with Leo, Mei and Ravi. We won 21-19 and 21-17.');
  assert.equal(partnerAmbiguity(out), 1);
});

test('explicit partner and opponents in English are kept', () => {
  for (const t of ['Doubles tonight, partnered with Priya against Marcus and Jordan. Won 21-19 and 21-17.',
    'Teamed up with Priya against Marcus and Jordan, won 21-19, 21-17.',
    'Doubles: Priya was my partner, opponents were Marcus and Jordan. 21-19, 21-17.',
    'Priya and I beat Marcus and Jordan 21-19 and 21-17 in doubles.',
    'Doubles with Priya against Marcus and Jordan. Won 21-19, 21-17.']) {
    const out = parse(doubles([P('Priya', 'partner'), P('Marcus', 'opponent'), P('Jordan', 'opponent')]), t);
    assert.deepEqual(roles(out), [['Priya', 'partner'], ['Marcus', 'opponent'], ['Jordan', 'opponent']], t);
    assert.equal(partnerAmbiguity(out), 0, t);
  }
});

test('explicit partner and opponents in Chinese are kept', () => {
  for (const t of ['今天和Priya搭档打双打，对手是Marcus和Jordan。21比19、21比17赢了。',
    '双打，队友是Priya，对阵Marcus和Jordan，21比19、21比17。',
    '我和Priya一组，打败了Marcus和Jordan，21比19、21比17。',
    '双打，搭档是Priya，Marcus和Jordan是对手，21比19、21比17赢了。']) {
    const out = parse(doubles([P('Priya', 'partner'), P('Marcus', 'opponent'), P('Jordan', 'opponent')], 'zh'), t);
    assert.deepEqual(roles(out), [['Priya', 'partner'], ['Marcus', 'opponent'], ['Jordan', 'opponent']], t);
  }
});

test('a stated side wins over the model when they disagree', () => {
  const out = parse(doubles([P('Priya', 'opponent'), P('Marcus', 'partner'), P('Jordan', 'opponent')]), 'Partnered with Priya against Marcus and Jordan. Won 21-19, 21-17.');
  assert.deepEqual(roles(out), [['Priya', 'partner'], ['Marcus', 'opponent'], ['Jordan', 'opponent']]);
});

test('partly stated doubles: a stated partner or two stated opponents settle the rest, anything else stays unknown', () => {
  // Partner stated: the other two are the opponents.
  let out = parse(doubles([P('Priya', 'partner'), P('Marcus', 'opponent'), P('Jordan', 'opponent')]), 'Doubles, Priya was my partner. Marcus and Jordan were great fun. Won 21-19, 21-17.');
  assert.deepEqual(roles(out), [['Priya', 'partner'], ['Marcus', 'opponent'], ['Jordan', 'opponent']]);
  // Both opponents stated: the third person is the partner.
  out = parse(doubles([P('Kevin', 'partner'), P('Leo', 'opponent'), P('Sam', 'opponent')], 'zh'), '今天和Kevin打双打，对手是Leo和Sam，21比19、21比17赢了。');
  assert.deepEqual(roles(out), [['Kevin', 'partner'], ['Leo', 'opponent'], ['Sam', 'opponent']]);
  // One opponent stated: the two others could be either side.
  out = parse(doubles([P('Leo', 'partner'), P('Mei', 'opponent'), P('Marcus', 'opponent')]), 'Doubles against Marcus, with Leo and Mei there too. Won 21-19, 21-17.');
  assert.deepEqual(roles(out), [['Leo', 'unknown'], ['Mei', 'unknown'], ['Marcus', 'opponent']]);
  assert.equal(partnerAmbiguity(out), 1);
});

test('two names in doubles: an unstated partner becomes unknown, a stated one is kept', () => {
  let out = parse(doubles([P('Leo', 'partner'), P('Mei', 'opponent')]), 'Doubles with Leo and Mei. Won 21-19, 21-17.');
  assert.deepEqual(roles(out), [['Leo', 'unknown'], ['Mei', 'unknown']]);
  out = parse(doubles([P('Leo', 'partner'), P('Mei', 'opponent')]), 'Doubles, Leo was my partner and we beat Mei and her friend. Won 21-19, 21-17.');
  assert.deepEqual(roles(out), [['Leo', 'partner'], ['Mei', 'opponent']]);
});

test('multiple lineups keep their flag and the model roles', () => {
  const zh = parse(doubles([P('Priya', 'partner'), P('Leo', 'partner'), P('Marcus', 'opponent'), P('Jordan', 'opponent')], 'zh'),
    '先和Priya搭档打Marcus和Jordan，后来换了搭档和Leo打。21比15赢，18比21输。');
  assert.equal(zh.multiple_lineups, true);
  assert.deepEqual(roles(zh), [['Priya', 'partner'], ['Leo', 'partner'], ['Marcus', 'opponent'], ['Jordan', 'opponent']]);
  const en = parse(doubles([P('Priya', 'partner'), P('Marcus', 'opponent'), P('Jordan', 'opponent'), P('Leo', 'unknown')]),
    'Played doubles with Priya against Marcus and Jordan, then switched partners and played with Leo. Won 21-15, lost 18-21.');
  assert.equal(en.multiple_lineups, true);
  assert.equal(mapResult(en, deps).lineup.names.length, 4);
});

test('singles roles are left alone', () => {
  const out = parse(base({ match_type: 'singles', players: [P('David', 'opponent')] }), 'Singles with David from work. Lost 15-21 and 19-21.');
  assert.deepEqual(roles(out), [['David', 'opponent']]);
  assert.equal(statedRoles('Singles against Alex today.', ['Alex']).get('alex'), 'opponent');
});

// ---- Serve terminology ----
test('发小球 is Serve, and existing serve / return words keep their areas', () => {
  const out = parse(base({ language: 'zh', match_type: 'singles', observations: [obs('发小球让对手一直起球', 'Other', 'won_points')] }), '早上打了单打，21比15、21比18两局都赢了。发小球让对手一直起球。');
  assert.equal(out.observations[0].area, 'Serve');
  assert.deepEqual(namedAreas('发小球让对手一直起球'), ['Serve']);
  assert.deepEqual(namedAreas('发短球质量不错'), ['Serve']);
  assert.deepEqual(namedAreas('发球下网两次'), ['Serve']);
  assert.deepEqual(namedAreas('接发小球太被动'), ['Return']);
  assert.deepEqual(namedAreas('接发球太被动'), ['Return']);
  assert.deepEqual(namedAreas('Low serves kept them lifting'), ['Serve']);
  assert.deepEqual(namedAreas('杀球不错'), ['Smash']);
});

// ---- missing / ambiguities agree with the parsed data ----
test('missing never contradicts the result', () => {
  // The deployed model's answer for the zh missing-opponent case.
  const out = parse(base({ language: 'zh', match_type: 'singles', game_count: 2, order_known: true, totals: { wins: 2, losses: 0 },
    games: [game(1, 'win', 21, 15), game(2, 'win', 21, 18)], missing: ['opponents', 'game_order', 'partners'] }), '早上打了单打，21比15、21比18两局都赢了。');
  assert.equal(out.order_known, true);
  assert.deepEqual(out.missing, ['opponents']);
  // Order really unknown: game_order stays. Doubles without a partner: partners stays.
  const open = parse(base({ match_type: 'doubles', game_count: 6, totals: { wins: 4, losses: 2 }, missing: ['game_order', 'partners', 'opponents'] }), 'Six games of doubles, won four.');
  assert.deepEqual(open.missing, ['game_order', 'partners', 'opponents']);
  // Filled fields are not missing.
  const filled = parse(doubles([P('Priya', 'partner'), P('Marcus', 'opponent'), P('Jordan', 'opponent')]), 'Partnered with Priya against Marcus and Jordan. Won 21-19, 21-17.');
  filled.missing.push('partners', 'opponents', 'match_type', 'game_count'); guard(filled, 'Partnered with Priya against Marcus and Jordan. Won 21-19, 21-17.');
  assert.deepEqual(filled.missing, []);
});

test('players, ambiguities and missing tell the same story for unclear doubles', () => {
  const out = parse(doubles([P('Leo', 'partner'), P('Mei', 'opponent'), P('Ravi', 'opponent')]), 'Doubles tonight with Leo, Mei and Ravi. We won 21-19 and 21-17.');
  assert.ok(out.players.every(p => p.role === 'unknown'));
  assert.equal(partnerAmbiguity(out), 1);
  assert.ok(!out.missing.includes('game_order'));
  const d = mapResult(out, deps);
  assert.equal(d.partners.length, 0);
});

// ---- Notes: semantic cleanup and skill tags, English / Chinese / mixed (Han, 2026-10-23) ----
// The model cleans notes in the same call; the guard catches ASR errors it leaves and tags from the cleaned text.
const notesOf = out => out.observations.map(o => [o.text, o.category, o.area]);
const session = (observations, players = [], lang = 'zh') => base({ language: lang, match_type: 'singles', game_count: 2, order_known: true, totals: { wins: 1, losses: 1 },
  players, games: [game(1, 'win', 21, 15), game(2, 'loss', 18, 21)], observations });

test('Chinese homophones: 往前小球 is 网前小球 (Net), 揭发 is 接发 (Return), and the tag follows the cleaned text', () => {
  const out = parse(session([obs('我往前小球打得不好', 'Footwork'), obs('揭发总是太被动', 'Other'), obs('今天往前搓球手杆比上周好', 'Footwork', 'won_points')]),
    '21比15赢了，18比21输了。我往前小球打得不好，揭发总是太被动，今天往前搓球手杆比上周好。');
  assert.deepEqual(notesOf(out), [['我的网前小球打得不好', 'lost_points', 'Net'], ['接发球总是太被动', 'lost_points', 'Return'], ['今天网前搓球手感比上周好', 'won_points', 'Net']]);
});

test('English homophones and grammar: internet, surf, consistency, repeated words', () => {
  const out = parse(session([obs('I struggled internet', 'Other'), obs('My surf was weak', 'Other'), obs('My net shots were not consistency', 'Other'), obs('my my backhand was slow', 'Other')], [], 'en'),
    'Won 21-15, lost 18-21. I struggled internet. My surf was weak. My net shots were not consistency. my my backhand was slow.');
  assert.deepEqual(notesOf(out), [['I struggled at the net', 'lost_points', 'Net'], ['My serve was weak', 'lost_points', 'Serve'],
    ['My net shots were inconsistent', 'lost_points', 'Net'], ['My backhand was slow', 'lost_points', 'Other']]);
});

test('single-skill notes keep one tag in each language', () => {
  const out = parse(session([obs('杀球很有效', 'Other', 'won_points'), obs('往前移动太慢', 'Net'), obs('My drop shots were too high', 'Other'), obs('我的clear不够深', 'Other')], [], 'mixed'),
    '赢了21比15，输了18比21。杀球很有效，往前移动太慢。My drop shots were too high. 我的clear不够深。');
  assert.deepEqual(out.observations.map(o => o.area), ['Smash', 'Footwork', 'Placement', 'Placement']);
});

test('one note rating two skills becomes one note per skill with the same evaluation (zh)', () => {
  const t = '21比15赢了，18比21输了。我往前小球和吊球都发挥得不好。';
  const out = parse(session([obs('我往前小球和吊球都发挥得不好。', 'Placement')]), t);
  assert.deepEqual(notesOf(out), [['我的网前小球发挥得不好。', 'lost_points', 'Net'], ['我的吊球发挥得不好。', 'lost_points', 'Placement']]);
  const d = mapResult(out, deps);
  assert.equal(d.notes.length, 2);
  assert.deepEqual(d.notes.map(n => n.tag), ['Net', 'Placement']);
});

test('one note rating two skills becomes one note per skill (en and mixed)', () => {
  const en = parse(session([obs('My net shots and drop shots were inconsistent.', 'Net')], [], 'en'), 'Won 21-15, lost 18-21. My net shots and drop shots were inconsistent.');
  assert.deepEqual(notesOf(en), [['My net shots were inconsistent.', 'lost_points', 'Net'], ['My drop shots were inconsistent.', 'lost_points', 'Placement']]);
  const won = parse(session([obs('My serve and smash were good', 'Serve', 'won_points')], [], 'en'), 'Won 21-15, lost 18-21. My serve and smash were good');
  assert.deepEqual(notesOf(won), [['My serve was good', 'won_points', 'Serve'], ['My smash was good', 'won_points', 'Smash']]);
  const mixed = parse(session([obs('我的net shots和吊球都不太稳定', 'Net')], [], 'mixed'), '21比15赢了，18比21输了。我的net shots和吊球都不太稳定。');
  assert.deepEqual(notesOf(mixed), [['我的net shots不太稳定', 'lost_points', 'Net'], ['我的吊球不太稳定', 'lost_points', 'Placement']]);
});

test('a model that already split the skills is left alone, with no duplicates', () => {
  const out = parse(session([obs('我的网前小球发挥得不好', 'Net'), obs('我的吊球发挥得不好', 'Placement'), obs('我的吊球发挥得不好', 'Placement')]), '我往前小球和吊球都发挥得不好。');
  assert.deepEqual(notesOf(out), [['我的网前小球发挥得不好', 'lost_points', 'Net'], ['我的吊球发挥得不好', 'lost_points', 'Placement']]);
});

test('ambiguous or ordinary wording is not overcorrected or split', () => {
  for (const t of ['往前移动太慢', '我打得不好', 'I lost my internet connection before the game', 'I want to surf the web', '网前和后场的衔接太慢',
    'My net and smash combination was weak', 'My clears and drops were short', 'My partner and I were slow', '他的发球很好']) {
    assert.equal(cleanNote(t), t, t);
    assert.equal(splitSkills(t), null, t);
  }
  const out = parse(session([obs('我打得不好', 'Other'), obs('My clears and drops were short', 'Placement')], [], 'mixed'), '我打得不好。My clears and drops were short.');
  assert.deepEqual(notesOf(out), [['我打得不好', 'lost_points', 'Other'], ['My clears and drops were short', 'lost_points', 'Placement']]);
});

test('note cleanup never touches player names, scores, results or roles', () => {
  // A player whose name looks like an ASR error keeps it, in players and in opponent notes.
  const t = 'Singles against Surf. Won 21-15, lost 18-21. Surf kept serving short. My surf was weak.';
  const out = parse(session([{ text: 'Surf kept serving short', category: 'opponent', area: 'Serve', about: 'Surf' }, obs('My surf was weak', 'Other')], [P('Surf', 'opponent')], 'en'), t);
  assert.deepEqual(roles(out), [['Surf', 'opponent']]);
  assert.deepEqual(notesOf(out), [['Surf kept serving short', 'opponent', null], ['My surf was weak', 'lost_points', 'Other']]);
  assert.equal(out.observations[0].about, 'Surf');
  assert.deepEqual(out.games.map(g => [g.result, g.my_score, g.their_score]), [['win', 21, 15], ['loss', 18, 21]]);
  assert.deepEqual(out.totals, { wins: 1, losses: 1 });
  // Chinese: a name containing a homophone is kept.
  const zh = parse(session([{ text: '往前小球很稳', category: 'opponent', area: null, about: '往前小球' }], [P('往前小球', 'opponent')]), '对手是往前小球，21比15赢了，18比21输了。往前小球很稳。');
  assert.equal(zh.observations[0].text, '往前小球很稳');
  assert.equal(zh.players[0].name, '往前小球');
});
