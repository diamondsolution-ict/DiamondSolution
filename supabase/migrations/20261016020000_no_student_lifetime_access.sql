-- ============================================================================
-- Two changes at explicit request, reversing two deliberate decisions from earlier today:
--
-- 1. has_department_access() previously exempted only admins (is_admin()) from the expiry
--    check — moderators now get the same unconditional bypass admins already had, matching
--    every other moderator-accessible capability in this schema (is_moderator_or_admin()).
--
-- 2. 20261016000000_department_access_now_yearly.sql was deliberately non-retroactive — a
--    student who'd already paid under the old lifetime terms kept their existing
--    access_grants row untouched (expires_at stayed null), on the reasoning that silently
--    downgrading someone who'd already paid for permanent access would be unfair. Explicitly
--    overridden now: "nobody [but staff] has lifetime access" — every existing student grant
--    with expires_at is null is converted to expire 1 year after its own starts_at (the
--    original purchase date), not 1 year from today. access_grants is only ever written by
--    processDepartmentAccessPayment (verified via grep — no admin "grant free access" tool,
--    no other insert path anywhere in the codebase), so every null-expiry row here really is
--    a real, paid purchase, never a comp/promo grant that might need different treatment.
-- ============================================================================

create or replace function has_department_access(dept uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_moderator_or_admin() or exists (
    select 1 from access_grants
    where user_id = auth.uid()
      and department_id = dept
      and (expires_at is null or expires_at > now())
  );
$$;

update access_grants
set expires_at = starts_at + interval '365 days'
where expires_at is null;
