// Voice match logging prototype: transcript in, validated match JSON out.
// Reads nothing from and writes nothing to the match tables. Transcripts are never logged.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseTranscript, PROMPT_VERSION } from "../_shared/voice-parse-core.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const MAX_BODY = 16_000;          // bytes
const MAX_TRANSCRIPT = 3_000;     // characters
const PER_USER = { limit: 20, windowMs: 10 * 60_000 };
const PER_INSTANCE = { limit: 300, windowMs: 10 * 60_000 };
const DEFAULT_MODEL = Deno.env.get("VOICE_PARSE_MODEL") || "gpt-4.1-mini";
const ALLOWED = (Deno.env.get("VOICE_PARSE_MODELS") || "gpt-4.1-mini,gpt-4.1-nano,gpt-5-mini").split(",").map(s => s.trim());

// Best-effort limits kept in this instance's memory; enough to stop a runaway loop in a prototype.
const hits = new Map<string, number[]>();
function limited(key: string, rule: { limit: number; windowMs: number }) {
  const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < rule.windowMs);
  if (list.length >= rule.limit) { hits.set(key, list); return true; }
  list.push(now); hits.set(key, list); return false;
}
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return reply({ error: "too_large" }, 413);
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } }
    });
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return reply({ error: "unauthorized" }, 401);

    const raw = await req.text();
    if (raw.length > MAX_BODY) return reply({ error: "too_large" }, 413);
    let body: any; try { body = JSON.parse(raw); } catch { return reply({ error: "bad_request" }, 400); }
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
    if (!transcript) return reply({ error: "empty" }, 400);
    if (transcript.length > MAX_TRANSCRIPT) return reply({ error: "too_long", max: MAX_TRANSCRIPT }, 413);
    const model = typeof body.model === "string" && ALLOWED.includes(body.model) ? body.model : DEFAULT_MODEL;

    if (limited("all", PER_INSTANCE) || limited(u.user.id, PER_USER)) return reply({ error: "rate_limited" }, 429);
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return reply({ error: "ai_not_configured" }, 503);

    const r = await parseTranscript({ transcript, model, apiKey: key });
    // Metrics only: no transcript, no names, no user id.
    console.log(JSON.stringify({ fn: "parse-voice-log", v: PROMPT_VERSION, model, ok: r.ok, error: r.ok ? undefined : r.error,
      ms: r.latency_ms, chars: transcript.length, in: r.usage?.input_tokens, out: r.usage?.output_tokens, guards: r.ok ? r.guards.length : undefined }));
    if (!r.ok) return reply({ error: r.error === "schema" ? "schema_failed" : "ai_failed", latency_ms: r.latency_ms, model }, 502);
    return reply({ result: r.result, guards: r.guards, model: r.model, latency_ms: r.latency_ms, usage: r.usage, cost_usd: r.cost_usd, prompt_version: r.prompt_version });
  } catch (e) {
    console.error("parse-voice-log failed", (e as Error)?.name);
    return reply({ error: "server_error" }, 500);
  }
});
