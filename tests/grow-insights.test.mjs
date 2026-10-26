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

test('regression: "fewer net errors lately" [1,1,1,0,1,0] is never a Comparison, and fewer cost notes alone are not an improvement', () => {
  // Han, 2026-10-25: self-reported tag occurrence is a Match Strip, never a Comparison Chart.
  // Han, 2026-10-26: a cost tag the player stopped picking is an absence of notes, not proof the problem went away,
  // so this row on its own gives no Key Insight at all (and the tile says there is not enough evidence).
  fresh();
  const ms = tagRow('Net', [1, 1, 1, 0, 1, 0]);
  const all = G.keyCandidates(ms, null, { all: true });
  assert.equal(all.find(x => x.tag === 'Net'), undefined);
  assert.ok(!all.some(x => x.pattern === 'compare'));
  for (const lang of BOTH) assert.deepEqual(G.finalizeKey(G.keyCandidates(ms), null, lang), { status: 'insufficient', reason: 'no_candidate' });
  // When the same skill starts being noted as working, that is positive evidence: an emerging "what worked" strip.
  fresh();
  // Net noted as costing points in the first 2 matches, then as working in each of the last 3.
  const turn = [1, 1, 0, 0, 0, 0].map((v, i) => M(W, v ? ['Net'] : ['Other'], i >= 3 ? ['Net'] : []));
  const c = G.keyCandidates(turn).find(x => x.tag === 'Net');
  assert.ok(c, 'a Net candidate');
  assert.equal(c.pattern, 'strip'); assert.equal(c.side, 'worked'); assert.equal(c.shape, 'emerging'); assert.ok(c.turnaround);
  assert.deepEqual(c.chart.values, [0, 0, 0, 1, 1, 1]);
  for (const lang of BOTH) { const k = G.finalizeKey([c], null, lang); copyOk(k, lang); assert.equal(k.chart.pattern, 'strip'); }
  assert.equal(G.finalizeKey([c], null, 'en').title, 'Net play is starting to pay off');
  assert.equal(G.finalizeKey([c], null, 'zh').title, '网前开始帮你得分了');
  // One side per skill: Net is now a strength (3 of 6 against 2 of 6), so it is not in Build Next as well.
  assert.equal(G.buildCandidates(turn).find(x => x.tag === 'Net'), undefined);
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
  assert.equal(en.title, 'Your scores are on the rise');
  assert.equal(en.body, 'On average, from losing by 4.5 to winning by 2.5 points a game.');
  assert.equal(zh.body, '最近6场，你平均每局从输4.5分变成了赢2.5分。');
});

test('trend: noisy margins (no clear direction) give no trend', () => {
  fresh();
  const ms = [M([[21, 15]]), M([[15, 21]]), M([[21, 12]]), M([[12, 21]]), M([[21, 16]]), M([[16, 21]])];
  assert.equal(G.keyCandidates(ms).find(x => x.id === 'trend:margin'), undefined);
});

test('compare: games won, last 3 vs the 3 before; bars are games won per match and totals match the copy', () => {
  fresh();
  const ms = [M(L), M([[21, 18], [15, 21], [17, 21]]), M(L), M(W), M([[21, 18], [18, 21], [21, 17]]), M(W)];
  const c = G.keyCandidates(ms, null, { all: true }).find(x => x.id === 'compare:games_won');
  assert.ok(c);
  assert.equal(c.pattern, 'compare');
  assert.deepEqual(c.chart.values, [0, 1, 0, 2, 2, 2]);
  assert.equal(c.chart.split, 3);
  assert.deepEqual(c.numbers, { r: 6, rn: 7, p: 1, pn: 7 });
  const en = G.finalizeKey([c], null, 'en');
  copyOk(en, 'en');
  assert.equal(en.body, 'You won 6 of 7 games in your last 3, after 1 of 7 before.');
  const zh = G.finalizeKey([c], null, 'zh');
  copyOk(zh, 'zh');
  assert.equal(zh.body, '最近3场打了7局赢了6局，之前3场7局只赢了1局。');
  // Games won is form the Performance tab already shows: a modest change is below the quality bar on its own.
  assert.ok(c.quality < 0.4 ? !G.keyCandidates(ms).includes(c) : true);
});

test('strip: recurring cost tag (4 of 6, 2 of the last 3)', () => {
  fresh();
  const c = G.keyCandidates(tagRow('Serve', [1, 0, 1, 1, 0, 1])).find(x => x.tag === 'Serve');
  assert.equal(c.shape, 'recurring'); assert.equal(c.pattern, 'strip');
  const en = G.finalizeKey([c], null, 'en'), zh = G.finalizeKey([c], null, 'zh');
  copyOk(en, 'en'); copyOk(zh, 'zh');
  assert.equal(en.title, 'Serve is still costing you points');
  assert.equal(en.body, 'You noted it in 4 of your last 6 matches, 2 of the last 3.');
  assert.equal(zh.title, '发球还在让你丢分');
  assert.equal(zh.body, '最近6场有4场你记下发球丢分，最近3场有2场。');
  assert.equal(c.linked, false);
});

test('strip: noted 4 of 6 but not lately is neither "recurring" nor an improvement', () => {
  fresh();
  assert.equal(G.keyCandidates(tagRow('Serve', [1, 1, 1, 1, 0, 0]), null, { all: true }).find(x => x.tag === 'Serve'), undefined);
});

test('strip: a cost tag that lines up with the losses is "linked"; the chart shows each result, the copy never says it caused them', () => {
  fresh();
  // Serve noted in 5 of 6; the 4 losses all have it, the only match without it was a win.
  const res = [L, L, W, L, W, L], row = [1, 1, 0, 1, 1, 1];
  const ms = row.map((v, i) => M(res[i], v ? ['Serve'] : ['Other']));
  const c = G.keyCandidates(ms).find(x => x.tag === 'Serve');
  assert.ok(c.linked); assert.equal(c.strength, 'strong');
  assert.equal(c.numbers.l, 4); assert.equal(c.numbers.lt, 4);
  assert.deepEqual(c.chart.results, ['L', 'L', 'W', 'L', 'W', 'L']);
  const en = G.finalizeKey([c], null, 'en'), zh = G.finalizeKey([c], null, 'zh');
  copyOk(en, 'en'); copyOk(zh, 'zh');
  assert.equal(en.title, 'Serve shows up in your losses');
  assert.equal(en.body, 'You noted it in all 4 losses in your last 6 matches.');
  assert.equal(zh.body, '最近6场输了4场，其中每场你都记下了发球丢分。');
  assert.deepEqual(en.chart.xLabels, ['L', 'L', 'W', 'L', 'W', 'L']);
  assert.deepEqual(zh.chart.xLabels, ['负', '负', '胜', '负', '胜', '负']);
  // It outranks the same tag without the link.
  fresh();
  const plain = G.keyCandidates(row.map(v => M(W, v ? ['Serve'] : ['Other']))).find(x => x.tag === 'Serve');
  assert.ok(c.quality > plain.quality);
  // Tagged in every match: nothing to compare against, so not linked.
  fresh();
  assert.equal(G.keyCandidates([L, L, W, L, W, L].map(g => M(g, ['Serve']))).find(x => x.tag === 'Serve').linked, false);
  // Still the existing Match Strip: same pattern, same 0/1 values, only the labels under the matches change.
  assert.equal(en.pattern, 'strip'); assert.deepEqual(en.chart.values, row);
});

test('linked strip (Han conditions): only recorded results, unknown never guessed, association not cause', () => {
  // A match with no recorded result (no games, level games, or unscored ties) is unknown: "·", out of the rates.
  fresh();
  const games = [L, L, W, L, [], L], row = [1, 1, 0, 1, 1, 1];
  const c = G.keyCandidates(games.map((g, i) => M(g, row[i] ? ['Serve'] : ['Other']))).find(x => x.tag === 'Serve');
  assert.ok(c.linked);
  assert.deepEqual(c.chart.results, ['L', 'L', 'W', 'L', '', 'L']);
  assert.deepEqual(G.finalizeKey([c], null, 'en').chart.xLabels, ['L', 'L', 'W', 'L', '·', 'L']);
  assert.deepEqual(G.finalizeKey([c], null, 'zh').chart.xLabels, ['负', '负', '胜', '负', '·', '负']);
  assert.equal(c.numbers.l, 4); assert.equal(c.numbers.lt, 4);
  // Level games (1-1) and voice results { r } are read as recorded, never guessed.
  assert.equal(G.matchResult({ games: [[21, 17], [17, 21]] }), 'even');
  assert.equal(G.matchResult({ games: [{ r: 'L' }] }), 'loss');
  assert.equal(G.matchResult({ games: [[21, 21]] }), null);
  fresh();
  const voice = [[{ r: 'L' }], [{ r: 'L' }], [{ r: 'W' }], [{ r: 'L' }], [{ r: 'W' }], [{ r: 'L' }]].map((g, i) => M(g, row[i] ? ['Serve'] : ['Other']));
  assert.deepEqual(G.keyCandidates(voice).find(x => x.tag === 'Serve').chart.results, ['L', 'L', 'W', 'L', 'W', 'L']);
  // Fewer than 4 recorded results in the 6: not linked (no W/L labels).
  fresh();
  const few = [L, [], W, [[21, 17], [17, 21]], [], L].map((g, i) => M(g, row[i] ? ['Serve'] : ['Other']));
  const cf = G.keyCandidates(few, null, { all: true }).find(x => x.tag === 'Serve');
  assert.equal(cf.linked, false); assert.equal(cf.chart.results, undefined);
  assert.equal(G.finalizeKey([cf], null, 'en').chart.xLabels, undefined);
  // Only recorded losses count: two unknown matches with the tag leave 2 recorded losses, too few to link.
  fresh();
  const mixed = [[], [], W, L, W, L].map((g, i) => M(g, [1, 1, 0, 1, 1, 1][i] ? ['Serve'] : ['Other']));
  assert.equal(G.keyCandidates(mixed, null, { all: true }).find(x => x.tag === 'Serve').linked, false);
  // Copy: association yes, cause no, in both languages; templates pass.
  for (const lang of BOTH) assert.deepEqual(G.checkCopy(G.keyTemplate(c, lang), c, lang), []);
  for (const [t, b, lang] of [
    ['Serve is costing you matches', 'You noted it in all 4 losses in your last 6 matches.', 'en'],
    ['Serve shows up in your losses', 'You noted it in all 4 losses, so it caused them.', 'en'],
    ['Serve shows up in your losses', 'You lost because of it: noted in all 4 losses in your last 6 matches.', 'en'],
    ['发球导致你输球', '最近6场输了4场，其中每场你都记下了发球丢分。', 'zh'],
    ['输球时常有发球问题', '最近6场输了4场，都是因为你记下的发球丢分。', 'zh'],
    ['你输在发球上', '最近6场输了4场，其中每场你都记下了发球丢分。', 'zh']
  ]) assert.ok(G.checkCopy({ title: t, body: b }, c, lang).includes('causal_claim'), `${t} / ${b}`);
  const ok = { title: 'Serve shows up when you lose', body: 'You noted it in all 4 losses in your last 6 matches.' };
  assert.deepEqual(G.checkCopy(ok, c, 'en'), []);
});

test('strip: emerging cost tag', () => {
  fresh();
  const c = G.keyCandidates(tagRow('Footwork', [0, 0, 0, 1, 1, 1])).find(x => x.tag === 'Footwork');
  assert.equal(c.shape, 'emerging'); assert.equal(c.strength, 'strong');
  for (const lang of BOTH) copyOk(G.finalizeKey([c], null, lang), lang);
  assert.equal(G.finalizeKey([c], null, 'en').title, 'Footwork has started to cost you');
  assert.equal(G.finalizeKey([c], null, 'en').body, 'You noted it in 3 of your last 3, none in the 3 before.');
  assert.equal(G.finalizeKey([c], null, 'zh').body, '最近3场有3场你记下步法丢分，之前3场都没有。');
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
  const ms = [M(W, ['Other']), M(W, ['Other']), M(W), M(W, ['Other']), M(W, ['Net']), M(W), M(W, ['Net']), M(W, ['Net'])];
  const c = G.keyCandidates(ms).find(x => x.tag === 'Net');
  assert.ok(c);
  assert.deepEqual(c.chart.values, [0, 0, 0, 1, 1, 1]);
  assert.equal(c.evidence.window.skipped, 2);
  assert.equal(c.match_ids.length, 6);
  const en = G.finalizeKey([c], null, 'en'), zh = G.finalizeKey([c], null, 'zh');
  copyOk(en, 'en'); copyOk(zh, 'zh');
  assert.match(en.body, /the last 3 with notes/);
  assert.match(zh.body, /最近有记录的3场/);
  // Matches without notes in between are not read as "Net didn't cost points".
  fresh();
  assert.equal(G.keyCandidates([M(W, ['Net']), M(W, ['Net']), M(W, ['Net']), M(W), M(W), M(W), M(W, ['Other']), M(W, ['Net'])], null, { all: true }).length, 0);
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
  const ms = [M([[15, 21]], ['Other']), M([[17, 21]], ['Other']), M([[19, 21]], ['Other']), M([[21, 19]], ['Serve']), M([[21, 17]], ['Serve']), M([[21, 15]], ['Serve'])];
  const a = G.keyCandidates(ms).map(c => c.id), b = G.keyCandidates(ms).map(c => c.id);
  assert.deepEqual(a, b);
  assert.ok(a.includes('trend:margin') && a.includes('strip:cost:Serve:emerging'), String(a));
  const again = G.keyCandidates(ms, a[0]);
  assert.notEqual(again[0].id, a[0], 'the same insight as last time drops below a different one');
  // ...but it is still shown when it is the only one worth showing (quality ignores the repeat discount).
  fresh();
  const one = tagRow('Footwork', [0, 0, 0, 1, 1, 1]), id = G.keyCandidates(one)[0].id;
  fresh();
  assert.equal(G.keyCandidates(tagRow('Footwork', [0, 0, 0, 1, 1, 1]), id)[0].id, id);
});

test('quality bar: weak candidates are dropped and the tile says there is not enough evidence', () => {
  fresh();
  // "What worked" noted in 4 of 6: a frequency, already on Strengths; below the bar on its own.
  const ms = [1, 0, 1, 1, 0, 1].map(v => M(W, ['Other'], v ? ['Smash'] : []));
  const all = G.keyCandidates(ms, null, { all: true }), shown = G.keyCandidates(ms);
  assert.ok(all.some(c => c.tag === 'Smash') && all.every(c => c.quality < G.KEY_MIN_QUALITY));
  assert.equal(shown.length, 0);
  for (const lang of BOTH) assert.equal(G.finalizeKey(shown, null, lang).status, 'insufficient');
  // Missing data: no matches, matches without scores or notes.
  assert.equal(G.keyCandidates([]).length, 0);
  fresh(); assert.equal(G.keyCandidates([M([]), M([]), M([]), M([]), M([]), M([])]).length, 0);
  assert.deepEqual(G.buildCandidates([]), []); assert.deepEqual(G.strengthCandidates([]), []);
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
  const c = G.keyCandidates([M([[21, 15]]), M([[21, 16]]), M([[21, 18]]), M([[19, 21]]), M([[17, 21]]), M([[15, 21]])]).find(x => x.id === 'trend:margin');
  assert.equal(c.direction, 'down');
  assert.deepEqual(G.checkCopy(G.keyTemplate(c, 'en'), c, 'en'), []);
  assert.ok(G.checkCopy({ title: 'Your scores keep climbing', body: 'On average, from winning by 6 to losing by 6 points a game.' }, c, 'en').includes('direction'));
});

test('validator: comparison copy must name both groups', () => {
  fresh();
  const c = G.keyCandidates([M(L), M([[21, 18], [15, 21], [17, 21]]), M(L), M(W), M([[21, 18], [18, 21], [21, 17]]), M(W)]).find(x => x.pattern === 'compare');
  assert.ok(G.checkCopy({ title: "You're winning more games lately", body: 'You won 6 of 7 games lately.' }, c, 'en').includes('window'));
});

test('good AI copy is kept as written when its details come from the notes; invented details fall back', () => {
  fresh();
  const notes = ['', 'short serves kept going into the net', '', '', '', 'short serve too high again'];
  const ms = [1, 0, 1, 1, 0, 1].map((v, i) => M(W, v ? ['Serve'] : ['Other'], [], { lost: v ? notes[i] || 'short serves again' : '' }));
  const c = G.keyCandidates(ms).find(x => x.tag === 'Serve');
  const ai = { candidate_id: c.id, title: 'Short serves are still costing you', body: 'You noted short serves costing points in 4 of your last 6.' };
  const k = G.finalizeKey([c], ai, 'en');
  assert.equal(k.copy_source, 'ai'); assert.equal(k.body, ai.body);
  assert.equal(G.finalizeKey([c], { candidate_id: c.id, title: '发小球还在让你丢分', body: '最近6场有4场你记下发小球丢分，最近3场有两场。' }, 'zh').copy_source, 'ai');
  // The same copy without such notes invents the detail.
  const bare = serveCand();
  const k2 = G.finalizeKey([bare], { ...ai, candidate_id: bare.id }, 'en');
  assert.equal(k2.copy_source, 'template'); assert.ok(k2.validation.ai_issues.includes('detail_not_in_notes'));
  assert.ok(G.checkCopy({ title: '反手后场还在让你丢分', body: '最近6场有4场你记下发球丢分。' }, bare, 'zh').includes('detail_not_in_notes'));
});

test('natural copy (Han): mechanical and database wording is rejected in both languages', () => {
  const c = serveCand();
  for (const [t, b, lang] of [
    ['Net play is coming up less', 'You noted it in 4 of your last 6 matches.', 'en'],
    ['Serve keeps coming up', 'Tagged in 4 of your last 6 matches.', 'en'],
    ['Serve', 'You noted it in 4/6 matches.', 'en'],
    ['网前丢分提及减少', '最近6场有4场你记下发球丢分。', 'zh'],
    ['最近提到网前丢分少了', '最近6场有4场你记下发球丢分。', 'zh'],
    ['发球问题', '有标签的比赛里，最近6场有4场你提到发球。', 'zh'],
    ['杀球问题', '你提到杀球问题，4/6场。', 'zh']
  ]) assert.ok(G.checkCopy({ title: t, body: b }, c, lang).includes('banned_phrase'), `${t} / ${b}`);
  // No template uses them either (every shape is checked in the next test).
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
  const rows = { recurring: [1, 0, 1, 1, 0, 1], recurring5: [1, 1, 0, 1, 1, 1], fading: [1, 1, 1, 0, 1, 0], fading0: [1, 1, 0, 0, 0, 0], emerging: [0, 1, 0, 1, 1, 1], emerging0: [0, 0, 0, 1, 1, 0] };
  for (const tag of G.SKILL_TAGS) for (const [name, row] of Object.entries(rows)) for (const side of ['cost', 'worked']) for (const lost of [false, true]) {
    fresh();
    const ms = row.map((v, i) => M(lost && i % 2 ? L : W, side === 'cost' ? (v ? [tag] : ['Other']) : ['Other'], side === 'worked' && v ? [tag] : []));
    const c = G.keyCandidates(ms, null, { all: true }).find(x => x.tag === tag && x.side === side);
    if (!c) { assert.ok(name.startsWith('fading'), `${tag} ${side} ${name}`); continue; }
    for (const lang of BOTH) {
      const k = G.finalizeKey([c], null, lang);
      assert.deepEqual(k.validation.issues, [], `${tag} ${side} ${name} ${lang}: ${k.title} / ${k.body}`);
      assert.ok(G.lineCount(k.title, 17) <= 2 && G.lineCount(k.body, 14) <= 3, `${k.title} / ${k.body}`);
    }
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

test('Build Next / Strengths copy: AI kept when clean, template when it invents numbers, details or the wrong language', () => {
  const ms = buildFixture();
  ms[0].lost = 'backhand defence late on smashes'; ms[2].lost = 'backhand side again, racket down';
  const [d] = G.buildCandidates(ms);
  assert.equal(d.basis, 'notes');
  const good = { topic_id: d.topic_id, name: 'Backhand defence', evidence: 'You noted defence costing points in 5 of your last 6 matches.', action: 'Keep your racket up on the backhand side.' };
  const [a] = G.finalizeItems([d], [good], 'build', 'en');
  assert.equal(a.copy_source, 'ai'); assert.equal(a.name, 'Backhand defence'); assert.equal(a.topic_id, 'tag:Defence'); assert.equal(a.advice_basis, 'notes');
  const [b] = G.finalizeItems([d], [{ ...good, evidence: 'You lost 62% of defensive rallies.' }], 'build', 'en');
  assert.equal(b.evidence, 'You noted it costing you points in 5 of your last 6 matches.');
  const [z] = G.finalizeItems([d], [{ ...good, name: '反手防守', evidence: '最近6场有5场你记下防守丢分。', action: '反手防守时拍子举高一点。' }], 'build', 'zh');
  assert.equal(z.copy_source, 'ai');
  const [zbad] = G.finalizeItems([d], [good], 'build', 'zh');
  assert.equal(zbad.name, '防守'); assert.equal(zbad.evidence, '最近6场比赛中，有5场你提到防守的问题。'); assert.equal(zbad.action, '通用练法：让搭档连续进攻，你专心把每一拍接回去。');
  const s = G.strengthCandidates(ms);
  assert.deepEqual(s.map(x => x.topic_id), ['tag:Placement']);
  assert.equal(G.finalizeItems(s, null, 'strength', 'zh')[0].signal, '最近6场比赛中，有6场你觉得落点发挥不错。');
});

test('generic notes: general advice, clearly labelled, and no invented cause or technique', () => {
  const ms = buildFixture();
  ms[0].lost = 'bad day'; ms[1].lost = 'defence'; // generic
  const [d] = G.buildCandidates(ms);
  assert.equal(d.tag, 'Defence'); assert.equal(d.basis, 'general');
  const invented = { topic_id: d.topic_id, name: 'Backhand defence', evidence: 'You noted defence costing points because your grip is too tight.', action: 'Loosen your grip on the backhand side.' };
  for (const lang of BOTH) {
    const [x] = G.finalizeItems([d], [lang === 'en' ? invented : { topic_id: d.topic_id, name: '反手防守', evidence: '你记下防守丢分，是因为握拍太紧。', action: '反手握拍放松一点。' }], 'build', lang);
    assert.equal(x.name, lang === 'en' ? 'Defence' : '防守');
    assert.ok(x.issues.some(i => /detail_not_in_notes|invented_cause/.test(i)), String(x.issues));
    assert.equal(x.advice_basis, 'general');
    assert.match(x.action, lang === 'en' ? /^General drill: / : /^通用练法：/);
  }
  // A plain, honest AI item is kept, but the action is still the general drill.
  const [ok] = G.finalizeItems([d], [{ topic_id: d.topic_id, name: 'Defence', evidence: 'You noted defence costing you points in 5 of your last 6 matches.', action: 'Work on your defence.' }], 'build', 'en');
  assert.equal(ok.name, 'Defence'); assert.equal(ok.copy_source, 'ai'); assert.match(ok.action, /^General drill: /);
  for (const lang of BOTH) for (const t of G.SKILL_TAGS) assert.ok(G.generalAction(t, 'build', lang) && !G.conceptsIn(G.generalAction(t, 'build', lang)).length, t);
});

test('one side per skill: Build Next and Strengths never share a topic; the stronger finding over all 6 wins', () => {
  fresh();
  // Net cost in 4 of 6 and worked in 2 other matches: Net stays in Build Next.
  const ms = [['Net'], ['Net'], [], ['Net'], ['Net'], []].map((lt, i) => M(W, lt.length ? lt : ['Other'], i === 2 || i === 5 ? ['Net'] : []));
  assert.equal(G.topicSides(ms).Net, 'cost');
  const build = G.buildCandidates(ms), str = G.strengthCandidates(ms);
  assert.ok(build.some(x => x.topic_id === 'tag:Net'));
  assert.ok(!str.some(x => x.topic_id === 'tag:Net'));
  const ids = new Set(build.map(x => x.topic_id));
  assert.ok(str.every(x => !ids.has(x.topic_id)));
  // The Key Insight follows the same side.
  assert.ok(G.keyCandidates(ms, null, { all: true }).filter(c => c.tag === 'Net').every(c => c.side === 'cost'));
  // A tie (3 and 3) goes to the side noted more in the last 3.
  fresh();
  const tie = [[], [], [], ['Net'], ['Net'], ['Net']].map((lt, i) => M(W, lt.length ? lt : ['Other'], i < 3 ? ['Net'] : []));
  assert.equal(G.topicSides(tie).Net, 'cost');
});

test('regression (Han, v7 screenshot): a 4/6 strength is not wiped out by a more recent 2/6 cost, in both languages', () => {
  fresh();
  // Smash noted as working in 4 of 6, as costing points in 2 of 6 (both in the last 3).
  const ms = [M(W, ['Other'], ['Smash']), M(W, ['Other'], ['Smash']), M(L, ['Other'], ['Smash']), M(L, ['Smash'], [], { lost: 'backcourt smashes got blocked' }), M(W, ['Other'], ['Smash']), M(L, ['Smash'], [])];
  assert.equal(G.topicSides(ms).Smash, 'worked');
  assert.deepEqual(G.strengthCandidates(ms).map(x => `${x.tag} ${x.k}/${x.n}`), ['Smash 4/6']);
  assert.equal(G.buildCandidates(ms).find(x => x.tag === 'Smash'), undefined, 'no contradictory Build Next');
  assert.ok(G.keyCandidates(ms, null, { all: true }).every(c => c.tag !== 'Smash' || c.side === 'worked'));
  const s = G.strengthCandidates(ms);
  assert.equal(G.finalizeItems(s, null, 'strength', 'en')[0].signal, 'You noted smash working well in 4 of your last 6 matches.');
  assert.equal(G.finalizeItems(s, null, 'strength', 'zh')[0].signal, '最近6场比赛中，有4场你觉得杀球发挥不错。');
});

test('Build Next actions (Han): no tactical correction from tags or a single note; only from a pattern in the notes', () => {
  const ms = () => { fresh(); return [M(L, ['Smash']), M(W, ['Other']), M(L, ['Other']), M(W, ['Other']), M(L, ['Smash']), M(W, ['Other'])]; };
  const ai = { en: { name: 'Backcourt smashes', evidence: 'You noted smashes in 2 of 6 matches.', action: 'Use fewer backcourt smashes; try high clears to corners.' },
    zh: { name: '后场杀球', evidence: '最近6场有2场你记下杀球丢分。', action: '少打后场杀球，多打对角高远球。' } };
  // 1. Tags only, no notes: plain name, general drill.
  // 2. One specific note: still not a pattern.
  // 3. Two notes about backcourt smashes: the topic is grounded, but "try high clears" adds a shot the notes don't name.
  for (const [label, notes] of [['tags only', ['', '']], ['one note', ['后场杀球被对手挡回来', '']], ['two notes', ['backcourt smashes got blocked', '后场杀球又被挡回来']]]) {
    const xs = ms(); xs[0].lost = notes[0]; xs[4].lost = notes[1];
    const [d] = G.buildCandidates(xs);
    assert.equal(d.tag, 'Smash'); assert.equal(d.basis, label === 'two notes' ? 'notes' : 'general', label);
    for (const lang of BOTH) {
      const [x] = G.finalizeItems([d], [{ topic_id: d.topic_id, ...ai[lang] }], 'build', lang);
      assert.equal(x.advice_basis, 'general', `${label} ${lang}`);
      assert.match(x.action, lang === 'en' ? /^General drill: / : /^通用练法：/);
      if (label !== 'two notes') assert.equal(x.name, lang === 'en' ? 'Smash' : '杀球', `${label} ${lang}: ${x.name}`);
      else assert.equal(x.name, ai[lang].name);
    }
  }
  // An action that builds on what the two notes say is kept.
  const xs = ms(); xs[0].lost = 'backcourt smashes got blocked, I was off balance'; xs[4].lost = '后场杀球又被挡回来，重心不稳';
  const [d] = G.buildCandidates(xs);
  const [en] = G.finalizeItems([d], [{ topic_id: d.topic_id, name: 'Backcourt smashes', evidence: 'You noted smash costing you points in 2 of your last 6 matches.', action: 'Only smash from the back court when you are balanced.' }], 'build', 'en');
  assert.equal(en.advice_basis, 'notes', String(en.issues)); assert.equal(en.action, 'Only smash from the back court when you are balanced.');
  const [zh] = G.finalizeItems([d], [{ topic_id: d.topic_id, name: '后场杀球', evidence: '最近6场有2场你记下杀球丢分。', action: '后场杀球前先站稳重心。' }], 'build', 'zh');
  assert.equal(zh.advice_basis, 'notes', String(zh.issues));
  // ...but not one that isn't about the notes at all.
  const [off] = G.finalizeItems([d], [{ topic_id: d.topic_id, name: 'Smash', evidence: 'You noted smash costing you points in 2 of your last 6 matches.', action: 'Work on your wrist strength in the gym.' }], 'build', 'en');
  assert.equal(off.advice_basis, 'general'); assert.ok(off.issues.some(i => /^action:/.test(i)), String(off.issues));
});

test('engine version is bumped so cached v7 insights regenerate', () => {
  assert.equal(G.ENGINE_VERSION, '2026-10-26-v9');
});

test('opponent plans: only from notes about that opponent; record-only, unsupported or generic plans are left out', () => {
  fresh();
  const ms = [
    M(L, ['Other'], [], { opps: ['alex'] }), M(L, ['Other'], [], { opps: ['alex'] }), M(L, ['Other'], [], { opps: ['alex'] }),
    M(W, ['Other'], [], { opps: ['ben'], opp_notes: 'Ben lifts a lot to my backhand rear court' }),
    M(W, ['Other'], [], { opps: ['ben'], opp_notes: '他反手后场比较弱' }),
    M(W, ['Other'], [], { opps: ['unknown:Chris'], opp_notes: 'fast smashes' })
  ].reverse();
  const opps = G.opponentFacts(ms, { alex: 'Alex', ben: 'Ben' });
  assert.deepEqual(opps.map(o => o.player_id), ['ben']); // Alex has a record but no notes; unknown:Chris is nobody
  assert.ok(!('record' in opps[0]));
  const plans = G.finalizeOpponents([
    { player_id: 'ben', plan: 'Ben: Be ready for lifts to your backhand rear court and take them early.' },
    { player_id: 'alex', plan: 'Alex struggles with your pace, so attack his backhand.' }
  ], opps, 'en');
  assert.deepEqual(plans, [{ player_id: 'ben', plan: 'Be ready for lifts to your backhand rear court and take them early.' }]);
  const bad = (plan, lang = 'en') => G.finalizeOpponents([{ player_id: 'ben', plan }], opps, lang)[0].dropped || [];
  assert.ok(bad('Stay patient and play your own game.').includes('not_from_notes'));
  assert.ok(bad('Attack his forehand with drop shots.').includes('detail_not_in_notes'));
  assert.ok(bad("You've lost twice to him, so slow the game down.").includes('record_inference'));
  assert.ok(bad('Go to his backhand rear court 3 times a rally.').includes('number_not_in_evidence'));
  assert.deepEqual(G.finalizeOpponents([{ player_id: 'ben', plan: '多打他的反手后场，逼他回球。' }], opps, 'zh')[0].plan, '多打他的反手后场，逼他回球。');
  assert.ok(bad('他输给你两次，说明心态不稳，多打快球。', 'zh').length);
  assert.ok(bad('Ben lifts to your backhand.', 'zh').includes('language'));
  // The schema only lets the model name opponents that have notes (none: no plans at all).
  const sch = G.modelSchema([], [], [], ['ben']).properties.opponentPlans;
  assert.deepEqual(sch.items.properties.player_id.enum, ['ben']);
  assert.equal(G.modelSchema([], [], [], []).properties.opponentPlans.maxItems, 0);
});

test('doubles play: only from 3+ doubles matches with notes, and only what the notes say', () => {
  fresh();
  const few = [M(W, ['Net'], [], { type: 'Doubles', lost: 'side by side too often' }), M(W, ['Other'], [], { type: 'Doubles' })];
  assert.equal(G.doublesFacts(few), null);
  assert.deepEqual(G.finalizeDoubles([{ name: 'Rotation', pattern: 'You stay side by side.', label: 'Try Next', action: 'Rotate earlier.' }], null, 'en'), []);
  fresh();
  const ms = [0, 1, 2, 3].map(i => M(W, ['Net'], [], { type: 'Doubles', lost: i % 2 ? 'we stayed side by side after attacking' : 'side-by-side gaps in the middle' }));
  const f = G.doublesFacts(ms);
  assert.equal(f.matches, 4);
  const out = G.finalizeDoubles([
    { name: 'Side-by-side gaps', pattern: 'You noted staying side by side after attacking.', label: 'Try Next', action: 'Switch to front and back after you attack.' },
    { name: 'Rotation', pattern: 'Your partner is too slow to cover the rear court.', label: 'Try Next', action: 'Cover more.' }
  ], f, 'en');
  assert.equal(out.length, 1); assert.equal(out[0].name, 'Side-by-side gaps');
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
  fresh(); show('serve in losses', [1, 1, 0, 1, 1, 1].map((v, i) => M([L, L, W, L, W, L][i], v ? ['Serve'] : ['Other'])));
  fresh(); show('recurring serve', tagRow('Serve', [1, 0, 1, 1, 0, 1]));
  fresh(); show('margin trend', [M([[15, 21], [18, 21]]), M([[17, 21], [19, 21]]), M([[19, 21], [21, 19], [18, 21]]), M([[21, 19], [19, 21]]), M([[21, 18], [20, 22]]), M([[21, 18], [21, 19]])]);
  fresh(); show('games won', [M(L), M([[21, 18], [15, 21], [17, 21]]), M(L), M(W), M([[21, 18], [18, 21], [21, 17]]), M(W)]);
  fresh(); show('three matches', [M(W, ['Net']), M(L, ['Net']), M(W, ['Net'])]);
  if (process.env.SHOW) console.log(out.join('\n'));
  assert.equal(out.length, 12);
});

test('regression: AI evidence must state both occurrences and window, EN/ZH', () => {
  const item = {topic_id:'tag:Smash',tag:'Smash',k:2,n:6,basis:'general',notes:[]};
  for (const lang of BOTH) {
    const name = lang === 'zh' ? '杀球' : 'Smash';
    const evidence = lang === 'zh' ? '你在6场比赛中提到杀球问题。' : 'You noted smashes in 6 matches.';
    const bad = G.checkItem({name,evidence,action:''},item,'build',lang);
    assert(bad.includes('evidence:missing_evidence_count'),lang + ': ' + bad);
    const result = G.finalizeItems([item],[{topic_id:item.topic_id,name,evidence,action:''}],'build',lang);
    assert.match(result[0].evidence,/2/);
    assert.match(result[0].evidence,/6/);
    assert.notEqual(result[0].evidence,evidence);
  }
});
