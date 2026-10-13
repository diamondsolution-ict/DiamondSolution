// Admin step-up via a static, per-admin-changeable code instead of email-OTP (see the
// admin_stepup_code migration header for why, and 20261013180000_per_admin_stepup_code.sql for
// why it's per-admin rather than one shared code). Mirrors verifyOtp()'s contract: on a correct
// code, writes a consumed security_otp_tokens row (purpose='admin_step_up') and returns its id
// as the capability token — consumeStepUpToken() (used unchanged by admin-manage-user) doesn't
// care how that row got there. AdminKeyGate also calls this once per browser session to let an
// admin into the admin area at all — a successful verify is enough for that, so it just checks
// `success` and never spends the returned token; the token itself only matters when a specific
// destructive action later consumes it via consumeStepUpToken().
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
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!row) {
      // Not an error exactly — this admin (newly promoted, or migrated in before they'd ever
      // set one) just hasn't set a personal code yet. The frontend's AdminKeyGate checks this
      // flag to switch from "enter your code" into "set up your code" instead of showing a
      // confusing "incorrect code" for a code that was never entered.
      //
      // Deliberately HTTP 200, not a 4xx: supabase-js only parses the response body into `data`
      // on a 2xx status — on anything else it throws FunctionsHttpError first and `data` stays
      // null, so a structured field like `not_configured` would be unreadable by the normal
      // `data?.field` check that every other success-shaped response here relies on (the same
      // body-swallowing behavior functionErrorMessage() works around for plain error messages,
      // but that helper only recovers a flattened message string, not an arbitrary field).
      return jsonResponse({
        success: false,
        error: "You haven't set up a security code yet.",
        not_configured: true,
      });
    }

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
