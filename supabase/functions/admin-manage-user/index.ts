// Suspend/unsuspend, role changes, and delete — all gated behind the shared OTP step-up token
// (consumeStepUpToken, purpose='admin_step_up'), replacing the old app's locally-duplicated
// "requestClearance" OTP implementation. See 02-DATA-MODEL-AND-SECURITY.md §7 and
// FUNCTIONAL_SPEC.md §20.2/§20.4. `create` is deliberately NOT step-up gated, matching the old
// app's Add User modal, which never required OTP either.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  anonClient,
  serviceClient,
  verifyUser,
  HttpError,
} from "../_shared/supabaseClients.ts";
import { consumeStepUpToken } from "../_shared/otp.ts";

type Action = "suspend" | "unsuspend" | "change_role" | "delete" | "create";
const VALID_ROLES = ["student", "moderator", "admin"];

async function logAction(
  db: ReturnType<typeof serviceClient>,
  actorId: string,
  action: string,
  targetId: string,
  reason?: string,
) {
  await db.from("admin_actions_log").insert({
    actor_user_id: actorId,
    action,
    target_table: "profiles",
    target_id: targetId,
    reason,
  });
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = await verifyUser(req);

    const authHeader = req.headers.get("Authorization")!;
    const { data: isAdmin } = await anonClient(authHeader).rpc("is_admin");
    if (!isAdmin) throw new HttpError(403, "Admin access required.");

    const body = await req.json();
    const action = body.action as Action;
    const db = serviceClient();

    if (action === "create") {
      const { email, password, display_name, role } = body;
      if (!email || !password) {
        throw new HttpError(400, "email and password are required.");
      }
      if (role && !VALID_ROLES.includes(role)) {
        throw new HttpError(400, `role must be one of: ${VALID_ROLES.join(", ")}.`);
      }

      const { data: created, error: createError } =
        await db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name },
        });
      if (createError || !created.user) {
        throw new HttpError(422, createError?.message ?? "Failed to create user.");
      }

      // handle_new_user() (the auth.users insert trigger) already created the profiles row —
      // role defaults to none (student-equivalent) until explicitly granted here, same as the
      // old app forcing the secondary-app-created user to 'student' before any role upgrade.
      if (role && role !== "student") {
        await db.from("user_roles").insert({
          user_id: created.user.id,
          role,
          granted_by: admin.id,
        });
      }

      await logAction(db, admin.id, "user_created", created.user.id);
      return jsonResponse({ success: true, user_id: created.user.id });
    }

    const { target_user_id, otp_token, reason, new_role } = body;
    if (!target_user_id) throw new HttpError(400, "target_user_id is required.");
    if (target_user_id === admin.id) {
      throw new HttpError(409, "You can't change your own account from this panel.");
    }
    if (!otp_token) throw new HttpError(401, "Security verification required.");

    await consumeStepUpToken({
      userId: admin.id,
      purpose: "admin_step_up",
      token: otp_token,
    });

    if (action === "suspend") {
      const { error } = await db
        .from("profiles")
        .update({ status: "suspended", suspension_reason: reason ?? "Suspended by administrator." })
        .eq("user_id", target_user_id);
      if (error) throw new HttpError(500, error.message);
      await logAction(db, admin.id, "user_suspended", target_user_id, reason);
      return jsonResponse({ success: true });
    }

    if (action === "unsuspend") {
      const { error } = await db
        .from("profiles")
        .update({ status: "active", suspension_reason: null })
        .eq("user_id", target_user_id);
      if (error) throw new HttpError(500, error.message);
      await logAction(db, admin.id, "user_unsuspended", target_user_id);
      return jsonResponse({ success: true });
    }

    if (action === "change_role") {
      if (!new_role || !VALID_ROLES.includes(new_role)) {
        throw new HttpError(400, `new_role must be one of: ${VALID_ROLES.join(", ")}.`);
      }
      // Single-role-at-a-time, same as the old app's role select — replace, not append.
      const { error: deleteError } = await db
        .from("user_roles")
        .delete()
        .eq("user_id", target_user_id);
      if (deleteError) throw new HttpError(500, deleteError.message);

      if (new_role !== "student") {
        const { error: insertError } = await db
          .from("user_roles")
          .insert({ user_id: target_user_id, role: new_role, granted_by: admin.id });
        if (insertError) throw new HttpError(500, insertError.message);
      }
      await logAction(db, admin.id, `role_changed_to_${new_role}`, target_user_id, reason);
      return jsonResponse({ success: true });
    }

    if (action === "delete") {
      const { error } = await db.auth.admin.deleteUser(target_user_id);
      if (error) {
        // Most likely a foreign-key restriction from payments/withdrawals/commissions history
        // (none of those cascade on purpose — financial records outlive the account). Surface
        // that plainly rather than a raw Postgres error.
        throw new HttpError(
          409,
          `Couldn't delete this account — it likely has payment or withdrawal history that must be preserved. Suspend it instead. (${error.message})`,
        );
      }
      await logAction(db, admin.id, "user_deleted", target_user_id, reason);
      return jsonResponse({ success: true });
    }

    throw new HttpError(400, `Unknown action: ${action}`);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
