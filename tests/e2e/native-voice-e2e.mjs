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

// Permissions copy the plugin's Swift code: checkPermissions reports Speech Recognition only; requestPermissions
// asks Speech Recognition (if undetermined), then, only if that is granted, the Microphone (if undetermined), and
// answers 'granted' only when both are; start() rejects 'Missing permission' (speech) or asks/rejects for the mic.
// Each iOS dialog is logged in S.dialogs and takes 300 ms; S.answer says what the user taps.
// flavor 'capgo7' is Capgo 7 (Capacitor 7 with SPM): same permissions as 'capgo'; stop() cancels at once and sends one
// listeningState {status:'stopped'}, no final text. flavor 'capgo' copies @capgo/capacitor-speech-recognition 8 instead (Capacitor 8 / SPM): checkPermissions reports
// both permissions together (denied if either is), start() rejects 'Missing speech recognition permission.' /
// 'User denied microphone access.', and a session ends with ONE listeningState {state:'stopped', status:'stopped'}
// after the final text (stop() first sends {state:'stoppingListening'}).
const FAKE_SHELL = ([flavor, opts]) => {
  const L = {}, S = window.__sr = { speech: 'prompt', mic: 'prompt', answer: { speech: 'granted', mic: 'granted' }, dialogs: [], running: false, text: '', starts: [], stops: 0, failStart: null, live: 0, ...(opts || {}) };
  const capgo = flavor.startsWith('capgo'), capgo7 = flavor === 'capgo7';
  const both = () => S.speech === 'denied' || S.mic === 'denied' ? 'denied' : S.speech === 'prompt' || S.mic === 'prompt' ? 'prompt' : 'granted';
  const STOPPED = capgo && !capgo7 ? { state: 'stopped', status: 'stopped', sessionId: 1, reason: 'results' } : { status: 'stopped' };
  const emit = (n, d) => (L[n] || []).forEach(f => f(d));
  const dialog = async k => { S.dialogs.push(k); S.inDialog = true; await new Promise(r => setTimeout(r, 300)); S.inDialog = false; S[k] = S.answer[k]; };
  const plugin = {
    checkPermissions: async () => ({ speechRecognition: capgo ? both() : S.speech }),
    requestPermissions: async () => {
      if (S.speech === 'prompt') await dialog('speech');
      if (S.speech !== 'granted') return { speechRecognition: S.speech };
      if (S.mic === 'prompt') await dialog('mic');
      return { speechRecognition: S.mic === 'granted' ? 'granted' : 'denied' };
    },
    start: async o => {
      if (S.speech !== 'granted') throw new Error(capgo ? 'Missing speech recognition permission.' : 'Missing permission');
      if (S.mic === 'prompt') await dialog('mic');
      if (S.mic !== 'granted') throw new Error(capgo ? 'User denied microphone access.' : 'User denied access to microphone');
      if (S.failStart) throw new Error(S.failStart);
      if (S.running) throw new Error('Ongoing speech recognition');
      S.running = true; S.text = ''; S.starts.push(o); emit('listeningState', { status: 'started' });
    },
    stop: async () => {
      S.stops++;
      if (!S.running) return;
      // Capgo 7: stop() cancels the task, so one 'stopped' and no final text.
      if (capgo7) { S.running = false; setTimeout(() => emit('listeningState', { status: 'stopped' }), 20); return; }
      S.running = false; emit('listeningState', capgo ? { state: 'stoppingListening', sessionId: 1, reason: 'userStop' } : { status: 'stopped' });
      setTimeout(() => { if (S.text) emit('partialResults', { matches: [S.text] }); emit('listeningState', STOPPED); }, 200);
    },
    addListener: async (n, f) => { (L[n] = L[n] || []).push(f); S.live++; return { remove: () => { L[n] = L[n].filter(g => g !== f); S.live--; } }; },
  };
  // Test controls: say more words, or have Apple end the session (pause, ~1 minute, error).
  window.__say = t => { if (!S.running) return; S.text += t; emit('partialResults', { matches: [S.text] }); };
  window.__appleEnd = () => { if (!S.running) return; S.running = false; emit('listeningState', STOPPED); };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: n => n === 'SpeechRecognition', Plugins: { SpeechRecognition: plugin } };
};
const SEED = lang => { localStorage.clear(); localStorage.setItem('mock.session', '1');
  localStorage.setItem('mock.db', JSON.stringify({ onboarded: true, prefs: { reminders: true, insights: true, usage: false, consentAsked: true, lang }, players: [{ id: 'me', name: 'Han', level: null }], matches: [] })); };

const results = []; let failed = 0;
const check = (name, ok, info) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  ' + JSON.stringify(info)}`); if (!ok) failed++; };
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
let FLAVOR = 'community';
async function open(lang, { native = true, web = false, plugin = true, sr = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
  await ctx.route('https://unpkg.com/**', async r => { const res = await r.fetch({ url: r.request().url().replace('https://unpkg.com/', 'https://cdn.jsdelivr.net/npm/') }); await r.fulfill({ response: res }); });
  await ctx.route('**/rallywise-backend.js', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  if (native) await ctx.addInitScript(FAKE_SHELL, [FLAVOR, sr]);
  if (native && !plugin) await ctx.addInitScript(() => { window.Capacitor.isPluginAvailable = () => false; delete window.Capacitor.Plugins.SpeechRecognition; });
  if (web) await ctx.addInitScript(() => {
    window.__web = { made: 0 };
    window.SpeechRecognition = window.webkitSpeechRecognition = class { constructor() { window.__web.made++; window.__web.r = this; } start() { window.__web.lang = this.lang; } stop() { setTimeout(() => this.onend && this.onend(), 50); } abort() {} };
  });
  const pg = await ctx.newPage();
  // Open Settings: Capacitor hands app-settings: to iOS; here, record the navigation the page asks for.
  pg.__nav = []; const cdp = await ctx.newCDPSession(pg); await cdp.send('Page.enable');
  cdp.on('Page.frameRequestedNavigation', e => pg.__nav.push(e.url));
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
const sheet = pg => pg.evaluate(() => { const e = document.querySelector('[data-screen-label="Voice permission"]'); return e ? e.querySelector('.rw-sheet-title').innerText : null; });
const back = pg => pg.evaluate(() => { for (const v of ['hidden', 'visible']) { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); } });
const shot = async (pg, lang, f) => { const d = path.join(OUT, FLAVOR, lang); fs.mkdirSync(d, { recursive: true }); await pg.screenshot({ path: path.join(d, f) }); };

for (const flavor of ['community', 'capgo', 'capgo7']) for (const lang0 of ['en', 'zh']) {
  FLAVOR = flavor; const lang = lang0, L = `${flavor} ${lang}`;
  const T = lang === 'zh'
    ? { a: '我和小明打单打，', b: '第一局21比15赢了', c: '网前打得好', close: '关闭', speechTitle: '允许语音输入', micTitle: '允许使用麦克风', noPlugin: '语音输入需要最新版', nothing: '没有识别到内容', failed: '语音识别中断了', want: '我和小明打单打，第一局21比15赢了' }
    : { a: 'I played singles with Alex', b: 'won the first game 21 15', c: 'my net play was good', close: 'Close', speechTitle: 'Allow voice input', micTitle: 'Allow microphone access', noPlugin: 'Voice input needs the latest Rallywise app', nothing: 'Nothing was recognised', failed: 'Speech recognition stopped', want: 'I played singles with Alex won the first game 21 15' };
  // 1. First use: one tap -> iOS asks Speech Recognition, then Microphone -> recording starts by itself.
  let { ctx, pg } = await open(lang);
  await tap(pg); await wait(150);
  let s = await sr(pg);
  check(`${L}: first tap opens the native Speech Recognition dialog; screen does not pretend to record`, s.inDialog && s.dialogs[0] === 'speech' && await live(pg) === 'false' && s.starts.length === 0, s);
  await wait(300);
  s = await sr(pg);
  check(`${L}: then the native Microphone dialog`, s.inDialog && s.dialogs.join() === 'speech,mic' && await live(pg) === 'false', s);
  await wait(400);
  s = await sr(pg);
  check(`${L}: both allowed -> records without another tap, in ${lang === 'zh' ? 'zh-CN' : 'en-US'}`, s.speech === 'granted' && s.mic === 'granted' && s.starts.length === 1 && s.starts[0].language === (lang === 'zh' ? 'zh-CN' : 'en-US') && s.starts[0].partialResults === true && await live(pg) === 'true', s);
  await pg.evaluate(t => window.__say(t), T.a); await wait(100);
  check(`${L}: live transcription`, await text(pg) === T.a, await text(pg));
  await shot(pg, lang, '1-recording.png');
  await pg.evaluate(() => window.__appleEnd()); await wait(500);
  s = await sr(pg);
  check(`${L}: Apple ends a session -> listens again, still recording`, s.starts.length === 2 && s.running && await live(pg) === 'true', s);
  await pg.evaluate(t => window.__say(t), T.b); await wait(100);
  check(`${L}: second session joins the first`, await text(pg) === T.want, await text(pg));
  await wait(1200);
  check(`${L}: timer runs`, /0:0[1-9]/.test(await pg.$eval('.rw-rec-timer', e => e.innerText)), await pg.$eval('.rw-rec-timer', e => e.innerText));
  await tap(pg); await wait(900);
  s = await sr(pg);
  check(`${L}: Stop ends recording, keeps text, removes listeners`, await live(pg) === 'false' && await text(pg) === T.want && !s.running && s.live === 0, { t: await text(pg), s });
  await shot(pg, lang, '2-stopped.png');
  // 2. Repeat session: already allowed, so no dialog; appends to the text already there.
  await tap(pg); await wait(300);
  check(`${L}: already allowed -> starts at once, no dialog`, (await sr(pg)).dialogs.length === 2 && await live(pg) === 'true');
  await pg.evaluate(t => window.__say(t), T.c); await wait(100);
  await tap(pg); await wait(900);
  const sep = lang === 'zh' ? '' : ' ';
  check(`${L}: second recording appends`, await text(pg) === T.want + sep + T.c && (await sr(pg)).starts.length === 3, await text(pg));
  // 3. Typing while recording stops the mic and keeps the words.
  await tap(pg); await wait(300);
  await pg.evaluate(() => window.__say(' extra'));
  await pg.click('.rw-voice-text'); await wait(300);
  s = await sr(pg);
  check(`${L}: editing stops the mic, keeps visible text`, await live(pg) === 'false' && !s.running && s.live === 0 && (await text(pg)).endsWith('extra'), { t: await text(pg), s });
  await pg.fill('.rw-voice-text', 'typed by hand');
  check(`${L}: manual edit works`, await text(pg) === 'typed by hand');
  // 4. App goes to background (call, home button): stops, keeps text.
  await wait(1100);
  await tap(pg); await wait(300);
  await pg.evaluate(() => window.__say(' then a call came'));
  await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await wait(600);
  check(`${L}: background/interruption stops and keeps text`, await live(pg) === 'false' && (await text(pg)).includes('then a call came') && !(await sr(pg)).running, await text(pg));
  await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  // 5. Empty session: nothing said.
  await pg.fill('.rw-voice-text', '');
  await tap(pg); await wait(300); await tap(pg); await wait(1700);
  check(`${L}: nothing heard -> "${T.nothing}" toast, not recording`, (await toast(pg)).includes(T.nothing) && await live(pg) === 'false');
  await shot(pg, lang, '3-nothing.png');
  // 6. Sessions that die at once (no network / mic busy) three times: stop with an error, no endless loop.
  await wait(3500);
  await tap(pg); await wait(300);
  for (let i = 0; i < 3; i++) { await pg.evaluate(() => window.__appleEnd()); await wait(400); }
  s = await sr(pg);
  check(`${L}: repeated instant failures stop with "${T.failed}"`, (await toast(pg)).includes(T.failed) && await live(pg) === 'false' && !s.running, s);
  // 7. Start rejected (mic used by another app).
  await wait(3500);
  await pg.evaluate(() => { window.__sr.failStart = 'Microphone is already in use by another application.'; });
  await tap(pg); await wait(400);
  check(`${L}: start rejected -> error toast, idle`, (await toast(pg)).includes(T.failed) && await live(pg) === 'false');
  await pg.evaluate(() => { window.__sr.failStart = null; });
  // 8. Continue while recording: final words kept, then the parse step runs.
  await wait(3500);
  await tap(pg); await wait(300);
  await pg.evaluate(t => window.__say(t), T.a); await wait(100);
  await pg.click('.rw-rec-link');
  await wait(1500);
  // The mock backend has no AI parser, so moving on ends at its "not set up" toast or at Review.
  s = await sr(pg);
  check(`${L}: Continue while recording stops the mic, keeps the words and moves on to parsing`, !s.running && s.live === 0 && (await pg.$('.rw-rec-btn') === null || (await live(pg) === 'false' && await text(pg) === T.a)), { s, t: await pg.$('.rw-rec-btn') && await text(pg) });
  await shot(pg, lang, '4-continue.png');
  await ctx.close();

  // 9. Speech Recognition denied in iOS's dialog: explanation sheet with Open Settings; mic never asked, never records.
  ({ ctx, pg } = await open(lang, { sr: { answer: { speech: 'denied', mic: 'granted' } } }));
  await tap(pg); await wait(800);
  s = await sr(pg);
  check(`${L}: speech denied -> "${T.speechTitle}" sheet, not recording, no toast`, await sheet(pg) === T.speechTitle && await live(pg) === 'false' && s.starts.length === 0 && s.live === 0 && s.dialogs.join() === 'speech' && !(await toast(pg)).includes(T.nothing), { s, sheet: await sheet(pg) });
  await shot(pg, lang, '5-speech-denied.png');
  await pg.click('[data-screen-label="Voice permission"] .rw-btn-primary');
  await wait(200);
  check(`${L}: Open Settings asks iOS to open app-settings:`, pg.__nav.includes('app-settings:') && await pg.$('.rw-rec-btn') !== null, pg.__nav);
  // Back from Settings, still off: sheet stays, no dialog.
  await back(pg); await wait(400);
  check(`${L}: back from Settings still off -> sheet stays, no dialog`, await sheet(pg) === T.speechTitle && (await sr(pg)).dialogs.length === 1 && await live(pg) === 'false');
  // Back from Settings with both turned on: sheet closes and recording starts by itself.
  await pg.evaluate(() => { window.__sr.speech = 'granted'; window.__sr.mic = 'granted'; });
  await back(pg); await wait(500);
  s = await sr(pg);
  check(`${L}: back from Settings allowed -> sheet closes, records`, await sheet(pg) === null && await live(pg) === 'true' && s.starts.length === 1, s);
  await tap(pg); await wait(1700);
  await ctx.close();

  // 10. Partial grant: Speech Recognition allowed, Microphone denied -> microphone sheet.
  ({ ctx, pg } = await open(lang, { sr: { answer: { speech: 'granted', mic: 'denied' } } }));
  await tap(pg); await wait(900);
  s = await sr(pg);
  // Capgo reports both permissions as one, so a denied mic gets the both-permissions sheet.
  const micT = flavor.startsWith('capgo') ? T.speechTitle : T.micTitle;
  check(`${L}: mic denied -> "${micT}" sheet, not recording`, await sheet(pg) === micT && await live(pg) === 'false' && s.starts.length === 0 && s.dialogs.join() === 'speech,mic', { s, sheet: await sheet(pg) });
  await shot(pg, lang, '6-mic-denied.png');
  await pg.click(`[data-screen-label="Voice permission"] button[aria-label="${T.close}"]`);
  await wait(300);
  check(`${L}: X closes the sheet`, await sheet(pg) === null, await sheet(pg));
  await pg.fill('.rw-voice-text', 'typed'); check(`${L}: can type after denial`, await text(pg) === 'typed');
  await tap(pg); await wait(400);
  check(`${L}: tapping the mic again shows the sheet again, no dialog`, await sheet(pg) === micT && (await sr(pg)).dialogs.length === 2);
  await ctx.close();

  // 11. Denied earlier (both already decided): no dialog at all, sheet at once.
  ({ ctx, pg } = await open(lang, { sr: { speech: 'denied', mic: 'denied' } }));
  await tap(pg); await wait(300);
  check(`${L}: denied before -> sheet at once, no dialog`, await sheet(pg) === T.speechTitle && (await sr(pg)).dialogs.length === 0 && await live(pg) === 'false');
  await ctx.close();

  // 12. Speech allowed earlier but microphone never asked: the mic dialog only, then records.
  ({ ctx, pg } = await open(lang, { sr: { speech: 'granted' } }));
  await tap(pg); await wait(700);
  s = await sr(pg);
  check(`${L}: speech already allowed -> only the mic dialog, then records`, s.dialogs.join() === 'mic' && await live(pg) === 'true' && s.starts.length === 1, s);
  await ctx.close();

  // 13. iOS app build without the plugin: clear message, never the browser recognizer, never a recording state.
  ({ ctx, pg } = await open(lang, { plugin: false, web: true }));
  await tap(pg); await wait(300);
  check(`${L}: app without plugin -> "${T.noPlugin}" toast, no web fallback`, (await toast(pg)).includes(T.noPlugin) && await live(pg) === 'false' && await pg.evaluate(() => window.__web.made) === 0);
  await ctx.close();

  // 14. Web (no Capacitor): the browser recognizer path, unchanged.
  ({ ctx, pg } = await open(lang, { native: false, web: true }));
  await tap(pg); await wait(300);
  const w = await pg.evaluate(() => ({ made: window.__web.made, lang: window.__web.lang }));
  check(`${L}: Web still uses the browser recognizer`, w.made === 1 && w.lang === (lang === 'zh' ? 'zh-CN' : 'en-US'), w);
  await ctx.close();
}
await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED (fake shell; not a device test)');
process.exit(failed ? 1 : 0);
