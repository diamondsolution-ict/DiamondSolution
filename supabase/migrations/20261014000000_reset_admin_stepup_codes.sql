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
--
-- Supabase-hosted projects install pgcrypto into the `extensions` schema rather than `public`
-- (unlike a plain local Postgres, where `create extension if not exists pgcrypto;` lands it in
-- `public`) — this is the first migration in this project to call a pgcrypto function directly
-- rather than relying on gen_random_uuid(), which has been core Postgres since v13 and needs no
-- extension at all. Adding `extensions` to the search path (silently a no-op if that schema
-- doesn't exist, as on a plain local Postgres) makes `digest()` resolve in both.
-- ============================================================================

-- Not `set local`: that's transaction-scoped, and each statement here auto-commits
-- individually outside an explicit BEGIN, so a `local` setting would already have expired
-- before the INSERT below ran. A plain `set` persists for the rest of this session instead.
set search_path = public, extensions;

insert into admin_stepup_code (user_id, code_hash)
select ur.user_id, encode(digest('12345', 'sha256'), 'hex')
from user_roles ur
where ur.role = 'admin'
on conflict (user_id) do update
  set code_hash = excluded.code_hash,
      updated_by = null;
