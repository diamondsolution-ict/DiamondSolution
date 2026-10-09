import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { verifyUser, HttpError } from "../_shared/supabaseClients.ts";
import { issueOtp, type OtpPurpose } from "../_shared/otp.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

// admin_step_up no longer goes through email-OTP — see admin-verify-stepup-code (the static,
// admin-changeable code that replaced it). Narrowed here too so the email path can't be
// reached for it even directly, not just left unreferenced in the UI.
const VALID_PURPOSES: OtpPurpose[] = ["password_change"];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const user = await verifyUser(req);
    const { purpose, target_id } = await req.json();

    if (!VALID_PURPOSES.includes(purpose)) {
      throw new HttpError(400, `purpose must be one of: ${VALID_PURPOSES.join(", ")}.`);
    }
    if (!user.email) {
      throw new HttpError(422, "Account has no verified email to send a code to.");
    }

    // Per-user and per-purpose: at most 3 codes requested per 10 minutes — enough for a normal
    // "didn't arrive, resend" retry without allowing a tight brute-force/spam loop.
    await checkRateLimit(`otp:${user.id}:${purpose}`, 3, 600);

    await issueOtp({ userId: user.id, email: user.email, purpose, targetId: target_id });

    return jsonResponse({ success: true });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
