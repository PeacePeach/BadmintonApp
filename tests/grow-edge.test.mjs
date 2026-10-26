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
function account(matches, focus = []) {
  const db = { row: null, calls: 0, writes: 0 };
  const q = data => { const o = { select: () => o, order: () => o, limit: () => o, eq: () => o, maybeSingle: () => Promise.resolve({ data: data() }), then: (r, j) => Promise.resolve({ data: data(), error: null }).then(r, j) }; return o; };
  db.call = async (lang, ai = () => ({ keyInsight: null, buildNext: [], strengths: [], opponentPlans: [], doublesPlay: [] })) => {
    globalThis.__createClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: t => t === 'ai_insights' ? { ...q(() => db.row), upsert: async row => { db.row = row; db.writes++; return { error: null }; } }
        : t === 'focus_items' ? { select: () => Promise.resolve({ data: focus, error: null }) }
        : q(() => (t === 'players' ? [{ id: 'me', name: 'Han' }, { id: 'alex', name: 'Alex' }] : [...matches].reverse())) });
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
  assert.deepEqual(r.insight.buildNext.map(b => `${b.name}|${b.evidence}`), ['杀球|最近6场里，2场你记下它丢分，2场记下它打得好。']);
  assert.deepEqual(r.insight.strengths, []); assert.deepEqual(r.insight.opponentPlans, []);
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

test('few matches: "insufficient" with how many more; enough but steady: "no_trend"; no model call for either', async () => {
  const few = account([M(0, W, ['Net'], []), M(1, L, ['Other'], []), M(2, W, ['Other'], [])]);
  const r = await few.call('en');
  assert.deepEqual([r.insight.keyInsight.status, r.insight.keyInsight.more], ['insufficient', 3]);
  assert.equal(r.insight.ai_status, 'skipped'); assert.equal(few.calls, 0);
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
  assert.deepEqual(sent.build_candidates.map(b => [b.topic_id, b.k, b.w, b.n, b.mixed]), [['tag:Smash', 2, 2, 6, true]]);
  assert.deepEqual(sent.strength_candidates, []);
  assert.equal(r.insight.buildNext[0].evidence, 'You noted it costing points in 2 of your last 6 matches, and working in 2.');
  assert.equal(r.insight.engine_version, G.ENGINE_VERSION);
});
