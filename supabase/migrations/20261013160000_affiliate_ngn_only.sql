-- ============================================================================
-- The affiliate program drops USD entirely — commission, payout methods, and withdrawals
-- are NGN-only going forward (there's no FX rate to convert a USD-priced department purchase
-- into an NGN commission, and payouts only ever settled over Paystack's NGN Transfer API
-- anyway — see 20261012100000_restrict_payout_method.sql). creditReferralCommission() in
-- processPayment.ts now skips crediting a commission at all when the triggering payment wasn't
-- NGN, so no new non-NGN commission row is ever minted.
--
-- Same non-destructive posture as 20261012100000_restrict_payout_method.sql: existing USD rows
-- in payout_methods/withdrawals, if any, are left exactly as they are (real financial history
-- is never silently altered or deleted) — they just can't be created anymore.
-- ============================================================================

alter table payout_methods drop constraint payout_methods_currency_check;
alter table payout_methods add constraint payout_methods_currency_check
  check (currency = 'NGN') not valid;

alter table withdrawals drop constraint withdrawals_currency_check;
alter table withdrawals add constraint withdrawals_currency_check
  check (currency = 'NGN') not valid;

-- min_withdrawal_usd is now unreachable (no USD withdrawal can be created to compare it
-- against, and Admin → Settings no longer exposes it) — the minimum check simplifies to NGN
-- only, and the column is dropped rather than left behind as dead state.
create or replace function enforce_withdrawal_minimum()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min numeric(12, 2);
begin
  select min_withdrawal_ngn into v_min from app_settings where id = 1;

  if v_min is not null and new.amount < v_min then
    raise exception 'Minimum withdrawal is % %.', v_min, new.currency;
  end if;

  return new;
end;
$$;

alter table app_settings drop column min_withdrawal_usd;
