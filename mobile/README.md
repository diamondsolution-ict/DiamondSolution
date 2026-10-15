# Diamond Solution — Android app (Flutter)

Mobile client for the Diamond Solution website. It talks to the **same Supabase project** as the
web app (same auth, RLS, tables and RPCs) — nothing on the backend changes.

## v1 scope

Sign in / register, dashboard (stats + 7-day chart + resume), departments → courses → course
detail (outline, jump-to-question), timed study sessions (`record_question_attempt`, resume,
results), leaderboard (weekly / all-time), notifications, profile, single-device login limit,
suspended-account screen.

Not in v1: Paystack payments (locked departments say "Unlock on the website"), affiliate program
and payouts, chat, admin back office, activity log, French language.

## Run

```bash
cd mobile
cp env.example.json env.json        # fill in the same URL / anon key the website uses
flutter pub get
flutter run --dart-define-from-file=env.json
flutter build apk --dart-define-from-file=env.json
```

`env.json` is git-ignored. Use the anon (publishable) key only — never the service-role key.

## Layout

```
lib/core/      supabase client + device id, AppAuth (session/profile/roles), theme, shared widgets
lib/screens/   one file per feature area
```

Each screen mirrors the queries of the matching web page in `src/pages/`.
