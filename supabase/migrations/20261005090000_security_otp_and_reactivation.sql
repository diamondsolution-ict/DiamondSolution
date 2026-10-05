-- ============================================================================
-- Unblocks the OTP/step-up half of 02-DATA-MODEL-AND-SECURITY.md §7, deferred by
-- 20261002051600_admin_actions_log.sql pending an email-delivery provider decision — Resend
-- has now been chosen (see 05-BACKEND.md / 06-SUPABASE-DEPLOYMENT-CHECKLIST.md's RESEND_*
-- secrets). This is the shared OTP implementation used identically by account-settings
-- password-change today, and by the admin step-up gate once that's built — one table, one
-- pair of Edge Functions, not a duplicated copy per feature.
--
-- Also adds the general-suspension reactivation fee's notification type (§9.1 of the old
-- app's FUNCTIONAL_SPEC.md — reactivation by fee payment, no OTP needed for the plain case).
-- ============================================================================

create table security_otp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('password_change', 'admin_step_up')),
  code_hash text not null,          -- SHA-256 hex of the 6-digit code; raw code never stored
  target_id text,                   -- e.g. the admin-action target row's id, for admin_step_up
  expires_at timestamptz not null,
  consumed_at timestamptz,          -- set once the correct code is verified
  step_up_used_at timestamptz,      -- set once the resulting token is actually spent (change-password, ...)
  created_at timestamptz not null default now()
);
alter table security_otp_tokens enable row level security;
-- No client policy at all, in either direction — every row is written and read exclusively by
-- request-otp/verify-otp/change-password (service_role). A client has no legitimate reason to
-- ever see a code hash or another user's OTP state.

create index security_otp_tokens_user_purpose_idx
  on security_otp_tokens (user_id, purpose, created_at desc);

create table rate_limit_hits (
  bucket_key text not null,       -- e.g. 'otp:' || user_id, or 'otp-ip:' || ip
  window_start timestamptz not null,
  hit_count int not null default 1,
  primary key (bucket_key, window_start)
);
alter table rate_limit_hits enable row level security;
-- Same posture: service_role only, via _shared/rate-limit.ts. Nothing here is meaningful to a
-- client, and nothing about it should be client-writable (that would defeat the point).

-- notifications: the general-suspension reactivation flow (verify-payment /
-- paystack-webhook with purpose='suspension_reactivation') needs its own notification type —
-- reusing 'payment_success' would read as "you unlocked a department," which this isn't.
alter type notification_type add value 'account_reactivated';
