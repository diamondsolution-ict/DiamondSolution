// Lets an admin set or change their OWN step-up code (see 20261013180000_per_admin_stepup_code.sql
// for why this is per-admin rather than one shared code everyone used). Changing an existing
// code requires the current one as confirmation, same spirit as a password change requiring the
// old password — stops a logged-in-but-unattended admin session from silently taking it over.
// Setting one for the FIRST time (no row yet — a newly promoted admin, or one migrated in
// before this system existed) needs no current_code, since there isn't one to confirm against.
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
    if (!new_code) {
      throw new HttpError(400, "new_code is required.");
    }
    if (!/^\d{4,10}$/.test(new_code)) {
      throw new HttpError(400, "The new code must be 4–10 digits.");
    }

    await checkRateLimit(`stepup-code-change:${user.id}`, 5, 600);

    const db = serviceClient();
    const { data: row, error } = await db
      .from("admin_stepup_code")
      .select("code_hash")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);

    const newHash = await sha256Hex(new_code);

    if (row) {
      if (!current_code) {
        throw new HttpError(400, "current_code is required to change an existing code.");
      }
      if ((await sha256Hex(current_code)) !== row.code_hash) {
        throw new HttpError(401, "Current code is incorrect.");
      }
      const { error: updateError } = await db
        .from("admin_stepup_code")
        .update({ code_hash: newHash, updated_by: user.id })
        .eq("user_id", user.id);
      if (updateError) throw new HttpError(500, updateError.message);
    } else {
      const { error: insertError } = await db
        .from("admin_stepup_code")
        .insert({ user_id: user.id, code_hash: newHash, updated_by: user.id });
      if (insertError) throw new HttpError(500, insertError.message);
    }

    await db.from("admin_actions_log").insert({
      actor_user_id: user.id,
      action: row ? "admin_stepup_code_changed" : "admin_stepup_code_set",
      target_table: "admin_stepup_code",
      target_id: user.id,
    });

    return jsonResponse({ success: true });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
