// Self-service password recovery for a signed-out student — the one real pre-launch gap found
// in Account Settings' security section: that flow (request-otp + change-password) requires an
// already-authenticated session, so it's no help to someone who's actually locked out. This
// instead uses Supabase Auth's own built-in recovery link, which needs no custom Edge Function:
// resetPasswordForEmail() emails a link that, when followed, lands on ResetPassword.tsx with a
// real (if short-lived) session already established by supabase-js.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DiamondLogo } from "@/components/DiamondLogo";
import { useLanguage } from "@/context/LanguageContext";

export default function ForgotPassword() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    setSending(false);

    // Always show the same "check your email" state regardless of whether the address is
    // registered — confirming/denying an account's existence here would be a user-enumeration
    // leak. A real delivery failure (bad SMTP config, etc.) is the one case worth surfacing.
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="diamond-mesh flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <DiamondLogo size={56} showTagline />
        </div>

        <div className="card-luxury p-8">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <MailCheck size={22} className="text-emerald-600" />
              </div>
              <h1 className="mt-4 font-heading text-lg font-bold text-text-1">
                {t("forgotPassword.sentTitle")}
              </h1>
              <p className="mt-1.5 text-sm text-text-3">
                {t("forgotPassword.sentBody")}
              </p>
              <Link
                to="/login"
                className="mt-5 flex items-center justify-center gap-1.5 text-sm font-semibold text-royal hover:underline"
              >
                <ArrowLeft size={14} />
                {t("forgotPassword.backToLogin")}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-heading text-lg font-bold text-text-1">
                {t("forgotPassword.title")}
              </h1>
              <p className="mt-1.5 text-sm text-text-3">
                {t("forgotPassword.subtitle")}
              </p>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                {error && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-text-2">
                    {t("forgotPassword.email")}
                  </label>
                  <div className="relative mt-1">
                    <Mail
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
                    />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 pl-9 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={sending}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {sending
                    ? t("forgotPassword.sending")
                    : t("forgotPassword.send")}
                </button>
              </form>

              <Link
                to="/login"
                className="mt-5 flex items-center justify-center gap-1.5 text-sm font-semibold text-text-3 hover:underline"
              >
                <ArrowLeft size={14} />
                {t("forgotPassword.backToLogin")}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
