-- ============================================================================
-- Department access is a YEARLY fee, not a one-time one (see
-- 20261016000000_department_access_now_yearly.sql, which set 365 on every existing price).
-- That migration only fixed rows that existed at the time; a price row inserted later without an
-- explicit duration (the seed scripts, a manual insert, any future tool) would still come out
-- with access_duration_days = NULL — i.e. lifetime — silently contradicting the policy.
--
-- Make a year the default for new rows. An explicit NULL is still stored as NULL, so the admin
-- screen's "leave blank for lifetime access" option keeps working when someone really means it.
-- Existing rows are untouched; metadata-only change, no table rewrite, no lock beyond a catalog
-- update.
-- ============================================================================

alter table department_pricing
  alter column access_duration_days set default 365;

comment on column department_pricing.access_duration_days is
  'Days of access one payment buys (365 = a yearly fee, the default); NULL = lifetime access.';
