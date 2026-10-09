// Lets an admin change the static step-up code (default "12345" — see the admin_stepup_code
// migration). Requires the current code as confirmation, same spirit as a password change
// requiring the old password — stops a logged-in-but-unattended admin session, or a second
// admin who only has dashboard access, from silently taking over the step-up gate.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  anonClient,
  serviceClient,
  verifyUser,
  HttpError,
} from "../_shared/supabaseClients.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { sha256Hex } from "../_shared/otp.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const user = await verifyUser(req);

    const authHeader = req.headers.get("Authorization")!;
    const { data: isAdmin } = await anonClient(authHeader).rpc("is_admin");
    if (!isAdmin) throw new HttpError(403, "Admin access required.");

    const { current_code, new_code } = await req.json();
    if (!current_code || !new_code) {
      throw new HttpError(400, "current_code and new_code are required.");
    }
    if (!/^\d{4,10}$/.test(new_code)) {
      throw new HttpError(400, "The new code must be 4–10 digits.");
    }

    await checkRateLimit(`stepup-code-change:${user.id}`, 5, 600);

    const db = serviceClient();
    const { data: row, error } = await db
      .from("admin_stepup_code")
      .select("code_hash")
      .eq("id", 1)
      .single();
    if (error || !row) throw new HttpError(500, "Step-up code not configured.");

    if ((await sha256Hex(current_code)) !== row.code_hash) {
      throw new HttpError(401, "Current code is incorrect.");
    }

    const { error: updateError } = await db
      .from("admin_stepup_code")
      .update({ code_hash: await sha256Hex(new_code), updated_by: user.id })
      .eq("id", 1);
    if (updateError) throw new HttpError(500, updateError.message);

    await db.from("admin_actions_log").insert({
      actor_user_id: user.id,
      action: "admin_stepup_code_changed",
      target_table: "admin_stepup_code",
      target_id: "1",
    });

    return jsonResponse({ success: true });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
