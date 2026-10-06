import { jsonResponse } from "../_shared/cors.ts";
import { verifyPaystackSignature, verifyPaystackTransaction } from "../_shared/paystack.ts";
import { processDepartmentAccessPayment } from "../_shared/processPayment.ts";
import { processReactivationPayment } from "../_shared/processReactivation.ts";

// Paystack calls this directly — no user JWT, no CORS preflight expected (server-to-server).
// Authenticity comes entirely from the x-paystack-signature header, verified below.
Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!(await verifyPaystackSignature(rawBody, signature))) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  const event = JSON.parse(rawBody);

  // Also act on charge.failed — previously only charge.success was handled, so a charge
  // Paystack itself reports as failed (card declined, insufficient funds, etc.) left no row
  // in `payments` at all unless the student's own browser happened to call verify-payment
  // first. processDepartmentAccessPayment/processReactivationPayment already record a
  // non-"success" Paystack status as status='failed' with a reason — this just makes sure
  // that path actually gets reached for a failure Paystack pushes to us. Every other event
  // type (refunds, disputes, transfers, ...) is still ignored.
  if (event.event !== "charge.success" && event.event !== "charge.failed") {
    return jsonResponse({ received: true });
  }

  const { reference, metadata } = event.data;
  const userId = metadata?.user_id;
  const departmentId = metadata?.department_id;
  const purpose = metadata?.purpose ?? "department_access";

  if (!userId || (purpose === "department_access" && !departmentId)) {
    console.error("paystack-webhook: charge.success missing required metadata", {
      reference,
      purpose,
    });
    return jsonResponse({ received: true }); // ack anyway — Paystack retries on non-2xx
  }

  try {
    // Re-verify directly with Paystack rather than trusting the webhook body's own amount/status
    // fields — the signature proves the request came from Paystack, not that the embedded data
    // hasn't been superseded by a later event for the same reference.
    const paystack = await verifyPaystackTransaction(reference);
    if (purpose === "suspension_reactivation") {
      await processReactivationPayment({ reference, userId, paystack });
    } else {
      await processDepartmentAccessPayment({ reference, userId, departmentId, paystack });
    }
  } catch (err) {
    console.error("paystack-webhook: processing failed", err);
    // Still ack 200 — verify-payment is the fallback path if this swallowed a real success,
    // and returning non-2xx here would just cause Paystack to retry the same failure.
  }

  return jsonResponse({ received: true });
});
