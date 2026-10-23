import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["keyInsight","buildNext","strengths","opponentPlans","doublesPlay"],
  properties: {
    keyInsight: { anyOf: [
      { type: "null" },
      { type: "object", additionalProperties: false, required: ["title","body","metric_id"], properties: {
        title: { type: "string" }, body: { type: "string" }, metric_id: { type: "string" }
      }}
    ]},
    buildNext: { type: "array", maxItems: 2, items: {
      type: "object", additionalProperties: false, required: ["name","evidence","action"], properties: {
        name:{type:"string"}, evidence:{type:"string"}, action:{type:"string"}
      }
    }},
    strengths: { type: "array", maxItems: 2, items: {
      type: "object", additionalProperties: false, required: ["name","signal","action"], properties: {
        name:{type:"string"}, signal:{type:"string"}, action:{type:"string"}
      }
    }},
    opponentPlans: { type: "array", maxItems: 2, items: {
      type: "object", additionalProperties: false, required: ["player_id","plan"], properties: {
        player_id:{type:"string"}, plan:{type:"string"}
      }
    }},
    doublesPlay: { type: "array", maxItems: 2, items: {
      type: "object", additionalProperties: false, required: ["name","pattern","label","action"], properties: {
        name:{type:"string"}, pattern:{type:"string"},
        label:{type:"string",enum:["Try Next","Keep Doing"]}, action:{type:"string"}
      }
    }}
  }
};

function resultOf(games:any[]) {
  let us=0, them=0;
  for (const g of games || []) g[0] > g[1] ? us++ : them++;
  return us > them ? "win" : "loss";
}
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

    const [{data:players,error:pe},{data:matches,error:me}] = await Promise.all([
      sb.from("players").select("id,name,level").order("created_at"),
      sb.from("matches").select("id,date,type,partner,opps,games,wt,lt,worked,lost,opp_notes,created_at")
        .order("date",{ascending:false}).order("created_at",{ascending:false}).limit(20)
    ]);
    if (pe || me) throw pe || me;

    const recent = (matches || []).slice(0,10);
    const INSIGHT_VERSION = "2026-10-15-v5";
    const fp = await hash(INSIGHT_VERSION + (lang === "zh" ? ":zh" : "") + JSON.stringify(recent.map((m:any)=>({
      id:m.id,date:m.date,type:m.type,partner:m.partner,opps:m.opps,games:m.games,wt:m.wt,lt:m.lt,
      worked:safe(m.worked),lost:safe(m.lost),opp_notes:safe(m.opp_notes)
    }))));

    const {data:cached} = await sb.from("ai_insights")
      .select("input_fingerprint,insight_json,generated_at").eq("user_id",uid).maybeSingle();
    if (cached?.input_fingerprint === fp)
      return Response.json({insight:cached.insight_json,generated_at:cached.generated_at,cached:true},{headers:CORS});
    if (!recent.length) return Response.json({insight:null,cached:false},{headers:CORS});

    const names:any = Object.fromEntries((players || []).map((p:any)=>[p.id,p.name]));
    const opponents:any = {};
    // "unknown:<heard name>" is a voice-logged opponent nobody identified: the match still counts everywhere else,
    // but it never becomes an opponent profile with notes or weaknesses.
    for (const m of recent) for (const pid of (m.opps || []).filter((p:string) => !String(p).startsWith("unknown:"))) {
      const o = opponents[pid] ||= {player_id:pid,name:names[pid] || "Opponent",wins:0,losses:0,notes:[],cost:{}};
      resultOf(m.games)==="win" ? o.wins++ : o.losses++;
      if (m.opp_notes) o.notes.push(safe(m.opp_notes));
      for (const t of (m.lt || [])) o.cost[t]=(o.cost[t]||0)+1;
    }
    const six = recent.slice(0,6);
    const doubles = recent.filter((m:any)=>m.type==="Doubles").slice(0,6);

    const newest = six.slice(0, Math.min(3, six.length));
    const older = six.slice(newest.length);
    const tagRate = (list:any[], field:string, tag:string) =>
      list.length ? Math.round(list.filter(m => (m[field] || []).includes(tag)).length / list.length * 100) : 0;
    const tags = [...new Set(six.flatMap((m:any) => [...(m.wt || []), ...(m.lt || [])]).filter((t:any) => t && t !== "Other"))];
    const key_metrics:any[] = [];
    if (older.length >= 2 && newest.length >= 2) {
      for (const tag of tags) {
        const goodNow = tagRate(newest,"wt",tag), goodBefore = tagRate(older,"wt",tag);
        const costNow = tagRate(newest,"lt",tag), costBefore = tagRate(older,"lt",tag);
        if (Math.abs(goodNow-goodBefore) >= 20) key_metrics.push({
          metric_id:"worked:" + tag, direction:"worked", tag,
          current_percent:goodNow, previous_percent:goodBefore,
          current_matches:newest.length, previous_matches:older.length
        });
        if (Math.abs(costNow-costBefore) >= 20) key_metrics.push({
          metric_id:"cost:" + tag, direction:"cost", tag,
          current_percent:costNow, previous_percent:costBefore,
          current_matches:newest.length, previous_matches:older.length
        });
      }
    }
    const facts = {
      summary:{
        recent_matches:recent.length,
        wins:recent.filter((m:any)=>resultOf(m.games)==="win").length,
        losses:recent.filter((m:any)=>resultOf(m.games)!=="win").length,
        singles:recent.filter((m:any)=>m.type==="Singles").length,
        doubles:recent.filter((m:any)=>m.type==="Doubles").length
      },
      patterns:{ cost_points:counts(six,"lt"), worked:counts(six,"wt") },
      key_metrics,
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
- Key Insight title: max 5 words and max 34 characters. Aim for one line; never exceed two lines on a 390px mobile screen.
- Key Insight body: max 16 words and max 90 characters. Aim for two short lines on a 390px mobile screen.
- Build Next evidence: max 12 words. Action: max 14 words.
- Strength evidence: max 12 words. Action: max 14 words.
- Opponent game plan: max 20 words.
- Doubles pattern/action: max 14 words each.

KEY INSIGHT:
- Make it a synthesized coaching insight, not a restatement of raw tags.
- Think of the card as: title = interpretation; body = quantitative evidence; chart = visualization of exactly that same evidence.
- For improving trends, the title should frame the progress positively (for example, "Returns are getting steadier") rather than leading with the remaining problem (for example, "Return errors remain costly"). The body can then acknowledge what still needs attention.
- If using the chart, choose exactly one metric_id from key_metrics.
- When metric_id is non-empty, the body MUST explicitly name what is being measured, include BOTH current_percent and previous_percent, and make the comparison window understandable when possible.
- The numbers in the body MUST exactly match the selected key_metrics entry. Never round them differently, substitute different values, or describe a different metric.
- Example: title "Your net game is getting stronger"; body "62% in your last 3 matches, up from 47% in the previous 3."
- Chinese example: title "网前正在变得更稳定"; body "最近3场网前发挥率62%，此前3场为47%。"
- If no key_metrics candidate genuinely supports a clear quantitative insight, set metric_id to "" and do not imply a numeric trend. In that case no chart will be shown.
- metric_id is internal metadata only. NEVER expose metric_id, field names, tag syntax, parentheses such as "(cost:Footwork)", or implementation language in visible copy.

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

OUTPUT LANGUAGE: write every visible string in ${lang === "zh" ? "natural Simplified Chinese" : "English"}. Keep JSON keys, metric_id, player_id and the doublesPlay label values ("Try Next" / "Keep Doing") exactly as specified.`

    const ai = await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"gpt-5-mini",
        input:[{role:"system",content:prompt},{role:"user",content:JSON.stringify(facts)}],
        text:{format:{type:"json_schema",name:"rallywise_grow",strict:true,schema}}
      })
    });
    if (!ai.ok) {
      const detail = await ai.text();
      console.error("OpenAI request failed", ai.status, detail.slice(0, 2000));
      return Response.json({error:"ai_failed",upstream_status:ai.status},{status:502,headers:CORS});
    }
    const parsed = JSON.parse(readOutput(await ai.json()));
    parsed.lang = lang;

    if (parsed.keyInsight) {
      const chosen = key_metrics.find((m:any) => m.metric_id === parsed.keyInsight.metric_id);
      if (chosen) {
        parsed.keyInsight.chart = {
          current_percent: chosen.current_percent,
          previous_percent: chosen.previous_percent
        };
      } else {
        parsed.keyInsight.metric_id = "";
      }
    }

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
