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

export const ENGINE_VERSION = '2026-10-25-v6';
export const SKILL_TAGS = ['Serve', 'Return', 'Net', 'Smash', 'Defence', 'Footwork', 'Placement'];
const WINDOW = 10;     // latest matches the engine reads
const NOTE_N = 6;      // matches with notes in a Skill Tag window
const TREND_N = 6;     // scored matches in the margin trend
const CLOSE = 3;       // a close game is decided by 3 points or fewer (as on Insights Performance)

// Tag labels. Titles use the app's tag names (tag_* in the app); sentences use a lower-case noun phrase.
const TAG = {
  en: { Serve: ['Serve', 'your serve'], Return: ['Return', 'your return'], Net: ['Net play', 'net play'], Smash: ['Smash', 'your smash'],
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
    match_ids: ms.map(m => m.id),
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
    match_ids: ms.map(m => m.id),
    significance: Math.min(1, 0.6 + Math.abs(diff) * 0.6), actionability: close ? 0.75 : 0.6, lowNovelty: !close
  };
}

// A Skill Tag noted (or not) in each of the latest 6 matches with notes. Shapes, by what the 0/1 row says:
//   recurring  noted in 4+ of 6 and in 2+ of the last 3        (still happening)
//   fading     noted in 2+ of the 3 before and at least 2 fewer of the last 3   e.g. [1,1,1,0,1,0]
//   emerging   noted in 2+ of the last 3 and at least 2 fewer of the 3 before
// "What worked" fading is never a candidate: fewer positive mentions doesn't show anything got worse.
// A tag noted on both sides of the same match in half or more of its matches is mixed, and not used.
function tagCandidates(chron) {
  const noted = chron.filter(hasNotes), win = noted.slice(-NOTE_N);
  if (win.length < NOTE_N) return [];
  const skipped = skippedIn(chron, win, hasNotes);
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
    else if (p >= 2 && p - r >= 2) shape = 'fading';
    else if (r >= 2 && r - p >= 2) shape = 'emerging';
    if (!shape || (side === 'worked' && shape === 'fading')) continue;
    const strength = shape === 'recurring' ? (k >= 5 ? 'strong' : 'moderate') : Math.abs(p - r) === 3 ? 'strong' : 'moderate';
    const latest = values[values.length - 1];
    out.push({
      id: `strip:${side}:${tag}:${shape}`, family: 'tag', pattern: 'strip', source: 'notes_tags', tag, side, shape,
      direction: shape === 'fading' ? 'down' : 'up', strength,
      numbers: { k, n: NOTE_N, r, p }, required: shape === 'recurring' ? [k, NOTE_N] : [r, p], allowed: [k, NOTE_N, r, p, 3],
      chart: { pattern: 'strip', values, unit: '' },
      evidence: { metric: side === 'cost' ? 'tag_noted_cost_points' : 'tag_noted_worked', unit: 'matches', window: { matches: NOTE_N, recent: 3, previous: 3, skipped } },
      match_ids: win.map(m => m.id),
      significance: shape === 'recurring' ? 0.55 + k * 0.07 : 0.6 + Math.abs(p - r) * 0.1,
      actionability: side === 'cost' ? (shape === 'fading' ? 0.9 : 1.0) : 0.7,
      // Recurring tags are also what Build Next / Strengths show, so they are less of a discovery than a change.
      novelty: shape === 'recurring' ? 0.75 : 1,
      recentSupport: shape === 'fading' ? latest === 0 : latest === 1
    });
  }
  return out;
}

// Ranking: significance x confidence x actionability x novelty x recency. Ties: objective evidence, then id.
//   significance   size of the change or how often it was noted
//   confidence     strong 1, moderate 0.75
//   actionability  cost-points tag 1 (fading 0.9), score trend 0.8, close games 0.75, worked tag 0.7, games won 0.6
//   novelty        0.6 when it is the same insight as last time; games won 0.8 (Performance already shows form);
//                  recurring tags 0.75 (Build Next / Strengths already list them)
//   recency        0.85 when the latest match doesn't support it
export function rankCandidates(cands, previousId) {
  for (const c of cands) {
    const conf = c.strength === 'strong' ? 1 : 0.75;
    const novelty = (c.id === previousId ? 0.6 : 1) * (c.lowNovelty ? 0.8 : 1) * (c.novelty || 1);
    const recency = c.recentSupport === false ? 0.85 : 1;
    c.score = Math.round(c.significance * conf * c.actionability * novelty * recency * 1000) / 1000;
  }
  return cands.sort((a, b) => b.score - a.score || (a.source === 'scores' ? -1 : 0) - (b.source === 'scores' ? -1 : 0) || a.id.localeCompare(b.id));
}

export function keyCandidates(matches, previousId) {
  const chron = normalize(matches);
  const all = [trendCandidate(chron), compareCandidate(chron, 'games'), compareCandidate(chron, 'close'), ...tagCandidates(chron)].filter(Boolean);
  return rankCandidates(all, previousId);
}

// ---- Key Insight template copy (also the fallback when AI copy fails validation) ----
export function keyTemplate(c, lang) {
  const P = phr(lang, c), N = c.numbers;
  if (c.family === 'trend') {
    const up = c.direction === 'up', strong = c.strength === 'strong';
    if (lang === 'zh') return {
      title: up ? (strong ? '最近比分越打越好' : '比分在慢慢变好') : (strong ? '最近比分一直在往下走' : '最近比分有点下滑'),
      body: `${P.lastN(N.n)}，你每局的平均分差从${signed(N.a)}分变成了${signed(N.b)}分。`
    };
    return {
      title: up ? (strong ? 'Your scores are heading the right way' : 'Your scores are trending up') : (strong ? 'Your scores have been slipping' : 'Your scores have dipped lately'),
      body: `Across ${P.lastN(N.n)}, your average margin per game went from ${signed(N.a)} to ${signed(N.b)} ${pts(N.b)}.`
    };
  }
  if (c.family === 'compare') {
    const close = c.id === 'compare:close_games', up = c.direction === 'up';
    if (lang === 'zh') {
      return {
        title: close ? (up ? '关键局最近赢得多了' : '关键局最近赢得少了') : (up ? '最近赢的局多了' : '最近赢的局少了'),
        body: close ? `${P.last3}打了${N.rn}个关键局，赢了${N.r}个；${P.prev3}${N.pn}个赢了${N.p}个。`
          : `${P.last3}打了${N.rn}局赢了${N.r}局，${P.prev3}${N.pn}局赢了${N.p}局。`
      };
    }
    const g = close ? 'close games' : 'games';
    return {
      title: close ? (up ? "You're winning more close games" : "You're losing more close games") : (up ? "You're winning more games lately" : "You've won fewer games lately"),
      body: `You won ${N.r} of ${N.rn} ${g} in ${P.last3}, compared with ${N.p} of ${N.pn} in ${P.prev3}.`
    };
  }
  const T = tagTitle(lang, c.tag), w = tagWord(lang, c.tag), cost = c.side === 'cost';
  if (lang === 'zh') {
    const what = cost ? `${w}丢分` : `${w}打得好`;
    if (c.shape === 'recurring') return { title: cost ? `${T}问题这几场反复出现` : `${T}这几场一直是亮点`, body: `${P.lastN(N.n)}里有${N.k}场你提到${what}，${P.last3}${N.r === 3 ? '每场都有' : `就有${N.r}场`}。` };
    if (c.shape === 'fading') return { title: `最近提到${T}丢分少了`,
      body: `${P.last3}${N.r === 0 ? '都没提到' : `只有${N.r}场提到`}${what}，${P.prev3}${N.p === 3 ? '每场都提到了' : `有${N.p}场`}。` };
    return { title: cost ? `${T}问题最近冒出来了` : `最近常提到${T}打得好`,
      body: `${P.last3}有${N.r}场提到${what}，${P.prev3}${N.p === 0 ? '都没提到' : `只有${N.p}场`}。` };
  }
  const what = cost ? `${w} costing you points` : `${w} winning you points`;
  if (c.shape === 'recurring') return { title: cost ? `${T} keeps coming up` : `${T} keeps standing out`,
    body: `You noted ${what} in ${N.k} of ${P.lastN(N.n)}, including ${N.r === 3 ? 'all' : N.r} of the last 3.` };
  if (c.shape === 'fading') return { title: `${T} is coming up less`,
    body: N.r === 0 ? `You haven't noted ${what} in ${P.last3}, after noting it in ${N.p === 3 ? 'all 3 before that' : `${N.p} of ${P.prev3}`}.`
      : `You noted ${what} in ${N.r} of ${P.last3}, compared with ${N.p === 3 ? 'all 3 before that' : `${N.p} of ${P.prev3}`}.` };
  return { title: cost ? `${T} has started coming up` : `${T} is starting to click`,
    body: `You noted ${what} in ${N.r} of ${P.last3}, ${N.p === 0 ? 'and none of the 3 before' : `up from ${N.p} of ${P.prev3}`}.` };
}

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
const CJK = /[㐀-鿿]/;
const BAN = {
  en: [/\bmatch(es)?\s*\d+\s*(?:-|–|—|to)\s*\d+/i, /\bdata (shows|indicates|suggests)\b/i, /\bmetrics?\b/i, /\bstatistic/i, /\baccording to\b/i, /\bkey_metrics|metric_id|candidate|cost:|worked:|strip:|trend:/i, /\bAI\b/],
  zh: [/第\s*[\d一二三四五六七八九十]+\s*(?:至|到|-|–|—)\s*(?:第\s*)?[\d一二三四五六七八九十]+\s*场/, /第\s*[\d一二三四五六七八九十]+\s*场/, /数据显示|呈现.*趋势|有所提升|指标|统计|根据记录/, /candidate|strip:|trend:|cost:|AI/]
};
// Self-reported evidence must sound self-reported, and may not claim measured outcomes.
const NOTE_WORDS = { en: /\b(not(e|ed|es|ing)|mention(ed|s)?|tag(ged|s)?|com(ing|es|e) up|came up|show(ing|s|ed)? up|wr(ote|itten))\b/i, zh: /提到|记录|记下|笔记|标记|写到/ };
const MEASURED = { en: /%|\bpercent|\brate\b|\bpoints? won\b|\bwon \d+ points|\bimprov|\bbetter\b|\bstronger\b|\bfixed\b|\bsolved\b|\bmistakes? (dropped|fell)/i, zh: /%|得分率|胜率|成功率|进步|变强|提升|改善|解决了|失误.{0,4}(次|个)/ };
const UP_WORDS = { en: /\b(more|keeps?|again|started|starting|rising|rose|up|climb)/i, zh: /多了|多起来|越来越多|反复|又|开始/ };
const DOWN_WORDS = { en: /\b(fewer|less|dropped|down|haven't|slipp|dipped|fell|lower)/i, zh: /少了|减少|没提到|下滑|往下|降/ };

export function checkCopy({ title, body }, c, lang) {
  const issues = [], text = `${title || ''} ${body || ''}`;
  if (!title || !body) issues.push('empty');
  if (lang === 'zh' ? !CJK.test(body) || !CJK.test(title) : CJK.test(text)) issues.push('language');
  if (lang === 'zh') { if (zhLen(title) > 14) issues.push('title_length'); if (zhLen(body) > 42) issues.push('body_length'); }
  else { if (words(title) > 7 || String(title).length > 40) issues.push('title_length'); if (words(body) > 25) issues.push('body_length'); }
  if (BAN[lang].some(r => r.test(text))) issues.push('banned_phrase');
  const nums = numbersIn(text).map(Math.abs);
  if (nums.some(n => !c.allowed.includes(n))) issues.push('number_not_in_evidence');
  if (c.required.some(n => !nums.includes(n) && !(n === 3 && /all 3|每场都/.test(text)) && !(n === 0 && /(haven't|none|都没|没提到)/i.test(text)))) issues.push('number_missing');
  if (c.chart.unit !== '%' && /%/.test(text)) issues.push('unit');
  if (c.family === 'trend' && !(lang === 'zh' ? /分/.test(body) : /\bpoints?\b/i.test(body))) issues.push('unit');
  if (c.direction === 'down' && c.shape !== 'recurring' && UP_WORDS[lang].test(text) && !DOWN_WORDS[lang].test(text)) issues.push('direction');
  if ((c.direction === 'up') && DOWN_WORDS[lang].test(title)) issues.push('direction');
  if (c.source === 'notes_tags') {
    if (!NOTE_WORDS[lang].test(text)) issues.push('not_marked_self_reported');
    if (MEASURED[lang].test(text)) issues.push('measured_claim_from_notes');
  } else if (c.strength !== 'strong' && (lang === 'zh' ? /进步|越来越好/.test(title) : /\b(improv|better|stronger)/i.test(title))) issues.push('overclaim');
  if (c.pattern === 'compare' || (c.pattern === 'strip' && c.shape !== 'recurring')) {
    const okWindow = lang === 'zh' ? /最近(有记录的)?3场/.test(body) && /之前/.test(body) : /last 3/i.test(body) && /\b(before|previous|earlier)\b/i.test(body);
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
    chart: { ...c.chart },
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
// focus: [{ topic, status: 'active' | 'completed', completed_at }]
export function buildCandidates(matches, focus = [], max = 4) {
  const chron = normalize(matches), noted = chron.filter(hasNotes), win = noted.slice(-NOTE_N);
  if (win.length < 3) return [];
  const out = [];
  for (const tag of SKILL_TAGS) {
    const topic = 'tag:' + tag, fs = focus.filter(f => f.topic === topic);
    if (fs.some(f => f.status === 'active')) continue;
    const done = fs.filter(f => f.status === 'completed').map(f => String(f.completed_at || '')).sort().pop();
    let list = win, returning = false;
    if (done) {
      const after = noted.filter(m => String(m.created_at || `${m.date}T23:59:59`) > done);
      if (after.length < 3) continue;
      list = after.slice(-NOTE_N); returning = true;
    }
    const values = list.map(m => ((m.lt || []).includes(tag) ? 1 : 0)), k = sum(values);
    if (k < 2) continue;
    const both = list.filter(m => (m.lt || []).includes(tag) && (m.wt || []).includes(tag)).length;
    if (both * 2 >= k) continue;
    out.push({ topic_id: topic, tag, k, n: list.length, recent: sum(values.slice(-3)), latest: values[values.length - 1], returning,
      skipped: returning ? 0 : chron.slice(chron.indexOf(win[0])).filter(m => !hasNotes(m)).length });
  }
  return out.sort((a, b) => b.k / b.n - a.k / a.n || b.recent - a.recent || b.latest - a.latest || a.tag.localeCompare(b.tag)).slice(0, max);
}
export function strengthCandidates(matches, max = 2) {
  const chron = normalize(matches), win = chron.filter(hasNotes).slice(-NOTE_N);
  if (win.length < 3) return [];
  const out = [];
  for (const tag of SKILL_TAGS) {
    const values = win.map(m => ((m.wt || []).includes(tag) ? 1 : 0)), k = sum(values);
    if (k < 2) continue;
    const both = win.filter(m => (m.lt || []).includes(tag) && (m.wt || []).includes(tag)).length;
    if (both * 2 >= k) continue;
    out.push({ topic_id: 'tag:' + tag, tag, k, n: win.length, recent: sum(values.slice(-3)) });
  }
  return out.sort((a, b) => b.k - a.k || b.recent - a.recent || a.tag.localeCompare(b.tag)).slice(0, max);
}
export function itemTemplate(item, kind, lang) {
  const name = APP_TAG_LABELS[lang][item.tag]; // the app's own tag name, as on the Skill Tag chips
  if (lang === 'zh') {
    const lastN = `最近${item.skipped ? '有记录的' : ''}${item.n}场`;
    if (kind === 'strength') return { name, signal: `${lastN}里有${item.k}场提到这里帮你得分。` };
    return { name, evidence: item.returning ? `完成后的${item.n}场里，又有${item.k}场提到这里丢分。` : `${lastN}里有${item.k}场提到这里丢分。` };
  }
  const lastN = `your last ${item.n} ${item.skipped ? 'noted ' : ''}matches`;
  if (kind === 'strength') return { name, signal: `Noted as winning you points in ${item.k} of ${lastN}.` };
  return { name, evidence: item.returning ? `Noted as costing points again in ${item.k} of ${item.n} matches since you completed it.` : `Noted as costing you points in ${item.k} of ${lastN}.` };
}
// Checks one AI Build Next / Strengths item. Field limits match the Grow tiles.
export function checkItem(ai, item, kind, lang) {
  const issues = [], textKey = kind === 'strength' ? 'signal' : 'evidence';
  const name = String(ai.name || '').trim(), ev = String(ai[textKey] || '').trim(), act = String(ai.action || '').trim();
  const allowed = [item.k, item.n, 3];
  for (const [f, s] of [['name', name], [textKey, ev], ['action', act]]) {
    if (!s) { if (f !== 'action') issues.push(f + ':empty'); continue; }
    if (lang === 'zh' ? !CJK.test(s) : CJK.test(s)) issues.push(f + ':language');
    if (BAN[lang].some(r => r.test(s))) issues.push(f + ':banned_phrase');
    if (numbersIn(s).some(n => !allowed.includes(Math.abs(n)))) issues.push(f + ':number_not_in_evidence');
    if (MEASURED[lang].test(s) && f !== 'action') issues.push(f + ':measured_claim_from_notes');
  }
  if (lang === 'zh' ? zhLen(name) > 8 : words(name) > 4) issues.push('name:length');
  if (numbersIn(name).length) issues.push('name:number');
  if (lang === 'zh' ? zhLen(ev) > 26 : words(ev) > 16) issues.push(textKey + ':length');
  if (lang === 'zh' ? zhLen(act) > 26 : words(act) > 16) issues.push('action:length');
  return issues;
}
// ai: the model's array (each item names its topic_id). Returns the stored items in engine order.
export function finalizeItems(items, ai, kind, lang) {
  const textKey = kind === 'strength' ? 'signal' : 'evidence';
  return items.map((item, rank) => {
    const a = (ai || []).find(x => x && x.topic_id === item.topic_id), t = itemTemplate(item, kind, lang);
    const issues = a ? checkItem(a, item, kind, lang) : ['no_ai_copy'];
    const bad = f => issues.some(i => i.startsWith(f + ':')) || !a;
    return {
      topic_id: item.topic_id, tag: item.tag, rank: rank + 1,
      name: bad('name') ? t.name : String(a.name).trim(),
      [textKey]: bad(textKey) ? t[textKey] : String(a[textKey]).trim(),
      action: bad('action') ? '' : String(a.action || '').trim(),
      evidence_numbers: { k: item.k, n: item.n }, returning: item.returning || false,
      copy_source: issues.length ? (a ? 'mixed' : 'template') : 'ai', issues
    };
  });
}

// ---- The model's part ----
// The strict schema is built per request so the model can only name candidates that exist.
export function modelSchema(keyIds, buildIds, strengthIds) {
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
      opponentPlans: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['player_id', 'plan'],
        properties: { player_id: { type: 'string' }, plan: { type: 'string' } } } },
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
    tag: `Self-reported: whether the player noted ${c.tag} under "${c.side === 'cost' ? 'What Cost Points' : 'What Worked'}" in each of their latest 6 matches with notes (k of n; r = last 3, p = the 3 before). This is mentions in notes, not counted mistakes or points.`
  }[c.family];
  return { candidate_id: c.id, pattern: c.pattern, source: c.source, shape: c.shape, direction: c.direction, strength: c.strength,
    numbers: c.numbers, skipped_matches_without_notes: c.evidence.window.skipped || 0, how_to_read: how, reference: keyTemplate(c, lang) };
}

export const KEY_RULES = `KEY INSIGHT (Engine V2):
- The engine already found and ranked the candidates in key_candidates and computed every number. Pick ONE candidate_id (the first is the strongest; choose another only if the notes make it more specific and useful) and write its title and body. If key_candidates is empty, return null.
- Title: the takeaway, like a coach would say it. English max 7 words; Chinese max 14 characters. Body: what the chart counts, over which matches, and the numbers. English max 25 words; Chinese max 40 characters.
- Use ONLY the candidate's numbers. Never compute, round differently, add percentages or add other numbers. Every number you write must be one of them.
- source "notes_tags" is self-reported: say the player noted / mentioned it (「你提到」「记录里」). Never say mistakes were counted, points were won or lost with that skill, or that a skill improved, got better or worse. A match without notes is not evidence that something didn't happen.
- source "scores" is measured: you may say games were won or the margin changed, but don't claim why.
- Only strength "strong" may use outcome words in the title ("heading the right way"); otherwise stay measured.
- Time words: "your last 3 matches", "the 3 before", "lately"; Chinese 「最近3场」「之前3场」「这几场」. If skipped_matches_without_notes > 0, say "noted matches" / 「有记录的」. Never "matches 1–3" or 「第1至第3场」「第N场」.
- For compare and for a strip that changed (fading / emerging), the body must name both groups: the last 3 and the 3 before.
- reference is a correct wording: improve it with a concrete detail from the notes of those matches if there is one, otherwise use it.
BUILD NEXT / STRENGTHS (Engine V2):
- Write one item for each of build_candidates / strength_candidates, in the same order, with its topic_id. Do not add others.
- name: the skill in 1–4 words (Chinese max 8 characters), may be more specific from the notes ("Backhand defence"). No numbers.
- evidence / signal: why it is here, conversationally, using only k and n if you use numbers. These are the player's own notes: "you noted", 「你提到」.
- If returning is true, the player completed a Focus on this before and it came up again since; say so naturally.`;
