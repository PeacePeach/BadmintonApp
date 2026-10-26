// Voice Log player resolution across Chinese and Pinyin/English names (Han, 2026-10-26).
//   node --test tests/player-resolution.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const V = require('../project/rallywise-voice.js');
const N = require('../project/rallywise-names.js');

const me = { id: 'me', name: 'Han' };
const roster = [me, { id: 'yang', name: 'Yang' }, { id: 'wang', name: 'Wang' }, { id: 'liw', name: 'Li Wei' }, { id: 'alex', name: 'Alex Chen' },
  { id: 'zw', name: 'Zhang Wei' }, { id: 'oy', name: 'Ouyang Nana' }, { id: 'zeng', name: 'Zeng' }, { id: 'chris', name: 'Chris Lam' }];
const pick = (...ids) => [me, ...roster.filter(p => ids.includes(p.id))];
const r1 = (heard, players) => { const r = V.resolve(heard, players); return [r.state, r.id, r.cands]; };

// A parser result in the edge function's shape; the parser keeps names as heard (杨 stays 杨).
const parsed = (language, match_type, players) => ({ language, match_type, multiple_lineups: false, game_count: 2, order_known: true,
  totals: { wins: 2, losses: 0 }, players: players.map(([name, role]) => ({ name, role })),
  games: [1, 2].map(number => ({ number, result: 'win', my_score: 21, their_score: 15, interrupted: false })), observations: [], missing: [], ambiguities: [] });
const draft = (lang, type, ps, players = roster) => V.toDraft(parsed(lang, type, ps), players, 21);
const states = d => Object.fromEntries(Object.entries(d.slots).map(([k, s]) => [k, s.state]));

test('杨 resolves to the saved Yang, and Yang to a saved 杨', () => {
  assert.deepEqual(r1('杨', roster), ['confirmed', 'yang', []]);
  assert.deepEqual(r1('老杨', roster), ['confirmed', 'yang', []]);
  assert.deepEqual(r1('Yang', [me, { id: 'y', name: '杨' }]), ['confirmed', 'y', []]);
});

test('王 resolves to the saved Wang, 李 / 曾 / 欧阳 by their name readings', () => {
  assert.deepEqual(r1('王', roster), ['confirmed', 'wang', []]);
  assert.deepEqual(r1('李', pick('liw')), ['confirmed', 'liw', []]);
  assert.deepEqual(r1('曾', roster), ['confirmed', 'zeng', []]);
  assert.deepEqual(r1('欧阳娜娜', roster), ['confirmed', 'oy', []]);
});

test('multi-character Chinese names match the full Pinyin name in either order', () => {
  assert.deepEqual(r1('张伟', roster), ['confirmed', 'zw', []]);
  assert.deepEqual(r1('张伟', [me, { id: 'wz', name: 'Wei Zhang' }]), ['confirmed', 'wz', []]);
  assert.deepEqual(r1('李伟', roster), ['confirmed', 'liw', []]);
  // Only the given name, or a full name against a saved family name: asked, never confirmed.
  assert.deepEqual(r1('伟', pick('zw')), ['ambiguous', null, ['zw']]);
  assert.deepEqual(r1('王伟', pick('wang')), ['ambiguous', null, ['wang']]);
});

test('several players with the same romanized name are always asked about', () => {
  const two = [me, { id: 'y1', name: 'Yang' }, { id: 'y2', name: 'Yang Ming' }];
  assert.deepEqual(r1('杨', two), ['ambiguous', null, ['y1', 'y2']]);
  // Homophones saved in Chinese: Yang could be 杨 or 阳.
  assert.deepEqual(r1('Yang', [me, { id: 'a', name: '杨' }, { id: 'b', name: '阳' }]), ['ambiguous', null, ['a', 'b']]);
  // Same sound, different character (the recogniser picked 阳 for a saved 杨): a candidate, not a match.
  assert.deepEqual(r1('阳', [me, { id: 'a', name: '杨' }]), ['ambiguous', null, ['a']]);
});

test('other romanizations and polyphonic readings are candidates, never auto-confirmed', () => {
  assert.equal(N.match('王', 'Wong'), 'weak');
  assert.equal(N.match('黄', 'Wong'), 'weak');
  assert.equal(N.match('李', 'Lee'), 'weak');
  assert.deepEqual(r1('王', [me, { id: 'w', name: 'Wong' }]), ['ambiguous', null, ['w']]);
  // A unique strong match outranks weak candidates (Han's rule, ce34d88): 王 is the saved Wang, not Wong.
  assert.deepEqual(r1('王', [me, { id: 'w', name: 'Wong' }, { id: 'wa', name: 'Wang' }]), ['confirmed', 'wa', []]);
  assert.deepEqual(r1('曾', [me, { id: 'c', name: 'Ceng' }]), ['ambiguous', null, ['c']]);
  assert.deepEqual(r1('王', [me, { id: 'wa', name: 'Wang' }, { id: 'cw', name: 'Chris Wong' }]), ['confirmed', 'wa', []]);
  assert.deepEqual(r1('杨', [me, { id: 'jy', name: 'Jason Yang' }]), ['ambiguous', null, ['jy']]);
});

test('exact matches keep the existing rule and win over readings', () => {
  assert.deepEqual(r1('Yang', roster), ['confirmed', 'yang', []]);
  assert.deepEqual(r1('alex', roster), ['confirmed', 'alex', []]);
  assert.deepEqual(r1('Chris', roster), ['confirmed', 'chris', []]);
  assert.deepEqual(r1('杨', [me, { id: 'zh', name: '杨' }, { id: 'en', name: 'Yang' }]), ['confirmed', 'zh', []]);
  // Latin names never match each other by sound: Wong is not Wang.
  assert.deepEqual(r1('Wong', pick('wang')), ['new', null, []]);
});

test('unknown names still go to the new-player flow', () => {
  assert.deepEqual(r1('刘', roster), ['new', null, []]);
  assert.deepEqual(r1('David', roster), ['new', null, []]);
  assert.deepEqual(r1('杨', [me]), ['new', null, []]);
  assert.deepEqual(r1('杨', [{ id: 'me', name: 'Yang' }]), ['new', null, []]);
});

test('singles, EN and ZH: the Chinese name lands on the existing opponent', () => {
  for (const lang of ['en', 'zh']) {
    const d = draft(lang, 'singles', [['杨', 'opponent']]);
    assert.equal(d.opp1, 'yang'); assert.deepEqual(states(d), { opp1: 'confirmed' }); assert.equal(d.flags.players, null);
    assert.equal(d.slots.opp1.heard, '杨');
  }
  const e = draft('en', 'singles', [['Yang', 'opponent']], [me, { id: 'y', name: '杨' }]);
  assert.equal(e.opp1, 'y');
});

test('doubles, EN and ZH: partner and opponents resolve across languages', () => {
  for (const lang of ['en', 'zh']) {
    const d = draft(lang, 'doubles', [['王', 'partner'], ['杨', 'opponent'], ['张伟', 'opponent']]);
    assert.deepEqual([d.partner, d.opp1, d.opp2], ['wang', 'yang', 'zw']);
    assert.deepEqual(states(d), { partner: 'confirmed', opp1: 'confirmed', opp2: 'confirmed' }); assert.equal(d.flags.players, null);
  }
  // Mixed scripts in one sentence.
  const m = draft('en', 'doubles', [['Alex', 'partner'], ['杨', 'opponent'], ['Wang', 'opponent']]);
  assert.deepEqual([m.partner, m.opp1, m.opp2], ['alex', 'yang', 'wang']);
});

test('doubles with an ambiguous or unknown name never auto-selects the wrong player', () => {
  const ps = [me, { id: 'y1', name: 'Yang' }, { id: 'y2', name: 'Yang Ming' }, { id: 'wang', name: 'Wang' }];
  for (const lang of ['en', 'zh']) {
    const d = draft(lang, 'doubles', [['王', 'partner'], ['杨', 'opponent'], ['刘', 'opponent']], ps);
    assert.equal(d.partner, 'wang');
    assert.equal(d.opp1, null); assert.deepEqual(d.slots.opp1.cands, ['y1', 'y2']);
    assert.equal(d.opp2, null); assert.equal(d.slots.opp2.state, 'new'); assert.equal(d.slots.opp2.heard, '刘');
    assert.equal(d.flags.players, 'unknown');
  }
});

test('the same player heard in two scripts is not placed twice', () => {
  const d = draft('zh', 'doubles', [['Yang', 'partner'], ['杨', 'opponent'], ['王', 'opponent']]);
  assert.equal(d.partner, 'yang');
  assert.equal(d.opp1, null); assert.deepEqual([d.slots.opp1.state, d.slots.opp1.cands], ['ambiguous', ['yang']]);
  assert.equal(d.opp2, 'wang');
});

test('unclear doubles roles still ask "Who is your partner?" with resolved people', () => {
  const d = draft('zh', 'doubles', [['杨', 'unknown'], ['王', 'unknown'], ['张伟', 'unknown']]);
  assert.equal(d.pool.length, 3);
  assert.deepEqual(d.pool.map(p => p.id), ['yang', 'wang', 'zw']);
});

// English names heard in Chinese (Han, 2026-10-26 P0): iOS may write a saved "Mike" as 迈克 or 麦克.
const intl = [me, { id: 'mike', name: 'Mike' }, { id: 'yang', name: 'Yang' }, { id: 'tom', name: 'Tom Lee' }, { id: 'kevin', name: 'Kevin' }, { id: 'wang', name: 'Wang' }];

test('迈克 / 麦克 resolve to the saved Mike, keeping his id and the heard name', () => {
  for (const h of ['迈克', '麦克', '迈可', '小迈克', 'Mike', 'mike']) assert.deepEqual(r1(h, intl), ['confirmed', 'mike', []], h);
  assert.equal(V.resolve('迈克', intl).heard, '迈克');
  assert.deepEqual(r1('汤姆', intl), ['confirmed', 'tom', []]);
  assert.deepEqual(r1('凯文', intl), ['confirmed', 'kevin', []]);
  // The other way round: a player saved in Chinese, heard in English.
  assert.deepEqual(r1('Mike', [me, { id: 'm', name: '迈克' }]), ['confirmed', 'm', []]);
});

test('a looser spelling or another form of the name is asked about, never merged', () => {
  // Michael is maybe Mike: candidate only.
  assert.deepEqual(r1('迈克尔', intl), ['ambiguous', null, ['mike']]);
  // 马克 is Mark; a saved Mike only sounds alike.
  assert.deepEqual(r1('马克', intl), ['ambiguous', null, ['mike']]);
  // Unlisted spelling that sounds like the saved name.
  assert.deepEqual(r1('布鲁诺', [me, { id: 'b', name: 'Bruno' }]), ['ambiguous', null, ['b']]);
  // Two players a spelling fits equally: both asked.
  assert.deepEqual(r1('迈克', [me, { id: 'm1', name: 'Mike' }, { id: 'm2', name: 'Mike Chen' }]), ['ambiguous', null, ['m1', 'm2']]);
  // Strong beats weak: Mike is confirmed over Mark's sound-alike.
  assert.deepEqual(r1('迈克', [me, { id: 'mk', name: 'Mark' }, { id: 'mike', name: 'Mike' }]), ['confirmed', 'mike', []]);
});

test('names that are not a saved player stay new (no duplicate player, no wrong merge)', () => {
  assert.deepEqual(r1('大卫', intl), ['new', null, []]);
  assert.deepEqual(r1('迈克', [me]), ['new', null, []]);
  assert.deepEqual(r1('刘', intl), ['new', null, []]);
  assert.deepEqual(r1('杨', intl), ['confirmed', 'yang', []]);
  // Two different Latin names are never matched by sound.
  assert.deepEqual(r1('Mick', intl), ['new', null, []]);
});

test('mixed Chinese / English speech: Mike, Yang and others in one match, EN and ZH', () => {
  for (const lang of ['en', 'zh']) {
    const d = draft(lang, 'doubles', [['迈克', 'partner'], ['杨', 'opponent'], ['Kevin', 'opponent']], intl);
    assert.deepEqual([d.partner, d.opp1, d.opp2], ['mike', 'yang', 'kevin']); assert.equal(d.flags.players, null);
    const s = draft(lang, 'singles', [['麦克', 'opponent']], intl);
    assert.equal(s.opp1, 'mike'); assert.equal(s.slots.opp1.heard, '麦克');
  }
  // Mike heard twice (迈克 and Mike): placed once, the other is asked about.
  const t = draft('zh', 'doubles', [['Mike', 'partner'], ['迈克', 'opponent'], ['王', 'opponent']], intl);
  assert.equal(t.partner, 'mike'); assert.equal(t.opp1, null); assert.deepEqual(t.slots.opp1.cands, ['mike']); assert.equal(t.opp2, 'wang');
});
