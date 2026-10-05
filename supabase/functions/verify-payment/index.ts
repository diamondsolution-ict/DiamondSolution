import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { verifyUser, HttpError } from "../_shared/supabaseClients.ts";
import { verifyPaystackTransaction } from "../_shared/paystack.ts";
import { processDepartmentAccessPayment } from "../_shared/processPayment.ts";
import { processReactivationPayment } from "../_shared/processReactivation.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const user = await verifyUser(req);
    // purpose defaults to 'department_access' — every caller before this flow existed (the
    // course-paywall checkout) never sent it and still shouldn't have to.
    const { reference, department_id, purpose = "department_access" } =
      await req.json();

    if (!reference) {
      throw new HttpError(400, "reference is required.");
    }

    const paystack = await verifyPaystackTransaction(reference);

    let result;
    if (purpose === "suspension_reactivation") {
      result = await processReactivationPayment({
        reference,
        userId: user.id,
        paystack,
      });
    } else {
      if (!department_id) {
        throw new HttpError(400, "department_id is required.");
      }
      result = await processDepartmentAccessPayment({
        reference,
        userId: user.id,
        departmentId: department_id,
        paystack,
      });
    }

    return jsonResponse({ success: true, ...result });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
