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
      { type: "object", additionalProperties: false, required: ["title","body"], properties: {
        title: { type: "string" }, body: { type: "string" }
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
    const fp = await hash(JSON.stringify(recent.map((m:any)=>({
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
    const facts = {
      summary:{
        recent_matches:recent.length,
        wins:recent.filter((m:any)=>resultOf(m.games)==="win").length,
        losses:recent.filter((m:any)=>resultOf(m.games)!=="win").length,
        singles:recent.filter((m:any)=>m.type==="Singles").length,
        doubles:recent.filter((m:any)=>m.type==="Doubles").length
      },
      patterns:{ cost_points:counts(six,"lt"), worked:counts(six,"wt") },
      notes:recent.flatMap((m:any)=>[
        m.worked?{kind:"worked",text:safe(m.worked)}:null,
        m.lost?{kind:"cost_points",text:safe(m.lost)}:null
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
Numbers are already computed; do not recalculate or contradict them.
Treat notes as observations, not objective facts. Find recurring themes across tags and free text, including Other.
Prefer fewer strong insights over filler. Recommendations must be short, specific, and actionable.
Do not copy a note verbatim as a recommendation. If evidence is weak, return null/empty for that section.
Key Insight: one most important recent pattern.
Build Next: max 2, each with evidence and a Try Next action.
Strengths: max 2, only recurring positive evidence and a Keep Doing action.
Opponent Plans: max 2, use only supplied player_id values and turn observations into a game plan.
Doubles Play: max 2, only with doubles evidence.
Do not mention AI. Keep copy compact for mobile cards.`;

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
