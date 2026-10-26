#!/usr/bin/env node
// Local server for the voice prototype: serves project/ and a /api/parse endpoint that calls the
// same parser as the edge function, with your own key. Binds to localhost only.
//
//   OPENAI_API_KEY=sk-... node voice-eval/dev-server.mjs          # http://localhost:8787/voice-v2/
//   node voice-eval/dev-server.mjs --fixtures                      # no key: answers only the eval cases' transcripts (UI testing)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTranscript } from '../supabase/functions/_shared/voice-parse-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../project');
const port = +(process.env.PORT || 8787);
const fixtures = process.argv.includes('--fixtures');
const model = process.env.VOICE_PARSE_MODEL || 'gpt-4.1-mini';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function fixtureFor(transcript) {
  const cases = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));
  const c = cases.find(x => x.transcript === transcript.trim()); if (!c) return null;
  const e = c.expect, pick = v => (v && typeof v === 'object' && v.any) ? v.any[0] : v;
  return { language: c.lang, match_type: pick(e.match_type ?? null), multiple_lineups: !!e.multiple_lineups, game_count: e.game_count ?? null, order_known: !!e.order_known, totals: e.totals || { wins: null, losses: null },
    players: (e.players || []).map(p => ({ name: p.name, role: pick(p.role) })),
    games: (e.games || []).map(g => ({ interrupted: false, ...g })),
    observations: (e.observations || []).map(o => ({ text: o.any[0], category: o.category, area: null, about: null })), missing: [], ambiguities: [] };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/voice-v2/voice-config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(`window.RALLYWISE_VOICE = { endpoint: '/api/parse', auth: false, models: ['gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5-mini'] };`);
  }
  if (url.pathname === '/api/parse' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 16000) { res.writeHead(413); return res.end('{"error":"too_large"}'); } }
    let body; try { body = JSON.parse(raw); } catch { res.writeHead(400); return res.end('{"error":"bad_request"}'); }
    const transcript = String(body.transcript || '').trim();
    const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (!transcript) return send(400, { error: 'empty' });
    if (transcript.length > 3000) return send(413, { error: 'too_long' });
    if (fixtures) {
      const result = fixtureFor(transcript);
      return result ? send(200, { result, guards: [], model: 'fixture', latency_ms: 0, usage: null, cost_usd: 0 }) : send(502, { error: 'ai_failed' });
    }
    if (!process.env.OPENAI_API_KEY) return send(503, { error: 'ai_not_configured' });
    const r = await parseTranscript({ transcript, model: body.model || model, apiKey: process.env.OPENAI_API_KEY });
    console.log(JSON.stringify({ model: r.model, ok: r.ok, error: r.error, ms: r.latency_ms, chars: transcript.length, usage: r.usage }));
    return r.ok ? send(200, { result: r.result, guards: r.guards, model: r.model, latency_ms: r.latency_ms, usage: r.usage, cost_usd: r.cost_usd, prompt_version: r.prompt_version })
      : send(502, { error: r.error === 'schema' ? 'schema_failed' : 'ai_failed' });
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Voice prototype: http://localhost:${port}/voice-v2/${fixtures ? '  (fixtures mode, no model calls)' : ''}`));
