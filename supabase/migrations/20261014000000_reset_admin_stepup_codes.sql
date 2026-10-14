-- ============================================================================
-- One-time reset: every current admin's personal step-up code (see
-- 20261013180000_per_admin_stepup_code.sql) is set to a shared temporary code, 12345, at
-- explicit request, so any admin who doesn't know their current code — most were only ever
-- seeded with the OLD single shared code, and some may never have personalized it — can get
-- back into the admin area. admin-set-stepup-code's "change" path (Admin -> Settings) requires
-- the CURRENT code as confirmation, so after this, 12345 is what each admin enters as their
-- current code if they want to set their own.
--
-- encode(digest('12345', 'sha256'), 'hex') is the same lowercase-hex SHA-256 encoding
-- supabase/functions/_shared/otp.ts's sha256Hex() computes in JS, so this matches exactly what
-- admin-verify-stepup-code/admin-set-stepup-code compare against.
-- ============================================================================

insert into admin_stepup_code (user_id, code_hash)
select ur.user_id, encode(digest('12345', 'sha256'), 'hex')
from user_roles ur
where ur.role = 'admin'
on conflict (user_id) do update
  set code_hash = excluded.code_hash,
      updated_by = null;
