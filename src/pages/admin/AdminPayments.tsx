import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  Clock,
  Download,
  Inbox,
  Landmark,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";
import { downloadCSV } from "@/lib/csv";

interface Payment {
  id: string;
  user_id: string;
  provider: string;
  provider_reference: string;
  purpose: "department_access" | "suspension_reactivation";
  department_id: string | null;
  amount: number;
  currency: string;
  status: "pending" | "success" | "failed";
  created_at: string;
  verified_at: string | null;
  raw_provider_response: Record<string, unknown> | null;
}

interface PayoutMethod {
  method: string;
  account_number: string | null;
  account_name: string | null;
}

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  currency: "NGN" | "USD";
  status: "pending" | "success" | "failed";
  provider_reference: string | null;
  requested_at: string;
  processed_at: string | null;
  payout_methods: PayoutMethod | null;
}

type StatusFilter = "all" | "success" | "failed" | "pending";

const purposeLabel: Record<Payment["purpose"], string> = {
  department_access: "Department access",
  suspension_reactivation: "Account reactivation",
};

function paystackFields(raw: Record<string, unknown> | null) {
  if (!raw) return null;
  const authorization = raw.authorization as Record<string, unknown> | undefined;
  return {
    channel: (raw.channel as string) ?? (authorization?.channel as string) ?? null,
    gatewayResponse: (raw.gateway_response as string) ?? null,
    paidAt: (raw.paid_at as string) ?? null,
    fees: typeof raw.fees === "number" ? (raw.fees as number) / 100 : null,
    cardType: (authorization?.card_type as string) ?? null,
    bank: (authorization?.bank as string) ?? null,
    last4: (authorization?.last4 as string) ?? null,
  };
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [profileEmails, setProfileEmails] = useState<Record<string, string>>({});
  const [profilePhones, setProfilePhones] = useState<Record<string, string>>({});
  const [departmentNames, setDepartmentNames] = useState<
    Record<string, string>
  >({});
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [recheckRef, setRecheckRef] = useState("");
  const [rechecking, setRechecking] = useState(false);
  const [recheckResult, setRecheckResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const [selected, setSelected] = useState<Payment | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [userPayments, setUserPayments] = useState<Payment[]>([]);
  const [userWithdrawals, setUserWithdrawals] = useState<Withdrawal[]>([]);
  const [detailRecheck, setDetailRecheck] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [detailRechecking, setDetailRechecking] = useState(false);

  async function load() {
    setLoading(true);
    const { data: paymentRows } = await supabase
      .from("payments")
      .select(
        "id, user_id, provider, provider_reference, purpose, department_id, amount, currency, status, created_at, verified_at, raw_provider_response",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    setPayments(paymentRows ?? []);

    const userIds = [...new Set((paymentRows ?? []).map((p) => p.user_id))];
    const deptIds = [
      ...new Set(
        (paymentRows ?? []).map((p) => p.department_id).filter(Boolean),
      ),
    ] as string[];

    const [{ data: profiles }, { data: emailRows }, { data: depts }] =
      await Promise.all([
        userIds.length > 0
          ? supabase
              .from("profiles")
              .select("user_id, display_name, phone")
              .in("user_id", userIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? supabase.rpc("admin_list_emails", { p_user_ids: userIds })
          : Promise.resolve({ data: [] }),
        deptIds.length > 0
          ? supabase.from("departments").select("id, name").in("id", deptIds)
          : Promise.resolve({ data: [] }),
      ]);

    setProfileNames(
      Object.fromEntries(
        (profiles ?? []).map((p) => [p.user_id, p.display_name ?? "Unnamed"]),
      ),
    );
    setProfilePhones(
      Object.fromEntries(
        (profiles ?? []).map((p) => [p.user_id, p.phone ?? ""]),
      ),
    );
    setProfileEmails(
      Object.fromEntries(
        ((emailRows ?? []) as { user_id: string; email: string }[]).map(
          (r) => [r.user_id, r.email],
        ),
      ),
    );
    setDepartmentNames(
      Object.fromEntries((depts ?? []).map((d) => [d.id, d.name])),
    );
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRecheck(e: FormEvent) {
    e.preventDefault();
    const reference = recheckRef.trim();
    if (!reference || rechecking) return;
    setRechecking(true);
    setRecheckResult(null);

    const { data, error } = await supabase.functions.invoke(
      "admin-recheck-payment",
      { body: { reference } },
    );

    if (error || !data?.success) {
      setRecheckResult({
        ok: false,
        message: data?.error ?? error?.message ?? "Recheck failed.",
      });
    } else {
      setRecheckResult({
        ok: true,
        message:
          data.paystackStatus === "success"
            ? data.alreadyProcessed
              ? "Paystack confirms this was successful — already recorded, nothing changed."
              : "Paystack confirms this was successful — recorded now and access granted."
            : `Paystack reports this transaction as "${data.paystackStatus}" — recorded as failed.`,
      });
      await load();
    }
    setRechecking(false);
  }

  async function openDetail(payment: Payment) {
    setSelected(payment);
    setDetailRecheck(null);
    setHistoryLoading(true);
    const [{ data: otherPayments }, { data: withdrawals }] =
      await Promise.all([
        supabase
          .from("payments")
          .select(
            "id, user_id, provider, provider_reference, purpose, department_id, amount, currency, status, created_at, verified_at, raw_provider_response",
          )
          .eq("user_id", payment.user_id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("withdrawals")
          .select(
            "id, user_id, amount, currency, status, provider_reference, requested_at, processed_at, payout_methods(method, account_number, account_name)",
          )
          .eq("user_id", payment.user_id)
          .order("requested_at", { ascending: false })
          .limit(50),
      ]);
    setUserPayments(otherPayments ?? []);
    setUserWithdrawals((withdrawals as unknown as Withdrawal[]) ?? []);
    setHistoryLoading(false);
  }

  async function recheckSelected() {
    if (!selected || detailRechecking) return;
    setDetailRechecking(true);
    setDetailRecheck(null);

    const { data, error } = await supabase.functions.invoke(
      "admin-recheck-payment",
      { body: { reference: selected.provider_reference } },
    );

    if (error || !data?.success) {
      setDetailRecheck({
        ok: false,
        message: data?.error ?? error?.message ?? "Recheck failed.",
      });
    } else {
      setDetailRecheck({
        ok: true,
        message:
          data.paystackStatus === "success"
            ? data.alreadyProcessed
              ? "Paystack confirms this was successful — already recorded, nothing changed."
              : "Paystack confirms this was successful — recorded now and access granted."
            : `Paystack reports this transaction as "${data.paystackStatus}" — recorded as failed.`,
      });
      await load();
      const { data: fresh } = await supabase
        .from("payments")
        .select(
          "id, user_id, provider, provider_reference, purpose, department_id, amount, currency, status, created_at, verified_at, raw_provider_response",
        )
        .eq("provider", "paystack")
        .eq("provider_reference", selected.provider_reference)
        .maybeSingle();
      if (fresh) setSelected(fresh);
    }
    setDetailRechecking(false);
  }

  const filtered = payments.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      p.provider_reference.toLowerCase().includes(term) ||
      (profileNames[p.user_id] ?? "").toLowerCase().includes(term) ||
      (profileEmails[p.user_id] ?? "").toLowerCase().includes(term) ||
      (p.department_id &&
        (departmentNames[p.department_id] ?? "").toLowerCase().includes(term))
    );
  });

  const statusStyle: Record<string, string> = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed: "bg-rose-50 text-rose-700 border-rose-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const statusIcon: Record<string, typeof CheckCircle2> = {
    success: CheckCircle2,
    failed: XCircle,
    pending: Clock,
  };

  function handleExport() {
    const headers = [
      "Reference",
      "Payer",
      "Email",
      "Purpose",
      "Department",
      "Amount",
      "Currency",
      "Status",
      "Date",
    ];
    const rows = filtered.map((p) => [
      p.provider_reference,
      profileNames[p.user_id] ?? "",
      profileEmails[p.user_id] ?? "",
      purposeLabel[p.purpose],
      p.department_id ? (departmentNames[p.department_id] ?? "") : "",
      String(p.amount),
      p.currency,
      p.status,
      format(new Date(p.created_at), "yyyy-MM-dd HH:mm"),
    ]);
    downloadCSV("financial_ledger.csv", [headers, ...rows]);
  }

  const selectedFields = selected
    ? paystackFields(selected.raw_provider_response)
    : null;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-text-1">
          Transactions
        </h1>
        <button
          onClick={handleExport}
          className="btn-outline flex items-center gap-1.5 text-sm"
        >
          <Download size={14} />
          Export
        </button>
      </div>

      <div className="card-luxury mt-4 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-text-1">
          <ShieldCheck size={16} className="text-royal" />
          Recheck a transaction
        </p>
        <p className="mt-0.5 text-xs text-text-3">
          A student says they paid but it's not reflecting? Paste the Paystack reference below
          to check it live against Paystack — a confirmed success is recorded and access is
          granted immediately if it wasn't already.
        </p>
        <form onSubmit={handleRecheck} className="mt-3 flex flex-wrap gap-2">
          <input
            value={recheckRef}
            onChange={(e) => setRecheckRef(e.target.value)}
            placeholder="Paystack reference…"
            className="min-w-[220px] flex-1 rounded-xl border border-canvas-border bg-white px-3 py-2 font-mono text-sm text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
          />
          <button
            type="submit"
            disabled={rechecking || !recheckRef.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {rechecking ? "Checking…" : "Recheck"}
          </button>
        </form>
        {recheckResult && (
          <p
            className={`mt-2 text-sm font-medium ${recheckResult.ok ? "text-emerald-700" : "text-rose-600"}`}
          >
            {recheckResult.message}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", "success", "failed", "pending"] as StatusFilter[]).map(
          (s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold capitalize ${
                status === s
                  ? "bg-royal text-white"
                  : "bg-canvas-soft text-text-2"
              }`}
            >
              {s}
            </button>
          ),
        )}
        <div className="relative ml-auto min-w-[220px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, payer, email, department…"
            className="w-full rounded-xl border border-canvas-border bg-white py-1.5 pl-9 pr-3 text-sm focus:border-royal focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-text-3">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card-luxury mt-4 flex flex-col items-center gap-2 p-10 text-center">
          <Inbox size={28} className="text-text-3" />
          <p className="text-sm text-text-3">No transactions match.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-canvas-border bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-canvas-border bg-canvas-soft text-[11px] font-bold uppercase tracking-widest text-text-3">
                <th className="px-5 py-3 font-bold">Protocol ref</th>
                <th className="px-5 py-3 font-bold">Scholarly payer</th>
                <th className="px-5 py-3 font-bold">Purpose</th>
                <th className="px-5 py-3 font-bold">Endowment</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Timestamp</th>
                <th className="px-5 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const StatusIcon = statusIcon[p.status];
                return (
                  <tr
                    key={p.id}
                    className="border-b border-canvas-border last:border-0"
                  >
                    <td className="px-5 py-4 font-mono text-xs text-text-2">
                      {p.provider_reference}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-text-1">
                        {profileNames[p.user_id] ?? "Unknown"}
                      </p>
                      <p className="text-xs text-text-3">
                        {profileEmails[p.user_id] ?? ""}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs text-text-2">
                      {purposeLabel[p.purpose]}
                      {p.department_id && (
                        <>
                          <br />
                          <span className="text-text-3">
                            {departmentNames[p.department_id]}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-5 py-4 font-bold text-text-1">
                      {p.currency === "NGN" ? "₦" : "$"}
                      {Number(p.amount).toLocaleString()}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusStyle[p.status]}`}
                      >
                        <StatusIcon size={11} />
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-text-3">
                      {format(new Date(p.created_at), "yyyy-MM-dd")}
                      <br />
                      {format(new Date(p.created_at), "HH:mm")}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => void openDetail(p)}
                        className="rounded-xl border border-royal/30 bg-royal-soft px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-royal transition-colors hover:bg-royal/15"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-4 py-8">
          <div className="card-luxury flex max-h-full w-full max-w-2xl flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-canvas-border px-6 py-4">
              <div>
                <h2 className="font-heading text-lg font-bold text-text-1">
                  Payment details
                </h2>
                <p className="font-mono text-xs text-text-3">
                  {selected.provider_reference}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-full p-1.5 text-text-3 hover:bg-canvas-soft hover:text-text-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                    Payer
                  </p>
                  <p className="font-semibold text-text-1">
                    {profileNames[selected.user_id] ?? "Unknown"}
                  </p>
                  <p className="text-xs text-text-3">
                    {profileEmails[selected.user_id] ?? "—"}
                  </p>
                  {profilePhones[selected.user_id] && (
                    <p className="text-xs text-text-3">
                      {profilePhones[selected.user_id]}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                    Amount
                  </p>
                  <p className="font-bold text-text-1">
                    {selected.currency === "NGN" ? "₦" : "$"}
                    {Number(selected.amount).toLocaleString()}
                  </p>
                  <span
                    className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusStyle[selected.status]}`}
                  >
                    {(() => {
                      const StatusIcon = statusIcon[selected.status];
                      return <StatusIcon size={11} />;
                    })()}
                    {selected.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                    Purpose
                  </p>
                  <p className="text-text-1">{purposeLabel[selected.purpose]}</p>
                  {selected.department_id && (
                    <p className="text-xs text-text-3">
                      {departmentNames[selected.department_id]}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                    Provider
                  </p>
                  <p className="capitalize text-text-1">{selected.provider}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                    Created
                  </p>
                  <p className="text-text-1">
                    {format(new Date(selected.created_at), "yyyy-MM-dd HH:mm:ss")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                    Verified
                  </p>
                  <p className="text-text-1">
                    {selected.verified_at
                      ? format(new Date(selected.verified_at), "yyyy-MM-dd HH:mm:ss")
                      : "—"}
                  </p>
                </div>
              </div>

              {selectedFields && (
                <div className="mt-4 rounded-xl border border-canvas-border bg-canvas-soft p-3 text-xs text-text-2">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-3">
                    Gateway detail (stored)
                  </p>
                  <div className="grid grid-cols-2 gap-y-1">
                    {selectedFields.channel && (
                      <p>Channel: {selectedFields.channel}</p>
                    )}
                    {selectedFields.bank && <p>Bank: {selectedFields.bank}</p>}
                    {selectedFields.cardType && (
                      <p>Card: {selectedFields.cardType} …{selectedFields.last4}</p>
                    )}
                    {selectedFields.fees !== null && (
                      <p>Fees: {selectedFields.fees}</p>
                    )}
                    {selectedFields.paidAt && (
                      <p>Paid at: {selectedFields.paidAt}</p>
                    )}
                    {selectedFields.gatewayResponse && (
                      <p className="col-span-2">
                        Gateway response: {selectedFields.gatewayResponse}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-royal/20 bg-royal-soft/40 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-royal">
                  <ShieldCheck size={13} />
                  Check live on Paystack
                </p>
                <p className="mt-0.5 text-xs text-text-3">
                  Queries Paystack directly for this reference's current state, independent of
                  what's stored here.
                </p>
                <button
                  onClick={() => void recheckSelected()}
                  disabled={detailRechecking}
                  className="btn-outline mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  <RefreshCw
                    size={12}
                    className={detailRechecking ? "animate-spin" : ""}
                  />
                  {detailRechecking ? "Checking…" : "Recheck on Paystack"}
                </button>
                {detailRecheck && (
                  <p
                    className={`mt-2 text-xs font-medium ${detailRecheck.ok ? "text-emerald-700" : "text-rose-600"}`}
                  >
                    {detailRecheck.message}
                  </p>
                )}
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                  This payer's other payments
                </p>
                {historyLoading ? (
                  <p className="mt-2 text-xs text-text-3">Loading…</p>
                ) : userPayments.length <= 1 ? (
                  <p className="mt-2 text-xs text-text-3">No other payments on record.</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {userPayments
                      .filter((p) => p.id !== selected.id)
                      .map((p) => {
                        const StatusIcon = statusIcon[p.status];
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded-lg border border-canvas-border px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-mono text-text-2">
                                {p.provider_reference}
                              </p>
                              <p className="text-text-3">
                                {purposeLabel[p.purpose]} ·{" "}
                                {format(new Date(p.created_at), "yyyy-MM-dd HH:mm")}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="font-semibold text-text-1">
                                {p.currency === "NGN" ? "₦" : "$"}
                                {Number(p.amount).toLocaleString()}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-semibold capitalize ${statusStyle[p.status]}`}
                              >
                                <StatusIcon size={10} />
                                {p.status}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                  This payer's requests to be paid (withdrawals)
                </p>
                {historyLoading ? (
                  <p className="mt-2 text-xs text-text-3">Loading…</p>
                ) : userWithdrawals.length === 0 ? (
                  <p className="mt-2 text-xs text-text-3">
                    No withdrawal requests on record.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {userWithdrawals.map((w) => {
                      const StatusIcon = statusIcon[w.status];
                      return (
                        <div
                          key={w.id}
                          className="flex items-center justify-between rounded-lg border border-canvas-border px-3 py-2 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {w.payout_methods?.method === "bank_transfer" ? (
                              <Landmark size={13} className="shrink-0 text-royal" />
                            ) : (
                              <Wallet size={13} className="shrink-0 text-royal" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-text-2">
                                {w.payout_methods?.method ?? "—"} ·{" "}
                                {w.payout_methods?.account_number ?? "no account on file"}
                              </p>
                              <p className="text-text-3">
                                Requested{" "}
                                {format(new Date(w.requested_at), "yyyy-MM-dd HH:mm")}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-semibold text-text-1">
                              {w.currency === "NGN" ? "₦" : "$"}
                              {Number(w.amount).toLocaleString()}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-semibold capitalize ${statusStyle[w.status]}`}
                            >
                              <StatusIcon size={10} />
                              {w.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
