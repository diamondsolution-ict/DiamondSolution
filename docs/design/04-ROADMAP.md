# Build Roadmap

A phased plan so the first working version is small and real, not a big-bang rewrite attempt.
Each phase ends with something runnable.

## Phase 0 — Decide & set up (no code)

- [ ] Approve or amend `01-ARCHITECTURE.md` and `03-BUSINESS-RULES-REDESIGN.md` — especially
      the device/session policy change (§2) and the affiliate opt-in change (§1), since those
      are the two most user-visible departures from the old app.
- [ ] Pick a name/brand (separate from "Diamond Solution" — a new identity, even if the domain
      stays similar).
- [ ] Create the Supabase project (free tier) and the GitHub repo.
- [ ] Set up the repo skeleton: Vite + React + TypeScript + Tailwind frontend,
      `supabase/migrations/` for schema, `supabase/functions/` for Edge Functions.
- [ ] Set up CI (GitHub Actions): typecheck, lint, pgTAP RLS tests, `supabase db push --dry-run`
      against a throwaway branch/preview DB on every PR.

## Phase 1 — Identity, catalog, and the paywall (the vertical slice)

Goal: a student can sign up, log in, browse departments, pay for one with Paystack, and see
content unlock. This is the smallest end-to-end slice that proves the core architecture
(RLS + Edge Function payment verification) actually works, before building anything else on
top of it.

- [ ] `profiles`, `user_roles`, `departments`, `department_pricing`, `department_levels`,
      `courses`, `questions`, `question_options` tables + RLS policies + pgTAP tests.
- [ ] Supabase Auth wired up (email+password, email verification).
- [ ] Admin bootstrap script; a minimal admin screen to create departments/courses/questions
      (even a plain form is fine for this phase — the full tabbed back office comes later).
- [ ] `verify-payment` + `paystack-webhook` Edge Functions; `access_grants`/`payments` tables.
- [ ] Student-facing: Splash/Login/Register, department browse + paywall, course detail.
- [ ] **Milestone check**: a real test payment (Paystack test mode) ends with a row in
      `access_grants` and visibly unlocks a course — verified manually and by an integration
      test, not just "looks right in the UI."

## Phase 2 — Study flow & activity

- [ ] `study_progress`, `question_attempts`, `daily_practice_stats` tables + RLS + the
      one-transaction write function that keeps attempt log and daily stats consistent.
- [ ] StudyPage: timers, resume, the outline-sections-based "section complete" flow (now a real
      table lookup, not regex parsing).
- [ ] Activity Log ("Revision Center") — a real indexed, paginated query from day one.
- [ ] Leaderboard — real SQL aggregation off `daily_practice_stats`, no "top 1000 rows,
      approximate" workaround needed.
- [ ] Dashboard — stats strip, 7-day chart, department carousel, quotes.

## Phase 3 — Affiliate program & payouts

- [ ] `affiliate_profiles`, `payout_methods`, `referrals`, `commissions`, `withdrawals` + RLS.
- [ ] "Become an affiliate" opt-in action (§1 of the business-rules doc) + referral capture at
      signup.
- [ ] `request-payout` Edge Function (Paystack Transfer API), admin payout-approval screen.
- [ ] Affiliate dashboard (balance view, commission/withdrawal history, payout credentials).

## Phase 4 — Notifications, chat, admin back office

- [x] `notifications` (in-app only — bell icon + unread badge, auto-created on payment
      success/failure, commission earned, and withdrawal outcomes). No Realtime subscription
      used for this; a fetch-on-open dropdown was enough for a bounded, per-user list.
- [x] `chat_threads`, `chat_messages` (+ Realtime subscription for live chat — the one place
      Realtime is actually used in this app). One thread per student with "the admin"
      collectively, matching the old app's actual routing (never to a specific admin). Two
      security-definer RPCs (`send_chat_message`, `send_chat_message_as_admin`) are the only
      write path — no direct insert policy on either table, so unread counts/`last_message_at`
      can't drift out of sync with a client-side write. Verified against a scratch local
      Postgres before commit: idempotent thread creation (second message reuses the same
      thread, confirmed via row count), unread-count bump on both sides, and RLS actually
      blocking a direct `insert` that bypasses the RPC (tested as a non-superuser role).
      Student-facing `/chats` (`Chat.tsx`) and admin `/admin/support` (`AdminSupport.tsx`,
      two-pane thread list + conversation) both ship; `ComingSoon.tsx`/`AdminComingSoon.tsx`
      are deleted now that their only caller is gone.
- [ ] WhatsApp admin-notify Edge Function (best-effort, same pattern as before). Still
      deferred — no WhatsApp provider is configured, and in the old app this function only
      exists to relay a chat message to the admin's WhatsApp, which is a notify-on-top-of-chat
      feature rather than something chat itself needs to work.
- [x] The tabbed admin back office — built as several focused screens instead of one
      ~5,000-line file (Departments, Courses, Questions, Transactions, Withdrawals, Audit Log),
      each a separate component with its own one-time-fetch-on-mount data loading. No
      Realtime/live-subscription tab exists yet since nothing built so far needs one.
- [x] `admin_actions_log` (the audit-trail half) — every withdrawal-affecting admin action
      (approve/reject/pay-via-Paystack/mark-paid-manually) writes a row; viewable at
      `/admin/audit-log`.
- [x] Shared OTP/step-up implementation (`security_otp_tokens`, `request-otp`, `verify-otp`) —
      the email-delivery provider decision is made (Resend; see
      `06-SUPABASE-DEPLOYMENT-CHECKLIST.md` §4). Currently used by account-settings
      password-change (`change-password`); the admin-dashboard step-up gate itself (locking
      the whole `/admin` shell behind a code, not just this plumbing) is still open — see
      Phase 4's admin-tabs item below.
- [x] Admin security-clearance gate, as a reusable `StepUpModal` component wired into the
      Users tab's suspend/role-change/delete actions via `admin-manage-user`. (The old app also
      had a separate, independent "local PIN lock screen re-checked every mount" gate in front
      of the whole `/admin` shell — FUNCTIONAL_SPEC.md §20.1 — which is a different mechanism
      from the step-up-per-action OTP; not reproduced, since a plaintext-stored PIN was exactly
      the kind of "security costume" 03-BUSINESS-RULES-REDESIGN.md calls out elsewhere, and
      `AdminRoute`'s role check already gates entry to `/admin` for real.)
- [x] Admin Users tab (`/admin/users`): search/filter, suspend/unsuspend + role change + delete
      (step-up gated), approve-affiliate-partner (not gated, matches old behavior), add user,
      CSV export.
- [x] Student-facing account pages: Profile (`/profile`), Account Settings (`/account` —
      identity edit + password change), Payment History (`/payments`), and the general-
      suspension Reactivation flow (`/reactivation`, FUNCTIONAL_SPEC.md §9.1 only — §9.2's
      device-blocked sub-flow is intentionally not reproduced, see
      `03-BUSINESS-RULES-REDESIGN.md` §2).
- [x] Admin Affiliates tab (`/admin/affiliates`): Commissions (authorize payment — step-up
      gated, bookkeeping-only via the new `admin-approve-commission` function) and Partner
      Registry (read-only, off the existing `affiliate_balances` view) sub-tabs, CSV export.
- [x] Admin Quotes tab (`/admin/quotes`): publish/delete (not gated, matches old behavior);
      Dashboard's "Wisdom of the day" now reads from this table, falling back to the previous
      hardcoded pool when no quotes are published yet.
- [x] Admin Settings tab (`/admin/settings`): the `institutional_links` singleton (contact/
      social links). Deliberately does NOT include the broader `app_settings` key-value table
      from the design doc's sketch — see that migration's header comment for why bundling it
      now would be worse than the honest hardcoded-with-a-comment state.
- [x] Admin Dashboard/"Overview" tab (`/admin/dashboard`, now the sidebar's landing page):
      6 stat cards, Recent Payments, Revenue Breakdown — via two narrow security-definer
      aggregates (`admin_dashboard_stats()`, `admin_revenue_by_department()`) rather than
      client-side summation, which would silently undercount past whatever row limit a plain
      query used. Two of the old app's 7 stats aren't reproduced (see that migration's header
      comment for why: "Pending Affiliates" doesn't exist in this schema's model, "Support
      Queries" wasn't counted since chat didn't exist yet when that migration landed — now
      that `chat_threads.admin_unread_count` exists, that stat could be added as a follow-up,
      but isn't bundled into this entry retroactively).
- [x] Full admin shell redesign to match the old app's actual look: a left sidebar (grouped
      Main/Finance/Content nav with icons) on desktop, collapsing to an off-canvas drawer on
      mobile (`AdminLayout.tsx`). Every existing admin page inherits this automatically.
      Nav entries exist for every old-app tab; as of this phase all of them have real content
      (the last one, Support, shipped with chat — see this phase's chat entry above).
- [x] Student-facing desktop layout, revised twice: first a top nav bar, then rebuilt as a
      left sidebar (navy, logo + nav links + a motivational footer card) to match a reference
      design the user supplied — desktop only; the bottom tab bar stays mobile-only and
      mobile's card order is untouched (verified by screenshot, not just by eye — the sidebar
      split initially reshuffled mobile's card order since `wide`'s two-column grouping was a
      single flat stack below `lg:`, fixed by keeping "Wisdom of the day" in the main-column
      source position rather than the right rail). `wide` prop still gates which pages use the
      extra width (Dashboard's main+rail grid, the department browser's card grid) vs. staying
      at a readable measure (forms, lists).
- [x] Admin WhatsApp Numbers tab (`/admin/whatsapp-numbers`): contact directory off
      `profiles.whatsapp`/`phone`, search, copy-one/copy-all, CSV export, per-row wa.me chat
      link. No new schema — profiles' existing staff-read RLS already covers it.
- [x] Admin Notifications (broadcast) tab (`/admin/notifications`): compose → fans out to
      every user's own `notifications` row (same bell/dropdown, zero client changes) via a new
      `broadcast_notification()` RPC, with one `admin_broadcasts` row per send as the
      compose-history record. "Revoke Log" deletes the history row only — matches the old
      app's actual behavior exactly (it never un-notified anyone already fanned out to either).
- [x] Admin Analytics tab (`/admin/analytics`), the parts this schema can support: KPI row,
      12-month revenue history bar chart, Most Active Scholars (7d/30d/90d, from
      `daily_practice_stats`) via three new RPCs. Visit Frequency/Peak Hours is explicitly
      NOT built — it needs `login_events` from Phase 5's device/session work, which doesn't
      exist yet; the tab says so rather than faking a chart with zeros.
- [x] Admin Pictures & Media tab (`/admin/media`): Departments/Courses sub-tabs, picture
      upload for each, backed by a new public `media` Storage bucket (RLS: public read,
      staff-only write) — the first real Storage usage in the app. `departments.image_path`/
      `courses.image_path` already existed as columns waiting for this. Wired into the one
      actual display surface so it isn't a dead feature: the department browse cards on
      `/courses` now show the uploaded picture (falling back to an initial-letter avatar).
      Course-card images aren't surfaced anywhere in the student UI yet — nothing currently
      renders a course-level image, so that's a separate follow-up, not bundled here.
- [x] Top-level admin Questions browser (`/admin/questions`): department filter + search +
      course chip grid, clicking a chip opens the existing per-course question manager
      (`/admin/courses/:courseId/questions`) — no new schema, just a browse/filter front end
      over courses already in the DB.
- [x] "System Logs" sidebar entry just points directly at the existing `/admin/audit-log` —
      that tab already *is* the security/audit trail (admin_actions_log), so a separate page
      would only duplicate it.
- [x] Support (`/admin/support`) — the last admin tab with no content now has one; see this
      phase's chat entry above.
- [x] Payment tracking/recovery, prompted by the live Paystack key going live before the
      device/session hardening pass: `paystack-webhook` previously only acted on
      `charge.success`, so a charge Paystack itself reports as failed left no row in `payments`
      at all unless the student's own browser happened to call `verify-payment` first — now
      `charge.failed` is handled too, through the same `processDepartmentAccessPayment`/
      `processReactivationPayment` path (already records a non-"success" status as `failed`
      with a reason, so no new business logic was needed). New `admin-recheck-payment` Edge
      Function + a "Recheck a transaction" box on `/admin/payments`: paste a Paystack reference,
      it re-verifies live against Paystack and — reusing the same idempotent processing
      functions — records and grants access immediately if it turns out to actually be a
      success that was never recorded, covering "I paid but it's not showing" support cases
      without needing direct Paystack dashboard access.
- [x] Onboarding tour (`OnboardingTour.tsx`, mounted on Dashboard) — rewritten rather than
      transplanted: the old copy leaned on "$DL" asset redistribution (no equivalent in this
      app) and a much colder "institutional protocol" tone than the rest of this app's copy.
      Five steps describing what's actually here (daily practice, leaderboard, refer & earn,
      chat support — the last one is now literally true). Same shape as the old one (auto-
      advances every 6s, once per browser tab session via sessionStorage, skippable), plus a
      manual Next/Get Started button the old version didn't have. No new dependency — built
      with plain CSS transitions instead of the old app's `motion/react`, which isn't installed
      here and nothing else in this app uses.

## Phase 5 — Device/session policy, MFA, hardening

- [ ] `login_sessions`, `login_events`, the sign-in Auth hook enforcing
      `max_concurrent_sessions` (§2 of the business-rules doc).
- [x] MFA / "quick unlock" for admin step-up actions — two attempts and now settled. TOTP via
      Supabase Auth shipped briefly (an "Authenticator App" card on `/account`, a TOTP
      fast-path in `StepUpModal`, a `mfa-stepup-token` Edge Function), then reverted back to
      email-OTP at the user's request (SMS/WhatsApp OTP both need a paid provider account not
      set up). Email-OTP was then *also* dropped, again at the user's request, after Resend
      delivery proved a recurring support headache for a one-or-two-admin back office — the
      step-up gate (Users tab suspend/role-change/delete, Affiliates tab commission-payment
      authorization) now uses a **static, admin-changeable code** instead (default `12345`,
      changed from Admin → Settings → "Admin security code"). New `admin_stepup_code` table
      (singleton row, `code_hash` only — no client read/write policy at all, service_role
      only, same posture as `payments`/`commissions`), `admin-verify-stepup-code` (checks the
      code, issues the same capability-token shape `consumeStepUpToken()` already expected, so
      `admin-manage-user`/`admin-approve-commission` needed zero changes) and
      `admin-set-stepup-code` (change it, requires the current code as confirmation) Edge
      Functions. `request-otp`/`verify-otp` narrowed to `password_change` only — the
      `admin_step_up` purpose is still a valid `security_otp_tokens.purpose` value (rows are
      written directly by `admin-verify-stepup-code` now) but can no longer be *requested*
      through the email path, closing it server-side too, not just in the UI. This is a
      knowingly weaker mechanism than OTP or TOTP (a shared static secret, not a one-time
      code) — accepted as the right trade-off here since it's explicitly configured by the
      site owner for their own back office, not exposed to students. WebAuthn passkeys remain
      the eventual plan if a real second factor is wanted later, once Supabase's passkey
      support (beta as of May 2026, explicitly "may change without notice") stabilizes.
- [x] pgTAP RLS test suite, first pass — not "every invariant" yet, but the CI wiring already
      existed (`.github/workflows/ci.yml`'s `database` job: `supabase start` → `supabase db
      reset` → the RLS-enabled-on-every-table gate → `supabase test db`, which was built ahead
      of any actual test files and auto-detects `supabase/tests/pgtap/*.sql`) and was sitting
      with zero tests in it. Three files land now, covering 02-DATA-MODEL-AND-SECURITY.md §9's
      three explicitly-named examples plus this session's own chat work:
      `01_no_client_writes_to_sensitive_tables.sql` (user_roles/payments/access_grants/
      commissions all have a select policy and deliberately no write policy at all — neither a
      student nor an admin can write any of them directly, only the service_role Edge
      Functions can), `02_access_grants_expiry.sql` (an expired grant doesn't satisfy
      `has_department_access()`), `03_chat_isolation.sql` (a student can't read another
      student's thread/messages, and can't insert into `chat_messages` directly, bypassing
      `send_chat_message()`). Written carefully (direct `request.jwt.claims`/
      `request.jwt.claim.sub` GUC manipulation to simulate each test user, no third-party
      pgTAP helper extension) and reasoned through twice over — caught and fixed two real bugs
      before they'd have shown up as a confusing CI failure: UPDATE-vs-INSERT RLS semantics
      differ (a blocked UPDATE matching zero rows is not an error, unlike a blocked INSERT's
      `WITH CHECK` failure, so those tests had to switch to an attempt-then-assert-unchanged
      pattern instead of `throws_ok`), and a role-switched-too-early ordering bug (inserting
      into `auth.users` after already switching to the `authenticated` role, which can't write
      there). None of this could be executed in the sandbox this was built in (no Docker to
      run `supabase start`) — next real CI run is the first actual confirmation; add more
      tests incrementally from here rather than treating this as the finished suite.
- [x] Frontend error tracking (Sentry) — `@sentry/react`, entirely opt-in via `VITE_SENTRY_DSN`
      (unset means `Sentry.init()` is never called, not called with an empty DSN — no behavior
      change for the sandbox or any deploy that hasn't configured it). A `Sentry.ErrorBoundary`
      around the app also gives every deploy a friendly "Something went wrong" + reload screen
      instead of a blank white one on an uncaught render error, independent of whether Sentry
      itself is configured. See `06-SUPABASE-DEPLOYMENT-CHECKLIST.md` §14 for the Sentry
      project setup (needs the user's own account) and §15 for an uptime check (also external,
      no code to write). Edge Function (server-side) error tracking is NOT wired up — Supabase's
      own Function logs are the only visibility there for now.
- [ ] Load-shape review against the free-tier limits with realistic 1,000-user numbers before
      calling it launch-ready (see checklist below).

## Phase 6 — i18n, translation caching, polish

- [x] English/French string tables — scoped, not exhaustive: the pre-auth funnel (Splash,
      Login, Register, AuthTabs — the pages every visitor sees before deciding whether to sign
      up, so highest-leverage regardless of what language a student studies in) and the
      persistent nav chrome (`Layout.tsx`'s sidebar/bottom nav, on every authenticated page).
      New `LanguageContext` (`useLanguage()`/`t()`), a working EN/FR toggle on Splash (was a
      static placeholder since the student desktop sidebar work), and a Language card on
      `/account` for already-signed-in users. Preference persists to `localStorage`
      immediately and to `profiles.language` (already existed in the schema, just unused until
      now) once signed in, reconciling from the profile on load without racing a change just
      made in the same tab. Deeper page content — Dashboard, admin, course/question text —
      stays English-only; translating that honestly needs either hand-written copy per page or
      the item below, neither of which is built yet.
- [ ] `question_translations` caching for the admin "translate to French" feature (Gemini),
      so it's a one-time generation per question, not a per-view API call.
- [ ] Visual/brand pass — this is also the point to decide the new platform's own voice,
      separate from the old "institutional/security-protocol" tone, if a change is wanted.

## Pre-launch checklist

- [ ] The CI gate from `02-DATA-MODEL-AND-SECURITY.md` §8 (every `public` table has RLS
      enabled, checked by query against `pg_class`/`pg_namespace`, not by memory) is green —
      and has been green since Phase 1, not bolted on right before launch.
- [ ] Every money-moving table's insert/update is `service_role`-only where the design calls
      for it — re-verify against `02-DATA-MODEL-AND-SECURITY.md` table by table.
- [ ] pgTAP suite green in CI; manually re-run the old `security_spec.md`-style payloads once
      by hand as a sanity check even though CI now covers them automatically.
- [ ] Paystack is switched from test to live keys, with one real low-value transaction done
      post-deploy to confirm the webhook + verify path both work end-to-end in production.
- [ ] Free-tier headroom check: current DB size vs. 500MB, Storage usage vs. 1GB, Edge Function
      call volume vs. 500k/month, bandwidth vs. ~5GB/month — know the numbers before 1,000 real
      users arrive, not after.
- [ ] A documented upgrade path (Supabase's paid tier pricing) is written down *before* it's
      needed, so hitting a limit is a planned decision, not a 2am outage.
