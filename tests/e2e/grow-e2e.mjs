// Grow end to end in the real app UI: the app (served from project/ on :8123) -> mock backend -> the REAL
// generate-grow-insights index.ts + engine, run here in Node with a fake Supabase and a fake model -> the Grow screen.
//   cd <repo>/project && python3 -m http.server 8123 &   then   node grow-e2e.mjs <repo> [outdir]
// AI copy: the fake model returns no copy (or fails), so every string on screen is the engine's own template copy.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url'; import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const REPO = path.resolve(process.argv[2] || '/home/user/badmintonapp'), OUT = process.argv[3] || path.join(import.meta.dirname, '..', 'out');
const HERE = import.meta.dirname, MOCK = fs.readFileSync(path.join(HERE, 'mock-backend.js'), 'utf8');

// ---- The edge function, as deployed ----
const CORE = pathToFileURL(path.join(REPO, 'supabase/functions/_shared/grow-insights-core.js')).href;
const FN = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'grow-e2e-')), 'fn.mts');
fs.writeFileSync(FN, fs.readFileSync(path.join(REPO, 'supabase/functions/generate-grow-insights/index.ts'), 'utf8')
  .replace('import { createClient } from "npm:@supabase/supabase-js@2";', 'const createClient = (...a: any[]) => (globalThis as any).__createClient(...a);')
  .replace('"../_shared/grow-insights-core.js"', JSON.stringify(CORE)));
globalThis.Deno = { serve: h => { globalThis.__h = h; }, env: { get: k => ({ SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'x', OPENAI_API_KEY: 'sk-test' })[k] } };
await import(pathToFileURL(FN).href);
const server = { row: null, aiCalls: 0, aiFail: false };
async function edge(lang, dbJson) {
  const db = JSON.parse(dbJson);
  // App state -> table rows, as rallywise-backend.js stores them.
  const rows = db.matches.map(m => ({ id: m.id, date: m.date, type: m.type, partner: m.partner, opps: m.opps, games: m.games, wt: m.wt, lt: m.lt, worked: m.worked, lost: m.lost, opp_notes: m.on, created_at: m.createdAt }))
    .sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)));
  const focus = (db.focuses || []).map(f => ({ title: f.title, status: f.status, completed_at: f.completedAt, ...(f.topicId ? { topic_id: f.topicId } : {}) }));
  const q = data => { const o = { select: () => o, order: () => o, limit: () => o, eq: () => o, maybeSingle: () => Promise.resolve({ data }), then: (r, j) => Promise.resolve({ data, error: null }).then(r, j) }; return o; };
  globalThis.__createClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: t => t === 'ai_insights' ? { ...q(server.row), upsert: async row => { server.row = row; return { error: null }; } }
      : t === 'focus_items' ? { select: () => Promise.resolve({ data: focus, error: null }) }
      : q(t === 'players' ? db.players.map(p => ({ id: p.id, name: p.name })) : rows) });
  globalThis.fetch = async () => { server.aiCalls++;
    if (server.aiFail) return { ok: false, status: 500, text: async () => 'fake upstream failure' };
    return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ keyInsight: null, buildNext: [], strengths: [], opponentPlans: [], doublesPlay: [] }) }] }] }) }; };
  const res = await globalThis.__h(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ lang }) }));
  return JSON.stringify(await res.json());
}

// ---- Accounts (app shape) ----
const day = i => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
const W = [[21, 17], [21, 18]], L = [[17, 21], [18, 21]];
const M = (i, games, lt, wt, extra = {}) => ({ id: 'm' + i, date: day(i), type: 'Singles', partner: null, opps: ['alex'], games, wt, lt, worked: '', lost: '', on: '', createdAt: day(i) + 'T12:00:00.000Z', ...extra });
const players = [{ id: 'me', name: 'Han Li', level: 'Intermediate' }, { id: 'alex', name: 'Alex Chen' }];
const plan = { periodType: 'week', target: 3, periods: 2, start: '2026-10-01', startedAt: '2026-10-01T09:00:00.000Z' };
const focusNet = { id: 'f1', title: 'Net', source: 'grow', type: 'practice', status: 'active', completedBy: null, completedAt: null, goal: '', cues: [], createdAt: '2026-10-01T09:00:00.000Z', plan };
const ACCOUNTS = {
  // Han's records (Chinese notes from his account): Net active Focus, Smash worked early and cost points later.
  han: { matches: [M(0, W, ['Net'], ['Smash'], { worked: '杀球靠边线效果很好' }), M(1, W, ['Net'], ['Smash']), M(2, L, ['Smash'], [], { lost: '后场杀球失误比较多' }),
    M(3, L, ['Return'], ['Serve'], { lost: '接发比较被动' }), M(4, L, ['Smash', 'Defence'], [], { lost: '杀球太多。反手防守比较弱。' }), M(5, L, ['Placement'], [], { lost: '网前吊球不好' })], focuses: [focusNet] },
  // Han's v7 screenshot: Smash worked 4/6, cost 2/6; results even. The old screen: "Not Enough Data Yet".
  hanV7: { matches: [M(0, W, ['Other'], ['Smash']), M(1, W, ['Other'], ['Smash']), M(2, L, ['Other'], ['Smash']), M(3, L, ['Smash'], [], { lost: 'backcourt smashes got blocked' }), M(4, W, ['Other'], ['Smash']), M(5, L, ['Smash'], [])], focuses: [] },
  // 10 matches, steady results, Serve cost points in 4 of the latest 6 noted, Net worked in 3: enough evidence, no change.
  steady: { matches: Array.from({ length: 10 }, (_, i) => M(i, i % 2 ? L : W, [1, 0, 1, 1, 0, 1, 0, 1, 0, 1][i] ? ['Serve'] : ['Other'], [0, 1, 0, 0, 1, 0, 1, 0, 1, 0][i] ? ['Net'] : [])), focuses: [] },
  few: { matches: [M(0, W, ['Net'], []), M(1, L, ['Smash'], []), M(2, W, ['Other'], ['Serve'])], focuses: [] },
  // Nothing noted at all: the only honest Key Insight is "not enough data yet".
  bare: { matches: [M(0, W, ['Other'], []), M(1, L, ['Other'], []), M(2, W, ['Other'], [])], focuses: [] },
  // Nothing noted, 10 even matches: the detectors ran and found nothing: "No clear change yet".
  flatBare: { matches: Array.from({ length: 10 }, (_, i) => M(i, i % 2 ? L : W, ['Other'], [])), focuses: [] },
  // One match, a level one (1–1 games): Performance never shows ±100% or counts it as a loss.
  one: { matches: [M(0, [[21, 18], [18, 21]], ['Net'], [])], focuses: [] }
};
// v13: a record set shaped like Han's account (17 matches, 12 with Skill Tags, 9 with opponent notes, 5 doubles).
const H = await import(pathToFileURL(path.join(REPO, 'tests/fixtures/han-shape.mjs')).href);
const h17 = m => ({ id: m.id, date: m.date, type: m.type, partner: m.partner, opps: m.opps, games: m.games, wt: m.wt, lt: m.lt, worked: m.worked, lost: m.lost, on: m.opp_notes, createdAt: m.created_at });
ACCOUNTS.han17flat = { matches: H.matches.map(m => h17({ ...m, games: [[21, 19], [19, 21], [21, 19]].slice(0, 2 + (Number(m.id.slice(1)) % 2)) })), focuses: [],
  players: [{ id: 'me', name: 'Han Li', level: 'Intermediate' }, ...H.players.filter(p => p.id !== 'me')] };
ACCOUNTS.han17 = { matches: H.matches.map(m => ({ id: m.id, date: m.date, type: m.type, partner: m.partner, opps: m.opps, games: m.games, wt: m.wt, lt: m.lt, worked: m.worked, lost: m.lost, on: m.opp_notes, createdAt: m.created_at })),
  focuses: [], players: [{ id: 'me', name: 'Han Li', level: 'Intermediate' }, ...H.players.filter(p => p.id !== 'me')] };
const SEED = ({ db, extra }) => { localStorage.clear(); localStorage.setItem('mock.session', '1'); localStorage.setItem('mock.db', JSON.stringify(db)); for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, JSON.stringify(v)); };

let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch();
async function open(lang, name, extra = {}) {
  const { __vp: vp = { width: 390, height: 844 }, ...rest } = extra; extra = rest;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
  await ctx.route('https://unpkg.com/**', async r => { const res = await r.fetch({ url: r.request().url().replace('https://unpkg.com/', 'https://cdn.jsdelivr.net/npm/') }); await r.fulfill({ response: res }); });
  await ctx.route('**/rallywise-backend.js', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  const pg = await ctx.newPage(); pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') pg.errs.push(m.text()); });
  await pg.exposeFunction('__edge', edge);
  await pg.goto('http://localhost:8123/assets/rallywise-mark.svg');
  const a = ACCOUNTS[name];
  await pg.evaluate(SEED, { db: { onboarded: true, prefs: { lang, insights: true }, players: a.players || players, matches: a.matches, focuses: a.focuses, focusPeriods: [] }, extra });
  await pg.goto('http://localhost:8123/Badminton%20Tracker.dc.html', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(3200);
  const zh = lang === 'zh', nn = pg.getByText(zh ? '以后再说' : 'Not Now', { exact: true }); if (await nn.count()) { await nn.first().click(); await pg.waitForTimeout(300); }
  await pg.getByText(zh ? '洞察' : 'Insights', { exact: true }).first().click(); await pg.waitForTimeout(300);
  await pg.getByRole('tab', { name: zh ? '提升' : 'Grow', exact: true }).first().click();
  return pg;
}
const grow = pg => pg.evaluate(() => {
  const k = document.querySelector('.rw-key'), txt = s => (s ? s.textContent.trim() : null);
  const sec = title => [...document.querySelectorAll('section')].find(x => txt(x.querySelector('.rw-section-title')) === title);
  return { keyTitle: txt(k && k.querySelector('.rw-key-title')), keyBody: txt(k && k.querySelector('.rw-key-body')), chart: k && k.querySelector('.rw-key-chart') ? k.querySelector('.rw-key-chart').dataset.kind : null,
    sections: [...document.querySelectorAll('.rw-section-title')].map(txt),
    build: [...document.querySelectorAll('.rw-advice.is-half')].map(t => [txt(t.querySelector('.rw-name')), txt(t.querySelector('.rw-advice-desc')), txt(t.querySelector('.rw-advice-tip-text'))]),
    strengths: [...(sec('Your Strengths') || sec('你的优势') || document.createElement('i')).querySelectorAll('.rw-advice')].map(t => [txt(t.querySelector('.rw-name')), txt(t.querySelector('.rw-meta'))]),
    counts: Object.fromEntries([...document.querySelectorAll('section')].map(x => [txt(x.querySelector('.rw-section-title')), x.querySelectorAll('.rw-advice').length]).filter(([k]) => k)),
    opps: [...(sec('Opponent Plans') || sec('对手策略') || document.createElement('i')).querySelectorAll('.rw-advice')].map(t => [txt(t.querySelector('.rw-name')), txt(t.querySelector('.rw-advice-tip-text'))]),
    doubles: [...(sec('Doubles Play') || sec('双打配合') || document.createElement('i')).querySelectorAll('.rw-advice')].map(t => [txt(t.querySelector('.rw-name')), txt(t.querySelector('.rw-meta')), txt(t.querySelector('.rw-advice-tip-text'))]),
    keyNaN: /NaN|undefined|Infinity|\{\w+\}/.test(document.body.innerText),
    empties: document.querySelectorAll('[data-screen-label="Grow"] .rw-empty, [data-screen-label="Grow"] [class*="empty"]').length };
});
const shot = async (pg, lang, file) => { fs.mkdirSync(path.join(OUT, lang), { recursive: true }); await pg.screenshot({ path: path.join(OUT, lang, file), fullPage: true }); };
const NOT_ENOUGH = /Not Enough Data Yet|数据还不够/, NO_CHANGE = /No clear change yet|暂时没有明显变化/;

for (const lang of process.env.ONLY ? [] : ['en', 'zh']) {
  const zh = lang === 'zh';
  // 1. Loading: the tile says it is working, not "Not Enough Data".
  server.row = null;
  let pg = await open(lang, 'han', { 'mock.slow': true }); await pg.waitForTimeout(600);
  let g = await grow(pg);
  ok(/Looking at your matches|正在分析你的比赛/.test(g.keyTitle) && !NOT_ENOUGH.test(g.keyTitle) && !g.build.length, `${lang} loading: "${g.keyTitle}" / "${g.keyBody}", no local Build Next`);
  await shot(pg, lang, '1-loading.png');
  await pg.waitForTimeout(3200); g = await grow(pg);
  ok(g.chart && g.build.length === 3, `${lang} after loading: Key chart ${g.chart}, Build Next ${JSON.stringify(g.build)}`);
  await shot(pg, lang, '2-han-records.png');
  ok(g.build[0][0] === (zh ? '杀球' : 'Smash') && (zh ? /2场你记下它丢分，2场记下它打得好/ : /costing points in 2 of your last 6 matches, and working in 2/).test(g.build[0][1]), `${lang} Han records: mixed Smash item first, with both counts`);
  ok(g.build.slice(1).every(b => (zh ? /^初步观察：/ : /^Early sign: /).test(b[1])), `${lang} Han records: the one-note items are labelled early: ${JSON.stringify(g.build.slice(1).map(b => b[1]))}`);
  ok(g.strengths.length === 1 && (zh ? /^初步亮点：/ : /^Emerging: /).test(g.strengths[0][1]), `${lang} Han records: Serve (noted working once) is an emerging strength: ${JSON.stringify(g.strengths)}`);
  ok(!pg.errs.length, `${lang} no console errors ${pg.errs.join(' | ')}`); await pg.close();

  // 2. Han's v7 screenshot data: enough evidence, no clear change. Strength Smash 4/6, no contradicting Build Next.
  server.row = null;
  pg = await open(lang, 'hanV7'); await pg.waitForTimeout(1500); g = await grow(pg);
  // Engine v14: the 4/6 strength is the Key Insight (P2), never "No clear change yet" next to it.
  ok(/Smash keeps working|杀球一直在帮你得分/.test(g.keyTitle) && !NO_CHANGE.test(g.keyTitle) && !g.chart, `${lang} v7 data: "${g.keyTitle}" / "${g.keyBody}" (no chart: ${!g.chart})`);
  ok(g.strengths.length === 1 && /4/.test(g.strengths[0][1]) && !g.build.length, `${lang} v7 data: Strengths ${JSON.stringify(g.strengths)}, Build Next ${g.build.length}`);
  await shot(pg, lang, '3-v7-no-change.png'); await pg.close();

  // 3. Steady 10 matches: no change, Build Next and Strengths agree with each other.
  server.row = null;
  pg = await open(lang, 'steady'); await pg.waitForTimeout(1500); g = await grow(pg);
  ok(g.keyTitle && !NOT_ENOUGH.test(g.keyTitle) && !NO_CHANGE.test(g.keyTitle) && /Serve|发球/.test(g.keyTitle), `${lang} steady: "${g.keyTitle}" / "${g.keyBody}"`);
  const bn = g.build.map(b => b[0]), st = g.strengths.map(b => b[0]);
  ok(bn.length && st.length && !bn.some(x => st.includes(x)), `${lang} steady: Build Next ${bn} / Strengths ${st}, no overlap`);
  await shot(pg, lang, '4-steady.png'); await pg.close();

  // 4. Three matches, two one-off notes: a labelled early observation (P3), not "not enough data".
  server.row = null;
  pg = await open(lang, 'few'); await pg.waitForTimeout(1500); g = await grow(pg);
  ok((zh ? /^初步观察/ : /^Early sign/).test(g.keyTitle) && /early|初步|还不算/i.test(g.keyTitle + g.keyBody), `${lang} few: "${g.keyTitle}" / "${g.keyBody}"`);
  ok(!g.empties, `${lang} few: one message, not the tile plus a second empty state`);
  await shot(pg, lang, '5-few.png'); await pg.close();
  // P4: nothing noted. 3 matches: not enough (how many more); 10 matches: no clear change.
  server.row = null;
  pg = await open(lang, 'bare'); await pg.waitForTimeout(1500); g = await grow(pg);
  ok(NOT_ENOUGH.test(g.keyTitle) && /3/.test(g.keyBody) && !g.build.length && !g.strengths.length, `${lang} bare 3: "${g.keyTitle}" / "${g.keyBody}"`);
  await pg.close();
  server.row = null;
  pg = await open(lang, 'flatBare'); await pg.waitForTimeout(1500); g = await grow(pg);
  ok(NO_CHANGE.test(g.keyTitle) && !g.build.length && !g.strengths.length && !g.opps.length && !g.doubles.length, `${lang} bare 10: "${g.keyTitle}" / "${g.keyBody}" with no section`);
  await pg.close();

  // 5. The call fails (network): says so; never "Not Enough Data".
  server.row = null;
  pg = await open(lang, 'han', { 'mock.edgeFail': true }); await pg.waitForTimeout(1200); g = await grow(pg);
  ok(/Couldn't update insights|暂时无法更新/.test(g.keyTitle), `${lang} network error: "${g.keyTitle}" / "${g.keyBody}"`);
  await shot(pg, lang, '6-error.png'); await pg.close();

  // 6. The model fails: the engine's sections still show (template copy).
  server.row = null; server.aiFail = true;
  pg = await open(lang, 'han'); await pg.waitForTimeout(1500); g = await grow(pg); server.aiFail = false;
  ok(g.chart && g.build.length === 3, `${lang} model failed: Key chart ${g.chart} + Build Next still shown`);
  await shot(pg, lang, '7-model-failed.png'); await pg.close();

  // 7. v13 coverage: Han-shaped account (17 matches). Every section has cards, early ones labelled.
  for (const fail of [false, true]) {
    server.row = null; server.aiFail = fail;
    pg = await open(lang, 'han17'); await pg.waitForTimeout(1800); g = await grow(pg); server.aiFail = false;
    const t = zh ? { b: '下一步提升', s: '你的优势', o: '对手策略', d: '双打配合' } : { b: 'Build Next', s: 'Your Strengths', o: 'Opponent Plans', d: 'Doubles Play' };
    const n = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, g.counts[v] || 0]));
    ok(g.keyTitle && !NOT_ENOUGH.test(g.keyTitle) && n.b === 4 && n.s === 2 && n.o === 3 && n.d === 2, `${lang} han17${fail ? ' (model failed)' : ''}: Key "${g.keyTitle}", cards ${JSON.stringify(n)} (sections ${JSON.stringify(g.counts)})`);
    ok(g.opps.some(o => (zh ? /^初步判断：/ : /^Early read: /).test(o[1])) && g.doubles.every(d => (zh ? /^初步观察：/ : /^Early observation: /).test(d[1])), `${lang} han17: early opponent read and doubles observations labelled ${JSON.stringify([g.opps, g.doubles])}`);
    ok(!g.build.some(b => g.strengths.some(s => s[0] === b[0])), `${lang} han17: no skill in both Build Next and Strengths`);
    ok(!pg.errs.length, `${lang} han17: no console errors ${pg.errs.join(' | ')}`);
    await shot(pg, lang, fail ? '9-han17-model-failed.png' : '8-han17.png'); await pg.close();
  }
  // 8. Engine v14: Han's 17 matches with no clear score trend. Key Insight is the repeated Defence pattern (P2), shown
  // as a text tile (its 12-match window has no 6-pill chart), never "No clear change yet" above 11 cards.
  server.row = null;
  pg = await open(lang, 'han17flat'); await pg.waitForTimeout(1800); g = await grow(pg);
  ok(/Defence keeps costing you points|防守还在反复丢分/.test(g.keyTitle) && !g.chart && !g.keyNaN && g.build.length === 4, `${lang} han17flat: "${g.keyTitle}" / "${g.keyBody}", chart ${g.chart}, cards ${JSON.stringify(g.counts)}`);
  ok(!pg.errs.length, `${lang} han17flat: no console errors ${pg.errs.join(' | ')}`);
  await shot(pg, lang, '11-han17-no-trend.png'); await pg.close();
}

if (!process.env.ONLY || process.env.ONLY === 'lang') {
// 7. Language switch through Settings > Language: EN -> ZH -> EN -> ZH makes two model calls in total, because
// each language keeps its own cache, and Grow always ends up in the app's language.
server.row = null; server.aiCalls = 0;
{ const pg = await open('en', 'han'); await pg.waitForTimeout(1500);
  const toLang = async (label, zhNow) => {
    await pg.locator('.rw-appbar-action button').click(); await pg.waitForTimeout(300);
    await pg.getByText(zhNow ? '设置' : 'Settings', { exact: true }).first().click(); await pg.waitForTimeout(500);
    await pg.locator('[data-screen-label="Settings"] .rw-group-row').nth(2).click(); await pg.waitForTimeout(500);
    await pg.locator('[data-screen-label="Language"] .rw-group-row', { hasText: label }).first().click(); await pg.waitForTimeout(300);
    const zh = label === '简体中文', tab = pg.getByText(zh ? '洞察' : 'Insights', { exact: true });
    for (let i = 0; i < 4 && !(await tab.first().isVisible().catch(() => false)); i++) { await pg.locator('.rw-appbar-title button').first().click(); await pg.waitForTimeout(400); }
    await tab.first().click(); await pg.waitForTimeout(1500);
    return grow(pg);
  };
  let g = await toLang('简体中文', false); const zhKey = g.keyTitle;
  ok(server.aiCalls === 2 && /杀球/.test(g.build.map(b => b[0]).join()), `language: EN then ZH, ${server.aiCalls} model calls, Grow in Chinese: ${g.keyTitle}`);
  g = await toLang('English', true);
  ok(server.aiCalls === 2 && g.build[0] && g.build[0][0] === 'Smash', `language: back to EN from cache, still ${server.aiCalls} calls: ${g.keyTitle}`);
  ok(/scores/.test(g.keyTitle) === /比分/.test(zhKey), `language: EN and ZH lead with the same Key Insight ("${g.keyTitle}" / "${zhKey}")`);
  g = await toLang('简体中文', false);
  ok(server.aiCalls === 2 && g.build[0] && g.build[0][0] === '杀球', `language: ZH again from cache, still ${server.aiCalls} calls`);
  await shot(pg, 'zh', '8-after-switches.png');
  ok(!pg.errs.length, `language: no console errors ${pg.errs.join(' | ')}`);
  await pg.close(); }
}
if (!process.env.ONLY || process.env.ONLY === 'del') {
// 8. A match is deleted while Grow has an insight: the old one (built on 6 matches) is taken down, a new one is
// made on 5, and the screen never says "Not Enough Data".
server.row = null; server.aiCalls = 0;
{ const pg = await open('en', 'han'); await pg.waitForTimeout(1500);
  const before = await grow(pg);
  await pg.getByText('Matches', { exact: true }).first().click(); await pg.waitForTimeout(500);
  await pg.getByText('Alex Chen').first().click(); await pg.waitForTimeout(600);
  await pg.locator('[data-screen-label="Match Detail"] .rw-appbar-title button').last().click(); await pg.waitForTimeout(300);
  await pg.getByText('Delete Match', { exact: true }).first().click(); await pg.waitForTimeout(400);
  await pg.getByRole('button', { name: 'Delete', exact: true }).last().click(); await pg.waitForTimeout(800);
  await pg.getByText('Insights', { exact: true }).first().click(); await pg.waitForTimeout(1500);
  const after = await grow(pg);
  ok(server.aiCalls === 2 && after.keyTitle && !NOT_ENOUGH.test(after.keyTitle) && JSON.stringify(after) !== JSON.stringify(before),
    `delete: regenerated on 5 matches (${server.aiCalls} calls): "${after.keyTitle}" | ${JSON.stringify(after.build)}`);
  await shot(pg, 'en', '9-after-delete.png');
  ok(!pg.errs.length, `delete: no console errors ${pg.errs.join(' | ')}`);
  await pg.close(); }
}
// 8b. A match is edited (Return added under What Cost Points): the insight is taken down and remade, and Return,
// now noted in 2 matches, joins Build Next as a confirmed item.
if (!process.env.ONLY || process.env.ONLY === 'edit') for (const lang of ['en', 'zh']) {
  const zh = lang === 'zh';
  server.row = null; server.aiCalls = 0;
  const pg = await open(lang, 'han'); await pg.waitForTimeout(1500);
  const before = await grow(pg);
  await pg.getByText(zh ? '比赛' : 'Matches', { exact: true }).first().click(); await pg.waitForTimeout(500);
  await pg.getByText('Alex Chen').first().click(); await pg.waitForTimeout(600);
  await pg.locator('[data-screen-label="Match Detail"] .rw-appbar-title button').last().click(); await pg.waitForTimeout(300);
  await pg.getByText(zh ? '编辑比赛' : 'Edit Match', { exact: true }).first().click(); await pg.waitForTimeout(800);
  await pg.getByText('杀球靠边线效果很好', { exact: true }).first().click(); await pg.waitForTimeout(700); // the Notes row of this match
  await pg.getByRole('button', { name: zh ? '接发' : 'Return', exact: true }).nth(1).click(); await pg.waitForTimeout(200);
  await pg.getByRole('button', { name: zh ? '保存' : 'Save', exact: true }).last().click(); await pg.waitForTimeout(500);
  await pg.getByRole('button', { name: zh ? '保存修改' : 'Save Changes', exact: true }).last().click(); await pg.waitForTimeout(900);
  const db = await pg.evaluate(() => JSON.parse(localStorage.getItem('mock.db')));
  const edited = db.matches.filter(m => (m.lt || []).includes('Return')).length;
  const tab = pg.getByText(zh ? '洞察' : 'Insights', { exact: true });
  for (let i = 0; i < 4 && !(await tab.first().isVisible().catch(() => false)); i++) { await pg.locator('.rw-appbar-title button').first().click(); await pg.waitForTimeout(400); }
  await tab.first().click(); await pg.waitForTimeout(1800);
  const after = await grow(pg);
  const ret = after.build.find(b => b[0] === (zh ? '接发' : 'Return'));
  ok(edited === 2 && ret && !/Early sign|初步观察/.test(ret[1]) && !before.build.some(b => b[0] === (zh ? '接发' : 'Return')),
    `${lang} edit: Return now noted in ${edited} matches; Build Next before ${JSON.stringify(before.build.map(b => b[0]))}, after ${JSON.stringify(after.build.map(b => b[0] + ': ' + b[1]))}`);
  ok(!pg.errs.length, `${lang} edit: no console errors ${pg.errs.join(' | ')}`);
  await shot(pg, lang, '15-after-edit.png'); await pg.close();
}
// 9. Focus integration: Add to Focus from Build Next. The card leaves at once, the Focus is saved with the
// engine's topic, and the next insight (Focus is part of its input) leaves that skill out of Build Next.
if (!process.env.ONLY || process.env.ONLY === 'focus') for (const lang of ['en', 'zh']) {
  const zh = lang === 'zh';
  server.row = null; server.aiCalls = 0;
  const pg = await open(lang, 'steady'); await pg.waitForTimeout(1500);
  const before = await grow(pg);
  const first = before.build[0][0];
  await pg.locator('.rw-advice.is-half').first().locator('button').click(); await pg.waitForTimeout(500);
  await pg.locator('.rw-sheet button', { hasText: zh ? '添加训练目标' : 'Add to Focus' }).last().click(); await pg.waitForTimeout(800);
  const db = await pg.evaluate(() => JSON.parse(localStorage.getItem('mock.db')));
  const f = (db.focuses || []).find(x => x.title === first);
  ok(f && f.status === 'active' && f.topicId === 'tag:Serve', `${lang} focus: "${first}" saved as active Focus, topic ${f && f.topicId}`);
  await pg.getByText(zh ? '目标' : 'Focus', { exact: true }).first().click(); await pg.waitForTimeout(500);
  await pg.getByText(zh ? '洞察' : 'Insights', { exact: true }).first().click(); await pg.waitForTimeout(300);
  await pg.getByRole('tab', { name: zh ? '提升' : 'Grow', exact: true }).first().click(); await pg.waitForTimeout(1500);
  const after = await grow(pg);
  ok(!after.build.some(b => b[0] === first) && after.strengths.length === before.strengths.length, `${lang} focus: ${first} no longer in Build Next (${JSON.stringify(after.build.map(b => b[0]))}), Strengths unchanged`);
  // The insight on screen predates the Focus, so the app hides the card itself (openRecs). The next insight the
  // function makes (Focus is part of its input) leaves the topic out too.
  const fresh = JSON.parse(await edge(lang, JSON.stringify(await pg.evaluate(() => JSON.parse(localStorage.getItem('mock.db'))))));
  // v14: coming back to Grow already re-checked the insight, so the one made with the Focus may be the cached one now.
  ok(!fresh.insight.buildNext.some(b => b.topic_id === 'tag:Serve') && !/^pattern:cost:Serve/.test(fresh.insight.keyInsight.candidate_id || ''), `${lang} focus: the insight made with the Focus (cached ${fresh.cached}) leaves the active Focus topic out of Build Next and the Key Insight: ${JSON.stringify(fresh.insight.buildNext.map(b => b.topic_id))} / ${fresh.insight.keyInsight.candidate_id}`);
  await shot(pg, lang, '10-after-add-to-focus.png');
  ok(!pg.errs.length, `${lang} focus: no console errors ${pg.errs.join(' | ')}`);
  await pg.close();
}
// 10. Performance tab and layout on iPhone-sized screens (SE 375x667, 14 390x844), EN and ZH.
if (!process.env.ONLY || process.env.ONLY === 'layout') for (const lang of ['en', 'zh']) for (const vp of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  const zh = lang === 'zh', tag = `${lang} ${vp.width}`;
  const perf = pg => pg.evaluate(() => { const t = s => (s ? s.textContent.trim() : ''); const p = document.querySelector('[data-screen-label="Performance"]');
    return p && { win: t(p.querySelector('.rw-metric-value')), delta: t(p.querySelector('.rw-trend')), rows: [...p.querySelectorAll('.rw-breakdown')].map(r => t(r)), text: p.innerText }; });
  const layout = pg => pg.evaluate(() => {
    const over = document.documentElement.scrollWidth > window.innerWidth + 1;
    const sc = [...document.querySelectorAll('*')].filter(e => { const st = getComputedStyle(e); return /(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 4; }).sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (sc) sc.scrollTop = sc.scrollHeight;
    return new Promise(r => setTimeout(() => {
      const nav = [...document.querySelectorAll('nav, [class*="bottom-nav"], [class*="tabbar"]')].map(e => e.getBoundingClientRect()).filter(b => b.height > 30 && b.bottom >= window.innerHeight - 40).sort((a, b) => a.top - b.top)[0];
      const tiles = [...document.querySelectorAll('[data-screen-label="Grow"] .rw-tile, [data-screen-label="Performance"] .rw-tile')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect());
      const last = tiles.sort((a, b) => b.bottom - a.bottom)[0];
      const halves = [...document.querySelectorAll('.rw-advice.is-half')].map(e => e.getBoundingClientRect());
      const rows = {}; for (const b of halves) (rows[Math.round(b.top)] ||= []).push(b);
      const gaps = Object.values(rows).filter(x => x.length === 2).map(([a, b]) => Math.round(Math.abs(b.left - a.right) < Math.abs(a.left - b.right) ? b.left - a.right : a.left - b.right));
      r({ over, navTop: nav ? Math.round(nav.top) : null, lastBottom: last ? Math.round(last.bottom) : null, perRow: Object.values(rows).map(x => x.length), gaps });
    }, 400));
  });
  server.row = null;
  let pg = await open(lang, 'one', { __vp: vp }); await pg.getByRole('tab', { name: zh ? '表现' : 'Performance', exact: true }).first().click(); await pg.waitForTimeout(500);
  let p = await perf(pg);
  ok(p && !/100%/.test(p.delta) && !/NaN|undefined|Infinity/.test(p.text) && p.win === '—', `${tag} one level match: Win Rate "${p && p.win}", change "${p && p.delta}"`);
  await shot(pg, lang, `12-performance-one-${vp.width}.png`); await pg.close();
  pg = await open(lang, 'han17', { __vp: vp }); await pg.getByRole('tab', { name: zh ? '表现' : 'Performance', exact: true }).first().click(); await pg.waitForTimeout(500);
  p = await perf(pg); let L = await layout(pg);
  ok(p && /\d+%/.test(p.win) && (zh ? /较前 9 场/ : /vs prev 9/).test(p.delta) && !/NaN|undefined/.test(p.text), `${tag} han17 Performance: Win Rate ${p && p.win}, "${p && p.delta}"`);
  ok(!L.over && (L.navTop == null || L.lastBottom <= L.navTop), `${tag} Performance layout: no sideways scroll (${L.over}), last tile ends ${L.lastBottom} above the nav at ${L.navTop}`);
  await shot(pg, lang, `13-performance-${vp.width}.png`);
  await pg.getByRole('tab', { name: zh ? '提升' : 'Grow', exact: true }).first().click(); await pg.waitForTimeout(1800);
  L = await layout(pg);
  ok(!L.over && JSON.stringify(L.perRow) === '[2,2]' && L.gaps.every(x => x === 10) && (L.navTop == null || L.lastBottom <= L.navTop), `${tag} Grow layout: Build Next rows ${JSON.stringify(L.perRow)}, gaps ${L.gaps}, last tile ${L.lastBottom} / nav ${L.navTop}, sideways ${L.over}`);
  // Tab switching back and forth: answered from the cache, no new model call, no flash of the loading tile.
  const calls = server.aiCalls, seen = [];
  for (let i = 0; i < 2; i++) {
    await pg.getByRole('tab', { name: zh ? '表现' : 'Performance', exact: true }).first().click(); await pg.waitForTimeout(300);
    await pg.getByRole('tab', { name: zh ? '提升' : 'Grow', exact: true }).first().click(); await pg.waitForTimeout(80); seen.push((await grow(pg)).keyTitle); await pg.waitForTimeout(700);
  }
  ok(server.aiCalls === calls && !seen.some(t => /Looking at your matches|正在分析/.test(t)), `${tag} tab switches: ${server.aiCalls - calls} new model calls, Key on return ${JSON.stringify(seen)}`);
  ok(!pg.errs.length, `${tag} layout: no console errors ${pg.errs.join(' | ')}`);
  await shot(pg, lang, `14-grow-${vp.width}.png`); await pg.close();
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
