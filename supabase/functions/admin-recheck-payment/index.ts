// Lets staff force a fresh, live check of a Paystack reference against Paystack itself —
// for a student who reports "I paid but it's not showing", or to confirm whether a reference
// genuinely failed rather than just never reaching verify-payment/the webhook (closed browser,
// flaky network, a webhook that was briefly misconfigured). Reuses the exact same
// processDepartmentAccessPayment/processReactivationPayment logic verify-payment and
// paystack-webhook already use, so a reference that turns out to actually be a success is
// recorded and granted access immediately, not just reported — and it's idempotent for the
// same reason those two call sites are (the unique constraint on
// payments(provider, provider_reference)), so rechecking an already-settled reference is safe.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  anonClient,
  serviceClient,
  verifyUser,
  HttpError,
} from "../_shared/supabaseClients.ts";
import { verifyPaystackTransaction } from "../_shared/paystack.ts";
import { processDepartmentAccessPayment } from "../_shared/processPayment.ts";
import { processReactivationPayment } from "../_shared/processReactivation.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    await verifyUser(req);
    const authHeader = req.headers.get("Authorization")!;
    const { data: isStaff } = await anonClient(authHeader).rpc(
      "is_moderator_or_admin",
    );
    if (!isStaff) throw new HttpError(403, "Admin or moderator access required.");

    const { reference } = await req.json();
    if (!reference) throw new HttpError(400, "reference is required.");

    const paystack = await verifyPaystackTransaction(reference);
    if (!paystack.status) {
      throw new HttpError(
        404,
        "Paystack has no transaction matching this reference.",
      );
    }

    const db = serviceClient();

    // Recover identity from whichever source has it: our own prior row for this reference (if
    // verify-payment or the webhook already touched it), else Paystack's own metadata (set at
    // checkout time) — covers a reference that never reached our DB at all.
    const { data: existing } = await db
      .from("payments")
      .select("user_id, department_id, purpose")
      .eq("provider", "paystack")
      .eq("provider_reference", reference)
      .maybeSingle();

    const metadata = (paystack.data.metadata ?? {}) as Record<string, unknown>;
    const userId = existing?.user_id ?? (metadata.user_id as string | undefined);
    const departmentId =
      existing?.department_id ?? (metadata.department_id as string | undefined);
    const purpose =
      existing?.purpose ??
      (metadata.purpose as string | undefined) ??
      "department_access";

    if (!userId) {
      throw new HttpError(
        422,
        "Could not determine which student this belongs to — no stored record for this " +
          "reference, and Paystack's own metadata is missing a user_id.",
      );
    }

    let result: { alreadyProcessed: boolean };
    if (purpose === "suspension_reactivation") {
      result = await processReactivationPayment({ reference, userId, paystack });
    } else {
      if (!departmentId) {
        throw new HttpError(
          422,
          "Could not determine which department this belongs to — no stored record for " +
            "this reference, and Paystack's own metadata is missing a department_id.",
        );
      }
      result = await processDepartmentAccessPayment({
        reference,
        userId,
        departmentId,
        paystack,
      });
    }

    return jsonResponse({
      success: true,
      paystackStatus: paystack.data.status,
      ...result,
    });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
