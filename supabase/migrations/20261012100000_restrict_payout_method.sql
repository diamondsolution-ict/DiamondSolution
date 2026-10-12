-- ============================================================================
-- Restrict payout methods to bank_transfer only (the one request-payout actually pays out
-- automatically via Paystack's Transfer API for NGN) — PayPal/USDT/international wire are
-- dropped as options. Existing rows with those methods, if any, are left untouched (never
-- silently delete real financial data); they just can't be created anymore, and the UI no
-- longer offers them.
-- ============================================================================

alter table payout_methods drop constraint payout_methods_method_check;
-- NOT VALID: don't fail this migration if a pre-existing row already has a now-disallowed
-- method (PayPal/USDT/wire) — that historical data stays exactly as it was, just can't be
-- created again going forward.
alter table payout_methods add constraint payout_methods_method_check
  check (method = 'bank_transfer') not valid;
