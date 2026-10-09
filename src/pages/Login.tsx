import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, Lock, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DiamondLogo } from "@/components/DiamondLogo";
import { AuthTabs } from "@/components/AuthTabs";
import { useLanguage } from "@/context/LanguageContext";

export default function Login() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    navigate("/dashboard");
  }

  return (
    <div className="diamond-mesh flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <DiamondLogo size={56} showTagline />
        </div>

        <div className="card-luxury p-8">
          <AuthTabs active="signin" />

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <Field label={t("login.email")}>
              <div className="relative">
                <Mail
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </Field>

            <Field label={t("login.password")}>
              <div className="relative">
                <Lock
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex w-full items-center justify-center gap-2"
            >
              <LogIn size={16} />
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-text-3">
          {t("login.staffPrompt")}{" "}
          <Link
            to="/admin/login"
            className="font-semibold text-royal hover:underline"
          >
            {t("login.adminSignIn")}
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-text-3">
          {t("login.disclaimer")}
        </p>
      </div>
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-2">{label}</label>
      {children}
    </div>
  );
}
