// Compares one parsed result with a case's expectations.
// Returns field checks (for accuracy) and "invented" findings: values the model produced that the
// transcript does not support. Only fields listed in `expect` are checked.

const norm = s => String(s ?? '').trim().toLowerCase();
const anyOf = (want, got) => (want && typeof want === 'object' && Array.isArray(want.any)) ? want.any.includes(got) : want === got;
const sameName = (a, b) => norm(a) === norm(b);

export function score(expect, actual) {
  const checks = [];   // { field, ok, want, got }
  const invented = []; // { kind, detail }
  const check = (field, ok, want, got) => checks.push({ field, ok: !!ok, want, got });

  if ('match_type' in expect) {
    check('match_type', anyOf(expect.match_type, actual.match_type), expect.match_type, actual.match_type);
    if (expect.match_type === null && actual.match_type !== null) invented.push({ kind: 'match_type', detail: actual.match_type });
  }
  if ('multiple_lineups' in expect) {
    check('multiple_lineups', expect.multiple_lineups === actual.multiple_lineups, expect.multiple_lineups, actual.multiple_lineups);
  }
  if ('game_count' in expect) {
    check('game_count', expect.game_count === actual.game_count, expect.game_count, actual.game_count);
    if (expect.game_count === null && actual.game_count !== null) invented.push({ kind: 'game_count', detail: actual.game_count });
  }
  if ('totals' in expect) for (const k of ['wins', 'losses']) {
    const want = expect.totals[k], got = actual.totals?.[k] ?? null;
    check('totals.' + k, want === got, want, got);
    if (want === null && got !== null) invented.push({ kind: 'totals', detail: `${k}=${got}` });
  }
  if ('order_known' in expect) {
    check('order_known', expect.order_known === actual.order_known, expect.order_known, actual.order_known);
  }
  const ag = actual.games || [];
  if ('games' in expect) {
    check('games.length', expect.games.length === ag.length, expect.games.length, ag.length);
    for (const eg of expect.games) {
      const g = ag.find(x => x.number === eg.number);
      check(`game${eg.number}.result`, g && g.result === eg.result, eg.result, g ? g.result : undefined);
      if (g && eg.result === null && g.result) invented.push({ kind: 'result', detail: `game ${eg.number} ${g.result}${g.interrupted ? ' (interrupted)' : ''}` });
      if ('interrupted' in eg) check(`game${eg.number}.interrupted`, g && g.interrupted === eg.interrupted, eg.interrupted, g ? g.interrupted : undefined);
      for (const k of ['my_score', 'their_score']) {
        check(`game${eg.number}.${k}`, g && g[k] === eg[k], eg[k], g ? g[k] : undefined);
        if (g && eg[k] === null && g[k] !== null) invented.push({ kind: 'score', detail: `game ${eg.number} ${k}=${g[k]}` });
      }
    }
    // Games the model listed that the description never placed in order.
    for (const g of ag) if (!expect.games.some(e => e.number === g.number) && (g.result || g.my_score != null)) {
      invented.push({ kind: 'game_order', detail: `game ${g.number} ${g.result || ''} ${g.my_score ?? ''}-${g.their_score ?? ''}`.trim() });
    }
  }
  if (expect.no_results) {
    const bad = ag.filter(g => g.result || g.my_score != null);
    check('no_results', bad.length === 0, 0, bad.length);
    bad.forEach(g => invented.push({ kind: 'result', detail: `game ${g.number} ${g.result}` }));
  }
  if ('players' in expect) {
    for (const ep of expect.players) {
      const p = (actual.players || []).find(x => sameName(x.name, ep.name));
      check(`player.${ep.name}`, !!p, ep.name, p ? p.name : undefined);
      check(`player.${ep.name}.role`, p && anyOf(ep.role, p.role), ep.role, p ? p.role : undefined);
    }
    for (const p of actual.players || []) if (!expect.players.some(ep => sameName(ep.name, p.name))) invented.push({ kind: 'player', detail: p.name });
  }
  if ('observations' in expect) {
    const obs = actual.observations || [];
    for (const eo of expect.observations) {
      const hit = obs.find(o => o.category === eo.category && eo.any.some(k => norm(o.text).includes(norm(k))));
      const nearby = obs.find(o => eo.any.some(k => norm(o.text).includes(norm(k))));
      check(`obs.${eo.category}:${eo.any[0]}`, !!hit, eo.category, hit ? hit.category : nearby ? `${nearby.category} (wrong category)` : 'not found');
    }
    if (!expect.observations.length) obs.forEach(o => invented.push({ kind: 'observation', detail: o.text }));
  }
  const passed = checks.filter(c => c.ok).length;
  return { checks, invented, passed, total: checks.length, accuracy: checks.length ? passed / checks.length : 1 };
}
