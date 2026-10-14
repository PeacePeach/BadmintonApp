# Rallywise backend (Supabase)

Accounts and match data live in a Supabase project. The prototype talks to it through
`project/rallywise-backend.js`, configured by `project/rallywise-config.js`.

## One-time setup

1. Create a project at supabase.com.
2. Run the migrations in order: open **SQL Editor**, paste each file in `migrations/` (oldest first), and run it.
   (Or, with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
3. **Project Settings > API**: copy the Project URL and the `anon` `public` key into
   `project/rallywise-config.js`. Never use the `service_role` key in the app.
4. **Authentication > URL Configuration**: set **Site URL** to wherever the app is hosted
   (e.g. `https://rallywise.example.com/`) and add the same URL under **Redirect URLs**.
   Password reset and email confirmation links return there.
5. **Authentication > Providers > Email**: keep Email enabled. Decide on **Confirm email**:
   - On (Supabase default, safer): after Sign Up the app asks the user to confirm, then log in.
   - Off: Sign Up goes straight to onboarding.
   Set the minimum password length to 8 to match the app's hint.
6. **Authentication > Emails > SMTP Settings**: add your own SMTP sender before the beta.
   Supabase's built-in sender is rate limited to a few emails an hour and is meant for testing.

## Google / Apple sign-in (optional)

Both buttons stay "not available yet" until turned on in `rallywise-config.js` (`oauth: { google: true }`).
Before turning one on, enable it under **Authentication > Providers**:
- Google: needs an OAuth client ID and secret from Google Cloud Console, with
  `https://<ref>.supabase.co/auth/v1/callback` as the authorised redirect URI.
- Apple: needs an Apple Developer account, a Services ID, and a Sign in with Apple key.

## What the migration creates

- `profiles` (onboarding done, preferences), `players` (the `me` row holds name and skill level),
  `matches` (scores, tags, notes). Every row has a `user_id`.
- Row-level security on all three: a signed-in user can read and write only rows with their own
  `user_id`; signed-out requests get nothing.
- `delete_account()`: deletes the caller's auth user, which cascades to all of their rows.

## Local development

`supabase start` (needs Docker) runs the whole stack locally and applies the migration. Point
`rallywise-config.js` at the printed API URL and anon key, and serve `project/` on port 8080.
