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
const H = await import('./fixtures/han-shape.mjs');
const copyOk = (k, lang) => { assert.equal(k.status, 'ok'); assert.deepEqual(k.validation.issues, [], `${lang}: ${k.validation.issues}`); };

// ---- Chart selection follows the evidence ----

// Han, 2026-10-26 (real Supabase row): "Footwork keeps costing you points", 3 of 12, was served with pattern "text"
// and chart null, so the tile was text only. v17: a repeated pattern carries the evidence itself as a frequency strip.
const FOOTWORK_3_OF_12 = [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
test('regression: Footwork noted in 3 of 12 matches gets a frequency strip of exactly those matches, in EN and ZH', () => {
  fresh();
  const ms = tagRow('Footwork', FOOTWORK_3_OF_12);
  for (const lang of BOTH) {
    const k = G.finalizeKey(G.keyCandidates(ms), null, lang, ms);
    assert.deepEqual([k.status, k.tier, k.candidate_id, k.pattern], ['ok', 2, 'pattern:cost:Footwork', 'frequency']);
    assert.deepEqual(k.evidence.numbers, { k: 3, n: 12 });
    // The chart is the evidence, not a drawing: one pill per match in the window, raised where Footwork was noted.
    assert.deepEqual(k.chart, { pattern: 'strip', values: FOOTWORK_3_OF_12, unit: '', frequency: true });
    assert.equal(k.chart.values.length, k.evidence.numbers.n);
    assert.equal(k.chart.values.reduce((a, b) => a + b, 0), k.evidence.numbers.k);
    assert.ok(!('split' in k.chart) && !('xLabels' in k.chart) && !('results' in k.chart), 'no trend split, axis or W/L');
    assert.deepEqual(G.numbersIn(k.body).sort((a, b) => a - b), [3, 12], k.body);
    assert.deepEqual(k.validation.issues, []);
  }
  assert.equal(G.finalizeKey(G.keyCandidates(ms), null, 'en', ms).title, 'Footwork keeps costing you points');
  assert.equal(G.finalizeKey(G.keyCandidates(ms), null, 'zh', ms).title, '步法还在反复丢分');
});

test('frequency strips: model copy that reads a trend into 3 of 12 is rejected; the evidence copy passes', () => {
  fresh();
  const ms = tagRow('Footwork', FOOTWORK_3_OF_12);
  const c = G.keyCandidates(ms).find(x => x.id === 'pattern:cost:Footwork');
  for (const [lang, title, body] of [
    ['en', 'Footwork is getting worse', 'You noted it in 3 of your last 12 matches.'],
    ['en', 'Footwork keeps costing you points', 'You noted it more often lately: 3 of your last 12 matches.'],
    ['zh', '步法问题越来越多', '最近12场里有3场你记下步法丢分。'],
    ['zh', '步法还在反复丢分', '最近12场里有3场你记下步法丢分，比之前多了。']
  ]) assert.ok(G.checkCopy({ title, body }, c, lang).includes('trend_from_frequency'), `${title} / ${body}`);
  assert.deepEqual(G.checkCopy({ title: 'Footwork keeps costing you points', body: 'You noted it in 3 of your last 12 matches.' }, c, 'en'), []);
  assert.deepEqual(G.checkCopy({ title: '步法还在反复丢分', body: '最近12场里有3场你记下步法丢分。' }, c, 'zh'), []);
  const ai = G.finalizeKey([c], { candidate_id: c.id, title: 'Footwork is getting worse', body: 'You noted it in 3 of your last 12 matches.' }, 'en');
  assert.equal(ai.copy_source, 'template');
  assert.deepEqual(ai.chart.values, FOOTWORK_3_OF_12, 'the chart never depends on the copy');
});

test('frequency strips: every repeated-pattern window gets one, its templates pass, and nothing else invents a chart', () => {
  for (const side of ['cost', 'worked']) for (let n = 6; n <= 12; n++) for (let k = 2; k <= n; k++) {
    fresh();
    const row = Array.from({ length: n }, (_, i) => (i % Math.ceil(n / k) === 0 && i / Math.ceil(n / k) < k ? 1 : 0));
    const ms = row.map(v => M(W, side === 'cost' && v ? ['Footwork'] : ['Other'], side === 'worked' && v ? ['Footwork'] : []));
    const c = G.keyCandidates(ms, null, { all: true }).find(x => x.id === `pattern:${side}:Footwork`);
    if (!c) continue;
    assert.equal(c.chart.values.length, c.numbers.n);
    assert.equal(c.chart.values.reduce((a, b) => a + b, 0), c.numbers.k);
    for (const lang of BOTH) assert.deepEqual(G.checkCopy(G.keyTemplate(c, lang), c, lang), [], `${side} ${k}/${n} ${lang}`);
  }
  // One note is an early read: no denominator worth drawing, so no chart.
  fresh();
  const one = [M(W, ['Footwork']), ...Array.from({ length: 5 }, () => M(W, ['Other']))];
  for (const x of G.keyCandidates(one, null, { all: true }).filter(x => x.family === 'early' || x.family === 'opponent')) assert.equal(x.chart ?? null, null, x.id);
});

test('regression: "fewer net errors lately" [1,1,1,0,1,0] is never a Comparison, and fewer cost notes alone are not an improvement', () => {
  // Han, 2026-10-25: self-reported tag occurrence is a Match Strip, never a Comparison Chart.
  // Han, 2026-10-26: a cost tag the player stopped picking is an absence of notes, not proof the problem went away,
  // so this row on its own gives no Key Insight at all (and the tile says there is not enough evidence).
  fresh();
  const ms = tagRow('Net', [1, 1, 1, 0, 1, 0]);
  const all = G.keyCandidates(ms, null, { all: true });
  assert.equal(all.find(x => x.family === 'tag' && x.tag === 'Net'), undefined, 'no strip');
  assert.ok(!all.some(x => x.pattern === 'compare'));
  // Engine v14: what it does show is the repeated cost (noted in 4 of 6), never an improvement.
  for (const lang of BOTH) {
    const k = G.finalizeKey(G.keyCandidates(ms), null, lang, ms);
    // v17: its chart is the frequency strip of the window (4 of 6 raised), not a comparison or a trend.
    assert.deepEqual([k.status, k.tier, k.candidate_id, k.pattern, k.chart], ['ok', 2, 'pattern:cost:Net', 'frequency', { pattern: 'strip', values: [1, 1, 1, 0, 1, 0], unit: '', frequency: true }]);
    assert.doesNotMatch(k.title + k.body, /less|fewer|improv|better|lately|少了|进步|改善|减少/, k.title);
    assert.deepEqual(k.validation.issues, []);
  }
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
  assert.equal(G.keyCandidates(tagRow('Serve', [1, 1, 1, 1, 0, 0]), null, { all: true }).find(x => x.family === 'tag' && x.tag === 'Serve'), undefined);
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
  assert.equal(cs.find(x => x.family === 'tag' && x.tag === 'Defence'), undefined, 'no strip: not a change');
  assert.equal(cs[0].id, 'pattern:cost:Defence', 'but a repeated pattern (3 of 6)');
});

test('few matches: no trend or strip from 3 matches, but a skill noted in all 3 is a repeated pattern; nothing noted is insufficient', () => {
  fresh();
  const ms = [M(W, ['Net']), M(L, ['Net']), M(W, ['Net'])];
  const cs = G.keyCandidates(ms);
  assert.ok(!cs.some(c => c.tier === 1 || c.family === 'tag'));
  assert.deepEqual(cs.map(c => [c.id, c.tier, c.numbers.k, c.numbers.n]), [['pattern:cost:Net', 2, 3, 3]]);
  const k = G.finalizeKey(cs, null, 'en', ms);
  assert.deepEqual([k.title, k.body], ['Net play keeps costing you points', 'You noted it in 3 of your last 3 matches.']);
  fresh();
  const none = [M(W, ['Other']), M(L, ['Other']), M(W, ['Other'])];
  assert.deepEqual(G.finalizeKey(G.keyCandidates(none), null, 'en', none).status, 'insufficient');
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
  assert.equal(G.keyCandidates([M(W, ['Net']), M(W, ['Net']), M(W, ['Net']), M(W), M(W), M(W), M(W, ['Other']), M(W, ['Net'])], null, { all: true }).filter(c => c.family === 'tag').length, 0);
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
  // Engine v14: a measured trend (tier 1) always leads; the same insight as last time drops below another of its tier only.
  assert.deepEqual(a.slice(0, 2), ['trend:margin', 'strip:cost:Serve:emerging']);
  assert.equal(G.keyCandidates(ms, a[0])[0].id, 'trend:margin');
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
  assert.ok(all.some(c => c.family === 'tag' && c.tag === 'Smash') && all.filter(c => c.family === 'tag').every(c => c.quality < G.KEY_MIN_QUALITY));
  assert.ok(!shown.some(c => c.family === 'tag'), 'the strip is under the bar');
  // ...but the repeated strength itself (the one on Strengths) is the Key Insight, not "not enough data".
  for (const lang of BOTH) assert.equal(G.finalizeKey(shown, null, lang, ms).candidate_id, 'pattern:worked:Smash');
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
    const c = G.keyCandidates(ms, null, { all: true }).find(x => x.family === 'tag' && x.tag === tag && x.side === side);
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
  // A tie is mixed: never a strength, never hidden. It is in Build Next and its evidence gives both counts.
  fresh();
  const tie = [[], [], [], ['Net'], ['Net'], ['Net']].map((lt, i) => M(W, lt.length ? lt : ['Other'], i < 3 ? ['Net'] : []));
  assert.equal(G.topicSides(tie).Net, 'mixed');
  assert.equal(G.strengthCandidates(tie).some(x => x.tag === 'Net'), false);
  const [net] = G.buildCandidates(tie);
  assert.deepEqual([net.tag, net.k, net.w, net.n, net.mixed], ['Net', 3, 3, 6, true]);
  assert.ok(G.keyCandidates(tie, null, { all: true }).every(c => c.tag !== 'Net' || c.family === 'mixed'), 'no strip or pattern for a mixed skill, only a mixed signal');
  const en = G.finalizeItems([net], [{ topic_id: 'tag:Net', name: 'Net play', evidence: 'You noted net play costing you points in 3 of your last 6 matches.', action: '' }], 'build', 'en')[0];
  assert.equal(en.evidence, 'You noted it costing points in 3 of your last 6 matches, and working in 3.');
  assert.equal(en.name, 'Net play'); assert.equal(en.mixed, true);
  assert.equal(G.finalizeItems([net], null, 'build', 'zh')[0].evidence, '最近6场里，3场你记下它丢分，3场记下它打得好。');
  for (const lang of BOTH) assert.deepEqual(G.checkItem(G.itemTemplate(net, 'build', lang), net, 'build', lang), [], lang);
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

test('engine version is bumped so cached v12 insights regenerate', () => {
  assert.equal(G.ENGINE_VERSION, '2026-10-26-v17');
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
    { player_id: 'ben', plan: 'Ben: Attack his backhand rear court and take his lifts early.' },
    { player_id: 'alex', plan: 'Alex struggles with your pace, so attack his backhand.' }
  ], opps, 'en');
  // v15: built on a noted weakness (他反手后场比较弱), not yet tried: labelled "Try".
  assert.deepEqual(plans, [{ player_id: 'ben', plan: 'Try: Attack his backhand rear court and take his lifts early.', level: 'repeated', plan_type: 'suggested', copy_source: 'ai' }]);
  const bad = (plan, lang = 'en') => G.checkPlan(plan, opps[0], lang);
  assert.ok(bad('Stay patient and play your own game.').includes('not_from_notes'));
  assert.ok(bad('Attack his forehand with drop shots.').includes('detail_not_in_notes'));
  assert.ok(bad("You've lost twice to him, so slow the game down.").includes('record_inference'));
  assert.ok(bad('Go to his backhand rear court 3 times a rally.').includes('number_not_in_evidence'));
  assert.deepEqual(G.finalizeOpponents([{ player_id: 'ben', plan: '多打他的反手后场，逼他回球。' }], opps, 'zh')[0].plan, '可以试试：多打他的反手后场，逼他回球。');
  // A plan that fails its checks falls back to the player's own note about the weakness, never to invented advice.
  const [fb] = G.finalizeOpponents([{ player_id: 'ben', plan: 'Stay patient and play your own game.' }], opps, 'en');
  assert.equal(fb.copy_source, 'note'); assert.equal(fb.plan, 'Try: you noted “他反手后场比较弱”. Make it your first target.');
  assert.ok(bad('他输给你两次，说明心态不稳，多打快球。', 'zh').length);
  assert.ok(bad('Ben lifts to your backhand.', 'zh').includes('language'));
  // The schema only lets the model name opponents that have notes (none: no plans at all).
  const sch = G.modelSchema([], [], [], ['ben']).properties.opponentPlans;
  assert.deepEqual(sch.items.properties.player_id.enum, ['ben']);
  assert.equal(G.modelSchema([], [], [], []).properties.opponentPlans.maxItems, 0);
});

test('opponent notes: each note goes to the opponent it names; one note is an early read, never a habit', () => {
  fresh();
  const names = { mei: 'Mei', ravi: 'Ravi', leo: 'Leo', jo: 'Jo' };
  const ms = [
    M(W, ['Other'], [], { type: 'Doubles', opps: ['mei', 'ravi'], opp_notes: 'Mei 杀球很重' }),
    M(W, ['Other'], [], { type: 'Doubles', opps: ['mei', 'ravi'], opp_notes: 'Ravi likes to attack from the rear court. Mei stays at the net.' }),
    M(W, ['Other'], [], { type: 'Doubles', opps: ['mei', 'jo'], opp_notes: 'they serve short a lot' }),
    M(W, ['Other'], [], { opps: ['leo'], opp_notes: '反手比较弱' })
  ];
  const diag = { matches_with_notes: 0, unknown_opponent: 0, names_no_opponent: 0 };
  const opps = G.opponentFacts(ms, names, diag);
  const by = Object.fromEntries(opps.map(o => [o.player_id, o]));
  assert.deepEqual(by.mei.notes, ['Mei stays at the net', 'Mei 杀球很重']); assert.equal(by.mei.level, 'repeated');
  assert.deepEqual(by.ravi.notes, ['Ravi likes to attack from the rear court']); assert.equal(by.ravi.level, 'single');
  assert.deepEqual(by.leo.notes, ['反手比较弱'], 'a singles note naming nobody is about the one opponent');
  assert.ok(!by.jo, 'a doubles note naming neither opponent is about the pair, not about Jo');
  assert.deepEqual(diag, { matches_with_notes: 4, unknown_opponent: 0, names_no_opponent: 1 });
  // Chinese note, English plan: anchored through the shared badminton term, labelled as an early read.
  const [leo] = G.finalizeOpponents([{ player_id: 'leo', plan: "Test Leo's backhand early in the first game." }], [by.leo], 'en');
  assert.deepEqual([leo.copy_source, leo.plan], ['ai', "Early read: Test Leo's backhand early in the first game."], 'a noted weakness may be tested (Han: Stefan)');
  assert.ok(G.checkPlan('He always struggles on the backhand, so target it.', by.leo, 'en').includes('generalized_single_note'));
  assert.ok(G.checkPlan('他每次反手都很弱，多打反手。', by.leo, 'zh').includes('generalized_single_note'));
  const [zh] = G.finalizeOpponents([{ player_id: 'leo', plan: '开局先试探他的反手。' }], [by.leo], 'zh');
  assert.equal(zh.plan, '初步判断：开局先试探他的反手。');
  // No model copy at all: the note itself, labelled, in the app language.
  assert.equal(G.finalizeOpponents([], [by.leo], 'zh')[0].plan, '初步判断：你记下“反手比较弱”。开局就针对这一点。');
  assert.equal(G.finalizeOpponents([], [by.leo], 'en')[0].plan, 'Early read: you noted “反手比较弱”. Make it your first target.');
  // v15: a note that only says how they play gives no card without a real plan for it.
  assert.deepEqual(G.finalizeOpponents([], [by.ravi], 'en')[0].dropped, ['no_ai_copy', 'no_actionable_plan']);
  // At most 3 cards.
  fresh();
  const many = ['a', 'b', 'c', 'd'].map(id => M(W, ['Other'], [], { opps: [id], opp_notes: 'weak backhand in the rear court' }));
  const pl = G.finalizeOpponents([], G.opponentFacts(many, { a: 'A', b: 'B', c: 'C', d: 'D' }), 'en');
  assert.equal(pl.filter(p => !p.dropped).length, 3);
});

test('doubles play: from 1 noted doubles match up (labelled early), patterns only from 2+, and only what the notes say', () => {
  fresh();
  assert.equal(G.doublesFacts([M(W, [], [], { type: 'Doubles' }), M(W, ['Net'])]), null, 'no doubles match with notes');
  assert.deepEqual(G.finalizeDoubles([{ name: 'Rotation', pattern: 'You stay side by side.', label: 'Try Next', action: 'Rotate earlier.' }], null, 'en'), []);
  fresh();
  const few = [M(W, ['Net'], [], { type: 'Doubles', lost: 'side by side too often at the net' }), M(W, [], [], { type: 'Doubles' })];
  const ef = G.doublesFacts(few);
  assert.deepEqual([ef.noted, ef.repeated], [1, []]);
  const [e] = G.finalizeDoubles([{ name: 'Side by side', pattern: 'You noted staying side by side at the net.', label: 'Try Next', action: 'Try front and back after you attack.' }], ef, 'en');
  assert.deepEqual([e.level, e.pattern], ['early', 'Early observation: You noted staying side by side at the net.']);
  assert.deepEqual(G.finalizeDoubles([{ name: 'Side by side', pattern: 'You always stay side by side at the net.', label: 'Try Next', action: 'Rotate.' }], ef, 'en')[0].copy_source, 'template', 'one match is never "always"');
  const [t] = G.finalizeDoubles([], ef, 'zh');
  assert.deepEqual([t.name, t.pattern, t.label], ['网前', '初步观察：1场有记录的双打里，有1场你记下网前丢分。', 'Try Next']);
  fresh();
  const ms = [0, 1, 2, 3].map(i => M(W, ['Net'], [], { type: 'Doubles', lost: i % 2 ? 'we stayed side by side after attacking' : 'side-by-side gaps in the middle' }));
  const f = G.doublesFacts(ms);
  assert.equal(f.matches, 4);
  const out = G.finalizeDoubles([
    { name: 'Side-by-side gaps', pattern: 'You noted staying side by side after attacking.', label: 'Try Next', action: 'Switch to front and back after you attack.' },
    { name: 'Rotation', pattern: 'Your partner is too slow to cover the rear court.', label: 'Try Next', action: 'Cover more.' }
  ], f, 'en');
  assert.equal(out.length, 1); assert.equal(out[0].name, 'Side-by-side gaps'); assert.equal(out[0].level, 'pattern');
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
  const show = (label, ms) => { const [c] = G.keyCandidates(ms); for (const lang of BOTH) { const k = G.finalizeKey(c ? [c] : [], null, lang); out.push(`${label} [${lang}] ${k.status === 'ok' ? `${k.pattern} ${JSON.stringify(k.chart && k.chart.values)} | ${k.title} | ${k.body}` : 'insufficient'}`); } };
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

// Han's own records (the Chinese notes from his account, as in the v10/v11 fixtures): Net is an active Focus,
// Smash was noted working in the first 2 matches and costing points in 2 later ones.
const hanRecords = () => { fresh(); return [
  M(W, ['Net'], ['Smash'], { worked: '杀球靠边线效果很好' }), M(W, ['Net'], ['Smash']),
  M(L, ['Smash'], [], { lost: '后场杀球失误比较多' }),
  M(L, ['Return'], ['Serve'], { lost: '接发比较被动' }),
  M(L, ['Smash', 'Defence'], [], { lost: '杀球太多。反手防守比较弱。' }),
  M(L, ['Placement'], [], { lost: '网前吊球不好' })
]; };

test("Han's records: Smash first (mixed, both counts), one-note items only as labelled early ones, Key Insight from the results", () => {
  const ms = hanRecords(), focus = [{ topic: 'tag:Net', status: 'active' }];
  assert.equal(G.topicSides(ms).Smash, 'mixed');
  const build = G.buildCandidates(ms, focus, 4);
  assert.deepEqual(build.map(x => `${x.tag} ${x.k}/${x.n} w${x.w} ${x.level}`), ['Smash 2/6 w2 confirmed', 'Placement 1/6 w0 early', 'Defence 1/6 w0 early'],
    'Return, Defence and Placement were noted once each: at most 2 early items, newest first, after the confirmed one');
  assert.deepEqual(G.strengthCandidates(ms).map(x => `${x.tag} ${x.level}`), ['Serve early'], 'Serve was noted working once: emerging; Smash is mixed, not a strength');
  // Only Smash's own words: the Defence half of "杀球太多。反手防守比较弱。" is not Smash evidence.
  assert.deepEqual(build[0].notes, ['后场杀球失误比较多', '杀球太多']);
  for (const lang of BOTH) {
    const [b] = G.finalizeItems(build, null, 'build', lang);
    assert.equal(b.name, lang === 'zh' ? '杀球' : 'Smash');
    assert.match(b.evidence, lang === 'zh' ? /2场你记下它丢分，2场记下它打得好/ : /costing points in 2 of your last 6 matches, and working in 2/);
  }
  // "Backcourt smashes" as the item's name needs the back court in 2+ notes; here it is in 1.
  const [bad] = G.finalizeItems(build, [{ topic_id: 'tag:Smash', name: '后场杀球', evidence: 'x', action: '' }], 'build', 'zh');
  assert.equal(bad.name, '杀球'); assert.ok(bad.issues.includes('name:detail_not_repeated'), String(bad.issues));
  // Key Insight: games won fell from 4 of 6 to 0 of 6 (objective), so there is a real insight, not "not enough data".
  const key = G.finalizeKey(G.keyCandidates(ms), null, 'en', ms);
  assert.equal(key.status, 'ok'); assert.equal(key.pattern, key.candidate_id === 'trend:margin' ? 'trend' : 'compare');
  assert.equal(key.evidence.source, 'scores'); assert.deepEqual(key.validation.issues, []);
});

test('two notes about the same situation make a specific item; the name may say it', () => {
  fresh();
  const ms = [M(W, ['Other'], ['Net']), M(L, ['Smash'], [], { lost: '后场杀球失误比较多' }), M(W, ['Other'], ['Net']),
    M(L, ['Smash'], [], { lost: '后场杀球容易失误' }), M(W, ['Other']), M(L, ['Other'])];
  const [b] = G.buildCandidates(ms);
  assert.equal(b.basis, 'notes');
  const [zh] = G.finalizeItems([b], [{ topic_id: 'tag:Smash', name: '后场杀球', evidence: '最近6场有2场你记下后场杀球丢分。', action: '后场杀球前先调整好位置。' }], 'build', 'zh');
  assert.deepEqual(zh.issues, []); assert.equal(zh.name, '后场杀球'); assert.equal(zh.advice_basis, 'notes');
});

test('Build Next and Strengths read the same latest 12 noted matches; older evidence does not fill a slot', () => {
  fresh();
  const ms = [
    M(W, ['Footwork']), M(W, ['Footwork']), // 14th and 13th noted matches back: outside the window
    M(W, ['Other']), M(W, ['Other']), M(L, ['Defence']), M(L, ['Other']),
    M(W, ['Net']), M(W, ['Net']), M(L, ['Smash']), M(W, ['Other']),
    M(L, ['Smash', 'Defence']), M(W, ['Other']), M(W, ['Other']), M(W, ['Other'])
  ];
  // Defence: 2 in the window (one of them older than the latest 6). Net: active Focus. Footwork: too old.
  assert.deepEqual(G.buildCandidates(ms, [{ topic: 'tag:Net', status: 'active' }], 4).map(x => `${x.tag} ${x.k}/${x.n} ${x.level}`), ['Defence 2/12 confirmed', 'Smash 2/12 confirmed']);
  assert.deepEqual(G.buildCandidates(ms, [], 4).map(x => x.tag), ['Defence', 'Net', 'Smash']);
  // A single old note (not in the latest 6 noted) is not even an early item.
  fresh();
  const old = [M(L, ['Return']), ...Array.from({ length: 7 }, () => M(W, ['Other']))];
  assert.deepEqual(G.buildCandidates(old), []);
});

test('a skill is never both a strength and a weakness: one side per skill, the larger count wins, ties are mixed', () => {
  fresh();
  const ms = [M(W, [], ['Net']), M(W, [], ['Net']), M(L, ['Net']), M(L, ['Serve']), M(W, [], ['Serve']), M(L, ['Serve']), M(W, ['Other'])];
  const b = G.buildCandidates(ms).map(x => x.tag), st = G.strengthCandidates(ms).map(x => x.tag);
  assert.deepEqual(b, ['Serve']); assert.deepEqual(st, ['Net']);
  assert.ok(!b.some(t => st.includes(t)));
});

test('Key Insight P4: "insufficient" only when no detector could run and nothing was noted; "no_trend" only when nothing at all is eligible', () => {
  // 4 matches, no Skill Tags: not enough for any detector, nothing to report. The tile says how many more it needs.
  fresh();
  const few = [M(W, ['Other']), M(L, ['Other']), M(W, ['Other']), M(L, ['Other'])];
  assert.deepEqual(G.finalizeKey(G.keyCandidates(few), null, 'en', few), { status: 'insufficient', counts: { matches: 4, scored: 4, results: 4, noted: 4 }, more: 2, reason: 'no_candidate' });
  fresh();
  const voice = [W, L, W, L, W].map(() => M([{ r: 'W' }, { r: 'L' }, { r: 'W' }]));
  assert.equal(G.finalizeKey([], null, 'en', voice).more, 1);
  // 10 steady matches, notes but no skill: the detectors ran, nothing changed, nothing repeated. no_trend.
  fresh();
  const steady = Array.from({ length: 10 }, (_, i) => M(i % 2 ? L : W, ['Other']));
  assert.deepEqual(G.keyCandidates(steady), []);
  const k = G.finalizeKey(G.keyCandidates(steady), null, 'zh', steady);
  assert.equal(k.status, 'no_trend'); assert.equal(k.counts.matches, 10); assert.equal(k.title, undefined, 'no made-up copy');
});

// ---- Engine v14: the Key Insight hierarchy ----
// Han (2026-10-26): with 18 matches and evidence-backed recommendations, Key Insight said "No clear change yet".
const sections = (ms, focus = [], names = {}) => ({ build: G.buildCandidates(ms, focus, 4), strengths: G.strengthCandidates(ms, 3), opps: G.opponentFacts(ms, names), doubles: G.doublesFacts(ms) });
test('v14 invariant: whenever Build Next, Strengths, Opponent Plans or Doubles Play has evidence, the Key Insight is not no_trend / insufficient', () => {
  const cases = {
    steadyWithPatterns: () => Array.from({ length: 10 }, (_, i) => M(i % 2 ? L : W, i % 3 ? ['Other'] : ['Serve'], i % 4 ? [] : ['Net'])),
    v7Strength: () => [M(W, ['Other'], ['Smash']), M(W, ['Other'], ['Smash']), M(L, ['Other'], ['Smash']), M(L, ['Smash'], []), M(W, ['Other'], ['Smash']), M(L, ['Smash'], [])],
    oneEarly: () => [M(W, ['Other']), M(L, ['Placement']), M(W, ['Other'])],
    mixedOnly: () => [M(W, ['Net']), M(W, [], ['Net']), M(L, ['Net']), M(W, [], ['Net'])],
    opponentOnly: () => [M(W, ['Other'], [], { opps: ['ben'], opp_notes: 'Ben lifts to my backhand' }), M(L), M(W)],
    doublesNotesOnly: () => [M(W, [], [], { type: 'Doubles', worked: 'we rotated well' }), M(L), M(W)],
    hanShape: () => H.rows()
  };
  for (const [name, mk] of Object.entries(cases)) {
    fresh();
    const ms = mk(), names = { ben: 'Ben', ...Object.fromEntries(H.players.map(p => [p.id, p.name])) };
    const sec = sections(ms, [], names), any = sec.build.length || sec.strengths.length || sec.opps.length || sec.doubles;
    assert.ok(any, name);
    for (const lang of BOTH) {
      const k = G.finalizeKey(G.keyCandidates(ms, null, { names }), null, lang, ms);
      assert.equal(k.status, 'ok', `${name} ${lang}: ${JSON.stringify(k)}`);
      assert.deepEqual(k.validation.issues, [], `${name} ${lang}: ${k.title} / ${k.body}`);
      assert.ok(G.lineCount(k.title, 17) <= 2 && G.lineCount(k.body, 14) <= 3, `${name} ${lang}: ${k.title} / ${k.body}`);
    }
  }
});

test('v14 hierarchy: P1 trend beats any pattern; P2 pattern beats early; P3 is labelled early; the model cannot pick a lower tier', () => {
  fresh();
  // Rising margins and Defence noted costing points in 4 matches: the trend leads.
  const ms = [[15, 21], [16, 21], [18, 21], [21, 18], [21, 16], [21, 14]].map((g, i) => M([g], i % 2 ? ['Defence'] : ['Other']));
  const cs = G.keyCandidates(ms);
  assert.equal(cs[0].id, 'trend:margin');
  assert.ok(cs.some(c => c.id === 'pattern:cost:Defence' && c.tier === 2));
  const k = G.finalizeKey(cs, { candidate_id: 'pattern:cost:Defence', title: 'Defence keeps costing you points', body: 'You noted it in 3 of your last 6 matches.' }, 'en', ms);
  assert.equal(k.candidate_id, 'trend:margin', 'a pattern never replaces a measured trend');
  // No trend: the repeated pattern leads, before the one-off notes.
  fresh();
  const flat = [M(W, ['Defence']), M(L, ['Placement']), M(W, ['Defence']), M(L, ['Other']), M(W, ['Other'], ['Footwork']), M(L, ['Other'])];
  const fc = G.keyCandidates(flat);
  assert.deepEqual(fc.map(c => [c.id, c.tier]), [['pattern:cost:Defence', 2], ['early:cost:Placement', 3], ['early:worked:Footwork', 3]]);
  // Only early notes: labelled early in both languages, never as a habit.
  fresh();
  const early = [M(W, ['Other']), M(L, ['Placement']), M(W, ['Other'])];
  const en = G.finalizeKey(G.keyCandidates(early), null, 'en', early), zh = G.finalizeKey(G.keyCandidates(early), null, 'zh', early);
  assert.deepEqual([en.tier, en.level, en.title, en.body], [3, 'early', 'Early sign: Placement', 'Noted as a cost once in your last 3 matches. Too early to call.']);
  assert.deepEqual([zh.title, zh.body], ['初步观察：落点', '最近3场里有1场你记下落点丢分，还不算规律。']);
  assert.ok(G.checkCopy({ title: 'Placement keeps costing you', body: 'You always lose points on placement, noted once.' }, G.keyCandidates(early)[0], 'en').includes('not_labelled_early'));
  // The model's own wording of an early one must say it is early.
  const bad = G.finalizeKey(G.keyCandidates(early), { candidate_id: 'early:cost:Placement', title: 'Placement is costing you', body: 'You noted it once in your last 3 matches.' }, 'en', early);
  assert.equal(bad.copy_source, 'template'); assert.ok(bad.validation.ai_issues.includes('not_labelled_early'));
});

test("v14 on Han-shaped data: candidates and pick, EN and ZH agree, and the Key Insight isn't a copy of a card", () => {
  const rows = H.rows(), names = Object.fromEntries(H.players.map(p => [p.id, p.name]));
  const cs = G.keyCandidates(rows, null, { names });
  assert.deepEqual(cs.map(c => c.id), ['trend:margin', 'compare:games_won', 'pattern:cost:Defence', 'pattern:worked:Serve', 'opponent:alex', 'opponent:leo',
    'mixed:Net', 'mixed:Smash', 'early:cost:Placement', 'early:worked:Footwork', 'early:opponent:ravi', 'early:doubles:cost:Defence']);
  // Same records with no clear score change: the repeated Defence pattern, not "No clear change yet".
  const flat = rows.map(m => ({ ...m, games: [[21, 19], [19, 21]] }));
  const fc = G.keyCandidates(flat, null, { names });
  assert.equal(fc[0].id, 'pattern:cost:Defence');
  const en = G.finalizeKey(fc, null, 'en', flat), zh = G.finalizeKey(fc, null, 'zh', flat);
  assert.deepEqual([en.candidate_id, zh.candidate_id, en.status], ['pattern:cost:Defence', 'pattern:cost:Defence', 'ok']);
  assert.equal(en.title, 'Defence keeps costing you points'); assert.equal(en.body, 'You noted it in 3 of the last 12 with notes; scores show no real trend.');
  assert.equal(zh.body, '比分没有明显变化，但最近有记录的12场里有3场你记下防守丢分。');
  const [card] = G.finalizeItems(G.buildCandidates(flat, [], 4), null, 'build', 'en');
  assert.notEqual(en.body, card.evidence);
  assert.ok(en.candidates.length >= 10 && en.candidates[0].id === 'pattern:cost:Defence');
});

test('v14: an active Focus skill is left out of the Key Insight pattern just as from Build Next; a completed one returns only on new evidence', () => {
  fresh();
  const ms = [M(W, ['Defence'], ['Serve']), M(L, ['Defence']), M(W, ['Other']), M(L, ['Defence']), M(W, ['Other'], ['Serve']), M(L, ['Other'])];
  assert.equal(G.keyCandidates(ms)[0].id, 'pattern:cost:Defence');
  const focus = [{ topic: 'tag:Defence', status: 'active' }];
  const cs = G.keyCandidates(ms, null, { focus });
  assert.ok(!cs.some(c => c.id === 'pattern:cost:Defence'));
  assert.equal(cs[0].id, 'pattern:worked:Serve');
});
