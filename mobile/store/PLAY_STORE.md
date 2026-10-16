# Publishing Diamond Solution on Google Play

Everything in `mobile/store/` is ready to upload: `play_icon_512.png` (app icon),
`feature_graphic_1024x500.png` (feature graphic). Add 2–8 phone screenshots of the real app.

## 1. Create the upload key (once — keep it safe)

Run on your laptop (needs Java; `keytool` ships with it). Pick strong passwords and WRITE THEM DOWN
— if you lose this file or its password you can't update the app.

```
keytool -genkey -v -keystore diamond-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Back the file up somewhere private (password manager / encrypted drive). Never commit it.

> Why it matters here: a student's Android device id depends on the key the app is signed with, so
> always sign with this same key (Play App Signing keeps it consistent for you).

## 2. Give GitHub the key so every build is signed

```
base64 -w0 diamond-upload.jks        # macOS: base64 -i diamond-upload.jks
```

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | output of the command above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WEB_BASE_URL` | already set |

Run the **Mobile (Flutter)** workflow. It produces `diamond-solution-aab` (upload this to Play) and
`diamond-solution-apk` (install on phones to test).

## 3. Play Console setup (play.google.com/console, one-time US$25 developer fee)

1. **Create app** → name `Diamond Solution`, default language English (United Kingdom/Nigeria), App, Free.
2. **Store listing** (copy below). Upload the 512 icon, the feature graphic and screenshots.
3. **App content**: privacy policy URL `https://<your-site>/privacy` (page is live in this repo);
   ads: No; app access: provide a test student login (and say moderators/admins exist);
   target audience: 18+ (or 13+ if you prefer — university students); content rating questionnaire:
   education, no violence/user-generated public content → Everyone; news app: No;
   data safety: see section 4; financial features: select "payments / in-app via web" if asked
   (payments are made through Paystack's hosted page in a web view).
4. **Production → Create release**: let Play manage signing, upload `app-release.aab`, release notes,
   review and roll out. Google's first review usually takes a few days.
5. First-time personal developer accounts must run a **closed test** (12+ testers for 14 days) before
   production — add testers' Gmail addresses in Testing → Closed testing.

## 4. Data safety answers

Collected & required for the app to work, encrypted in transit, not sold, deletable on request:
- Personal info: name, email, phone number (and username, university).
- Financial info: payment history (purchase records only — cards are handled by Paystack).
- App activity: questions answered, progress (for features and analytics).
- Messages: support chat messages.
- Device or other IDs: device identifier (account security — one device per account).
Data deletion: users ask through Support / the web page `https://<your-site>/privacy#delete-account`.

## 5. Store listing text

**App name:** Diamond Solution

**Short description (80 max):**
Study smarter: practice questions, track progress and climb the leaderboard.

**Full description:**
Diamond Solution is the study companion for university students committed to first-class results.

• Practice by department and course with thousands of exam-style questions
• Objective and application questions with clear explanations
• Resume exactly where you stopped, with section checkpoints
• Daily stats: accuracy, attempts and time spent, with a 7-day chart
• Leaderboard and revision centre to keep you motivated
• Notifications and live chat with Support
• Earn commissions with the affiliate programme
• English and French

Department access is a yearly fee, paid securely through Paystack. Your account works on one device
at a time to keep it safe.

**Category:** Education · **Tags:** education, exam preparation
**Contact email:** your support email · **Website:** your site URL

## 6. Every later release

Bump `version:` in `mobile/pubspec.yaml` (the number after `+` must go up each upload), merge to
`main`, run the workflow, upload the new `.aab`.
