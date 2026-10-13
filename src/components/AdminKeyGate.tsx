import { useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { functionErrorMessage } from "@/lib/functionError";

// Gates entry to the whole /admin/* area behind the signed-in admin's OWN personal security
// code — separate from (and in addition to) the same code's use as a step-up challenge before a
// specific destructive action elsewhere (Users tab, etc.). Verified once per browser session
// (sessionStorage, keyed by this admin's user id so a different admin signing in on the same
// browser/tab always gets their own fresh prompt) rather than on every page load, since this is
// a convenience gate on top of an already-authenticated, role-checked session — RLS is what
// actually protects the data regardless of whether this screen was shown.
export function AdminKeyGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const storageKey = user ? `admin_key_verified:${user.id}` : null;

  const [verified, setVerified] = useState(
    () => !!storageKey && sessionStorage.getItem(storageKey) === "1",
  );

  if (verified) return <>{children}</>;
  return (
    <KeyEntryScreen
      onVerified={() => {
        if (storageKey) sessionStorage.setItem(storageKey, "1");
        setVerified(true);
      }}
      onSignOut={() => void signOut()}
    />
  );
}

function KeyEntryScreen({
  onVerified,
  onSignOut,
}: {
  onVerified: () => void;
  onSignOut: () => void;
}) {
  // Unknown until the first attempt tells us: a wrong-guess error means a code already exists,
  // a not_configured error means this admin has never set one — switches the whole form from
  // "enter your code" into "choose a code" accordingly.
  const [mode, setMode] = useState<"enter" | "setup">("enter");
  const [code, setCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeRef.current?.focus();
  }, [mode]);

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "admin-verify-stepup-code",
      { body: { code } },
    );
    setSubmitting(false);

    if (data?.success) {
      onVerified();
      return;
    }
    if (data?.not_configured) {
      setMode("setup");
      setCode("");
      setError(null);
      return;
    }
    setError(await functionErrorMessage(data, invokeError, "Incorrect security code."));
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,10}$/.test(code)) {
      setError("Your code must be 4–10 digits.");
      return;
    }
    if (code !== confirmCode) {
      setError("Codes don't match.");
      return;
    }
    setSubmitting(true);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "admin-set-stepup-code",
      { body: { new_code: code } },
    );
    setSubmitting(false);

    if (!data?.success) {
      setError(await functionErrorMessage(data, invokeError, "Couldn't set your code."));
      return;
    }
    onVerified();
  }

  return (
    <div className="diamond-mesh flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="card-luxury p-8">
          <div className="diamond-gradient mx-auto flex h-12 w-12 items-center justify-center rounded-full">
            <ShieldCheck size={22} className="text-white" />
          </div>
          <h1 className="mt-4 text-center font-heading text-lg font-bold text-text-1">
            {mode === "setup" ? "Set up your admin key" : "Admin access"}
          </h1>
          <p className="mt-1.5 text-center text-sm text-text-3">
            {mode === "setup"
              ? "Choose a personal security code — you'll enter it each time you open the admin area, and before sensitive actions."
              : "Enter your personal security code to continue."}
          </p>

          <form
            onSubmit={mode === "setup" ? handleSetup : handleVerify}
            className="mt-5 space-y-3"
          >
            <div>
              <label htmlFor="admin-key" className="flex items-center gap-1.5 text-sm font-medium text-text-2">
                <KeyRound size={13} className="text-text-3" />
                {mode === "setup" ? "New code" : "Your code"}
              </label>
              <input
                ref={codeRef}
                id="admin-key"
                inputMode="numeric"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder={mode === "setup" ? "4–10 digits" : undefined}
                className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-center text-lg tracking-widest text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
              />
            </div>

            {mode === "setup" && (
              <div>
                <label htmlFor="admin-key-confirm" className="flex items-center gap-1.5 text-sm font-medium text-text-2">
                  <KeyRound size={13} className="text-text-3" />
                  Confirm code
                </label>
                <input
                  id="admin-key-confirm"
                  inputMode="numeric"
                  value={confirmCode}
                  onChange={(e) =>
                    setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-center text-lg tracking-widest text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
                />
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !code}
              className="btn-primary w-full disabled:opacity-50"
            >
              {submitting
                ? "Checking…"
                : mode === "setup"
                  ? "Save and continue"
                  : "Continue"}
            </button>
          </form>

          <button
            onClick={onSignOut}
            className="mx-auto mt-5 flex items-center gap-1.5 text-xs font-semibold text-text-3 hover:text-text-1 hover:underline"
          >
            <LogOut size={13} />
            Not you? Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
