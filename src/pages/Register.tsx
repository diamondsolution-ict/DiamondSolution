import { friendlyError } from "@/lib/friendlyError";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  GraduationCap,
  Gift,
  Lock,
  Mail,
  MessageCircle,
  User,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { validatePassword } from "@/lib/passwordPolicy";
import { DiamondLogo } from "@/components/DiamondLogo";
import { AuthTabs } from "@/components/AuthTabs";
import { useLanguage } from "@/context/LanguageContext";

interface Department {
  id: string;
  name: string;
}

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language, t } = useLanguage();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    university: "",
    departmentId: "",
    whatsapp: "",
    email: "",
    password: "",
    confirmPassword: "",
    referralCode:
      searchParams.get("ref") ?? sessionStorage.getItem("referralCode") ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [codeStatus, setCodeStatus] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  // Set once signUp() succeeds without an active session (email confirmation required) — the
  // registered account's own email, held separately from the form so it survives even if the
  // form were ever reset, and so the confirmation popup can't show a blank address.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    supabase
      .from("departments")
      .select("id, name")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setDepartments(data ?? []));
  }, []);

  // Referral code is mandatory now — this checks it as the student types (same debounced
  // pattern Affiliate.tsx uses for bank account resolution) so a bad code is caught before
  // submit, not after a failed signUp() round trip. The actual enforcement that can't be
  // bypassed lives in the handle_new_user trigger server-side; this is purely for fast
  // feedback.
  useEffect(() => {
    const code = form.referralCode.trim();
    if (!code) {
      setCodeStatus("idle");
      return;
    }
    setCodeStatus("checking");
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc(
        "is_valid_referral_code",
        { p_code: code },
      );
      if (cancelled) return;
      setCodeStatus(!rpcError && data === true ? "valid" : "invalid");
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.referralCode]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.referralCode.trim()) {
      setError(t("register.referralCodeRequired"));
      return;
    }
    if (codeStatus !== "valid") {
      setError(t("register.referralCodeInvalid"));
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError(t("register.passwordMismatch"));
      return;
    }
    const passwordError = validatePassword(form.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        // Consumed by the handle_new_user trigger (see the init migration) so the full
        // profile exists the moment the auth.users row is created — works whether or not
        // email confirmation leaves this signUp() call without an active session.
        data: {
          display_name: form.displayName,
          username: form.username.toLowerCase().replace(/\s+/g, ""),
          university: form.university,
          department_id: form.departmentId || null,
          whatsapp: form.whatsapp ? `+234${form.whatsapp}` : "",
          phone: form.whatsapp ? `+234${form.whatsapp}` : "",
          language,
          referral_code: form.referralCode || null,
        },
      },
    });

    setLoading(false);
    if (signUpError) {
      setError(friendlyError(signUpError));
      return;
    }

    if (data.session) {
      navigate("/dashboard");
    } else {
      setAwaitingConfirmation(form.email);
    }
  }

  async function handleResend() {
    if (!awaitingConfirmation || resending) return;
    setResending(true);
    setResent(false);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: awaitingConfirmation,
    });
    setResending(false);
    if (resendError) {
      setError(friendlyError(resendError));
      return;
    }
    setResent(true);
  }

  return (
    <div className="diamond-mesh flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <DiamondLogo size={48} showTagline />
        </div>

        <div className="card-luxury p-8">
          <AuthTabs active="register" />

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <Field label={t("register.fullName")} icon={User}>
              <input
                required
                value={form.displayName}
                onChange={(e) => update("displayName", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label={t("register.username")} icon={User}>
              <input
                required
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label={t("register.institution")} icon={Building2}>
              <input
                placeholder={t("register.institutionPlaceholder")}
                value={form.university}
                onChange={(e) => update("university", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label={t("register.department")} icon={GraduationCap}>
              <DepartmentCombobox
                departments={departments}
                value={form.departmentId}
                onChange={(id) => update("departmentId", id)}
                placeholder={t("register.departmentPlaceholder")}
                noMatchLabel={t("register.departmentNoMatch")}
              />
            </Field>

            <Field label={t("register.referralCode")} icon={Gift}>
              <input
                required
                value={form.referralCode}
                onChange={(e) => update("referralCode", e.target.value)}
                placeholder={t("register.referralCodePlaceholder")}
                className={inputClass}
              />
              {codeStatus === "checking" && (
                <p className="mt-1 text-xs text-text-3">
                  {t("register.referralCodeChecking")}
                </p>
              )}
              {codeStatus === "valid" && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <CheckCircle2 size={12} />
                  {t("register.referralCodeValid")}
                </p>
              )}
              {codeStatus === "invalid" && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <XCircle size={12} />
                  {t("register.referralCodeInvalid")}
                </p>
              )}
            </Field>

            <Field label={t("register.whatsapp")} icon={MessageCircle}>
              <div className="mt-1 flex gap-2">
                <span className="flex items-center gap-1 rounded-xl border border-canvas-border bg-canvas-soft px-3 text-sm text-text-2">
                  🇳🇬 +234
                </span>
                <input
                  value={form.whatsapp}
                  onChange={(e) =>
                    update("whatsapp", e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="8011223344"
                  className={`${inputClass} mt-0 flex-1`}
                />
              </div>
            </Field>

            <Field label={t("register.email")} icon={Mail}>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label={t("register.password")} icon={Lock}>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label={t("register.confirmPassword")} icon={Lock}>
              <input
                type="password"
                required
                value={form.confirmPassword}
                onChange={(e) => update("confirmPassword", e.target.value)}
                className={inputClass}
              />
            </Field>

            <button
              type="submit"
              disabled={
                loading || codeStatus === "checking" || codeStatus === "invalid"
              }
              className="btn-primary flex w-full items-center justify-center gap-2"
            >
              <UserPlus size={16} />
              {loading ? t("register.creating") : t("register.createAccount")}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-text-3">
          {t("register.disclaimer")}
        </p>
      </div>

      {loading && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-navy/60 backdrop-blur-sm"
        >
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          <p className="font-heading text-sm font-semibold text-white">
            {t("register.creating")}
          </p>
        </div>
      )}

      {awaitingConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-confirm-heading"
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 size={24} className="text-emerald-600" />
            </div>
            <h2
              id="register-confirm-heading"
              className="mt-4 font-heading text-lg font-bold text-text-1"
            >
              {t("register.accountCreatedTitle")}
            </h2>
            <p className="mt-2 text-sm text-text-3">
              {t("register.checkEmailBody").replace("{email}", awaitingConfirmation)}
            </p>

            {resent && (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                {t("register.resendEmailSent")}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {error}
              </p>
            )}

            <div className="mt-5 space-y-2">
              <button
                onClick={() => navigate("/login")}
                className="btn-primary w-full"
              >
                {t("register.goToSignIn")}
              </button>
              <button
                onClick={() => void handleResend()}
                disabled={resending}
                className="btn-outline w-full disabled:opacity-50"
              >
                {resending ? t("register.resendEmailSending") : t("register.resendEmail")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15";

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-text-2">
        {Icon && <Icon size={13} className="text-text-3" />}
        {label}
      </label>
      {children}
    </div>
  );
}

function DepartmentCombobox({
  departments,
  value,
  onChange,
  placeholder,
  noMatchLabel,
}: {
  departments: Department[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  noMatchLabel: string;
}) {
  const selected = departments.find((d) => d.id === value) ?? null;
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync if the selection changes from outside (e.g. departments
  // finish loading after a value was already set).
  useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [selected]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        // Typed text that doesn't match a real department shouldn't silently keep a stale
        // selection — snap back to whatever's actually chosen (or empty).
        setQuery(selected?.name ?? "");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selected]);

  const matches = departments.filter((d) =>
    d.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="relative mt-1" ref={ref}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`${inputClass} mt-0`}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-canvas-border bg-white shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-text-3">{noMatchLabel}</p>
          ) : (
            matches.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  onChange(d.id);
                  setQuery(d.name);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                  d.id === value
                    ? "bg-royal font-semibold text-white"
                    : "text-text-1 hover:bg-royal-soft"
                }`}
              >
                {d.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
