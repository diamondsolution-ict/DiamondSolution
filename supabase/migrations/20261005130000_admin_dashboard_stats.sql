-- ============================================================================
-- Admin Dashboard "Overview" tab support (FUNCTIONAL_SPEC.md §20.3, old app). Narrow
-- security-definer aggregates, same posture as admin_list_emails/leaderboard() — correct,
-- single-round-trip SQL aggregates rather than pulling rows client-side and summing in JS
-- (which would silently undercount once a table passes whatever row limit a client query used).
--
-- Two of the old app's 7 stat cards aren't reproduced:
-- - "Pending Affiliates" doesn't map to this schema — 03-BUSINESS-RULES-REDESIGN.md §1
--   deliberately removed the dead 'pending' affiliate status the old app never actually set.
--   Replaced with "Active Affiliates" (affiliate_profiles.status = 'active'), the real
--   equivalent concept here.
-- - "Support Queries" (unread chat count) isn't reproduced — chat itself isn't built yet
--   (04-ROADMAP.md Phase 4, deferred on purpose). Nothing to count.
-- ============================================================================

create or replace function admin_dashboard_stats()
returns table (
  total_students bigint,
  suspended_students bigint,
  revenue_ngn numeric,
  revenue_usd numeric,
  paid_out_ngn numeric,
  paid_out_usd numeric,
  active_affiliates bigint,
  pending_payouts bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_moderator_or_admin() then
    raise exception 'Admin or moderator access required.';
  end if;

  return query
  select
    (select count(*) from profiles),
    (select count(*) from profiles where status = 'suspended'),
    (select coalesce(sum(amount), 0) from payments where status = 'success' and currency = 'NGN'),
    (select coalesce(sum(amount), 0) from payments where status = 'success' and currency = 'USD'),
    (select coalesce(sum(amount), 0) from withdrawals where status = 'success' and currency = 'NGN'),
    (select coalesce(sum(amount), 0) from withdrawals where status = 'success' and currency = 'USD'),
    (select count(*) from affiliate_profiles where status = 'active'),
    (select count(*) from withdrawals where status = 'pending');
end;
$$;

-- Top N departments by successful-payment revenue, NGN-only (matches the old app's dashboard
-- panel, which only ever displayed Naira figures there too — department_access payments are
-- predominantly NGN in practice; a USD breakdown would need its own panel, not a mixed sum).
create or replace function admin_revenue_by_department(p_limit int default 6)
returns table (
  department_id uuid,
  department_name text,
  enrolled_count bigint,
  total_amount numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_moderator_or_admin() then
    raise exception 'Admin or moderator access required.';
  end if;

  return query
  select d.id, d.name, count(p.id), coalesce(sum(p.amount), 0)
  from departments d
  join payments p on p.department_id = d.id
  where p.status = 'success' and p.currency = 'NGN'
  group by d.id, d.name
  order by coalesce(sum(p.amount), 0) desc
  limit p_limit;
end;
$$;
