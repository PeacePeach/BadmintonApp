// Voice prototype: turns the parser's JSON into the Match Details / Notes screen data.
// Loaded by index.html (window.VoiceMap) and by the regression tests in voice-eval/ (module.exports).
(function (root) {
  // Keep spoken totals consistent after a tap; fill the rest only when one answer is left.
  function settleTotals(d) {
    if (!d.totals) return;
    const setW = d.games.filter(g => g.r === 'W').length, setL = d.games.filter(g => g.r === 'L').length;
    const rw = d.totals.w - setW, rl = d.totals.l - setL, open = d.games.filter(g => !g.r);
    if (rw < 0 || rl < 0 || rw + rl !== open.length) { d.totals = null; return; }
    if (open.length && (rw === 0 || rl === 0)) open.forEach(g => g.r = rw === 0 ? 'L' : 'W');
  }

  // A game entry that says nothing (no result, score or partner) is not evidence that a game was played.
  const informative = g => g.result || g.my_score != null || g.their_score != null || (g.partners && g.partners.length);

  // AI result -> screen data. Nothing is added that the result lacks: no games means an empty games list.
  // deps: resolve(name) -> player ref, nid(prefix) -> unique id.
  function mapResult(r, deps) {
    const { resolve, nid } = deps;
    const d = { type: r.match_type === 'doubles' ? 'Doubles' : r.match_type === 'singles' ? 'Singles' : null, partners: [], opponents: [], games: [], totals: null, notes: [] };
    for (const p of r.players) {
      const ref = resolve(p.name);
      if (p.role === 'partner') d.partners.push(ref);
      else { ref.unclear = p.role === 'unknown'; d.opponents.push(ref); }
    }
    const t = r.totals || {};
    const games = r.games.filter(informative);
    let n = r.game_count > 0 ? r.game_count : Math.max(0, ...games.map(g => g.number));
    if (!n && t.wins != null && t.losses != null) n = t.wins + t.losses;
    const byNum = Object.fromEntries(games.map(g => [g.number, g]));
    const keyOf = name => {
      let ref = d.partners.find(p => p.heard.toLowerCase() === name.toLowerCase());
      if (!ref) { ref = resolve(name); d.partners.push(ref); }
      return ref.key;
    };
    for (let i = 1; i <= n; i++) {
      const g = byNum[i] || {};
      d.games.push({ id: nid('g'), r: g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : null,
        a: g.my_score != null ? String(g.my_score) : '', b: g.their_score != null ? String(g.their_score) : '',
        partner: g.partners && g.partners.length ? keyOf(g.partners[0]) : null, open: false });
    }
    // Only one side of the total known and no count: those games all share one result, so no order is invented.
    if (!n && (t.wins || t.losses) && (t.wins == null || t.losses == null)) {
      const k = t.wins != null ? 'W' : 'L', m = t.wins != null ? t.wins : t.losses;
      for (let i = 0; i < m; i++) d.games.push({ id: nid('g'), r: k, a: '', b: '', partner: null, open: false });
    }
    if (t.wins != null && t.losses != null && d.games.some(g => !g.r) && t.wins + t.losses === d.games.length) { d.totals = { w: t.wins, l: t.losses }; settleTotals(d); }
    if (d.type !== 'Doubles') d.games.forEach(g => g.partner = null);
    d.notes = r.observations.map(o => {
      const cat = { won_points: 'won', lost_points: 'lost', opponent: 'opp' }[o.category] || null;
      return { id: nid('n'), text: o.text.trim(), cat, tag: cat === 'opp' ? null : (o.area || 'Other') };
    });
    return d;
  }

  const api = { mapResult, settleTotals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VoiceMap = api;
})(typeof window !== 'undefined' ? window : globalThis);
