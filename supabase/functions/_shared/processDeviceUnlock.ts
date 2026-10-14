// Shared by verify-payment (client-triggered) and paystack-webhook (push-based), mirroring
// processReactivationPayment's shape exactly — whichever reaches "success" first wins; the
// unique constraint on payments(provider, provider_reference) makes the second arrival a no-op.
//
// Pays to lift the 24h device-block set by register_device_login() (see
// 20261013210000_device_login_limits.sql) once a student's account has been locked for signing
// in from a 3rd distinct device. The 24h minimum is enforced here, server-side, independent of
// whatever the client shows — payment made before that mark is rejected outright, so the wait
// can't be skipped by paying early.
import { serviceClient, HttpError } from "./supabaseClients.ts";
import type { PaystackVerifyResult } from "./paystack.ts";
import { notify } from "./notify.ts";

const DEVICE_UNLOCK_FEE_NGN = 1000;
const DEVICE_BLOCK_LOCKOUT_HOURS = 24;

interface ProcessArgs {
  reference: string;
  userId: string;
  paystack: PaystackVerifyResult;
}

export async function processDeviceUnlockPayment({
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
      purpose: "device_unlock" as const,
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
      title: "Device unlock payment failed",
      body: reason,
    });
    throw new HttpError(402, reason);
  }

  if (!paystack.status || paystack.data.status !== "success") {
    await recordFailure("Payment was not successful.");
  }
  if (paystack.data.currency !== "NGN") {
    await recordFailure("Device unlock payments are charged in NGN only.");
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("device_block_started_at, device_epoch")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError || !profile) {
    await recordFailure("Profile not found.");
    return; // unreachable — recordFailure always throws — keeps TS's control-flow happy
  }
  if (!profile.device_block_started_at) {
    await recordFailure("This account isn't currently device-locked.");
    return;
  }
  const unlockEligibleAt =
    new Date(profile.device_block_started_at).getTime() +
    DEVICE_BLOCK_LOCKOUT_HOURS * 60 * 60_000;
  if (Date.now() < unlockEligibleAt) {
    await recordFailure(
      `The 24-hour lock hasn't elapsed yet — try again after ${new Date(unlockEligibleAt).toISOString()}.`,
    );
    return;
  }

  const expectedKobo = Math.round(DEVICE_UNLOCK_FEE_NGN * 100);
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
          purpose: "device_unlock",
          amount: DEVICE_UNLOCK_FEE_NGN,
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

  // Bumping device_epoch resets the distinct-device count to zero going forward — otherwise
  // the very next new device this student ever uses would immediately re-trigger another
  // block. No row-level "epoch + 1" update exists in the JS client, so it's computed from the
  // device_epoch already read above.
  const { error: unlockError } = await db
    .from("profiles")
    .update({
      device_block_started_at: null,
      device_epoch: profile.device_epoch + 1,
      active_device_id: null,
    })
    .eq("user_id", userId);
  if (unlockError) throw new HttpError(500, unlockError.message);

  await notify({
    db,
    userId,
    type: "account_reactivated",
    title: "Account unlocked",
    body: "Your device-unlock payment was confirmed — sign in again to continue.",
  });

  return { alreadyProcessed: false };
}
