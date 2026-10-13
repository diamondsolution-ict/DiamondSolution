import { useEffect, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import {
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Gem,
  Gift,
  Landmark,
  Trash2,
  Users,
  Wallet,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { functionErrorMessage } from "@/lib/functionError";

interface AffiliateProfile {
  referral_code: string;
  status: "inactive" | "active";
  activated_at: string | null;
}
interface Balance {
  currency: string;
  total_earned: number;
  total_withdrawn: number;
  balance: number;
}
interface Commission {
  id: string;
  referred_user_id: string;
  commission_amount: number;
  commission_currency: string;
  status: string;
  created_at: string;
}
interface PayoutMethod {
  id: string;
  currency: string;
  method: string;
  bank_code: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
}
interface Bank {
  name: string;
  code: string;
}
interface Withdrawal {
  id: string;
  amount: number;
  currency: string;
  status: string;
  requested_at: string;
}
interface Referral {
  referred_user_id: string;
  referred_at: string;
}

function randomCode(seed: string) {
  const base =
    seed
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8) || "SCHOLAR";
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}${suffix}`;
}

export default function Affiliate() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [affiliate, setAffiliate] = useState<AffiliateProfile | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [settings, setSettings] = useState({
    commissionRate: 0.25,
    minWithdrawalNgn: 10000,
  });
  const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null);
  const [methodPendingDelete, setMethodPendingDelete] = useState<PayoutMethod | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showMethodModal, setShowMethodModal] = useState(false);
  const [addingMethod, setAddingMethod] = useState(false);

  const [withdrawForm, setWithdrawForm] = useState({
    amount: "",
    payoutMethodId: "",
  });

  async function load() {
    if (!user) return;
    setLoading(true);

    const [{ data: affiliateRow }, { data: settingsRow }] = await Promise.all([
      supabase
        .from("affiliate_profiles")
        .select("referral_code, status, activated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("app_settings")
        .select("commission_rate, min_withdrawal_ngn")
        .eq("id", 1)
        .maybeSingle(),
    ]);
    setAffiliate(affiliateRow ?? null);
    if (settingsRow) {
      setSettings({
        commissionRate: settingsRow.commission_rate,
        minWithdrawalNgn: settingsRow.min_withdrawal_ngn,
      });
    }

    if (affiliateRow) {
      const [
        { data: balanceRows },
        { data: commissionRows },
        { data: methodRows },
        { data: withdrawalRows },
        { data: referralRows },
      ] = await Promise.all([
        supabase.from("affiliate_balances").select("*").eq("user_id", user.id),
        supabase
          .from("commissions")
          .select(
            "id, referred_user_id, commission_amount, commission_currency, status, created_at",
          )
          .eq("referrer_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("payout_methods")
          .select(
            "id, currency, method, bank_code, bank_name, account_number, account_name",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("withdrawals")
          .select("id, amount, currency, status, requested_at")
          .eq("user_id", user.id)
          .order("requested_at", { ascending: false })
          .limit(50),
        // Every signup attributed to this referrer, not just the ones that converted into a
        // commission — without this, a referral that signed up but hasn't paid yet (or a
        // broken attribution) is simply invisible, making it impossible to tell "nobody's
        // signing up with my link" apart from "they signed up but haven't paid".
        supabase
          .from("referrals")
          .select("referred_user_id, referred_at")
          .eq("referrer_user_id", user.id)
          .order("referred_at", { ascending: false })
          .limit(50),
      ]);

      setBalances(balanceRows ?? []);
      setCommissions(commissionRows ?? []);
      setPayoutMethods(methodRows ?? []);
      setWithdrawals(withdrawalRows ?? []);
      setReferrals(referralRows ?? []);

      const referredIds = [
        ...new Set(
          [
            ...(commissionRows ?? []).map((c) => c.referred_user_id),
            ...(referralRows ?? []).map((r) => r.referred_user_id),
          ],
        ),
      ];
      if (referredIds.length > 0) {
        const { data: nameRows } = await supabase.rpc("public_profile_names", {
          p_user_ids: referredIds,
        });
        setNames(
          new Map(
            (nameRows ?? []).map(
              (n: { user_id: string; display_name: string }) => [
                n.user_id,
                n.display_name,
              ],
            ),
          ),
        );
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function becomeAffiliate() {
    if (!user) return;
    setActivating(true);
    setError(null);

    const seed =
      profile?.username ?? profile?.display_name ?? user.email ?? "scholar";
    for (let attempt = 0; attempt < 6; attempt++) {
      const { error: insertError } = await supabase
        .from("affiliate_profiles")
        .insert({
          user_id: user.id,
          referral_code: randomCode(seed),
          status: "active",
          activated_at: new Date().toISOString(),
        });
      if (!insertError) {
        await load();
        setActivating(false);
        return;
      }
      // 23505 = unique_violation — retry with a fresh random suffix on a referral_code
      // collision; any other error means something real is wrong, so stop and surface it.
      if (insertError.code !== "23505") {
        setError(insertError.message);
        setActivating(false);
        return;
      }
    }
    setError("Could not generate a unique referral code — please try again.");
    setActivating(false);
  }

  // Called only once the add-method modal has resolved a real account name from Paystack, so
  // account_name is always what the institution itself reports, never something the student
  // typed.
  async function addPayoutMethod(resolved: {
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
  }) {
    if (!user) return;
    setError(null);
    setAddingMethod(true);
    const { error: insertError } = await supabase.from("payout_methods").insert({
      user_id: user.id,
      currency: "NGN",
      method: "bank_transfer",
      bank_code: resolved.bankCode,
      bank_name: resolved.bankName,
      account_number: resolved.accountNumber,
      account_name: resolved.accountName,
    });
    setAddingMethod(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setInfo("Payout method added.");
    setShowMethodModal(false);
    void load();
  }

  async function confirmDeletePayoutMethod() {
    const method = methodPendingDelete;
    if (!method) return;
    setDeletingMethodId(method.id);
    setError(null);
    const { error: deleteError } = await supabase
      .from("payout_methods")
      .delete()
      .eq("id", method.id);
    setDeletingMethodId(null);
    setMethodPendingDelete(null);
    if (deleteError) {
      setError(
        deleteError.code === "23503"
          ? "Can't remove this payout method — it's attached to a withdrawal request on record. Contact support if you need it changed."
          : deleteError.message,
      );
      return;
    }
    if (withdrawForm.payoutMethodId === method.id) {
      setWithdrawForm((f) => ({ ...f, payoutMethodId: "" }));
    }
    setInfo("Payout method removed.");
    void load();
  }

  async function requestWithdrawal(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setInfo(null);

    const amount = Number(withdrawForm.amount);
    const min = settings.minWithdrawalNgn;
    if (!amount || amount < min) {
      setError(`Minimum withdrawal is ₦${min.toLocaleString()}.`);
      return;
    }
    const balance = balances.find((b) => b.currency === "NGN")?.balance ?? 0;
    if (amount > balance) {
      setError(`You only have ₦${balance.toLocaleString()} available.`);
      return;
    }
    if (!withdrawForm.payoutMethodId) {
      setError("Add a payout method first.");
      return;
    }

    const { error: insertError } = await supabase.from("withdrawals").insert({
      user_id: user.id,
      amount,
      currency: "NGN",
      payout_method_id: withdrawForm.payoutMethodId,
      status: "pending",
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setWithdrawForm({ amount: "", payoutMethodId: "" });
    setInfo("Withdrawal requested — an admin will process it shortly.");
    setShowWithdrawModal(false);
    void load();
  }

  const referralLink = affiliate
    ? `${window.location.origin}/register?ref=${affiliate.referral_code}`
    : "";

  function copyLink() {
    void navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const methodsForWithdrawCurrency = payoutMethods.filter(
    (m) => m.currency === "NGN",
  );
  const ngnBalance = balances.find((b) => b.currency === "NGN")?.balance ?? 0;
  const ngnEarned =
    balances.find((b) => b.currency === "NGN")?.total_earned ?? 0;

  if (loading) {
    return (
      <Layout title="Affiliate">
        <p className="text-sm text-text-3">Loading…</p>
      </Layout>
    );
  }

  if (!affiliate) {
    return (
      <Layout title="Affiliate">
        <div className="card-luxury p-6">
          <div className="diamond-gradient flex h-12 w-12 items-center justify-center rounded-full">
            <Gift size={22} className="text-white" />
          </div>
          <h2 className="mt-4 font-heading text-lg font-bold text-text-1">
            Earn by referring friends
          </h2>
          <p className="mt-2 text-sm text-text-3">
            Share your personal link. When someone you refer pays for department
            access, you earn a {Math.round(settings.commissionRate * 100)}%
            commission — paid out to your bank account once your balance clears
            the minimum withdrawal.
          </p>
          {error && (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button
            onClick={() => void becomeAffiliate()}
            disabled={activating}
            className="btn-primary mt-4 w-full"
          >
            {activating ? "Activating…" : "Become an affiliate"}
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Affiliate">
      <p className="-mt-2 text-[11px] font-bold uppercase tracking-widest text-text-3">
        Institutional growth & revenue share
      </p>

      <div className="mt-4 card-luxury p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-text-3">
              Withdrawable endowment
            </p>
            <p className="mt-1 truncate font-heading text-3xl font-bold text-text-1 sm:text-4xl">
              ₦{ngnBalance.toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => setShowWithdrawModal(true)}
            disabled={ngnBalance <= 0 || payoutMethods.length === 0}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-navy px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-navy-light active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
          >
            <Banknote size={14} />
            Place withdrawal
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-royal-soft p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-royal">
            <Landmark size={14} />
            Account details
          </p>
          {payoutMethods.length === 0 ? (
            <>
              <p className="mt-1.5 text-xs text-text-3">
                Authorize your institutional bank account to enable revenue
                redistribution.
              </p>
              <button
                onClick={() => setShowMethodModal(true)}
                className="mt-2 text-xs font-bold text-royal hover:underline"
              >
                Initialize credentials →
              </button>
            </>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              {payoutMethods.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-text-1">
                      {m.account_name}
                    </p>
                    <p className="truncate text-[11px] text-text-3">
                      {m.bank_name ? `${m.bank_name} · ` : ""}
                      {m.account_number}
                    </p>
                  </div>
                  <button
                    onClick={() => setMethodPendingDelete(m)}
                    disabled={deletingMethodId === m.id}
                    aria-label={`Remove payout method ${m.account_name}`}
                    className="shrink-0 rounded-lg p-1 text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setShowMethodModal(true)}
                className="text-xs font-bold text-royal hover:underline"
              >
                + Add another
              </button>
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-text-3">
              Referral line
            </p>
            <span className="badge-royal">{affiliate.referral_code}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={referralLink}
              className="flex-1 truncate rounded-xl border border-canvas-border bg-canvas-soft px-3 py-2 text-xs text-text-2"
            />
            <button
              onClick={copyLink}
              aria-label="Copy referral link"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy text-white transition-colors hover:bg-navy-light"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      </div>

      {info && (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {info}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={Users}
          value={referrals.length.toLocaleString()}
          label="Referred assets"
        />
        <StatTile
          icon={Gem}
          value={`₦${ngnEarned.toLocaleString()}`}
          label="Total earned"
        />
        <StatTile
          icon={Zap}
          iconClass="bg-emerald-50 text-emerald-600"
          value={`${Math.round(settings.commissionRate * 100)}%`}
          label="Revenue share"
        />
        <StatTile
          icon={Wallet}
          value={`₦${ngnBalance.toLocaleString()}`}
          label="Net balance"
        />
      </div>

      <ArchiveSection
        label="Commission archives"
        labelClass="text-emerald-600"
        empty={commissions.length === 0}
        emptyText="Awaiting your first institutional endowment"
      >
        {commissions.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-text-1">
                {names.get(c.referred_user_id) ?? "A referral"}
              </p>
              <p className="text-xs text-text-3">
                {format(new Date(c.created_at), "MMM d, yyyy")}
              </p>
            </div>
            <span className="shrink-0 font-semibold text-royal">
              +{c.commission_amount.toLocaleString()} {c.commission_currency}
            </span>
          </div>
        ))}
      </ArchiveSection>

      <ArchiveSection
        label="Revenue redistributions"
        labelClass="text-royal"
        empty={withdrawals.length === 0}
        emptyText="No redistributed revenue found in archives"
      >
        {withdrawals.map((w) => (
          <div
            key={w.id}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <div>
              <p className="font-semibold text-text-2">
                {w.amount.toLocaleString()} {w.currency}
              </p>
              <p className="text-xs text-text-3">
                {format(new Date(w.requested_at), "MMM d, yyyy")}
              </p>
            </div>
            <StatusBadge status={w.status} />
          </div>
        ))}
      </ArchiveSection>

      <ArchiveSection
        label="Network synchronization"
        labelClass="text-text-3"
        empty={referrals.length === 0}
        emptyText="Awaiting network expansion…"
      >
        {referrals.map((r) => {
          const earnings = commissions.filter(
            (c) => c.referred_user_id === r.referred_user_id,
          );
          // Group by currency — almost always one entry, but a referral who paid for
          // departments priced in different currencies would have more than one.
          const totalsByCurrency = new Map<string, number>();
          for (const c of earnings) {
            totalsByCurrency.set(
              c.commission_currency,
              (totalsByCurrency.get(c.commission_currency) ?? 0) +
                c.commission_amount,
            );
          }
          return (
            <div
              key={r.referred_user_id}
              className="flex items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 text-text-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-royal-soft text-[10px] font-bold text-royal">
                  {(names.get(r.referred_user_id) ?? "?")
                    .charAt(0)
                    .toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">
                    {names.get(r.referred_user_id) ?? "A referral"}
                  </span>
                  <span className="text-xs text-text-3">
                    Signed up {format(new Date(r.referred_at), "MMM d, yyyy")}
                  </span>
                </span>
              </span>
              {totalsByCurrency.size > 0 ? (
                <span className="shrink-0 text-right font-semibold text-royal">
                  {[...totalsByCurrency.entries()]
                    .map(([cur, amt]) => `+${amt.toLocaleString()} ${cur}`)
                    .join(", ")}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-text-3">
                  Not converted yet
                </span>
              )}
            </div>
          );
        })}
      </ArchiveSection>

      {showWithdrawModal && (
        <WithdrawModal
          amount={withdrawForm.amount}
          payoutMethodId={withdrawForm.payoutMethodId}
          methods={methodsForWithdrawCurrency}
          minWithdrawal={settings.minWithdrawalNgn}
          error={error}
          onAmountChange={(v) => setWithdrawForm((f) => ({ ...f, amount: v }))}
          onMethodChange={(v) =>
            setWithdrawForm((f) => ({ ...f, payoutMethodId: v }))
          }
          onSubmit={requestWithdrawal}
          onClose={() => {
            setShowWithdrawModal(false);
            setError(null);
          }}
        />
      )}

      {showMethodModal && (
        <AddMethodModal
          submitting={addingMethod}
          onSubmit={(resolved) => void addPayoutMethod(resolved)}
          onClose={() => {
            setShowMethodModal(false);
            setError(null);
          }}
        />
      )}

      {methodPendingDelete && (
        <DeletePayoutMethodModal
          method={methodPendingDelete}
          deleting={deletingMethodId === methodPendingDelete.id}
          onCancel={() => setMethodPendingDelete(null)}
          onConfirm={() => void confirmDeletePayoutMethod()}
        />
      )}
    </Layout>
  );
}

function StatTile({
  icon: Icon,
  iconClass = "bg-royal-soft text-royal",
  value,
  label,
}: {
  icon: typeof Users;
  iconClass?: string;
  value: string;
  label: string;
}) {
  return (
    <div className="card-luxury p-4">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}
      >
        <Icon size={15} />
      </div>
      <p className="mt-2 truncate font-heading text-lg font-bold text-text-1">
        {value}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-3">
        {label}
      </p>
    </div>
  );
}

function ArchiveSection({
  label,
  labelClass,
  empty,
  emptyText,
  children,
}: {
  label: string;
  labelClass: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2">
        <p
          className={`shrink-0 text-[11px] font-bold uppercase tracking-widest ${labelClass}`}
        >
          {label}
        </p>
        <div className="h-px flex-1 bg-canvas-border" />
      </div>
      {empty ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-canvas-border p-8 text-center">
          <Clock size={22} className="text-text-3" />
          <p className="text-xs italic text-text-3">{emptyText}</p>
        </div>
      ) : (
        <div className="mt-3 card-luxury divide-y divide-canvas-border p-0">
          {children}
        </div>
      )}
    </div>
  );
}

function WithdrawModal({
  amount,
  payoutMethodId,
  methods,
  minWithdrawal,
  error,
  onAmountChange,
  onMethodChange,
  onSubmit,
  onClose,
}: {
  amount: string;
  payoutMethodId: string;
  methods: PayoutMethod[];
  minWithdrawal: number;
  error: string | null;
  onAmountChange: (v: string) => void;
  onMethodChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-heading"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="withdraw-heading" className="font-heading text-lg font-bold text-text-1">
            Place withdrawal
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-text-3 hover:bg-canvas-soft"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="withdraw-amount" className="text-xs font-semibold text-text-2">
              Amount (₦)
            </label>
            <input
              ref={amountRef}
              id="withdraw-amount"
              type="number"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="withdraw-method" className="text-xs font-semibold text-text-2">
              Payout method
            </label>
            <select
              id="withdraw-method"
              value={payoutMethodId}
              onChange={(e) => onMethodChange(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">Select payout method</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.account_name} · {m.bank_name ? `${m.bank_name} ` : ""}
                  {m.account_number}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-text-3">
            Minimum ₦{minWithdrawal.toLocaleString()}
          </p>
          {error && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary flex w-full items-center justify-center gap-2"
          >
            <Banknote size={15} />
            Request withdrawal
          </button>
        </form>
      </div>
    </div>
  );
}

function AddMethodModal({
  submitting,
  onSubmit,
  onClose,
}: {
  submitting: boolean;
  onSubmit: (resolved: {
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
  }) => void;
  onClose: () => void;
}) {
  const bankSelectRef = useRef<HTMLSelectElement>(null);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksError, setBanksError] = useState<string | null>(null);

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const bankName = banks.find((b) => b.code === bankCode)?.name ?? "";

  useEffect(() => {
    bankSelectRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function loadBanks() {
      setBanksLoading(true);
      setBanksError(null);
      const { data, error } = await supabase.functions.invoke("list-banks");
      if (cancelled) return;
      if (error || !data?.success) {
        setBanksError(
          await functionErrorMessage(data, error, "Couldn't load the bank list."),
        );
      } else {
        setBanks(data.banks ?? []);
      }
      setBanksLoading(false);
    }
    void loadBanks();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-resolves the account name the moment both a bank and a full 10-digit account number
  // are in — no separate "verify" button to remember to press, and nothing to type for the
  // name itself since it's read back from the institution.
  useEffect(() => {
    setResolvedName(null);
    setResolveError(null);
    if (!bankCode || accountNumber.length !== 10) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setResolving(true);
      const { data, error } = await supabase.functions.invoke(
        "resolve-bank-account",
        { body: { account_number: accountNumber, bank_code: bankCode } },
      );
      if (cancelled) return;
      if (error || !data?.success) {
        setResolveError(
          await functionErrorMessage(
            data,
            error,
            "Could not resolve this account.",
          ),
        );
      } else {
        setResolvedName(data.account_name);
      }
      setResolving(false);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bankCode, accountNumber]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resolvedName) return;
    onSubmit({ bankCode, bankName, accountNumber, accountName: resolvedName });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-method-heading"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="add-method-heading" className="font-heading text-lg font-bold text-text-1">
            Initialize credentials
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-text-3 hover:bg-canvas-soft"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-xs text-text-3">
          Bank transfer only — payouts are sent via Paystack.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="method-bank" className="text-xs font-semibold text-text-2">
              Financial institution
            </label>
            <select
              ref={bankSelectRef}
              id="method-bank"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              disabled={banksLoading || !!banksError}
              className={`${inputClass} mt-1 disabled:opacity-60`}
            >
              <option value="">
                {banksLoading ? "Loading banks…" : "Select your bank"}
              </option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
            {banksError && (
              <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
                {banksError}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="method-account-number" className="text-xs font-semibold text-text-2">
              Account number
            </label>
            <input
              id="method-account-number"
              inputMode="numeric"
              maxLength={10}
              value={accountNumber}
              onChange={(e) =>
                setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              className={`${inputClass} mt-1`}
            />
          </div>

          {(resolving || resolvedName || resolveError) && (
            <div
              className={`rounded-xl border px-3 py-2.5 text-sm ${
                resolveError
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : resolvedName
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-canvas-border bg-canvas-soft text-text-3"
              }`}
            >
              {resolving && "Resolving account name…"}
              {!resolving && resolvedName && (
                <>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    Account name
                  </span>
                  {resolvedName}
                </>
              )}
              {!resolving && resolveError && (
                <span role="alert">{resolveError}</span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!resolvedName || submitting}
            className="btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-50"
          >
            <Landmark size={15} />
            {submitting ? "Adding…" : "Add payout method"}
          </button>
        </form>
      </div>
    </div>
  );
}

function DeletePayoutMethodModal({
  method,
  deleting,
  onCancel,
  onConfirm,
}: {
  method: PayoutMethod;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-payout-method-heading"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2
            id="delete-payout-method-heading"
            className="font-heading text-lg font-bold text-text-1"
          >
            Remove payout method?
          </h2>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="rounded-full p-1 text-text-3 hover:bg-canvas-soft"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 text-sm text-text-3">
          <span className="font-semibold text-text-1">{method.account_name}</span>
          <br />
          {method.bank_name ? `${method.bank_name} · ` : ""}
          {method.account_number}
        </p>
        <p className="mt-2 text-sm text-text-3">
          You won't be able to use it for future withdrawals. This can't be undone.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "success"
      ? "badge-royal"
      : status === "failed"
        ? "inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
        : "badge-gold";
  const Icon =
    status === "success" ? CheckCircle2 : status === "failed" ? XCircle : Clock;
  return (
    <span className={classes}>
      <Icon size={11} />
      {status}
    </span>
  );
}

const inputClass =
  "w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15";
