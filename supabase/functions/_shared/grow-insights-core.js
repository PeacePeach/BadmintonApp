// Growth Insights Engine V2: the evidence behind the Grow page, worked out from the player's own records.
// Plain ES module with no dependencies, shared by the generate-grow-insights edge function (Deno) and the
// Node tests in tests/grow-insights.test.mjs, so both run exactly the same detectors, ranking and checks.
//
// The engine computes every number. The one AI call only picks one of the ranked candidates and writes the
// copy; validateKey/validateItem then check that copy against the candidate, and anything that fails is
// replaced by the hand-written template for that candidate. No candidate means no Key Insight ("insufficient").
//
// Evidence comes in two kinds and the copy never mixes them up:
//   scores      games and points as recorded: objective, the copy may say "won", "margin"
//   notes_tags  Skill Tags the player picked (or voice put) under What Worked / What Cost Points: self-reported,
//               once per match, so the copy says "you noted / mentioned" and never counts mistakes or points.
// A match without notes is skipped for note evidence; it is never read as "the problem didn't happen".
//
// The three charts (RWKeyChart): the pattern follows what the evidence is, never the headline.
//   trend    one continuous measurement per match (average point margin per game)
//   compare  a count compared between your last 3 matches and the 3 before (games won, close games won)
//   strip    whether a self-reported observation was noted in each match (0/1), in order

export const ENGINE_VERSION = '2026-10-26-v14';
export const SKILL_TAGS = ['Serve', 'Return', 'Net', 'Smash', 'Defence', 'Footwork', 'Placement'];
const WINDOW = 10;     // latest matches the Key Insight reads
const HISTORY = 20;    // latest matches Build Next, Strengths, opponent plans and Doubles Play read
const SKILL_N = 12;    // matches with notes in the Build Next / Strengths window
const NOTE_N = 6;      // matches with notes in a Skill Tag window
const TREND_N = 6;     // scored matches in the margin trend
const CLOSE = 3;       // a close game is decided by 3 points or fewer (as on Insights Performance)
// Quality bar (Han, 2026-10-26): a candidate below it is not worth a Key Insight, and with none above it the tile
// says there is not enough evidence. Quality is the ranking score without the "same as last time" discount.
export const KEY_MIN_QUALITY = 0.4;

// Tag labels. Titles use the app's tag names (tag_* in the app); sentences use a lower-case noun phrase.
const TAG = {
  en: { Serve: ['Serve', 'serve'], Return: ['Return', 'return'], Net: ['Net play', 'net play'], Smash: ['Smash', 'smash'],
    Defence: ['Defence', 'defence'], Footwork: ['Footwork', 'footwork'], Placement: ['Placement', 'placement'] },
  zh: { Serve: ['发球', '发球'], Return: ['接发', '接发'], Net: ['网前', '网前'], Smash: ['杀球', '杀球'],
    Defence: ['防守', '防守'], Footwork: ['步法', '步法'], Placement: ['落点', '落点'] }
};
const APP_TAG_LABELS = { en: { Serve: 'Serve', Return: 'Return', Net: 'Net', Smash: 'Smash', Defence: 'Defence', Footwork: 'Footwork', Placement: 'Placement', Other: 'Other' },
  zh: { Serve: '发球', Return: '接发', Net: '网前', Smash: '杀球', Defence: '防守', Footwork: '步法', Placement: '落点', Other: '其他' } };
const tagTitle = (lang, t) => TAG[lang][t][0];
const tagWord = (lang, t) => TAG[lang][t][1];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Records ----

// A saved game is [your points, their points], or { r: 'W' | 'L' } when no score was given (same as the app).
export function gameResult(g) {
  if (Array.isArray(g)) return typeof g[0] === 'number' && typeof g[1] === 'number' ? (g[0] > g[1] ? 'W' : g[0] < g[1] ? 'L' : null) : null;
  return g && (g.r === 'W' || g.r === 'L') ? g.r : null;
}
const scored = m => (m.games || []).filter(g => Array.isArray(g) && typeof g[0] === 'number' && typeof g[1] === 'number');
export function matchResult(m) {
  const r = (m.games || []).map(gameResult), w = r.filter(x => x === 'W').length, l = r.filter(x => x === 'L').length;
  return w > l ? 'win' : l > w ? 'loss' : w ? 'even' : null;
}
const hasNotes = m => (m.wt || []).length > 0 || (m.lt || []).length > 0;
// The player's free-text notes in these matches (What Worked = worked, What Cost Points = lost), latest last, at most 4.
const notesFor = (ms, fields = ['lost', 'worked']) => ms.flatMap(m => fields.map(f => String(m[f] || '').trim().slice(0, 300)).filter(Boolean)).slice(-4);

// Oldest -> latest, at most WINDOW (Key Insight) or HISTORY (everything else). Input rows are the matches table
// (date, created_at), newest first or any order.
const chronological = matches => [...(matches || [])]
  .sort((a, b) => (a.date === b.date ? String(a.created_at || '').localeCompare(String(b.created_at || '')) : String(a.date).localeCompare(String(b.date))));
export const normalize = matches => chronological(matches).slice(-WINDOW);
export const history = matches => chronological(matches).slice(-HISTORY);

// ---- Topics (Build Next / Focus identity) ----
// A topic is "tag:<Skill Tag>" when it comes from a tag or its name is a tag in either language, otherwise
// "text:<name without case, spacing or punctuation>". Same rule as the app's topicKey().
const norm = x => String(x || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
export function topicKey(name, tag) {
  if (tag) return 'tag:' + tag;
  const n = norm(name);
  if (!n) return '';
  const t = Object.keys(APP_TAG_LABELS.en).find(k => norm(k) === n || ['en', 'zh'].some(l => norm(APP_TAG_LABELS[l][k]) === n));
  return t ? 'tag:' + t : 'text:' + n;
}
// A Focus row's topic: its stored topic_id (column added by 20261025000000_focus_topic_id.sql) when there is one,
// else a Grow item it was made from (same name in the previous insight), else topicKey(title).
export function focusTopic(f, previous) {
  if (f.topic_id) return f.topic_id;
  const n = norm(f.title);
  const items = previous ? [...(previous.buildNext || []), ...(previous.strengths || [])] : [];
  const hit = items.find(x => x && x.topic_id && norm(x.name) === n);
  return hit ? hit.topic_id : topicKey(f.title);
}

const CJK = /[㐀-鿿]/;

// ---- Small statistics ----
const round1 = v => Math.round(v * 10) / 10;
const sum = a => a.reduce((x, y) => x + y, 0);
const mean = a => (a.length ? sum(a) / a.length : 0);
function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
}
// Spearman rank correlation of the values with match order.
export function spearman(values) {
  const n = values.length; if (n < 3) return 0;
  const rx = values.map((_, i) => i + 1), ry = ranks(values), mx = mean(rx), my = mean(ry);
  let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { a += (rx[i] - mx) * (ry[i] - my); b += (rx[i] - mx) ** 2; c += (ry[i] - my) ** 2; }
  return b && c ? a / Math.sqrt(b * c) : 0;
}

// ---- Copy helpers ----
const signed = v => (v > 0 ? '+' : '') + (Number.isInteger(v) ? String(v) : v.toFixed(1));
const pts = v => Math.abs(v) === 1 ? 'point' : 'points';
const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const zhLen = s => [...String(s || '').replace(/[\s，。、！？：；“”‘’（）,.!?:;()"'+\-−]/g, '')].length;

// Window phrases. When matches were skipped (no notes, or no scores), the copy says so: "noted matches" /
// 「有记录的」, "scored matches" / 「有比分的」.
function phr(lang, c) {
  const skip = c.evidence.window.skipped > 0, notes = c.source === 'notes_tags';
  const q = skip ? (lang === 'zh' ? (notes ? '有记录的' : '有比分的') : (notes ? 'noted ' : 'scored ')) : '';
  if (lang === 'zh') return { lastN: n => `最近${q}${n}场`, last3: `最近${q}3场`, prev3: '之前3场' };
  // English, skipped matches: "the last 3 with notes" (shorter than "your last 3 noted matches", for the 3-line body).
  if (skip && notes) return { lastN: n => `the last ${n} with notes`, last3: 'the last 3 with notes', prev3: 'the 3 before' };
  return { lastN: n => `your last ${n} ${q}matches`, last3: `your last 3 ${q}matches`, prev3: 'the 3 before' };
}
// Matches inside the window's span that it skipped.
const skippedIn = (chron, ms, keep) => (ms.length ? chron.slice(chron.indexOf(ms[0])).filter(m => !keep(m)).length : 0);

// ---- Key Insight candidates ----
// Each candidate: { id, family, pattern, source, tag?, side?, shape, direction, strength, numbers, required,
//   chart: { pattern, values, quote, split?, unit }, evidence: {...}, match_ids, score }.

function trendCandidate(chron) {
  const ms = chron.filter(m => scored(m).length).slice(-TREND_N);
  if (ms.length < 5) return null;
  const values = ms.map(m => round1(mean(scored(m).map(g => g[0] - g[1]))));
  const rho = spearman(values), a = values[0], b = values[values.length - 1], delta = round1(b - a);
  const h = Math.floor(values.length / 2), halves = round1(mean(values.slice(-h)) - mean(values.slice(0, h)));
  if (Math.abs(rho) < 0.6 || Math.abs(delta) < 3 || Math.sign(delta) !== Math.sign(rho) || Math.sign(halves) !== Math.sign(rho) || Math.abs(halves) < 2) return null;
  const direction = rho > 0 ? 'up' : 'down', strength = Math.abs(rho) >= 0.8 && values.length >= 6 ? 'strong' : 'moderate';
  return {
    id: 'trend:margin', family: 'trend', pattern: 'trend', source: 'scores', shape: direction, direction, strength,
    numbers: { a, b, n: values.length }, required: [Math.abs(a), Math.abs(b)],
    allowed: [Math.abs(a), Math.abs(b), values.length],
    chart: { pattern: 'trend', values, quote: [0, values.length - 1], unit: '' },
    evidence: { metric: 'avg_point_margin_per_game', unit: 'points', window: { matches: values.length, skipped: skippedIn(chron, ms, m => scored(m).length > 0) }, rho: round1(rho), delta },
    match_ids: ms.map(m => m.id), notes: notesFor(ms),
    significance: Math.min(1, 0.6 + Math.abs(delta) / 20), actionability: 0.8
  };
}

// Count per match, last 3 vs the 3 before, among the latest 6 matches that have it at all.
function compareCandidate(chron, kind) {
  const close = kind === 'close';
  const per = m => {
    const gs = close ? scored(m).filter(g => Math.abs(g[0] - g[1]) <= CLOSE) : (m.games || []).filter(g => gameResult(g));
    return { won: gs.filter(g => gameResult(g) === 'W').length, played: gs.length };
  };
  // Close games are counted over the latest 6 scored matches (a match may have none); games won over the latest 6 with results.
  const keep = close ? m => scored(m).length > 0 : m => per(m).played > 0, ms = chron.filter(keep).slice(-6);
  if (ms.length < 6) return null;
  const rows = ms.map(per), prev = rows.slice(0, 3), last = rows.slice(3);
  const p = sum(prev.map(x => x.won)), pn = sum(prev.map(x => x.played)), r = sum(last.map(x => x.won)), rn = sum(last.map(x => x.played));
  const minGames = close ? 3 : 5;
  if (pn < minGames || rn < minGames) return null;
  const diff = r / rn - p / pn;
  if (Math.abs(diff) < (close ? 0.34 : 0.3) || Math.abs(r - p) < 2) return null;
  const direction = diff > 0 ? 'up' : 'down', strength = Math.abs(diff) >= 0.5 ? 'strong' : 'moderate';
  return {
    id: close ? 'compare:close_games' : 'compare:games_won', family: 'compare', pattern: 'compare', source: 'scores', shape: direction, direction, strength,
    numbers: { r, rn, p, pn }, required: [r, p], allowed: [r, rn, p, pn, 3],
    chart: { pattern: 'compare', values: rows.map(x => x.won), split: 3, unit: '' },
    evidence: { metric: close ? 'close_games_won' : 'games_won', unit: 'games', window: { matches: 6, recent: 3, previous: 3, skipped: skippedIn(chron, ms, keep) } },
    match_ids: ms.map(m => m.id), notes: notesFor(ms),
    significance: Math.min(1, 0.6 + Math.abs(diff) * 0.6), actionability: close ? 0.75 : 0.6, lowNovelty: !close
  };
}

// A Skill Tag noted (or not) in each of the latest 6 matches with notes. Shapes, by what the 0/1 row says:
//   recurring  noted in 4+ of 6 and in 2+ of the last 3        (still happening)
//   emerging   noted in 2+ of the last 3 and at least 2 fewer of the 3 before
// Fewer mentions is never a candidate on either side (Han, 2026-10-26): a cost tag the player stopped picking
// (e.g. [1,1,1,0,1,0]) is an absence of notes, not proof the problem went away, and fewer "what worked" mentions
// don't show anything got worse.
// A recurring cost tag is "linked" to results when it was noted in 3+ of the recorded losses in that window, in at least
// two thirds of them, and losses were at least half again as common with it as without it. The strip then shows
// each match's result under its pill (xLabels), so the chart carries what the copy says.
// Han (2026-10-26): results are only the recorded ones (matchResult: more games won or lost, scored or { r }).
// A match with no result, or level games, is "unknown": it is left out of the rates, never guessed, and its
// label is "·". At least 4 of the 6 must have a result. The copy states an association (it showed up in the
// losses), never that the skill caused them; checkCopy rejects causal wording.
// An emerging "what worked" tag that cost points in 2+ of the 3 matches before is a turnaround (ranked higher).
// A tag noted on both sides of the same match in half or more of its matches is mixed, and not used.
function tagCandidates(chron) {
  const noted = chron.filter(hasNotes), win = noted.slice(-NOTE_N);
  if (win.length < NOTE_N) return [];
  const skipped = skippedIn(chron, win, hasNotes);
  const res = win.map(m => matchResult(m)), losses = res.filter(r => r === 'loss').length;
  const known = res.map(r => r === 'win' || r === 'loss');
  const out = [];
  for (const side of ['cost', 'worked']) for (const tag of SKILL_TAGS) {
    const f = side === 'cost' ? 'lt' : 'wt', o = side === 'cost' ? 'wt' : 'lt';
    const values = win.map(m => ((m[f] || []).includes(tag) ? 1 : 0)), k = sum(values);
    if (!k) continue;
    const both = win.filter(m => (m[f] || []).includes(tag) && (m[o] || []).includes(tag)).length;
    if (both * 2 >= k) continue;
    const p = sum(values.slice(0, 3)), r = sum(values.slice(3));
    let shape = null;
    if (k >= 4 && r >= 2) shape = 'recurring';
    else if (r >= 2 && r - p >= 2) shape = 'emerging';
    if (!shape) continue;
    const lt = values.filter((v, i) => v && res[i] === 'loss').length;
    const taggedKnown = values.filter((v, i) => v && known[i]).length, untaggedKnown = values.filter((v, i) => !v && known[i]).length;
    const linked = side === 'cost' && shape === 'recurring' && known.filter(Boolean).length >= 4 && lt >= 3 && lt * 3 >= losses * 2 &&
      taggedKnown > 0 && untaggedKnown > 0 && lt / taggedKnown - values.filter((v, i) => !v && res[i] === 'loss').length / untaggedKnown >= 0.5;
    const turnaround = side === 'worked' && shape === 'emerging' && sum(win.slice(0, 3).map(m => ((m.lt || []).includes(tag) ? 1 : 0))) >= 2;
    const strength = shape === 'recurring' ? (k >= 5 || linked ? 'strong' : 'moderate') : Math.abs(p - r) === 3 ? 'strong' : 'moderate';
    const latest = values[values.length - 1];
    const numbers = linked ? { k, n: NOTE_N, r, p, l: losses, lt } : { k, n: NOTE_N, r, p };
    out.push({
      id: `strip:${side}:${tag}:${shape}`, family: 'tag', pattern: 'strip', source: 'notes_tags', tag, side, shape,
      direction: 'up', strength, linked, turnaround,
      numbers, required: linked ? [lt, losses] : shape === 'recurring' ? [k, NOTE_N] : [r, p],
      allowed: linked ? [k, NOTE_N, r, p, 3, losses, lt] : [k, NOTE_N, r, p, 3],
      chart: { pattern: 'strip', values, unit: '', ...(linked ? { results: res.map(x => (x === 'loss' ? 'L' : x === 'win' ? 'W' : '')) } : {}) },
      evidence: { metric: side === 'cost' ? 'tag_noted_cost_points' : 'tag_noted_worked', unit: 'matches', window: { matches: NOTE_N, recent: 3, previous: 3, skipped } },
      match_ids: win.map(m => m.id),
      notes: notesFor(win.filter((m, i) => values[i]), side === 'cost' ? ['lost'] : ['worked']),
      significance: Math.min(1, (shape === 'recurring' ? 0.55 + k * 0.07 : 0.6 + Math.abs(p - r) * 0.1) + (linked ? 0.15 : 0) + (turnaround ? 0.1 : 0)),
      actionability: side === 'cost' ? 1.0 : 0.7,
      // Recurring tags are also what Build Next / Strengths show, so they are less of a discovery than a change,
      // unless they line up with the results.
      novelty: shape === 'recurring' && !linked ? 0.75 : 1,
      recentSupport: latest === 1
    });
  }
  return out;
}

// Ranking: significance x confidence x actionability x novelty x recency. Ties: objective evidence, then id.
//   significance   size of the change or how often it was noted (+ when a cost tag lines up with the losses)
//   confidence     strong 1, moderate 0.75
//   actionability  cost-points tag 1, score trend 0.8, close games 0.75, worked tag 0.7, games won 0.6
//   novelty        0.6 when it is the same insight as last time; games won 0.8 (Performance already shows form);
//                  recurring tags 0.75 unless linked to results (Build Next / Strengths already list them)
//   recency        0.85 when the latest match doesn't support it
// quality is the same score without the "same as last time" discount; below KEY_MIN_QUALITY a candidate is dropped.
export function rankCandidates(cands, previousId) {
  for (const c of cands) {
    const conf = c.strength === 'strong' ? 1 : 0.75;
    const novelty = (c.lowNovelty ? 0.8 : 1) * (c.novelty || 1);
    const recency = c.recentSupport === false ? 0.85 : 1;
    c.quality = Math.round(c.significance * conf * c.actionability * novelty * recency * 1000) / 1000;
    c.score = Math.round(c.quality * (c.id === previousId ? 0.6 : 1) * 1000) / 1000;
  }
  return cands.sort((a, b) => b.score - a.score || (a.source === 'scores' ? -1 : 0) - (b.source === 'scores' ? -1 : 0) || a.id.localeCompare(b.id));
}

// The Key Insight candidates worth showing, best first. all: true keeps the ones under the quality bar (tests, reports).
// Engine v14 (Han, 2026-10-26): the Key Insight follows one hierarchy, and never says "no clear change" while the
// sections under it hold evidence it could have used.
//   P1 performance trend   score trend / games won / close games (objective, unchanged standards)
//   P2 repeated pattern    a Skill Tag strip (latest 6 noted), or a skill noted on one side in 2+ matches of the
//                          Build Next / Strengths window, or 2+ notes about one opponent, or a skill noted in 2+
//                          doubles matches: the same evidence those sections show
//   P3 early observation   one recent note (labelled early), or a skill noted both ways (mixed)
//   P4 none                no_trend (the detectors ran, nothing to say) or insufficient (too little to run them)
// Each candidate carries tier 1-3; the list is ordered by tier, then by group, then by score.
const GROUP = { trend: 0, compare: 0, tag: 1, pattern: 2, opponent: 3, doubles: 4, mixed: 5, early: 6 };
export function keyCandidates(matches, previousId, { all = false, focus = [], names = {} } = {}) {
  const chron = normalize(matches);
  // A strip only on the side the skill is sorted to (see Build Next and Strengths), so the Key Insight never says the
  // opposite of the lists under it. Mixed skills have no strip.
  const sides = topicSides(matches);
  const p1 = rankCandidates([trendCandidate(chron), compareCandidate(chron, 'games'), compareCandidate(chron, 'close')].filter(Boolean), previousId)
    .filter(c => all || c.quality >= KEY_MIN_QUALITY);
  const strips = rankCandidates(tagCandidates(chron).filter(c => sides[c.tag] === c.side), previousId).filter(c => all || c.quality >= KEY_MIN_QUALITY);
  const rest = evidenceCandidates(matches, { focus, names, strips });
  const kc = keyCounts(matches), steady = !p1.length && (kc.scored >= KEY_NEED.scored || kc.results >= KEY_NEED.results);
  for (const c of rest) if (c.family === 'pattern') c.steady = steady;
  p1.forEach(c => { c.tier = 1; }); strips.forEach(c => { c.tier = 2; });
  // The same insight as last time goes after the others in its group.
  const order = c => [c.tier, GROUP[c.family], c.id === previousId ? 1 : 0, -(c.score || 0)];
  return [...p1, ...strips, ...rest].sort((x, y) => { const a = order(x), b = order(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return x.id.localeCompare(y.id); });
}

// P2 / P3 candidates from the evidence Build Next, Strengths, Opponent Plans and Doubles Play use (same functions,
// same windows), so the Key Insight can only summarise what those sections can show.
function evidenceCandidates(matches, { focus = [], names = {}, strips = [] } = {}) {
  const out = [], { win, skipped } = skillTable(matches), n = win.length;
  const window = { matches: n, skipped };
  const hasStrip = (tag, side) => strips.some(c => c.tag === tag && c.side === side);
  const base = (x, o) => ({ pattern: 'text', source: 'notes_tags', chart: null, direction: null, strength: 'moderate', required: [], allowed: [], match_ids: [], notes: [], ...o, ...x });
  const build = buildCandidates(matches, focus, 4), strengths = strengthCandidates(matches, 3);
  for (const b of build) {
    if (b.mixed) { out.push(base({ id: `mixed:${b.tag}`, family: 'mixed', tier: 3, tag: b.tag, side: 'mixed', shape: 'mixed', numbers: { k: b.k, w: b.w, n }, required: [b.k, b.w], allowed: [b.k, b.w, n], notes: b.notes, score: (b.k + b.w) / n }, { evidence: { window } })); continue; }
    if (hasStrip(b.tag, 'cost')) continue;
    if (b.level === 'early') out.push(base({ id: `early:cost:${b.tag}`, family: 'early', tier: 3, tag: b.tag, side: 'cost', shape: 'early', numbers: { k: 1, n: b.n }, required: [], allowed: [1, b.n], notes: [], score: 1 - (b.age || 0) / 10 }, { evidence: { window } }));
    else out.push(base({ id: `pattern:cost:${b.tag}`, family: 'pattern', tier: 2, tag: b.tag, side: 'cost', shape: b.returning ? 'returning' : 'repeated', numbers: { k: b.k, n: b.n }, required: [b.k], allowed: [b.k, b.n, 3], notes: b.notes, score: b.k / b.n + 0.01 * b.recent }, { evidence: { window: b.returning ? { matches: b.n, skipped: 0 } : window } }));
  }
  for (const b of strengths) {
    if (hasStrip(b.tag, 'worked')) continue;
    if (b.level === 'early') out.push(base({ id: `early:worked:${b.tag}`, family: 'early', tier: 3, tag: b.tag, side: 'worked', shape: 'early', numbers: { k: 1, n: b.n }, required: [], allowed: [1, b.n], notes: [], score: 0.5 - (b.age || 0) / 20 }, { evidence: { window } }));
    // A strength ranks just under a cost pattern with the same count: the cost is what to act on.
    else out.push(base({ id: `pattern:worked:${b.tag}`, family: 'pattern', tier: 2, tag: b.tag, side: 'worked', shape: 'repeated', numbers: { k: b.k, n: b.n }, required: [b.k], allowed: [b.k, b.n, 3], notes: b.notes, score: b.k / b.n - 0.001 }, { evidence: { window } }));
  }
  // Opponents: only those an Opponent Plan card can be made for (notes that say something specific).
  for (const o of opponentFacts(matches, names).slice(0, OPP_MAX)) {
    const k = o.notes.length;
    out.push(base({ id: `${k >= 2 ? 'opponent' : 'early:opponent'}:${o.player_id}`, family: k >= 2 ? 'opponent' : 'early', tier: k >= 2 ? 2 : 3, source: 'opp_notes', player_id: o.player_id, name: o.name,
      side: 'opponent', shape: k >= 2 ? 'repeated' : 'early', numbers: { k }, required: [], allowed: [k, 1, 2, 3], notes: o.notes, score: k >= 2 ? k / 10 : 0.2 }, { evidence: { window: { matches: HISTORY, skipped: 0 } } }));
  }
  const d = doublesFacts(matches);
  // Doubles notes without a Skill Tag: still something Doubles Play can show, so still an early observation here.
  if (d && !d.cost_points.length && !d.strengths.length && d.notes.length) out.push(base({ id: 'early:doubles:notes', family: 'early', tier: 3, side: 'notes', shape: 'early', doubles: true,
    numbers: { n: d.noted }, allowed: [d.noted, 1], notes: d.notes.map(t => t.text), score: 0.05 }, { evidence: { window: { matches: d.noted, skipped: 0 } } }));
  if (d) for (const x of [...d.cost_points.map(t => ({ ...t, side: 'cost' })), ...d.strengths.map(t => ({ ...t, side: 'worked' }))].sort((a, b) => b.count - a.count).slice(0, 1)) {
    const rep = x.count >= 2;
    out.push(base({ id: `${rep ? 'doubles' : 'early:doubles'}:${x.side}:${x.tag}`, family: rep ? 'doubles' : 'early', tier: rep ? 2 : 3, tag: x.tag, side: x.side, shape: rep ? 'repeated' : 'early', doubles: true,
      numbers: { k: x.count, n: d.noted }, required: rep ? [x.count] : [], allowed: [x.count, d.noted, 1], notes: d.notes.map(t => t.text), score: rep ? x.count / d.noted - 0.5 : 0.1 }, { evidence: { window: { matches: d.noted, skipped: 0 } } }));
  }
  return out;
}

// ---- Key Insight template copy (also the fallback when AI copy fails validation) ----
// Written as a coach's takeaway (Han, 2026-10-26): the title says what it means for the player, the body gives the
// evidence in plain words. Self-reported evidence always says "you noted" / 「你记下」.
const margin = (v, lang) => {
  const x = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(1);
  if (lang === 'zh') return v > 0 ? `赢${x}分` : v < 0 ? `输${x}分` : '打平';
  return v > 0 ? `winning by ${x}` : v < 0 ? `losing by ${x}` : 'level';
};
export function keyTemplate(c, lang) {
  const P = phr(lang, c), N = c.numbers;
  if (['pattern', 'mixed', 'early', 'opponent', 'doubles'].includes(c.family)) return evidenceTemplate(c, lang, P, N);
  if (c.family === 'trend') {
    const up = c.direction === 'up', strong = c.strength === 'strong';
    if (lang === 'zh') return {
      title: up ? (strong ? '最近比分越打越好' : '比分在慢慢往上走') : (strong ? '最近比分一直在往下走' : '最近比分有点往下走'),
      body: `${P.lastN(N.n)}，你平均每局从${margin(N.a, lang)}变成了${margin(N.b, lang)}。`
    };
    return {
      title: up ? (strong ? 'Your scores are on the rise' : 'Your scores are edging up') : (strong ? 'Your scores have been slipping' : 'Your scores have dipped a little'),
      body: `On average, from ${margin(N.a, lang)} to ${margin(N.b, lang)} ${pts(N.b || N.a)} a game.`
    };
  }
  if (c.family === 'compare') {
    const close = c.id === 'compare:close_games', up = c.direction === 'up';
    if (lang === 'zh') {
      return {
        title: close ? (up ? '关键局最近赢得多了' : '关键局最近赢得少了') : (up ? '最近赢下的局多了' : '最近赢下的局少了'),
        body: close ? `${P.last3}的${N.rn}个关键局赢了${N.r}个，${P.prev3}${N.pn}个${up ? '只' : ''}赢了${N.p}个。`
          : `${P.last3}打了${N.rn}局赢了${N.r}局，${P.prev3}${N.pn}局${up ? '只' : ''}赢了${N.p}局。`
      };
    }
    const g = close ? 'close games' : 'games';
    return {
      title: close ? (up ? "You're winning more of the tight games" : 'Tight games have been slipping away') : (up ? 'More games are going your way' : 'Fewer games are going your way'),
      body: `You won ${N.r} of ${N.rn} ${g} in ${P.last3.replace(/ matches$/, '')}, after ${N.p} of ${N.pn} before.`
    };
  }
  const T = tagTitle(lang, c.tag), w = tagWord(lang, c.tag), cost = c.side === 'cost', recurring = c.shape === 'recurring';
  if (lang === 'zh') {
    const what = cost ? `${w}丢分` : `${w}帮你得分`;
    if (c.linked) return { title: `输球时常有${T}问题`, body: `${P.lastN(N.n)}输了${N.l}场，其中${N.lt === N.l ? '每场你都' : `${N.lt}场你`}记下了${what}。` };
    if (recurring) return { title: cost ? `${T}还在让你丢分` : `${T}是你最近的得分点`,
      body: `${P.lastN(N.n)}有${N.k}场你记下${what}${cost ? `，${P.last3}${N.r === 3 ? '场场都有' : `有${N.r}场`}` : ''}。` };
    return { title: cost ? `${T}最近开始丢分了` : `${T}开始帮你得分了`,
      body: `${P.last3}有${N.r}场你记下${what}，${P.prev3}${N.p === 0 ? '都没有' : `只有${N.p}场`}。` };
  }
  if (c.linked) return { title: `${T} shows up in your losses`,
    body: `You noted it in ${N.lt === N.l ? `all ${N.l}` : `${N.lt} of the ${N.l}`} losses in ${P.lastN(N.n)}.` };
  if (recurring) return cost
    ? { title: `${T} is still costing you points`, body: `You noted it in ${N.k} of ${P.lastN(N.n)}, ${N.r === 3 ? 'all 3' : N.r} of the last 3.` }
    : { title: `${T} is working for you`, body: `You noted it winning points in ${N.k} of ${P.lastN(N.n)}.` };
  return { title: cost ? `${T} has started to cost you` : `${T} is starting to pay off`,
    body: `You noted it in ${N.r} of ${P.last3.replace(/ matches$/, '')}, ${N.p === 0 ? 'none' : N.p} in the 3 before.` };
}

// P2 / P3 wording. A summary of the discovery, not the card text under it: the title says what it means, the body
// gives the count and, for early ones, that it is too early to call a pattern. Never a habit from one note.
function evidenceTemplate(c, lang, P, N) {
  const zh = lang === 'zh', T = c.tag ? tagTitle(lang, c.tag) : '', w = c.tag ? tagWord(lang, c.tag) : '', cost = c.side === 'cost';
  const lastN = P.lastN(N.n);
  if (c.family === 'pattern') {
    if (c.shape === 'returning') return zh ? { title: `${T}又开始丢分了`, body: `完成训练目标后的${N.n}场里，又有${N.k}场你记下${w}丢分。` }
      : { title: `${T} is costing points again`, body: `You noted it in ${N.k} of ${N.n} matches since you completed it.` };
    // steady: the score detectors had enough matches and found no clear change, so this is the bigger story.
    const st = c.steady;
    if (zh) return cost ? { title: `${T}还在反复丢分`, body: `${st ? '比分没有明显变化，但' : ''}${lastN}里有${N.k}场你记下${w}丢分。` }
      : { title: `${T}一直在帮你得分`, body: `${st ? '比分没有明显变化，但' : ''}${lastN}里有${N.k}场你记下${w}打得好。` };
    // The "no real trend" clause only when it still fits the 3-line body.
    const fit = (title, a, b) => ({ title, body: st && lineCount(a, KEY_FIT.body.size) <= KEY_FIT.body.lines ? a : b });
    return cost ? fit(`${T} keeps costing you points`, `You noted it in ${N.k} of ${lastN}; scores show no real trend.`, `You noted it in ${N.k} of ${lastN}.`)
      : fit(`${T} keeps working for you`, `Noted working in ${N.k} of ${lastN}; scores show no real trend.`, `You noted it working in ${N.k} of ${lastN}.`);
  }
  if (c.family === 'mixed') return zh ? { title: `${T}时好时坏`, body: `${lastN}里，${N.k}场你记下它丢分，${N.w}场记下它打得好。` }
    : { title: `${T} has been up and down`, body: `Noted costing points in ${N.k} and working in ${N.w} of ${lastN}.` };
  if (c.family === 'opponent') return zh ? { title: `${c.name}：已有${N.k}场记录`, body: `你在${N.k}场比赛里记下了${c.name}的打法，对手策略就来自这些记录。` }
    : { title: `You have a read on ${c.name}`, body: `You noted how ${c.name} plays in ${N.k} matches. See the plan below.` };
  if (c.family === 'doubles') return zh ? { title: `双打里${T}反复出现`, body: `${N.n}场有记录的双打里，有${N.k}场你记下${w}${cost ? '丢分' : '打得好'}。` }
    : { title: `${T} keeps coming up in doubles`, body: `You noted it ${cost ? 'costing points' : 'working'} in ${N.k} of ${N.n} noted doubles matches.` };
  // early
  if (c.side === 'opponent') return zh ? { title: `初步判断：${c.name}`, body: `目前只有1场关于${c.name}的记录，下次交手先验证。` }
    : { title: `Early read on ${c.name}`, body: `You noted how they play once so far. Test it next time.` };
  if (c.side === 'notes') return zh ? { title: '初步观察：双打', body: `你已经记下了${N.n}场双打，还不算规律，多记几场再看。` }
    : { title: 'Early doubles notes', body: `You have notes on ${N.n} doubles ${N.n === 1 ? 'match' : 'matches'}. Too early to call a pattern.` };
  if (c.doubles) return zh ? { title: `初步观察：双打${T}`, body: `${N.n}场有记录的双打里有1场你记下${w}${cost ? '丢分' : '打得好'}，还不算规律。` }
    : { title: `Early doubles sign: ${T}`, body: `Noted ${cost ? 'costing points' : 'working'} in 1 of ${N.n} noted doubles. Too early to call.` };
  if (zh) return cost ? { title: `初步观察：${T}`, body: `${lastN}里有1场你记下${w}丢分，还不算规律。` }
    : { title: `初步观察：${T}有亮点`, body: `${lastN}里有1场你记下${w}打得好，还不算稳定优势。` };
  // The first wording that fits the tile (title 2 lines, body 3).
  const first = (list, f) => list.find(x => lineCount(x, f.size) <= f.lines) || list[list.length - 1];
  return cost ? { title: `Early sign: ${T}`, body: first([`Noted costing points once in ${lastN}. Too early to call.`, `Noted as a cost once in ${lastN}. Too early to call.`, 'Noted as a cost once. Too early to call.'], KEY_FIT.body) }
    : { title: first([`Early sign: ${T} is working`, `Early sign: ${T}`], KEY_FIT.title), body: first([`Noted working once in ${lastN}. Too early to call.`, 'Noted working once. Too early to call.'], KEY_FIT.body) };
}

// ---- Fit: lines on the Key Insight tile ----
// Han (2026-10-25): title at most 2 lines, body at most 3, in the 6:4 split tile's text column. Lines are counted by
// wrapping with Poppins 500 glyph widths (title 17px, body 14px, letter-spacing -0.16px, measured in the app) at a
// 172px column: the text column on a 375px-wide phone (181px on 390px), so copy that fits there fits wider phones.
export const KEY_FIT = { width: 172, title: { size: 17, lines: 2 }, body: { size: 14, lines: 3 } };
const W17 = [4.42,5.46,5.49,14.82,11.05,13.5,12.94,2.92,8.36,8.36,8.57,12.14,3.82,9.94,4.1,8.74,10.9,5.95,9.81,10.1,11,10.86,10.91,9.52,10.85,10.79,4.16,5.17,10.4,13.16,10.03,9.15,17.42,11.85,10.71,13.14,12.05,8.91,8.75,13.14,11.98,4.49,9.59,10.76,7.55,14.99,12.26,13.33,10.11,13.38,10.74,10.27,9.59,11.73,11.8,16.98,11.22,10.28,9.49,8.24,12.19,8.23,11.12,13.57,4.32,11.53,11.53,10.2,11.53,10.49,5.64,11.53,11.03,4.49,4.49,9.42,4.49,17.66,11.03,10.85,11.53,11.53,6.53,9.08,6.32,11.03,9.79,14.02,8.48,9.89,8.01,8.77,5.51,8.77,9.4];
const WIDE = /[⺀-鿿豈-﫿＀-￯　-〿]/;
const NO_START = /^[，。、：；！？）”’,.!?:;)]/;
const OTHER_W = { '−': 9.94, '–': 12.04, '—': 15.71, '’': 4.11, '“': 7.17, '”': 7.17 };
const charW = (ch, size) => { const c = ch.codePointAt(0); return (c >= 32 && c < 127 ? W17[c - 32] * size / 17 : WIDE.test(ch) ? size : (OTHER_W[ch] || 10) * size / 17) - 0.16; };
export function lineCount(text, size, width = KEY_FIT.width) {
  // Tokens: a Latin word with its trailing space, or one wide (CJK) character. Closing punctuation never starts a
  // line: it takes the character before it along to the next one.
  const toks = []; let cur = '';
  for (const ch of String(text || '').trim()) {
    if (WIDE.test(ch)) { if (cur) toks.push(cur); cur = ''; toks.push(ch); }
    else if (/\s/.test(ch)) { toks.push(cur + ch); cur = ''; }
    else cur += ch;
  }
  if (cur) toks.push(cur);
  const w = t => [...t].reduce((s, ch) => s + charW(ch, size), 0);
  let n = 1, x = 0, prev = 0;
  for (const t of toks) {
    const full = w(t), ink = w(t.trimEnd());
    if (x > 0 && x + ink > width + 0.5) { n++; x = NO_START.test(t) ? prev + full : full; }
    else x += full;
    prev = full;
  }
  return n;
}
export const fits = ({ title, body }) => lineCount(title, KEY_FIT.title.size) <= KEY_FIT.title.lines && lineCount(body, KEY_FIT.body.size) <= KEY_FIT.body.lines;

// ---- Grounding: specific details must come from the player's own notes ----
// Han (2026-10-26): never invent a cause, technique, weakness or match situation. A copy that names one of these
// concepts (in either language) must have it in the notes it was written from; the notes may be in the other
// language, so each concept has English and Chinese forms.
const CONCEPTS = {
  backhand: [/backhand/i, /反手/], forehand: [/forehand/i, /正手/],
  lift: [/\blift(s|ed|ing)?\b/i, /挑球|挑后场|挑高/], clear: [/\bclears?\b/i, /高远球|打高远/],
  drop: [/\bdrop ?shots?\b|\bdrops\b/i, /吊球|吊网/], drive: [/\bdrives?\b|\bdriving\b/i, /平抽|抽挡/],
  push: [/\bpush(es|ed|ing)?\b/i, /推球|推后场/], kill: [/\bnet kills?\b|\bkill(s|ed|ing)? (it|the shuttle)\b/i, /扑球|扑杀/],
  shortServe: [/short serves?/i, /发小球|发短球|发网前/], longServe: [/(long|high|flick) serves?/i, /发高远|发后场|发平快/],
  grip: [/\bgrip/i, /握拍/], wrist: [/\bwrist/i, /手腕/], splitStep: [/split[- ]?step/i, /启动步|垫步|分腿/],
  rotation: [/\brotat/i, /轮转/], rearCourt: [/rear ?court|back ?court|baseline/i, /后场|底线/],
  sideline: [/side ?line|near the line/i, /边线|靠线/],
  body: [/\bbody (shots?|smash(es)?)\b|at the body/i, /追身/], crossCourt: [/cross[- ]?court/i, /对角/], straight: [/\bstraight\b/i, /直线/],
  longRally: [/long rall/i, /多拍|长回合|相持/], endgame: [/deuce|game point|end of (the )?game|closing (out|points)|big points/i, /关键分|局末|赛点|局点/],
  decider: [/third game|deciding game|decider/i, /第三局|决胜局/], fitness: [/tired|stamina|fitness|fatigue/i, /体能|累了|疲劳/],
  nerves: [/nerv|under pressure|feel(s|ing)? (the )?pressure|pressure points|tense/i, /紧张|压力|心态/], height: [/too (high|low|flat)|\bheight\b/i, /太高|太低|过高|高度/],
  intoNet: [/into the net|net cord|hit the net/i, /(?<![记写])下网(?!前)|挂网/], out: [/\bwent out\b|hit (it )?out\b|\bwide\b/i, /出界|打出界/],
  sideBySide: [/side[- ]by[- ]side/i, /平行站位|左右站位/], frontBack: [/front[- ]and[- ]back|front[- ]back/i, /前后站位/],
  pace: [/slow(ed)? (it )?down|change (of )?pace|tempo/i, /节奏|放慢/], deception: [/decept|disguise|hold the shot/i, /假动作|骗/]
};
export function conceptsIn(text) {
  const t = String(text || '');
  return Object.keys(CONCEPTS).filter(k => CONCEPTS[k].some(r => r.test(t)));
}
// Concepts in the copy that the notes don't have. In advice (an action or a plan) a shot or habit to try is a
// suggestion, not a claim about what happened, so only the concepts that describe what went wrong or where
// (a side, a situation, height, nerves...) must come from the notes there.
const REMEDY = new Set(['lift', 'clear', 'drop', 'drive', 'push', 'kill', 'shortServe', 'longServe', 'grip', 'wrist', 'splitStep', 'rotation', 'frontBack', 'pace', 'deception', 'crossCourt', 'straight']);
export function ungrounded(text, notes, { advice = false } = {}) {
  const have = new Set(conceptsIn((notes || []).join(' \n ')));
  return conceptsIn(text).filter(k => !have.has(k) && !(advice && REMEDY.has(k)));
}
// Copy is anchored in notes when it shares a concept or a content word with them (any language for concepts).
const STOP_EN = new Set(['their', 'there', 'about', 'again', 'match', 'matches', 'points', 'point', 'games', 'game', 'every', 'would', 'could', 'should', 'which', 'while', 'where', 'other', 'opponent', 'shots', 'shot', 'really', 'still', 'often', 'start', 'early', 'keep', 'more', 'them', 'they', 'with', 'from', 'that', 'this', 'your', 'when', 'than', 'then', 'have']);
const STOP_ZH = new Set(['最近', '比赛', '对手', '可以', '一下', '注意', '时候', '我们', '他们', '自己', '一点', '比较', '还是', '就是', '这个', '那个', '没有', '打得', '的时', '一些', '多打', '多用', '一直', '不要', '尽量']);
function contentTokens(t) {
  const s = String(t || '').toLowerCase(), out = new Set();
  for (const w of s.match(/[a-z]{4,}/g) || []) if (!STOP_EN.has(w)) out.add(w.replace(/(ing|ed|es|s)$/, ''));
  for (const run of s.match(/[㐀-鿿]+/g) || []) for (let i = 0; i + 1 < run.length; i++) { const b = run.slice(i, i + 2); if (!STOP_ZH.has(b)) out.add(b); }
  return out;
}
// Notes and copy are often in different languages (Chinese notes, English app), where no content word can match.
// Then the copy is anchored when it shares a concept or one of these badminton terms with the notes. Used for
// anchoring only: naming one of these is never a detail that has to be grounded.
const ANCHOR = {
  net: [/\bnet\b|front ?court|forecourt/i, /网前|前场|封网|搓球|放网/], serve: [/\bserv(e|es|ing)\b/i, /发球|发小球|发高远/],
  return: [/\breturn/i, /接发/], smash: [/\bsmash/i, /杀球|扣杀|接杀/], defence: [/defen[cs]|\bdefend/i, /防守|接杀/],
  footwork: [/footwork|movement|\bmov(e|es|ing)\b/i, /步法|步伐|移动/], placement: [/placement|\bplac(e|ing)\b/i, /落点|线路/],
  attack: [/attack|aggress|offen/i, /进攻|攻击|主动|积极/], speed: [/\bfast|quick|speed/i, /快|速度/],
  power: [/power|heavy|hard/i, /重|力量/], variation: [/vari|mix(es|ed|ing)? (it )?up|chang/i, /变化/],
  steady: [/steady|consistent|solid|stable|reliab/i, /稳/], weak: [/\bweak/i, /弱/], pressure: [/press|pressure|target/i, /压|打我|攻我/],
  passive: [/passive|on the back foot/i, /被动/]
};
const anchorTerms = t => Object.keys(ANCHOR).filter(k => ANCHOR[k].some(r => r.test(t)));
export function anchored(text, notes) {
  const n = (notes || []).join(' \n ');
  if (conceptsIn(text).some(k => conceptsIn(n).includes(k))) return true;
  const a = contentTokens(text), b = contentTokens(n);
  if ([...a].some(x => b.has(x))) return true;
  if (CJK.test(text) === CJK.test(n)) return false;
  const terms = anchorTerms(n);
  return anchorTerms(text).some(k => terms.includes(k));
}
// A note says something specific (not just "bad day" or the tag again): it names a concept, or has 4+ English
// words / 6+ Chinese characters.
export const specificNote = s => conceptsIn(s).length > 0 || words(s) >= 4 || zhLen(s) >= 6 && CJK.test(s);

// ---- Validation ----
const ZH_NUM = { 零: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const EN_NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, both: 2 };
export function numbersIn(s) {
  const t = String(s || '');
  const out = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  // Chinese numerals only where they count something (三场, 两局, 四次), so 一直 / 一样 are not numbers.
  for (const x of t.match(/[零一两二三四五六七八九十]+(?=\s*[场局次个分])/g) || []) out.push(x.length === 1 ? ZH_NUM[x] : x === '十' ? 10 : NaN);
  // English number words only where they count something ("two of", "three matches"), so "one clear thing" is not a number.
  for (const [, w] of t.toLowerCase().matchAll(/\b([a-z]+)\s+(?=(?:of|matches?|games?|times?|points?)\b)/g)) if (w in EN_NUM && w !== 'both') out.push(EN_NUM[w]);
  return out;
}
// Mechanical or database wording (Han, 2026-10-26: 「网前丢分提及减少」「最近提到网前丢分少了」「有标签的比赛」
// 「你提到杀球问题，2/6场」 "Net play is coming up less"), and "fewer mentions" read as a result.
const BAN = {
  en: [/\bmatch(es)?\s*\d+\s*(?:-|–|—|to)\s*\d+/i, /\bdata (shows|indicates|suggests)\b/i, /\bmetrics?\b/i, /\bstatistic/i, /\baccording to\b/i, /\bkey_metrics|metric_id|candidate|cost:|worked:|strip:|trend:/i, /\bAI\b/,
    /\d+\s*\/\s*\d+/, /\btag(s|ged)?\b/i, /\bcom(es|ing) up (less|more)( often)?\b/i, /\b(mentions?|notes?) (dropped|fell|decreased|went down)\b/i, /\bfewer (mentions|notes)\b/i],
  zh: [/第\s*[\d一二三四五六七八九十]+\s*(?:至|到|-|–|—)\s*(?:第\s*)?[\d一二三四五六七八九十]+\s*场/, /第\s*[\d一二三四五六七八九十]+\s*场/, /数据显示|呈现.*趋势|有所提升|指标|统计|根据记录/, /candidate|strip:|trend:|cost:|AI/,
    /\d+\s*\/\s*\d+/, /标签/, /提及/, /提到.{0,8}(少了|减少|变少)/, /(丢分|问题).{0,4}(少了|减少)/]
};
// Self-reported evidence must sound self-reported, and may not claim measured outcomes.
const NOTE_WORDS = { en: /\b(not(e|ed|es|ing)|mention(ed|s)?|said|wr(ote|itten))\b/i, zh: /提到|记录|记下|笔记|写到|你说/ };
const MEASURED = { en: /%|\bpercent|\brate\b|\bpoints? won\b|\bwon \d+ points|\bimprov|\bbetter\b|\bstronger\b|\bfixed\b|\bsolved\b|\bmistakes? (dropped|fell)/i, zh: /%|得分率|胜率|成功率|进步|变强|提升|改善|解决了|失误.{0,4}(次|个)/ };
// A linked strip says the skill showed up in the losses; these say it made them happen.
const CAUSAL = { en: /\b(caus|because|due to|led to|leads? to|cost(s|ing)? you (the|those|these|that|your)? ?(match|matches|game|games|loss)|lost (you )?(the )?(match|matches)|why you lo|reason)/i,
  zh: /导致|因为|由于|害你|输在|原因|让你输|才输|输掉了?.{0,4}(比赛|这几场)/ };
const UP_WORDS = { en: /\b(more|keeps?|again|started|starting|rising|rose|up|climb)/i, zh: /多了|多起来|越来越多|反复|又|开始/ };
const DOWN_WORDS = { en: /\b(fewer|less|dropped|down|haven't|slipp|dipped|fell|lower)/i, zh: /少了|减少|没提到|下滑|往下|降/ };

export function checkCopy({ title, body }, c, lang) {
  const issues = [], text = `${title || ''} ${body || ''}`;
  if (!title || !body) issues.push('empty');
  if (lang === 'zh' ? !CJK.test(body) || !CJK.test(title) : CJK.test(text)) issues.push('language');
  if (lineCount(title, KEY_FIT.title.size) > KEY_FIT.title.lines) issues.push('title_length');
  if (lineCount(body, KEY_FIT.body.size) > KEY_FIT.body.lines) issues.push('body_length');
  if (BAN[lang].some(r => r.test(text))) issues.push('banned_phrase');
  const nums = numbersIn(text).map(Math.abs);
  if (nums.some(n => !c.allowed.includes(n))) issues.push('number_not_in_evidence');
  if (c.required.some(n => !nums.includes(n) && !(n === 3 && /all 3|每场都/.test(text)) && !(n === 0 && /(haven't|none|level|都没|没提到|打平)/i.test(text)))) issues.push('number_missing');
  if (/%/.test(text)) issues.push('unit');
  if (c.family === 'trend' && !(lang === 'zh' ? /分/.test(body) : /\bpoints?\b/i.test(body))) issues.push('unit');
  if (c.direction === 'down' && c.shape !== 'recurring' && UP_WORDS[lang].test(text) && !DOWN_WORDS[lang].test(text)) issues.push('direction');
  if ((c.direction === 'up') && DOWN_WORDS[lang].test(title)) issues.push('direction');
  // P2 / P3 (Engine v14): self-reported, so "you noted"; an early one must say it is early and never call it a habit;
  // an opponent insight never brings in the record.
  if (c.family === 'early') {
    if (!(lang === 'zh' ? /初步|还不算|只有1场/ : /\bearly\b|too early|so far/i).test(text)) issues.push('not_labelled_early');
    if (GENERALIZE[lang].test(text)) issues.push('generalized_single_note');
  }
  if (c.source === 'opp_notes') {
    if (RECORD[lang].test(text)) issues.push('record_inference');
    if (!text.includes(c.name)) issues.push('opponent_not_named');
  }
  if (c.family === 'mixed' && !(numbersIn(text).includes(c.numbers.k) && numbersIn(text).includes(c.numbers.w))) issues.push('number_missing');
  if (c.source === 'notes_tags' || c.source === 'opp_notes') {
    if (!NOTE_WORDS[lang].test(text)) issues.push('not_marked_self_reported');
    if (MEASURED[lang].test(text)) issues.push('measured_claim_from_notes');
  } else if (c.strength !== 'strong' && (lang === 'zh' ? /进步|越来越好/.test(title) : /\b(improv|better|stronger)/i.test(title))) issues.push('overclaim');
  if (ungrounded(text, c.notes).length) issues.push('detail_not_in_notes');
  if (c.linked && CAUSAL[lang].test(text)) issues.push('causal_claim');
  if (c.pattern === 'compare' || (c.pattern === 'strip' && c.shape !== 'recurring')) {
    const okWindow = lang === 'zh' ? /最近(有记录的)?3场/.test(body) && /之前/.test(body) : /last 3/i.test(body) && /\b(before|previous|earlier)\b|\b(up|down) from\b/i.test(body);
    if (!okWindow) issues.push('window');
  }
  return issues;
}

// ---- No Key Insight: not enough evidence, or no clear change ----
// Each detector needs enough matches to run at all: 5 scored matches (margin trend), 6 with a result (games won),
// 6 with notes (Skill Tag strips). When none of them could run, there is not enough evidence yet: "insufficient",
// and the tile says how many more matches it takes. When at least one ran and nothing cleared the quality bar, the
// evidence is there and simply shows no clear change: "no_trend". The two are never shown as each other, and
// neither ever becomes a made-up insight.
export const KEY_NEED = { scored: TREND_N - 1, results: 6, noted: NOTE_N };
export function keyCounts(matches) {
  const chron = normalize(matches);
  return { matches: chron.length, scored: chron.filter(m => scored(m).length).length,
    results: chron.filter(m => (m.games || []).some(g => gameResult(g))).length, noted: chron.filter(hasNotes).length };
}
export function keyStatus(matches) {
  const c = keyCounts(matches), N = KEY_NEED;
  const ready = c.scored >= N.scored || c.results >= N.results || c.noted >= N.noted;
  // Matches still to log before any detector can run (every match has a result once logged, so the games-won one is nearest).
  return ready ? { status: 'no_trend', counts: c } : { status: 'insufficient', counts: c, more: N.results - c.results };
}

// The model's keyInsight answer -> the stored Key Insight. ai: { candidate_id, title, body } or null.
// matches: the records the candidates came from, to tell "insufficient" from "no_trend" when there is no candidate.
export function finalizeKey(cands, ai, lang, matches) {
  if (!cands.length) return matches ? { ...keyStatus(matches), reason: 'no_candidate' } : { status: 'insufficient', reason: 'no_candidate' };
  // The model may only pick within the best tier (a pattern never replaces a measured trend, an early note never a pattern).
  const picked = ai && cands.find(x => x.id === ai.candidate_id), c = picked && (picked.tier || 1) <= (cands[0].tier || 1) ? picked : cands[0];
  let copy = ai && ai.candidate_id === c.id ? { title: String(ai.title || '').trim(), body: String(ai.body || '').trim() } : null;
  let issues = copy ? checkCopy(copy, c, lang) : ['no_ai_copy'], source = 'ai';
  if (issues.length) { copy = keyTemplate(c, lang); source = 'template'; }
  const tIssues = source === 'template' ? checkCopy(copy, c, lang) : [];
  return {
    status: 'ok', candidate_id: c.id, metric_id: c.id, title: copy.title, body: copy.body, pattern: c.pattern,
    // A linked strip writes each match's result under its pill (RWKeyChart xLabels) instead of 1..6.
    // P2 / P3 insights have no chart: their window (up to 12 noted matches) doesn't fit the 6-pill strip, and a shorter
    // strip would show a different denominator than the copy.
    chart: c.chart ? { ...c.chart, ...(c.chart.results ? { xLabels: c.chart.results.map(r => (lang === 'zh' ? { W: '胜', L: '负' } : { W: 'W', L: 'L' })[r] || '·') } : {}) } : null,
    tier: c.tier || 1, level: c.tier === 3 ? (c.family === 'mixed' ? 'mixed' : 'early') : c.tier === 2 ? 'pattern' : 'trend',
    evidence: { source: c.source, family: c.family, tag: c.tag || null, side: c.side || null, shape: c.shape, direction: c.direction, strength: c.strength,
      score: c.score, numbers: c.numbers, ...(c.player_id ? { player_id: c.player_id } : {}), ...c.evidence },
    // Every candidate considered, best first (for the report and for checking why this one was picked).
    candidates: cands.map(x => ({ id: x.id, tier: x.tier || 1, numbers: x.numbers, ...(x.quality != null ? { quality: x.quality } : {}) })),
    match_ids: c.match_ids, copy_source: source,
    validation: { passed: !tIssues.length, ai_issues: source === 'template' ? issues : [], issues: tIssues }
  };
}

// ---- Build Next and Strengths ----
// One classifier for both lists, and for which Skill Tag strips may be a Key Insight, so a skill is never sorted two
// ways on the same page. The window is the latest 12 matches with notes among the latest 20 (3+ needed): the Key
// Insight strips compare 6, but the lists use all the recent history there is (Han, 2026-10-26). For each tag,
// cost = matches where it was noted under What Cost Points, worked = under What Worked. A tag noted on both sides of
// the same match in half or more of its matches says nothing either way and is left out.
// The side (one side per skill; the stronger finding over the whole window wins):
//   cost    noted as costing points more often than working   -> Build Next
//   worked  noted as working more often than costing points   -> Strengths
//   mixed   2+ on each side, equally often                     -> Build Next only, and its evidence says both counts
//           ("costing points in 2 of 12, and working in 2"): something to make consistent, never a strength.
// Level: "confirmed" when noted on that side in 2+ matches, "early" when noted once, and only if that once was in
// the latest 6 noted matches (an old single note is not actionable). An early item is always worded as one
// observation ("Early sign: you noted it once…", 「初步观察」), never as a pattern, with a general drill as advice.
// Build Next: confirmed first (most often, plain cost before mixed, then the last 3, then the latest match), then up
// to 2 early ones (latest first), 4 in all. Strengths: confirmed first, then emerging (early), 3 in all.
// Active Focus topics are left out of Build Next. A completed Focus topic comes back only with new evidence: 3+
// matches with notes logged since it was completed and the tag noted as costing points in 2+ of them; its evidence
// is then counted over those matches only.
// Each item carries the player's own words about that skill (skillNotes). advice_basis is "notes" when 2+ of them
// say something specific, else "general": the advice is then a plainly general drill, and the name and evidence may
// not name a specific shot, side or situation either.
// focus: [{ topic, status: 'active' | 'completed', completed_at }]
const noteWindow = matches => { const chron = history(matches), noted = chron.filter(hasNotes); return { chron, noted, win: noted.slice(-SKILL_N) }; };
const has = (m, f, tag) => (m[f] || []).includes(tag);
const SKILL_MENTION = {
  Serve: /\bserv(e|es|ing|ice)\b|发球/i,
  Return: /\breturn(s|ing)?\b|接发/i,
  Net: /\bnet\b|网前|放网/i,
  Smash: /\bsmash(es|ing|ed)?\b|杀球|扣杀/i,
  Defence: /\bdefen[cs]e\b|防守|接杀/i,
  Footwork: /\bfootwork\b|步法|步伐|移动/i,
  Placement: /\bplacement\b|落点|线路/i
};
const mentionsSkill = (note, tag) => SKILL_MENTION[tag]?.test(note) || false;
// The player's words about one skill. A note can cover several skills ("杀球太多。反手防守比较弱。"): only the part
// about this skill counts, from the clause that names it up to the next clause that names another skill. A note that
// names no skill at all was written under a match tagged with it, so all of it counts.
export function skillNotes(notes, tag) {
  const out = [];
  for (const note of notes) {
    const parts = String(note || '').split(/[。！？；;，,.!?\n]/).map(s => s.trim()).filter(Boolean);
    if (!parts.some(p => SKILL_TAGS.some(t => mentionsSkill(p, t)))) { if (parts.length) out.push(String(note).trim()); continue; }
    let cur = null;
    for (const p of parts) {
      if (mentionsSkill(p, tag)) { if (cur) out.push(cur.join(CJK.test(p) ? '，' : ', ')); cur = [p]; }
      else if (SKILL_TAGS.some(t => t !== tag && mentionsSkill(p, t))) { if (cur) out.push(cur.join(CJK.test(p) ? '，' : ', ')); cur = null; }
      else if (cur) cur.push(p);
    }
    if (cur) out.push(cur.join(CJK.test(cur[0]) ? '，' : ', '));
  }
  return out.slice(-4);
}
const basisOf = notes => (notes.filter(specificNote).length >= 2 ? 'notes' : 'general');

export function skillTable(matches) {
  const { chron, noted, win } = noteWindow(matches), rows = {};
  if (win.length >= 3) for (const tag of SKILL_TAGS) {
    const cost = win.filter(m => has(m, 'lt', tag)).length, worked = win.filter(m => has(m, 'wt', tag)).length;
    if (!cost && !worked) continue;
    const same = win.filter(m => has(m, 'lt', tag) && has(m, 'wt', tag)).length, l3 = win.slice(-3), l6 = win.slice(-6);
    const side = same * 2 >= Math.max(cost, worked) ? null
      : cost > worked ? 'cost' : worked > cost ? 'worked' : cost >= 2 ? 'mixed' : null;
    const k = side === 'worked' ? worked : cost;
    // An early (single) observation counts only when it is recent.
    const recentOnce = side === 'worked' ? l6.some(m => has(m, 'wt', tag)) : l6.some(m => has(m, 'lt', tag));
    const level = !side ? null : k >= 2 ? 'confirmed' : recentOnce ? 'early' : null;
    rows[tag] = { tag, cost, worked, same, side: level ? side : null, level, recentCost: l3.filter(m => has(m, 'lt', tag)).length, recentWorked: l3.filter(m => has(m, 'wt', tag)).length,
      latestCost: has(win[win.length - 1], 'lt', tag) ? 1 : 0, latest6: win.length - 1 - Math.max(...win.map((m, i) => (has(m, side === 'worked' ? 'wt' : 'lt', tag) ? i : -1))) };
  }
  return { chron, noted, win, rows, skipped: win.length ? chron.slice(chron.indexOf(win[0])).filter(m => !hasNotes(m)).length : 0 };
}
// Tag -> 'cost' | 'worked' | 'mixed', for the tags that have a side.
export function topicSides(matches) {
  const { rows } = skillTable(matches);
  return Object.fromEntries(Object.values(rows).filter(r => r.side).map(r => [r.tag, r.side]));
}
const notesOf = (ms, f, tag) => skillNotes(ms.filter(m => has(m, f === 'lost' ? 'lt' : 'wt', tag)).map(m => m[f]).filter(Boolean), tag);
const EARLY_MAX = 2;
export function buildCandidates(matches, focus = [], max = 4) {
  const { noted, win, rows, skipped } = skillTable(matches), out = [];
  for (const row of Object.values(rows)) {
    if (row.side !== 'cost' && row.side !== 'mixed') continue;
    const tag = row.tag, topic = 'tag:' + tag, fs = focus.filter(f => f.topic === topic);
    if (fs.some(f => f.status === 'active')) continue;
    const done = fs.filter(f => f.status === 'completed').map(f => String(f.completed_at || '')).sort().pop();
    if (done) {
      const after = noted.filter(m => String(m.created_at || `${m.date}T23:59:59`) > done).slice(-NOTE_N);
      const values = after.map(m => (has(m, 'lt', tag) ? 1 : 0)), k = sum(values);
      if (after.length < 3 || k < 2) continue;
      const notes = notesOf(after, 'lost', tag);
      out.push({ topic_id: topic, tag, k, w: 0, n: after.length, mixed: false, level: 'confirmed', recent: sum(values.slice(-3)), latest: values[values.length - 1], returning: true, skipped: 0, notes, basis: basisOf(notes) });
      continue;
    }
    const mixed = row.side === 'mixed', notes = notesOf(win, 'lost', tag);
    out.push({ topic_id: topic, tag, k: row.cost, w: mixed ? row.worked : 0, n: win.length, mixed, level: row.level, recent: row.recentCost, latest: row.latestCost, age: row.latest6, returning: false, skipped,
      notes, basis: row.level === 'early' ? 'general' : basisOf(notes) });
  }
  const confirmed = out.filter(x => x.level === 'confirmed')
    .sort((a, b) => b.k / b.n - a.k / a.n || a.mixed - b.mixed || b.recent - a.recent || b.latest - a.latest || a.tag.localeCompare(b.tag));
  const early = out.filter(x => x.level === 'early').sort((a, b) => a.age - b.age || a.tag.localeCompare(b.tag)).slice(0, EARLY_MAX);
  return [...confirmed, ...early].slice(0, max);
}
export function strengthCandidates(matches, max = 3) {
  const { win, rows, skipped } = skillTable(matches), out = [];
  for (const row of Object.values(rows)) {
    if (row.side !== 'worked') continue;
    const notes = notesOf(win, 'worked', row.tag);
    out.push({ topic_id: 'tag:' + row.tag, tag: row.tag, k: row.worked, n: win.length, level: row.level, recent: row.recentWorked, age: row.latest6, notes,
      basis: row.level === 'early' ? 'general' : basisOf(notes), skipped });
  }
  const confirmed = out.filter(x => x.level === 'confirmed').sort((a, b) => b.k - a.k || b.recent - a.recent || a.tag.localeCompare(b.tag));
  const early = out.filter(x => x.level === 'early').sort((a, b) => a.age - b.age || a.tag.localeCompare(b.tag)).slice(0, EARLY_MAX);
  return [...confirmed, ...early].slice(0, max);
}
// General advice for a skill when the notes don't say what went wrong (or right): practical, and labelled general.
const GENERAL = {
  en: { Serve: 'General drill: serve to a target at the start of every session.', Return: 'General drill: have a partner mix up serves while you return from a ready stance.',
    Net: 'General drill: spend a few minutes each session on tight net shots with a partner.', Smash: "General drill: smash from a partner's feed, aiming for control before power.",
    Defence: 'General drill: let a partner attack while you focus on getting every shot back.', Footwork: 'General drill: add a few minutes of shadow footwork to every warm-up.',
    Placement: 'General drill: rally with a partner, aiming each shot at a chosen corner.', strength: 'General tip: keep looking for chances to use it in rallies.' },
  zh: { Serve: '通用练法：每次练球先对着目标区发一组球。', Return: '通用练法：请搭档变换发球，你从准备姿势接发。', Net: '通用练法：每次练球花几分钟和搭档练网前小球。',
    Smash: '通用练法：请搭档喂球练杀球，先求控制再求力量。', Defence: '通用练法：让搭档连续进攻，你专心把每一拍接回去。', Footwork: '通用练法：热身时加几分钟无球步法。',
    Placement: '通用练法：和搭档对拉，每一拍都打向选定的角落。', strength: '通用建议：比赛里继续多找机会用它。' }
};
export const generalAction = (tag, kind, lang) => GENERAL[lang][kind === 'strength' ? 'strength' : tag] || '';
export function itemTemplate(item, kind, lang) {
  const name = APP_TAG_LABELS[lang][item.tag]; // the app's own tag name, as on the Skill Tag chips
  const action = generalAction(item.tag, kind, lang);
  if (lang === 'zh') {
    const lastN = `最近${item.skipped ? '有记录的' : ''}${item.n}场`;
    if (item.level === 'early') return kind === 'strength'
      ? { name, signal: `初步亮点：${lastN}里有1场你觉得${name}发挥不错。`, action }
      : { name, evidence: `初步观察：${lastN}里有1场你记下${name}丢分。`, action };
    if (kind === 'strength') return { name, signal: `${lastN}比赛中，有${item.k}场你觉得${name}发挥不错。`, action };
    if (item.returning) return { name, evidence: `完成这个训练目标后的${item.n}场里，又有${item.k}场你记下这里丢分。`, action };
    if (item.mixed) return { name, evidence: `${lastN}里，${item.k}场你记下它丢分，${item.w}场记下它打得好。`, action };
    return { name, evidence: `${lastN}比赛中，有${item.k}场你提到${name}的问题。`, action };
  }
  const lastN = `your last ${item.n} ${item.skipped ? 'noted ' : ''}matches`;
  if (item.level === 'early') return kind === 'strength'
    ? { name, signal: `Emerging: you noted ${name.toLowerCase()} working well once in ${lastN}.`, action }
    : { name, evidence: `Early sign: you noted it costing points once in ${lastN}.`, action };
  if (kind === 'strength') return { name, signal: `You noted ${name.toLowerCase()} working well in ${item.k} of ${lastN}.`, action };
  if (item.returning) return { name, evidence: `You noted it costing points again in ${item.k} of ${item.n} matches since you completed it.`, action };
  if (item.mixed) return { name, evidence: `You noted it costing points in ${item.k} of ${lastN}, and working in ${item.w}.`, action };
  return { name, evidence: `You noted it costing you points in ${item.k} of ${lastN}.`, action };
}
// A cause or diagnosis the notes would have to support.
const CAUSE = { en: /\b(because|due to|caused by|the reason|that's why)\b/i, zh: /因为|导致|原因是|由于|所以才/ };
// Checks one AI Build Next / Strengths item. Field limits match the Grow tiles.
export function checkItem(ai, item, kind, lang) {
  const issues = [], textKey = kind === 'strength' ? 'signal' : 'evidence';
  const name = String(ai.name || '').trim(), ev = String(ai[textKey] || '').trim(), act = String(ai.action || '').trim();
  const allowed = [item.k, item.n, 3, ...(item.mixed ? [item.w] : [])], ground = item.basis === 'notes' ? item.notes : [];
  for (const [f, s] of [['name', name], [textKey, ev], ['action', act]]) {
    if (!s) { if (f !== 'action') issues.push(f + ':empty'); continue; }
    if (lang === 'zh' ? !CJK.test(s) : CJK.test(s)) issues.push(f + ':language');
    if (BAN[lang].some(r => r.test(s))) issues.push(f + ':banned_phrase');
    if (numbersIn(s).some(n => !allowed.includes(Math.abs(n)))) issues.push(f + ':number_not_in_evidence');
    if (MEASURED[lang].test(s) && f !== 'action') issues.push(f + ':measured_claim_from_notes');
    // Details count as grounded only when the notes are a pattern (basis "notes"); a Build Next / Strengths action
    // must also use only shots and situations the notes name (no suggested shot of its own) and build on them.
    if (ungrounded(s, ground).length) issues.push(f + ':detail_not_in_notes');
    if (item.basis !== 'notes' && f !== 'action' && CAUSE[lang].test(s)) issues.push(f + ':invented_cause');
    if (f === 'action' && item.basis === 'notes' && !anchored(s, item.notes)) issues.push('action:not_from_notes');
    // A name or evidence that names a situation ("Backcourt smashes") describes the whole item, so that detail must
    // recur in 2+ of the notes; one note mentioning the back court is not what the skill is about.
    if (f !== 'action' && conceptsIn(s).some(k => item.notes.filter(n => conceptsIn(n).includes(k)).length < 2)) issues.push(f + ':detail_not_repeated');
  }
  if (lang === 'zh' ? zhLen(name) > 8 : words(name) > 4) issues.push('name:length');
  if (numbersIn(name).length) issues.push('name:number');
  if (lang === 'zh' ? zhLen(ev) > 26 : words(ev) > 16) issues.push(textKey + ':length');
  if (lang === 'zh' ? zhLen(act) > 26 : words(act) > 16) issues.push('action:length');
  if (ev && !NOTE_WORDS[lang].test(ev)) issues.push(textKey + ':not_marked_self_reported');
  // A valid evidence sentence must report BOTH the numerator and denominator in order.
  // Merely permitting k and n independently let 'in 6 matches' pass for a 2/6 signal.
  if (ev && item.k !== item.n && !numbersIn(ev).includes(item.k)) issues.push(textKey + ':missing_evidence_count');
  if (ev && !numbersIn(ev).includes(item.n)) issues.push(textKey + ':missing_window_count');
  return issues;
}
// ai: the model's array (each item names its topic_id). Returns the stored items in engine order.
// The action is the AI's only when the notes behind the item are specific and it passes the checks; otherwise it is
// the general drill for that skill (advice_basis "general").
export function finalizeItems(items, ai, kind, lang) {
  const textKey = kind === 'strength' ? 'signal' : 'evidence';
  return items.map((item, rank) => {
    const a = (ai || []).find(x => x && x.topic_id === item.topic_id), t = itemTemplate(item, kind, lang);
    const issues = a ? checkItem(a, item, kind, lang) : ['no_ai_copy'];
    const bad = f => issues.some(i => i.startsWith(f + ':')) || !a;
    const aiAction = item.basis === 'notes' && !bad('action') && String(a.action || '').trim();
    return {
      topic_id: item.topic_id, tag: item.tag, rank: rank + 1,
      // An early item is one observation: its plain name and its labelled evidence are always the engine's. A mixed
      // item's evidence is always the engine's too: it has to give both counts exactly.
      name: item.level === 'early' || bad('name') ? t.name : String(a.name).trim(),
      [textKey]: item.mixed || item.level === 'early' || bad(textKey) ? t[textKey] : String(a[textKey]).trim(),
      action: aiAction || t.action, advice_basis: aiAction ? 'notes' : 'general',
      evidence_numbers: { k: item.k, n: item.n, ...(item.mixed ? { w: item.w } : {}) }, mixed: !!item.mixed, level: item.level || 'confirmed', returning: item.returning || false,
      copy_source: issues.length || item.mixed || item.level === 'early' ? (a ? 'mixed' : 'template') : 'ai', issues
    };
  });
}

// ---- Opponent plans ----
// Han (2026-10-26): a plan only for an opponent the player wrote notes about, and only from those notes. A
// win/loss record says nothing about how someone plays, so it is not given to the model at all, and a plan that
// isn't anchored in the notes (or adds details they don't have) is not used. "unknown:<heard name>" is a
// voice-logged opponent nobody identified: no profile, no plan.
// v13: notes from the whole history (20 matches), each given to the opponent it is about. A doubles note is one text
// for two opponents: its clauses go to the opponent they name (a clause that names nobody stays with the last one
// named); a note that names neither is about the pair, and no single opponent gets it. One note is a "single"
// observation (the plan is labelled as an early read), two or more are "repeated".
const GENERALIZE = { en: /\b(always|every ?time|usually|constantly|never|tends? to|habit(ually)?|all the time)\b/i, zh: /总是|每次|一向|经常|老是|习惯|从来|一贯/ };
const nameIn = (clause, name) => {
  const n = String(name || '').trim();
  if (!n) return false;
  return CJK.test(n) ? clause.includes(n) : new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu').test(clause);
};
export function attributeNote(note, opps, names = {}) {
  const text = String(note || '').trim().slice(0, 300), out = {};
  if (!text || !opps.length) return { by: out, unattributed: !!text };
  const named = opps.filter(pid => nameIn(text, names[pid]));
  if (!named.length) {
    if (opps.length === 1) out[opps[0]] = [text];
    return { by: out, unattributed: opps.length > 1 };
  }
  if (named.length === 1 && opps.length === 1) { out[named[0]] = [text]; return { by: out, unattributed: false }; }
  let cur = null;
  for (const c of text.split(/[。！？；;.!?\n]/).map(x => x.trim()).filter(Boolean)) {
    const who = named.filter(pid => nameIn(c, names[pid]));
    if (who.length === 1) cur = who[0]; else if (who.length > 1) cur = null;
    if (cur) (out[cur] ||= []).push(c);
  }
  return { by: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [v.join(CJK.test(v[0]) ? '。' : '. ')]])), unattributed: false };
}
export function opponentFacts(matches, names = {}, diag) {
  const by = {};
  history(matches).reverse().forEach((m, age) => {
    const raw = (m.opps || []).filter(Boolean), opps = raw.filter(p => !String(p).startsWith('unknown:'));
    if (!String(m.opp_notes || '').trim()) return;
    if (diag) diag.matches_with_notes++;
    if (!opps.length) { if (diag) diag.unknown_opponent++; return; }
    const { by: got, unattributed } = attributeNote(m.opp_notes, opps, names);
    if (unattributed && diag) diag.names_no_opponent++;
    for (const [pid, notes] of Object.entries(got)) {
      const o = (by[pid] ||= { player_id: pid, name: names[pid] || 'Opponent', notes: [], age });
      o.notes.push(...notes);
    }
  });
  return Object.values(by)
    .map(o => ({ player_id: o.player_id, name: o.name, notes: o.notes.slice(0, 4), level: o.notes.length >= 2 ? 'repeated' : 'single', age: o.age }))
    .sort((a, b) => b.notes.length - a.notes.length || a.age - b.age || a.name.localeCompare(b.name))
    .slice(0, 5).map(({ age, ...o }) => o);
}
const RECORD = { en: /\b(record|head[- ]to[- ]head|lost to (them|him|her)|beat (you|them)|you('ve| have) (lost|won|beaten)|losses|losing streak)\b/i,
  zh: /战绩|交手记录|输给|赢过|胜率|连输|连赢|胜负/ };
export const EARLY_LABEL = { en: { opp: 'Early read: ', doubles: 'Early observation: ' }, zh: { opp: '初步判断：', doubles: '初步观察：' } };
const stripLabel = (s, lang, kind) => { const l = EARLY_LABEL[lang][kind].trim().replace(/[:：]$/, ''); return s.replace(new RegExp(`^${l}\\s*[:：]?\\s*`, 'i'), ''); };
export function checkPlan(plan, o, lang) {
  const issues = [];
  if (!plan) return ['empty'];
  if (lang === 'zh' ? !CJK.test(plan) : CJK.test(plan)) issues.push('language');
  if (BAN[lang].some(r => r.test(plan))) issues.push('banned_phrase');
  if (numbersIn(plan).some(n => !numbersIn(o.notes.join(' ')).includes(n))) issues.push('number_not_in_evidence');
  if (RECORD[lang].test(plan)) issues.push('record_inference');
  if (ungrounded(plan, o.notes, { advice: true }).length) issues.push('detail_not_in_notes');
  if (!anchored(plan, o.notes)) issues.push('not_from_notes');
  // One note is one match: never a habit.
  if (o.level === 'single' && GENERALIZE[lang].test(plan)) issues.push('generalized_single_note');
  if (lang === 'zh' ? zhLen(plan) > 36 : words(plan) > 24) issues.push('length');
  return issues;
}
// When the model has no usable plan for an opponent whose notes say something specific, the card shows the
// player's own note and a neutral next step, so the section never invents a tendency and never hides real notes.
export function opponentTemplate(o, lang) {
  const q = (s, n) => `“${s.length > n ? s.slice(0, n - 1) + '…' : s}”`;
  if (o.level === 'single') return lang === 'zh' ? `${EARLY_LABEL.zh.opp}你记下${q(o.notes[0], 40)}。下次交手开局先验证。` : `${EARLY_LABEL.en.opp}you noted ${q(o.notes[0], 60)}. Test it early next time.`;
  const two = o.notes.slice(0, 2).map(n => q(n, lang === 'zh' ? 20 : 50));
  return lang === 'zh' ? `你的记录：${two.join('')}。下次交手提前针对。` : `From your notes: ${two.join(' · ')}. Plan around these next time.`;
}
export function finalizeOpponents(ai, opps, lang) {
  const out = [];
  for (const o of opps) {
    const p = (ai || []).find(x => x && x.player_id === o.player_id);
    let plan = String(p?.plan || '').trim(), issues = p ? [] : ['no_ai_copy'];
    if (p) {
      const name = String(o.name || '').trim();
      if (name) for (const pre of [name + ':', name + '：', 'against ' + name + ':']) if (plan.toLowerCase().startsWith(pre.toLowerCase())) { plan = plan.slice(pre.length).trim(); break; }
      plan = stripLabel(plan, lang, 'opp');
      issues = checkPlan(plan, o, lang);
    }
    if (!issues.length) out.push({ player_id: o.player_id, plan: o.level === 'single' ? EARLY_LABEL[lang].opp + plan : plan, level: o.level, copy_source: 'ai' });
    else if (specificNote(o.notes[0])) out.push({ player_id: o.player_id, plan: opponentTemplate(o, lang), level: o.level, copy_source: 'note', issues });
    else out.push({ player_id: o.player_id, dropped: issues.concat('note_not_specific') });
  }
  // At most OPP_MAX cards, in the engine's order (most notes, then most recent); the rest are reported as dropped.
  let shown = 0;
  return out.map(p => p.dropped || ++shown <= OPP_MAX ? p : { player_id: p.player_id, dropped: ['over_limit'] });
}
export const OPP_MAX = 3;

// ---- Doubles play ----
// v13: from the doubles matches with notes in the history (latest 6 doubles), from 1 noted match up. A skill noted in
// 2+ of them is a pattern; anything else is an early observation, labelled so, and may not be worded as a habit.
// Each item must be anchored in those notes and tags, with no new details.
export function doublesFacts(matches) {
  const ds = history(matches).filter(m => m.type === 'Doubles').slice(-6), noted = ds.filter(m => hasNotes(m) || m.worked || m.lost);
  if (!noted.length) return null;
  const cnt = f => { const c = {}; for (const m of noted) for (const t of (m[f] || [])) c[t] = (c[t] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })); };
  const notes = noted.flatMap(m => [m.worked ? { kind: 'worked', text: String(m.worked).trim().slice(0, 300) } : null, m.lost ? { kind: 'cost_points', text: String(m.lost).trim().slice(0, 300) } : null]).filter(Boolean).slice(-8);
  const cost_points = cnt('lt'), strengths = cnt('wt');
  const repeated = [...cost_points, ...strengths].filter(x => x.count >= 2).map(x => x.tag);
  const by_match = noted.map(m => [m.worked, m.lost].map(x => String(x || '').trim()).filter(Boolean)).filter(x => x.length);
  return { matches: ds.length, noted: noted.length, repeated, cost_points, strengths, notes, by_match };
}
const tagLabels = t => [APP_TAG_LABELS.en[t], APP_TAG_LABELS.zh[t], TAG.en[t] && TAG.en[t][1], TAG.zh[t] && TAG.zh[t][1]].filter(Boolean);
// Template items when the model wrote none that pass: one per noted skill (repeated first), from the tag counts.
export function doublesTemplate(facts, lang) {
  const items = [...facts.cost_points.map(x => ({ ...x, side: 'cost' })), ...facts.strengths.map(x => ({ ...x, side: 'worked' }))]
    .sort((a, b) => b.count - a.count || (a.side === 'cost' ? -1 : 1)).slice(0, 2);
  return items.map(x => {
    const name = APP_TAG_LABELS[lang][x.tag], early = x.count < 2, n = facts.noted;
    const pattern = lang === 'zh'
      ? (early ? EARLY_LABEL.zh.doubles : '') + `${n}场有记录的双打里，${x.count === 1 ? '有1场' : `有${x.count}场`}你记下${name}${x.side === 'cost' ? '丢分' : '打得好'}。`
      : (early ? EARLY_LABEL.en.doubles : '') + `you noted ${name.toLowerCase()} ${x.side === 'cost' ? 'costing points' : 'working'} in ${x.count} of ${n} noted doubles ${n === 1 ? 'match' : 'matches'}.`;
    return { name, pattern: lang === 'zh' ? pattern : cap(pattern), label: x.side === 'cost' ? 'Try Next' : 'Keep Doing', action: generalAction(x.tag, x.side === 'cost' ? 'build' : 'strength', lang),
      level: early ? 'early' : 'pattern', copy_source: 'template' };
  });
}
export function finalizeDoubles(ai, facts, lang) {
  if (!facts) return [];
  const notes = facts.notes.map(n => n.text), counts = [facts.matches, facts.noted, ...facts.cost_points.map(x => x.count), ...facts.strengths.map(x => x.count), 1, 2, 3];
  const tags = [...facts.cost_points, ...facts.strengths].map(x => x.tag);
  const labels = tags.flatMap(tagLabels);
  // An item is a pattern when it is about a skill noted in 2+ doubles matches, or when the notes of 2+ different
  // doubles matches say it; otherwise it is an early observation.
  const repNotes = facts.repeated.flatMap(tagLabels);
  const inMatches = t => (facts.by_match || []).filter(ns => anchored(t, ns)).length;
  const ok = (ai || []).map(d => {
    const pattern = stripLabel(String(d.pattern || '').trim(), lang, 'doubles');
    const text = `${d.name || ''} ${pattern} ${d.action || ''}`;
    if (!d.name || !pattern || (lang === 'zh' ? !CJK.test(text) : CJK.test(text))) return null;
    if (BAN[lang].some(r => r.test(text)) || numbersIn(text).some(n => !counts.includes(n))) return null;
    if (ungrounded(`${d.name} ${pattern}`, notes).length || ungrounded(d.action || '', notes, { advice: true }).length) return null;
    if (!anchored(`${d.name} ${pattern}`, [...notes, ...labels])) return null;
    const isPattern = !!(repNotes.length && anchored(`${d.name} ${pattern}`, repNotes) || inMatches(`${d.name} ${pattern}`) >= 2);
    if (!isPattern && GENERALIZE[lang].test(`${pattern} ${d.action || ''}`)) return null;
    return { name: String(d.name).trim(), pattern: isPattern ? pattern : EARLY_LABEL[lang].doubles + pattern, label: d.label, action: String(d.action || '').trim(),
      level: isPattern ? 'pattern' : 'early', copy_source: 'ai' };
  }).filter(Boolean).slice(0, 2);
  return ok.length ? ok : doublesTemplate(facts, lang);
}

// ---- Coverage ----
// Why each section has the cards it has, stored with the insight (insight_json.coverage) so an empty section can be
// explained from the row itself.
export function coverage(matches, { build = [], strengths = [], opps = [], plans = [], doubles = null, doublesPlay = [], keyInsight = null, oppDiag = null } = {}) {
  const { noted, win, rows } = skillTable(matches), h = history(matches);
  const reason = (n, why) => (n ? null : why);
  const skillWhy = side => !win.length ? 'no_matches_with_skill_tags' : win.length < 3 ? 'fewer_than_3_noted_matches'
    : !Object.values(rows).some(r => r.side === side || side === 'cost' && r.side === 'mixed') ? (side === 'worked' ? 'no_skill_noted_working_more_than_costing' : 'no_skill_noted_costing_more_than_working') : 'all_in_active_focus';
  return {
    engine: ENGINE_VERSION,
    matches_read: h.length, noted_matches: noted.length, skill_window: win.length,
    key_insight: keyInsight ? keyInsight.status || 'ok' : 'none',
    build_next: { cards: build.length, confirmed: build.filter(x => x.level !== 'early').length, early: build.filter(x => x.level === 'early').length, zero_reason: reason(build.length, skillWhy('cost')) },
    strengths: { cards: strengths.length, confirmed: strengths.filter(x => x.level !== 'early').length, early: strengths.filter(x => x.level === 'early').length, zero_reason: reason(strengths.length, skillWhy('worked')) },
    opponent_plans: { cards: plans.filter(p => !p.dropped).length, opponents_with_notes: opps.length, ...(oppDiag || {}),
      from_ai: plans.filter(p => p.copy_source === 'ai').length, from_note: plans.filter(p => p.copy_source === 'note').length,
      not_shown: plans.filter(p => p.dropped?.includes('over_limit')).length,
      dropped: plans.filter(p => p.dropped && !p.dropped.includes('over_limit')).map(p => ({ player_id: p.player_id, issues: p.dropped })),
      replaced_ai_copy: plans.filter(p => p.copy_source === 'note' && !p.issues?.includes('no_ai_copy')).map(p => ({ player_id: p.player_id, issues: p.issues })),
      zero_reason: reason(plans.filter(p => !p.dropped).length, !opps.length ? (oppDiag?.matches_with_notes ? 'notes_not_about_a_known_opponent' : 'no_opponent_notes') : 'notes_not_specific') },
    doubles_play: { cards: doublesPlay.length, doubles_matches: h.filter(m => m.type === 'Doubles').length, noted_doubles: doubles ? doubles.noted : 0,
      patterns: doublesPlay.filter(d => d.level === 'pattern').length, early: doublesPlay.filter(d => d.level === 'early').length, from_ai: doublesPlay.filter(d => d.copy_source === 'ai').length,
      zero_reason: reason(doublesPlay.length, !h.some(m => m.type === 'Doubles') ? 'no_doubles_matches' : !doubles ? 'no_doubles_match_with_notes' : 'no_skill_tags_in_doubles') }
  };
}

// ---- The model's part ----
// The strict schema is built per request so the model can only name candidates that exist.
export function modelSchema(keyIds, buildIds, strengthIds, oppIds = []) {
  const en = ids => ({ type: 'string', enum: ids.length ? ids : ['none'] });
  return {
    type: 'object', additionalProperties: false,
    required: ['keyInsight', 'buildNext', 'strengths', 'opponentPlans', 'doublesPlay'],
    properties: {
      keyInsight: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['candidate_id', 'title', 'body'],
        properties: { candidate_id: en(keyIds), title: { type: 'string' }, body: { type: 'string' } } }] },
      buildNext: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['topic_id', 'name', 'evidence', 'action'],
        properties: { topic_id: en(buildIds), name: { type: 'string' }, evidence: { type: 'string' }, action: { type: 'string' } } } },
      strengths: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['topic_id', 'name', 'signal', 'action'],
        properties: { topic_id: en(strengthIds), name: { type: 'string' }, signal: { type: 'string' }, action: { type: 'string' } } } },
      opponentPlans: { type: 'array', maxItems: oppIds.length, items: { type: 'object', additionalProperties: false, required: ['player_id', 'plan'],
        properties: { player_id: en(oppIds), plan: { type: 'string' } } } },
      doublesPlay: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['name', 'pattern', 'label', 'action'],
        properties: { name: { type: 'string' }, pattern: { type: 'string' }, label: { type: 'string', enum: ['Try Next', 'Keep Doing'] }, action: { type: 'string' } } } }
    }
  };
}

// What the model sees for each candidate: the locked numbers, how to read them, and a reference wording.
export function candidateFacts(c, lang) {
  const how = {
    trend: 'Average point margin per game in each match (your points minus theirs), oldest to latest. Objective score data. Quote the first and latest values (a, b) with "points"/「分」.',
    compare: c.id === 'compare:close_games'
      ? 'Close games (decided by 3 points or fewer) won in your last 3 matches (r of rn) vs the 3 before (p of pn). Objective score data.'
      : 'Games won in your last 3 matches (r of rn) vs the 3 before (p of pn). Objective score data.',
    tag: `Self-reported: whether the player noted ${c.tag} under "${c.side === 'cost' ? 'What Cost Points' : 'What Worked'}" in each of their latest 6 matches with notes (k of n; r = last 3, p = the 3 before). This is mentions in notes, not counted mistakes or points.` +
      (c.linked ? ` Linked to results: of the l losses in those matches, lt had this note (the chart marks each match W/L). Say it showed up in the losses; never say it caused them.` : ''),
    pattern: `Self-reported: the player noted ${c.tag} under "${c.side === 'cost' ? 'What Cost Points' : 'What Worked'}" in k of their latest n matches with notes (2+ matches: a repeated pattern, not a trend).` +
      (c.steady ? ' The score detectors ran and found no clear trend, so this is the main story.' : '') + (c.shape === 'returning' ? ' It came back after the player completed a Focus on it.' : ''),
    mixed: `Self-reported: ${c.tag} was noted costing points in k and working in w of the latest n matches with notes. No clear direction: say it has been up and down; never a strength or a weakness.`,
    opponent: `The player wrote notes about how ${c.name} plays in k matches (notes below). Summarise what the notes say about them; no record, no tactics the notes don't have.`,
    doubles: `Self-reported: ${c.tag} was noted under "${c.side === 'cost' ? 'What Cost Points' : 'What Worked'}" in k of n doubles matches with notes.`,
    early: `ONE observation so far (${c.side === 'opponent' ? `one note about ${c.name}` : `${c.tag} noted ${c.side === 'cost' ? 'costing points' : 'working'} once${c.doubles ? ' in doubles' : ''}`}). It is an early observation: say so ("Early sign", "too early to call", 「初步观察」「还不算规律」). Never a habit, a trend or an established strength or weakness.`
  }[c.family];
  return { candidate_id: c.id, tier: c.tier || 1, pattern: c.pattern, source: c.source, shape: c.shape, direction: c.direction, strength: c.strength,
    numbers: c.numbers, linked_to_losses: !!c.linked, skipped_matches_without_notes: c.evidence.window.skipped || 0, how_to_read: how, ...(c.name ? { opponent: c.name } : {}),
    notes: c.notes || [], reference: keyTemplate(c, lang) };
}

export const KEY_RULES = `KEY INSIGHT (Engine V2):
- The engine already found, ranked and quality-checked the candidates in key_candidates and computed every number. Pick ONE candidate_id and write its title and body. The first is the best. tier 1 = a measured score trend, tier 2 = a repeated pattern from the notes, tier 3 = an early observation or a mixed signal: never pick a lower tier over a higher one; within a tier choose another only if its notes make it more specific and useful. If key_candidates is empty, return null.
- The Key Insight summarises the discovery; don't copy the Build Next / Strengths card wording. A tier 3 early observation must say it is early (title or body) and never sound like a pattern.
- Title: the takeaway in plain words, like a coach after a few matches ("Your serve is still costing you points", 「发球还在让你丢分」). Never a database description ("Net play is coming up less", 「网前丢分提及减少」, 「最近提到网前丢分少了」). Body: the evidence in one natural sentence, matching the chart.
- The card is narrow (text column about 172px): the title must fit in 2 lines and the body in 3 lines. That is about 30 characters for an English title and 60 for an English body, 12 Chinese characters for a title and 34 for a body (punctuation counts). Copy that is longer is thrown away. Say it simply rather than squeeze it.
- Use ONLY the candidate's numbers. Never compute, round differently, add percentages, fractions like "2/6" or other numbers. Every number you write must be one of them.
- source "notes_tags" is self-reported: say the player noted / mentioned it (「你记下」「你提到」). Never say mistakes were counted, points were won or lost with that skill, or that a skill improved, got better or worse. Notes that stop mentioning a problem are not evidence it went away.
- linked_to_losses: the chart marks each match's recorded result (W/L; "·" = no recorded result). Describe an association only ("shows up in your losses", 「输球时常有」); never say or imply it caused, cost you or lost you the matches (no "because", "led to", 「导致」「因为」「输在」).
- source "scores" is measured: you may say games were won or the margin changed, but don't claim why.
- Only strength "strong" may use outcome words in the title ("heading the right way"); otherwise stay measured.
- Time words: "your last 3 matches", "the 3 before", "lately"; Chinese 「最近3场」「之前3场」「这几场」. If skipped_matches_without_notes > 0, say "noted matches" / 「有记录的」. Never "matches 1–3", 「第1至第3场」「第N场」, "tagged" or 「标签」.
- For compare and for an emerging strip, the body must name both groups: the last 3 and the 3 before.
- A concrete detail (a shot, a side, a situation) only if it is in that candidate's notes. Otherwise use reference, which is a correct wording.`;

export const ITEM_RULES = `BUILD NEXT / STRENGTHS (Engine V2):
- Write one item for each of build_candidates / strength_candidates, in the same order, with its topic_id. Do not add others. A skill is in one list only; never mention the same skill as the other kind.
- mixed: true means the player noted this skill costing points (k) and working (w) equally often. The engine writes its evidence; give a plain name and, with advice_basis "notes", an action about making it consistent. Never call it a strength or a weakness.
- name: the skill in 1–4 words (Chinese max 8 characters). Make it more specific ("Backhand defence") only when its notes say so. No numbers.
- evidence / signal: why it is here, conversationally, using only k and n if you use numbers. These are the player's own notes: "you noted", 「你记下」.
- advice_basis "notes": the action may build on what the notes say, one concrete thing to try, using only shots and situations the notes name. Don't add a correction of your own (no "use fewer X, try Y" unless the notes say so). advice_basis "general": the notes don't show a pattern, so don't name a specific shot, side, cause or situation anywhere in the item (name the skill plainly); the engine shows a general drill as the action.
- If returning is true, the player completed a Focus on this before and it came up again since; say so naturally.
- level "early": noted once only. The engine writes its name and labelled evidence; keep your copy plain and never call it a pattern, a habit or an established strength.`;

export const OPPONENT_RULES = `OPPONENT PLANS:
- opponents lists only opponents the player wrote notes about, each with only the notes about that opponent. Write one plan per opponent whose notes say something about how they play; leave out one whose notes don't. Never generic advice.
- level "single": the plan comes from one note, one match. Write it as a tentative read to test ("Test his backhand early"), never as a habit: no "always", "every time", "usually", 「总是」「每次」「经常」. The engine adds the "Early read" label; don't write it. level "repeated": the notes agree across matches, so the plan can be firmer.
- Never infer a style or weakness from results; you don't have them. Never mention the record, wins or losses.
- Every detail in the plan (shots, sides, situations) must come from that opponent's notes. The notes may be in another language than the output: translate what they say faithfully, adding nothing. One concise instruction, no name prefix.`;

export const DOUBLES_RULES = `DOUBLES PLAY:
- If doubles is null there are no doubles matches with notes: return an empty list.
- Otherwise write at most 2 items, each from what the doubles notes and tags actually say (notes may be in another language: translate faithfully). Describe what was noted naturally, then one practical adjustment or habit to keep. No details the notes don't have.
- repeated lists the skills noted in 2+ doubles matches: only those may be described as a pattern. Anything else is an early observation from one match: say what happened that time, never "always", "usually", 「总是」「经常」. The engine adds the "Early observation" label; don't write it.`;
