// Rallywise backend settings. Fill these in from your Supabase project
// (Dashboard > Project Settings > API). The anon key is public by design: row-level
// security in supabase/migrations decides what each signed-in user can read and write.
// Never put the service_role key here.
window.RALLYWISE_CONFIG = {
  supabaseUrl: '',      // e.g. 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: '',  // the "anon public" key
  // Turn a provider on only after enabling it under Authentication > Providers in Supabase.
  // While off, its button says it isn't available yet and never signs anyone in.
  oauth: { google: false, apple: false }
};
