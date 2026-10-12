-- ============================================================================
-- withdrawals had no server-side check that a requested amount doesn't exceed the
-- affiliate's actual earned balance — only client-side validation (Affiliate.tsx), which is
-- not a security boundary (any direct API call bypasses it entirely). Nothing stood between a
-- student requesting an arbitrarily large withdrawal and an admin's "Pay via Paystack" button
-- actually sending real money via the Transfer API (request-payout Edge Function never
-- re-checks balance either).
--
-- affiliate_balances.total_withdrawn already sums every non-'failed' withdrawal (pending
-- included), so checking a new request's amount against the CURRENT balance here already
-- correctly accounts for other pending requests too — the view was clearly designed with this
-- check in mind, it just was never wired up.
-- ============================================================================

create or replace function enforce_withdrawal_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(12, 2);
begin
  select balance into v_balance
  from affiliate_balances
  where user_id = new.user_id and currency = new.currency;

  -- No affiliate_balances row at all means zero earned activity in this currency (the view
  -- filters those out), not an unlimited balance.
  if new.amount > coalesce(v_balance, 0) then
    raise exception
      'Withdrawal amount (% %) exceeds available balance (% %).',
      new.amount, new.currency, coalesce(v_balance, 0), new.currency;
  end if;

  return new;
end;
$$;

create trigger withdrawals_enforce_balance
  before insert on withdrawals
  for each row execute function enforce_withdrawal_balance();
