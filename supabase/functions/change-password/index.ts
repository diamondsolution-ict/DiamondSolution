// Re-checks the step-up token server-side, then updates the password via the Admin API — so
// the OTP requirement is enforced even if a client tried to call Supabase Auth's own
// updateUser() directly and skip it. See 02-DATA-MODEL-AND-SECURITY.md §7.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, verifyUser, HttpError } from "../_shared/supabaseClients.ts";
import { consumeStepUpToken } from "../_shared/otp.ts";

// Same policy as src/lib/passwordPolicy.ts — deliberately not the old app's weaker 6-char
// password-change rule (03-BUSINESS-RULES-REDESIGN.md §7: one password policy, everywhere).
function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain a digit.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain a special character.";
  return null;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const user = await verifyUser(req);
    const { new_password, otp_token } = await req.json();

    if (!new_password || !otp_token) {
      throw new HttpError(400, "new_password and otp_token are required.");
    }
    const policyError = validatePassword(new_password);
    if (policyError) throw new HttpError(422, policyError);

    await consumeStepUpToken({
      userId: user.id,
      purpose: "password_change",
      token: otp_token,
    });

    const db = serviceClient();
    const { error } = await db.auth.admin.updateUserById(user.id, {
      password: new_password,
    });
    if (error) throw new HttpError(500, error.message);

    return jsonResponse({ success: true });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return jsonResponse({ success: false, error: message }, status);
  }
});
