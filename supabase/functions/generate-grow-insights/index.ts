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

    const [{data:players,error:pe},{data:matches,error:me}] = await Promise.all([
      sb.from("players").select("id,name,level").order("created_at"),
      sb.from("matches").select("id,date,type,partner,opps,games,wt,lt,worked,lost,opp_notes,created_at")
        .order("date",{ascending:false}).order("created_at",{ascending:false}).limit(20)
    ]);
    if (pe || me) throw pe || me;

    const recent = (matches || []).slice(0,10);
    const INSIGHT_VERSION = "2026-10-15-v2";
    const fp = await hash(INSIGHT_VERSION + JSON.stringify(recent.map((m:any)=>({
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
    for (const m of recent) for (const pid of (m.opps || [])) {
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

COPY LENGTH — hard limits:
- Key Insight title: max 7 words.
- Key Insight body: max 22 words, ideally 1-2 short lines on mobile.
- Build Next evidence: max 14 words. Action: max 18 words.
- Strength evidence: max 14 words. Action: max 18 words.
- Opponent game plan: max 24 words.
- Doubles pattern/action: max 18 words each.

KEY INSIGHT:
- Make it a synthesized insight, not a restatement of raw tags.
- If using the chart, choose exactly one metric_id from key_metrics and make the body explicitly explain that comparison.
- If no key_metrics candidate genuinely supports the insight, set metric_id to "" and do not imply a numeric trend.

BUILD NEXT / STRENGTHS:
- Evidence must explain WHY the card exists using compact data language.
- Prefer forms like "Cost points in 4 of your last 6 tagged matches." or "Worked in 3 of your last 5 wins."
- Never quote a player note directly in evidence and never prefix with "Player note:".
- Free-text notes may influence the recommendation, but the displayed evidence should be synthesized and concise.
- Recommendations must be one concrete action, not a drill paragraph and not multiple clauses.

OPPONENT PLANS:
- Return only the plan text. Never start with the opponent's name, a colon, or "Against [name]".
- Convert observations into one concise tactical instruction.

Do not mention AI. Keep every card scannable on a phone.`

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
