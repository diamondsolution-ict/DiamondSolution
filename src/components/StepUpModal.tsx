// The one shared step-up UI, consuming admin-verify-stepup-code — every destructive admin
// action reuses this instead of a duplicated modal per tab. Gated by a static, admin-changeable
// code (default "12345", change it from Admin → Settings) rather than email-OTP: the email path
// was dropped at the user's request since Resend delivery was a recurring support headache for
// a one-or-two-admin back office. See the admin_stepup_code migration header for the full
// rationale and 02-DATA-MODEL-AND-SECURITY.md §7 for the original step-up design.
import { useState } from "react";
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
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setVerifying(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "admin-verify-stepup-code",
      { body: { code } },
    );
    setVerifying(false);
    if (invokeError || !data?.success) {
      setError(data?.error ?? "Incorrect security code.");
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
          Enter the admin security code.
        </p>
        <input
          inputMode="numeric"
          maxLength={10}
          placeholder="Security code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
          autoFocus
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
            disabled={verifying || code.length < 4}
            className="btn-primary flex-1"
          >
            {verifying ? "Verifying…" : "Authorize"}
          </button>
        </div>
      </div>
    </div>
  );
}
