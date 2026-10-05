-- ============================================================================
-- Admin Analytics tab (FUNCTIONAL_SPEC.md §20.9, old app) — the parts this schema can
-- actually support today. Narrow security-definer aggregates, same posture as
-- admin_dashboard_stats()/admin_revenue_by_department().
--
-- NOT included: "Visit Frequency / Peak Hours" — that needs `login_events`
-- (02-DATA-MODEL-AND-SECURITY.md §7), which is Phase 5 (device/session policy) and not built
-- yet. Nothing to aggregate until that table exists; the admin UI should say so rather than
-- fake a chart with zeros.
-- ============================================================================

create or replace function admin_analytics_overview()
returns table (
  paid_enrollments bigint,
  avg_enrollment_ngn numeric,
  suspension_rate numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_total int;
  v_suspended int;
begin
  if not is_moderator_or_admin() then
    raise exception 'Admin or moderator access required.';
  end if;

  select count(*) into v_total from profiles;
  select count(*) into v_suspended from profiles where status = 'suspended';

  return query
  select
    (select count(*) from access_grants),
    (select coalesce(avg(amount), 0) from payments where status = 'success' and currency = 'NGN'),
    case when v_total = 0 then 0 else round(v_suspended::numeric / v_total * 100, 1) end;
end;
$$;

-- 12 months of the current calendar year, NGN only (matches admin_revenue_by_department's
-- same NGN-only posture — see that function's comment).
create or replace function admin_revenue_history_monthly()
returns table (month int, amount numeric)
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
  select m.month, coalesce(sum(p.amount), 0)
  from generate_series(1, 12) as m(month)
  left join payments p
    on extract(month from p.created_at) = m.month
    and extract(year from p.created_at) = extract(year from now())
    and p.status = 'success'
    and p.currency = 'NGN'
  group by m.month
  order by m.month;
end;
$$;

create or replace function admin_most_active_scholars(p_days int default 30)
returns table (
  user_id uuid,
  display_name text,
  department_name text,
  attempted bigint,
  correct bigint,
  study_seconds bigint
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
    p.user_id,
    coalesce(pr.display_name, 'Scholar'),
    d.name,
    sum(p.attempted),
    sum(p.correct),
    sum(p.study_duration_seconds)
  from daily_practice_stats p
  join profiles pr on pr.user_id = p.user_id
  left join departments d on d.id = pr.department_id
  where p.practice_date >= current_date - p_days
  group by p.user_id, pr.display_name, d.name
  order by sum(p.attempted) desc
  limit 10;
end;
$$;
