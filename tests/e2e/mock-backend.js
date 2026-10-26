// Grow e2e test-only stand-in (Build Next tests add mock.noai / mock.ai) (Focus: also keeps focuses and focusPeriods) for rallywise-backend.js: same interface, data kept in localStorage.
// mock.confirm = sign-up needs email confirmation; mock.fail = loading the account fails with a network error.
(function () {
  if (window.RallywiseBackend) return;
  const get = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const newPrefs = () => ({ reminders: true, insights: true, usage: false });
  const user = () => get('mock.user') || { id: 'u1', email: 'han@example.com', name: 'Han', provider: 'email' };
  const fail = code => Object.assign(new Error(code), { code });
  window.__gen = get('mock.gen') || [];
  window.RallywiseBackend = {
    ready: async () => {},
    auth: { configured: () => true, oauthEnabled: () => false, restore: async () => get('mock.session') ? user() : null,
      signIn: async (email, pw) => { if (pw === 'wrongpass') throw fail('incorrect'); put('mock.session', 1); return user(); },
      signUp: async (email, pw, name) => { put('mock.user', { id: 'u1', email, name, provider: 'email' });
        if (get('mock.confirm')) return { needsConfirm: true }; put('mock.session', 1); return { user: user() }; },
      sendReset: async () => {}, changePassword: async (e, cur) => { if (cur === 'wrongpass') throw fail('current'); },
      deleteAccount: async () => { localStorage.removeItem('mock.db'); localStorage.removeItem('mock.session'); },
      signOut: async () => localStorage.removeItem('mock.session'), onChange: () => () => {} },
    data: { newPrefs, async load(u) {
      if (get('mock.fail')) throw fail('network');
      let db = get('mock.db'), created = false;
      if (!db) { db = { onboarded: false, prefs: newPrefs(), players: [{ id: 'me', name: u.name, level: null }], matches: [] }; put('mock.db', db); created = true; }
      const state = { focuses: [], focusPeriods: [], ...db, prefs: { ...newPrefs(), ...(db.prefs || {}) } };
      return { state, created, migrated: false, anonId: 'a1', sync: { pending: false, focusReady: true, async push(s) {
        if (get('mock.pushFail')) throw fail('network');
        window.__pushes = (window.__pushes || 0) + 1;
        put('mock.db', { onboarded: s.onboarded, prefs: s.prefs, players: s.players, matches: s.matches, focuses: s.focuses, focusPeriods: s.focusPeriods }); } } };
    } },
    analytics: { async send(rows) { const a = get('mock.analytics') || []; put('mock.analytics', a.concat(rows.map(r => r.event))); } },
    insights: {
      // Grow e2e: the real generate-grow-insights (run in Node by the test, window.__edge) on this account's rows.
      // mock.edgeFail: the call fails (network). mock.slow: it takes 2.5 s.
      async generate(lang, sig) { window.__gen.push(lang); put('mock.gen', window.__gen);
        if (get('mock.slow')) await new Promise(r => setTimeout(r, 2500));
        if (get('mock.edgeFail')) throw fail('network');
        const r = JSON.parse(await window.__edge(lang, JSON.stringify(get('mock.db')), sig || null));
        if (r.error) throw fail(r.error);
        return r.insight ? { ...r.insight, _generatedAt: r.generated_at, _cached: !!r.cached, _timing: r.timing || null } : null; },
      async cached(lang) { return null; }
    }
  };
})();
