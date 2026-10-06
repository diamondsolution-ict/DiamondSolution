import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Gift, Globe, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { Layout } from "@/components/Layout";
import { validatePassword } from "@/lib/passwordPolicy";

type PasswordStep = "form" | "otp";

interface TotpFactor {
  id: string;
  friendly_name: string | null;
  status: "verified" | "unverified";
}

export default function AccountSettings() {
  const { user, profile, refreshProfile } = useAuth();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [identity, setIdentity] = useState({
    displayName: profile?.display_name ?? "",
    username: profile?.username ?? "",
    university: profile?.university ?? "",
    whatsapp: profile?.whatsapp ?? "",
  });
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityInfo, setIdentityInfo] = useState<string | null>(null);

  const [passwordStep, setPasswordStep] = useState<PasswordStep>("form");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordInfo, setPasswordInfo] = useState<string | null>(null);

  const [totpFactors, setTotpFactors] = useState<TotpFactor[]>([]);
  const [enrollment, setEnrollment] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaInfo, setMfaInfo] = useState<string | null>(null);

  async function loadTotpFactors() {
    const { data } = await supabase.auth.mfa.listFactors();
    // `data.totp` only ever contains verified factors (that's its type) — `data.all` filtered
    // to totp is the only way to also see an unverified, mid-enrollment one.
    setTotpFactors(
      (data?.all ?? []).filter((f) => f.factor_type === "totp") as TotpFactor[],
    );
  }

  useEffect(() => {
    void loadTotpFactors();
  }, []);

  async function startEnroll() {
    setMfaError(null);
    setMfaInfo(null);
    setMfaBusy(true);

    // Clean up any abandoned attempt first — mfa.enroll() always creates a fresh unverified
    // factor, and Supabase doesn't dedupe those, so a second attempt after closing the QR
    // code without finishing would otherwise just pile up orphaned factors.
    const unverified = totpFactors.filter((f) => f.status === "unverified");
    for (const f of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator app",
    });
    setMfaBusy(false);
    if (error || !data) {
      setMfaError(error?.message ?? "Couldn't start setup.");
      return;
    }
    setEnrollment({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    setMfaBusy(true);
    setMfaError(null);

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
    if (challengeError || !challenge) {
      setMfaBusy(false);
      setMfaError(challengeError?.message ?? "Couldn't verify — try again.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollment.factorId,
      challengeId: challenge.id,
      code: totpCode,
    });
    setMfaBusy(false);

    if (verifyError) {
      setMfaError(
        "Incorrect code — check your authenticator app and try again.",
      );
      return;
    }

    setEnrollment(null);
    setTotpCode("");
    setMfaInfo("Authenticator app connected.");
    await loadTotpFactors();
  }

  async function cancelEnroll() {
    if (enrollment) {
      await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    }
    setEnrollment(null);
    setTotpCode("");
    setMfaError(null);
  }

  async function removeFactor(factorId: string) {
    setMfaBusy(true);
    setMfaError(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setMfaBusy(false);
    if (error) {
      setMfaError(error.message);
      return;
    }
    setMfaInfo("Authenticator app removed.");
    await loadTotpFactors();
  }

  async function saveIdentity(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setIdentityError(null);
    setIdentityInfo(null);

    if (!identity.username.trim()) {
      setIdentityError("Username is required.");
      return;
    }

    setIdentitySaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: identity.displayName.trim() || null,
        username: identity.username.trim().toLowerCase(),
        university: identity.university.trim() || null,
        whatsapp: identity.whatsapp.trim() || null,
        phone: identity.whatsapp.trim() || null,
      })
      .eq("user_id", user.id);
    setIdentitySaving(false);

    if (error) {
      setIdentityError(error.message);
      return;
    }
    setIdentityInfo("Identity updated.");
    void refreshProfile();
  }

  async function submitPasswordForm(e: FormEvent) {
    e.preventDefault();
    if (!user?.email) return;
    setPasswordError(null);
    setPasswordInfo(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    const policyError = validatePassword(newPassword);
    if (policyError) {
      setPasswordError(policyError);
      return;
    }

    setPasswordBusy(true);

    // Re-authenticate with the current password before anything else — proves the caller
    // actually knows it, the same guard the old app's Firebase reauth step provided.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (reauthError) {
      setPasswordBusy(false);
      setPasswordError("Current password is incorrect.");
      return;
    }

    const { data, error } = await supabase.functions.invoke("request-otp", {
      body: { purpose: "password_change" },
    });
    setPasswordBusy(false);

    if (error || !data?.success) {
      setPasswordError(
        `Couldn't send a security code: ${error?.message ?? data?.error ?? "unknown error"}`,
      );
      return;
    }
    setPasswordInfo(`A 6-digit code was sent to ${user.email}.`);
    setPasswordStep("otp");
  }

  async function submitOtp(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordBusy(true);

    const { data: verifyData, error: verifyError } =
      await supabase.functions.invoke("verify-otp", {
        body: { purpose: "password_change", code: otpCode },
      });

    if (verifyError || !verifyData?.success) {
      setPasswordBusy(false);
      setPasswordError("Invalid security code.");
      return;
    }

    const { data: changeData, error: changeError } =
      await supabase.functions.invoke("change-password", {
        body: { new_password: newPassword, otp_token: verifyData.token },
      });
    setPasswordBusy(false);

    if (changeError || !changeData?.success) {
      setPasswordError(
        `Couldn't change password: ${changeError?.message ?? changeData?.error ?? "unknown error"}`,
      );
      return;
    }

    setOtpToken(verifyData.token);
    setPasswordInfo("Password changed. Redirecting…");
    setTimeout(() => navigate("/profile"), 1200);
  }

  async function resendOtp() {
    if (!user?.email) return;
    setPasswordError(null);
    setPasswordBusy(true);
    const { error } = await supabase.functions.invoke("request-otp", {
      body: { purpose: "password_change" },
    });
    setPasswordBusy(false);
    if (error) {
      setPasswordError("Couldn't resend the code — try again shortly.");
      return;
    }
    setPasswordInfo(`A new code was sent to ${user.email}.`);
  }

  return (
    <Layout title="Account" onBack={() => navigate("/profile")}>
      <div className="card-luxury p-5">
        <h2 className="font-heading text-sm font-bold text-text-1">
          User Identity
        </h2>
        <form onSubmit={saveIdentity} className="mt-3 space-y-3">
          <input
            placeholder="Display name"
            value={identity.displayName}
            onChange={(e) =>
              setIdentity((f) => ({ ...f, displayName: e.target.value }))
            }
            className={inputClass}
          />
          <input
            placeholder="Username"
            value={identity.username}
            onChange={(e) =>
              setIdentity((f) => ({
                ...f,
                username: e.target.value.toLowerCase().replace(/\s/g, ""),
              }))
            }
            className={inputClass}
          />
          <input
            placeholder="University / Institution"
            value={identity.university}
            onChange={(e) =>
              setIdentity((f) => ({ ...f, university: e.target.value }))
            }
            className={inputClass}
          />
          <input
            placeholder="+2348012345678"
            value={identity.whatsapp}
            onChange={(e) =>
              setIdentity((f) => ({ ...f, whatsapp: e.target.value }))
            }
            className={inputClass}
          />
          {identityError && <ErrorBanner message={identityError} />}
          {identityInfo && <InfoBanner message={identityInfo} />}
          <button
            type="submit"
            disabled={identitySaving}
            className="btn-primary w-full"
          >
            {identitySaving ? "Saving…" : "Save identity"}
          </button>
        </form>
      </div>

      <div className="card-luxury mt-4 p-5">
        <h2 className="font-heading text-sm font-bold text-text-1">Language</h2>
        <p className="mt-2 text-sm text-text-3">
          Applies to the sign-in/registration pages and the main navigation.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Globe size={16} className="text-text-3" />
          <div className="flex overflow-hidden rounded-xl border border-canvas-border">
            <button
              onClick={() => void setLanguage("en")}
              className={`px-4 py-1.5 text-xs font-semibold transition-colors ${
                language === "en"
                  ? "bg-royal text-white"
                  : "bg-white text-text-2 hover:bg-canvas-soft"
              }`}
            >
              English
            </button>
            <button
              onClick={() => void setLanguage("fr")}
              className={`px-4 py-1.5 text-xs font-semibold transition-colors ${
                language === "fr"
                  ? "bg-royal text-white"
                  : "bg-white text-text-2 hover:bg-canvas-soft"
              }`}
            >
              Français
            </button>
          </div>
        </div>
      </div>

      <div className="card-luxury mt-4 p-5">
        <h2 className="font-heading text-sm font-bold text-text-1">
          Payout Credentials
        </h2>
        <p className="mt-2 text-sm text-text-3">
          Bank details and other payout methods for affiliate withdrawals are
          managed from the Affiliate page.
        </p>
        <button
          onClick={() => navigate("/affiliate")}
          className="btn-secondary mt-3 flex w-full items-center justify-center gap-2"
        >
          <Gift size={16} />
          Manage payout methods
        </button>
      </div>

      <div className="card-luxury mt-4 p-5">
        <h2 className="font-heading text-sm font-bold text-text-1">
          Authenticator App
        </h2>
        <p className="mt-2 text-sm text-text-3">
          Connect an authenticator app (Google Authenticator, Authy, 1Password,
          …) for a faster security check on admin actions — no waiting for an
          email code.
        </p>

        {mfaError && (
          <div className="mt-3">
            <ErrorBanner message={mfaError} />
          </div>
        )}
        {mfaInfo && (
          <div className="mt-3">
            <InfoBanner message={mfaInfo} />
          </div>
        )}

        {totpFactors.some((f) => f.status === "verified") && (
          <div className="mt-3 space-y-2">
            {totpFactors
              .filter((f) => f.status === "verified")
              .map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-xl border border-canvas-border px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    <span className="text-sm font-medium text-text-1">
                      {f.friendly_name || "Authenticator app"}
                    </span>
                  </div>
                  <button
                    onClick={() => void removeFactor(f.id)}
                    disabled={mfaBusy}
                    className="rounded-lg p-1.5 text-text-3 hover:bg-canvas-soft hover:text-rose-600 disabled:opacity-50"
                    title="Remove"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
          </div>
        )}

        {!enrollment ? (
          <button
            onClick={() => void startEnroll()}
            disabled={mfaBusy}
            className="btn-secondary mt-3 flex w-full items-center justify-center gap-2"
          >
            <Smartphone size={16} />
            {mfaBusy ? "Starting…" : "Connect an authenticator app"}
          </button>
        ) : (
          <form onSubmit={confirmEnroll} className="mt-3 space-y-3">
            <div className="flex justify-center rounded-xl border border-canvas-border bg-white p-4">
              {/* mfa.enroll() already returns a ready-to-use "data:image/svg+xml;utf-8,<svg>…"
                  string (GoTrueClient prepends that itself) — wrapping it again here produced
                  a broken image (data URI inside a data URI), caught via a screenshot during
                  this feature's own testing. */}
              <img
                src={enrollment.qrCode}
                alt="Scan with your authenticator app"
                className="h-40 w-40"
              />
            </div>
            <p className="text-center text-xs text-text-3">
              Can't scan? Enter this code manually:{" "}
              <span className="font-mono font-semibold text-text-1">
                {enrollment.secret}
              </span>
            </p>
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={totpCode}
              onChange={(e) =>
                setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className={`${inputClass} text-center font-mono text-lg tracking-[0.5em]`}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void cancelEnroll()}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mfaBusy || totpCode.length !== 6}
                className="btn-primary flex-1"
              >
                {mfaBusy ? "Confirming…" : "Confirm"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card-luxury mt-4 p-5">
        <h2 className="font-heading text-sm font-bold text-text-1">
          Security Override
        </h2>

        {passwordStep === "form" ? (
          <form onSubmit={submitPasswordForm} className="mt-3 space-y-3">
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
            {passwordError && <ErrorBanner message={passwordError} />}
            {passwordInfo && <InfoBanner message={passwordInfo} />}
            <button
              type="submit"
              disabled={passwordBusy}
              className="btn-primary w-full"
            >
              {passwordBusy ? "Verifying…" : "Change password"}
            </button>
            <p className="text-xs text-text-3">
              Losing access to {user?.email} blocks password changes entirely —
              email is the only verification path.
            </p>
          </form>
        ) : (
          <form onSubmit={submitOtp} className="mt-3 space-y-3">
            <p className="text-sm text-text-3">
              Security Token Required — enter the 6-digit code sent to{" "}
              {user?.email}.
            </p>
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otpCode}
              onChange={(e) =>
                setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className={`${inputClass} text-center font-mono text-lg tracking-[0.5em]`}
            />
            {passwordError && <ErrorBanner message={passwordError} />}
            {passwordInfo && <InfoBanner message={passwordInfo} />}
            <button
              type="submit"
              disabled={passwordBusy || otpCode.length !== 6 || !!otpToken}
              className="btn-primary w-full"
            >
              {passwordBusy ? "Confirming…" : "Confirm code"}
            </button>
            <div className="flex justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setPasswordStep("form");
                  setOtpCode("");
                  setPasswordError(null);
                }}
                className="font-semibold text-text-3 hover:underline"
              >
                Wait, go back
              </button>
              <button
                type="button"
                onClick={() => void resendOtp()}
                className="font-semibold text-royal hover:underline"
              >
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {message}
    </p>
  );
}
function InfoBanner({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {message}
    </p>
  );
}

const inputClass =
  "w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15";
