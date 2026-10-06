// Bridges a TOTP-authenticator-app step-up (the client already called
// supabase.auth.mfa.challenge()/verify() directly against Supabase Auth, which upgrades the
// session to aal2) into the same kind of capability token the email-OTP flow produces — so
// every existing step-up-gated function (admin-manage-user, ...) keeps working completely
// unchanged, regardless of which path the client used to prove identity.
//
// aal2 alone isn't enough to trust here — it only means "some second factor was verified at
// some point for this session," not "verified just now, for this specific action." Decoding
// the access token's own `aal` claim after verifyUser() has already validated the token's
// signature is the standard way to read it (see supabase/auth#2832 on documenting step-up
// claims) — but the caller is still expected to have just completed a fresh
// challenge/verify immediately before calling this, same as the email flow expects a
// freshly-entered code, not a password remembered from an hour ago.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { verifyUser, HttpError } from "../_shared/supabaseClients.ts";
import { issueStepUpTokenFromMfa, type OtpPurpose } from "../_shared/otp.ts";

function decodeAal(authHeader: string): string | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const payloadSegment = token.split(".")[1];
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(normalized)) as { aal?: string };
    return json.aal ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const user = await verifyUser(req);
    const authHeader = req.headers.get("Authorization")!;

    if (decodeAal(authHeader) !== "aal2") {
      throw new HttpError(
        403,
        "A verified authenticator app code is required for this.",
      );
    }

    const { purpose } = await req.json();
    if (purpose !== "password_change" && purpose !== "admin_step_up") {
      throw new HttpError(400, "Invalid purpose.");
    }

    const result = await issueStepUpTokenFromMfa({
      userId: user.id,
      purpose: purpose as OtpPurpose,
    });
    return jsonResponse({ success: true, ...result });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
