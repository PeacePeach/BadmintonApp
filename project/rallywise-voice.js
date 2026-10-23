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
    // One name, nothing on singles or doubles or which side: the match type stays open.
    type: {
      en: { text: 'Played with Marcus today. Won 21-15, lost 19-21, won 21-18.',
        result: base({ game_count: 3, order_known: true, totals: { wins: 2, losses: 1 }, players: [P('Marcus', 'unknown')],
          games: [game(1, 'win', 21, 15), game(2, 'loss', 19, 21), game(3, 'win', 21, 18)], missing: ['match_type'] }) },
      zh: { text: '今天和Marcus打球，21比15赢，19比21输，21比18赢。',
        result: base({ language: 'zh', game_count: 3, order_known: true, totals: { wins: 2, losses: 1 }, players: [P('Marcus', 'unknown')],
          games: [game(1, 'win', 21, 15), game(2, 'loss', 19, 21), game(3, 'win', 21, 18)], missing: ['match_type'] }) }
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
    notes: t => /smash|serve|return|net|defen[cs]e|footwork|clear|drop|placement|mistake|error|working|weak|strong|杀球|发球|接发|网前|防守|步法|落点|失误|不错|需要/i.test(t)
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
  function resolve(heard, players) {
    const h = heard.trim().toLowerCase();
    const c = players.filter(p => p.id !== 'me' && (p.name.toLowerCase() === h || p.name.split(/\s+/)[0].toLowerCase() === h));
    return { heard: heard.trim(), id: c.length === 1 ? c[0].id : null, cands: c.length > 1 ? c.map(p => p.id) : [],
      state: c.length === 1 ? 'confirmed' : c.length > 1 ? 'ambiguous' : 'new' };
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
  const heardOf = id => isUnknown(id) ? id.slice(UNKNOWN.length) : '';

  // The app's 21-point scoring from Log Match: a game stores the winner and the loser's points.
  const cap = t => ({ 21: 30, 15: 21, 11: 15 }[t]);
  const winnerScore = (l, t) => l >= t - 1 ? Math.min(l + 2, cap(t)) : t;

  // Parse result -> Log Match draft fields + what Review must ask about. Never invents a player, score or order:
  // anything the result lacks stays empty and is flagged. A result with several lineups never becomes a draft
  // (the caller shows the one-lineup notice instead; Han's match-model rule).
  function toDraft(r, players, format) {
    const type = inferType(r);
    const d = { type, partner: null, opp1: null, opp2: null, slots: {}, pool: [],
      games: [], wt: [], lt: [], worked: '', lost: '', on: '', flags: { players: null, result: null, notes: null } };
    const fp = d.flags;
    const people = r.multiple_lineups ? [] : r.players.map(p => ({ ...resolve(p.name, players), role: p.role }));
    const l = lineup(type, people);
    d.slots = l.slots; d.pool = l.pool;
    for (const k of slotKeys(type)) d[k] = d.slots[k].state === 'confirmed' ? d.slots[k].id : null;
    // People heard before the type is known are kept so choosing Singles or Doubles can place them.
    if (!type) d.people = people;
    fp.players = !type ? 'type' : unresolved(type, d.slots, d.pool) ? 'unknown' : null;
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

  const api = { SAMPLES, SCENARIOS, sample, chunks, cues, mockParse, resolve, inferType, lineup, choosePartner, unresolved, slotKeys,
    toDraft, UNKNOWN, isUnknown, unknownId, heardOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RallywiseVoice = api;
})(typeof window !== 'undefined' ? window : globalThis);
