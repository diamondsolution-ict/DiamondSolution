import { useEffect, useState, type FormEvent } from "react";
import {
  Facebook,
  Instagram,
  KeyRound,
  Mail,
  MessageCircle,
  Percent,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Twitter,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { AdminLayout } from "@/components/AdminLayout";
import { functionErrorMessage } from "@/lib/functionError";

interface Links {
  telegram: string;
  whatsapp: string;
  facebook: string;
  twitter: string;
  instagram: string;
  support_email: string;
}

const EMPTY_LINKS: Links = {
  telegram: "",
  whatsapp: "",
  facebook: "",
  twitter: "",
  instagram: "",
  support_email: "",
};

const FIELDS: {
  key: keyof Links;
  label: string;
  placeholder: string;
  icon: LucideIcon;
}[] = [
  {
    key: "telegram",
    label: "Telegram Handle",
    // A private group/channel's invite link (t.me/+<code>) has no bare handle at all, so
    // this field accepts either — a plain handle still becomes https://t.me/<handle>, but a
    // full https://t.me/... link (invite links included) is used exactly as pasted.
    placeholder: "@diamondsolution or a full t.me/... invite link",
    icon: Send,
  },
  {
    key: "whatsapp",
    label: "WhatsApp Interface",
    // Same as Telegram: a WhatsApp Channel link (whatsapp.com/channel/<id>) has no phone
    // number to extract, so a full link here is used as-is instead of being stripped to
    // digits the way a plain phone number is.
    placeholder: "+2348012345678 or a full wa.me/... or channel link",
    icon: MessageCircle,
  },
  {
    key: "support_email",
    label: "Support Email Archive",
    placeholder: "support@diamondsolution.com",
    icon: Mail,
  },
  {
    key: "twitter",
    label: "Twitter (X) Command",
    placeholder: "@diamondsolution or a full profile link",
    icon: Twitter,
  },
  {
    key: "facebook",
    label: "Facebook Network",
    placeholder: "facebook.com/diamondsolution",
    icon: Facebook,
  },
  {
    key: "instagram",
    label: "Instagram Feed",
    placeholder: "@diamondsolution or a full profile link",
    icon: Instagram,
  },
];

export default function AdminSettings() {
  const { user } = useAuth();
  const [links, setLinks] = useState<Links>(EMPTY_LINKS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [codeSaving, setCodeSaving] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeInfo, setCodeInfo] = useState<string | null>(null);

  const [commissionRate, setCommissionRate] = useState("25");
  const [minWithdrawalNgn, setMinWithdrawalNgn] = useState("10000");
  const [autoPayoutEnabled, setAutoPayoutEnabled] = useState(true);
  const [affiliateSaving, setAffiliateSaving] = useState(false);
  const [affiliateError, setAffiliateError] = useState<string | null>(null);
  const [affiliateInfo, setAffiliateInfo] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data }, { data: affiliateSettings }] = await Promise.all([
      supabase
        .from("institutional_links")
        .select(
          "telegram, whatsapp, facebook, twitter, instagram, support_email",
        )
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("app_settings")
        .select(
          "commission_rate, min_withdrawal_ngn, withdrawal_auto_payout_enabled",
        )
        .eq("id", 1)
        .maybeSingle(),
    ]);
    if (data) {
      setLinks({
        telegram: data.telegram ?? "",
        whatsapp: data.whatsapp ?? "",
        facebook: data.facebook ?? "",
        twitter: data.twitter ?? "",
        instagram: data.instagram ?? "",
        support_email: data.support_email ?? "",
      });
    }
    if (affiliateSettings) {
      setCommissionRate(String(Math.round(affiliateSettings.commission_rate * 100)));
      setMinWithdrawalNgn(String(affiliateSettings.min_withdrawal_ngn));
      setAutoPayoutEnabled(affiliateSettings.withdrawal_auto_payout_enabled);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setInfo(null);

    const payload = Object.fromEntries(
      Object.entries(links).map(([k, v]) => [k, v.trim() || null]),
    );
    const { error: updateError } = await supabase
      .from("institutional_links")
      .update({ ...payload, updated_by: user?.id })
      .eq("id", 1);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setInfo("Settings saved.");
  }

  async function saveAffiliateSettings(e: FormEvent) {
    e.preventDefault();
    setAffiliateError(null);
    setAffiliateInfo(null);

    const rate = Number(commissionRate);
    const ngn = Number(minWithdrawalNgn);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setAffiliateError("Commission rate must be between 0 and 100.");
      return;
    }
    if (!Number.isFinite(ngn) || ngn <= 0) {
      setAffiliateError("Minimum withdrawal must be greater than 0.");
      return;
    }

    setAffiliateSaving(true);
    const { error: updateError } = await supabase
      .from("app_settings")
      .update({
        commission_rate: rate / 100,
        min_withdrawal_ngn: ngn,
        withdrawal_auto_payout_enabled: autoPayoutEnabled,
        updated_by: user?.id,
      })
      .eq("id", 1);
    setAffiliateSaving(false);

    if (updateError) {
      setAffiliateError(updateError.message);
      return;
    }
    setAffiliateInfo("Affiliate program settings saved.");
  }

  async function changeStepUpCode(e: FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setCodeInfo(null);

    if (newCode !== confirmCode) {
      setCodeError("New code and confirmation don't match.");
      return;
    }
    if (!/^\d{4,10}$/.test(newCode)) {
      setCodeError("The new code must be 4–10 digits.");
      return;
    }

    setCodeSaving(true);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "admin-set-stepup-code",
      { body: { current_code: currentCode, new_code: newCode } },
    );
    setCodeSaving(false);

    if (invokeError || !data?.success) {
      setCodeError(await functionErrorMessage(data, invokeError, "Couldn't change the code."));
      return;
    }
    setCurrentCode("");
    setNewCode("");
    setConfirmCode("");
    setCodeInfo("Admin security code updated.");
  }

  return (
    <AdminLayout>
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-text-1">
        <Settings size={22} className="text-royal" />
        Settings
      </h1>
      <p className="mt-1 text-sm text-text-3">
        Contact links shown across the public-facing site.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-text-3">Loading…</p>
      ) : (
        <form onSubmit={save} className="card-luxury mt-6 space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="flex items-center gap-1.5 text-sm font-medium text-text-2">
                  <f.icon size={13} className="text-text-3" />
                  {f.label}
                </label>
                <input
                  value={links[f.key]}
                  onChange={(e) =>
                    setLinks((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  placeholder={f.placeholder}
                  className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
                />
              </div>
            ))}
          </div>

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

          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            <Save size={15} />
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}

      <form
        onSubmit={saveAffiliateSettings}
        className="card-luxury mt-6 space-y-4 p-6"
      >
        <div>
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-text-1">
            <Percent size={17} className="text-royal" />
            Affiliate program
          </h2>
          <p className="mt-1 text-sm text-text-3">
            Controls what a referrer earns, the smallest withdrawal they can request, and how
            payouts get settled.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-text-2">
              Commission rate (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
            />
            <p className="mt-1 text-xs text-text-3">
              % of a referred payment credited to the referrer.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-text-2">
              Min withdrawal (₦)
            </label>
            <input
              type="number"
              min={1}
              value={minWithdrawalNgn}
              onChange={(e) => setMinWithdrawalNgn(e.target.value)}
              className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
            />
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-canvas-border bg-canvas-soft p-4">
          <input
            type="checkbox"
            checked={autoPayoutEnabled}
            onChange={(e) => setAutoPayoutEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-royal"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-text-1">
              <Wallet size={14} className="text-royal" />
              Automatic payouts
            </span>
            <span className="mt-0.5 block text-xs text-text-3">
              When on, approving an eligible NGN bank-transfer withdrawal (Withdrawals tab) sends
              it via Paystack immediately. When off, every withdrawal — eligible or not — must be
              settled with "Mark as paid manually", so nothing pays out unless an admin confirms
              it happened outside this app.
            </span>
          </span>
        </label>

        {affiliateError && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {affiliateError}
          </p>
        )}
        {affiliateInfo && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {affiliateInfo}
          </p>
        )}

        <button
          type="submit"
          disabled={affiliateSaving}
          className="btn-primary flex items-center gap-2"
        >
          <Save size={15} />
          {affiliateSaving ? "Saving…" : "Save affiliate settings"}
        </button>
      </form>

      <form
        onSubmit={changeStepUpCode}
        className="card-luxury mt-6 space-y-4 p-6"
      >
        <div>
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-text-1">
            <ShieldCheck size={17} className="text-royal" />
            Your admin security code
          </h2>
          <p className="mt-1 text-sm text-text-3">
            Personal to your account — nobody else's code changes when you change yours. You
            enter it once per browser session to open the admin area, and again in the
            "Security Clearance Required" prompt before destructive actions (suspending/
            deleting users, changing roles).
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-text-2">
              <KeyRound size={13} className="text-text-3" />
              Current code
            </label>
            <input
              inputMode="numeric"
              value={currentCode}
              onChange={(e) =>
                setCurrentCode(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-text-2">
              <KeyRound size={13} className="text-text-3" />
              New code
            </label>
            <input
              inputMode="numeric"
              value={newCode}
              onChange={(e) =>
                setNewCode(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="4–10 digits"
              className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-text-2">
              <KeyRound size={13} className="text-text-3" />
              Confirm new code
            </label>
            <input
              inputMode="numeric"
              value={confirmCode}
              onChange={(e) =>
                setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              className="mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
            />
          </div>
        </div>

        {codeError && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {codeError}
          </p>
        )}
        {codeInfo && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {codeInfo}
          </p>
        )}

        <button
          type="submit"
          disabled={codeSaving}
          className="btn-secondary flex items-center gap-2"
        >
          <ShieldCheck size={15} />
          {codeSaving ? "Updating…" : "Update security code"}
        </button>
      </form>
    </AdminLayout>
  );
}
