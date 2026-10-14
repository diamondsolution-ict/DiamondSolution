// The forced landing page for a device-blocked account (profiles.device_block_started_at set) —
// reinstating the old app's FUNCTIONAL_SPEC.md §9.2 behavior at explicit request. See
// supabase/migrations/20261013210000_device_login_limits.sql for the trigger (signing in from a
// 3rd distinct device) and supabase/functions/_shared/processDeviceUnlock.ts for the payment that
// lifts it. Mirrors Reactivation.tsx's structure.
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { usePaystackPayment } from "react-paystack";
import { CreditCard, Clock, LogOut, SmartphoneNfc } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { functionErrorMessage } from "@/lib/functionError";

const DEVICE_UNLOCK_FEE_NGN = 1000;
const LOCKOUT_HOURS = 24;

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export default function DeviceLocked() {
  const { user, isDeviceBlocked, deviceBlockedSince, refreshProfile } =
    useAuth();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Visiting without a blocking condition redirects straight to the dashboard.
  if (!isDeviceBlocked) {
    return <Navigate to="/dashboard" replace />;
  }

  const unlockEligibleAt = deviceBlockedSince
    ? new Date(deviceBlockedSince).getTime() + LOCKOUT_HOURS * 60 * 60_000
    : now;
  const msRemaining = unlockEligibleAt - now;
  const eligibleToPay = msRemaining <= 0;

  const paystackConfig = {
    // amount is nominal here — the server independently verifies the real NGN kobo amount and
    // the 24h-elapsed condition; the client-sent amount/eligibility is never trusted.
    reference: `device_unlock_${user?.id}_${Date.now()}`,
    email: user?.email ?? "",
    amount: DEVICE_UNLOCK_FEE_NGN * 100,
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? "",
    currency: "NGN",
    metadata: {
      user_id: user?.id,
      purpose: "device_unlock",
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
              purpose: "device_unlock",
            },
          },
        );
        setPaying(false);
        if (invokeError || !data?.success) {
          setError(
            `Payment verification failed: ${await functionErrorMessage(data, invokeError, "unknown error")}`,
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
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
          <SmartphoneNfc size={26} className="text-rose-500" />
        </div>
        <h1 className="mt-4 font-heading text-xl font-bold text-text-1">
          Account Locked
        </h1>
        <p className="mt-2 text-sm text-text-3">
          This account was signed in from a 3rd device. For security, only one
          device at a time is allowed — your account has been locked.
        </p>

        <div className="mt-5 rounded-xl bg-canvas-soft p-4">
          {eligibleToPay ? (
            <>
              <p className="text-xs uppercase tracking-wide text-text-3">
                Unlock fee
              </p>
              <p className="font-heading text-2xl font-bold text-royal">
                ₦{DEVICE_UNLOCK_FEE_NGN.toLocaleString()}
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-wide text-text-3">
                <Clock size={12} />
                Unlocks for payment in
              </p>
              <p className="font-heading text-2xl font-bold text-royal">
                {formatCountdown(msRemaining)}
              </p>
              <p className="mt-1 text-xs text-text-3">
                You can pay ₦{DEVICE_UNLOCK_FEE_NGN.toLocaleString()} to unlock
                once the 24-hour period has elapsed.
              </p>
            </>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          onClick={handlePay}
          disabled={paying || !eligibleToPay}
          className="btn-primary mt-5 flex w-full items-center justify-center gap-2 disabled:opacity-50"
        >
          <CreditCard size={16} />
          {paying
            ? "Confirming payment…"
            : eligibleToPay
              ? "Pay to unlock"
              : "Available after the 24-hour lock"}
        </button>

        <button
          onClick={() => void supabase.auth.signOut()}
          className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-text-3 hover:underline"
        >
          <LogOut size={14} />
          Sign out instead
        </button>
      </div>
    </div>
  );
}
