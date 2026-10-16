-- ============================================================================
-- Policy change at explicit request: department access is no longer lifetime by default — it
-- now expires 1 year (365 days) after purchase. The mechanism for this already existed and was
-- unused: department_pricing.access_duration_days (null = lifetime) has been read by
-- processDepartmentAccessPayment since the very first migration, and has_department_access()
-- already does `is_admin() or exists(... and (expires_at is null or expires_at > now()))` — so
-- admins already get unconditional lifetime access regardless of any access_grants row, with no
-- change needed there. The only thing actually missing was ever setting
-- access_duration_days to a non-null value; the admin UI (AdminDepartments.tsx) now exposes it
-- too, defaulting new departments to 365 going forward.
--
-- department_pricing is an append-only price-history table (the admin UI already never updates
-- a row in place — a changed amount becomes a new row so every price ever actually charged
-- stays on record). This follows that same convention: for every department/currency that has
-- a price today, insert a new row with the SAME amount (no price change) but
-- access_duration_days = 365, effective_from = now(). That makes every purchase FROM THIS POINT
-- ON yearly, without rewriting history.
--
-- Deliberately NOT retroactive: a student who already paid under the old lifetime terms keeps
-- their existing access_grants row exactly as it is (expires_at stays null for them) — this
-- only changes what a NEW purchase grants, not what already-paying students bought.
-- ============================================================================

insert into department_pricing (department_id, currency, amount, access_duration_days)
select distinct on (department_id, currency)
  department_id, currency, amount, 365
from department_pricing
where effective_from <= now()
order by department_id, currency, effective_from desc;
