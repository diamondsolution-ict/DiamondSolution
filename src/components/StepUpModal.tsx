// The one shared OTP/step-up UI, consuming request-otp/verify-otp (purpose='admin_step_up')
// — every destructive admin action reuses this instead of a duplicated modal per tab (the old
// app had at least two independently-built copies of this same flow). See
// 02-DATA-MODEL-AND-SECURITY.md §7.
//
// If the signed-in user has a verified authenticator app (AccountSettings.tsx), this defaults
// to that instead of email — no waiting for an email round-trip, the actual "quick unlock" the
// old app's PIN-lock was meant to be (03-BUSINESS-RULES-REDESIGN.md calls the PIN a "security
// costume"; a real second factor replaces it instead). A code is verified directly against
// Supabase Auth (supabase.auth.mfa.challenge/verify), which upgrades the session to aal2, then
// mfa-stepup-token exchanges that for the same kind of capability token the email path
// produces — so onVerified()'s contract, and every caller using it, is unchanged either way.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface StepUpModalProps {
  title: string;
  description: string;
  onCancel: () => void;
  onVerified: (token: string) => void;
}

export function StepUpModal({
  title,
  description,
  onCancel,
  onVerified,
}: StepUpModalProps) {
  const [mode, setMode] = useState<"checking" | "totp" | "email">("checking");
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendEmailCode() {
    setSending(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "request-otp",
      { body: { purpose: "admin_step_up" } },
    );
    setSending(false);
    if (invokeError || !data?.success) {
      setError(
        `Couldn't send a security code: ${invokeError?.message ?? data?.error ?? "unknown error"}`,
      );
    }
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.mfa.listFactors();
      const verifiedTotp = data?.totp?.[0];
      if (verifiedTotp) {
        setTotpFactorId(verifiedTotp.id);
        setMode("totp");
      } else {
        setMode("email");
        await sendEmailCode();
      }
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchToEmail() {
    setMode("email");
    setCode("");
    setError(null);
    await sendEmailCode();
  }

  async function confirmTotp() {
    if (!totpFactorId) return;
    setVerifying(true);
    setError(null);

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: totpFactorId });
    if (challengeError || !challenge) {
      setVerifying(false);
      setError("Couldn't start verification — try again.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totpFactorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setVerifying(false);
      setError("Incorrect code — check your authenticator app and try again.");
      return;
    }

    const { data, error: bridgeError } = await supabase.functions.invoke(
      "mfa-stepup-token",
      { body: { purpose: "admin_step_up" } },
    );
    setVerifying(false);
    if (bridgeError || !data?.success) {
      setError(
        bridgeError?.message ?? data?.error ?? "Couldn't complete verification.",
      );
      return;
    }
    onVerified(data.token);
  }

  async function confirmEmail() {
    setVerifying(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "verify-otp",
      { body: { purpose: "admin_step_up", code } },
    );
    setVerifying(false);
    if (invokeError || !data?.success) {
      setError("Invalid or expired security code.");
      return;
    }
    onVerified(data.token);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-4">
      <div className="card-luxury w-full max-w-sm p-6">
        <h2 className="font-heading text-lg font-bold text-text-1">
          Security Clearance Required
        </h2>
        <p className="mt-1 text-sm text-text-3">{title}</p>
        <p className="mt-2 text-sm text-text-2">{description}</p>

        {mode === "checking" ? (
          <p className="mt-4 text-xs text-text-3">Checking your security options…</p>
        ) : (
          <>
            <p className="mt-4 text-xs text-text-3">
              {mode === "totp"
                ? "Enter the 6-digit code from your authenticator app."
                : sending
                  ? "Sending a 6-digit code to your email…"
                  : "Enter the 6-digit code sent to your email."}
            </p>
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="mt-2 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-center font-mono text-lg tracking-[0.5em] text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
            />

            {error && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button onClick={onCancel} className="btn-outline flex-1">
                Abort
              </button>
              <button
                onClick={() => void (mode === "totp" ? confirmTotp() : confirmEmail())}
                disabled={verifying || code.length !== 6}
                className="btn-primary flex-1"
              >
                {verifying ? "Verifying…" : "Authorize"}
              </button>
            </div>

            {mode === "totp" ? (
              <button
                onClick={() => void switchToEmail()}
                className="mt-3 w-full text-xs font-semibold text-royal hover:underline"
              >
                Use email instead
              </button>
            ) : (
              <button
                onClick={() => void sendEmailCode()}
                disabled={sending}
                className="mt-3 w-full text-xs font-semibold text-royal hover:underline"
              >
                Resend code
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
