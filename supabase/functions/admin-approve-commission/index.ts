// Marks a commission `status = 'paid'` — bookkeeping only; the actual money movement to the
// user's bank is the separate withdrawal/payout flow (request-payout). Step-up gated, same
// posture as every other admin mutation. See 05-BACKEND.md's endpoint reference.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  anonClient,
  serviceClient,
  verifyUser,
  HttpError,
} from "../_shared/supabaseClients.ts";
import { consumeStepUpToken } from "../_shared/otp.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = await verifyUser(req);

    const authHeader = req.headers.get("Authorization")!;
    const { data: isStaff } = await anonClient(authHeader).rpc(
      "is_moderator_or_admin",
    );
    if (!isStaff) throw new HttpError(403, "Admin or moderator access required.");

    const { commission_id, otp_token } = await req.json();
    if (!commission_id) throw new HttpError(400, "commission_id is required.");
    if (!otp_token) throw new HttpError(401, "Security verification required.");

    await consumeStepUpToken({
      userId: admin.id,
      purpose: "admin_step_up",
      token: otp_token,
    });

    const db = serviceClient();
    const { data: commission, error: fetchError } = await db
      .from("commissions")
      .select("id, status")
      .eq("id", commission_id)
      .maybeSingle();
    if (fetchError || !commission) throw new HttpError(404, "Commission not found.");
    if (commission.status === "paid") {
      throw new HttpError(409, "Commission is already marked paid.");
    }

    const { error: updateError } = await db
      .from("commissions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", commission_id);
    if (updateError) throw new HttpError(500, updateError.message);

    await db.from("admin_actions_log").insert({
      actor_user_id: admin.id,
      action: "commission_approved",
      target_table: "commissions",
      target_id: commission_id,
    });

    return jsonResponse({ success: true });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
