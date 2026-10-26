// iOS native voice input in the real app UI, with a FAKE Capacitor shell: window.Capacitor plus a
// SpeechRecognition plugin that copies @capacitor-community/speech-recognition 7's iOS event order
// (partialResults carry the whole session's text; stop() emits 'stopped', then the final result and a
// second 'stopped'; Apple ending a session emits the final result and 'stopped'). It checks the app's
// JS logic only. It is not an iPhone test: real audio, permissions and Apple's recognizer need a device.
//   cd <repo>/project && python3 -m http.server 8123 &   then   node native-voice-e2e.mjs [outdir]
import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const HERE = import.meta.dirname, MOCK = fs.readFileSync(path.join(HERE, 'mock-backend.js'), 'utf8');
const OUT = process.argv[2] || path.join(HERE, '..', 'out', 'native-voice');

const FAKE_SHELL = () => {
  const L = {}, S = window.__sr = { perm: 'prompt', grant: 'granted', running: false, text: '', starts: [], stops: 0, failStart: null, live: 0 };
  const emit = (n, d) => (L[n] || []).forEach(f => f(d));
  const plugin = {
    checkPermissions: async () => ({ speechRecognition: S.perm }),
    requestPermissions: async () => { S.perm = S.grant; return { speechRecognition: S.perm }; },
    start: async o => {
      if (S.perm !== 'granted') throw new Error('Missing permission');
      if (S.failStart) throw new Error(S.failStart);
      if (S.running) throw new Error('Ongoing speech recognition');
      S.running = true; S.text = ''; S.starts.push(o); emit('listeningState', { status: 'started' });
    },
    stop: async () => {
      S.stops++;
      if (!S.running) return;
      S.running = false; emit('listeningState', { status: 'stopped' });
      setTimeout(() => { if (S.text) emit('partialResults', { matches: [S.text] }); emit('listeningState', { status: 'stopped' }); }, 200);
    },
    addListener: async (n, f) => { (L[n] = L[n] || []).push(f); S.live++; return { remove: () => { L[n] = L[n].filter(g => g !== f); S.live--; } }; },
  };
  // Test controls: say more words, or have Apple end the session (pause, ~1 minute, error).
  window.__say = t => { if (!S.running) return; S.text += t; emit('partialResults', { matches: [S.text] }); };
  window.__appleEnd = () => { if (!S.running) return; S.running = false; emit('listeningState', { status: 'stopped' }); };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: n => n === 'SpeechRecognition', Plugins: { SpeechRecognition: plugin } };
};
const SEED = lang => { localStorage.clear(); localStorage.setItem('mock.session', '1');
  localStorage.setItem('mock.db', JSON.stringify({ onboarded: true, prefs: { reminders: true, insights: true, usage: false, consentAsked: true, lang }, players: [{ id: 'me', name: 'Han', level: null }], matches: [] })); };

const results = []; let failed = 0;
const check = (name, ok, info) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  ' + JSON.stringify(info)}`); if (!ok) failed++; };
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
async function open(lang, { native = true, web = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
  await ctx.route('https://unpkg.com/**', async r => { const res = await r.fetch({ url: r.request().url().replace('https://unpkg.com/', 'https://cdn.jsdelivr.net/npm/') }); await r.fulfill({ response: res }); });
  await ctx.route('**/rallywise-backend.js', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  if (native) await ctx.addInitScript(FAKE_SHELL);
  if (web) await ctx.addInitScript(() => {
    window.__web = { made: 0 };
    window.SpeechRecognition = window.webkitSpeechRecognition = class { constructor() { window.__web.made++; window.__web.r = this; } start() { window.__web.lang = this.lang; } stop() { setTimeout(() => this.onend && this.onend(), 50); } abort() {} };
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => check(`${lang}: no page errors`, false, String(e)));
  await pg.goto('http://localhost:8123/assets/rallywise-mark.svg');
  await pg.evaluate(SEED, lang);
  await pg.goto('http://localhost:8123/Badminton%20Tracker.dc.html?voiceMode=real', { waitUntil: 'networkidle' });
  await pg.waitForSelector('.rw-rec-btn', { timeout: 15000 });
  return { ctx, pg };
}
const text = pg => pg.$eval('.rw-voice-text', e => e.value);
const live = pg => pg.$eval('.rw-rec-btn', e => e.getAttribute('aria-pressed'));
const toast = pg => pg.evaluate(() => document.body.innerText);
const tap = pg => pg.click('.rw-rec-btn');
const sr = pg => pg.evaluate(() => ({ ...window.__sr }));
const shot = async (pg, lang, f) => { fs.mkdirSync(path.join(OUT, lang), { recursive: true }); await pg.screenshot({ path: path.join(OUT, lang, f) }); };

for (const lang of ['en', 'zh']) {
  const T = lang === 'zh'
    ? { a: '我和小明打单打，', b: '第一局21比15赢了', c: '网前打得好', blocked: '没有麦克风或语音识别权限', nothing: '没有识别到内容', failed: '语音识别中断了', want: '我和小明打单打，第一局21比15赢了' }
    : { a: 'I played singles with Alex', b: 'won the first game 21 15', c: 'my net play was good', blocked: 'can’t use the microphone or speech recognition', nothing: 'Nothing was recognised', failed: 'Speech recognition stopped', want: 'I played singles with Alex won the first game 21 15' };
  // 1. First use: permission prompt, live text, Apple ends a session after a minute, Stop keeps everything.
  let { ctx, pg } = await open(lang);
  await tap(pg); await wait(300);
  let s = await sr(pg);
  check(`${lang}: asks permission, then starts Apple's recognizer in ${lang === 'zh' ? 'zh-CN' : 'en-US'}`, s.perm === 'granted' && s.starts.length === 1 && s.starts[0].language === (lang === 'zh' ? 'zh-CN' : 'en-US') && s.starts[0].partialResults === true, s);
  check(`${lang}: shows recording`, await live(pg) === 'true');
  await pg.evaluate(t => window.__say(t), T.a); await wait(100);
  check(`${lang}: live transcription`, await text(pg) === T.a, await text(pg));
  await shot(pg, lang, '1-recording.png');
  await pg.evaluate(() => window.__appleEnd()); await wait(500);
  s = await sr(pg);
  check(`${lang}: Apple ends a session -> listens again, still recording`, s.starts.length === 2 && s.running && await live(pg) === 'true', s);
  await pg.evaluate(t => window.__say(t), T.b); await wait(100);
  check(`${lang}: second session joins the first`, await text(pg) === T.want, await text(pg));
  await wait(1200);
  check(`${lang}: timer runs`, /0:0[1-9]/.test(await pg.$eval('.rw-rec-timer', e => e.innerText)), await pg.$eval('.rw-rec-timer', e => e.innerText));
  await tap(pg); await wait(600);
  s = await sr(pg);
  check(`${lang}: Stop ends recording, keeps text, removes listeners`, await live(pg) === 'false' && await text(pg) === T.want && !s.running && s.live === 0, { t: await text(pg), s });
  await shot(pg, lang, '2-stopped.png');
  // 2. Repeat session: appends to the text already there.
  await tap(pg); await wait(300);
  await pg.evaluate(t => window.__say(t), T.c); await wait(100);
  await tap(pg); await wait(600);
  const sep = lang === 'zh' ? '' : ' ';
  check(`${lang}: second recording appends`, await text(pg) === T.want + sep + T.c && (await sr(pg)).starts.length === 3, await text(pg));
  // 3. Typing while recording stops the mic and keeps the words.
  await tap(pg); await wait(300);
  await pg.evaluate(() => window.__say(' extra'));
  await pg.click('.rw-voice-text'); await wait(300);
  s = await sr(pg);
  check(`${lang}: editing stops the mic, keeps visible text`, await live(pg) === 'false' && !s.running && s.live === 0 && (await text(pg)).endsWith('extra'), { t: await text(pg), s });
  await pg.fill('.rw-voice-text', 'typed by hand');
  check(`${lang}: manual edit works`, await text(pg) === 'typed by hand');
  // 4. App goes to background (call, home button): stops, keeps text.
  await wait(1100);
  await tap(pg); await wait(300);
  await pg.evaluate(() => window.__say(' then a call came'));
  await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await wait(600);
  check(`${lang}: background/interruption stops and keeps text`, await live(pg) === 'false' && (await text(pg)).includes('then a call came') && !(await sr(pg)).running, await text(pg));
  await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  // 5. Empty session: nothing said.
  await pg.fill('.rw-voice-text', '');
  await tap(pg); await wait(300); await tap(pg); await wait(1700);
  check(`${lang}: nothing heard -> "${T.nothing}" toast, not recording`, (await toast(pg)).includes(T.nothing) && await live(pg) === 'false');
  await shot(pg, lang, '3-nothing.png');
  // 6. Sessions that die at once (no network / mic busy) three times: stop with an error, no endless loop.
  await wait(3500);
  await tap(pg); await wait(300);
  for (let i = 0; i < 3; i++) { await pg.evaluate(() => window.__appleEnd()); await wait(400); }
  s = await sr(pg);
  check(`${lang}: repeated instant failures stop with "${T.failed}"`, (await toast(pg)).includes(T.failed) && await live(pg) === 'false' && !s.running, s);
  // 7. Start rejected (mic used by another app).
  await wait(3500);
  await pg.evaluate(() => { window.__sr.failStart = 'Microphone is already in use by another application.'; });
  await tap(pg); await wait(400);
  check(`${lang}: start rejected -> error toast, idle`, (await toast(pg)).includes(T.failed) && await live(pg) === 'false');
  await pg.evaluate(() => { window.__sr.failStart = null; });
  // 8. Continue while recording: final words kept, then the parse step runs.
  await wait(3500);
  await tap(pg); await wait(300);
  await pg.evaluate(t => window.__say(t), T.a); await wait(100);
  await pg.click('.rw-rec-link');
  await wait(1500);
  // The mock backend has no AI parser, so moving on ends at its "not set up" toast or at Review.
  s = await sr(pg);
  check(`${lang}: Continue while recording stops the mic, keeps the words and moves on to parsing`, !s.running && s.live === 0 && (await pg.$('.rw-rec-btn') === null || (await live(pg) === 'false' && await text(pg) === T.a)), { s, t: await pg.$('.rw-rec-btn') && await text(pg) });
  await shot(pg, lang, '4-continue.png');
  await ctx.close();

  // 9. Permission denied.
  ({ ctx, pg } = await open(lang));
  await pg.evaluate(() => { window.__sr.grant = 'denied'; });
  await tap(pg); await wait(400);
  s = await sr(pg);
  check(`${lang}: denied permission -> settings toast, never starts`, (await toast(pg)).includes(T.blocked) && await live(pg) === 'false' && s.starts.length === 0 && s.live === 0, s);
  await shot(pg, lang, '5-denied.png');
  await wait(3500);
  await tap(pg); await wait(400);
  check(`${lang}: tapping again after denial shows the toast again`, (await toast(pg)).includes(T.blocked) && (await sr(pg)).starts.length === 0);
  await ctx.close();

  // 10. Web (no Capacitor): the browser recognizer path, unchanged.
  ({ ctx, pg } = await open(lang, { native: false, web: true }));
  await tap(pg); await wait(300);
  const w = await pg.evaluate(() => ({ made: window.__web.made, lang: window.__web.lang }));
  check(`${lang}: Web still uses the browser recognizer`, w.made === 1 && w.lang === (lang === 'zh' ? 'zh-CN' : 'en-US'), w);
  await ctx.close();
}
await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED (fake shell; not a device test)');
process.exit(failed ? 1 : 0);
