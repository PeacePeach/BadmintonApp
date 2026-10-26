// generate-grow-insights end to end in Node: the real index.ts with a fake Supabase client and a fake OpenAI, so the
// whole path runs as deployed: match rows -> engine -> (model) -> checks -> cache row -> response.
//   node --test tests/grow-edge.test.mjs        (Node 22.18+: strips the TypeScript types itself)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const CORE = pathToFileURL(path.join(ROOT, 'supabase/functions/_shared/grow-insights-core.js')).href;
const G = await import(CORE);
const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/generate-grow-insights/index.ts'), 'utf8')
  .replace('import { createClient } from "npm:@supabase/supabase-js@2";', 'const createClient = (...a: any[]) => (globalThis as any).__createClient(...a);')
  .replace('"../_shared/grow-insights-core.js"', JSON.stringify(CORE));
const FN = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'grow-edge-')), 'fn.mts');
fs.writeFileSync(FN, src);
const env = { SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'x', OPENAI_API_KEY: 'sk-test' };
globalThis.Deno = { serve: h => { globalThis.__growHandler = h; }, env: { get: k => env[k] } };
await import(pathToFileURL(FN).href);

// One account: its rows, its single ai_insights row (kept between calls), and what the model answers.
function account(matches, focus = [], players = [{ id: 'me', name: 'Han' }, { id: 'alex', name: 'Alex' }]) {
  const db = { row: null, calls: 0, writes: 0 };
  const q = data => { const o = { select: () => o, order: () => o, limit: () => o, eq: () => o, maybeSingle: () => Promise.resolve({ data: data() }), then: (r, j) => Promise.resolve({ data: data(), error: null }).then(r, j) }; return o; };
  db.call = async (lang, ai = () => ({ keyInsight: null, buildNext: [], strengths: [], opponentPlans: [], doublesPlay: [] })) => {
    globalThis.__createClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: t => t === 'ai_insights' ? { ...q(() => db.row), upsert: async row => { db.row = row; db.writes++; return { error: null }; } }
        : t === 'focus_items' ? { select: () => Promise.resolve({ data: focus, error: null }) }
        : q(() => (t === 'players' ? players : [...matches].reverse())) });
    globalThis.fetch = async (url, init) => {
      db.calls++; const out = ai(JSON.parse(init.body));
      if (out instanceof Error) return { ok: false, status: 500, text: async () => out.message };
      return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(out) }] }] }) };
    };
    const res = await globalThis.__growHandler(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ lang }) }));
    return { status: res.status, ...(await res.json()) };
  };
  return db;
}
const day = i => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
const M = (i, games, lt, wt, extra = {}) => ({ id: 'm' + i, date: day(i), created_at: day(i) + 'T12:00:00Z', type: 'Singles', partner: null, opps: ['alex'], games, wt, lt, worked: '', lost: '', opp_notes: '', ...extra });
const W = [[21, 17], [21, 18]], L = [[17, 21], [18, 21]];
// Han's records (see tests/grow-insights.test.mjs): Net is an active Focus.
const han = () => [
  M(0, W, ['Net'], ['Smash'], { worked: '杀球靠边线效果很好' }), M(1, W, ['Net'], ['Smash']), M(2, L, ['Smash'], [], { lost: '后场杀球失误比较多' }),
  M(3, L, ['Return'], ['Serve'], { lost: '接发比较被动' }), M(4, L, ['Smash', 'Defence'], [], { lost: '杀球太多。反手防守比较弱。' }), M(5, L, ['Placement'], [], { lost: '网前吊球不好' })];

test('model call fails: the Grow sections still come back from the engine (template copy), and nothing is cached', async () => {
  const a = account(han(), [{ id: 'f1', title: '网前', status: 'active' }]);
  const r = await a.call('zh', () => new Error('upstream 500'));
  assert.equal(r.status, 200);
  assert.equal(r.insight.ai_status, 'failed');
  assert.equal(r.insight.keyInsight.status, 'ok'); assert.equal(r.insight.keyInsight.copy_source, 'template');
  // v13: the mixed Smash item first, then the two newest one-off notes as labelled early items (Return, the oldest, waits).
  assert.deepEqual(r.insight.buildNext.map(b => `${b.name}|${b.evidence}|${b.level}`), ['杀球|最近6场里，2场你记下它丢分，2场记下它打得好。|confirmed',
    '落点|初步观察：最近6场里有1场你记下落点丢分。|early', '防守|初步观察：最近6场里有1场你记下防守丢分。|early']);
  assert.deepEqual(r.insight.strengths.map(b => `${b.name}|${b.signal}|${b.level}`), ['发球|初步亮点：最近6场里有1场你觉得发球发挥不错。|early']);
  assert.deepEqual(r.insight.opponentPlans, []);
  assert.equal(r.insight.coverage.opponent_plans.zero_reason, 'no_opponent_notes');
  assert.equal(r.insight.coverage.doubles_play.zero_reason, 'no_doubles_matches');
  assert.equal(a.writes, 0, 'a failed call is retried next time, not cached');
  // Next visit: the model answers, and the result is cached.
  const ok = await a.call('zh');
  assert.equal(ok.insight.ai_status, 'ok'); assert.equal(a.writes, 1); assert.equal(ok.cached, false);
});

test('no API key: engine result with template copy, not an error', async () => {
  delete env.OPENAI_API_KEY;
  try {
    const r = await account(han()).call('en');
    assert.equal(r.status, 200); assert.equal(r.insight.ai_status, 'not_configured'); assert.equal(r.insight.keyInsight.status, 'ok');
  } finally { env.OPENAI_API_KEY = 'sk-test'; }
});

test('EN and ZH each keep their own cache: switching back and forth makes no new model calls', async () => {
  const a = account(han());
  await a.call('en'); await a.call('zh');
  assert.equal(a.calls, 2);
  const en = await a.call('en'), zh = await a.call('zh');
  assert.equal(a.calls, 2, 'both languages served from cache');
  assert.equal(en.cached, true); assert.equal(en.insight.lang, 'en'); assert.equal(zh.insight.lang, 'zh');
  assert.ok(!('other_lang' in en.insight), 'the response is one insight');
  assert.equal(en.insight.keyInsight.candidate_id, zh.insight.keyInsight.candidate_id, 'both languages lead with the same insight');
  // The top level of the row is still a complete insight (what older app versions read).
  assert.equal(a.row.insight_json.lang, 'zh'); assert.equal(a.row.insight_json.other_lang.lang, 'en');
  // New data: both are stale; the one asked for is made again.
  const more = account([...han(), M(6, W, ['Other'], ['Serve'])]); more.row = a.row;
  assert.equal((await more.call('en')).cached, false);
});

test('few matches: "insufficient" with how many more (plus a labelled early item); enough but steady: "no_trend" and no model call', async () => {
  const few = account([M(0, W, ['Net'], []), M(1, L, ['Other'], []), M(2, W, ['Other'], [])]);
  const r = await few.call('en');
  assert.deepEqual([r.insight.keyInsight.status, r.insight.keyInsight.more], ['insufficient', 3]);
  assert.deepEqual(r.insight.buildNext.map(b => [b.tag, b.level, b.evidence]), [['Net', 'early', 'Early sign: you noted it costing points once in your last 3 matches.']]);
  const steady = account(Array.from({ length: 10 }, (_, i) => M(i, i % 2 ? L : W, ['Other'], [])));
  const s = await steady.call('zh');
  assert.equal(s.insight.keyInsight.status, 'no_trend'); assert.equal(s.insight.keyInsight.counts.matches, 10);
  assert.equal(steady.calls, 0);
});

test('the model only sees and may only name the engine candidates; mixed items carry both counts', async () => {
  let sent = null;
  const r = await account(han(), [{ id: 'f1', title: 'Net', status: 'active' }]).call('en', body => {
    sent = JSON.parse(body.input[1].content);
    return { keyInsight: null, buildNext: [{ topic_id: 'tag:Smash', name: 'Smash', evidence: 'You noted smash costing you points in 2 of your last 6 matches.', action: '' }], strengths: [], opponentPlans: [], doublesPlay: [] };
  });
  assert.deepEqual(sent.build_candidates.map(b => [b.topic_id, b.level, b.k, b.w, b.n, b.mixed]), [['tag:Smash', 'confirmed', 2, 2, 6, true],
    ['tag:Placement', 'early', 1, undefined, 6, false], ['tag:Defence', 'early', 1, undefined, 6, false]]);
  assert.deepEqual(sent.strength_candidates.map(b => [b.topic_id, b.level, b.k]), [['tag:Serve', 'early', 1]]);
  assert.equal(r.insight.buildNext[0].evidence, 'You noted it costing points in 2 of your last 6 matches, and working in 2.');
  assert.equal(r.insight.engine_version, G.ENGINE_VERSION);
});

test('released app (no lang in the request): Key Insight is { title, body } or null, never an empty tile or a NaN bar', async () => {
  const a = account(han());
  const legacy = async () => {
    globalThis.__lastBody = undefined;
    const res = await globalThis.__growHandler(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({}) }));
    return res.json();
  };
  await a.call('en'); // the new app stores the full insight
  const r = await legacy();
  assert.equal(r.cached, true);
  assert.deepEqual(Object.keys(r.insight.keyInsight), ['title', 'body']);
  assert.equal(a.row.insight_json.keyInsight.status, 'ok', 'the stored row keeps the full Key Insight');
  const steady = account(Array.from({ length: 10 }, (_, i) => M(i, i % 2 ? L : W, ['Other'], [])));
  await steady.call('en');
  assert.equal((await legacy()).insight.keyInsight, null);
});

// v13 coverage on a record set shaped like Han's account (17 matches, 12 with Skill Tags, 9 with opponent notes,
// 5 doubles; tests/fixtures/han-shape.mjs). v12 returned 1 Build Next and nothing else on it.
const H = await import(pathToFileURL(path.join(ROOT, 'tests/fixtures/han-shape.mjs')).href);
const han17 = ms => account(ms, [], H.players);

test("Han-shaped account: every section has cards in EN and ZH, with or without the model, and coverage explains them", async () => {
    for (const lang of ['en', 'zh']) {
      const r = await han17(H.matches).call(lang, () => new Error('upstream 500'));
      const i = r.insight, c = i.coverage;
      assert.equal(i.keyInsight.status, 'ok');
      assert.deepEqual([i.buildNext.length, i.strengths.length, i.opponentPlans.length, i.doublesPlay.length], [4, 2, 3, 2], lang);
      assert.deepEqual(i.buildNext.map(b => b.level), ['confirmed', 'confirmed', 'confirmed', 'early']);
      assert.deepEqual(i.strengths.map(b => `${b.tag} ${b.level}`), ['Serve confirmed', 'Footwork early']);
      assert.ok(!i.buildNext.some(b => i.strengths.some(s => s.tag === b.tag)), 'no skill on both lists');
      assert.deepEqual(i.opponentPlans.map(p => [p.player_id, p.level]), [['alex', 'repeated'], ['leo', 'repeated'], ['ravi', 'single']]);
      assert.match(i.opponentPlans[2].plan, lang === 'zh' ? /^初步判断：/ : /^Early read: /);
      assert.ok(i.doublesPlay.every(d => d.level === 'early' && (lang === 'zh' ? /^初步观察：/ : /^Early observation: /).test(d.pattern)), 'no doubles skill was noted twice');
      assert.deepEqual([c.matches_read, c.noted_matches, c.opponent_plans.matches_with_notes, c.doubles_play.doubles_matches, c.doubles_play.noted_doubles], [17, 12, 9, 5, 3]);
    }
});

test("Han-shaped account: the model's cross-language plans and doubles items pass their checks; a habit claimed from one note does not", async () => {
    let sent;
    const answer = lang => body => {
      sent = JSON.parse(body.input[1].content);
      const zh = lang === 'zh';
      return { keyInsight: null, buildNext: [], strengths: [],
        opponentPlans: [
          { player_id: 'alex', plan: zh ? '多准备反手底线的回球，接杀后别急着挡网前。' : 'Expect pressure on your backhand rear court; prepare that side early.' },
          { player_id: 'leo', plan: zh ? '接发前站稳，留意他的发球变化。' : "Stay ready on return: Leo's serve varies a lot." },
          { player_id: 'ravi', plan: zh ? '他总是后场进攻，多压他后场。' : 'Ravi always attacks from the rear court, so keep him there.' },
          { player_id: 'mei', plan: zh ? '准备好防守重杀。' : 'Be ready to defend heavy smashes.' }
        ],
        doublesPlay: [
          { name: zh ? '平抽挡站位' : 'Drive position', pattern: zh ? '有一场你记下平抽挡时站得太靠后。' : 'One match you noted standing too far back on drives.', label: 'Try Next', action: zh ? '平抽挡时往前站半步。' : 'Step half a step forward on drives.' },
          { name: zh ? '封网' : 'Net coverage', pattern: zh ? '有一场你记下前场封网很有效。' : 'One match you noted your net coverage worked well.', label: 'Keep Doing', action: zh ? '继续主动封网。' : 'Keep stepping in at the net.' }
        ] };
    };
    for (const lang of ['en', 'zh']) {
      const i = (await han17(H.matches).call(lang, answer(lang))).insight;
      assert.deepEqual(sent.opponents.map(o => [o.player_id, o.level, o.notes.length]), [['alex', 'repeated', 3], ['leo', 'repeated', 3], ['ravi', 'single', 1], ['jo', 'single', 1], ['mei', 'single', 1]]);
      assert.ok(sent.opponents.every(o => !o.notes.some(n => /^(Mei|Ravi|Jo|Alex|Leo)/.test(n) && !n.startsWith(o.name))), 'each opponent only gets notes about them');
      const p = Object.fromEntries(i.opponentPlans.map(x => [x.player_id, x]));
      assert.equal(p.alex.copy_source, 'ai', JSON.stringify(p.alex)); assert.equal(p.leo.copy_source, 'ai', JSON.stringify(p.leo));
      assert.equal(p.ravi.copy_source, 'note', 'one note is never "always"'); assert.ok(p.ravi.issues.includes('generalized_single_note'));
      assert.equal(i.opponentPlans.length, 3);
      assert.deepEqual(i.doublesPlay.map(d => [d.copy_source, d.level]), [['ai', 'early'], ['ai', 'early']], lang);
      assert.match(i.doublesPlay[0].pattern, lang === 'zh' ? /^初步观察：有一场/ : /^Early observation: One match/);
    }
});

test('low data: one noted singles match and one noted doubles match still give labelled early items; nothing is invented', async () => {
    const ms = [H.matches[5], H.matches[6]]; // Net worked + note on Leo; doubles Defence cost + note on Mei
    for (const lang of ['en', 'zh']) {
      const i = (await han17(ms).call(lang, () => new Error('down'))).insight;
      assert.equal(i.keyInsight.status, 'insufficient');
      assert.deepEqual([i.buildNext.length, i.strengths.length], [0, 0], 'Build Next / Strengths need 3 noted matches');
      assert.equal(i.coverage.build_next.zero_reason, 'fewer_than_3_noted_matches');
      assert.deepEqual(i.opponentPlans.map(p => [p.player_id, p.level]), [['mei', 'single'], ['leo', 'single']]);
      assert.deepEqual(i.doublesPlay.map(d => [d.tag || d.name, d.level]), [[lang === 'zh' ? '防守' : 'Defence', 'early']]);
    }
});

test('high data: 25 matches with notes on every one: Build Next at most 4, Strengths 3, plans 3, doubles 2; the oldest 5 are not read', async () => {
  const tags = ['Serve', 'Return', 'Net', 'Smash', 'Defence', 'Footwork', 'Placement'];
  const ms = Array.from({ length: 25 }, (_, i) => M(i, i % 3 ? W : L, [tags[i % 7]], [tags[(i + 3) % 7]],
    { type: i % 4 ? 'Singles' : 'Doubles', opps: i % 4 ? [['alex', 'ben', 'cy', 'dee'][i % 4]] : ['ben', 'cy'], opp_notes: i % 4 ? 'smashes hard to my backhand rear court' : 'Ben stays at the net', lost: 'defence too far back', worked: 'serve was steady' }));
  const players = [{ id: 'me', name: 'Han' }, { id: 'alex', name: 'Alex' }, { id: 'ben', name: 'Ben' }, { id: 'cy', name: 'Cy' }, { id: 'dee', name: 'Dee' }];
  for (const lang of ['en', 'zh']) {
    const i = (await account(ms, [], players).call(lang, () => new Error('down'))).insight;
    assert.ok(i.buildNext.length <= 4 && i.strengths.length <= 3 && i.opponentPlans.length <= 3 && i.doublesPlay.length <= 2);
    assert.ok(i.buildNext.length + i.strengths.length > 0);
    assert.ok(!i.buildNext.some(b => i.strengths.some(s => s.tag === b.tag)));
    assert.equal(i.coverage.matches_read, 20); assert.equal(i.coverage.skill_window, 12);
    assert.equal(i.opponentPlans.length, 3);
    assert.ok(i.opponentPlans.every(p => p.level === 'repeated'));
  }
});
