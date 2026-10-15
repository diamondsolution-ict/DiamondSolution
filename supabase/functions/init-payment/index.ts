// Starts a checkout for the mobile app (department access, device unlock, or suspension
// reactivation): works out the real amount server-side (never trusts a client amount) and
// asks Paystack for a hosted checkout URL.
// The app then opens that URL in a WebView and calls verify-payment with the reference, so
// access is still only ever granted by the same server-verified path the website uses.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  serviceClient,
  verifyUser,
  HttpError,
} from "../_shared/supabaseClients.ts";
import { initializePaystackTransaction } from "../_shared/paystack.ts";

// Keep in sync with processDeviceUnlock.ts / processReactivation.ts (which re-verify the amount
// after payment — these only decide what the checkout is opened for).
const DEVICE_UNLOCK_FEE_NGN = 1000;
const DEVICE_BLOCK_LOCKOUT_HOURS = 24;
const REACTIVATION_FEE_NGN = 1000;
const REACTIVATION_FEE_USD = 2;
const NGN_USD_FALLBACK_RATE = 1500;

// Paystack redirects here when checkout finishes. Never actually loaded — the app intercepts
// the navigation — so it only has to be a valid https URL.
const CALLBACK_URL = "https://diamondsolution.app/payment-complete";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const user = await verifyUser(req);
    const { purpose = "department_access", department_id } = await req.json();
    if (!user.email) throw new HttpError(400, "Your account has no email address.");

    const db = serviceClient();
    let amountNaira: number;
    let reference: string;
    const metadata: Record<string, unknown> = {
      user_id: user.id,
      purpose,
      custom_fields: [],
    };

    if (purpose === "department_access") {
      if (!department_id) throw new HttpError(400, "department_id is required.");
      const { data: department } = await db
        .from("departments")
        .select("id")
        .eq("id", department_id)
        .eq("status", "active")
        .maybeSingle();
      if (!department) throw new HttpError(404, "Department not found.");

      // Same "current price" rule as processDepartmentAccessPayment().
      const { data: priceRow } = await db
        .from("department_pricing")
        .select("amount")
        .eq("department_id", department_id)
        .eq("currency", "NGN")
        .lte("effective_from", new Date().toISOString())
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!priceRow) {
        throw new HttpError(400, "No price configured for this department.");
      }
      amountNaira = Number(priceRow.amount);
      reference = `dept_${department_id}_${user.id}_${Date.now()}`;
      metadata.department_id = department_id;
    } else if (purpose === "device_unlock") {
      // Same rules processDeviceUnlockPayment() enforces after payment — checked here first so
      // nobody is sent to pay for something verify-payment would then reject.
      const { data: profile } = await db
        .from("profiles")
        .select("device_block_started_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.device_block_started_at) {
        throw new HttpError(400, "This account isn't currently device-locked.");
      }
      const eligibleAt =
        new Date(profile.device_block_started_at).getTime() +
        DEVICE_BLOCK_LOCKOUT_HOURS * 60 * 60_000;
      if (Date.now() < eligibleAt) {
        throw new HttpError(
          400,
          `The 24-hour lock hasn't elapsed yet — try again after ${new Date(eligibleAt).toISOString()}.`,
        );
      }
      amountNaira = DEVICE_UNLOCK_FEE_NGN;
      reference = `device_unlock_${user.id}_${Date.now()}`;
    } else if (purpose === "suspension_reactivation") {
      const { data: profile } = await db
        .from("profiles")
        .select("status, currency")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.status !== "suspended") {
        throw new HttpError(400, "Account is not currently suspended.");
      }
      amountNaira =
        profile.currency === "NGN"
          ? REACTIVATION_FEE_NGN
          : REACTIVATION_FEE_USD * NGN_USD_FALLBACK_RATE;
      reference = `reactivate_${user.id}_${Date.now()}`;
    } else {
      throw new HttpError(400, "Unknown payment purpose.");
    }

    const result = await initializePaystackTransaction({
      email: user.email,
      amountKobo: Math.round(amountNaira * 100),
      reference,
      callbackUrl: CALLBACK_URL,
      metadata,
    });
    if (!result.status) {
      throw new HttpError(502, result.message || "Could not start checkout.");
    }

    return jsonResponse({
      success: true,
      authorization_url: result.data.authorization_url,
      reference: result.data.reference,
      callback_url: CALLBACK_URL,
    });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
