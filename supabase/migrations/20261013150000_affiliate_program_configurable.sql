-- ============================================================================
-- Makes the affiliate program's two hardcoded constants (COMMISSION_RATE in
-- _shared/processPayment.ts, MIN_WITHDRAWAL in Affiliate.tsx) admin-editable, and adds the
-- referral-visibility + payout-automation pieces requested alongside them. This is exactly the
-- "app_settings... that rewiring is its own follow-up, not bundled into this pass" deferred in
-- 20261005120000_quotes_and_institutional_links.sql's header — this migration is that
-- follow-up, scoped to the two constants actually being rewired this time (reactivation fee
-- stays a hardcoded constant for now, same as before).
-- ============================================================================

create table app_settings (
  id int primary key default 1 check (id = 1), -- singleton row, same pattern as institutional_links
  commission_rate numeric(4, 3) not null default 0.250 check (commission_rate >= 0 and commission_rate <= 1),
  min_withdrawal_ngn numeric(12, 2) not null default 10000 check (min_withdrawal_ngn > 0),
  min_withdrawal_usd numeric(12, 2) not null default 10 check (min_withdrawal_usd > 0),
  -- When true, admin "Pay via Paystack" on an eligible (NGN + bank_transfer) withdrawal actually
  -- calls the Transfer API. When false, every withdrawal — eligible or not — must be settled
  -- with "Mark as paid manually", so a payout only ever happens because an admin confirmed it
  -- happened, not because this app's own API call did.
  withdrawal_auto_payout_enabled boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;

-- Seeded with today's actual hardcoded values — editing this table changes nothing about
-- current behavior until an admin deliberately saves a new value.
insert into app_settings (id) values (1);

create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();

-- Readable by anyone (same posture as institutional_links_select_public — none of this is
-- sensitive: Affiliate.tsx shows the live commission rate/minimums, and the commission-crediting
-- code reads it via service_role, which bypasses RLS regardless). Admin-only write — same
-- narrower-than-moderator posture as institutional_links, since this has direct financial effect.
create policy "app_settings_select_public"
  on app_settings for select
  using (true);
create policy "app_settings_write_admin"
  on app_settings for update
  using (is_admin())
  with check (is_admin());

-- ----------------------------------------------------------------------------------------------
-- Minimum withdrawal: was a hardcoded CHECK constraint (currency = 'USD' and amount >= 10) or
-- (currency = 'NGN' and amount >= 10000) — baked into the schema, so an admin could never
-- change it without a migration. Replaced with a BEFORE INSERT trigger that reads the
-- configurable value from app_settings instead, same mechanism as the existing
-- withdrawals_enforce_balance trigger this sits alongside.
-- ----------------------------------------------------------------------------------------------

alter table withdrawals drop constraint withdrawals_check;

create or replace function enforce_withdrawal_minimum()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min numeric(12, 2);
begin
  select case when new.currency = 'NGN' then min_withdrawal_ngn else min_withdrawal_usd end
    into v_min
  from app_settings
  where id = 1;

  if v_min is not null and new.amount < v_min then
    raise exception 'Minimum withdrawal is % %.', v_min, new.currency;
  end if;

  return new;
end;
$$;

create trigger withdrawals_enforce_minimum
  before insert on withdrawals
  for each row execute function enforce_withdrawal_minimum();

-- Note: "referrer can see who registered through their link" is already covered — Affiliate.tsx
-- already queries `referrals` directly (its own select-own-or-staff RLS policy already allows
-- this) and resolves names via the existing public_profile_names() RPC
-- (20261002041845_leaderboard_support.sql). No new RPC needed here.
