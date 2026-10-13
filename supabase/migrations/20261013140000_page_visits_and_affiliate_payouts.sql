-- ============================================================================
-- Real data source for the admin Analytics tab's "Total Visits / Unique Visitors /
-- Avg Visits per Visitor / Page Visits Over Time / Peak Visit Hours" sections, which the
-- 20261005150000_admin_analytics.sql migration deliberately left out — at the time there was
-- no visit data to aggregate, and faking a chart with zeros was rejected in favor of an honest
-- "not available yet" message. This migration is that real data source: one row per page view
-- inside the student-facing app, logged client-side (see src/components/Layout.tsx), so the
-- numbers the dashboard shows are genuinely observed traffic from here on — not backfilled or
-- invented for dates before this shipped.
--
-- tz_offset_minutes captures each visitor's own JS Date.getTimezoneOffset() at insert time, so
-- "Peak Visit Hours" can be computed in visitors' local time rather than the server's UTC clock
-- (matches the old app's "(Local Time)" framing).
-- ============================================================================

create table page_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  tz_offset_minutes int not null default 0,
  created_at timestamptz not null default now()
);
alter table page_visits enable row level security;

create index idx_page_visits_created_at on page_visits (created_at);
create index idx_page_visits_user_id_created_at on page_visits (user_id, created_at);

-- Any signed-in user can log their own visits; nobody can read this table directly (no select
-- policy) — it's only readable through the admin-gated aggregates below, same posture as
-- payments/commissions.
create policy "page_visits_insert_own"
  on page_visits for insert
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------------------------

create or replace function admin_visit_overview(p_days int default 30)
returns table (
  total_visits bigint,
  unique_visitors bigint,
  avg_visits_per_visitor numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_total bigint;
  v_unique bigint;
begin
  if not is_moderator_or_admin() then
    raise exception 'Admin or moderator access required.';
  end if;

  select count(*), count(distinct user_id)
    into v_total, v_unique
  from page_visits
  where created_at >= now() - (p_days || ' days')::interval;

  return query
  select
    v_total,
    v_unique,
    case when v_unique = 0 then 0 else round(v_total::numeric / v_unique, 1) end;
end;
$$;

create or replace function admin_visits_daily(p_days int default 30)
returns table (visit_date date, visits bigint)
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
  select d.visit_date::date, count(pv.id)
  from generate_series(
    current_date - (p_days - 1),
    current_date,
    interval '1 day'
  ) as d(visit_date)
  left join page_visits pv on pv.created_at::date = d.visit_date::date
  group by d.visit_date
  order by d.visit_date;
end;
$$;

-- Buckets by each visitor's own local hour (created_at shifted by their captured offset), not
-- the server's UTC hour.
create or replace function admin_visit_peak_hours(p_days int default 30)
returns table (hour_of_day int, visits bigint)
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
    h.hour_of_day,
    count(pv.id)
  from generate_series(0, 23) as h(hour_of_day)
  left join page_visits pv
    on extract(
         hour from (pv.created_at - (pv.tz_offset_minutes || ' minutes')::interval)
       )::int = h.hour_of_day
    and pv.created_at >= now() - (p_days || ' days')::interval
  group by h.hour_of_day
  order by h.hour_of_day;
end;
$$;

-- ----------------------------------------------------------------------------------------------
-- Affiliate Payouts (Annual) — same shape/posture as admin_revenue_history_monthly(), reading
-- paid commissions instead of successful payments. NGN only, same reasoning as that function.
-- ----------------------------------------------------------------------------------------------

create or replace function admin_affiliate_payouts_monthly()
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
  select m.month, coalesce(sum(c.commission_amount), 0)
  from generate_series(1, 12) as m(month)
  left join commissions c
    on extract(month from c.paid_at) = m.month
    and extract(year from c.paid_at) = extract(year from now())
    and c.status = 'paid'
    and c.commission_currency = 'NGN'
  group by m.month
  order by m.month;
end;
$$;
