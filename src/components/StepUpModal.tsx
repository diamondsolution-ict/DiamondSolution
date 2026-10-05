// The one shared OTP/step-up UI, consuming request-otp/verify-otp (purpose='admin_step_up')
// — every destructive admin action reuses this instead of a duplicated modal per tab (the old
// app had at least two independently-built copies of this same flow). See
// 02-DATA-MODEL-AND-SECURITY.md §7.
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
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
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
    void sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm() {
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

        <p className="mt-4 text-xs text-text-3">
          {sending
            ? "Sending a 6-digit code to your email…"
            : "Enter the 6-digit code sent to your email."}
        </p>
        <input
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
            onClick={() => void confirm()}
            disabled={verifying || code.length !== 6}
            className="btn-primary flex-1"
          >
            {verifying ? "Verifying…" : "Authorize"}
          </button>
        </div>
        <button
          onClick={() => void sendCode()}
          disabled={sending}
          className="mt-3 w-full text-xs font-semibold text-royal hover:underline"
        >
          Resend code
        </button>
      </div>
    </div>
  );
}
