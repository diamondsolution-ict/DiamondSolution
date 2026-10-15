// Starts a department-access checkout for the mobile app: looks up the real current price
// server-side (never trusts a client amount) and asks Paystack for a hosted checkout URL.
// The app then opens that URL in a WebView and calls verify-payment with the reference, so
// access is still only ever granted by the same server-verified path the website uses.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  serviceClient,
  verifyUser,
  HttpError,
} from "../_shared/supabaseClients.ts";
import { initializePaystackTransaction } from "../_shared/paystack.ts";

// Paystack redirects here when checkout finishes. Never actually loaded — the app intercepts
// the navigation — so it only has to be a valid https URL.
const CALLBACK_URL = "https://diamondsolution.app/payment-complete";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const user = await verifyUser(req);
    const { department_id } = await req.json();
    if (!department_id) throw new HttpError(400, "department_id is required.");
    if (!user.email) throw new HttpError(400, "Your account has no email address.");

    const db = serviceClient();

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

    const reference = `dept_${department_id}_${user.id}_${Date.now()}`;
    const result = await initializePaystackTransaction({
      email: user.email,
      amountKobo: Math.round(Number(priceRow.amount) * 100),
      reference,
      callbackUrl: CALLBACK_URL,
      metadata: { user_id: user.id, department_id, custom_fields: [] },
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
