// Rallywise backend settings, from the Supabase project (Dashboard > Project Settings > API).
// The publishable key is public by design: row-level security in supabase/migrations decides what
// each signed-in user can read and write. Never put a secret or service_role key here.
window.RALLYWISE_CONFIG = {
  supabaseUrl: 'https://bkfxszdfuhrbtfcbofuy.supabase.co',
  supabaseAnonKey: 'sb_publishable_Q5V1UtnWkI-xgFW26Vvi2g_S2yEL_OO',
  // Turn a provider on only after enabling it under Authentication > Providers in Supabase.
  // While off, its button says it isn't available yet and never signs anyone in.
  oauth: { google: false, apple: false }
};
