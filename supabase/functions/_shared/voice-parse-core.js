// Voice match logging: turns a spoken or typed session description into structured JSON.
// Plain ES module with no dependencies, shared by the parse-voice-log edge function (Deno) and the
// eval runner in voice-eval/ (Node 18+), so both exercise exactly the same prompt, schema and guards.

export const PROMPT_VERSION = '2026-10-18-v2';
export const AREAS = ['Serve', 'Return', 'Net', 'Smash', 'Defence', 'Footwork', 'Placement', 'Other'];
const MISSING = ['match_type', 'opponents', 'partners', 'game_count', 'results', 'scores', 'game_order'];
const AMBIG = ['match_type', 'players', 'games', 'results', 'scores', 'observations'];

const intOrNull = { type: ['integer', 'null'] };
export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['language', 'match_type', 'game_count', 'order_known', 'totals', 'players', 'games', 'observations', 'missing', 'ambiguities'],
  properties: {
    language: { type: 'string', enum: ['en', 'zh', 'mixed'] },
    match_type: { type: ['string', 'null'], enum: ['singles', 'doubles', null] },
    game_count: intOrNull,
    order_known: { type: 'boolean' },
    totals: { type: 'object', additionalProperties: false, required: ['wins', 'losses'], properties: { wins: intOrNull, losses: intOrNull } },
    players: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'role', 'games'], properties: {
      name: { type: 'string' }, role: { type: 'string', enum: ['opponent', 'partner', 'unknown'] }, games: { type: 'array', items: { type: 'integer' } } } } },
    games: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['number', 'result', 'my_score', 'their_score', 'partners'], properties: {
      number: { type: 'integer' }, result: { type: ['string', 'null'], enum: ['win', 'loss', null] },
      my_score: intOrNull, their_score: intOrNull, partners: { type: 'array', items: { type: 'string' } } } } },
    observations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'category', 'area', 'about'], properties: {
      text: { type: 'string' }, category: { type: 'string', enum: ['won_points', 'lost_points', 'opponent', 'unsure'] },
      area: { type: ['string', 'null'], enum: [...AREAS, null] }, about: { type: ['string', 'null'] } } } },
    missing: { type: 'array', items: { type: 'string', enum: MISSING } },
    ambiguities: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'note'], properties: {
      field: { type: 'string', enum: AMBIG }, note: { type: 'string' } } } }
  }
};

export const SYSTEM_PROMPT = `You turn a badminton player's own description of a session into structured data for the Rallywise app.
The description may be English, Mandarin Chinese, or a mix, and often comes from speech recognition, so expect filler words and small recognition errors. "I", "me", "我" is the player.

Hard rules
- Record only what the speaker says or what follows by simple arithmetic. Never invent names, scores, results, game order, partners or observations. Use null, [] or "missing" instead.
- When the speaker corrects themselves ("no wait", "sorry", "I mean", "不对", "我是说", "应该是"), keep only the corrected value.
- Keep player names exactly as spoken (e.g. "小王", "Alex"). Never translate, complete or guess surnames. Never include the speaker.

Fields
- language: "en", "zh" or "mixed".
- match_type: "doubles" if doubles is stated or a partner/teammate is mentioned or two opponents are named together; "singles" if singles is stated or the speaker clearly played one-on-one against one named person. Otherwise null and add "match_type" to missing.
- players: every other named person. role "partner" (on the speaker's side), "opponent", or "unknown" when the wording does not say (e.g. "played with Marcus" without saying singles/doubles). games: 1-based game numbers this person was involved in, only when stated; otherwise [].
- game_count: total games played, if stated or derivable (e.g. "won 4, lost 2" gives 6; "four games, lost three" gives 4). null if unknown, including vague counts like "five or six".
- games: one entry per game, numbered in play order, ONLY for games whose position in the sequence is known from the description (e.g. "first game", "then", a list of scores, "the last game"). Fill result and scores only when stated. my_score is the speaker's side. partners: partner names for that game when stated, else [].
  If only totals are known ("won 4, lost 2"), games must be [] and order_known false. Never spread totals across games. If every game has the same result ("won both"), you may list each game.
  A score like "21-15" or "21比15" in a won game means my_score 21; in a lost game the larger number is their_score.
- totals: wins and losses, stated or counted from known results. A total that is not stated or derivable is null.
- order_known: true only if the result of every game is known in sequence.
- observations: technical or tactical reflections only (shots, movement, tactics, mistakes, an opponent's habits), not results or small talk. One item per distinct point, short, in the same language the speaker used for it, lightly cleaned up.
  category: "won_points" for strengths, things that worked or won points; "lost_points" for mistakes, weaknesses, things that cost points; "opponent" for an opponent's tendencies, strengths or weaknesses; "unsure" when the speaker is uncertain or it could go either way.
  area: one of ${AREAS.join(', ')} that best fits, "Other" if none fits, null for opponent observations. When the observation names where or which stroke, use it: 网前/net → Net (a mistake at the net is Net, not Footwork), 杀球/smash → Smash, 发球/serve → Serve, 接发/return → Return, 步法/footwork → Footwork, 防守/defence → Defence, 落点/clears/drops/length → Placement. Lifts under pressure count as Defence. about: the opponent's name for opponent observations, else null.
- missing: what a match log usually needs that the description does not give: ${MISSING.join(', ')}. Only include items that apply; if there was no match at all, include nothing about results.
- ambiguities: short English notes on anything unclear or contradictory, for example a player whose role is unclear or a partner switch without a name.

If the description has observations but no match results (a practice, drills, or just reflections), return match_type null, game_count null, games [], totals nulls, order_known false. Never add a placeholder game.`;

// USD per 1M tokens (input, output). Check current OpenAI pricing before relying on these.
export const PRICES = {
  'gpt-4.1-mini': [0.40, 1.60], 'gpt-4.1-nano': [0.10, 0.40], 'gpt-4.1': [2.00, 8.00],
  'gpt-4o-mini': [0.15, 0.60], 'gpt-5-mini': [0.25, 2.00], 'gpt-5-nano': [0.05, 0.40]
};
export function costOf(model, usage) {
  const p = PRICES[model]; if (!p || !usage) return null;
  return (usage.input_tokens * p[0] + usage.output_tokens * p[1]) / 1e6;
}

// ---- Minimal JSON-schema validator (the subset SCHEMA uses) ----
export function validate(v, s = SCHEMA, path = '$') {
  const errs = [];
  const types = [].concat(s.type || []);
  const kind = v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  if (types.length && !types.includes(kind)) return [`${path}: expected ${types.join('|')}, got ${kind}`];
  if (s.enum && !s.enum.includes(v)) errs.push(`${path}: ${JSON.stringify(v)} not allowed`);
  if (kind === 'object') {
    for (const k of s.required || []) if (!(k in v)) errs.push(`${path}.${k}: missing`);
    for (const k of Object.keys(v)) {
      if (!s.properties || !s.properties[k]) { if (s.additionalProperties === false) errs.push(`${path}.${k}: unexpected`); continue; }
      errs.push(...validate(v[k], s.properties[k], `${path}.${k}`));
    }
  }
  if (kind === 'array' && s.items) v.forEach((x, i) => errs.push(...validate(x, s.items, `${path}[${i}]`)));
  return errs;
}

// ---- Deterministic guards: remove anything the transcript cannot support ----
const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnToInt(s) {
  if (!/^[零〇一二两三四五六七八九十]+$/.test(s)) return null;
  if (!s.includes('十')) return s.length === 1 ? CN[s] : +[...s].map(c => CN[c]).join('');
  const [a, b] = s.split('十');
  return (a ? CN[a] : 1) * 10 + (b ? CN[b] : 0);
}
export function numbersIn(text) {
  const set = new Set();
  for (const m of text.matchAll(/\d+/g)) set.add(+m[0]);
  for (const m of text.matchAll(/[零〇一二两三四五六七八九十]+/g)) {
    const n = cnToInt(m[0]); if (n != null) set.add(n);
    for (const c of m[0]) if (CN[c] != null) set.add(CN[c]);
  }
  const words = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, 'twenty-one': 21, 'twenty one': 21 };
  for (const [w, n] of Object.entries(words)) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) set.add(n);
  return set;
}

// Words that name an area outright. If an observation names one and the model picked a different area,
// the named one wins (e.g. "网前失误比较多" is Net). Several named areas: the model's pick stands if it is one of them.
export const AREA_TERMS = [
  ['Return', /接发|\breturns?\b|\breceiv/i],
  ['Serve', /(?<!接)发球|\bserv(e|es|ing)\b/i],
  ['Net', /网前|放网|搓球|\bnet\b/i],
  ['Smash', /杀球|扣杀|\bsmash/i],
  ['Defence', /防守|接杀|\bdefen[cs]e|\bdefend/i],
  ['Footwork', /步法|脚步|\bfootwork\b/i],
  ['Placement', /落点|高远球|吊球|\bclears?\b|\bdrops?\b|\bplacement\b/i]
];
export function namedAreas(text) { return AREA_TERMS.filter(([, re]) => re.test(text)).map(([a]) => a); }
const GAME_WORDS = /\bgames?\b|\bsets?\b|\bmatch(es)?\b|局|盘|比赛|\d{1,2}\s*[-–:比]\s*\d{1,2}/i;
const NO_GAMES = /\bno (proper |real )?(games|matches)\b|\bdidn'?t play (any )?(games|matches)\b|没有比赛|没打比赛|没比赛|没打/i;

export function guard(out, transcript) {
  const notes = [];
  const lower = transcript.toLowerCase();
  const nums = numbersIn(transcript);
  // Players must be named in the transcript.
  out.players = out.players.filter(p => {
    const ok = p.name.trim() && lower.includes(p.name.trim().toLowerCase());
    if (!ok) notes.push(`dropped player not in transcript: ${p.name}`);
    return ok;
  });
  const named = new Set(out.players.map(p => p.name.toLowerCase()));
  // Games: sane numbering, scores that appear in the text, results consistent with scores.
  // A game entry with no result, score or partner says nothing; an empty session must not get a placeholder game.
  const before = out.games.length;
  out.games = out.games.filter(g => g.result || g.my_score != null || g.their_score != null || g.partners.length);
  if (out.games.length < before) notes.push(`dropped ${before - out.games.length} empty game entr${before - out.games.length === 1 ? 'y' : 'ies'}`);
  const noTotals = out.totals.wins == null && out.totals.losses == null;
  if (out.game_count != null && !out.games.length && noTotals && (!GAME_WORDS.test(transcript) || NO_GAMES.test(transcript))) {
    notes.push('cleared game_count with no games in transcript'); out.game_count = null;
  }
  const seen = new Set();
  out.games = out.games.filter(g => g.number >= 1 && g.number <= 50 && !seen.has(g.number) && seen.add(g.number)).sort((a, b) => a.number - b.number);
  for (const g of out.games) {
    if ((g.my_score != null) !== (g.their_score != null) || (g.my_score != null && (!nums.has(g.my_score) || !nums.has(g.their_score)))) {
      if (g.my_score != null || g.their_score != null) notes.push(`removed score not in transcript (game ${g.number})`);
      g.my_score = g.their_score = null;
    }
    if (g.my_score != null && g.my_score !== g.their_score) {
      const r = g.my_score > g.their_score ? 'win' : 'loss';
      if (g.result && g.result !== r) { [g.my_score, g.their_score] = [g.their_score, g.my_score]; notes.push(`swapped score to match result (game ${g.number})`); }
      else g.result = r;
    }
    g.partners = g.partners.filter(n => named.has(n.toLowerCase()));
  }
  if (out.game_count != null && out.games.length && out.games[out.games.length - 1].number > out.game_count) {
    notes.push('game_count raised to cover numbered games');
    out.game_count = out.games[out.games.length - 1].number;
  }
  // Totals agree with fully known games; never exceed the game count.
  const known = out.games.filter(g => g.result);
  if (out.game_count != null && known.length === out.game_count) {
    out.totals = { wins: known.filter(g => g.result === 'win').length, losses: known.filter(g => g.result === 'loss').length };
  }
  const t = out.totals;
  if (out.game_count != null && (t.wins || 0) + (t.losses || 0) > out.game_count) { notes.push('totals exceed game_count'); out.ambiguities.push({ field: 'results', note: 'Wins and losses add up to more than the number of games.' }); }
  out.order_known = out.game_count != null && out.game_count > 0 && out.games.length === out.game_count && out.games.every(g => g.result);
  out.observations = out.observations.filter(o => o.text.trim());
  for (const o of out.observations) {
    if (o.category === 'opponent') { o.area = null; continue; }
    const named = namedAreas(o.text);
    if (named.length && !named.includes(o.area)) { notes.push(`area ${o.area} -> ${named[0]} (named in text)`); o.area = named[0]; }
  }
  return notes;
}

function readOutput(data) {
  for (const item of data?.output || []) for (const part of item?.content || [])
    if (part?.type === 'output_text' && part.text) return part.text;
  return '';
}

// One model call. fetchImpl and apiKey come from the caller so the key never leaves the server.
export async function parseTranscript({ transcript, model = 'gpt-4.1-mini', apiKey, fetchImpl = fetch, timeoutMs = 25000 }) {
  const started = Date.now();
  const reasoning = /^(gpt-5|o\d)/.test(model);
  const body = {
    model, max_output_tokens: 2000,
    input: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: transcript }],
    text: { format: { type: 'json_schema', name: 'rallywise_voice_log', strict: true, schema: SCHEMA } },
    ...(reasoning ? { reasoning: { effort: 'minimal' } } : { temperature: 0 })
  };
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : 'network', latency_ms: Date.now() - started, model };
  } finally { clearTimeout(timer); }
  const latency_ms = Date.now() - started;
  if (!res.ok) return { ok: false, error: 'upstream', upstream_status: res.status, upstream_detail: (await res.text()).slice(0, 500), latency_ms, model };
  const data = await res.json();
  const usage = data.usage ? { input_tokens: data.usage.input_tokens || 0, output_tokens: data.usage.output_tokens || 0 } : null;
  const cost_usd = costOf(model, usage);
  let out;
  try { out = JSON.parse(readOutput(data)); } catch { return { ok: false, error: 'schema', schema_errors: ['output is not JSON'], latency_ms, usage, cost_usd, model }; }
  const schema_errors = validate(out);
  if (schema_errors.length) return { ok: false, error: 'schema', schema_errors: schema_errors.slice(0, 20), latency_ms, usage, cost_usd, model };
  const guards = guard(out, transcript);
  return { ok: true, result: out, guards, latency_ms, usage, cost_usd, model, prompt_version: PROMPT_VERSION };
}
