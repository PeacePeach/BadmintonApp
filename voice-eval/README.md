# Voice match logging prototype (functional)

Speak or type a session, let a language model turn it into match data, fix anything with a tap, save. This is a prototype: it never writes to the Rallywise match tables, and the app does not link to it.

| Piece | Where |
|---|---|
| Three-screen prototype (Describe, Match Details, Notes) | `project/voice-v2/index.html`, served at `/voice-v2/` |
| Parse endpoint (Supabase edge function) | `supabase/functions/parse-voice-log/index.ts` |
| Prompt, JSON schema, validator, guards, prices (shared) | `supabase/functions/_shared/voice-parse-core.js` |
| Eval cases, runner, scorer | `voice-eval/cases.json`, `voice-eval/run.mjs`, `voice-eval/score.mjs` |
| Local server (no Supabase needed) | `voice-eval/dev-server.mjs` |

## How it works

1. **Speech to text.** The browser's built-in speech recognition (Web Speech API), set to English (`en-US`) or Mandarin (`zh-CN`) with the toggle under the text box. Results stream into the text box, recording again appends, and stop never submits. If the browser has no speech recognition, the mic is hidden and typing still works.
2. **Parsing.** Continue sends only the text to `parse-voice-log`. The function checks the signed-in user, applies limits, calls OpenAI's Responses API with a strict JSON schema, re-validates the output, then runs deterministic guards:
   - drops players not named in the text
   - drops scores whose numbers aren't in the text (digits or Chinese numerals)
   - makes W/L agree with scores
   - sets `order_known` only when every game's result is known in sequence
3. **Screens.** The result fills Match Details and Notes. Edits never call the model again. If you go back and change the text, sections you haven't edited refresh, and edited sections are kept.

## Deploy (one time)

The project's Supabase already has `OPENAI_API_KEY` (used by Grow insights), so no new secret is needed.

```sh
supabase functions deploy parse-voice-log --project-ref bkfxszdfuhrbtfcbofuy
# optional: change the default model or the allowed list
supabase secrets set VOICE_PARSE_MODEL=gpt-4.1-mini VOICE_PARSE_MODELS=gpt-4.1-mini,gpt-4.1-nano,gpt-5-mini --project-ref bkfxszdfuhrbtfcbofuy
```

The page itself deploys with the branch's Vercel preview. Nothing changes on `main` or in production.

## Test on a phone

1. Open the branch's Vercel preview URL on the phone (HTTPS is required for the microphone).
2. Sign in to Rallywise on that preview (any account). The prototype reuses the session and reads your player list to match names.
3. Go to `/voice-v2/` on the same preview URL, allow the microphone, and talk.

Browser support for speech:
- **iPhone:** Safari, with Siri turned on (Settings > Siri). Chrome on iPhone doesn't support it, so type or use the keyboard's dictation key there.
- **Android:** Chrome.
- **Desktop:** Chrome, Edge or Safari. Firefox doesn't support it.

The AI details link at the bottom of Match Details shows the model, latency, tokens, estimated cost and raw JSON. You can also switch models there.

## Run locally

```sh
OPENAI_API_KEY=sk-... node voice-eval/dev-server.mjs     # http://localhost:8787/voice-v2/
node voice-eval/dev-server.mjs --fixtures                 # no key: answers only the eval transcripts (UI testing)
```

The local server skips sign-in, uses the demo player list, and binds to localhost. A phone can't use the mic over plain HTTP on your LAN, so test phones against the preview URL.

## Evaluation

```sh
OPENAI_API_KEY=sk-... node voice-eval/run.mjs                       # gpt-4.1-mini by default
OPENAI_API_KEY=sk-... node voice-eval/run.mjs --model gpt-5-mini    # compare another model
OPENAI_API_KEY=sk-... node voice-eval/run.mjs --repeat 3            # check run-to-run stability
node voice-eval/run.mjs --replay voice-eval/results/<file>.json     # re-score saved outputs after editing cases
node voice-eval/run.mjs --selftest                                  # check the scorer itself (expects 100%)
```

Each run writes `voice-eval/results/<model>-<time>.json` (raw outputs) and a `.md` report with:

- **Field accuracy:** share of expected fields the model got right. Fields are match type, game count, wins, losses, order known, each game's result and scores, per-game partners, each expected player and role, and each expected observation in the right category.
- **Invented items:** values with no support in the text. These are a player who wasn't named, a score where none was given, game results when only totals were said, a match type, count or total that wasn't stated, and observations when there were none.
- **Schema failures:** outputs that don't validate.
- **Latency:** p50 and p95 of the model call.
- **Cost:** average per request and per 1,000 requests, from token usage and the prices in `PRICES`. Check those against current OpenAI pricing.

The 25 cases in `cases.json` cover:

- English, Chinese and mixed language
- singles and doubles
- known, partial and missing scores
- aggregate-only results and changing partners
- self-corrections, ambiguous roles, vague counts
- observations with no match, Chinese numerals

To add a case, append it to `cases.json`. Only the fields under `expect` are scored, and `{"any": [...]}` accepts several answers.

To try another provider, add a `parseTranscript`-style function with the same output shape. The screens, scorer and report don't change.

## Safeguards

- The OpenAI key stays in Supabase secrets; the browser only sends the user's own session token.
- Limits:
  - request body 16 KB
  - transcript 3,000 characters
  - 20 parses per user per 10 minutes, and 300 per function instance
  - 25 s model timeout
- The function logs only model, status, latency, character count and token counts. It never logs transcripts, names or user ids.
- No audio is recorded or stored by Rallywise. The browser's recognizer handles audio: Chrome sends it to Google, Safari to Apple.
- The transcript text is sent to OpenAI for parsing.
- Saved sessions stay in the browser's local storage on that device (Saved Sessions screen, with a Clear button) and never reach the match database.
