// Rallywise beta analytics: one track(event, props, ctx) call per event, sent to Supabase's insert-only
// analytics_events table through RallywiseBackend. See the Rallywise Beta Analytics Plan for the events.
//
// ctx says who and whether: { anonId, consent } where consent is 'yes' (Share Usage Data on), 'no' (off), or
// 'ask' (the one-time prompt hasn't been answered yet). The screens decide exclusions (demo account, design
// previews) and simply don't call track() then.
// - 'yes': the event is queued on this device and sent in a batch; if the send fails (offline) it stays queued
//   and goes when the connection returns.
// - 'ask': the event is held in memory only, then sent if the player says yes, or dropped if they say no.
// - 'no': nothing is kept.
// Each event gets its own id when it happens and the server skips an id it already has, so a retried batch
// never stores an event twice.
(function () {
  if (window.RallywiseAnalytics) return;
  const KEY = 'rallywise.analytics.queue';
  const MAX = 500;
  const EVENTS = ['signup_completed', 'onboarding_completed', 'player_added', 'match_log_started', 'match_logged',
    'match_edited', 'match_deleted', 'insights_viewed', 'grow_viewed', 'app_opened'];
  const conf = () => window.RALLYWISE_CONFIG || {};
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  function platform() {
    const cap = window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform();
    return cap === 'ios' || cap === 'android' ? cap : 'web';
  }

  let sessionId = uuid();
  const held = {}; // anonId -> events waiting for the consent answer (memory only)
  let anon = null; // the account currently signed in; only its events are sent
  let sending = null, retry = null;

  function load() { try { const q = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; } }
  function save(q) { try { localStorage.setItem(KEY, JSON.stringify(q.slice(-MAX))); } catch (e) {} }

  function track(event, props, ctx) {
    if (!EVENTS.includes(event) || !ctx || !ctx.anonId || ctx.consent === 'no') return;
    const row = { id: uuid(), anon_id: ctx.anonId, event, ts: new Date().toISOString(), session_id: sessionId,
      app_version: String(conf().appVersion || 'dev'), platform: platform(), props: props || {} };
    anon = ctx.anonId;
    if (ctx.consent === 'yes') { save([...load(), row]); schedule(300); }
    else (held[ctx.anonId] = held[ctx.anonId] || []).push(row);
  }

  // Consent answered yes: send what was held. Answered no, or turned off later: forget everything unsent.
  function grant(anonId) {
    anon = anonId;
    const h = held[anonId] || []; delete held[anonId];
    if (h.length) save([...load(), ...h]);
    schedule(0);
  }
  function clear(anonId) {
    delete held[anonId];
    save(load().filter(r => r.anon_id !== anonId));
  }
  // Which account's queued events may be sent now (null when signed out).
  function setAccount(anonId) { anon = anonId || null; if (anon) schedule(0); }

  function schedule(ms) { clearTimeout(retry); retry = setTimeout(flush, ms); }
  async function flush() {
    if (sending || !anon) return sending;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const b = window.RallywiseBackend;
    if (!b || !b.analytics) return schedule(1000);
    const mine = load().filter(r => r.anon_id === anon).slice(0, 50);
    if (!mine.length) return;
    sending = (async () => {
      try {
        await b.analytics.send(mine);
        const sent = new Set(mine.map(r => r.id));
        save(load().filter(r => !sent.has(r.id))); // anything queued meanwhile stays
        if (load().some(r => r.anon_id === anon)) schedule(0);
      } catch (e) { schedule(30000); } // offline or server trouble: keep the events and try again later
      finally { sending = null; }
    })();
    return sending;
  }

  window.addEventListener('online', () => schedule(0));
  window.RallywiseAnalytics = {
    track, grant, clear, setAccount, flush,
    // A new visit (a resume after a long time away) gets a new session id.
    newSession() { sessionId = uuid(); },
    get sessionId() { return sessionId; },
    queued: () => load().length
  };
})();
