// Opponent Plans v15 (Han, 2026-10-26 18:21): plans build on what already worked against an opponent, then on what
// they get wrong; never just restate or "test" how they play; proven / suggested / early are labelled; nothing invented.
// Notes follow the evidence Han verified for Yang, Yorick and Stefan (EN and ZH versions).
//   node --test tests/opponent-plans.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const G = await import(pathToFileURL(path.resolve(import.meta.dirname, '../supabase/functions/_shared/grow-insights-core.js')).href);

let n = 0;
const M = (opps, opp_notes, extra = {}) => { n++; const d = new Date(Date.UTC(2026, 9, n)).toISOString().slice(0, 10);
  return { id: 'm' + n, date: d, created_at: d + 'T12:00:00Z', type: opps.length > 1 ? 'Doubles' : 'Singles', partner: opps.length > 1 ? 'p' : null, opps, games: [[21, 18], [21, 19]], wt: [], lt: [], worked: '', lost: '', opp_notes, ...extra }; };
const names = { yang: 'Yang', yorick: 'Yorick', stefan: 'Stefan' };
export const NOTES = {
  en: {
    yang: ['Yang is a strong defender and likes moving me between the front and back court.', 'He often blocks my smashes and drops to the net, making it hard for me to recover.',
      'My cross-court sliced drops, smashes near the sidelines and clears to his backhand scored points. I struggle with stamina in long 21-point games.'],
    yorick: ['Yorick moves very quickly.', 'His smashes are fast but not very powerful. I struggle to keep up with his movement and pace.'],
    stefan: ['Stefan makes mistakes on his backhand in the rear court.', 'He sometimes smashes into the net.']
  },
  zh: {
    yang: ['Yang防守很强，喜欢调动我前后场。', '经常把我的杀球和吊球挡到网前，让我很难回位。', '我的对角劈吊、边线杀球和打他反手的高远球都得分了。21分的长局我体能跟不上。'],
    yorick: ['Yorick移动很快。', '他的杀球很快但不是很重。我跟不上他的移动和节奏。'],
    stefan: ['Stefan后场反手容易失误。', '他有时杀球下网。']
  }
};
export const facts = notesLang => { n = 0; const ms = [];
  for (const [id, list] of Object.entries(NOTES[notesLang])) for (const t of list) ms.push(M([id], t));
  return Object.fromEntries(G.opponentFacts(ms, names).map(o => [o.player_id, o])); };
// What Grow showed before (Han's screenshots) and what a plan under the v15 rules looks like.
export const BEFORE = { yang: "Probe his front-back movement early; test how he defends smashes.", yorick: 'Test his movement early; expect fast but not heavy smashes.', stefan: "Test Stefan's backhand in the backcourt early." };
export const AFTER = {
  en: { yang: 'Go back to cross-court sliced drops, sideline smashes and clears to his backhand.', yorick: 'His smashes are fast but light: stand closer, block or counter them, and keep the pace in your hands.',
    stefan: 'Clear deep to his backhand rear court and make him play it.' },
  zh: { yang: '继续用对角劈吊、边线杀球和打他反手的高远球。', yorick: '他杀球快但不重：站前一点，挡网或反抽，别跟着他的节奏跑。', stefan: '多打他反手后场，逼他在那里出球。' }
};

for (const notesLang of ['en', 'zh']) test(`${notesLang} notes: evidence is sorted into worked / weakness / patterns / the player's own limits`, () => {
  const f = facts(notesLang);
  assert.deepEqual(['yang', 'yorick', 'stefan'].map(id => f[id]).map(o => [o.player_id, o.notes.length, o.level, o.plan_type]),
    [['yang', 3, 'repeated', 'proven'], ['yorick', 2, 'repeated', 'suggested'], ['stefan', 2, 'repeated', 'suggested']]);
  assert.equal(f.yang.evidence.worked.length, 1); assert.match(f.yang.evidence.worked[0], notesLang === 'en' ? /cross-court sliced drops/ : /对角劈吊/);
  assert.equal(f.yang.evidence.player_limits.length, 1, 'stamina is the player\'s, not Yang\'s');
  assert.equal(f.yang.evidence.patterns.length, 2);
  assert.equal(f.yorick.evidence.weakness.length, 1, 'fast but not powerful smashes'); assert.equal(f.yorick.evidence.player_limits.length, 1);
  assert.equal(f.stefan.evidence.weakness.length, 2); assert.equal(f.stefan.evidence.worked.length, 0);
});

for (const lang of ['en', 'zh']) for (const notesLang of ['en', 'zh']) test(`${lang} plans from ${notesLang} notes: before rejected (except Stefan), after accepted and labelled`, () => {
  const f = facts(notesLang);
  if (lang === 'en') {
    assert.ok(G.checkPlan(BEFORE.yang, f.yang, 'en').includes('observe_only'));
    assert.ok(G.checkPlan(BEFORE.yang, f.yang, 'en').includes('proven_tactic_ignored'), 'what worked against Yang is not used');
    assert.ok(G.checkPlan(BEFORE.yorick, f.yorick, 'en').includes('observe_only'), 'restates what the notes say');
    assert.deepEqual(G.checkPlan(BEFORE.stefan, f.stefan, 'en'), [], 'Stefan: a specific, grounded plan is kept');
  }
  const out = G.finalizeOpponents(Object.entries(AFTER[lang]).map(([player_id, plan]) => ({ player_id, plan })), ['yang', 'yorick', 'stefan'].map(id => f[id]), lang);
  const L = G.PLAN_LABEL[lang];
  assert.deepEqual(out.map(p => [p.player_id, p.copy_source, p.plan_type, p.issues || []]), [['yang', 'ai', 'proven', []], ['yorick', 'ai', 'suggested', []], ['stefan', 'ai', 'suggested', []]]);
  assert.deepEqual(out.map(p => p.plan), [L.proven + AFTER[lang].yang, L.suggested + AFTER[lang].yorick, L.suggested + AFTER[lang].stefan]);
});

test('invented, misattributed, generic and observe-only plans are rejected', () => {
  const f = facts('en'), zh = facts('zh');
  const bad = (plan, o, lang = 'en') => G.checkPlan(plan, o, lang);
  assert.ok(bad("Yang's stamina fades in long games, so extend the rallies.", f.yang).includes('player_limit_given_to_opponent'));
  assert.ok(bad('他的体能跟不上，多拉长回合。', zh.yang, 'zh').includes('player_limit_given_to_opponent'));
  assert.ok(bad("Attack Yorick's forehand with drops.", f.yorick).includes('detail_not_in_notes'), 'a weakness the notes never mention');
  assert.ok(bad('Play your own game and stay positive.', f.stefan).length, 'generic');
  assert.ok(bad('Watch how Yorick moves in the first game.', f.yorick).includes('observe_only'));
  assert.ok(bad('先观察他的移动速度。', zh.yorick, 'zh').includes('observe_only'));
  assert.ok(bad('He beat you before, so slow it down.', f.yorick).includes('record_inference'));
  assert.ok(bad('Smash at his body every rally.', f.yang).includes('proven_tactic_ignored'), 'Yang: what worked comes first');
  // The model may not add a label; the engine's label is the only one.
  const [y] = G.finalizeOpponents([{ player_id: 'yang', plan: 'Try: Go back to cross-court sliced drops and clears to his backhand.' }], [f.yang], 'en');
  assert.equal(y.plan, 'Worked before: Go back to cross-court sliced drops and clears to his backhand.');
});

test('no model copy: the player\'s own words turned into one thing to do; style-only notes give no card', () => {
  for (const lang of ['en', 'zh']) {
    const f = facts('en'), out = Object.fromEntries(G.finalizeOpponents([], ['yang', 'yorick', 'stefan'].map(id => f[id]), lang).map(p => [p.player_id, p]));
    assert.match(out.yang.plan, lang === 'en' ? /^Worked before: you noted “My cross-court sliced drops, smashes near the sidelines and clears to his backhand scored points”\. Go back to it early next time\.$/
      : /^之前奏效：你记下“My cross-court sliced drops.*”。下次交手开局就再用。$/);
    assert.match(out.yorick.plan, lang === 'en' ? /^Try: you noted “His smashes are fast but not very powerful”\. Make it your first target\.$/ : /^可以试试：你记下“His smashes are fast but not very.*”。开局就针对这一点。$/);
    assert.match(out.stefan.plan, lang === 'en' ? /^Try: you noted “(Stefan makes mistakes on his backhand in the rear court|He sometimes smashes into the net)”/ : /^可以试试：/);
  }
  n = 0;
  const style = G.opponentFacts([M(['yorick'], 'Yorick moves very quickly.'), M(['yorick'], 'Yorick plays a lot at the net.')], names);
  assert.equal(style[0].plan_type, 'suggested');
  assert.deepEqual(G.finalizeOpponents([], style, 'en')[0].dropped, ['no_ai_copy', 'no_actionable_plan'], 'a quote of their style is not a plan');
});

test('sparse: one match is an early read; only the player\'s own difficulty is no plan at all', () => {
  n = 0;
  const [s] = G.opponentFacts([M(['stefan'], 'Stefan makes mistakes on his backhand in the rear court.')], names);
  assert.deepEqual([s.level, s.plan_type], ['single', 'early']);
  const [p] = G.finalizeOpponents([{ player_id: 'stefan', plan: "Test Stefan's backhand in the backcourt early." }], [s], 'en');
  assert.equal(p.plan, "Early read: Test Stefan's backhand in the backcourt early.");
  assert.ok(G.checkPlan('He always misses on the backhand, so target it.', s, 'en').includes('generalized_single_note'));
  n = 0;
  const [me] = G.opponentFacts([M(['yorick'], 'I struggle to keep up with his pace.')], names);
  assert.equal(me.plan_type, 'none');
  assert.deepEqual(G.finalizeOpponents([{ player_id: 'yorick', plan: 'Slow the pace down with high clears.' }], [me], 'en')[0].dropped.at(-1), 'nothing_to_build_a_plan_on');
});

test('doubles: each sentence goes to the opponent it names, never to both', () => {
  n = 0;
  const f = Object.fromEntries(G.opponentFacts([
    M(['yang', 'yorick'], 'Yang blocks everything at the net. Yorick smashes fast but not very powerful.'),
    M(['yang', 'stefan'], 'Stefan后场反手容易失误。Yang防守很强。'),
    M(['yorick', 'stefan'], 'They rotate well.')
  ], names).map(o => [o.player_id, o]));
  assert.deepEqual(f.yang.notes, ['Yang防守很强', 'Yang blocks everything at the net']);
  assert.deepEqual(f.yorick.notes, ['Yorick smashes fast but not very powerful']);
  assert.deepEqual(f.stefan.notes, ['Stefan后场反手容易失误']);
  assert.deepEqual([f.yorick.evidence.weakness.length, f.stefan.evidence.weakness.length, f.yang.evidence.weakness.length], [1, 1, 0]);
});
