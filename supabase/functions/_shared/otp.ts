// Shared OTP/step-up-auth implementation — one copy, used identically by every step-up flow
// (password-change today; device-reactivation/admin_step_up later), replacing the old app's
// two independently duplicated OTP implementations. See 02-DATA-MODEL-AND-SECURITY.md §7.
import { serviceClient, HttpError } from "./supabaseClients.ts";
import { sendEmail } from "./email.ts";

const OTP_TTL_MINUTES = 10;
const STEP_UP_TOKEN_TTL_MINUTES = 15;

export type OtpPurpose = "password_change" | "admin_step_up";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateCode(): string {
  // Cryptographically random, not Math.random() — a brute-forceable code generator would
  // defeat the point of requiring one.
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

export async function issueOtp(args: {
  userId: string;
  email: string;
  purpose: OtpPurpose;
  targetId?: string;
}): Promise<void> {
  const db = serviceClient();
  const code = generateCode();
  const codeHash = await sha256Hex(code);

  const { error } = await db.from("security_otp_tokens").insert({
    user_id: args.userId,
    purpose: args.purpose,
    code_hash: codeHash,
    target_id: args.targetId ?? null,
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) throw new HttpError(500, error.message);

  const purposeLabel =
    args.purpose === "password_change"
      ? "changing your password"
      : "this admin action";

  await sendEmail({
    to: args.email,
    subject: "Your Diamond Solution security code",
    html: `
      <p>Your verification code for ${purposeLabel} is:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
      <p>This code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>
    `,
  });
}

// On success, marks the OTP consumed and returns a short-lived capability token (the OTP
// row's own id — unguessable, single-use, scoped to this user+purpose) that the caller must
// present to the actual sensitive action next (e.g. change-password). Never a JWT the client
// could forge; always a fresh DB lookup on the far end.
export async function verifyOtp(args: {
  userId: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<{ token: string }> {
  const db = serviceClient();
  const codeHash = await sha256Hex(args.code);

  const { data: row, error } = await db
    .from("security_otp_tokens")
    .select("id, expires_at, consumed_at")
    .eq("user_id", args.userId)
    .eq("purpose", args.purpose)
    .eq("code_hash", codeHash)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!row || new Date(row.expires_at) < new Date()) {
    throw new HttpError(401, "Invalid or expired security code.");
  }

  const { error: consumeError } = await db
    .from("security_otp_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);
  if (consumeError) throw new HttpError(500, consumeError.message);

  return { token: row.id };
}

// Spends the capability token returned by verifyOtp. Single-use (step_up_used_at), bounded to
// STEP_UP_TOKEN_TTL_MINUTES after the OTP was actually verified — a verified-but-unused token
// left open indefinitely would itself be a standing credential.
export async function consumeStepUpToken(args: {
  userId: string;
  purpose: OtpPurpose;
  token: string;
}): Promise<void> {
  const db = serviceClient();

  const { data: row, error } = await db
    .from("security_otp_tokens")
    .select("id, consumed_at, step_up_used_at")
    .eq("id", args.token)
    .eq("user_id", args.userId)
    .eq("purpose", args.purpose)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!row || !row.consumed_at || row.step_up_used_at) {
    throw new HttpError(401, "Security verification required or already used.");
  }
  const consumedAt = new Date(row.consumed_at).getTime();
  if (Date.now() - consumedAt > STEP_UP_TOKEN_TTL_MINUTES * 60_000) {
    throw new HttpError(401, "Security verification expired — please try again.");
  }

  const { error: spendError } = await db
    .from("security_otp_tokens")
    .update({ step_up_used_at: new Date().toISOString() })
    .eq("id", row.id);
  if (spendError) throw new HttpError(500, spendError.message);
}
