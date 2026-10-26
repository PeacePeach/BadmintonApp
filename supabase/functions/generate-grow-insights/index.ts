import { createClient } from "npm:@supabase/supabase-js@2";
// Engine V2: candidates, chart data, ranking, validation and template copy (shared with tests/grow-insights.test.mjs).
import * as G from "../_shared/grow-insights-core.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// "win" | "loss" | "even" | null. Games saved without a score ({ r: "W" }) count by their result (they used to read as losses).
const resultOf = (games:any[]) => G.matchResult({ games });
function counts(matches:any[], field:string) {
  const c:any = {};
  for (const m of matches) for (const t of (m[field] || [])) c[t] = (c[t] || 0) + 1;
  return Object.entries(c).sort((a:any,b:any)=>b[1]-a[1]).map(([tag,count])=>({tag,count}));
}
function safe(v:any,n=500){ return String(v || "").trim().slice(0,n); }
async function hash(s:string){
  const x = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(x)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function readOutput(data:any){
  for (const item of data?.output || []) for (const part of item?.content || [])
    if (part?.type === "output_text" && part.text) return part.text;
  return "";
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:CORS});
  // Where the time goes (returned as timing and logged): auth + the 4 reads, the model call, the cache write.
  const t0 = Date.now(), timing:any = {};
  const done = (body:any) => { timing.total_ms = Date.now() - t0; console.log("grow timing", JSON.stringify({ ...timing, cached: !!body.cached, ai_status: body.insight?.ai_status || null })); return Response.json({ ...body, timing }, { headers: CORS }); };
  try {
    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global:{ headers:{ Authorization:auth } }
    });
    // App language. Insights are written in it, and it is part of the cache fingerprint, so a cached insight
    // is only ever returned in the language it was written in. English keeps the fingerprint it had before.
    const reqBody = await req.json().catch(() => ({}));
    const lang = reqBody && reqBody.lang === "zh" ? "zh" : "en";
    // The app's own signature of the data it showed this insight for (stored with it, so another device can tell
    // the row is current without asking again).
    const clientSig = typeof reqBody?.sig === "string" ? reqBody.sig.slice(0, 64) : null;
    // The released app (main) sends no lang and draws any truthy keyInsight as a tile with its title and an
    // old-style percent bar from chart.current_percent. For it, the Key Insight is only { title, body } when there
    // is one, else null (no empty tile, no NaN bar). What is stored is always the full insight.
    const legacy = !reqBody || !("lang" in reqBody);
    const out = (full:any) => { if (!full) return full; const { ai_copy, ...insight } = full; return !legacy ? insight
      : { ...insight, keyInsight: insight.keyInsight?.status === "ok" && insight.keyInsight.title ? { title: insight.keyInsight.title, body: insight.keyInsight.body } : null }; };

    // Focus rows (select * so topic_id is read once its column exists); a missing Focus table just means no Focus.
    // The user check runs alongside the reads (one round trip, not two): every table is owner-only under RLS, so the
    // reads only ever return this user's rows, and nothing is used or written unless the check passes.
    const [{data:u},{data:players,error:pe},{data:matches,error:me},{data:focusRows},{data:cached}] = await Promise.all([
      sb.auth.getUser(),
      sb.from("players").select("id,name,level").order("created_at"),
      sb.from("matches").select("id,date,type,partner,opps,games,wt,lt,worked,lost,opp_notes,created_at")
        .order("date",{ascending:false}).order("created_at",{ascending:false}).limit(20),
      sb.from("focus_items").select("*"),
      sb.from("ai_insights").select("input_fingerprint,insight_json,generated_at").maybeSingle()
    ]);
    timing.db_ms = Date.now() - t0;
    if (!u?.user) return Response.json({error:"unauthorized"},{status:401,headers:CORS});
    const uid = u.user.id;
    if (pe || me) throw pe || me;

    // v13: Build Next, Strengths, opponent plans and Doubles Play read all the fetched history (20 matches); the Key
    // Insight keeps its own 10-match window inside the engine (normalize), so its trend standards are unchanged.
    const recent = matches || [];
    // One ai_insights row per user holds the latest insight at the top level (what older app versions read) and the
    // other language's latest under other_lang, so switching EN <-> ZH and back is served from cache instead of
    // overwriting the other language and paying for it again.
    const slots:any[] = [];
    if (cached?.insight_json) {
      const { other_lang, ...top } = cached.insight_json;
      slots.push({ lang: top.lang || "en", fp: cached.input_fingerprint, insight: top, generated_at: cached.generated_at });
      if (other_lang?.insight) slots.push(other_lang);
    }
    // previous: the last insight in this language (its Key Insight is ranked down as "same as last time"; never the
    // other language's, or EN and ZH could lead with different insights for the same matches). Focus topics may come
    // from either.
    const previous:any = slots.find(x => x.lang === lang)?.insight || null, anyPrevious:any = previous || slots[0]?.insight || null;
    // Every Focus as a topic, so Build Next can leave out active topics and bring back completed ones on new evidence.
    const names:any = Object.fromEntries((players || []).map((p:any)=>[p.id,p.name]));
    const focus = (focusRows || []).map((f:any) => ({ topic: G.focusTopic(f, anyPrevious), status: f.status, completed_at: f.completed_at }));
    const INSIGHT_VERSION = G.ENGINE_VERSION;
    const matchJson = JSON.stringify(recent.map((m:any)=>({
      id:m.id,date:m.date,type:m.type,partner:m.partner,opps:m.opps,games:m.games,wt:m.wt,lt:m.lt,
      worked:safe(m.worked),lost:safe(m.lost),opp_notes:safe(m.opp_notes)
    })));
    const fp = await hash(INSIGHT_VERSION + (lang === "zh" ? ":zh" : "") + matchJson + JSON.stringify(focus.map((f:any) => [f.topic, f.status, f.completed_at]).sort())
      // Opponent notes are given to the player they name, so a renamed player is new input.
      + JSON.stringify((players || []).map((p:any) => [p.id, p.name]).sort()));

    const hit = slots.find(x => x.fp === fp);
    if (hit) return done({insight:out(hit.insight),generated_at:hit.generated_at,cached:true});
    if (!recent.length) return done({insight:null,cached:false});

    // Opponents the player wrote notes about, with only those notes (no record: it says nothing about how they play).
    const oppDiag = { matches_with_notes:0, unknown_opponent:0, names_no_opponent:0 };
    const opponents = G.opponentFacts(recent, names, oppDiag);
    const six = recent.slice(0,6);
    const doubles = G.doublesFacts(recent);

    // Engine V2 evidence: everything numeric is decided here; the model only picks and words it.
    // Engine v14: P1 score trend -> P2 repeated pattern -> P3 early observation, from the same evidence as the sections
    // below. All are kept for finalizeKey (and the report); the model sees the best 3.
    // "Same as last time" (the novelty rule) means the Key Insight shown for the previous matches: when only a Focus
    // or a name changed, the matches are the same, so the ranking keeps the input it had and the Key Insight doesn't
    // flip to another candidate just because a Focus was added.
    const matchesFp = (await hash(matchJson)).slice(0, 16);
    const prevKeyId = previous?.basis?.matches_fp === matchesFp ? previous.basis.prev_key_id : previous?.keyInsight?.candidate_id;
    const keyAll = G.keyCandidates(recent, prevKeyId, { focus, names }), keyCands = keyAll.slice(0,3);
    const buildCands = G.buildCandidates(recent, focus, 4);
    const strengthCands = G.strengthCandidates(recent, 3);
    const facts = {
      summary:{
        recent_matches:recent.length,
        wins:recent.filter((m:any)=>resultOf(m.games)==="win").length,
        losses:recent.filter((m:any)=>resultOf(m.games)==="loss").length,
        singles:recent.filter((m:any)=>m.type==="Singles").length,
        doubles:recent.filter((m:any)=>m.type==="Doubles").length
      },
      patterns:{ cost_points:counts(six,"lt"), worked:counts(six,"wt") },
      key_candidates:keyCands.map((c:any)=>G.candidateFacts(c, lang)),
      build_candidates:buildCands.map((b:any)=>({topic_id:b.topic_id,tag:b.tag,level:b.level,k:b.k,n:b.n,mixed:b.mixed,...(b.mixed?{w:b.w}:{}),returning:b.returning,notes:b.notes,advice_basis:b.basis})),
      strength_candidates:strengthCands.map((b:any)=>({topic_id:b.topic_id,tag:b.tag,level:b.level,k:b.k,n:b.n,notes:b.notes,advice_basis:b.basis})),
      opponents,
      doubles
    };

    // The model only words what the engine found. With nothing to word, there is no call; when the call fails (or no
    // key is set) every section still comes back from the engine with its template copy, and opponent plans and
    // Doubles Play, which only the model writes, stay empty. A failed call is not cached, so the next visit retries.
    const key = Deno.env.get("OPENAI_API_KEY");
    const needsAI = keyCands.length || buildCands.length || strengthCands.length || opponents.length || doubles;
    let aiStatus = needsAI ? (key ? "ok" : "not_configured") : "skipped";

    const prompt = `You are Rallywise's badminton insight writer.
Use only supplied verified facts and player notes. Never invent scores, counts, trends, opponents, or events.
Numbers are already computed; do not recalculate or contradict them. Treat notes as observations, not objective facts.
Skill Tags are the player's own notes, once per match: they say a skill was mentioned, never how many mistakes or points.
Each candidate carries the notes from its own matches; use those, not notes from other matches. Prefer fewer strong insights over filler, and leave a section empty rather than pad it.

VOICE AND TONE:
- Write like a thoughtful badminton coach who noticed something useful, not like a dashboard, analyst, or performance report.
- Be natural, concise, supportive, and encouraging while staying grounded in evidence.
- Encourage progress without generic praise. Never invent improvement or compliment the player unless the facts support it.
- When something is improving, acknowledge the progress naturally: "This is starting to pay off", "You're getting more consistent here", or equivalent.
- When a metric is improving, lead the headline with the progress first, then mention the remaining opportunity if needed. Avoid negative-first headlines for positive trends.
- When something needs work, be constructive rather than judgmental. Prefer "still costing you points", "worth focusing on next", or "could be steadier" over "weak", "poor", "bad", or "failing".
- Lead with the useful interpretation, not the raw statistic. Use statistics as evidence, not as the voice of the sentence.
- Recommendations should sound like practical coaching: one clear thing to try next, in human language.
- Avoid corporate/analytics phrasing such as "data indicates", "statistically", "metric", "rate increased/decreased", "according to your records", or implementation language.
- Do not overstate conclusions. Use measured language such as "looks more stable lately", "is starting to improve", or "still seems inconsistent" when appropriate.
- For Chinese output, write natural modern Simplified Chinese used by badminton players, not literal translations or formal report language. Avoid stiff phrases such as "数据显示", "表现有所提升", "值得优先改善", "执行该策略", or "保持此行为".
- For English output, avoid KPI/dashboard language. It should read like a smart coach giving a quick observation after a few matches.
- Do not add encouragement to every sentence; keep it subtle and credible.

COPY LENGTH — hard limits:
- Key Insight: see KEY INSIGHT below (title 2 lines, body 3 lines on the card).
- Build Next evidence: max 12 words. Action: max 14 words.
- Strength evidence: max 12 words. Action: max 14 words.
- Opponent game plan: max 20 words.
- Doubles pattern/action: max 14 words each.

${G.KEY_RULES}

BUILD NEXT / STRENGTHS:
- Evidence must explain WHY the card exists, but phrase it conversationally rather than like a report.
- Never quote a player note directly in evidence and never prefix with "Player note:".
- Recommendations must be one concrete action, not a drill paragraph and not multiple clauses.
- Strengths should acknowledge what is working without exaggerating it.
${G.ITEM_RULES}

${G.OPPONENT_RULES}

${G.DOUBLES_RULES}

Do not mention AI. Keep every card scannable on a phone.

OUTPUT LANGUAGE: write every visible string in ${lang === "zh" ? "natural Simplified Chinese" : "English"}. Keep JSON keys, candidate_id, topic_id, player_id and the doublesPlay label values ("Try Next" / "Keep Doing") exactly as specified.`

    // Copy reuse: each card's model copy is stored with the facts it was written from (ai_copy). When new data leaves a
    // card's facts unchanged (a Focus added, one match edited), its copy is reused and only the cards whose facts
    // changed go to the model, in one smaller call; with none, there is no call. Reused copy goes through the same
    // checks below as new copy. Same language and same engine only.
    const ck = async (x:any) => (await hash(lang + JSON.stringify(x))).slice(0, 16);
    const prevCopy = previous?.engine_version === G.ENGINE_VERSION && previous?.ai_copy || null;
    const copy:any = { key:null, build:{}, strengths:{}, opps:{}, doubles:null };
    const keyCk = await ck(facts.key_candidates), doublesCk = await ck(doubles);
    const reuse:any = { key: keyCands.length && prevCopy?.key?.ck === keyCk ? prevCopy.key : null, build:[], strengths:[], opps:[], doubles: doubles && prevCopy?.doubles?.ck === doublesCk ? prevCopy.doubles : null };
    const need:any = { key: !!keyCands.length && !reuse.key, build:[], strengths:[], opps:[], doubles: !!doubles && !reuse.doubles };
    for (const [list, kind, id] of [[facts.build_candidates, "build", "topic_id"], [facts.strength_candidates, "strengths", "topic_id"], [opponents, "opps", "player_id"]] as any[])
      for (const f of list) {
        const c = await ck(f), p = prevCopy?.[kind]?.[f[id]];
        copy[kind][f[id]] = { ck: c, v: null };
        if (p?.ck === c) { reuse[kind].push(p.v); copy[kind][f[id]].v = p.v; } else need[kind].push(f);
      }
    copy.key = { ck: keyCk, v: reuse.key?.v || null }; copy.doubles = { ck: doublesCk, v: reuse.doubles?.v || null };
    const asks = (need.key ? 1 : 0) + need.build.length + need.strengths.length + need.opps.length + (need.doubles ? 1 : 0);
    if (aiStatus === "ok" && !asks) aiStatus = "reused";
    timing.reused = { key: !!reuse.key, items: reuse.build.length + reuse.strengths.length + reuse.opps.length, doubles: !!reuse.doubles };
    timing.asked = { key: need.key, items: need.build.length + need.strengths.length + need.opps.length, doubles: need.doubles };

    const empty = () => ({ keyInsight:null, buildNext:[], strengths:[], opponentPlans:[], doublesPlay:[] });
    let parsed:any = empty();
    if (aiStatus === "ok") {
      const ask = { ...facts, key_candidates: need.key ? facts.key_candidates : [], build_candidates: need.build, strength_candidates: need.strengths, opponents: need.opps, doubles: need.doubles ? doubles : null };
      const schema:any = G.modelSchema(need.key ? keyCands.map((c:any)=>c.id) : [], need.build.map((b:any)=>b.topic_id), need.strengths.map((b:any)=>b.topic_id), need.opps.map((o:any)=>o.player_id));
      if (!need.key) schema.properties.keyInsight = { type:"null" };
      schema.properties.buildNext.maxItems = need.build.length; schema.properties.strengths.maxItems = need.strengths.length;
      if (!need.doubles) schema.properties.doublesPlay.maxItems = 0;
      const ta = Date.now();
      try {
        // A model call that hangs must not hold Grow on "Looking at your matches…": after 40s it counts as failed
        // (engine sections with template copy, not cached, retried on the next visit).
        const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), Number(Deno.env.get("GROW_AI_TIMEOUT_MS")) || 40000);
        const ai = await fetch("https://api.openai.com/v1/responses",{
          method:"POST", signal:ctl.signal,
          headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
          body:JSON.stringify({
            model:"gpt-5-mini",
            input:[{role:"system",content:prompt},{role:"user",content:JSON.stringify(ask)}],
            text:{format:{type:"json_schema",name:"rallywise_grow",strict:true, schema}}
          })
        });
        clearTimeout(timer);
        if (!ai.ok) {
          const detail = await ai.text();
          console.error("OpenAI request failed", ai.status, detail.slice(0, 2000));
          aiStatus = "failed";
        } else parsed = JSON.parse(readOutput(await ai.json()));
      } catch (e) {
        console.error("OpenAI answer unusable", e);
        aiStatus = "failed"; parsed = empty();
      }
      timing.ai_ms = Date.now() - ta;
      // What the model wrote now is stored with the facts it was written from (null where it wrote nothing: the
      // same facts get the same template next time instead of another call).
      if (need.key) copy.key.v = parsed.keyInsight || null;
      for (const [kind, arr, id] of [["build", parsed.buildNext, "topic_id"], ["strengths", parsed.strengths, "topic_id"], ["opps", parsed.opponentPlans, "player_id"]] as any[])
        for (const x of arr || []) if (x && copy[kind][x[id]] && !copy[kind][x[id]].v) copy[kind][x[id]].v = x;
      if (need.doubles) copy.doubles.v = parsed.doublesPlay || [];
    }
    // Reused copy joins what the model wrote now (also when the call failed: those cards keep their copy).
    if (reuse.key) parsed.keyInsight = reuse.key.v;
    parsed.buildNext = [...reuse.build.filter(Boolean), ...(parsed.buildNext || [])];
    parsed.strengths = [...reuse.strengths.filter(Boolean), ...(parsed.strengths || [])];
    parsed.opponentPlans = [...reuse.opps.filter(Boolean), ...(parsed.opponentPlans || [])];
    if (reuse.doubles) parsed.doublesPlay = reuse.doubles.v || [];
    parsed.lang = lang;
    parsed.ai_status = aiStatus;

    parsed.engine_version = G.ENGINE_VERSION;
    // The engine's evidence decides the chart; the AI copy is kept only if it passes the checks, else the template.
    parsed.keyInsight = G.finalizeKey(keyAll, parsed.keyInsight, lang, recent);
    parsed.buildNext = G.finalizeItems(buildCands, parsed.buildNext, "build", lang);
    parsed.strengths = G.finalizeItems(strengthCands, parsed.strengths, "strength", lang);
    const failed = [parsed.keyInsight, ...parsed.buildNext, ...parsed.strengths].filter((x:any) => x.copy_source && x.copy_source !== "ai");
    if (failed.length) console.warn("grow copy replaced", JSON.stringify(failed.map((x:any) => [x.candidate_id || x.topic_id, x.validation?.ai_issues || x.issues])));

    // Opponent plans and Doubles Play are checked against the notes they came from. A plan that fails falls back to
    // the player's own note (when it says something specific); Doubles Play falls back to the noted doubles tags.
    const plans = G.finalizeOpponents(parsed.opponentPlans, opponents, lang);
    const droppedPlans = plans.filter((p:any) => p.dropped || p.issues);
    if (droppedPlans.length) console.warn("opponent plans replaced or dropped", JSON.stringify(droppedPlans));
    parsed.opponentPlans = plans.filter((p:any) => !p.dropped);
    parsed.doublesPlay = G.finalizeDoubles(parsed.doublesPlay, doubles, lang);
    // Engine v14 invariant: a section with cards means the Key Insight had a candidate.
    if (parsed.keyInsight.status !== "ok" && (parsed.buildNext.length || parsed.strengths.length || parsed.opponentPlans.length || parsed.doublesPlay.length))
      console.error("key insight empty while sections have cards", JSON.stringify(parsed.keyInsight));
    parsed.coverage = G.coverage(recent, { build:parsed.buildNext, strengths:parsed.strengths, opps:opponents, plans, doubles, doublesPlay:parsed.doublesPlay, keyInsight:parsed.keyInsight, oppDiag });

    if (aiStatus === "ok" || aiStatus === "reused") parsed.ai_copy = copy;
    if (clientSig) parsed.client_sig = clientSig;
    parsed.basis = { matches_fp: matchesFp, prev_key_id: prevKeyId || null };
    const generated_at = new Date().toISOString();
    if (aiStatus !== "failed") {
      const tw = Date.now();
      const other = slots.find(x => x.lang !== lang);
      const {error:ce} = await sb.from("ai_insights").upsert({
        user_id:uid,input_fingerprint:fp,insight_json:{ ...parsed, ...(other ? { other_lang:other } : {}) },generated_at
      },{onConflict:"user_id"});
      timing.write_ms = Date.now() - tw;
      if (ce) throw ce;
    }

    return done({insight:out(parsed),generated_at,cached:false});
  } catch (e) {
    console.error(e);
    return Response.json({error:"server_error"},{status:500,headers:CORS});
  }
});
