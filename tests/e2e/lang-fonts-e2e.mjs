// Language default + bundled fonts, in the real app UI with the mock backend.
//  - First-time users see Log In / Sign Up in English whatever the device language (en-US and zh-CN devices).
//  - Onboarding Welcome picks English or 简体中文; the choice applies everywhere, is saved with the account and on the
//    device, survives a reload (app restart), Log Out and a later Log In, and onboarding does not repeat.
//  - Existing accounts keep their saved language on any device; accounts onboarded before a language was saved keep
//    what they saw (device copy, else device language) and it gets saved.
//  - Offline: with every non-local request blocked (a simulated offline iOS launch: the real Capacitor/WKWebView app
//    can only be tested on a device), the app still opens and draws its icons, Poppins and Noto Sans SC load from
//    assets/fonts, nothing is requested from a CDN or Google Fonts, and no font/network warning is shown.
//   cd <repo>/project && python3 -m http.server 8123 &   then   node lang-fonts-e2e.mjs [outdir]
import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const HERE = import.meta.dirname, MOCK = fs.readFileSync(path.join(HERE, 'mock-backend.js'), 'utf8');
const OUT = process.argv[2] || path.join(HERE, '..', 'out', 'lang-fonts'); fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8123/', URL = BASE + 'Badminton%20Tracker.dc.html';
const PROJECT = path.join(HERE, '..', '..', 'project');

let failed = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  ' + JSON.stringify(info)}`); if (!ok) failed++; };
const CJK = /[一-鿿]/;
const PREFS = { reminders: true, insights: true, usage: false, consentAsked: true };

const browser = await chromium.launch();
// offline: abort every request that isn't to the local server (Lucide icons then don't draw; fonts must).
async function open(locale, arg, { offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale });
  const external = [], errs = [];
  await ctx.route('**/*', async r => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return u.endsWith('/rallywise-backend.js') ? r.fulfill({ contentType: 'application/javascript', body: MOCK }) : r.continue();
    external.push(u);
    if (offline) return r.abort('internetdisconnected');
    // unpkg.com is blocked from this container; jsDelivr serves the same npm files (test-only).
    if (u.startsWith('https://unpkg.com/')) { const res = await r.fetch({ url: u.replace('https://unpkg.com/', 'https://cdn.jsdelivr.net/npm/') }); return r.fulfill({ response: res }); }
    return r.continue();
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(BASE + 'assets/rallywise-mark.svg'); await pg.evaluate(SEED, arg || {});
  await launch(pg);
  return { ctx, pg, external, errs };
}
const launch = async pg => { await pg.goto(URL, { waitUntil: 'load' }); await pg.waitForTimeout(3400); }; // splash
const screen = pg => pg.evaluate(() => [...document.querySelectorAll('[data-screen-label]')].map(e => e.dataset.screenLabel).filter(l => l !== 'Phone')[0]);
const text = pg => pg.evaluate(() => document.querySelector('.phone').innerText);
const htmlLang = pg => pg.evaluate(() => document.documentElement.lang);
const db = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('mock.db') || 'null'));
const devLang = pg => pg.evaluate(() => localStorage.getItem('rallywise.lang'));
const toasts = pg => pg.evaluate(() => [...document.querySelectorAll('.toast')].map(e => e.innerText));
const seed = (dbv, extra) => ({ db: dbv, extra });
function SEED({ db: d, extra }) { localStorage.clear(); if (d) { localStorage.setItem('mock.session', '1'); localStorage.setItem('mock.db', JSON.stringify(d)); } localStorage.setItem('mock.noai', 'true'); for (const k in extra || {}) localStorage.setItem(k, extra[k]); }
const account = (lang, onboarded = true) => ({ onboarded, prefs: lang ? { ...PREFS, lang } : { ...PREFS }, players: [{ id: 'me', name: 'Han', level: 'Intermediate' }], matches: [], focuses: [], focusPeriods: [] });
async function logOut(pg) {
  const later = pg.locator('[data-screen-label="Share Usage Data"] button').last(); // the usage-data ask after onboarding
  if (await later.waitFor({ timeout: 2500 }).then(() => true, () => false)) { await later.click(); await pg.waitForTimeout(1000); }
  const item = pg.locator('.rw-menu-item').filter({ hasText: /Log Out|退出登录/ });
  for (let i = 0; i < 3 && !(await item.count()); i++) { await pg.locator('button[aria-label="Menu"], button[aria-label="菜单"]').first().click(); await pg.waitForTimeout(500); }
  await item.click(); await pg.waitForTimeout(800);
}
async function logIn(pg) {
  await pg.locator('input[type=email]').fill('han@example.com'); await pg.locator('input[autocomplete=current-password]').fill('secret123');
  await pg.locator('[data-screen-label="Log In"] .rw-btn-primary').click(); await pg.waitForTimeout(1200);
}

// ---- 1. First-time users: English Log In and Sign Up on English and Chinese devices
for (const locale of ['en-US', 'zh-CN']) {
  const { ctx, pg } = await open(locale);
  check(`${locale} first launch opens Log In`, await screen(pg) === 'Log In', await screen(pg));
  let t = await text(pg);
  check(`${locale} Log In is English`, !CJK.test(t) && /Log In/.test(t) && await htmlLang(pg) === 'en', t.slice(0, 120));
  await pg.screenshot({ path: `${OUT}/1-${locale}-login.png` });
  await pg.getByText('Sign Up', { exact: true }).last().click(); await pg.waitForTimeout(500);
  t = await text(pg);
  check(`${locale} Sign Up is English`, await screen(pg) === 'Sign Up' && !CJK.test(t), t.slice(0, 120));
  await ctx.close();
}

// ---- 2. Sign up on a Chinese device, choose 简体中文 in onboarding, then restart, log out and log back in
{
  const { ctx, pg, errs } = await open('zh-CN');
  await pg.getByText('Sign Up', { exact: true }).last().click(); await pg.waitForTimeout(400);
  await pg.locator('[data-screen-label="Sign Up"] input[autocomplete=name]').fill('Han');
  await pg.locator('[data-screen-label="Sign Up"] input[type=email]').fill('han@example.com');
  await pg.locator('[data-screen-label="Sign Up"] input[type=password]').first().fill('secret123');
  await pg.locator('[data-screen-label="Sign Up"] .rw-checkbox, [data-screen-label="Sign Up"] [role=checkbox]').first().click();
  await pg.locator('[data-screen-label="Sign Up"] .rw-btn-primary').click(); await pg.waitForTimeout(1500);
  check('sign-up opens onboarding Welcome', await screen(pg) === 'Onboarding · Welcome', await screen(pg));
  const W = pg.locator('[data-screen-label="Onboarding · Welcome"]');
  const opts = await W.locator('[role=radio]').evaluateAll(es => es.map(e => [e.innerText.trim(), e.getAttribute('aria-checked')]));
  check('Welcome offers English (selected) and 简体中文', JSON.stringify(opts) === JSON.stringify([['English', 'true'], ['简体中文', 'false']]), opts);
  check('Welcome starts in English', !CJK.test((await text(pg)).replace('简体中文', '')));
  await W.getByText('简体中文').click(); await pg.waitForTimeout(500);
  check('choosing 简体中文 switches the app at once', CJK.test(await text(pg)) && await htmlLang(pg) === 'zh-Hans', await htmlLang(pg));
  await pg.screenshot({ path: `${OUT}/2-welcome-zh.png` });
  await pg.locator('.rw-btn-primary').click(); await pg.waitForTimeout(400);
  await pg.locator('[data-screen-label="Onboarding · Profile"] .rw-input-row-input').fill('徐涵');
  await pg.locator('[data-screen-label="Onboarding · Profile"] button.rw-input-row').click(); await pg.waitForTimeout(300);
  await pg.locator('.rw-select-option').nth(1).click(); await pg.waitForTimeout(300);
  await pg.locator('.rw-btn-primary').click(); await pg.waitForTimeout(400);
  await pg.locator('.rw-btn-social').click(); await pg.waitForTimeout(1200);
  let d = await db(pg);
  check('finished onboarding saves lang zh with the account', d && d.onboarded && d.prefs.lang === 'zh', d && d.prefs);
  check('and on the device', await devLang(pg) === 'zh');
  check('Matches in Chinese', await screen(pg) === 'Matches' && CJK.test(await text(pg)));
  await launch(pg); // app restart
  check('restart: Matches in Chinese, no onboarding', await screen(pg) === 'Matches' && await htmlLang(pg) === 'zh-Hans', await screen(pg));
  await pg.screenshot({ path: `${OUT}/3-restart-zh.png` });
  await logOut(pg);
  check('Log Out keeps Chinese on Log In', await screen(pg) === 'Log In' && CJK.test(await text(pg)), await screen(pg));
  await pg.screenshot({ path: `${OUT}/4-logout-zh.png` });
  await launch(pg);
  check('restart after Log Out: Log In still Chinese', await screen(pg) === 'Log In' && await htmlLang(pg) === 'zh-Hans');
  await logIn(pg);
  d = await db(pg);
  check('log back in: Chinese Matches, onboarding not repeated', await screen(pg) === 'Matches' && CJK.test(await text(pg)) && d.onboarded, await screen(pg));
  check('no font warning toast', !(await toasts(pg)).some(x => /font|字体/i.test(x)), await toasts(pg));
  check('no console errors', !errs.length, errs);
  await ctx.close();
}

// ---- 3. Existing accounts keep their saved language on a new device, whatever the device language
for (const [locale, lang] of [['en-US', 'zh'], ['zh-CN', 'en']]) {
  const { ctx, pg } = await open(locale);
  await pg.evaluate(d => localStorage.setItem('mock.db', JSON.stringify(d)), account(lang));
  await logIn(pg);
  const t = await text(pg);
  check(`saved ${lang} account on a ${locale} device logs in to ${lang}`, await screen(pg) === 'Matches' && CJK.test(t) === (lang === 'zh'), await screen(pg));
  check(`  device copy becomes ${lang}`, await devLang(pg) === lang);
  await ctx.close();
}
// Signed-in existing account with a saved language, restored at launch (the account wins over the device copy).
{
  const { ctx, pg } = await open('en-US', seed(account('zh'), { 'rallywise.lang': 'en' }));
  check('restored zh account opens in Chinese', await screen(pg) === 'Matches' && await htmlLang(pg) === 'zh-Hans', await screen(pg));
  await ctx.close();
}
// Accounts onboarded before the language was saved keep what they saw, and it is saved now.
for (const [locale, extra, want] of [['zh-CN', {}, 'zh'], ['en-US', {}, 'en'], ['zh-CN', { 'rallywise.lang': 'en' }, 'en']]) {
  const { ctx, pg } = await open(locale, seed(account(null), extra));
  await pg.waitForTimeout(1500);
  const d = await db(pg);
  check(`legacy account (${locale}, device copy ${extra['rallywise.lang'] || 'none'}) keeps ${want} and saves it`, await screen(pg) === 'Matches' && (await htmlLang(pg) === (want === 'zh' ? 'zh-Hans' : 'en')) && d.prefs.lang === want, { s: await screen(pg), p: d.prefs });
  await ctx.close();
}

// ---- 4. Offline launch: bundled fonts, nothing from Google Fonts, no warnings
const refs = execSync(`grep -rlE "fonts\\.(googleapis|gstatic)\\.com" "${PROJECT}" --include=*.html --include=*.css --include=*.js || true`).toString().trim();
check('no app file references Google Fonts', !refs, refs.split('\n'));
for (const lang of ['en', 'zh']) {
  const { ctx, pg, external, errs } = await open('en-US', seed(account(lang), { 'rallywise.lang': lang }), { offline: true });
  const fonts = await pg.evaluate(async () => {
    await document.fonts.ready;
    const want = ['300', '400', '500', '600', '700'].map(w => `${w} 16px Poppins`).concat(['400', '500', '600'].map(w => `${w} 16px "Noto Sans SC"`));
    const r = {}; for (const f of want) { const got = await document.fonts.load(f, f.includes('Noto') ? '比赛洞察' : 'Rallywise 21'); r[f] = got.some(x => x.status === 'loaded'); }
    return r;
  });
  check(`offline ${lang}: every Poppins and Noto Sans SC weight loads from the app`, Object.values(fonts).every(Boolean), fonts);
  check(`offline ${lang}: app opens on Matches in ${lang}`, await screen(pg) === 'Matches' && CJK.test(await text(pg)) === (lang === 'zh'), await screen(pg));
  check(`offline ${lang}: Lucide icons draw`, await pg.locator('.phone svg').count() > 3);
  check(`offline ${lang}: nothing requested off the device (no CDN, no Google Fonts)`, !external.length, external);
  const used = await pg.evaluate(() => getComputedStyle(document.body).fontFamily + ' | ' + getComputedStyle(document.documentElement).getPropertyValue('--font-sans'));
  check(`offline ${lang}: Chinese stack falls back to PingFang SC`, lang === 'en' || /Noto Sans SC.*PingFang SC.*\|.*Noto Sans SC.*PingFang SC/.test(used), used);
  check(`offline ${lang}: no font/network warning toast`, !(await toasts(pg)).some(x => /font|字体/i.test(x)), await toasts(pg));
  check(`offline ${lang}: no font errors in console`, !errs.some(e => /font|noto/i.test(e)), errs.filter(e => /font|noto/i.test(e)));
  await pg.screenshot({ path: `${OUT}/5-offline-${lang}.png` });
  await ctx.close();
}

await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
