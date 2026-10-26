// Voice Log Match: the seam between the voice engine and the app's Log Match draft.
// The real parser is the parse-voice-log edge function (supabase/functions/_shared/voice-parse-core.js, from
// voice-v2-live: same prompt, schema and guards). Previews and tests use mockParse(), which returns canned results
// in exactly that shape, so toDraft() and the screens never know which one ran. Nothing here calls a paid service.
(function (root) {
  const base = over => ({ language: 'en', match_type: null, multiple_lineups: false, game_count: null, order_known: false,
    totals: { wins: null, losses: null }, players: [], games: [], observations: [], missing: [], ambiguities: [], ...over });
  const game = (number, result, my_score, their_score) => ({ number, result, my_score, their_score, interrupted: false });
  const obs = (text, category, area) => ({ text, category, area, about: null });
  const P = (name, role) => ({ name, role });

  // Sample sessions for previews and tests, one per scenario and language (?voice=<scenario> on preview hosts).
  // The recording "hears" the text; Continue returns the canned result.
  const SAMPLES = {
    // One known opponent.
    complete: {
      en: { text: 'Played singles against Alex today. Lost the first game 18-21, won the second 21-17, then lost the last one 15-21. My smash was working, but I made too many mistakes at the net.',
        result: base({ match_type: 'singles', game_count: 3, order_known: true, totals: { wins: 1, losses: 2 }, players: [P('Alex', 'opponent')],
          games: [game(1, 'loss', 18, 21), game(2, 'win', 21, 17), game(3, 'loss', 15, 21)],
          observations: [obs('My smash was working', 'won_points', 'Smash'), obs('Too many mistakes at the net', 'lost_points', 'Net')] }) },
      zh: { text: '今天和Alex打了三局单打，第一局18比21输了，第二局21比17赢了，第三局15比21输了。杀球不错，但是网前失误比较多。',
        result: base({ language: 'zh', match_type: 'singles', game_count: 3, order_known: true, totals: { wins: 1, losses: 2 }, players: [P('Alex', 'opponent')],
          games: [game(1, 'loss', 18, 21), game(2, 'win', 21, 17), game(3, 'loss', 15, 21)],
          observations: [obs('杀球不错', 'won_points', 'Smash'), obs('网前失误比较多', 'lost_points', 'Net')] }) }
    },
    // Singles, nobody named: the opponent is missing.
    missing: {
      en: { text: 'Singles this morning. Won 21-15 and 21-18. Low serves kept them lifting.',
        result: base({ match_type: 'singles', game_count: 2, order_known: true, totals: { wins: 2, losses: 0 },
          games: [game(1, 'win', 21, 15), game(2, 'win', 21, 18)], observations: [obs('Low serves kept them lifting', 'won_points', 'Serve')], missing: ['opponents'] }) },
      zh: { text: '早上打了单打，21比15、21比18两局都赢了。发小球让对手一直起球。',
        result: base({ language: 'zh', match_type: 'singles', game_count: 2, order_known: true, totals: { wins: 2, losses: 0 },
          games: [game(1, 'win', 21, 15), game(2, 'win', 21, 18)], observations: [obs('发小球让对手一直起球', 'won_points', 'Serve')], missing: ['opponents'] }) }
    },
    // "Chris" fits more than one saved player (the demo data has Chris Wong and Chris Lam).
    ambiguous: {
      en: { text: 'Singles against Chris tonight. Won 21-18, then 21-16. My footwork felt quick.',
        result: base({ match_type: 'singles', game_count: 2, order_known: true, totals: { wins: 2, losses: 0 }, players: [P('Chris', 'opponent')],
          games: [game(1, 'win', 21, 18), game(2, 'win', 21, 16)], observations: [obs('My footwork felt quick', 'won_points', 'Footwork')] }) },
      zh: { text: '今晚和Chris打单打，21比18、21比16赢了。步法感觉很快。',
        result: base({ language: 'zh', match_type: 'singles', game_count: 2, order_known: true, totals: { wins: 2, losses: 0 }, players: [P('Chris', 'opponent')],
          games: [game(1, 'win', 21, 18), game(2, 'win', 21, 16)], observations: [obs('步法感觉很快', 'won_points', 'Footwork')] }) }
    },
    // A name with no saved player.
    new: {
      en: { text: 'Singles with David from work. Lost 15-21 and 19-21. My backhand clears were short.',
        result: base({ match_type: 'singles', game_count: 2, order_known: true, totals: { wins: 0, losses: 2 }, players: [P('David', 'opponent')],
          games: [game(1, 'loss', 15, 21), game(2, 'loss', 19, 21)], observations: [obs('My backhand clears were short', 'lost_points', 'Placement')] }) },
      zh: { text: '和同事David打单打，15比21、19比21输了。反手高远球不到位。',
        result: base({ language: 'zh', match_type: 'singles', game_count: 2, order_known: true, totals: { wins: 0, losses: 2 }, players: [P('David', 'opponent')],
          games: [game(1, 'loss', 15, 21), game(2, 'loss', 19, 21)], observations: [obs('反手高远球不到位', 'lost_points', 'Placement')] }) }
    },
    // Doubles with three names and no roles: Review asks who the partner was.
    partner: {
      en: { text: 'Doubles tonight with Leo, Mei and Ravi. We won 21-19 and 21-17.',
        result: base({ match_type: 'doubles', game_count: 2, order_known: true, totals: { wins: 2, losses: 0 }, players: [P('Leo', 'unknown'), P('Mei', 'unknown'), P('Ravi', 'unknown')],
          games: [game(1, 'win', 21, 19), game(2, 'win', 21, 17)], ambiguities: [{ field: 'players', note: 'Partner not stated.' }] }) },
      zh: { text: '今晚和Leo、Mei、Ravi打双打，21比19、21比17赢了。',
        result: base({ language: 'zh', match_type: 'doubles', game_count: 2, order_known: true, totals: { wins: 2, losses: 0 }, players: [P('Leo', 'unknown'), P('Mei', 'unknown'), P('Ravi', 'unknown')],
          games: [game(1, 'win', 21, 19), game(2, 'win', 21, 17)], ambiguities: [{ field: 'players', note: 'Partner not stated.' }] }) }
    },
    // More than one lineup: one record can't hold it.
    lineup: {
      en: { text: 'Played doubles with Priya against Marcus and Jordan, then switched partners and played with Leo. Won 21-15, lost 18-21.',
        result: base({ match_type: 'doubles', multiple_lineups: true, game_count: 2, order_known: true, totals: { wins: 1, losses: 1 },
          players: [P('Priya', 'partner'), P('Marcus', 'opponent'), P('Jordan', 'opponent'), P('Leo', 'partner')], games: [game(1, 'win', 21, 15), game(2, 'loss', 18, 21)] }) },
      zh: { text: '先和Priya搭档打Marcus和Jordan，后来换了搭档和Leo打。21比15赢，18比21输。',
        result: base({ language: 'zh', match_type: 'doubles', multiple_lineups: true, game_count: 2, order_known: true, totals: { wins: 1, losses: 1 },
          players: [P('Priya', 'partner'), P('Marcus', 'opponent'), P('Jordan', 'opponent'), P('Leo', 'partner')], games: [game(1, 'win', 21, 15), game(2, 'loss', 18, 21)] }) }
    },
    // Notes about the opponent: they prefill Opponent Notes ("What did you notice about Alex?").
    opponent: {
      en: { text: 'Singles against Alex tonight. Won 21-18, lost 17-21, won 21-16. Alex kept attacking my backhand, and his drop shots were hard to read. My smash was working.',
        result: base({ match_type: 'singles', game_count: 3, order_known: true, totals: { wins: 2, losses: 1 }, players: [P('Alex', 'opponent')],
          games: [game(1, 'win', 21, 18), game(2, 'loss', 17, 21), game(3, 'win', 21, 16)],
          observations: [{ ...obs('Alex kept attacking my backhand', 'opponent', null), about: 'Alex' }, { ...obs('His drop shots were hard to read', 'opponent', null), about: 'Alex' },
            obs('My smash was working', 'won_points', 'Smash')] }) },
      zh: { text: '今晚和Alex打单打，21比18赢，17比21输，21比16赢。Alex一直压我反手，吊球很难判断。杀球不错。',
        result: base({ language: 'zh', match_type: 'singles', game_count: 3, order_known: true, totals: { wins: 2, losses: 1 }, players: [P('Alex', 'opponent')],
          games: [game(1, 'win', 21, 18), game(2, 'loss', 17, 21), game(3, 'win', 21, 16)],
          observations: [{ ...obs('Alex一直压我反手', 'opponent', null), about: 'Alex' }, { ...obs('吊球很难判断', 'opponent', null), about: 'Alex' },
            obs('杀球不错', 'won_points', 'Smash')] }) }
    },
    // One name, nothing on singles or doubles or which side: the match type stays open.
    type: {
      en: { text: 'Played with Marcus today. Won 21-15, lost 19-21, won 21-18.',
        result: base({ game_count: 3, order_known: true, totals: { wins: 2, losses: 1 }, players: [P('Marcus', 'unknown')],
          games: [game(1, 'win', 21, 15), game(2, 'loss', 19, 21), game(3, 'win', 21, 18)], missing: ['match_type'] }) },
      zh: { text: '今天和Marcus打球，21比15赢，19比21输，21比18赢。',
        result: base({ language: 'zh', game_count: 3, order_known: true, totals: { wins: 2, losses: 1 }, players: [P('Marcus', 'unknown')],
          games: [game(1, 'win', 21, 15), game(2, 'loss', 19, 21), game(3, 'win', 21, 18)], missing: ['match_type'] }) }
    },
    // Only the overall result, no game order or scores: a valid aggregate (Han, 2026-10-23).
    totals: {
      en: { text: 'Played singles against Alex tonight. Five games, I won three and lost two. My net play was good, my serve kept going long.',
        result: base({ match_type: 'singles', game_count: 5, totals: { wins: 3, losses: 2 }, players: [P('Alex', 'opponent')], missing: ['scores'],
          observations: [obs('My net play was good', 'won_points', 'Net'), obs('My serve kept going long', 'lost_points', 'Serve')] }) },
      zh: { text: '今晚和Alex打单打，一共五局，我赢了三局输了两局。网前不错，发球老是出界。',
        result: base({ language: 'zh', match_type: 'singles', game_count: 5, totals: { wins: 3, losses: 2 }, players: [P('Alex', 'opponent')], missing: ['scores'],
          observations: [obs('网前不错', 'won_points', 'Net'), obs('发球老是出界', 'lost_points', 'Serve')] }) }
    },
    // A tie and a game whose result wasn't said: Review asks for it.
    partial: {
      en: { text: 'Singles with Alex. Won the first 21-17, lost the second, and the third one I forget.',
        result: base({ match_type: 'singles', game_count: 3, order_known: true, players: [P('Alex', 'opponent')], missing: ['results'],
          games: [game(1, 'win', 21, 17), game(2, 'loss', null, null)] }) },
      zh: { text: '和Alex打单打。第一局21比17赢，第二局输了，第三局忘了。',
        result: base({ language: 'zh', match_type: 'singles', game_count: 3, order_known: true, players: [P('Alex', 'opponent')], missing: ['results'],
          games: [game(1, 'win', 21, 17), game(2, 'loss', null, null)] }) }
    }
  };
  const SCENARIOS = Object.keys(SAMPLES);
  function sample(scenario, lang) { const s = SAMPLES[scenario] || SAMPLES.complete; return s[lang] || s.en; }

  // Mock speech: the sample arrives in small pieces, like interim recognition results.
  function chunks(text) { return /[㐀-鿿]/.test(text) ? text.match(/[\s\S]{1,2}/g) : text.split(/(?<=\s)/); }

  // Live cues under the transcript. A rough on-device read so the pills react while you talk or type;
  // the parser decides what is actually recorded.
  const CUES = {
    players: (t, names) => names.some(n => n && t.toLowerCase().includes(n.toLowerCase())) || /\b(with|against|vs\.?|versus|partner)\s+\S/i.test(t) || /(和|跟|对手是?|搭档)\S/.test(t),
    games: t => /\bgames?\b|\bsets?\b|局|\b\d{1,2}\s*[-–:]\s*\d{1,2}\b|\d{1,2}\s*比\s*\d{1,2}/i.test(t),
    results: t => /\b(won|lost|win|loss|lose|beat)\b|赢|输|胜|负/i.test(t),
    notes: t => /smash|serve|return|net|defen[cs]e|footwork|clear|drop|placement|mistake|error|working|weak|strong|杀球|发球|接发|网前|往前小球|搓球|吊球|挑球|高远球|扑球|封网|点杀|启动|回中|移动|防守|步法|落点|失误|不错|需要|发挥得?(好|不好)|打得?(好|不好)/i.test(t)
  };
  function cues(text, names) { const t = text || ''; return { players: CUES.players(t, names || []), games: CUES.games(t), results: CUES.results(t), notes: CUES.notes(t) }; }

  // Mock parse. The sample text gives its canned result; anything else gives an honest "nothing understood" result
  // that keeps the words as one unsure note, so Review shows the missing-data states.
  function mockParse(text, lang, scenario) {
    const t = (text || '').trim();
    for (const k of [scenario].concat(SCENARIOS)) {
      const s = SAMPLES[k] && SAMPLES[k][lang === 'zh' ? 'zh' : 'en'];
      if (s && t === s.text) return JSON.parse(JSON.stringify(s.result));
    }
    return base({ language: lang === 'zh' ? 'zh' : 'en', observations: t ? [obs(t, 'unsure', 'Other')] : [],
      missing: ['match_type', 'opponents', 'game_count', 'results', 'scores'] });
  }

  // Same rule as voice-v2-live resolve(): exact name or first name, case-insensitive.
  // One hit is confirmed; several are ambiguous; none is a new name. The heard name is always kept.
  // With no exact hit, a name heard in another script is matched by its reading (rallywise-names.js; Han 2026-10-26):
  // 杨 finds a saved "Yang" and "Yang" a saved 杨. Only one strong match and no other candidate confirms; otherwise every
  // candidate goes to the Players sheet (strong ones first), so a homophone or another romanization is never merged silently.
  function resolve(heard, players) {
    const { cross, ...r } = match(heard, players);
    return r;
  }
  function match(heard, players) {
    const h = heard.trim().toLowerCase(), others = players.filter(p => p.id !== 'me');
    let c = others.filter(p => p.name.toLowerCase() === h || p.name.split(/\s+/)[0].toLowerCase() === h), cross = false;
    const N = typeof module !== 'undefined' && module.exports ? require('./rallywise-names.js') : root.RallywiseNames;
    if (!c.length && N) {
      const m = others.map(p => ({ p, k: N.match(heard, p.name) })).filter(x => x.k);
      const strong = m.filter(x => x.k === 'strong');
      c = strong.concat(m.filter(x => x.k === 'weak')).map(x => x.p);
      cross = strong.length === 1 && m.length === 1;
      if (c.length === 1 && !cross) return { heard: heard.trim(), id: null, cands: [c[0].id], state: 'ambiguous', cross: true };
    }
    return { heard: heard.trim(), id: c.length === 1 ? c[0].id : null, cands: c.length > 1 ? c.map(p => p.id) : [],
      state: c.length === 1 ? 'confirmed' : c.length > 1 ? 'ambiguous' : 'new', cross };
  }
  // Everyone heard in one match. A player matched only by reading who is already someone else's match (杨 and Yang in
  // the same sentence) is asked about rather than placed twice.
  function resolveAll(names, players) {
    const rs = names.map(n => match(n, players));
    const exact = new Set(rs.filter(r => r.state === 'confirmed' && !r.cross).map(r => r.id)), seen = new Set();
    return rs.map(({ cross, ...r }) => {
      if (r.state !== 'confirmed' || !cross) return r;
      if (exact.has(r.id) || seen.has(r.id)) return { ...r, id: null, cands: [r.id], state: 'ambiguous' };
      seen.add(r.id); return r;
    });
  }
  const missingSlot = () => ({ heard: '', id: null, cands: [], state: 'missing' });
  const slotKeys = type => type === 'Doubles' ? ['partner', 'opp1', 'opp2'] : type === 'Singles' ? ['opp1'] : [];

  // Match type: what the speaker said wins. Otherwise a partner, or two or three people, suggest doubles; one named
  // opponent suggests singles. Anything else stays open (null): never a silent Singles.
  function inferType(r) {
    if (r.match_type) return r.match_type === 'doubles' ? 'Doubles' : 'Singles';
    if (r.multiple_lineups) return null;
    const ps = r.players, n = ps.length, role = k => ps.filter(p => p.role === k).length;
    if (role('partner') || n === 2 || n === 3) return 'Doubles';
    if (n === 1 && role('opponent') === 1) return 'Singles';
    return null;
  }

  // People -> lineup slots for a match type. Explicit roles go to their side. In doubles, people whose role wasn't
  // said fill the opponent slots once the partner is known; while it isn't, they wait in `pool` and the Players sheet
  // asks "Who is your partner?". Identity (confirmed / ambiguous / new / missing) travels with the person, not the slot.
  function lineup(type, people) {
    const strip = ({ role, ...x }) => x, by = k => people.filter(p => p.role === k);
    const slots = {}; let pool = [];
    if (type === 'Singles') slots.opp1 = by('opponent').concat(by('unknown'))[0] || null;
    if (type === 'Doubles') {
      const opps = by('opponent'), unk = by('unknown');
      slots.partner = by('partner')[0] || null;
      if (!slots.partner && unk.length === 1 && opps.length >= 2) slots.partner = unk.shift();
      if (!slots.partner && unk.length) pool = unk.splice(0);
      const rest = opps.concat(unk);
      slots.opp1 = rest[0] || null; slots.opp2 = rest[1] || null;
    }
    for (const k of slotKeys(type)) slots[k] = slots[k] ? strip(slots[k]) : missingSlot();
    return { slots, pool: pool.map(strip) };
  }
  // Settles "Who is your partner?": the chosen person becomes the partner and the others fill open opponent slots.
  function choosePartner(slots, pool, i) {
    const s = { ...slots, partner: pool[i] }, others = pool.filter((_, j) => j !== i);
    for (const k of ['opp1', 'opp2']) if ((!s[k] || s[k].state === 'missing') && others.length) s[k] = others.shift();
    return s;
  }
  const unresolved = (type, slots, pool) => !type || (pool || []).length > 0 || slotKeys(type).some(k => !slots[k] || slots[k].state !== 'confirmed');

  // Saved matches name players by id. Someone never identified gets a placeholder id that keeps the heard name,
  // so they never become a player record, an H2H or an opponent profile (Han, 2026-10-23).
  const UNKNOWN = 'unknown:';
  const isUnknown = id => typeof id === 'string' && id.startsWith(UNKNOWN);
  const unknownId = heard => UNKNOWN + (heard || '').trim();
  // Doubles saved before "Who is your partner?" is answered: everyone in the pool is kept by the name that was heard,
  // as a participant on no side ("unknown:?<heard>"). They are never placed as partner or opponent, and as unknown
  // ids they stay out of H2H and player insights while the match still counts for the user's own record (Han, 2026-10-23).
  const PARTICIPANT = UNKNOWN + '?';
  const isParticipant = id => typeof id === 'string' && id.startsWith(PARTICIPANT);
  const participantId = heard => PARTICIPANT + (heard || '').trim();
  const heardOf = id => isParticipant(id) ? id.slice(PARTICIPANT.length) : isUnknown(id) ? id.slice(UNKNOWN.length) : '';
  // A saved match's players: partner and opponents in their places, plus participants whose side wasn't confirmed.
  const sidesOf = m => ({ partner: m.partner || null, opps: (m.opps || []).filter(id => !isParticipant(id)), others: (m.opps || []).filter(isParticipant) });
  // What a voice draft saves as. pick(k) is the player chosen for slot k. An unidentified slot keeps its heard name as
  // an unknown placeholder. With people still in the pool, an empty slot stays empty (they may be in the pool) and the
  // pool is kept as participants.
  function savedPlayers(type, slots, pool, pick) {
    const open = type === 'Doubles' && (pool || []).length > 0;
    const who = k => pick(k) || (open && (!slots[k] || slots[k].state === 'missing') ? null : unknownId(slots[k] && slots[k].heard));
    if (type !== 'Doubles') return { partner: null, opps: [who('opp1')] };
    if (!open) return { partner: who('partner'), opps: [who('opp1'), who('opp2')] };
    return { partner: pick('partner') || null, opps: [who('opp1'), who('opp2')].filter(Boolean).concat(pool.map(p => participantId(p.heard))) };
  }

  // The app's 21-point scoring from Log Match: a game stores the winner and the loser's points.
  const cap = t => ({ 21: 30, 15: 21, 11: 15 }[t]);
  const winnerScore = (l, t) => l >= t - 1 ? Math.min(l + 2, cap(t)) : t;
  const MAX_GAMES = 9;

  // ---------- Result (Result sheet, Figma 349:3528; Han 2026-10-23) ----------
  // A draft game is { w: 'us' | 'them' | null, l: the loser's points | null }: w null = result not known, l null = no score.
  // totals { w, l } is a heard aggregate ("won 3, lost 2"). It counts only while it fits the games: the results still open
  // add up to exactly what the aggregate leaves. Open games are never filled in from it, so no game outcome is invented,
  // and an aggregate that stops fitting (a game added) counts again once it fits (the game removed).
  function fits(games, totals) {
    if (!totals) return false;
    const rw = totals.w - games.filter(g => g.w === 'us').length, rl = totals.l - games.filter(g => g.w === 'them').length;
    return rw >= 0 && rl >= 0 && rw + rl === games.filter(g => !g.w).length;
  }
  // Win / Loss count and whether it is enough to save. A tie is a valid result; open games without an aggregate are not.
  function tally(games, totals) {
    if (!games.length) return { w: 0, l: 0, open: 0, ok: false, state: 'missing' };
    if (fits(games, totals)) return { w: totals.w, l: totals.l, open: 0, ok: true, state: 'ok' };
    const w = games.filter(g => g.w === 'us').length, l = games.filter(g => g.w === 'them').length, open = games.length - w - l;
    return { w, l, open, ok: !open, state: open ? 'incomplete' : 'ok' };
  }
  // Saved form of a game: [your points, their points] with a score; { r: 'W' | 'L' } without one. Games covered only by the
  // aggregate are saved as { r, u: 1 }: their results count, but their order is not known and is never shown per game.
  function savedGames(games, totals, format) {
    const rem = fits(games, totals) ? { W: totals.w - games.filter(g => g.w === 'us').length, L: totals.l - games.filter(g => g.w === 'them').length } : { W: 0, L: 0 };
    return games.map(g => {
      if (!g.w) { const r = rem.W > 0 ? 'W' : 'L'; rem[r]--; return { r, u: 1 }; }
      if (g.l == null) return { r: g.w === 'us' ? 'W' : 'L', ...(g.u ? { u: 1 } : {}) };
      const ws = winnerScore(g.l, format);
      return g.w === 'us' ? [ws, g.l] : [g.l, ws];
    });
  }
  const gameResult = g => Array.isArray(g) ? (g[0] > g[1] ? 'W' : g[0] < g[1] ? 'L' : null) : g && (g.r === 'W' || g.r === 'L') ? g.r : null;
  const hasScore = g => Array.isArray(g) && typeof g[0] === 'number' && typeof g[1] === 'number';
  // A saved match's games back to draft games + aggregate (Edit).
  function fromSaved(games) {
    const out = games.map(g => g && g.u ? { w: null, l: null } : { w: gameResult(g) === 'W' ? 'us' : gameResult(g) === 'L' ? 'them' : null, l: hasScore(g) ? Math.min(g[0], g[1]) : null });
    const any = games.some(g => g && g.u);
    return { games: out, totals: any ? { w: games.filter(g => gameResult(g) === 'W').length, l: games.filter(g => gameResult(g) === 'L').length } : null };
  }

  // Parse result -> Log Match draft fields + what Review must ask about. Never invents a player, score or order:
  // anything the result lacks stays empty and is flagged. A result with several lineups never becomes a draft
  // (the caller shows the one-lineup notice instead; Han's match-model rule).
  function toDraft(r, players, format) {
    const type = inferType(r);
    const d = { type, partner: null, opp1: null, opp2: null, slots: {}, pool: [],
      games: [], wt: [], lt: [], worked: '', lost: '', on: '', flags: { players: null, result: null, notes: null } };
    const fp = d.flags;
    const people = r.multiple_lineups ? [] : resolveAll(r.players.map(p => p.name), players).map((x, i) => ({ ...x, role: r.players[i].role }));
    const l = lineup(type, people);
    d.slots = l.slots; d.pool = l.pool;
    for (const k of slotKeys(type)) d[k] = d.slots[k].state === 'confirmed' ? d.slots[k].id : null;
    // People heard before the type is known are kept so choosing Singles or Doubles can place them.
    if (!type) d.people = people;
    fp.players = !type ? 'type' : unresolved(type, d.slots, d.pool) ? 'unknown' : null;
    // Games, in order, never invented (Han, 2026-10-23). A game heard without a score keeps l = null (scores are optional);
    // a game whose result wasn't said stays open (w = null). Spoken totals that fit the games are kept as the aggregate,
    // so "won 3, lost 2" is a valid result without a result per game. Interrupted games are left out.
    const informative = g => g.result || g.my_score != null || g.their_score != null;
    const heard = r.games.filter(g => informative(g) && !g.interrupted), cut = new Set(r.games.filter(g => g.interrupted).map(g => g.number));
    const t = r.totals || {}, tot = t.wins != null && t.losses != null ? { w: t.wins, l: t.losses } : null;
    let n = Math.max(r.game_count > 0 ? r.game_count : 0, ...heard.map(g => g.number || 0));
    if (!n && tot) n = tot.w + tot.l;
    const byNum = Object.fromEntries(heard.map(g => [g.number, g]));
    for (let i = 1; i <= Math.min(n, MAX_GAMES); i++) {
      if (cut.has(i)) continue;
      const g = byNum[i] || {}, has = g.my_score != null && g.their_score != null;
      const w = g.result === 'win' ? 'us' : g.result === 'loss' ? 'them' : has && g.my_score !== g.their_score ? (g.my_score > g.their_score ? 'us' : 'them') : null;
      let l = has ? Math.min(g.my_score, g.their_score) : null;
      // A score the app can't store (or one that disagrees with the result) is dropped and flagged, never altered.
      if (l != null && (!w || winnerScore(l, format) !== Math.max(g.my_score, g.their_score) || (w === 'us') !== (g.my_score > g.their_score))) { l = null; fp.result = 'scores'; }
      d.games.push({ w, l });
    }
    // Only one side of the total and no count ("won two"): those games all share one result, so no order is invented.
    if (!d.games.length && !n && (t.wins || t.losses)) for (let i = 0; i < Math.min(t.wins || t.losses, MAX_GAMES); i++) d.games.push({ w: t.wins ? 'us' : 'them', l: null });
    d.totals = tot;
    if (!d.games.length) fp.result = 'missing';
    else if (tot && !fits(d.games, tot)) fp.result = 'conflict';
    // Notes: V1 taxonomy. Up to 3 tags per side; "unsure" notes need the player to pick a side.
    const by = c => r.observations.filter(o => o.category === c);
    const tags = os => [...new Set(os.map(o => o.area || 'Other'))].slice(0, 3);
    d.wt = tags(by('won_points')); d.lt = tags(by('lost_points'));
    const zh = r.language === 'zh', join = os => os.map(o => o.text.trim()).map(t => /[.!?。！？]$/.test(t) ? t : t + (zh ? '。' : '.')).join(zh ? '' : ' ');
    d.worked = join(by('won_points'));
    // Opponent notes go to Opponent Notes. One the parser says is about the partner is not about an opponent: it joins
    // the notes to check (like an unsure note) instead, so it is never shown as a note on the opponents.
    const partnerHeard = ((d.slots.partner || {}).heard || '').trim().toLowerCase();
    const aboutPartner = o => !!partnerHeard && (o.about || '').trim().toLowerCase() === partnerHeard;
    const check = by('unsure').concat(by('opponent').filter(aboutPartner));
    d.lost = join(by('lost_points').concat(check));
    d.on = join(by('opponent').filter(o => !aboutPartner(o)));
    if (check.length) fp.notes = 'check';
    return d;
  }

  const api = { SAMPLES, SCENARIOS, sample, chunks, cues, mockParse, resolve, resolveAll, inferType, lineup, choosePartner, unresolved, slotKeys,
    toDraft, fits, tally, savedGames, gameResult, hasScore, fromSaved, winnerScore, MAX_GAMES, UNKNOWN, isUnknown, unknownId, heardOf, isParticipant, participantId, sidesOf, savedPlayers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RallywiseVoice = api;
})(typeof window !== 'undefined' ? window : globalThis);
