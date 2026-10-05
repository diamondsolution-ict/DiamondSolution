// Shared by verify-payment (client-triggered) and paystack-webhook (push-based), mirroring
// processDepartmentAccessPayment's shape exactly (see that file's header comment) — whichever
// reaches "success" first wins; the unique constraint on payments(provider, provider_reference)
// makes the second arrival a no-op.
//
// This is the old app's FUNCTIONAL_SPEC.md §9.1 "general suspended" flow only — the §9.2
// device-blocked sub-flow (24h lockout + fee) is deliberately not reproduced at all; see
// 03-BUSINESS-RULES-REDESIGN.md §2, which replaces that entire mechanic with plain
// concurrent-session eviction (Phase 5, no fee). A plain suspension reactivates immediately on
// confirmed payment — no OTP step, matching the old behavior exactly (only the device-blocked
// path ever needed one, and that path no longer exists).
import { serviceClient, HttpError } from "./supabaseClients.ts";
import type { PaystackVerifyResult } from "./paystack.ts";
import { notify } from "./notify.ts";

// Pending an app_settings table (same posture as COMMISSION_RATE/MIN_WITHDRAWAL elsewhere in
// this codebase) — see 03-BUSINESS-RULES-REDESIGN.md's summary table: these move to
// app_settings.reactivation_fee_ngn / reactivation_fee_usd / ngn_usd_fallback_rate once that
// table exists, kept as named constants rather than re-discovered magic numbers until then.
const REACTIVATION_FEE_NGN = 1000;
const REACTIVATION_FEE_USD = 2;
const NGN_USD_FALLBACK_RATE = 1500;

interface ProcessArgs {
  reference: string;
  userId: string;
  paystack: PaystackVerifyResult;
}

export async function processReactivationPayment({
  reference,
  userId,
  paystack,
}: ProcessArgs) {
  const db = serviceClient();

  const { data: existing } = await db
    .from("payments")
    .select("id, status")
    .eq("provider", "paystack")
    .eq("provider_reference", reference)
    .maybeSingle();

  if (existing?.status === "success") {
    return { alreadyProcessed: true };
  }

  async function recordFailure(reason: string): Promise<never> {
    const row = {
      user_id: userId,
      provider: "paystack",
      provider_reference: reference,
      purpose: "suspension_reactivation" as const,
      amount: paystack.data?.amount ? paystack.data.amount / 100 : 1,
      currency: paystack.data?.currency ?? "NGN",
      status: "failed" as const,
      verified_at: new Date().toISOString(),
      raw_provider_response: { ...paystack.data, _failure_reason: reason },
    };
    if (existing) {
      await db.from("payments").update(row).eq("id", existing.id);
    } else {
      await db.from("payments").insert(row);
    }
    await notify({
      db,
      userId,
      type: "payment_failed",
      title: "Reactivation payment failed",
      body: reason,
    });
    throw new HttpError(402, reason);
  }

  if (!paystack.status || paystack.data.status !== "success") {
    await recordFailure("Payment was not successful.");
  }
  if (paystack.data.currency !== "NGN") {
    // Matches the old app's actual behavior exactly: even a "USD-priced" reactivation is
    // charged through Paystack in Naira — there is no real USD charge path here.
    await recordFailure("Reactivation payments are charged in NGN only.");
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("status, currency")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError || !profile) {
    await recordFailure("Profile not found.");
    return; // unreachable — recordFailure always throws — keeps TS's control-flow happy
  }
  if (profile.status !== "suspended") {
    await recordFailure("Account is not currently suspended.");
    return;
  }

  const feeNaira =
    profile.currency === "NGN"
      ? REACTIVATION_FEE_NGN
      : REACTIVATION_FEE_USD * NGN_USD_FALLBACK_RATE;
  const expectedKobo = Math.round(feeNaira * 100);
  if (paystack.data.amount !== expectedKobo) {
    await recordFailure(
      `Amount mismatch: paid ${paystack.data.amount}, expected ${expectedKobo}.`,
    );
  }

  const paymentRow = existing
    ? await db
        .from("payments")
        .update({
          status: "success",
          verified_at: new Date().toISOString(),
          raw_provider_response: paystack.data,
        })
        .eq("id", existing.id)
        .select("id")
        .single()
    : await db
        .from("payments")
        .insert({
          user_id: userId,
          provider: "paystack",
          provider_reference: reference,
          purpose: "suspension_reactivation",
          amount: feeNaira,
          currency: "NGN",
          status: "success",
          verified_at: new Date().toISOString(),
          raw_provider_response: paystack.data,
        })
        .select("id")
        .single();

  if (paymentRow.error || !paymentRow.data) {
    throw new HttpError(
      500,
      paymentRow.error?.message ?? "Failed to record payment.",
    );
  }

  const { error: reactivateError } = await db
    .from("profiles")
    .update({ status: "active", suspension_reason: null })
    .eq("user_id", userId);
  if (reactivateError) throw new HttpError(500, reactivateError.message);

  await notify({
    db,
    userId,
    type: "account_reactivated",
    title: "Account reactivated",
    body: "Your reactivation payment was confirmed — your account is active again.",
  });

  return { alreadyProcessed: false };
}
