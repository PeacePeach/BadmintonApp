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
  try {
    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global:{ headers:{ Authorization:auth } }
    });
    const { data:u } = await sb.auth.getUser();
    if (!u.user) return Response.json({error:"unauthorized"},{status:401,headers:CORS});
    const uid = u.user.id;
    // App language. Insights are written in it, and it is part of the cache fingerprint, so a cached insight
    // is only ever returned in the language it was written in. English keeps the fingerprint it had before.
    const reqBody = await req.json().catch(() => ({}));
    const lang = reqBody && reqBody.lang === "zh" ? "zh" : "en";

    // Focus rows (select * so topic_id is read once its column exists); a missing Focus table just means no Focus.
    const [{data:players,error:pe},{data:matches,error:me},{data:focusRows},{data:cached}] = await Promise.all([
      sb.from("players").select("id,name,level").order("created_at"),
      sb.from("matches").select("id,date,type,partner,opps,games,wt,lt,worked,lost,opp_notes,created_at")
        .order("date",{ascending:false}).order("created_at",{ascending:false}).limit(20),
      sb.from("focus_items").select("*"),
      sb.from("ai_insights").select("input_fingerprint,insight_json,generated_at").eq("user_id",uid).maybeSingle()
    ]);
    if (pe || me) throw pe || me;

    const recent = (matches || []).slice(0,10);
    const previous:any = cached?.insight_json || null;
    // Every Focus as a topic, so Build Next can leave out active topics and bring back completed ones on new evidence.
    const focus = (focusRows || []).map((f:any) => ({ topic: G.focusTopic(f, previous), status: f.status, completed_at: f.completed_at }));
    const INSIGHT_VERSION = G.ENGINE_VERSION;
    const fp = await hash(INSIGHT_VERSION + (lang === "zh" ? ":zh" : "") + JSON.stringify(recent.map((m:any)=>({
      id:m.id,date:m.date,type:m.type,partner:m.partner,opps:m.opps,games:m.games,wt:m.wt,lt:m.lt,
      worked:safe(m.worked),lost:safe(m.lost),opp_notes:safe(m.opp_notes)
    }))) + JSON.stringify(focus.map((f:any) => [f.topic, f.status, f.completed_at]).sort()));

    if (cached?.input_fingerprint === fp)
      return Response.json({insight:cached.insight_json,generated_at:cached.generated_at,cached:true},{headers:CORS});
    if (!recent.length) return Response.json({insight:null,cached:false},{headers:CORS});

    const names:any = Object.fromEntries((players || []).map((p:any)=>[p.id,p.name]));
    const opponents:any = {};
    // "unknown:<heard name>" is a voice-logged opponent nobody identified: the match still counts everywhere else,
    // but it never becomes an opponent profile with notes or weaknesses.
    for (const m of recent) for (const pid of (m.opps || []).filter((p:string) => !String(p).startsWith("unknown:"))) {
      const o = opponents[pid] ||= {player_id:pid,name:names[pid] || "Opponent",wins:0,losses:0,notes:[],cost:{}};
      const r = resultOf(m.games); if (r === "win") o.wins++; else if (r === "loss") o.losses++;
      if (m.opp_notes) o.notes.push(safe(m.opp_notes));
      for (const t of (m.lt || [])) o.cost[t]=(o.cost[t]||0)+1;
    }
    const six = recent.slice(0,6);
    const doubles = recent.filter((m:any)=>m.type==="Doubles").slice(0,6);

    // Engine V2 evidence: everything numeric is decided here; the model only picks and words it.
    const keyCands = G.keyCandidates(recent, previous?.keyInsight?.candidate_id).slice(0,3);
    const buildCands = G.buildCandidates(recent, focus, 4);
    const strengthCands = G.strengthCandidates(recent, 2);
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
      build_candidates:buildCands.map((b:any)=>({topic_id:b.topic_id,tag:b.tag,k:b.k,n:b.n,returning:b.returning})),
      strength_candidates:strengthCands.map((b:any)=>({topic_id:b.topic_id,tag:b.tag,k:b.k,n:b.n})),
      notes:recent.flatMap((m:any)=>[
        m.worked?{match_id:m.id,kind:"worked",text:safe(m.worked)}:null,
        m.lost?{match_id:m.id,kind:"cost_points",text:safe(m.lost)}:null
      ]).filter(Boolean).slice(0,12),
      opponents:Object.values(opponents).map((o:any)=>({
        player_id:o.player_id,name:o.name,record:{wins:o.wins,losses:o.losses},
        notes:o.notes.slice(0,4),
        cost_points:Object.entries(o.cost).sort((a:any,b:any)=>b[1]-a[1]).slice(0,4).map(([tag,count])=>({tag,count}))
      })).filter((o:any)=>o.notes.length || o.record.wins+o.record.losses>=2).slice(0,5),
      doubles:{
        matches:doubles.length,cost_points:counts(doubles,"lt"),strengths:counts(doubles,"wt"),
        notes:doubles.flatMap((m:any)=>[
          m.worked?{kind:"worked",text:safe(m.worked)}:null,
          m.lost?{kind:"cost_points",text:safe(m.lost)}:null
        ]).filter(Boolean).slice(0,8)
      }
    };

    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return Response.json({error:"ai_not_configured"},{status:503,headers:CORS});

    const prompt = `You are Rallywise's badminton insight writer.
Use only supplied verified facts and player notes. Never invent scores, counts, trends, opponents, or events.
Numbers are already computed; do not recalculate or contradict them. Treat notes as observations, not objective facts.
Skill Tags are the player's own notes, once per match: they say a skill was mentioned, never how many mistakes or points.
Find recurring themes across tags and free text, including Other. Prefer fewer strong insights over filler.

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
- Key Insight: see KEY INSIGHT below (title max 7 words / 14 Chinese characters; body max 25 words / 40 Chinese characters).
- Build Next evidence: max 12 words. Action: max 14 words.
- Strength evidence: max 12 words. Action: max 14 words.
- Opponent game plan: max 20 words.
- Doubles pattern/action: max 14 words each.

${G.KEY_RULES}

BUILD NEXT / STRENGTHS:
- Evidence must explain WHY the card exists, but phrase it conversationally rather than like a report.
- Prefer human coaching language such as "Movement has still been costing you points lately" over "Cost points in 4 of your last 6 tagged matches."
- Never quote a player note directly in evidence and never prefix with "Player note:".
- Free-text notes may influence the recommendation, but the displayed evidence should be synthesized and concise.
- Recommendations must be one concrete action, not a drill paragraph and not multiple clauses.
- Strengths should acknowledge what is working without exaggerating it.

OPPONENT PLANS:
- Return only the plan text. Never start with the opponent's name, a colon, or "Against [name]".
- Convert observations into one concise tactical instruction that sounds like advice from a coach.

DOUBLES PLAY:
- Describe the pattern naturally, then give one practical adjustment or habit to keep.
- Avoid mechanical labels or report-style wording.

Do not mention AI. Keep every card scannable on a phone.

OUTPUT LANGUAGE: write every visible string in ${lang === "zh" ? "natural Simplified Chinese" : "English"}. Keep JSON keys, candidate_id, topic_id, player_id and the doublesPlay label values ("Try Next" / "Keep Doing") exactly as specified.`

    const ai = await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"gpt-5-mini",
        input:[{role:"system",content:prompt},{role:"user",content:JSON.stringify(facts)}],
        text:{format:{type:"json_schema",name:"rallywise_grow",strict:true,
          schema:G.modelSchema(keyCands.map((c:any)=>c.id), buildCands.map((b:any)=>b.topic_id), strengthCands.map((b:any)=>b.topic_id))}}
      })
    });
    if (!ai.ok) {
      const detail = await ai.text();
      console.error("OpenAI request failed", ai.status, detail.slice(0, 2000));
      return Response.json({error:"ai_failed",upstream_status:ai.status},{status:502,headers:CORS});
    }
    const parsed = JSON.parse(readOutput(await ai.json()));
    parsed.lang = lang;

    parsed.engine_version = G.ENGINE_VERSION;
    // The engine's evidence decides the chart; the AI copy is kept only if it passes the checks, else the template.
    parsed.keyInsight = G.finalizeKey(keyCands, parsed.keyInsight, lang);
    parsed.buildNext = G.finalizeItems(buildCands, parsed.buildNext, "build", lang);
    parsed.strengths = G.finalizeItems(strengthCands, parsed.strengths, "strength", lang);
    const failed = [parsed.keyInsight, ...parsed.buildNext, ...parsed.strengths].filter((x:any) => x.copy_source && x.copy_source !== "ai");
    if (failed.length) console.warn("grow copy replaced", JSON.stringify(failed.map((x:any) => [x.candidate_id || x.topic_id, x.validation?.ai_issues || x.issues])));

    parsed.opponentPlans = (parsed.opponentPlans || []).map((p:any) => {
      const o:any = Object.values(opponents).find((x:any) => x.player_id === p.player_id);
      const name = String(o?.name || "").trim();
      let plan = String(p.plan || "").trim();
      if (name) {
        const lower = plan.toLowerCase();
        const prefix1 = (name + ":").toLowerCase();
        const prefix2 = ("against " + name + ":").toLowerCase();
        if (lower.startsWith(prefix1)) plan = plan.slice(prefix1.length).trim();
        else if (lower.startsWith(prefix2)) plan = plan.slice(prefix2.length).trim();
      }
      return { ...p, plan };
    });

    const {error:ce} = await sb.from("ai_insights").upsert({
      user_id:uid,input_fingerprint:fp,insight_json:parsed,generated_at:new Date().toISOString()
    },{onConflict:"user_id"});
    if (ce) throw ce;

    return Response.json({insight:parsed,cached:false},{headers:CORS});
  } catch (e) {
    console.error(e);
    return Response.json({error:"server_error"},{status:500,headers:CORS});
  }
});
