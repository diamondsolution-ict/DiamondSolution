-- ============================================================================
-- Flexible-payment option: a student can pay a department's full price at once (unchanged), or
-- split it into 3 instalments — pay 1/3 now for immediate full department access, the 2nd
-- 1/3 within 30 days, the 3rd within 30 days after that (60 days total). Explicitly requested:
-- the price itself never changes and this is never a monthly subscription, just a way to start
-- for less. The split is computed from whatever department_pricing.amount is at the moment a
-- plan starts — never a hardcoded figure — so a later price change (e.g. 15,000 -> 20,000)
-- automatically changes what "pay in 3" means for new plans without any code change.
--
-- Deliberately NO new "locked" flag or scheduled job: missing a due date is just the existing
-- access_grants.expires_at lapsing, exactly like today's yearly expiry — has_department_access()
-- needs zero changes. Each instalment simply extends access_grants.expires_at a little further
-- (30 days for instalment 1 and 2, the real department duration for instalment 3) using the
-- exact same "extend from whichever is later, now or the current expiry" formula
-- processDepartmentAccessPayment() already uses for renewals. Paying a dues instalment late just
-- restores access immediately with a fresh window to the next one — no penalty, no waiting
-- period (unlike the unrelated device-unlock flow's 24h rule) — this is meant to be the more
-- forgiving option, not a stricter one.
--
-- A student can have more than one plan row over time for the same department (e.g. finishing
-- one, letting the year lapse, and starting a fresh instalment plan on renewal) — there is no
-- uniqueness constraint; the backend always reads the most recently created row.
-- ============================================================================

create table department_payment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  department_id uuid not null references departments(id),
  -- Snapshotted at plan creation from department_pricing — locked in for this plan even if the
  -- admin changes the price later, same "students who already paid keep their terms" principle
  -- used for the yearly-access migration.
  total_amount numeric(12, 2) not null check (total_amount > 0),
  currency text not null check (currency in ('NGN', 'USD')),
  -- The amount for instalments 1 and 2; instalment 3 is total_amount minus 2x this, so the
  -- three always sum to exactly total_amount regardless of rounding.
  installment_amount numeric(12, 2) not null check (installment_amount > 0),
  access_duration_days int,
  installments_paid int not null default 0 check (installments_paid between 0 and 3),
  started_at timestamptz,
  -- The deadline for the next unpaid instalment; null once installments_paid = 3. Kept exactly
  -- in sync with this plan's access_grants row's own expires_at while a plan is incomplete, so
  -- the UI can show "next payment due" without re-deriving it.
  next_due_at timestamptz,
  created_at timestamptz not null default now()
);
alter table department_payment_plans enable row level security;
create index department_payment_plans_user_dept_idx
  on department_payment_plans (user_id, department_id, created_at desc);

create policy "payment_plans_select_own_or_staff"
  on department_payment_plans for select
  using (user_id = auth.uid() or is_moderator_or_admin());
-- Deliberately no write policy — service_role only (Edge Functions), same reasoning as
-- payments/access_grants: the client never self-reports what it paid.

alter table payments add column installment_number int check (installment_number between 1 and 3);
alter table payments add column payment_plan_id uuid references department_payment_plans(id);
