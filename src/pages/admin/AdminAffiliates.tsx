import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Coins, Link2, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";
import { StepUpModal } from "@/components/StepUpModal";
import { downloadCSV } from "@/lib/csv";

type SubTab = "commissions" | "registry";

interface Commission {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  commission_amount: number;
  commission_currency: string;
  status: "pending" | "paid";
  created_at: string;
}
interface Balance {
  user_id: string;
  currency: "NGN" | "USD";
  total_earned: number;
  total_withdrawn: number;
  balance: number;
}
interface AffiliateProfile {
  user_id: string;
  referral_code: string;
  status: string;
}

export default function AdminAffiliates() {
  const [subTab, setSubTab] = useState<SubTab>("commissions");
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateProfile[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pendingCommissionId, setPendingCommissionId] = useState<string | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: commissionRows }, { data: balanceRows }, { data: affiliateRows }] =
      await Promise.all([
        supabase
          .from("commissions")
          .select(
            "id, referrer_user_id, referred_user_id, commission_amount, commission_currency, status, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("affiliate_balances").select("*"),
        supabase
          .from("affiliate_profiles")
          .select("user_id, referral_code, status")
          .order("activated_at", { ascending: false }),
      ]);
    setCommissions(commissionRows ?? []);
    setBalances(balanceRows ?? []);
    setAffiliates(affiliateRows ?? []);

    const userIds = [
      ...new Set([
        ...(commissionRows ?? []).map((c) => c.referrer_user_id),
        ...(affiliateRows ?? []).map((a) => a.user_id),
      ]),
    ];
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      setNames(
        Object.fromEntries(
          (profileRows ?? []).map((p) => [p.user_id, p.display_name ?? "Unnamed"]),
        ),
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function authorizePayment(otpToken: string) {
    if (!pendingCommissionId) return;
    setBusyId(pendingCommissionId);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "admin-approve-commission",
      { body: { commission_id: pendingCommissionId, otp_token: otpToken } },
    );
    setBusyId(null);
    setPendingCommissionId(null);
    if (invokeError || !data?.success) {
      setError(
        `Couldn't approve payment: ${invokeError?.message ?? data?.error ?? "unknown error"}`,
      );
      return;
    }
    setInfo("Commission marked as paid.");
    void load();
  }

  function balancesFor(userId: string) {
    return balances.filter((b) => b.user_id === userId);
  }

  function exportCsv() {
    if (subTab === "commissions") {
      const rows = [
        ["Referrer", "Amount", "Currency", "Status", "Date"],
        ...commissions.map((c) => [
          names[c.referrer_user_id] ?? c.referrer_user_id,
          String(c.commission_amount),
          c.commission_currency,
          c.status,
          c.created_at,
        ]),
      ];
      downloadCSV(`affiliate_commissions_${Date.now()}.csv`, rows);
    } else {
      const rows = [
        ["Name", "Referral Code", "Status", "Total Earned", "Total Paid", "Balance"],
        ...affiliates.map((a) => {
          const b = balancesFor(a.user_id);
          const earned = b.reduce((s, x) => s + x.total_earned, 0);
          const withdrawn = b.reduce((s, x) => s + x.total_withdrawn, 0);
          const balance = b.reduce((s, x) => s + x.balance, 0);
          return [
            names[a.user_id] ?? a.user_id,
            a.referral_code,
            a.status,
            String(earned),
            String(withdrawn),
            String(balance),
          ];
        }),
      ];
      downloadCSV(`affiliate_registry_${Date.now()}.csv`, rows);
    }
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-text-1">
          Affiliates
        </h1>
        <button onClick={exportCsv} className="btn-outline">
          Export CSV
        </button>
      </div>

      <div className="mt-4 inline-flex rounded-xl border border-canvas-border bg-white p-1">
        {(["commissions", "registry"] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
              subTab === t ? "bg-royal text-white" : "text-text-3"
            }`}
          >
            {t === "commissions" ? "Commissions" : "Partner Registry"}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {info && (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {info}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-text-3">Loading…</p>
      ) : subTab === "commissions" ? (
        <div className="mt-4 space-y-2">
          {commissions.length === 0 && (
            <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
              <Coins size={28} className="text-text-3" />
              <p className="text-sm text-text-3">No commissions yet.</p>
            </div>
          )}
          {commissions.map((c) => (
            <div
              key={c.id}
              className="card-luxury flex items-center gap-3 p-4"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-pale">
                <Coins size={15} className="text-gold-dark" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-text-1">
                  {names[c.referrer_user_id] ?? c.referrer_user_id}
                </p>
                <p className="text-xs text-text-3">
                  {format(new Date(c.created_at), "MMM d, yyyy · HH:mm")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-heading font-bold text-royal">
                  {c.commission_amount.toLocaleString()} {c.commission_currency}
                </span>
                {c.status === "paid" ? (
                  <span className="badge-royal">paid</span>
                ) : (
                  <button
                    onClick={() => setPendingCommissionId(c.id)}
                    disabled={busyId === c.id}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Authorize Payment
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {affiliates.length === 0 && (
            <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
              <Users size={28} className="text-text-3" />
              <p className="text-sm text-text-3">No partners yet.</p>
            </div>
          )}
          {affiliates.map((a) => {
            const b = balancesFor(a.user_id);
            return (
              <div key={a.user_id} className="card-luxury p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-royal-soft text-xs font-bold text-royal">
                      {(names[a.user_id] ?? "P").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-text-1">
                        {names[a.user_id] ?? a.user_id}
                      </p>
                      <p className="flex items-center gap-1 font-mono text-xs text-royal">
                        <Link2 size={11} />
                        {a.referral_code}
                      </p>
                    </div>
                  </div>
                  <span className="badge-royal capitalize">{a.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  {b.length === 0 ? (
                    <p className="col-span-3 text-text-3">No earnings yet</p>
                  ) : (
                    b.map((row) => (
                      <div
                        key={row.currency}
                        className="rounded-lg bg-canvas-soft py-2"
                      >
                        <p className="font-bold text-text-1">
                          {row.balance.toLocaleString()} {row.currency}
                        </p>
                        <p className="text-text-3">
                          earned {row.total_earned.toLocaleString()} · paid{" "}
                          {row.total_withdrawn.toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingCommissionId && (
        <StepUpModal
          title="Authorize commission payment"
          description="Marks this commission as paid. This is bookkeeping only — it doesn't move money; use the Withdrawals tab for the actual payout."
          onCancel={() => setPendingCommissionId(null)}
          onVerified={(token) => void authorizePayment(token)}
        />
      )}
    </AdminLayout>
  );
}
