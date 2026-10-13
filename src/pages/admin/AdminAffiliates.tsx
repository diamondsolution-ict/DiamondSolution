import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, Link2, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";
import { downloadCSV } from "@/lib/csv";

type SubTab = "matrix" | "registry";

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

const CURRENCY_SYMBOL: Record<string, string> = { NGN: "₦", USD: "$" };

function money(amount: number, currency: string) {
  return `${CURRENCY_SYMBOL[currency] ?? ""}${amount.toLocaleString()}`;
}

export default function AdminAffiliates() {
  const [subTab, setSubTab] = useState<SubTab>("matrix");
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateProfile[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

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
      const [{ data: profileRows }, { data: emailRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name, username")
          .in("user_id", userIds),
        supabase.rpc("admin_list_emails", { p_user_ids: userIds }),
      ]);
      setDisplayNames(
        Object.fromEntries(
          (profileRows ?? []).map((p) => [p.user_id, p.display_name ?? "Unnamed"]),
        ),
      );
      setUsernames(
        Object.fromEntries(
          (profileRows ?? []).map((p) => [p.user_id, p.username ?? p.user_id]),
        ),
      );
      setEmails(
        Object.fromEntries(
          ((emailRows ?? []) as { user_id: string; email: string }[]).map((r) => [
            r.user_id,
            r.email,
          ]),
        ),
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function balancesFor(userId: string) {
    return balances.filter((b) => b.user_id === userId);
  }

  function exportCsv() {
    if (subTab === "matrix") {
      const rows = [
        ["Referrer", "Amount", "Currency", "Status", "Date"],
        ...commissions.map((c) => [
          usernames[c.referrer_user_id] ?? c.referrer_user_id,
          String(c.commission_amount),
          c.commission_currency,
          c.status,
          c.created_at,
        ]),
      ];
      downloadCSV(`affiliate_matrix_${Date.now()}.csv`, rows);
    } else {
      const rows = [
        ["Name", "Email", "Referral Code", "Total Earned", "Total Paid", "Balance"],
        ...affiliates.map((a) => {
          const b = balancesFor(a.user_id);
          const earned = b.reduce((s, x) => s + x.total_earned, 0);
          const withdrawn = b.reduce((s, x) => s + x.total_withdrawn, 0);
          const balance = b.reduce((s, x) => s + x.balance, 0);
          return [
            displayNames[a.user_id] ?? a.user_id,
            emails[a.user_id] ?? "",
            a.referral_code,
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
      <div className="flex gap-6 border-b border-canvas-border">
        {(["matrix", "registry"] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`-mb-px border-b-2 pb-3 text-xs font-bold uppercase tracking-widest transition-colors ${
              subTab === t
                ? "border-royal text-royal"
                : "border-transparent text-text-3 hover:text-text-2"
            }`}
          >
            {t === "matrix" ? "Matrix" : "Partner Registry"}
          </button>
        ))}
      </div>

      <button
        onClick={exportCsv}
        className="btn-outline mt-4 flex items-center gap-1.5 text-xs"
      >
        <Download size={13} />
        Export
      </button>

      {loading ? (
        <p className="mt-4 text-sm text-text-3">Loading…</p>
      ) : subTab === "matrix" ? (
        commissions.length === 0 ? (
          <div className="card-luxury mt-4 flex flex-col items-center gap-2 p-10 text-center">
            <Users size={28} className="text-text-3" />
            <p className="text-sm text-text-3">No commissions yet.</p>
          </div>
        ) : (
          <>
          {/* Read-only ledger — there used to be an "Authorize payment" action here that just
              flipped commissions.status without moving any money or affecting the affiliate's
              actual balance (affiliate_balances sums every commission regardless of status).
              Removed: it looked like a real payout control but wasn't one. The real payout
              mechanism — the Withdrawals tab, backed by Paystack transfers or a manual
              mark-as-paid — is unaffected by this; this tab is purely "what was earned, when".
              Below sm: 3 columns still don't fit a phone screen — a stacked card instead. */}
          <div className="mt-4 space-y-3 sm:hidden">
            {commissions.map((c) => (
              <div key={c.id} className="card-luxury p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-semibold text-text-1">
                    {usernames[c.referrer_user_id] ?? c.referrer_user_id}
                  </p>
                  <p className="shrink-0 font-bold text-text-1">
                    {money(c.commission_amount, c.commission_currency)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-text-3">
                  {format(new Date(c.created_at), "yyyy-MM-dd HH:mm")}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-canvas-border bg-white sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-canvas-border bg-canvas-soft text-[11px] font-bold uppercase tracking-widest text-text-3">
                  <th className="px-5 py-3 font-bold">Commission referrer</th>
                  <th className="px-5 py-3 font-bold">Accrued amount</th>
                  <th className="px-5 py-3 font-bold">Earned</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id} className="border-b border-canvas-border last:border-0">
                    <td className="px-5 py-4 font-semibold text-text-1">
                      {usernames[c.referrer_user_id] ?? c.referrer_user_id}
                    </td>
                    <td className="px-5 py-4 font-bold text-text-1">
                      {money(c.commission_amount, c.commission_currency)}
                    </td>
                    <td className="px-5 py-4 text-xs text-text-3">
                      {format(new Date(c.created_at), "yyyy-MM-dd HH:mm")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )
      ) : affiliates.length === 0 ? (
        <div className="card-luxury mt-4 flex flex-col items-center gap-2 p-10 text-center">
          <Users size={28} className="text-text-3" />
          <p className="text-sm text-text-3">No partners yet.</p>
        </div>
      ) : (
        <>
        {/* Below sm: 5 columns of financial detail don't fit a phone screen — a stacked card
            keeps earned/paid/balance all visible together instead of needing a sideways
            scroll to compare them. */}
        <div className="mt-4 space-y-3 sm:hidden">
          {affiliates.map((a) => {
            const b = balancesFor(a.user_id);
            const primary = b[0];
            const currency = primary?.currency ?? "NGN";
            const earned = b.reduce((s, x) => s + x.total_earned, 0);
            const withdrawn = b.reduce((s, x) => s + x.total_withdrawn, 0);
            const balance = b.reduce((s, x) => s + x.balance, 0);
            return (
              <div key={a.user_id} className="card-luxury p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-text-1">
                      {displayNames[a.user_id] ?? a.user_id}
                    </p>
                    <p className="truncate text-xs text-text-3">{emails[a.user_id] ?? ""}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-royal/30 bg-royal-soft px-2.5 py-1 font-mono text-xs font-bold uppercase text-royal">
                    <Link2 size={11} />
                    {a.referral_code}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-canvas-border pt-3 text-center">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-text-3">
                      Earned
                    </p>
                    <p className="font-bold text-text-1 line-through decoration-2">
                      {money(earned, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-text-3">
                      Paid
                    </p>
                    <p className="font-bold text-emerald-600 line-through decoration-2">
                      {money(withdrawn, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-text-3">
                      Balance
                    </p>
                    <p className="font-bold text-royal line-through decoration-2">
                      {money(balance, currency)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-canvas-border bg-white sm:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-canvas-border bg-canvas-soft text-[11px] font-bold uppercase tracking-widest text-text-3">
                <th className="px-5 py-3 font-bold">Partner name</th>
                <th className="px-5 py-3 font-bold">Referral code</th>
                <th className="px-5 py-3 font-bold">Total earned</th>
                <th className="px-5 py-3 font-bold">Total paid</th>
                <th className="px-5 py-3 font-bold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map((a) => {
                const b = balancesFor(a.user_id);
                const primary = b[0];
                const currency = primary?.currency ?? "NGN";
                const earned = b.reduce((s, x) => s + x.total_earned, 0);
                const withdrawn = b.reduce((s, x) => s + x.total_withdrawn, 0);
                const balance = b.reduce((s, x) => s + x.balance, 0);
                return (
                  <tr key={a.user_id} className="border-b border-canvas-border last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-bold text-text-1">
                        {displayNames[a.user_id] ?? a.user_id}
                      </p>
                      <p className="text-xs text-text-3">{emails[a.user_id] ?? ""}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full border border-royal/30 bg-royal-soft px-2.5 py-1 font-mono text-xs font-bold uppercase text-royal">
                        <Link2 size={11} />
                        {a.referral_code}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-bold text-text-1 line-through decoration-2">
                      {money(earned, currency)}
                    </td>
                    <td className="px-5 py-4 font-bold text-emerald-600 line-through decoration-2">
                      {money(withdrawn, currency)}
                    </td>
                    <td className="px-5 py-4 font-bold text-royal line-through decoration-2">
                      {money(balance, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </AdminLayout>
  );
}
