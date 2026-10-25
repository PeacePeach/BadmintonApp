// Growth Insights Engine V2: candidates, chart data, ranking, validation and bilingual copy
// (supabase/functions/_shared/grow-insights-core.js). No network, no AI.
//   node --test tests/grow-insights.test.mjs
// Each fixture is a list of matches, oldest first, in the shape of the matches table.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../supabase/functions/_shared/grow-insights-core.js';

let seq = 0;
// M(games, lt, wt): one match a day apart. games: [[21,15],[18,21]] or [{ r: 'W' }].
function day(i) { return new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10); }
const M = (games, lt = [], wt = [], extra = {}) => { const i = seq++; return { id: 'm' + i, date: day(i), created_at: day(i) + 'T12:00:00Z', type: 'Singles', partner: null, opps: [], games, lt, wt, worked: '', lost: '', opp_notes: '', ...extra }; };
const fresh = () => { seq = 0; };
const W = [[21, 17], [21, 18]], L = [[17, 21], [18, 21]];
// Tag rows: 1 = noted under What Cost Points.
const tagRow = (tag, row, games = W) => row.map(v => M(games, v ? [tag] : ['Other']));

const BOTH = ['en', 'zh'];
const copyOk = (k, lang) => { assert.equal(k.status, 'ok'); assert.deepEqual(k.validation.issues, [], `${lang}: ${k.validation.issues}`); };

// ---- Chart selection follows the evidence ----

test('regression: "fewer net errors lately" [1,1,1,0,1,0] is a Match Strip, never a Comparison', () => {
  fresh();
  const ms = tagRow('Net', [1, 1, 1, 0, 1, 0]);
  const c = G.keyCandidates(ms).find(x => x.tag === 'Net');
  assert.ok(c, 'a Net candidate');
  assert.equal(c.pattern, 'strip');
  assert.equal(c.shape, 'fading');
  assert.deepEqual(c.chart.values, [1, 1, 1, 0, 1, 0]);
  assert.equal(c.source, 'notes_tags');
  for (const lang of BOTH) {
    const k = G.finalizeKey([c], null, lang);
    copyOk(k, lang);
    assert.equal(k.chart.pattern, 'strip');
  }
  const en = G.finalizeKey([c], null, 'en');
  assert.equal(en.title, 'Net play is coming up less');
  assert.equal(en.body, 'Noted as costing points in 1 of your last 3 matches, down from 3.');
  assert.doesNotMatch(en.title + en.body, /improv|better|mistakes? (dropped|fell)/i);
  const zh = G.finalizeKey([c], null, 'zh');
  assert.match(zh.body, /最近3场只有1场提到网前丢分/);
  assert.match(zh.body, /之前3场每场都提到了/);
});

test('trend: average point margin per game, quoted first and latest values', () => {
  fresh();
  const ms = [M([[15, 21], [18, 21]]), M([[17, 21], [19, 21]]), M([[19, 21], [21, 19], [18, 21]]), M([[21, 19], [19, 21]]), M([[21, 18], [20, 22]]), M([[21, 18], [21, 19]])];
  const c = G.keyCandidates(ms).find(x => x.id === 'trend:margin');
  assert.ok(c);
  assert.equal(c.pattern, 'trend');
  assert.deepEqual(c.chart.values, [-4.5, -3, -1, 0, 0.5, 2.5]);
  assert.deepEqual(c.chart.quote, [0, 5]);
  assert.equal(c.strength, 'strong');
  const en = G.finalizeKey([c], null, 'en'), zh = G.finalizeKey([c], null, 'zh');
  copyOk(en, 'en'); copyOk(zh, 'zh');
  assert.equal(en.body, 'From -4.5 to +2.5 points per game over your last 6 matches.');
  assert.equal(zh.body, '最近6场，你每局的平均分差从-4.5分变成了+2.5分。');
});

test('trend: noisy margins (no clear direction) give no trend', () => {
  fresh();
  const ms = [M([[21, 15]]), M([[15, 21]]), M([[21, 12]]), M([[12, 21]]), M([[21, 16]]), M([[16, 21]])];
  assert.equal(G.keyCandidates(ms).find(x => x.id === 'trend:margin'), undefined);
});

test('compare: games won, last 3 vs the 3 before; bars are games won per match and totals match the copy', () => {
  fresh();
  const ms = [M(L), M([[21, 18], [15, 21], [17, 21]]), M(L), M(W), M([[21, 18], [18, 21], [21, 17]]), M(W)];
  const c = G.keyCandidates(ms).find(x => x.id === 'compare:games_won');
  assert.ok(c);
  assert.equal(c.pattern, 'compare');
  assert.deepEqual(c.chart.values, [0, 1, 0, 2, 2, 2]);
  assert.equal(c.chart.split, 3);
  assert.deepEqual(c.numbers, { r: 6, rn: 7, p: 1, pn: 7 });
  const en = G.finalizeKey([c], null, 'en');
  copyOk(en, 'en');
  assert.equal(en.body, 'You won 6 of 7 games in your last 3 matches, up from 1 of 7.');
  const zh = G.finalizeKey([c], null, 'zh');
  copyOk(zh, 'zh');
  assert.equal(zh.body, '最近3场打了7局赢了6局，之前3场7局赢了1局。');
});

test('strip: recurring cost tag (4 of 6, 2 of the last 3)', () => {
  fresh();
  const c = G.keyCandidates(tagRow('Serve', [1, 0, 1, 1, 0, 1])).find(x => x.tag === 'Serve');
  assert.equal(c.shape, 'recurring'); assert.equal(c.pattern, 'strip');
  const en = G.finalizeKey([c], null, 'en'), zh = G.finalizeKey([c], null, 'zh');
  copyOk(en, 'en'); copyOk(zh, 'zh');
  assert.equal(en.title, 'Serve keeps coming up');
  assert.equal(en.body, 'Noted as costing points in 4 of your last 6 matches.');
  assert.equal(zh.title, '发球问题这几场反复出现');
  assert.equal(zh.body, '最近6场里有4场你提到发球丢分，最近3场就有2场。');
});

test('strip: noted 4 of 6 but not lately is not "recurring"', () => {
  fresh();
  const cs = G.keyCandidates(tagRow('Serve', [1, 1, 1, 1, 0, 0]));
  const c = cs.find(x => x.tag === 'Serve');
  assert.equal(c.shape, 'fading');
});

test('strip: emerging cost tag', () => {
  fresh();
  const c = G.keyCandidates(tagRow('Footwork', [0, 0, 0, 1, 1, 1])).find(x => x.tag === 'Footwork');
  assert.equal(c.shape, 'emerging'); assert.equal(c.strength, 'strong');
  for (const lang of BOTH) copyOk(G.finalizeKey([c], null, lang), lang);
  assert.equal(G.finalizeKey([c], null, 'en').body, 'Noted as costing points in 3 of your last 3 matches, up from none.');
});

test('weak evidence: one match of difference is not an insight', () => {
  fresh();
  const cs = G.keyCandidates(tagRow('Defence', [1, 1, 0, 1, 0, 0]));
  assert.equal(cs.find(x => x.tag === 'Defence'), undefined);
});

test('insufficient evidence: few matches give no Key Insight', () => {
  fresh();
  const ms = [M(W, ['Net']), M(L, ['Net']), M(W, ['Net'])];
  const cs = G.keyCandidates(ms);
  assert.equal(cs.length, 0);
  assert.deepEqual(G.finalizeKey(cs, null, 'en'), { status: 'insufficient', reason: 'no_candidate' });
});

test('missing notes are skipped, never counted as "not noted"; the copy says "noted matches"', () => {
  fresh();
  const ms = [M(W, ['Net']), M(W, ['Net']), M(W), M(W, ['Net']), M(W, ['Other']), M(W), M(W, ['Other']), M(W, ['Other'])];
  const c = G.keyCandidates(ms).find(x => x.tag === 'Net');
  assert.ok(c);
  assert.deepEqual(c.chart.values, [1, 1, 1, 0, 0, 0]);
  assert.equal(c.evidence.window.skipped, 2);
  assert.equal(c.match_ids.length, 6);
  const en = G.finalizeKey([c], null, 'en'), zh = G.finalizeKey([c], null, 'zh');
  copyOk(en, 'en'); copyOk(zh, 'zh');
  assert.match(en.body, /the last 3 with notes/);
  assert.match(zh.body, /最近有记录的3场/);
});

test('contradictory observations: a tag noted on both sides of the same matches is not used', () => {
  fresh();
  const ms = [1, 1, 1, 0, 1, 1].map(v => M(W, v ? ['Net'] : ['Other'], v ? ['Net'] : []));
  assert.equal(G.keyCandidates(ms).find(x => x.tag === 'Net'), undefined);
  assert.equal(G.buildCandidates(ms).find(x => x.tag === 'Net'), undefined);
});

test('voice games without scores ({ r }) count as results, not losses, and stay out of the margin trend', () => {
  assert.equal(G.matchResult({ games: [{ r: 'W' }, { r: 'W' }] }), 'win');
  assert.equal(G.matchResult({ games: [{ r: 'W' }, { r: 'L' }] }), 'even');
  fresh();
  const ms = [M([{ r: 'W' }]), M([[15, 21]]), M([[17, 21]]), M([[19, 21]]), M([[21, 19]]), M([[21, 17]]), M([[21, 15]])];
  const c = G.keyCandidates(ms).find(x => x.id === 'trend:margin');
  assert.deepEqual(c.chart.values, [-6, -4, -2, 2, 4, 6]);
});

test('competing candidates: ranked deterministically; objective evidence first on a tie; repeat loses to a new pattern', () => {
  fresh();
  const ms = [M([[15, 21]], ['Serve']), M([[17, 21]], ['Serve']), M([[19, 21]], ['Serve']), M([[21, 19]], ['Other']), M([[21, 17]], ['Serve']), M([[21, 15]], ['Other'])];
  const a = G.keyCandidates(ms).map(c => c.id), b = G.keyCandidates(ms).map(c => c.id);
  assert.deepEqual(a, b);
  assert.ok(a.includes('trend:margin') && a.includes('strip:cost:Serve:fading'));
  const again = G.keyCandidates(ms, a[0]);
  assert.notEqual(again[0].id, a[0], 'the same insight as last time drops below a different one');
});

// ---- Validation catches bad AI copy ----

function serveCand() { fresh(); return G.keyCandidates(tagRow('Serve', [1, 0, 1, 1, 0, 1])).find(x => x.tag === 'Serve'); }
const issuesOf = (title, body, lang = 'en', c = serveCand()) => G.checkCopy({ title, body }, c, lang);

test('validator: fabricated statistics are rejected and replaced by the template', () => {
  assert.ok(issuesOf('Your serve is getting better', 'Serve points won rose from 42% to 64% over your last 6 matches.').includes('number_not_in_evidence'));
  const c = serveCand();
  const k = G.finalizeKey([c], { candidate_id: c.id, title: 'Serve errors keep showing up', body: 'You made serve errors in 4 of your last 6 matches, 8 in total.' }, 'en');
  assert.equal(k.copy_source, 'template');
  assert.ok(k.validation.ai_issues.includes('number_not_in_evidence'));
  copyOk(k, 'en');
});

test('validator: notes evidence must read as self-reported, never as measured', () => {
  assert.ok(issuesOf('Serve keeps costing points', 'Your serve cost you points in 4 of your last 6 matches.').includes('not_marked_self_reported'));
  assert.ok(issuesOf('你的发球在进步', '最近6场里有4场你提到发球丢分，最近3场有2场。', 'zh').includes('measured_claim_from_notes'));
  assert.ok(issuesOf('发球得分率下降', '最近6场里有4场提到发球，得分率不高。', 'zh').includes('measured_claim_from_notes'));
});

test('validator: mechanical windows, wrong language, missing numbers, overlong copy', () => {
  assert.ok(issuesOf('Serve keeps coming up', 'You noted serve in matches 1–3 and 4–6: 4 of 6.').includes('banned_phrase'));
  assert.ok(issuesOf('发球问题反复出现', '第1至第3场与第4至第6场之间，你提到发球丢分4场。', 'zh').includes('banned_phrase'));
  assert.ok(issuesOf('Serve keeps coming up', '最近6场里有4场你提到发球丢分。').includes('language'));
  assert.ok(issuesOf('Serve keeps coming up', 'You noted your serve costing points lately.').includes('number_missing'));
  assert.ok(issuesOf('Serve keeps coming up', 'You noted your serve costing you points in 4 of your last 6 matches, including 2 of the last 3, which is something to look at when you train next week with your partner.').includes('body_length'));
});

test('validator: direction must match the evidence', () => {
  fresh();
  const c = G.keyCandidates(tagRow('Net', [1, 1, 1, 0, 1, 0])).find(x => x.tag === 'Net');
  assert.deepEqual(G.checkCopy({ title: 'Net play is coming up less', body: 'You noted it in 1 of your last 3 matches, down from all 3.' }, c, 'en'), []);
  assert.ok(G.checkCopy({ title: 'Net play keeps coming up more', body: 'You noted net play costing points again in 1 of your last 3 matches and all 3 before that.' }, c, 'en').includes('direction'));
});

test('validator: comparison copy must name both groups', () => {
  fresh();
  const c = G.keyCandidates([M(L), M([[21, 18], [15, 21], [17, 21]]), M(L), M(W), M([[21, 18], [18, 21], [21, 17]]), M(W)]).find(x => x.pattern === 'compare');
  assert.ok(G.checkCopy({ title: "You're winning more games lately", body: 'You won 6 of 7 games lately.' }, c, 'en').includes('window'));
});

test('good AI copy is kept as written (with a detail from the notes)', () => {
  const c = serveCand();
  const ai = { candidate_id: c.id, title: 'Short serves keep coming up', body: 'You noted short serves costing points in 4 of your last 6.' };
  const k = G.finalizeKey([c], ai, 'en');
  assert.equal(k.copy_source, 'ai'); assert.equal(k.body, ai.body);
  const zc = serveCand(), zai = { candidate_id: zc.id, title: '发小球问题反复出现', body: '最近6场有4场你提到发小球丢分，最近3场就有两场。' };
  assert.equal(G.finalizeKey([zc], zai, 'zh').copy_source, 'ai');
});

test('fit (Han): title at most 2 lines, body at most 3 in the 6:4 tile; longer AI copy falls back to the template', () => {
  const c = serveCand();
  const long = { candidate_id: c.id, title: 'Your serve keeps costing you points in close matches', body: 'You noted your serve costing you points in 4 of your last 6 matches, including 2 of the last 3.' };
  const iss = G.checkCopy(long, c, 'en');
  assert.ok(iss.includes('title_length') && iss.includes('body_length'), String(iss));
  const k = G.finalizeKey([c], long, 'en');
  assert.equal(k.copy_source, 'template');
  assert.ok(G.lineCount(k.title, 17) <= 2 && G.lineCount(k.body, 14) <= 3);
  assert.ok(G.checkCopy({ title: '发球问题这几场一直反复出现，最近三场都没有什么改善', body: '最近6场里有4场你提到发球丢分。' }, c, 'zh').includes('title_length'));
  assert.ok(G.checkCopy({ title: '发球问题反复出现', body: '最近6场里有4场你提到发球丢分，最近3场有2场，发小球和发高远球都有，接下来练球时可以多注意一下发球的节奏。' }, c, 'zh').includes('body_length'));
});

test('every template passes its own checks, in both languages, for every shape', () => {
  const rows = { recurring: [1, 0, 1, 1, 0, 1], fading: [1, 1, 1, 0, 1, 0], fading0: [1, 1, 0, 0, 0, 0], emerging: [0, 1, 0, 1, 1, 1], emerging0: [0, 0, 0, 1, 1, 0] };
  for (const tag of G.SKILL_TAGS) for (const [name, row] of Object.entries(rows)) for (const side of ['cost', 'worked']) {
    fresh();
    const ms = row.map(v => M(W, side === 'cost' ? (v ? [tag] : ['Other']) : ['Other'], side === 'worked' && v ? [tag] : []));
    const c = G.keyCandidates(ms).find(x => x.tag === tag && x.side === side);
    if (!c) { assert.ok(side === 'worked' && name.startsWith('fading'), `${tag} ${side} ${name}`); continue; }
    for (const lang of BOTH) { const k = G.finalizeKey([c], null, lang); assert.deepEqual(k.validation.issues, [], `${tag} ${side} ${name} ${lang}: ${k.title} / ${k.body}`); }
  }
});

// ---- Build Next, Strengths and Focus ----

function buildFixture() {
  fresh();
  // Defence 5/6, Footwork 4/6, Serve 3/6, Net 2/6, Smash 1/6.
  const rows = [['Defence', 'Footwork', 'Serve'], ['Defence', 'Net'], ['Defence', 'Footwork'], ['Footwork', 'Serve', 'Smash'], ['Defence', 'Net'], ['Defence', 'Footwork', 'Serve']];
  return rows.map(lt => M(L, lt, ['Placement']));
}

test('Build Next: up to 4 ranked suggestions, each with a stable topic id', () => {
  const b = G.buildCandidates(buildFixture());
  assert.deepEqual(b.map(x => x.topic_id), ['tag:Defence', 'tag:Footwork', 'tag:Serve', 'tag:Net']);
  assert.deepEqual(b.map(x => x.k), [5, 4, 3, 2]);
});

test('Build Next: an active Focus topic is left out (by stored topic_id or by title in either language)', () => {
  const ms = buildFixture();
  assert.ok(!G.buildCandidates(ms, [{ topic: 'tag:Defence', status: 'active' }]).some(x => x.tag === 'Defence'));
  assert.equal(G.focusTopic({ title: '防守' }), 'tag:Defence');
  assert.equal(G.focusTopic({ title: 'Defence' }), 'tag:Defence');
  assert.equal(G.focusTopic({ title: 'Backhand defence', topic_id: 'tag:Defence' }), 'tag:Defence');
});

test('existing Focus without topic_id: matched through the Grow item it was added from, else its title', () => {
  const prev = { buildNext: [{ topic_id: 'tag:Defence', name: 'Backhand defence' }] };
  assert.equal(G.focusTopic({ title: 'Backhand Defence' }, prev), 'tag:Defence');
  assert.equal(G.focusTopic({ title: 'Lift higher' }, prev), 'text:lifthigher');
  assert.equal(G.focusTopic({ title: 'Lift higher' }), 'text:lifthigher');
});

test('completed Focus comes back only with new evidence since completion', () => {
  const ms = buildFixture();
  const doneAt = ms[2].created_at; // completed after the 3rd match: 3 matches with notes since
  // Since then Defence noted in matches 5 and 6 (2 of 3): new evidence.
  const back = G.buildCandidates(ms, [{ topic: 'tag:Defence', status: 'completed', completed_at: doneAt }]).find(x => x.tag === 'Defence');
  assert.ok(back); assert.equal(back.returning, true); assert.deepEqual([back.k, back.n], [2, 3]);
  // Completed after the 4th match: only 2 matches since, not enough.
  assert.equal(G.buildCandidates(ms, [{ topic: 'tag:Defence', status: 'completed', completed_at: ms[3].created_at }]).find(x => x.tag === 'Defence'), undefined);
  // Smash: completed early, noted once since: not enough.
  assert.equal(G.buildCandidates(ms, [{ topic: 'tag:Smash', status: 'completed', completed_at: ms[0].created_at }]).find(x => x.tag === 'Smash'), undefined);
  for (const lang of BOTH) { const [it] = G.finalizeItems([back], null, 'build', lang); assert.deepEqual(G.checkItem(it, back, 'build', lang), [], lang); }
});

test('Build Next / Strengths copy: AI kept when clean, template when it invents numbers or the wrong language', () => {
  const [d] = G.buildCandidates(buildFixture());
  const good = { topic_id: d.topic_id, name: 'Backhand defence', evidence: 'You noted defence costing points in 5 of your last 6 matches.', action: 'Keep your racket up in fast exchanges.' };
  const [a] = G.finalizeItems([d], [good], 'build', 'en');
  assert.equal(a.copy_source, 'ai'); assert.equal(a.name, 'Backhand defence'); assert.equal(a.topic_id, 'tag:Defence');
  const [b] = G.finalizeItems([d], [{ ...good, evidence: 'You lost 62% of defensive rallies.' }], 'build', 'en');
  assert.equal(b.evidence, 'Noted as costing you points in 5 of your last 6 matches.');
  const [z] = G.finalizeItems([d], [{ ...good, name: '反手防守', evidence: '最近6场有5场你提到防守丢分。', action: '平抽挡时拍子举高一点。' }], 'build', 'zh');
  assert.equal(z.copy_source, 'ai');
  const [zbad] = G.finalizeItems([d], [good], 'build', 'zh');
  assert.equal(zbad.name, '防守'); assert.equal(zbad.evidence, '最近6场里有5场提到这里丢分。'); assert.equal(zbad.action, '');
  const s = G.strengthCandidates(buildFixture());
  assert.deepEqual(s.map(x => x.topic_id), ['tag:Placement']);
  assert.equal(G.finalizeItems(s, null, 'strength', 'zh')[0].signal, '最近6场里有6场提到这里帮你得分。');
});

test('model schema only allows the candidates that exist', () => {
  const sc = G.modelSchema(['trend:margin'], ['tag:Defence'], []);
  assert.deepEqual(sc.properties.keyInsight.anyOf[1].properties.candidate_id.enum, ['trend:margin']);
  assert.equal(sc.properties.buildNext.maxItems, 4);
  assert.deepEqual(sc.properties.strengths.items.properties.topic_id.enum, ['none']);
});

// ---- Representative outputs (printed for the report) ----
test('print representative outputs', () => {
  const out = [];
  const show = (label, ms) => { const [c] = G.keyCandidates(ms); for (const lang of BOTH) { const k = G.finalizeKey(c ? [c] : [], null, lang); out.push(`${label} [${lang}] ${k.status === 'ok' ? `${k.pattern} ${JSON.stringify(k.chart.values)} | ${k.title} | ${k.body}` : 'insufficient'}`); } };
  fresh(); show('fewer net errors', tagRow('Net', [1, 1, 1, 0, 1, 0]));
  fresh(); show('recurring serve', tagRow('Serve', [1, 0, 1, 1, 0, 1]));
  fresh(); show('margin trend', [M([[15, 21], [18, 21]]), M([[17, 21], [19, 21]]), M([[19, 21], [21, 19], [18, 21]]), M([[21, 19], [19, 21]]), M([[21, 18], [20, 22]]), M([[21, 18], [21, 19]])]);
  fresh(); show('games won', [M(L), M([[21, 18], [15, 21], [17, 21]]), M(L), M(W), M([[21, 18], [18, 21], [21, 17]]), M(W)]);
  fresh(); show('three matches', [M(W, ['Net']), M(L, ['Net']), M(W, ['Net'])]);
  if (process.env.SHOW) console.log(out.join('\n'));
  assert.equal(out.length, 10);
});
