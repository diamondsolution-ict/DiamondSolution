import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { verifyUser, HttpError } from "../_shared/supabaseClients.ts";
import { verifyOtp, type OtpPurpose } from "../_shared/otp.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

// See request-otp's matching comment — admin_step_up is issued directly by
// admin-verify-stepup-code now, not through this email-OTP flow.
const VALID_PURPOSES: OtpPurpose[] = ["password_change"];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const user = await verifyUser(req);
    const { purpose, code } = await req.json();

    if (!VALID_PURPOSES.includes(purpose)) {
      throw new HttpError(400, `purpose must be one of: ${VALID_PURPOSES.join(", ")}.`);
    }
    if (!code || typeof code !== "string") {
      throw new HttpError(400, "code is required.");
    }

    // Per-user: at most 8 verify attempts per 10 minutes — slows brute-forcing a 6-digit code
    // (1,000,000 possibilities) without making a genuine typo-then-retry feel broken.
    await checkRateLimit(`otp-verify:${user.id}:${purpose}`, 8, 600);

    const { token } = await verifyOtp({ userId: user.id, purpose, code });

    return jsonResponse({ success: true, token });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
