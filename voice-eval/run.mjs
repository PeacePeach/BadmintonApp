#!/usr/bin/env node
// Runs every case in cases.json through the parser and writes a report.
//
//   OPENAI_API_KEY=sk-... node voice-eval/run.mjs                      # default model (gpt-4.1-mini)
//   OPENAI_API_KEY=sk-... node voice-eval/run.mjs --model gpt-5-mini   # compare another model
//   node voice-eval/run.mjs --replay voice-eval/results/<file>.json     # re-score saved outputs, no API calls
//   node voice-eval/run.mjs --selftest                                  # check the scorer against perfect answers
//
// Options: --cases <file>  --only <id,id>  --repeat <n>  --concurrency <n>  --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTranscript, validate, PROMPT_VERSION } from '../supabase/functions/_shared/voice-parse-core.js';
import { score } from './score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
  if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]); return a;
}, []));
const model = args.model || process.env.VOICE_PARSE_MODEL || 'gpt-4.1-mini';
let cases = JSON.parse(fs.readFileSync(args.cases || path.join(here, 'cases.json'), 'utf8'));
if (args.only) { const ids = String(args.only).split(','); cases = cases.filter(c => ids.includes(c.id)); }
const outDir = args.out || path.join(here, 'results');
const repeat = +args.repeat || 1;

// A "perfect" answer built from a case's expectations, used by --selftest to check the scorer itself.
function perfect(c) {
  const e = c.expect, pick = v => (v && typeof v === 'object' && v.any) ? v.any[0] : v;
  return {
    language: c.lang, match_type: pick(e.match_type ?? null), multiple_lineups: !!e.multiple_lineups, game_count: e.game_count ?? null, order_known: !!e.order_known,
    totals: e.totals || { wins: null, losses: null },
    players: (e.players || []).map(p => ({ name: p.name, role: pick(p.role) })),
    games: (e.games || []).map(g => ({ number: g.number, result: g.result, my_score: g.my_score, their_score: g.their_score, interrupted: !!g.interrupted })),
    observations: (e.observations || []).map(o => ({ text: o.any[0], category: o.category, area: null, about: null })),
    missing: [], ambiguities: []
  };
}

async function runOne(c) {
  if (args.selftest) return { ok: true, result: perfect(c), latency_ms: 0, usage: null, cost_usd: 0, guards: [] };
  return parseTranscript({ transcript: c.transcript, model, apiKey: process.env.OPENAI_API_KEY });
}

async function main() {
  let runs;
  if (args.replay) {
    runs = JSON.parse(fs.readFileSync(args.replay, 'utf8')).runs;
  } else {
    if (!args.selftest && !process.env.OPENAI_API_KEY) { console.error('Set OPENAI_API_KEY (or use --replay / --selftest).'); process.exit(1); }
    runs = [];
    const queue = cases.flatMap(c => Array.from({ length: repeat }, (_, i) => ({ c, i })));
    const conc = +args.concurrency || 3;
    await Promise.all(Array.from({ length: conc }, async () => {
      while (queue.length) {
        const { c, i } = queue.shift();
        const r = await runOne(c);
        runs.push({ id: c.id, attempt: i, ...r });
        process.stdout.write(r.ok ? '.' : 'x');
      }
    }));
    process.stdout.write('\n');
  }
  const byId = Object.fromEntries(cases.map(c => [c.id, c]));
  const rows = runs.filter(r => byId[r.id]).map(r => {
    const c = byId[r.id];
    if (!r.ok) return { ...r, c, s: null, schemaFail: r.error === 'schema', schemaErrors: r.schema_errors || [] };
    const schemaErrors = validate(r.result);
    return { ...r, c, s: score(c.expect, r.result), schemaFail: schemaErrors.length > 0, schemaErrors };
  });
  const scored = rows.filter(r => r.s);
  const lat = rows.map(r => r.latency_ms).filter(x => x != null).sort((a, b) => a - b);
  const q = p => lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : null;
  const costs = rows.map(r => r.cost_usd).filter(x => x != null);
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
  const checks = scored.flatMap(r => r.s.checks);
  const fieldGroup = f => f.replace(/^game\d+\./, 'game.').replace(/^player\..*\.role$/, 'player.role').replace(/^player\..*/, (m) => m.endsWith('.role') ? m : 'player.found').replace(/^obs\..*/, 'observation');
  const groups = {};
  for (const ch of checks) { const g = fieldGroup(ch.field); (groups[g] ||= { ok: 0, n: 0 }); groups[g].n++; if (ch.ok) groups[g].ok++; }
  const invented = scored.flatMap(r => r.s.invented.map(x => ({ id: r.id, ...x })));
  const summary = {
    model: args.selftest ? 'selftest' : (runs[0]?.model || model), prompt_version: PROMPT_VERSION, when: new Date().toISOString(),
    cases: cases.length, runs: rows.length,
    field_accuracy: checks.length ? sum(checks, c => c.ok ? 1 : 0) / checks.length : null,
    fully_correct: scored.filter(r => r.s.passed === r.s.total).length,
    invented_items: invented.length, cases_with_invented: new Set(invented.map(x => x.id)).size,
    schema_failures: rows.filter(r => r.schemaFail).length, call_failures: rows.filter(r => !r.ok && !r.schemaFail).length,
    latency_ms: { p50: q(0.5), p95: q(0.95), max: lat[lat.length - 1] ?? null },
    cost_usd: { per_request_avg: costs.length ? sum(costs, x => x) / costs.length : null, per_1000: costs.length ? 1000 * sum(costs, x => x) / costs.length : null },
    tokens_avg: scored.length && scored[0].usage ? { input: Math.round(sum(scored, r => r.usage.input_tokens) / scored.length), output: Math.round(sum(scored, r => r.usage.output_tokens) / scored.length) } : null
  };

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = summary.when.replace(/[:.]/g, '-');
  const base = path.join(outDir, `${summary.model}-${stamp}`);
  if (!args.replay) fs.writeFileSync(base + '.json', JSON.stringify({ summary, runs }, null, 2));

  const pct = x => x == null ? 'n/a' : (100 * x).toFixed(1) + '%';
  const usd = x => x == null ? 'n/a' : '$' + (x < 0.01 ? x.toFixed(5) : x.toFixed(2));
  const md = [];
  md.push(`# Voice parsing eval: ${summary.model}`, '', `Prompt ${summary.prompt_version} · ${summary.when} · ${summary.cases} cases, ${summary.runs} runs`, '');
  md.push('| Metric | Value |', '|---|---|',
    `| Field accuracy | ${pct(summary.field_accuracy)} (${sum(checks, c => c.ok ? 1 : 0)}/${checks.length} checks) |`,
    `| Cases fully correct | ${summary.fully_correct}/${summary.runs} |`,
    `| Invented items | ${summary.invented_items} in ${summary.cases_with_invented} cases |`,
    `| Schema failures | ${summary.schema_failures} |`, `| Call failures | ${summary.call_failures} |`,
    `| Latency p50 / p95 | ${summary.latency_ms.p50 ?? 'n/a'} ms / ${summary.latency_ms.p95 ?? 'n/a'} ms |`,
    `| Cost per request (avg) | ${usd(summary.cost_usd.per_request_avg)} |`, `| Cost per 1,000 requests | ${usd(summary.cost_usd.per_1000)} |`,
    summary.tokens_avg ? `| Tokens per request (avg) | ${summary.tokens_avg.input} in / ${summary.tokens_avg.output} out |` : '', '');
  md.push('## Accuracy by field', '', '| Field | Correct |', '|---|---|',
    ...Object.entries(groups).sort().map(([g, v]) => `| ${g} | ${v.ok}/${v.n} (${pct(v.ok / v.n)}) |`), '');
  md.push('## Cases', '', '| Case | Lang | Accuracy | Invented | Schema | Latency | Cost |', '|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.id} | ${r.c.lang} | ${r.s ? `${r.s.passed}/${r.s.total}` : 'failed: ' + r.error} | ${r.s ? r.s.invented.length : '-'} | ${r.schemaFail ? 'fail' : 'ok'} | ${r.latency_ms ?? '-'} ms | ${usd(r.cost_usd)} |`), '');
  const misses = scored.filter(r => r.s.passed < r.s.total || r.s.invented.length);
  if (misses.length) {
    md.push('## Misses', '');
    for (const r of misses) {
      md.push(`**${r.id}**: ${r.c.transcript}`, '');
      for (const ch of r.s.checks.filter(c => !c.ok)) md.push(`- ${ch.field}: expected \`${JSON.stringify(ch.want)}\`, got \`${JSON.stringify(ch.got)}\``);
      for (const x of r.s.invented) md.push(`- invented ${x.kind}: ${x.detail}`);
      if (r.guards?.length) md.push(`- guards applied: ${r.guards.join('; ')}`);
      md.push('');
    }
  }
  const report = md.filter(x => x !== null).join('\n');
  fs.writeFileSync((args.replay ? args.replay.replace(/\.json$/, '') : base) + '.md', report);
  console.log(report.split('## Accuracy by field')[0]);
  console.log('Report written next to', args.replay || base + '.json');
}
main().catch(e => { console.error(e); process.exit(1); });
