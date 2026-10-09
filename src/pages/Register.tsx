import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Building2,
  GraduationCap,
  Lock,
  Mail,
  MessageCircle,
  User,
  UserPlus,
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
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("departments")
      .select("id, name")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setDepartments(data ?? []));
  }, []);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

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
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      navigate("/dashboard");
    } else {
      setInfo(t("register.checkEmail"));
    }
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
            {info && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {info}
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
              disabled={loading}
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
