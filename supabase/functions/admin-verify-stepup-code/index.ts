// Admin step-up via a static, admin-changeable code instead of email-OTP (see the
// admin_stepup_code migration header for why). Mirrors verifyOtp()'s contract: on a correct
// code, writes a consumed security_otp_tokens row (purpose='admin_step_up') and returns its id
// as the capability token — consumeStepUpToken() (used unchanged by admin-manage-user and
// admin-approve-commission) doesn't care how that row got there.
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

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      throw new HttpError(400, "code is required.");
    }

    // Per-user: at most 8 attempts per 10 minutes — same brute-force guard the old email-OTP
    // verify step had, now the only thing standing between a correct guess and access since
    // there's no second delivered secret involved.
    await checkRateLimit(`stepup-code:${user.id}`, 8, 600);

    const db = serviceClient();
    const { data: row, error } = await db
      .from("admin_stepup_code")
      .select("code_hash")
      .eq("id", 1)
      .single();
    if (error || !row) throw new HttpError(500, "Step-up code not configured.");

    const codeHash = await sha256Hex(code);
    if (codeHash !== row.code_hash) {
      throw new HttpError(401, "Incorrect security code.");
    }

    const now = new Date();
    const { data: tokenRow, error: insertError } = await db
      .from("security_otp_tokens")
      .insert({
        user_id: user.id,
        purpose: "admin_step_up",
        code_hash: codeHash,
        expires_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
        consumed_at: now.toISOString(),
      })
      .select("id")
      .single();
    if (insertError || !tokenRow) {
      throw new HttpError(
        500,
        insertError?.message ?? "Failed to issue step-up token.",
      );
    }

    return jsonResponse({ success: true, token: tokenRow.id });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
