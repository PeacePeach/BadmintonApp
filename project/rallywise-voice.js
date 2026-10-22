// Voice Log Match, Phase 1: mock speech and mock parsing behind the same seams the real engine will use.
// Nothing here calls a paid service. The parse result has exactly the shape the parse-voice-log edge function
// returns (voice-v2-live: supabase/functions/_shared/voice-parse-core.js SCHEMA), so Phase 2 swaps mockParse()
// for that call and keeps toDraft() and the screens as they are.
(function (root) {
  const base = over => ({ language: 'en', match_type: null, multiple_lineups: false, game_count: null, order_known: false,
    totals: { wins: null, losses: null }, players: [], games: [], observations: [], missing: [], ambiguities: [], ...over });
  const game = (number, result, my_score, their_score) => ({ number, result, my_score, their_score, interrupted: false });
  const obs = (text, category, area) => ({ text, category, area, about: null });

  // Sample sessions, one per scenario and language. The recording "hears" the text; Continue "parses" it.
  const SAMPLES = {
    complete: {
      en: { text: 'Played singles against Alex today. Lost the first game 18-21, won the second 21-17, then lost the last one 15-21. My smash was working, but I made too many mistakes at the net.',
        result: base({ match_type: 'singles', game_count: 3, order_known: true, totals: { wins: 1, losses: 2 }, players: [{ name: 'Alex', role: 'opponent' }],
          games: [game(1, 'loss', 18, 21), game(2, 'win', 21, 17), game(3, 'loss', 15, 21)],
          observations: [obs('My smash was working', 'won_points', 'Smash'), obs('Too many mistakes at the net', 'lost_points', 'Net')] }) },
      zh: { text: '今天和Alex打了三局单打，第一局18比21输了，第二局21比17赢了，第三局15比21输了。杀球不错，但是网前失误比较多。',
        result: base({ language: 'zh', match_type: 'singles', game_count: 3, order_known: true, totals: { wins: 1, losses: 2 }, players: [{ name: 'Alex', role: 'opponent' }],
          games: [game(1, 'loss', 18, 21), game(2, 'win', 21, 17), game(3, 'loss', 15, 21)],
          observations: [obs('杀球不错', 'won_points', 'Smash'), obs('网前失误比较多', 'lost_points', 'Net')] }) }
    },
    // Figma 248:2470: a doubles session where one opponent is new and the other was never named.
    missing: {
      en: { text: 'Doubles tonight with Priya against Chris. We won 21-15 and 21-18. Our low serves kept them lifting.',
        result: base({ match_type: 'doubles', game_count: 2, order_known: true, totals: { wins: 2, losses: 0 }, players: [{ name: 'Priya', role: 'partner' }, { name: 'Chris', role: 'opponent' }],
          games: [game(1, 'win', 21, 15), game(2, 'win', 21, 18)], observations: [obs('Low serves kept them lifting', 'won_points', 'Serve')],
          missing: ['opponents'], ambiguities: [{ field: 'players', note: 'Only one opponent named for doubles.' }] }) },
      zh: { text: '今晚和Priya搭档打双打，对手是Chris。两局都赢了，21比15、21比18。发小球让他们一直起球。',
        result: base({ language: 'zh', match_type: 'doubles', game_count: 2, order_known: true, totals: { wins: 2, losses: 0 }, players: [{ name: 'Priya', role: 'partner' }, { name: 'Chris', role: 'opponent' }],
          games: [game(1, 'win', 21, 15), game(2, 'win', 21, 18)], observations: [obs('发小球让他们一直起球', 'won_points', 'Serve')],
          missing: ['opponents'], ambiguities: [{ field: 'players', note: 'Only one opponent named for doubles.' }] }) }
    }
  };
  function sample(scenario, lang) { const s = SAMPLES[scenario] || SAMPLES.complete; return s[lang] || s.en; }

  // Mock speech: the sample arrives in small pieces, like interim recognition results.
  function chunks(text) { return /[㐀-鿿]/.test(text) ? text.match(/[\s\S]{1,2}/g) : text.split(/(?<=\s)/); }

  // Live cues under the transcript. A rough on-device read so the pills react while you talk or type;
  // the parser decides what is actually recorded.
  const CUES = {
    players: (t, names) => names.some(n => n && t.toLowerCase().includes(n.toLowerCase())) || /\b(with|against|vs\.?|versus|partner)\s+\S/i.test(t) || /(和|跟|对手是?|搭档)\S/.test(t),
    games: t => /\bgames?\b|\bsets?\b|局|\b\d{1,2}\s*[-–:]\s*\d{1,2}\b|\d{1,2}\s*比\s*\d{1,2}/i.test(t),
    results: t => /\b(won|lost|win|loss|lose|beat)\b|赢|输|胜|负/i.test(t),
    notes: t => /smash|serve|return|net|defen[cs]e|footwork|clear|drop|placement|mistake|error|working|weak|strong|杀球|发球|接发|网前|防守|步法|落点|失误|不错|需要/i.test(t)
  };
  function cues(text, names) { const t = text || ''; return { players: CUES.players(t, names || []), games: CUES.games(t), results: CUES.results(t), notes: CUES.notes(t) }; }

  // Mock parse. The sample text gives its canned result; anything else gives an honest "nothing understood" result
  // that keeps the words as one unsure note, so Review shows the missing-data states.
  function mockParse(text, lang, scenario) {
    const s = sample(scenario, lang), t = (text || '').trim();
    if (t === s.text) return JSON.parse(JSON.stringify(s.result));
    return base({ language: lang === 'zh' ? 'zh' : 'en', observations: t ? [obs(t, 'unsure', 'Other')] : [],
      missing: ['match_type', 'opponents', 'game_count', 'results', 'scores'] });
  }

  // Same rule as voice-v2-live resolve(): exact name or first name, case-insensitive. One hit links the player;
  // several are ambiguous; none is a new player.
  function resolve(heard, players) {
    const h = heard.trim().toLowerCase();
    const c = players.filter(p => p.id !== 'me' && (p.name.toLowerCase() === h || p.name.split(/\s+/)[0].toLowerCase() === h));
    return { heard: heard.trim(), id: c.length === 1 ? c[0].id : null, cands: c.length > 1 ? c.map(p => p.id) : [] };
  }

  // The app's 21-point scoring from Log Match: a game stores the winner and the loser's points.
  const cap = t => ({ 21: 30, 15: 21, 11: 15 }[t]);
  const winnerScore = (l, t) => l >= t - 1 ? Math.min(l + 2, cap(t)) : t;

  // Parse result -> Log Match draft fields + what Review must ask about. Never invents a player, score or order:
  // anything the result lacks stays empty and is flagged. One record holds one lineup (Han's match-model rule).
  function toDraft(r, players, format) {
    const d = { type: r.match_type === 'doubles' ? 'Doubles' : r.match_type === 'singles' ? 'Singles' : null, partner: null, opp1: null, opp2: null,
      games: [], wt: [], lt: [], worked: '', lost: '', on: '', heard: [], flags: { players: null, result: null, notes: null } };
    const fp = d.flags;
    if (r.multiple_lineups) { d.heard = r.players.map(p => ({ heard: p.name, id: null, cands: [] })); fp.players = 'lineup'; }
    else {
      const opps = [];
      for (const p of r.players) {
        const ref = resolve(p.name, players);
        if (p.role === 'partner' && d.type !== 'Singles' && !d.partner && ref.id) d.partner = ref.id;
        else if (p.role !== 'partner' && ref.id) opps.push(ref.id);
        if (!ref.id) d.heard.push({ ...ref, role: p.role });
        if (p.role === 'unknown') fp.players = 'check';
      }
      [d.opp1, d.opp2] = d.type === 'Singles' ? [opps[0] || null, null] : [opps[0] || null, opps[1] || null];
      const slots = d.type === 'Doubles' ? [d.partner, d.opp1, d.opp2] : [d.opp1];
      // Ambiguous names first, then empty slots (Figma 248:2470 "Missing players"), then names that are new players.
      if (d.heard.some(h => h.cands.length)) fp.players = 'check';
      else if (!fp.players && (!d.type || slots.some(x => !x) || d.heard.length > slots.filter(x => !x).length)) fp.players = 'missing';
      if (!fp.players && d.heard.length) fp.players = 'new';
    }
    // Games: only games whose results are known, in order, with scores the app can store.
    const games = r.games.filter(g => g.result && !g.interrupted);
    for (const g of games.slice(0, 3)) {
      const has = g.my_score != null && g.their_score != null, w = g.result === 'win' ? 'us' : 'them';
      const l = has ? Math.min(g.my_score, g.their_score) : format - 6;
      if (!has || winnerScore(l, format) !== Math.max(g.my_score, g.their_score)) fp.result = 'scores';
      d.games.push({ w, l });
    }
    const t = r.totals || {};
    d.totals = t.wins != null && t.losses != null ? { w: t.wins, l: t.losses } : null;
    if (!d.games.length) { d.games = [{ w: 'us', l: format - 6 }]; fp.result = 'missing'; }
    else if (games.length > 3 || r.games.some(g => g.interrupted) || (r.game_count != null && r.game_count !== games.length)) fp.result = 'scores';
    const wl = d.games.reduce((a, g) => (g.w === 'us' ? a.w++ : a.l++, a), { w: 0, l: 0 });
    if (!fp.result && wl.w === wl.l) fp.result = 'scores';
    // Notes: V1 taxonomy. Up to 3 tags per side; "unsure" notes need the player to pick a side.
    const by = c => r.observations.filter(o => o.category === c);
    const tags = os => [...new Set(os.map(o => o.area || 'Other'))].slice(0, 3);
    d.wt = tags(by('won_points')); d.lt = tags(by('lost_points'));
    const zh = r.language === 'zh', join = os => os.map(o => o.text.trim()).map(t => /[.!?。！？]$/.test(t) ? t : t + (zh ? '。' : '.')).join(zh ? '' : ' ');
    d.worked = join(by('won_points'));
    d.lost = join(by('lost_points').concat(by('unsure')));
    d.on = join(by('opponent'));
    if (by('unsure').length) fp.notes = 'check';
    return d;
  }

  const api = { SAMPLES, sample, chunks, cues, mockParse, resolve, toDraft };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RallywiseVoice = api;
})(typeof window !== 'undefined' ? window : globalThis);
