// The forced landing page for a suspended account (profile.status === 'suspended') — the old
// app's FUNCTIONAL_SPEC.md §9.1 "general suspended" flow only. §9.2's device-blocked sub-flow
// (24h lockout + fee) is deliberately not reproduced — see 03-BUSINESS-RULES-REDESIGN.md §2,
// which replaces that entire mechanic with plain concurrent-session eviction and no fee.
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { usePaystackPayment } from "react-paystack";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

const REACTIVATION_FEE_NGN = 1000;
const REACTIVATION_FEE_USD = 2;

export default function Reactivation() {
  const { user, profile, isSuspended, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Visiting without a blocking condition redirects straight to the dashboard — same as the
  // old app's behavior.
  if (!isSuspended) {
    return <Navigate to="/dashboard" replace />;
  }

  const currency = profile?.currency ?? "NGN";
  const displayFee =
    currency === "NGN"
      ? `₦${REACTIVATION_FEE_NGN.toLocaleString()}`
      : `$${REACTIVATION_FEE_USD}`;

  const paystackConfig = {
    // amount is nominal here — the server independently computes and verifies the real NGN
    // kobo amount from the user's own currency; the client-sent amount is never trusted.
    reference: `reactivate_${user?.id}_${Date.now()}`,
    email: user?.email ?? "",
    amount:
      currency === "NGN"
        ? REACTIVATION_FEE_NGN * 100
        : REACTIVATION_FEE_USD * 1500 * 100,
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? "",
    currency: "NGN",
    metadata: {
      user_id: user?.id,
      purpose: "suspension_reactivation",
      custom_fields: [],
    },
  };
  const initializePayment = usePaystackPayment(paystackConfig);

  function handlePay() {
    setError(null);
    if (!paystackConfig.publicKey) {
      setError("Payments are temporarily unavailable — please try again later.");
      return;
    }
    initializePayment({
      onSuccess: async (transaction: { reference: string }) => {
        setPaying(true);
        const { data, error: invokeError } = await supabase.functions.invoke(
          "verify-payment",
          {
            body: {
              reference: transaction.reference,
              purpose: "suspension_reactivation",
            },
          },
        );
        setPaying(false);
        if (invokeError || !data?.success) {
          setError(
            `Payment verification failed: ${invokeError?.message ?? data?.error ?? "unknown error"}`,
          );
          return;
        }
        await refreshProfile();
        navigate("/dashboard", { replace: true });
      },
      onClose: () => setPaying(false),
    });
  }

  return (
    <div className="diamond-mesh flex min-h-screen items-center justify-center px-4">
      <div className="card-luxury w-full max-w-md p-6 text-center">
        <h1 className="font-heading text-xl font-bold text-text-1">
          Access Suspended
        </h1>
        <p className="mt-2 text-sm text-text-3">
          Institutional access has been revoked due to an inactivity
          protocol violation.
          {profile?.suspension_reason ? ` (${profile.suspension_reason})` : ""}
        </p>

        <div className="mt-5 rounded-xl bg-canvas-soft p-4">
          <p className="text-xs uppercase tracking-wide text-text-3">
            Reactivation fee
          </p>
          <p className="font-heading text-2xl font-bold text-royal">
            {displayFee}
          </p>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          onClick={handlePay}
          disabled={paying}
          className="btn-primary mt-5 w-full"
        >
          {paying ? "Confirming payment…" : "Authorize Reactivation"}
        </button>

        <button
          onClick={() => void supabase.auth.signOut()}
          className="mt-3 w-full text-sm font-semibold text-text-3 hover:underline"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}
