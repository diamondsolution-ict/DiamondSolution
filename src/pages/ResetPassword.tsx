// Lands here after a student follows the link from ForgotPassword.tsx's recovery email.
// supabase-js parses the recovery tokens out of the URL on load (detectSessionInUrl, the
// client default) and fires a PASSWORD_RECOVERY auth event once that session is established —
// this page waits for that signal rather than trusting the URL itself, since the actual token
// exchange/validation happens inside supabase-js, not here. Deliberately NOT wrapped in
// ProtectedRoute: the recovery session is real but short-lived and single-purpose, so this page
// handles it directly and signs back out once the password is changed, same as Reactivation.tsx
// and DeviceLocked.tsx sit outside the normal protected-route tree for their own forced flows.
import { friendlyError } from "@/lib/friendlyError";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Lock, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DiamondLogo } from "@/components/DiamondLogo";
import { useLanguage } from "@/context/LanguageContext";
import { validatePassword } from "@/lib/passwordPolicy";

type LinkState = "verifying" | "ready" | "invalid";

export default function ResetPassword() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [linkState, setLinkState] = useState<LinkState>("verifying");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let settled = false;

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setLinkState("ready");
      }
    });

    // The PASSWORD_RECOVERY event can fire before this listener attaches (it's driven by
    // supabase-js's own URL parsing on client init), so also check directly: a session present
    // here only makes sense as that just-established recovery session, since this page is
    // never reached any other way.
    supabase.auth.getSession().then(({ data }) => {
      if (!settled && data.session) {
        settled = true;
        setLinkState("ready");
      }
    });

    // Give the URL-parsing a few seconds before concluding the link is bad — on a slow
    // connection the token exchange isn't instant.
    const timeout = setTimeout(() => {
      if (!settled) setLinkState("invalid");
    }, 4000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    const policyError = validatePassword(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setSubmitting(false);
      setError(friendlyError(updateError));
      return;
    }

    // Sign out of the recovery session and send them to a clean sign-in with the new
    // password, rather than carrying it forward into a normal authenticated session here.
    await supabase.auth.signOut();
    navigate("/login", { state: { message: t("resetPassword.success") } });
  }

  return (
    <div className="diamond-mesh flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <DiamondLogo size={56} showTagline />
        </div>

        <div className="card-luxury p-8">
          {linkState === "verifying" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 size={24} className="animate-spin text-royal" />
              <p className="text-sm text-text-3">{t("resetPassword.verifying")}</p>
            </div>
          )}

          {linkState === "invalid" && (
            <div className="text-center">
              <h1 className="font-heading text-lg font-bold text-text-1">
                {t("resetPassword.invalidTitle")}
              </h1>
              <p className="mt-1.5 text-sm text-text-3">
                {t("resetPassword.invalidBody")}
              </p>
              <Link to="/forgot-password" className="btn-primary mt-5 block">
                {t("resetPassword.requestNew")}
              </Link>
            </div>
          )}

          {linkState === "ready" && (
            <>
              <h1 className="font-heading text-lg font-bold text-text-1">
                {t("resetPassword.title")}
              </h1>
              <p className="mt-1.5 text-sm text-text-3">
                {t("resetPassword.subtitle")}
              </p>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                {error && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </p>
                )}
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-text-2">
                    <Lock size={13} className="text-text-3" />
                    {t("resetPassword.newPassword")}
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-text-2">
                    <KeyRound size={13} className="text-text-3" />
                    {t("resetPassword.confirmPassword")}
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {submitting
                    ? t("resetPassword.updating")
                    : t("resetPassword.submit")}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
