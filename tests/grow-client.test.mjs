// The app's Grow call (project/rallywise-backend.js) in Node: a call that never answers ends as a network error, so
// Grow leaves "Looking at your matches…" for its error tile instead of waiting for ever.
//   node --test tests/grow-client.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'project/rallywise-backend.js'), 'utf8');
function backend(invoke) {
  const window = { RALLYWISE_CONFIG: { supabaseUrl: 'x', supabaseAnonKey: 'x', growTimeoutMs: 50 },
    supabase: { createClient: () => ({ functions: { invoke }, auth: { onAuthStateChange: () => ({ data: { subscription: {} } }) } }) } };
  vm.runInNewContext(SRC, { window, navigator: { onLine: true }, setTimeout, clearTimeout, console, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  return window.RallywiseBackend;
}

test('a Grow call that hangs fails with code "network" after the timeout', async () => {
  const b = backend(() => new Promise(() => {}));
  const t = Date.now();
  await assert.rejects(b.insights.generate('en'), e => e.code === 'network');
  assert.ok(Date.now() - t < 1000);
});

test('a Grow call that answers returns the insight with its time, in the language asked for', async () => {
  let body;
  const b = backend(async (name, o) => { body = o.body; return { data: { insight: { lang: 'zh', keyInsight: null }, generated_at: '2026-10-26T00:00:00Z' }, error: null }; });
  const r = await b.insights.generate('zh');
  assert.equal(JSON.stringify(body), '{"lang":"zh"}');
  assert.equal(r._generatedAt, '2026-10-26T00:00:00Z'); assert.equal(r.lang, 'zh');
  const none = backend(async () => ({ data: { insight: null }, error: null }));
  assert.equal(await none.insights.generate('en'), null);
});
