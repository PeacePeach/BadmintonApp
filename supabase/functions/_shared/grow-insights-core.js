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

export const ENGINE_VERSION = '2026-10-26-v10';
export const SKILL_TAGS = ['Serve', 'Return', 'Net', 'Smash', 'Defence', 'Footwork', 'Placement'];
const WINDOW = 10;     // latest matches the engine reads
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

// Oldest -> latest, at most WINDOW. Input rows are the matches table (date, created_at), newest first or any order.
export function normalize(matches) {
  return [...(matches || [])]
    .sort((a, b) => (a.date === b.date ? String(a.created_at || '').localeCompare(String(b.created_at || '')) : String(a.date).localeCompare(String(b.date))))
    .slice(-WINDOW);
}

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
export function keyCandidates(matches, previousId, { all = false } = {}) {
  const chron = normalize(matches);
  const sides = topicSides(matches); // a tag that belongs on the other side (see Build Next) is not a Key Insight either
  const found = [trendCandidate(chron), compareCandidate(chron, 'games'), compareCandidate(chron, 'close'),
    ...tagCandidates(chron).filter(c => !sides[c.tag] || sides[c.tag] === c.side)].filter(Boolean);
  const ranked = rankCandidates(found, previousId);
  return all ? ranked : ranked.filter(c => c.quality >= KEY_MIN_QUALITY);
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
  nerves: [/nerv|pressure|tense/i, /紧张|压力|心态/], height: [/too (high|low|flat)|\bheight\b/i, /太高|太低|过高|高度/],
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
export function anchored(text, notes) {
  const n = (notes || []).join(' \n ');
  if (conceptsIn(text).some(k => conceptsIn(n).includes(k))) return true;
  const a = contentTokens(text), b = contentTokens(n);
  return [...a].some(x => b.has(x));
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
  if (c.chart.unit !== '%' && /%/.test(text)) issues.push('unit');
  if (c.family === 'trend' && !(lang === 'zh' ? /分/.test(body) : /\bpoints?\b/i.test(body))) issues.push('unit');
  if (c.direction === 'down' && c.shape !== 'recurring' && UP_WORDS[lang].test(text) && !DOWN_WORDS[lang].test(text)) issues.push('direction');
  if ((c.direction === 'up') && DOWN_WORDS[lang].test(title)) issues.push('direction');
  if (c.source === 'notes_tags') {
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

// The model's keyInsight answer -> the stored Key Insight. ai: { candidate_id, title, body } or null.
export function finalizeKey(cands, ai, lang) {
  if (!cands.length) return { status: 'insufficient', reason: 'no_candidate' };
  const c = (ai && cands.find(x => x.id === ai.candidate_id)) || cands[0];
  let copy = ai && ai.candidate_id === c.id ? { title: String(ai.title || '').trim(), body: String(ai.body || '').trim() } : null;
  let issues = copy ? checkCopy(copy, c, lang) : ['no_ai_copy'], source = 'ai';
  if (issues.length) { copy = keyTemplate(c, lang); source = 'template'; }
  const tIssues = source === 'template' ? checkCopy(copy, c, lang) : [];
  return {
    status: 'ok', candidate_id: c.id, metric_id: c.id, title: copy.title, body: copy.body, pattern: c.pattern,
    // A linked strip writes each match's result under its pill (RWKeyChart xLabels) instead of 1..6.
    chart: { ...c.chart, ...(c.chart.results ? { xLabels: c.chart.results.map(r => (lang === 'zh' ? { W: '胜', L: '负' } : { W: 'W', L: 'L' })[r] || '·') } : {}) },
    evidence: { source: c.source, family: c.family, tag: c.tag || null, side: c.side || null, shape: c.shape, direction: c.direction, strength: c.strength,
      score: c.score, numbers: c.numbers, ...c.evidence },
    match_ids: c.match_ids, copy_source: source,
    validation: { passed: !tIssues.length, ai_issues: source === 'template' ? issues : [], issues: tIssues }
  };
}

// ---- Build Next and Strengths ----
// Build Next: Skill Tags noted as costing points in 2+ of the latest 6 matches with notes (3+ needed), ranked by
// how often, then by the last 3, then by the latest match. Active Focus topics are left out. A completed Focus
// topic comes back only with new evidence: 3+ matches with notes logged since it was completed, and the tag
// noted as costing points in 2+ of them; its evidence is then counted over those matches only.
// Strengths: Skill Tags noted as working in 2+ of the same window.
// One side per skill (Han, 2026-10-26): a tag noted 2+ times on both sides (in different matches) would show up as a
// strength and a weakness at once, and a Skill Tag can't tell two subskills apart, so it keeps only the side with the
// stronger evidence over the whole window: noted in more of the 6 matches (Han, 2026-10-26: a 4/6 strength is not
// wiped out by a more recent 2/6 cost), then in more of the last 3 on a tie, then cost points.
// Each item carries the player's free-text notes from the matches behind it. advice_basis is "notes" when 2+ of
// them say something specific (one note is not a pattern), else "general": the advice is then a plainly general
// drill, and the name and evidence may not name a specific shot, side or situation either.
// focus: [{ topic, status: 'active' | 'completed', completed_at }]
const noteWindow = matches => { const chron = normalize(matches), noted = chron.filter(hasNotes); return { chron, noted, win: noted.slice(-NOTE_N) }; };
const has = (m, f, tag) => (m[f] || []).includes(tag);
const SKILL_MENTION = {
  Serve: /\\bserv(e|es|ing|ice)\\b|发球/i,
  Return: /\\breturn(s|ing)?\\b|接发/i,
  Net: /\\bnet\\b|网前|放网/i,
  Smash: /\\bsmash(es|ing|ed)?\\b|杀球|扣杀/i,
  Defence: /\\bdefen[cs]e\\b|防守|接杀/i,
  Footwork: /\\bfootwork\\b|步法|步伐|移动/i,
  Placement: /\\bplacement\\b|落点|线路/i
};
const mentionsSkill = (note, tag) => SKILL_MENTION[tag]?.test(note) || false;
// Count only concepts in the clauses about this skill. A note can also discuss
// an unrelated skill (e.g. Smash + backhand Defence); those are not Smash evidence.
const skillClauses = (notes, tag) => notes.flatMap(note =>
  String(note).split(/[。！？；;，,.!?]/).map(s => s.trim())
    .filter(s => mentionsSkill(s, tag)));

export function topicSides(matches) {
  const { win } = noteWindow(matches), out = {};
  for (const tag of SKILL_TAGS) {
    const c = win.filter(m => has(m, 'lt', tag)).length, w = win.filter(m => has(m, 'wt', tag)).length;
    if (c < 2 || w < 2) continue;
    const l3 = win.slice(-3), rc = l3.filter(m => has(m, 'lt', tag)).length, rw = l3.filter(m => has(m, 'wt', tag)).length;
    if (c === w) {
      // Tied mixed evidence is not a weakness by default. Two different, explicitly
      // documented situations may legitimately coexist, otherwise suppress both.
      const costNotes = notesFor(win.filter(m => has(m, 'lt', tag)), ['lost']);
      const workedNotes = notesFor(win.filter(m => has(m, 'wt', tag)), ['worked']);
      const costClauses = skillClauses(costNotes, tag);
      const workedClauses = skillClauses(workedNotes, tag);
      const costKinds = new Set(costClauses.flatMap(conceptsIn));
      const workedKinds = new Set(workedClauses.flatMap(conceptsIn));
      const distinct = tag === 'Smash' && costKinds.size && workedKinds.size &&
        [...costKinds].every(k => !workedKinds.has(k)) &&
        costNotes.some(n => mentionsSkill(n, tag)) && workedNotes.some(n => mentionsSkill(n, tag)) &&
        Boolean(smashContextName(costKinds, 'en')) && Boolean(smashContextName(workedKinds, 'en')) &&
        smashContextName(costKinds, 'en') !== smashContextName(workedKinds, 'en');
      out[tag] = distinct ? 'both' : 'ambiguous';
    } else out[tag] = c > w ? 'cost' : 'worked';
  }
  return out;
}
const smashContextName = (concepts, lang) => {
  if (concepts.has('rearCourt')) return lang === 'zh' ? '后场杀球' : 'Backcourt smashes';
  if (concepts.has('sideline')) return lang === 'zh' ? '边线杀球' : 'Sideline smashes';
  return '';
};
// Advice is note-specific only when a concrete context recurs in two separate skill clauses.
const basisOf = (notes, tag) => {
  if (tag !== 'Smash') return notes.filter(specificNote).length >= 2 ? 'notes' : 'general';
  const seen = new Map();
  for (const note of notes) {
    const kinds = new Set(skillClauses([note], tag).flatMap(conceptsIn));
    for (const k of kinds) seen.set(k, (seen.get(k) || 0) + 1);
  }
  return [...seen.values()].some(n => n >= 2) ? 'notes' : 'general';
};
export function buildCandidates(matches, focus = [], max = 4) {
  const { chron, noted, win } = noteWindow(matches);
  if (win.length < 3) return [];
  const sides = topicSides(matches), out = [];
  for (const tag of SKILL_TAGS) {
    const topic = 'tag:' + tag, fs = focus.filter(f => f.topic === topic);
    if (fs.some(f => f.status === 'active') || (sides[tag] === 'worked' || sides[tag] === 'ambiguous')) continue;
    const done = fs.filter(f => f.status === 'completed').map(f => String(f.completed_at || '')).sort().pop();
    let list = win, returning = false;
    if (done) {
      const after = noted.filter(m => String(m.created_at || `${m.date}T23:59:59`) > done);
      if (after.length < 3) continue;
      list = after.slice(-NOTE_N); returning = true;
    }
    const values = list.map(m => (has(m, 'lt', tag) ? 1 : 0)), k = sum(values);
    if (k < 2) continue;
    const both = list.filter(m => has(m, 'lt', tag) && has(m, 'wt', tag)).length;
    if (both * 2 >= k) continue;
    const notes = notesFor(list.filter(m => has(m, 'lt', tag)), ['lost']);
    out.push({ topic_id: topic, tag, k, n: list.length, recent: sum(values.slice(-3)), latest: values[values.length - 1], returning,
      skipped: returning ? 0 : chron.slice(chron.indexOf(win[0])).filter(m => !hasNotes(m)).length, notes, basis: basisOf(notes, tag), contextName: sides[tag] === 'both' ? {en: smashContextName(new Set(skillClauses(notes,tag).flatMap(conceptsIn)), 'en'), zh: smashContextName(new Set(skillClauses(notes,tag).flatMap(conceptsIn)), 'zh')} : null });
  }
  return out.sort((a, b) => b.k / b.n - a.k / a.n || b.recent - a.recent || b.latest - a.latest || a.tag.localeCompare(b.tag)).slice(0, max);
}
export function strengthCandidates(matches, max = 2) {
  const { chron, win } = noteWindow(matches);
  if (win.length < 3) return [];
  const sides = topicSides(matches), out = [];
  for (const tag of SKILL_TAGS) {
    if (sides[tag] === 'cost' || sides[tag] === 'ambiguous') continue;
    const values = win.map(m => (has(m, 'wt', tag) ? 1 : 0)), k = sum(values);
    if (k < 2) continue;
    const both = win.filter(m => has(m, 'lt', tag) && has(m, 'wt', tag)).length;
    if (both * 2 >= k) continue;
    const notes = notesFor(win.filter(m => has(m, 'wt', tag)), ['worked']);
    out.push({ topic_id: 'tag:' + tag, tag, k, n: win.length, recent: sum(values.slice(-3)), notes, basis: basisOf(notes, tag), contextName: sides[tag] === 'both' ? {en: smashContextName(new Set(skillClauses(notes,tag).flatMap(conceptsIn)), 'en'), zh: smashContextName(new Set(skillClauses(notes,tag).flatMap(conceptsIn)), 'zh')} : null,
      skipped: chron.slice(chron.indexOf(win[0])).filter(m => !hasNotes(m)).length });
  }
  return out.sort((a, b) => b.k - a.k || b.recent - a.recent || a.tag.localeCompare(b.tag)).slice(0, max);
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
    if (kind === 'strength') return { name, signal: `${lastN}比赛中，有${item.k}场你觉得${name}发挥不错。`, action };
    return { name, evidence: item.returning ? `完成这个训练目标后的${item.n}场里，又有${item.k}场你记下这里丢分。` : `${lastN}比赛中，有${item.k}场你提到${name}的问题。`, action };
  }
  const lastN = `your last ${item.n} ${item.skipped ? 'noted ' : ''}matches`;
  if (kind === 'strength') return { name, signal: `You noted ${name.toLowerCase()} working well in ${item.k} of ${lastN}.`, action };
  return { name, evidence: item.returning ? `You noted it costing points again in ${item.k} of ${item.n} matches since you completed it.` : `You noted it costing you points in ${item.k} of ${lastN}.`, action };
}
// A cause or diagnosis the notes would have to support.
const CAUSE = { en: /\b(because|due to|caused by|the reason|that's why)\b/i, zh: /因为|导致|原因是|由于|所以才/ };
// Checks one AI Build Next / Strengths item. Field limits match the Grow tiles.
export function checkItem(ai, item, kind, lang) {
  const issues = [], textKey = kind === 'strength' ? 'signal' : 'evidence';
  const name = String(ai.name || '').trim(), ev = String(ai[textKey] || '').trim(), act = String(ai.action || '').trim();
  const allowed = [item.k, item.n, 3], ground = item.basis === 'notes' ? item.notes : [];
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
      name: item.contextName?.[lang] || (bad('name') ? t.name : String(a.name).trim()),
      [textKey]: bad(textKey) ? t[textKey] : String(a[textKey]).trim(),
      action: aiAction || t.action, advice_basis: aiAction ? 'notes' : 'general',
      evidence_numbers: { k: item.k, n: item.n }, returning: item.returning || false,
      copy_source: issues.length ? (a ? 'mixed' : 'template') : 'ai', issues
    };
  });
}

// ---- Opponent plans ----
// Han (2026-10-26): a plan only for an opponent the player wrote notes about, and only from those notes. A
// win/loss record says nothing about how someone plays, so it is not given to the model at all, and a plan that
// isn't anchored in the notes (or adds details they don't have) is left out, never replaced by generic advice.
// "unknown:<heard name>" is a voice-logged opponent nobody identified: no profile, no plan.
export function opponentFacts(matches, names = {}) {
  const by = {};
  for (const m of [...(matches || [])].slice(0, WINDOW)) for (const pid of (m.opps || []).filter(p => p && !String(p).startsWith('unknown:'))) {
    const note = String(m.opp_notes || '').trim().slice(0, 300);
    if (!note) continue;
    (by[pid] ||= { player_id: pid, name: names[pid] || 'Opponent', notes: [] }).notes.push(note);
  }
  return Object.values(by).map(o => ({ ...o, notes: o.notes.slice(0, 4) })).slice(0, 5);
}
const RECORD = { en: /\b(record|head[- ]to[- ]head|lost to (them|him|her)|beat (you|them)|you('ve| have) (lost|won|beaten)|losses|losing streak)\b/i,
  zh: /战绩|交手|输给|赢过|胜率|连输|连赢|胜负/ };
export function checkPlan(plan, o, lang) {
  const issues = [];
  if (!plan) return ['empty'];
  if (lang === 'zh' ? !CJK.test(plan) : CJK.test(plan)) issues.push('language');
  if (BAN[lang].some(r => r.test(plan))) issues.push('banned_phrase');
  if (numbersIn(plan).some(n => !numbersIn(o.notes.join(' ')).includes(n))) issues.push('number_not_in_evidence');
  if (RECORD[lang].test(plan)) issues.push('record_inference');
  if (ungrounded(plan, o.notes, { advice: true }).length) issues.push('detail_not_in_notes');
  if (!anchored(plan, o.notes)) issues.push('not_from_notes');
  if (lang === 'zh' ? zhLen(plan) > 36 : words(plan) > 24) issues.push('length');
  return issues;
}
export function finalizeOpponents(ai, opps, lang) {
  return (ai || []).map(p => {
    const o = opps.find(x => x.player_id === p.player_id);
    if (!o) return null;
    let plan = String(p.plan || '').trim();
    const name = String(o.name || '').trim();
    if (name) for (const pre of [name + ':', name + '：', 'against ' + name + ':']) if (plan.toLowerCase().startsWith(pre.toLowerCase())) { plan = plan.slice(pre.length).trim(); break; }
    const issues = checkPlan(plan, o, lang);
    return issues.length ? { player_id: o.player_id, dropped: issues } : { player_id: o.player_id, plan };
  }).filter(Boolean);
}

// ---- Doubles play ----
// Only from 3+ doubles matches with notes; each item must be anchored in those notes, with no new details.
export function doublesFacts(matches) {
  const ds = normalize(matches).filter(m => m.type === 'Doubles').slice(-6), noted = ds.filter(m => hasNotes(m) || m.worked || m.lost);
  if (noted.length < 3) return null;
  const cnt = f => { const c = {}; for (const m of ds) for (const t of (m[f] || [])) c[t] = (c[t] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })); };
  const notes = ds.flatMap(m => [m.worked ? { kind: 'worked', text: String(m.worked).trim().slice(0, 300) } : null, m.lost ? { kind: 'cost_points', text: String(m.lost).trim().slice(0, 300) } : null]).filter(Boolean).slice(-8);
  return { matches: ds.length, cost_points: cnt('lt'), strengths: cnt('wt'), notes };
}
export function finalizeDoubles(ai, facts, lang) {
  if (!facts) return [];
  const notes = facts.notes.map(n => n.text), counts = [facts.matches, ...facts.cost_points.map(x => x.count), ...facts.strengths.map(x => x.count), 3];
  const tags = [...facts.cost_points, ...facts.strengths].map(x => x.tag);
  const labels = tags.flatMap(t => [APP_TAG_LABELS.en[t], APP_TAG_LABELS.zh[t], TAG.en[t] && TAG.en[t][1]]).filter(Boolean);
  return (ai || []).filter(d => {
    const text = `${d.name || ''} ${d.pattern || ''} ${d.action || ''}`;
    if (!d.name || !d.pattern || (lang === 'zh' ? !CJK.test(text) : CJK.test(text))) return false;
    if (BAN[lang].some(r => r.test(text)) || numbersIn(text).some(n => !counts.includes(n))) return false;
    return !ungrounded(`${d.name} ${d.pattern}`, notes).length && !ungrounded(d.action || '', notes, { advice: true }).length &&
      anchored(`${d.name} ${d.pattern}`, [...notes, ...labels]);
  }).slice(0, 2);
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
      strengths: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['topic_id', 'name', 'signal', 'action'],
        properties: { topic_id: en(strengthIds), name: { type: 'string' }, signal: { type: 'string' }, action: { type: 'string' } } } },
      opponentPlans: { type: 'array', maxItems: oppIds.length ? 2 : 0, items: { type: 'object', additionalProperties: false, required: ['player_id', 'plan'],
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
      (c.linked ? ` Linked to results: of the l losses in those matches, lt had this note (the chart marks each match W/L). Say it showed up in the losses; never say it caused them.` : '')
  }[c.family];
  return { candidate_id: c.id, pattern: c.pattern, source: c.source, shape: c.shape, direction: c.direction, strength: c.strength,
    numbers: c.numbers, linked_to_losses: !!c.linked, skipped_matches_without_notes: c.evidence.window.skipped || 0, how_to_read: how,
    notes: c.notes || [], reference: keyTemplate(c, lang) };
}

export const KEY_RULES = `KEY INSIGHT (Engine V2):
- The engine already found, ranked and quality-checked the candidates in key_candidates and computed every number. Pick ONE candidate_id (the first is the strongest; choose another only if its notes make it more specific and useful) and write its title and body. If key_candidates is empty, return null: there is nothing worth highlighting yet, and that is fine.
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
- Write one item for each of build_candidates / strength_candidates, in the same order, with its topic_id. Do not add others. A skill can appear in BOTH lists only when distinct, independently grounded situations exist in positive and negative notes. In that case, make each name describe its own situation, not the same generic skill name; never imply either side cancels the other.
- name: the skill in 1–4 words (Chinese max 8 characters). Make it more specific ("Backhand defence") only when its notes say so. No numbers.
- evidence / signal: why it is here, conversationally, using only k and n if you use numbers. These are the player's own notes: "you noted", 「你记下」.
- advice_basis "notes": the action may build on what the notes say, one concrete thing to try, using only shots and situations the notes name. Don't add a correction of your own (no "use fewer X, try Y" unless the notes say so). advice_basis "general": the notes don't show a pattern, so don't name a specific shot, side, cause or situation anywhere in the item (name the skill plainly); the engine shows a general drill as the action.
- If returning is true, the player completed a Focus on this before and it came up again since; say so naturally.`;

export const OPPONENT_RULES = `OPPONENT PLANS:
- opponents lists only opponents the player wrote notes about, with those notes. Give a plan only when the notes say something about how that opponent plays; otherwise leave them out. Return an empty list rather than generic advice.
- Never infer a style or weakness from results; you don't have them. Never mention the record, wins or losses.
- Every detail in the plan (shots, sides, situations) must come from that opponent's notes. One concise instruction, no name prefix.`;

export const DOUBLES_RULES = `DOUBLES PLAY:
- If doubles is null there are not enough doubles matches with notes: return an empty list.
- Otherwise write at most 2 items, each from what the doubles notes and tags actually say. Describe the pattern naturally, then one practical adjustment or habit to keep. No details the notes don't have.`;
