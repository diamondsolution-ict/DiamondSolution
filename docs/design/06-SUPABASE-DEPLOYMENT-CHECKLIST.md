# Supabase deployment checklist (do this once you're back on your laptop)

Nothing built so far has reached your live Supabase project — every migration has only been
validated against a throwaway local Postgres instance. This is the full list of what's left to
actually go live, in order. Each step says which tool does it and roughly how long it takes.

## 0. Rotate the leaked access token first

You pasted a live Supabase personal access token into this chat earlier
(`sbp_fc860887b5...`). I never used or stored it (the host it talks to is blocked from this
sandbox), but it was typed into a chat transcript regardless, so treat it as compromised:

- Supabase dashboard → your account menu → **Access Tokens** → revoke that token → generate a
  fresh one if you still need CLI login.

## 1. Install the CLI and log in

```bash
npm install -g supabase   # or: npx supabase <command> every time, no global install needed
supabase login             # opens a browser to authenticate
```

## 2. Create the Supabase project (if you haven't already)

Dashboard → **New project** → pick a region close to your users (e.g. closest to Nigeria is
usually `eu-west` or similar — check the lowest-latency option Supabase offers) → note the
**project ref** (the short string in the project URL, `xxxxxxxxxxxx`).

## 3. Link the repo to the project and push the schema

```bash
cd diamondsolution
supabase link --project-ref <your-project-ref>
supabase db push             # applies every migration, in order, to the live project
```

This creates every table, RLS policy, and function from scratch — `profiles`, `departments`,
`courses`, `questions`, `payments`, `access_grants`, `study_progress`, `question_attempts`,
`daily_practice_stats`, the affiliate/referral/payout tables, `notifications`,
`admin_actions_log`, `security_otp_tokens`, `rate_limit_hits`, `quotes`,
`institutional_links`, `admin_broadcasts`, and all their RLS policies and helper functions
(`is_admin()`, `leaderboard()`, `record_question_attempt()`, `admin_list_emails()`,
`admin_activate_affiliate()`, `admin_dashboard_stats()`, `broadcast_notification()`, etc.).
Since no real users exist on the live project yet, this is a clean push — nothing to migrate
or backfill.

It also provisions a public Storage bucket named `media` (department/course card pictures,
5MB limit, JPEG/PNG/WebP only) with RLS on `storage.objects` — public read, staff-only write —
so the Admin Pictures & Media tab works immediately with no separate dashboard step. Nothing
in this bucket is access-controlled beyond that; it's public-browsable marketing imagery, same
posture as the department catalog itself.

## 4. Set Edge Function secrets

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
by Supabase — nothing to do for those. The secrets you do need to set by hand:

```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxx
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set RESEND_FROM_EMAIL=noreply@yourdomain.com
```

Start with your Paystack **test** secret key so you can do a full dry run before touching real
money. Get it from the Paystack dashboard → Settings → API Keys & Webhooks.

`RESEND_API_KEY` is the email-delivery provider for the account-settings password-change OTP
flow only now — the admin step-up gate no longer uses email at all, see below — get it from
resend.com → API Keys. `RESEND_FROM_EMAIL` must be an address on a domain you've verified in
Resend (their dashboard walks through the DNS records); sending from an unverified domain
fails outright, so verify the domain before the end-to-end smoke test in step 12.

## 5. Deploy the Edge Functions

```bash
supabase functions deploy verify-payment
supabase functions deploy paystack-webhook
supabase functions deploy request-payout
supabase functions deploy request-otp
supabase functions deploy verify-otp
supabase functions deploy change-password
supabase functions deploy admin-manage-user
supabase functions deploy admin-recheck-payment
supabase functions deploy admin-verify-stepup-code
supabase functions deploy admin-set-stepup-code
supabase functions deploy list-banks
supabase functions deploy resolve-bank-account
```

(`admin-approve-commission` was removed from the repo — the affiliate "authorize payment"
step it backed was replaced by the configurable commission/withdrawal flow in
`20261013150000_affiliate_program_configurable.sql`. If you deployed it in an earlier pass,
delete it from the live project: `supabase functions delete admin-approve-commission`.)

`list-banks` and `resolve-bank-account` power the Affiliate page's "Initialize credentials"
form — a dropdown of Paystack-supported banks and automatic account-name resolution, so a
payout method never has a hand-typed bank code or account name. If you see **"Failed to send
a request to the Edge Function"** on that form, it almost always means one of these two
hasn't been deployed yet — deploy both and reload.

If you already deployed `mfa-stepup-token` (from the now-reverted TOTP MFA attempt), remove it
from the live project — it's no longer in the repo:
```bash
supabase functions delete mfa-stepup-token
```

**Admin step-up now uses a static, admin-changeable code instead of email-OTP**
(`admin-verify-stepup-code`/`admin-set-stepup-code`, backed by the new `admin_stepup_code`
table) — the default is **`12345`**. Change it immediately after your first deploy from
**Admin → Settings → Admin security code** (requires the current code, so do this before
handing the account to anyone else). This gates: Users tab suspend/role-change/delete, and
Affiliates tab commission-payment authorization. It does **not** need `supabase db push` to run
separately — it's included in the regular migration step above, just called out here since it
changes what step-up means in practice.

(`_shared/` is bundled automatically into each function — no separate deploy step for it.)

## 6. Register the Paystack webhook

Paystack dashboard → Settings → API Keys & Webhooks → **Webhook URL**:

```
https://<your-project-ref>.supabase.co/functions/v1/paystack-webhook
```

This is what makes payment confirmation work even if a student closes the tab right after
paying — the client-triggered `verify-payment` call and this webhook both land on the same
idempotent `processDepartmentAccessPayment`, so whichever arrives first wins and the second is
a safe no-op.

## 7. Connect Netlify to the repo

This project tried Cloudflare Pages/Workers for a while (DNS/custom-domain setup there got
complicated enough to not be worth it) and has moved back to Netlify, which is where it
started. Earlier Netlify runs hit the free tier's operational-credit cap — if that recurs,
that's a plan/usage problem to solve on Netlify's side (checking Site → Usage, or upgrading),
not a reason to bounce between hosts again. Netlify dashboard → **Add new site** → **Import an
existing project** → connect GitHub → pick `diamondsolution-ict/DiamondSolution`, branch
`main`:

- **Build command**: `npm run build`
- **Publish directory**: `dist`

All of this is already captured in the `netlify.toml` committed at the repo root, so Netlify
should auto-detect it — you shouldn't need to type these in by hand. That file also carries the
SPA fallback (`/* -> /index.html`, status 200) so a direct load of `/dashboard`,
`/admin/login`, etc. serves `index.html` and lets the app's own router take over, instead of
404ing. `.node-version` (pinned to `22`, matching CI) is also already in the repo so Netlify
builds with the same Node version everything else does.

`wrangler.jsonc` is still in the repo (harmless — Netlify ignores it) in case this project ever
needs to point back at Cloudflare; delete it whenever you're confident that won't happen.

## 8. Configure Auth URLs

Supabase dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: your Netlify domain, e.g. `https://diamondsolution.netlify.app` (or your custom
  domain once one's attached under **Site configuration → Domain management**)
- **Redirect URLs**: add the same domain (and Netlify's per-deploy-preview URL pattern,
  `https://deploy-preview-*--diamondsolution.netlify.app`, if you want preview deploys to work
  too)

Without this, the email-confirmation link a new user receives redirects to `localhost` instead
of your real site.

## 9. Set Netlify environment variables and redeploy

Netlify site → **Site configuration** → **Environment variables**, add:

- `VITE_SUPABASE_URL` — from Supabase dashboard → Project Settings → API
- `VITE_SUPABASE_ANON_KEY` — same page
- `VITE_PAYSTACK_PUBLIC_KEY` — Paystack dashboard, the live `pk_live_...` key to match the live
  secret key the Edge Functions use
- `VITE_SENTRY_DSN` — optional, Sentry project → Settings → Client Keys (DSN); leave unset to
  skip error tracking entirely

These are baked in at **build time**, not read at runtime — after setting them, trigger a new
deploy (**Deploys** tab → **Trigger deploy** → **Deploy site**, or just push a commit), a page
refresh alone won't pick them up. This is also the actual fix for the blank-page issue on the
old credit-limited Netlify run — that was these variables being unset (or the account not
building at all), and `src/main.tsx` now shows a clear "Configuration missing" message instead
of a blank screen if they're ever missing again.

## 10. Bootstrap your own admin account

1. Sign up for an account normally through the live, deployed app.
2. Supabase dashboard → **Authentication** → **Users** → click your account → copy its **User
   UID**.
3. Open `supabase/seed/00-bootstrap-admin.sql`, replace `YOUR-USER-ID-HERE` with that UID.
4. Run it in Supabase dashboard → **SQL Editor** → New query → paste → Run.
5. Sign out and back in on that account (role is read fresh on sign-in).

## 11. Seed real content

Run `supabase/seed/01-departments.sql` then `supabase/seed/02-courses.sql` (same manual
SQL-Editor-or-`psql -f` process as step 10's admin bootstrap) to populate the five real
departments/pricing and their course catalog from the old app, so `/register` and `/courses`
aren't empty. These are catalog entries only — no questions yet.

To get real questions in, pick one:

- **One-off, a few courses**: `/admin/questions` → pick a course → either hand-enter via the
  "Add question" form, or **Import CSV** (there's a **Download template** button for the exact
  column layout). The old app's own Admin → Questions tab has a per-course **Export CSV** button
  that writes that same format, so you can export from the old app and import straight into the
  matching course here.
- **All courses at once**: `scripts/import-questions-from-export.mjs` reads the JSON export
  produced by the old app's Question Bank Exporter tool and inserts every course's real
  questions into Supabase in one run — creating any department level or course that doesn't
  already exist (using the old app's own titles) rather than skipping it, and re-hosting each
  course's thumbnail image into the `media` storage bucket. Needs only this project's Supabase
  service-role key — see the script's header comment for exact steps. Run `--dry-run` first; it
  prints every level/course it would create and the question/thumbnail counts, so you can review
  before writing anything.
  (`scripts/migrate-questions-from-firebase.mjs`, which pulls straight from live Firestore and
  only matches against `supabase/seed/02-courses.sql`'s narrower catalog, is kept for reference
  but superseded by the above for this import.)

## 12. End-to-end smoke test (Paystack test mode)

- Sign up a second (non-admin) test account.
- Browse departments, pick one, pay with a Paystack **test card**
  (`4084084084084081`, any future expiry, any CVV).
- Confirm: a row appears in `payments` with `status = success`, a row in `access_grants`, the
  course unlocks in the UI, and a "Payment received" notification shows up (bell icon).
- In `/admin/payments`, confirm the transaction shows as success.
- If you set up a referral code first and sign the test account up via that link, confirm a
  `commissions` row and a "You earned a commission" notification appear on the referrer's
  account once the payment succeeds.
- On that same test account, go to `/account` → Security Override, change the password, and
  confirm the OTP email actually arrives (proves `RESEND_API_KEY`/`RESEND_FROM_EMAIL` and
  domain verification are wired correctly) and that the new password signs in.
- Manually set that account's `profiles.status` to `suspended` in the SQL Editor, reload the
  app, confirm it's redirected to `/reactivation`, pay the reactivation fee with the same test
  card, and confirm `profiles.status` flips back to `active` and the app unlocks immediately.

## 13. Go live with real payments

Once the test-mode run above is clean:

```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxx
```

Update `VITE_PAYSTACK_PUBLIC_KEY` in Netlify's environment variables to the matching `pk_live_...` key,
redeploy, and update the Paystack webhook URL registration if Paystack treats test/live as
separate webhook configs (check the Paystack dashboard — it usually doesn't, but worth a
glance). Do one real, low-value transaction yourself post-deploy to confirm the live keys work
end-to-end before telling anyone else the platform is open.

## 14. Turn on error tracking (optional, recommended)

- [sentry.io](https://sentry.io) → new project → React → copy the DSN from Client Keys.
- Add `VITE_SENTRY_DSN=https://...` to Netlify's environment variables and redeploy — the app
  only initializes Sentry when this is set, so skipping this step is safe (no behavior change,
  just no error reports).
- Trigger a real error once deployed (e.g. temporarily throw inside a component) and confirm
  it shows up in the Sentry dashboard, then revert the test throw.
- A free Sentry project's event quota is enough for this app's expected traffic for a long
  while — revisit if it's ever actually exceeded.

Server-side (Edge Function) error tracking isn't wired up — Supabase's own Function logs
(Dashboard → Edge Functions → a function → Logs) are the only visibility into those for now.

## 15. Set up an uptime check (optional)

A free account on something like [UptimeRobot](https://uptimerobot.com) or
[Better Uptime](https://betteruptime.com), pointed at the deployed frontend URL and/or a
cheap Edge Function (e.g. `verify-payment` with a deliberately-invalid body, which should
reply fast with a 400 rather than timing out) — catches "the whole site/API is down" before a
student reports it. Nothing in the repo depends on this; it's an external dashboard, not code.

---

Everything above is a one-time setup. After this, the only recurring step is `supabase db
push` whenever a new migration lands in `supabase/migrations/`, and `supabase functions
deploy <name>` whenever an Edge Function changes — both already covered by the regular
workflow this session has been using (I validate locally against throwaway Postgres before
ever committing, but the live push itself has to happen from a machine that can actually reach
`api.supabase.com`, which this sandbox is blocked from).
