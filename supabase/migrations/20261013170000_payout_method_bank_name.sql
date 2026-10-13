-- Adding a payout method now resolves the financial institution's name (from Paystack's bank
-- list) alongside its code, and the account name is read back from Paystack's account
-- resolution rather than typed by hand — bank_name lets the UI show "GTBank · 0123456789"
-- instead of just the raw code everywhere a payout method is displayed (Affiliate, admin
-- Withdrawals, admin Affiliates). Nullable: existing rows (bank_code only) are untouched.

alter table payout_methods add column bank_name text;
