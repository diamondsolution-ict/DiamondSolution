-- ============================================================================
-- Static admin step-up code — replaces the email-OTP step-up challenge for admin-destructive
-- actions (Users tab suspend/role-change/delete, Affiliates tab commission approval) at the
-- user's explicit request: email-OTP delivery depends on Resend being configured correctly,
-- which was a recurring support headache for a one-or-two-admin back office, and a simple
-- admin-entered code is judged a more workable trade-off here. `password_change` step-up
-- (Account Settings) is untouched — still email-OTP via security_otp_tokens.
--
-- The code itself is never readable by any client role, admin included — only service_role
-- (inside the admin-verify-stepup-code / admin-set-stepup-code Edge Functions) ever touches
-- this table, same posture as payments/commissions/security_otp_tokens. No select/write policy
-- at all is intentional, not an oversight.
--
-- Default code is "12345" (hashed with the same sha256Hex() the Edge Functions use to check
-- it) — change it from Admin → Settings before relying on this in production.
-- ============================================================================

create table admin_stepup_code (
  id int primary key default 1 check (id = 1), -- singleton row
  code_hash text not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table admin_stepup_code enable row level security;
-- No select/write policy for any client role — service_role only, same posture as
-- security_otp_tokens/payments/commissions.

create trigger admin_stepup_code_set_updated_at
  before update on admin_stepup_code
  for each row execute function set_updated_at();

-- sha256("12345")
insert into admin_stepup_code (id, code_hash) values (
  1,
  '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5'
);
