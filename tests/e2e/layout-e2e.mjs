// Shared iOS layout in the real app UI (Han 2026-10-26): every V2 screen at several iPhone sizes, EN and ZH, with the
// phone's safe areas emulated (Chromium's Emulation.setSafeAreaInsetsOverride, so env(safe-area-inset-*) is live).
// Checks the shell, not one page: one app background on every layer the phone can show, the document never scrolls or
// rubber-bands (only the app's own scroller does), the shell is exactly the dynamic viewport, the App bar, ⋯ menu,
// Bottom Nav, sheets and footers stay out of the status bar / home indicator, long pages scroll to their last item
// above the nav, nothing is wider than the screen, and Back still restores the list position.
// It is not an iPhone test: WKWebView's native bounce and keyboard need a device (scripts/sync-ios-web.sh + Xcode).
//   cd <repo>/project && python3 -m http.server 8123 &   then   node layout-e2e.mjs [en|zh|all] [outdir]
import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const HERE = import.meta.dirname, MOCK = fs.readFileSync(path.join(HERE, 'mock-backend.js'), 'utf8');
const LANGS = !process.argv[2] || process.argv[2] === 'all' ? ['en', 'zh'] : [process.argv[2]];
const OUT = process.argv[3] || path.join(HERE, '..', 'out', 'layout');
// name, CSS width x height, safe area top / bottom (portrait)
const PHONES = [['iPhone SE', 375, 667, 20, 0], ['iPhone 13 mini', 375, 812, 50, 34], ['iPhone 14', 390, 844, 47, 34],
  ['iPhone 15', 393, 852, 59, 34], ['iPhone 16 Pro', 402, 874, 62, 34], ['iPhone 16 Pro Max', 440, 956, 62, 34]];
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };

const M = (i, t) => ({ id: 'm' + i, date: `2026-10-${String(i + 1).padStart(2, '0')}`, type: t, partner: t === 'Doubles' ? 'p1' : null, opps: t === 'Doubles' ? ['p2', 'p3'] : ['p' + (1 + (i % 6))],
  games: [[21, 17], [18, 21], [21, 19]], wt: ['Smash'], lt: ['Serve'], worked: 'Net play', lost: 'Serve', on: '', createdAt: `2026-10-${String(i + 1).padStart(2, '0')}T12:00:00.000Z` });
const F = (i, zh) => ({ id: 'f' + i, title: (zh ? '训练目标 ' : 'Focus ') + i, source: 'manual', type: 'practice', status: 'active', completedBy: null, completedAt: null, goal: '', cues: [], createdAt: '2026-10-20T09:00:00.000Z',
  plan: { periodType: 'week', target: 2, periods: 4, start: '2026-10-20', startedAt: '2026-10-20T09:00:00.000Z' } });
const db = lang => ({ onboarded: true, prefs: { lang, insights: true, consentAsked: true },
  players: [{ id: 'me', name: 'Han Li', level: 'Intermediate' }, ...['Alex Chen', 'Bo Wu', 'Cy Lo', 'Dee Ng', 'Eli Park', 'Fay Tan', 'Gus Lim', 'Hui Zhang', 'Ivy Ho', 'Jon Lee', 'Kai Sun', 'Lin Yu'].map((name, i) => ({ id: 'p' + (i + 1), name }))],
  matches: Array.from({ length: 16 }, (_, i) => M(i, i % 3 ? 'Singles' : 'Doubles')), focuses: Array.from({ length: 9 }, (_, i) => F(i + 1, lang === 'zh')), focusPeriods: [] });
// screen state, extra state; tab = has the Bottom Nav
const SCREENS = [['matches', {}, 1], ['insights', {}, 1], ['focus', {}, 1], ['settings'], ['profile'], ['account'], ['password'], ['language'], ['notifications'], ['privacy'],
  ['players'], ['player', { playerId: 'p1' }], ['detail', { detailId: 'm3' }], ['focusDetail', { focusId: 'f1' }]];
const APP = () => { const el = document.querySelector('.phone *'); const k = Object.keys(el).find(k => k.startsWith('__reactFiber$')); let f = el[k]; while (f && !(f.stateNode && f.stateNode.logic && typeof f.stateNode.logic.go === 'function')) f = f.return; return f.stateNode.logic; };

// Everything measured in one pass, in CSS px of the viewport.
const MEASURE = () => {
  const H = innerHeight, W = innerWidth, cs = e => getComputedStyle(e), q = s => document.querySelector(s);
  const px = v => { const d = document.createElement('div'); d.style.cssText = `position:fixed;visibility:hidden;height:${v}`; document.body.appendChild(d); const h = d.getBoundingClientRect().height; d.remove(); return h; };
  const safe = { top: px('env(safe-area-inset-top,0px)'), bottom: px('env(safe-area-inset-bottom,0px)') };
  const sc = q('.rw-vt-page > div'), box = e => e && e.getBoundingClientRect();
  const bg = e => cs(e).backgroundColor;
  // the colour the screen paints: the scroller's own background colour (V2) under its glow image
  const screenBg = bg(sc) !== 'rgba(0, 0, 0, 0)' ? bg(sc) : bg(q('.phone'));
  const wide = [...sc.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 0.5 || r.left < -0.5) && !e.closest('.rw-hscroll,[style*="overflow-x:auto"],[style*="overflow-x: auto"]'); })
    .slice(0, 3).map(e => (e.className && e.className.baseVal === undefined ? e.className : e.tagName) + ' ' + Math.round(e.getBoundingClientRect().right));
  return { H, W, safe, screenBg, layers: { html: bg(document.documentElement), body: bg(document.body), stage: bg(q('.stage')), phone: bg(q('.phone')) },
    themeColor: (q('meta[name=theme-color]') || {}).content,
    docScroll: [document.documentElement.scrollHeight, document.documentElement.scrollWidth], overscroll: [cs(document.documentElement).overscrollBehaviorY, cs(document.body).overscrollBehaviorY],
    scOverscroll: cs(sc).overscrollBehaviorY, stage: box(q('.stage')), phone: box(q('.phone')), sc: box(sc), scroll: [sc.scrollHeight, sc.clientHeight, sc.scrollWidth, sc.clientWidth],
    bar: box(q('.rw-appbar-title') || q('.rw-appbar-action')), scrimH: box(q('.rw-appbar-scrim')) && box(q('.rw-appbar-scrim')).height,
    navItems: [...document.querySelectorAll('.rw-nav-item')].map(e => box(e).bottom), navTop: q('.rw-nav-bar') ? box(q('.rw-nav-bar')).top : null, wide };
};
// Bottom of the page's last visible block once the scroller is at its end.
const LAST = () => {
  const sc = document.querySelector('.rw-vt-page > div'); sc.scrollTop = sc.scrollHeight;
  let b = 0; sc.querySelectorAll('*').forEach(e => { const r = e.getBoundingClientRect(); if (r.height && cs(e)) b = Math.max(b, r.bottom); });
  function cs(e) { const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[aria-hidden="true"]'); }
  return { last: b, top: sc.scrollTop };
};

const b = await chromium.launch();
for (const lang of LANGS) for (const [phone, w, h, top, bottom] of PHONES) {
  const tag = `${lang} ${phone} ${w}x${h}`;
  const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
  await c.route('https://unpkg.com/**', async r => { const res = await r.fetch({ url: r.request().url().replace('https://unpkg.com/', 'https://cdn.jsdelivr.net/npm/') }); await r.fulfill({ response: res }); });
  await c.route('**/rallywise-backend.js', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  const pg = await c.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  const cdp = await c.newCDPSession(pg);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom, left: 0, right: 0 } });
  await pg.goto('http://localhost:8123/assets/rallywise-mark.svg');
  await pg.evaluate(d => { localStorage.clear(); localStorage.setItem('mock.session', '1'); localStorage.setItem('mock.db', JSON.stringify(d)); localStorage.setItem('mock.noai', 'true'); }, db(lang));
  await pg.goto('http://localhost:8123/Badminton%20Tracker.dc.html', { waitUntil: 'networkidle' }); await pg.waitForTimeout(3300);
  const go = (screen, extra) => pg.evaluate(([APPs, screen, extra]) => { const a = eval(APPs)(); a.setState({ screen: 'matches', back: [], menu: false, sheet: null }); a.setState({ screen, back: [{ screen: 'matches' }], ...extra }); }, [`(${APP})`, screen, extra || {}]);
  fs.mkdirSync(path.join(OUT, lang), { recursive: true });
  for (const [screen, extra, tab] of SCREENS) {
    await go(screen, extra); await pg.waitForTimeout(450);
    const m = await pg.evaluate(MEASURE), t = `${tag} ${screen}`;
    ok(m.safe.top === top && m.safe.bottom === bottom, `${t}: safe area emulated (${m.safe.top}/${m.safe.bottom})`);
    // Viewport: the shell is exactly the screen; the document itself never scrolls or bounces.
    for (const k of ['stage', 'phone', 'sc']) ok(Math.round(m[k].top) === 0 && Math.round(m[k].bottom) === m.H && Math.round(m[k].width) === m.W, `${t}: ${k} fills the screen exactly (${Math.round(m[k].top)}..${Math.round(m[k].bottom)} of ${m.H}, w ${Math.round(m[k].width)})`);
    ok(m.docScroll[0] <= m.H && m.docScroll[1] <= m.W, `${t}: document has nothing to scroll (${m.docScroll})`);
    ok(m.overscroll[0] === 'none', `${t}: page never rubber-bands as a whole (html overscroll-behavior ${m.overscroll[0]})`);
    ok(m.scOverscroll === 'contain', `${t}: the app scroller keeps its overscroll to itself (${m.scOverscroll})`);
    // Background: every layer that can show (under-page bounce, around the shell) is the screen's own colour.
    for (const [k, v] of Object.entries(m.layers)) ok(v === m.screenBg || (k === 'stage' && v === 'rgba(0, 0, 0, 0)'), `${t}: ${k} background ${v} = screen ${m.screenBg}`);
    // Safe areas: App bar below the status bar, scrim covers it, nav buttons clear the home indicator.
    ok(m.bar && m.bar.top >= Math.max(58, top) - 0.5, `${t}: App bar row at ${m.bar && Math.round(m.bar.top)} (>= max(58, safe ${top}))`);
    if (m.scrimH != null) ok(m.scrimH >= m.bar.bottom + 20, `${t}: scrim ${m.scrimH} covers the App bar (bottom ${Math.round(m.bar.bottom)}) and its fade`);
    if (tab) {
      ok(m.navItems.length === 3 && m.navItems.every(y => y <= m.H - bottom), `${t}: Bottom Nav buttons end above the home indicator (${m.navItems.map(Math.round)} <= ${m.H - bottom})`);
    }
    // Horizontal: nothing wider than the screen.
    ok(m.scroll[2] <= m.scroll[3] && !m.wide.length, `${t}: no horizontal overflow (${m.scroll[2]}/${m.scroll[3]} ${m.wide.join(', ')})`);
    // Long content: the last item scrolls clear of the nav (tab pages) or the home indicator, with the shared end space.
    const L = await pg.evaluate(LAST);
    const limit = tab ? m.navTop : m.H - bottom;
    ok(L.last <= limit + 0.5, `${t}: last item reachable (bottom ${Math.round(L.last)} <= ${Math.round(limit)}, scrolled ${L.top})`);
    if (m.scroll[0] > m.scroll[1]) ok(L.top > 0, `${t}: long page scrolls`);
    if (phone === 'iPhone 16 Pro' || phone === 'iPhone SE') { await pg.evaluate(() => { document.querySelector('.rw-vt-page > div').scrollTop = 0; }); await pg.waitForTimeout(250); await pg.screenshot({ path: path.join(OUT, lang, `${w}x${h}-${screen}.png`) }); }
  }
  // ⋯ menu below the App bar row; sheet footer clears the home indicator.
  await go('matches'); await pg.waitForTimeout(400);
  await pg.evaluate(() => { document.querySelector('.rw-vt-page > div').scrollTop = 0; });
  await pg.locator('.rw-appbar-action button').click(); await pg.waitForTimeout(400);
  const mm = await pg.evaluate(() => [document.querySelector('.rw-menu').getBoundingClientRect().top, document.querySelector('.rw-appbar-action').getBoundingClientRect().bottom]);
  ok(mm[0] >= mm[1] + 8, `${tag}: ⋯ menu opens below the App bar (${Math.round(mm[0])} vs ${Math.round(mm[1])})`);
  await pg.evaluate(([APPs]) => { const a = eval(APPs)(); a.setState({ menu: false }); a.openFocusSheet({}); }, [`(${APP})`]); await pg.waitForTimeout(500);
  const sh = await pg.evaluate(() => { const s = document.querySelector('.rw-sheet'), r = s.getBoundingClientRect(); return [r.bottom, parseFloat(getComputedStyle(s).paddingBottom), r.top]; });
  ok(Math.round(sh[0]) === h && sh[1] >= bottom && sh[2] >= top, `${tag}: sheet sits on the bottom edge, padding ${sh[1]} >= home indicator ${bottom}, top ${Math.round(sh[2])} below status bar`);
  await pg.evaluate(([APPs]) => eval(APPs)().setState({ sheet: null }), [`(${APP})`]); await pg.waitForTimeout(400);
  // Scroll restoration still works with the new shell: Matches scrolled, open a match, Back.
  await pg.evaluate(() => { document.querySelector('.rw-vt-page > div').scrollTop = 600; }); await pg.waitForTimeout(250);
  const y0 = await pg.evaluate(() => document.querySelector('.rw-vt-page > div').scrollTop);
  await pg.evaluate(([APPs]) => eval(APPs)().go('detail', { detailId: 'm5' }), [`(${APP})`]); await pg.waitForTimeout(700);
  await pg.evaluate(([APPs]) => eval(APPs)().goBack(), [`(${APP})`]); await pg.waitForTimeout(700);
  const y1 = await pg.evaluate(() => document.querySelector('.rw-vt-page > div').scrollTop);
  ok(y0 > 0 && y1 === y0, `${tag}: Back restores the Matches scroll (${y0} -> ${y1})`);
  // A window scroll (what WKWebView does when it bounces or reveals a field) never moves the app.
  await pg.evaluate(() => window.scrollTo(0, 200)); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => window.scrollY === 0 && document.querySelector('.phone').getBoundingClientRect().top === 0), `${tag}: the window cannot be scrolled away from the app`);
  ok(!errs.length, `${tag}: no page errors ${errs.join(' | ')}`);
  await c.close();
}
await b.close();
console.log(`${n - fails}/${n} passed` + (fails ? `, ${fails} FAILED` : ''));
process.exit(fails ? 1 : 0);
