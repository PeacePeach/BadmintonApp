// Where the voice prototype sends transcripts for parsing.
// 'supabase' = the parse-voice-log edge function, called with the signed-in Rallywise session.
// The local dev server (voice-eval/dev-server.mjs) serves its own version of this file.
window.RALLYWISE_VOICE = { endpoint: 'supabase', fn: 'parse-voice-log', auth: true, models: ['gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5-mini'] };
