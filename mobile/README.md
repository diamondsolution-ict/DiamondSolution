# Diamond Solution — Android app (Flutter)

Mobile client for the Diamond Solution website. It talks to the **same Supabase project** as the
web app (same auth, RLS, tables and RPCs) — nothing on the backend changes.

## What's in it

Sign in / register, dashboard (stats + 7-day chart + resume), departments → courses → course
detail (outline, jump-to-question), timed study sessions (`record_question_attempt`, resume,
results), leaderboard (weekly / all-time), notifications, revision center (activity log),
**Paystack payments**, payment history (with re-check), **affiliate program** (referral code,
balances, payout methods, withdrawals, commissions), live support chat, profile, single-device
login limit with the 24-hour lock and ₦1000 unlock payment, and suspended-account reactivation.

Not included: admin back office (stays on the website) and French language.

## One device at a time

Same rules as the website (`register_device_login`): a 2nd device signs in and ends the account's
other session; a 3rd distinct device locks the account. The lock screen counts down 24 hours, and
only after that can the ₦1000 unlock be paid (the server enforces the 24 hours and the amount).
Admins and moderators are exempt.

**How a device is identified:** the app sends Android's `ANDROID_ID` (prefixed `android:`), which
belongs to the phone itself, so uninstalling, reinstalling or clearing app data does **not** make
it look like a new device. It changes only on a factory reset, or when the app is signed with a
different key — so a debug/test build and the Play Store build count as different devices (test the
lock with builds signed the same way). If Android ever refuses to give an id, the app falls back to
a random per-install id. The website still uses a per-browser id; the server treats both the same.

## Payments need one backend deploy

The website pays with Paystack's browser popup, which doesn't exist on mobile. The app instead
calls a new Edge Function, `supabase/functions/init-payment`, which looks up the real price
server-side and asks Paystack for a hosted checkout URL; the app opens it in a WebView and then
calls the existing `verify-payment`. Access is still only granted by `verify-payment`.

```bash
npx supabase functions deploy init-payment
```

(`PAYSTACK_SECRET_KEY` is already set for the other functions.) Until this is deployed, tapping
"Unlock" shows an error.

## Run

```bash
cd mobile
cp env.example.json env.json        # fill in the same URL / anon key the website uses
flutter pub get
flutter run --dart-define-from-file=env.json
flutter build apk --dart-define-from-file=env.json
```

**No Flutter installed?** Add repo secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` (and optionally
`WEB_BASE_URL`, used for referral links), then run the *Mobile (Flutter)* workflow from the
Actions tab — it builds `app-release.apk` and attaches it as a downloadable artifact.

`env.json` is git-ignored. Use the anon (publishable) key only — never the service-role key.

## Layout

```
lib/core/      supabase client + device id, AppAuth (session/profile/roles), theme, shared widgets
lib/screens/   one file per feature area
```

Each screen mirrors the queries of the matching web page in `src/pages/`.

## Releasing to the Play Store

1. Create an upload key once and keep it somewhere safe (losing it is painful):
   `keytool -genkey -v -keystore ~/diamond-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
2. Create `mobile/android/key.properties` (git-ignored):
   ```
   storeFile=/absolute/path/to/diamond-upload.jks
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```
3. `flutter build appbundle --dart-define-from-file=env.json` and upload
   `build/app/outputs/bundle/release/app-release.aab` in the Play Console.
4. Bump `version:` in `pubspec.yaml` (the number after `+` must increase every upload).

Without `key.properties`, release builds are signed with the debug key — fine for testing, not
accepted by the Play Store. The app id is `com.diamondsolution.diamond_solution`; change it in
`android/app/build.gradle.kts` before the first upload if you want a different one (it can't be
changed afterwards). The launcher icon is the company logo (`assets/icon.png`,
`assets/icon_foreground.png`; regenerate with `dart run flutter_launcher_icons`). Full Play Store
steps, listing text and the signing-secrets setup for CI are in `store/PLAY_STORE.md`.
