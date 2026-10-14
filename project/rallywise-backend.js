// Rallywise auth + cloud data service. The screens call only window.RallywiseBackend;
// everything Supabase-specific stays in this file.
//
// Data shape is the app's own: { onboarded, prefs, players: [{ id, name, level }], matches: [{ id, date, type,
// partner, opps, games, wt, lt, worked, lost, on }] }. It is stored as rows in profiles / players / matches,
// each keyed by the signed-in user's id; row-level security keeps every user to their own rows.
(function () {
  // The page can run its helmet scripts twice. A second copy would make a second Supabase client on the same
  // session storage, and the two would race each other refreshing the token, so keep the first.
  if (window.RallywiseBackend) return;
  // Scripts in the page's helmet load in no fixed order, so config and the Supabase library are read when used.
  const conf = () => window.RALLYWISE_CONFIG || {};
  const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Competitive'];
  const LEGACY = email => 'rallywise.v1.user.' + email; // device-only data from before cloud sync
  let client = null;

  function configured() { const c = conf(); return !!(c.supabaseUrl && c.supabaseAnonKey); }
  function sb() {
    if (client) return client;
    if (!configured()) throw fail('config');
    if (!window.supabase || !window.supabase.createClient) throw fail('network');
    client = window.supabase.createClient(conf().supabaseUrl, conf().supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'rallywise.auth' }
    });
    return client;
  }

  // Every failure leaves this file as an Error with a short .code the screens map to their own messages.
  function fail(code, cause) { const e = new Error(code); e.code = code; e.cause = cause; return e; }
  function isNetwork(err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    if (!err) return false;
    const m = String(err.message || '') + ' ' + String(err.details || '');
    return err.name === 'AuthRetryableFetchError' || err.status === 0 || /failed to fetch|networkerror|load failed|network request failed/i.test(m);
  }
  function authFail(err) {
    if (isNetwork(err)) return fail('network', err);
    const c = err.code || '';
    if (c === 'invalid_credentials') return fail('incorrect', err);
    if (c === 'user_already_exists' || c === 'email_exists') return fail('exists', err);
    if (c === 'email_not_confirmed') return fail('unconfirmed', err);
    if (c === 'weak_password') return fail('weak', err);
    if (c === 'same_password') return fail('same', err);
    if (/rate_limit/.test(c) || err.status === 429) return fail('rate', err);
    return fail('unknown', err);
  }
  function dataFail(err) { return isNetwork(err) ? fail('network', err) : fail('unknown', err); }
  async function run(q) { const r = await q; if (r.error) throw dataFail(r.error); return r.data; }

  // provider (email, google, apple) is only used as signup_completed's method.
  const userOf = u => u && { id: u.id, email: (u.email || '').toLowerCase(), name: (u.user_metadata && u.user_metadata.name) || '',
    provider: (u.app_metadata && u.app_metadata.provider) || 'email' };

  // ---- Auth ----
  const auth = {
    configured,
    oauthEnabled: p => !!(conf().oauth && conf().oauth[p]),
    // The signed-in user from the saved session, or null. Works offline from the stored session.
    async restore() {
      if (!configured()) return null;
      const { data, error } = await sb().auth.getSession();
      if (error) throw authFail(error);
      return data.session ? userOf(data.session.user) : null;
    },
    async signIn(email, password) {
      const { data, error } = await sb().auth.signInWithPassword({ email, password });
      if (error) throw authFail(error);
      return userOf(data.user);
    },
    // Returns { user, needsConfirm }. needsConfirm is true when the project requires email confirmation:
    // there is no session until the link in the email is opened.
    async signUp(email, password, name) {
      const { data, error } = await sb().auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: here() } });
      if (error) throw authFail(error);
      // With confirmations on, an existing email comes back as a user with no identities instead of an error.
      if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw fail('exists');
      return { user: userOf(data.user), needsConfirm: !data.session };
    },
    // Ends this device's session only; other devices stay signed in and the cloud data stays.
    async signOut() { if (client) await client.auth.signOut({ scope: 'local' }).catch(() => {}); },
    async sendReset(email) {
      const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: here() });
      if (error) throw authFail(error);
    },
    // Checks the current password by signing in with it, then sets the new one. After a reset link
    // (recovery) the current password isn't known, so it is skipped.
    async changePassword(email, current, next, recovery) {
      if (!recovery) {
        const { error } = await sb().auth.signInWithPassword({ email, password: current });
        if (error) { const e = authFail(error); throw e.code === 'incorrect' ? fail('current', error) : e; }
      }
      const { error } = await sb().auth.updateUser({ password: next });
      if (error) throw authFail(error);
    },
    // Google / Apple. Off unless enabled in rallywise-config.js; when on, Supabase redirects to the
    // provider and back, and the returning page restores the session like any other reopen.
    async oauth(provider) {
      if (!configured() || !auth.oauthEnabled(provider)) throw fail('unavailable');
      const { error } = await sb().auth.signInWithOAuth({ provider, options: { redirectTo: here() } });
      if (error) throw authFail(error);
    },
    // Deletes the auth user server-side; their profile, players and matches go with it (on delete cascade).
    async deleteAccount() {
      const { error } = await sb().rpc('delete_account');
      if (error) throw dataFail(error);
      await auth.signOut();
    },
    // cb(event, user): 'SIGNED_OUT' when the session ends elsewhere (another tab, revoked token),
    // 'PASSWORD_RECOVERY' when the page opened from a reset link.
    onChange(cb) {
      if (!configured()) return () => {};
      const { data } = sb().auth.onAuthStateChange((event, session) => {
        // Supabase asks that no auth calls run inside this callback, so hand off first.
        if (event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY') setTimeout(() => cb(event, session && userOf(session.user)), 0);
      });
      return () => data.subscription.unsubscribe();
    }
  };
  function here() { return location.href.split('#')[0].split('?')[0]; }

  // ---- Data ----
  const toPlayerRow = (uid, p) => ({ user_id: uid, id: String(p.id), name: String(p.name || ''), level: LEVELS.includes(p.level) ? p.level : null });
  const toMatchRow = (uid, m) => ({ user_id: uid, id: String(m.id), date: m.date, type: m.type, partner: m.partner || null, opps: m.opps || [],
    games: m.games || [], wt: m.wt || [], lt: m.lt || [], worked: m.worked || '', lost: m.lost || '', opp_notes: m.on || '',
    ...(m.createdAt ? { created_at: m.createdAt } : {}) });
  const fromPlayerRow = r => r.id === 'me' ? { id: r.id, name: r.name, level: r.level } : (r.level ? { id: r.id, name: r.name, level: r.level } : { id: r.id, name: r.name });
  const fromMatchRow = r => ({ id: r.id, date: r.date, type: r.type, partner: r.partner, opps: r.opps || [], games: r.games || [],
    wt: r.wt || [], lt: r.lt || [], worked: r.worked || '', lost: r.lost || '', on: r.opp_notes || '', createdAt: r.created_at });
  const newPrefs = () => ({ reminders: true, insights: true, usage: false });

  // What the cloud holds, as JSON strings per row, so a sync sends only what changed.
  function snapshot(state) {
    const by = (list, f) => Object.fromEntries((list || []).map(x => [String(x.id), JSON.stringify(f(x))]));
    return {
      profile: state ? JSON.stringify({ onboarded: !!state.onboarded, prefs: state.prefs || {} }) : null,
      players: by(state && state.players, p => toPlayerRow('', p)),
      matches: by(state && state.matches, m => toMatchRow('', m))
    };
  }

  // One per signed-in user. push(state) saves the app's whole data state, sending only the rows that differ from
  // what was last saved. Pushes are serialised; the newest state always wins, and a failed push is retried by
  // the next one because nothing is marked saved until the server accepts it.
  function createSync(uid, saved) {
    const s = { synced: snapshot(saved), want: null, running: null };
    async function apply(state) {
      const db = sb(), next = snapshot(state), cur = s.synced;
      if (next.profile !== cur.profile) {
        await run(db.from('profiles').upsert({ user_id: uid, onboarded: !!state.onboarded, prefs: state.prefs || {} }, { onConflict: 'user_id' }));
        cur.profile = next.profile;
      }
      for (const [table, list, toRow] of [['players', state.players, toPlayerRow], ['matches', state.matches, toMatchRow]]) {
        const want = next[table], have = cur[table];
        const changed = (list || []).filter(x => want[String(x.id)] !== have[String(x.id)]);
        const gone = Object.keys(have).filter(id => !(id in want));
        if (changed.length) {
          await run(db.from(table).upsert(changed.map(x => toRow(uid, x)), { onConflict: 'user_id,id' }));
          changed.forEach(x => { have[String(x.id)] = want[String(x.id)]; });
        }
        if (gone.length) {
          await run(db.from(table).delete().eq('user_id', uid).in('id', gone));
          gone.forEach(id => { delete have[id]; });
        }
      }
    }
    async function loop() {
      while (s.want) {
        const state = s.want; s.want = null;
        try { await apply(state); } catch (e) { if (!s.want) s.want = state; s.pending = true; throw e; }
      }
      s.pending = false;
    }
    return {
      push(state) {
        s.want = state;
        if (!s.running) s.running = loop().finally(() => { s.running = null; });
        return s.running;
      },
      // True while there are changes the server hasn't accepted yet.
      get pending() { return !!(s.pending || s.want || s.running); }
    };
  }

  // Device-only data from the localStorage version of the app, if any, for this email.
  function legacy(email) {
    try {
      const a = JSON.parse(localStorage.getItem(LEGACY(email)) || 'null');
      if (!a || !Array.isArray(a.players) || !Array.isArray(a.matches)) return null;
      const players = a.players.filter(p => p && p.id && typeof p.name === 'string');
      if (!players.some(p => p.id === 'me')) players.unshift({ id: 'me', name: '', level: null });
      const matches = a.matches.filter(m => m && m.id && /^\d{4}-\d{2}-\d{2}$/.test(m.date) && (m.type === 'Singles' || m.type === 'Doubles') && Array.isArray(m.games));
      return { onboarded: !!a.onboarded, prefs: { ...newPrefs(), ...(a.prefs || {}) }, players, matches };
    } catch (e) { return null; }
  }

  // Resolves once the config and the Supabase library have loaded (or after a few seconds, e.g. offline).
  async function ready() {
    for (let i = 0; i < 100 && !(window.RALLYWISE_CONFIG && (window.supabase || !configured())); i++) await new Promise(r => setTimeout(r, 50));
  }

  const data = {
    newPrefs,
    // Loads the user's data. A first sign-in creates the account's rows: from this device's old local data
    // for the same email if there is some (migrated once, then removed from the device), otherwise empty.
    // Returns { state, sync, migrated, created, anonId }. created is true when this load made the account's rows
    // (its first sign-in). anonId is the account's analytics id (never the auth id).
    async load(user) {
      const db = sb(), uid = user.id;
      const [profile, players, matches] = await Promise.all([
        run(db.from('profiles').select('onboarded, prefs, anon_id').eq('user_id', uid).maybeSingle()),
        run(db.from('players').select('id, name, level').eq('user_id', uid).order('created_at')),
        run(db.from('matches').select('*').eq('user_id', uid).order('date', { ascending: false }).order('created_at', { ascending: false }))
      ]);
      if (profile) {
        const state = { onboarded: !!profile.onboarded, prefs: { ...newPrefs(), ...(profile.prefs || {}) }, players: players.map(fromPlayerRow), matches: matches.map(fromMatchRow) };
        if (!state.players.some(p => p.id === 'me')) state.players.unshift({ id: 'me', name: user.name, level: null });
        return { state, sync: createSync(uid, { onboarded: state.onboarded, prefs: profile.prefs || {}, players: players.map(fromPlayerRow), matches: state.matches }), migrated: false, created: false, anonId: profile.anon_id };
      }
      const old = legacy(user.email);
      const state = old || { onboarded: false, prefs: newPrefs(), players: [{ id: 'me', name: user.name, level: null }], matches: [] };
      const sync = createSync(uid, null);
      await sync.push(state);
      if (old) try { localStorage.removeItem(LEGACY(user.email)); } catch (e) {}
      const p = await run(db.from('profiles').select('anon_id').eq('user_id', uid).maybeSingle());
      return { state, sync, migrated: !!old, created: true, anonId: p && p.anon_id };
    }
  };

  // Beta analytics (rallywise-analytics.js decides what and when). Insert only: the table can't be read back.
  // Rows carry their own ids and duplicates are ignored, so a batch that is sent twice is stored once.
  const analytics = {
    async send(rows) {
      await run(sb().from('analytics_events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
    }
  };

  // The mocked session record from the localStorage version is meaningless now.
  try { localStorage.removeItem('rallywise.v1.session'); } catch (e) {}

  window.RallywiseBackend = { ready, auth, data, analytics };
})();
