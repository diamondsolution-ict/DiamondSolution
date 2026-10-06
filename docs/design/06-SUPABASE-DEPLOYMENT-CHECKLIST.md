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
supabase db push             # applies all 14 migrations, in order, to the live project
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

`RESEND_API_KEY` is the email-delivery provider chosen to unblock the account-settings
password-change OTP flow (and the admin step-up gate once that's built) — get it from
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
supabase functions deploy admin-approve-commission
supabase functions deploy admin-recheck-payment
supabase functions deploy mfa-stepup-token
```

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

This project briefly evaluated moving to Cloudflare Pages after the original Netlify account
ran out of operational credits, but that's resolved now (a personal Netlify account, no longer
credit-limited) — back on Netlify. Netlify dashboard → **Add a new site** → **Import an
existing project** → connect to Git → pick `diamondsolution-ict/DiamondSolution`, branch
`main`:

- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Base directory**: leave as the repo root (`/`)

`netlify.toml` is already in the repo with exactly this build command/publish dir plus the SPA
redirect (`/* -> /index.html`, status 200) that makes a direct load of `/dashboard`,
`/admin/login`, etc. work instead of 404ing — Netlify reads it automatically, nothing further
to configure for that part. (`public/_redirects` also exists from the brief Cloudflare
evaluation; Netlify would honor either, but `netlify.toml` takes precedence and already covers
the same rule, so no conflict.)

## 8. Configure Auth URLs

Supabase dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: your Netlify domain, e.g. `https://diamondsolution.netlify.app` (or your custom
  domain once one's attached)
- **Redirect URLs**: add the same domain (and Netlify's per-deploy-preview URL pattern if you
  want deploy previews to work too)

Without this, the email-confirmation link a new user receives redirects to `localhost` instead
of your real site.

## 9. Set Netlify environment variables and redeploy

Netlify site → **Site configuration** → **Environment variables**, set:

- `VITE_SUPABASE_URL` — from Supabase dashboard → Project Settings → API
- `VITE_SUPABASE_ANON_KEY` — same page
- `VITE_PAYSTACK_PUBLIC_KEY` — Paystack dashboard, the `pk_test_...` key to match the secret
  key from step 4

These are baked in at **build time**, not read at runtime — after setting them, trigger a new
deploy (**Deploys** → **Trigger deploy** → **Deploy site**, or just push a commit), a page
refresh alone won't pick them up. This is also the actual fix for the blank-page issue on the
old credit-limited Netlify setup — that was these variables being unset (or the account not
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
- **All courses at once**: `scripts/migrate-questions-from-firebase.mjs` reads every course's
  questions directly out of the old app's Firestore and inserts them into the matching Supabase
  course in one run (matched by department + level + course title). Needs a Firebase
  service-account key for the old project and this project's Supabase service-role key — see the
  script's header comment for exact steps. Run `--dry-run` first; it prints which old courses
  matched, which don't exist in the new catalog (the new catalog deliberately dropped some
  duplicate-category courses — see `supabase/seed/02-courses.sql`'s header), and any questions
  it couldn't import cleanly, so you can fix those up by hand afterward.

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

Update `VITE_PAYSTACK_PUBLIC_KEY` in Cloudflare Pages to the matching `pk_live_...` key,
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
