import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  Clock,
  Inbox,
  Landmark,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";
import { functionErrorMessage } from "@/lib/functionError";

interface PayoutMethod {
  method: string;
  bank_code: string | null;
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
  provider_response: Record<string, unknown> | null;
  requested_at: string;
  processed_at: string | null;
  payout_methods: PayoutMethod | null;
}

type StatusFilter = "pending" | "success" | "failed" | "all";

export default function AdminWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [autoPayoutEnabled, setAutoPayoutEnabled] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recheckResult, setRecheckResult] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const [{ data: rows }, { data: settingsRow }] = await Promise.all([
      supabase
        .from("withdrawals")
        .select(
          "id, user_id, amount, currency, status, provider_reference, provider_response, requested_at, processed_at, payout_methods(method, bank_code, account_number, account_name)",
        )
        .order("requested_at", { ascending: false })
        .limit(200),
      supabase
        .from("app_settings")
        .select("withdrawal_auto_payout_enabled")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    setWithdrawals((rows as unknown as Withdrawal[]) ?? []);
    if (settingsRow) setAutoPayoutEnabled(settingsRow.withdrawal_auto_payout_enabled);

    const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
    if (userIds.length > 0) {
      const [{ data: profiles }, { data: emailRows }] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name").in("user_id", userIds),
        supabase.rpc("admin_list_emails", { p_user_ids: userIds }),
      ]);
      setNames(
        Object.fromEntries(
          (profiles ?? []).map((p) => [p.user_id, p.display_name ?? "Unnamed"]),
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

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "request-payout",
      {
        body: { withdrawal_id: id, action: "approve" },
      },
    );
    setBusyId(null);
    if (invokeError || !data?.success) {
      setError(
        `Payout failed: ${await functionErrorMessage(data, invokeError, "unknown error")} — withdrawal marked failed, settle manually if needed.`,
      );
    }
    void load();
  }

  async function reject(id: string) {
    const reason = window.prompt("Reason for rejecting this withdrawal?") ?? "";
    setBusyId(id);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "request-payout",
      {
        body: { withdrawal_id: id, action: "reject", reason },
      },
    );
    setBusyId(null);
    if (invokeError || !data?.success) {
      setError(`Reject failed: ${await functionErrorMessage(data, invokeError, "unknown error")}`);
    }
    void load();
  }

  async function markPaidManually(id: string) {
    const reference = window.prompt(
      "External payment reference (e.g. bank transaction id)?",
    );
    if (!reference) return;
    setBusyId(id);
    setError(null);
    const { error: updateError } = await supabase.rpc(
      "mark_withdrawal_paid_manually",
      { p_withdrawal_id: id, p_reference: reference },
    );
    setBusyId(null);
    if (updateError) setError(updateError.message);
    void load();
  }

  async function recheck(id: string) {
    setBusyId(id);
    setError(null);
    setRecheckResult((prev) => ({ ...prev, [id]: "" }));
    const { data, error: invokeError } = await supabase.functions.invoke(
      "request-payout",
      { body: { withdrawal_id: id, action: "recheck" } },
    );
    setBusyId(null);
    if (invokeError || !data?.success) {
      setError(`Recheck failed: ${await functionErrorMessage(data, invokeError, "unknown error")}`);
      return;
    }
    setRecheckResult((prev) => ({
      ...prev,
      [id]: data.changed
        ? `Paystack now reports "${data.paystackStatus}" — updated to ${data.status}.`
        : `Paystack still reports "${data.paystackStatus}" — no change.`,
    }));
    if (data.changed) void load();
  }

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      withdrawals.filter((w) => {
        if (status !== "all" && w.status !== status) return false;
        if (!needle) return true;
        return (
          (names[w.user_id] ?? "").toLowerCase().includes(needle) ||
          (emails[w.user_id] ?? "").toLowerCase().includes(needle) ||
          (w.provider_reference ?? "").toLowerCase().includes(needle) ||
          (w.payout_methods?.account_number ?? "").toLowerCase().includes(needle)
        );
      }),
    [withdrawals, status, needle, names, emails],
  );

  const summary = useMemo(() => {
    const pending = withdrawals.filter((w) => w.status === "pending");
    const success = withdrawals.filter((w) => w.status === "success");
    const sumBy = (rows: Withdrawal[], currency: "NGN" | "USD") =>
      rows.filter((w) => w.currency === currency).reduce((s, w) => s + Number(w.amount), 0);
    return {
      pendingCount: pending.length,
      pendingNgn: sumBy(pending, "NGN"),
      pendingUsd: sumBy(pending, "USD"),
      paidNgn: sumBy(success, "NGN"),
      paidUsd: sumBy(success, "USD"),
    };
  }, [withdrawals]);

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

  return (
    <AdminLayout>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-text-1">
          Withdrawals
        </h1>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card-luxury p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-text-3">
            <Clock size={12} className="text-amber-600" />
            Pending
          </p>
          <p className="mt-1 font-heading text-xl font-bold text-text-1">
            {summary.pendingCount}
          </p>
          <p className="text-[11px] text-text-3">
            {summary.pendingNgn > 0 && `₦${summary.pendingNgn.toLocaleString()}`}
            {summary.pendingNgn > 0 && summary.pendingUsd > 0 && " · "}
            {summary.pendingUsd > 0 && `$${summary.pendingUsd.toLocaleString()}`}
            {summary.pendingNgn === 0 && summary.pendingUsd === 0 && "—"}
          </p>
        </div>
        <div className="card-luxury p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-text-3">
            <CheckCircle2 size={12} className="text-emerald-600" />
            Paid out
          </p>
          <p className="mt-1 font-heading text-xl font-bold text-emerald-600">
            ₦{summary.paidNgn.toLocaleString()}
          </p>
          <p className="text-[11px] text-text-3">
            {summary.paidUsd > 0 ? `+ $${summary.paidUsd.toLocaleString()}` : "Last 200 requests"}
          </p>
        </div>
        <div className="card-luxury col-span-2 p-4 sm:col-span-1">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-text-3">
            <ShieldAlert size={12} className="text-royal" />
            Automatic payouts
          </p>
          <p
            className={`mt-1 font-heading text-xl font-bold ${autoPayoutEnabled ? "text-emerald-600" : "text-text-3"}`}
          >
            {autoPayoutEnabled ? "On" : "Off"}
          </p>
          <p className="text-[11px] text-text-3">Change in Admin → Settings</p>
        </div>
      </div>

      {!autoPayoutEnabled && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Automatic payouts are switched off — every withdrawal below must be settled with "Mark
          as paid manually", even eligible NGN bank-transfer ones.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["pending", "success", "failed", "all"] as StatusFilter[]).map(
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
        <div className="relative ml-auto min-w-[200px] flex-1 sm:flex-none">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, reference…"
            className="w-full rounded-xl border border-canvas-border bg-white py-1.5 pl-9 pr-3 text-sm focus:border-royal focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-text-3">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
            <Inbox size={28} className="text-text-3" />
            <p className="text-sm text-text-3">No withdrawals match.</p>
          </div>
        ) : (
          filtered.map((w) => {
            const canAutoPay =
              autoPayoutEnabled &&
              w.currency === "NGN" &&
              w.payout_methods?.method === "bank_transfer";
            const StatusIcon = statusIcon[w.status];
            return (
              <div key={w.id} className="card-luxury p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-royal-soft">
                    {w.payout_methods?.method === "bank_transfer" ? (
                      <Landmark size={15} className="text-royal" />
                    ) : (
                      <Wallet size={15} className="text-royal" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-1">
                      {names[w.user_id] ?? "Unknown"}
                    </p>
                    <p className="truncate text-xs text-text-3">
                      {emails[w.user_id] ?? ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-text-1">
                      {w.currency === "NGN" ? "₦" : "$"}
                      {Number(w.amount).toLocaleString()}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusStyle[w.status]}`}
                    >
                      <StatusIcon size={11} />
                      {w.status}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 border-t border-canvas-border pt-3 text-xs text-text-3 sm:grid-cols-2">
                  <p>
                    Account: {w.payout_methods?.account_name ?? "—"} ·{" "}
                    {w.payout_methods?.account_number ?? "no account on file"}
                  </p>
                  <p>
                    Requested {format(new Date(w.requested_at), "yyyy-MM-dd HH:mm")}
                  </p>
                  {w.provider_reference && (
                    <p className="font-mono sm:col-span-2">
                      Ref: {w.provider_reference}
                    </p>
                  )}
                  {w.processed_at && (
                    <p className="sm:col-span-2">
                      Processed {format(new Date(w.processed_at), "yyyy-MM-dd HH:mm")}
                    </p>
                  )}
                </div>

                {w.status === "failed" &&
                  (w.provider_response?.reason ||
                    w.provider_response?.message) !== undefined && (
                    <p className="mt-2 text-xs font-semibold text-rose-600">
                      {String(
                        w.provider_response?.reason ??
                          w.provider_response?.message,
                      )}
                    </p>
                  )}

                {recheckResult[w.id] && (
                  <p className="mt-2 text-xs font-semibold text-royal">
                    {recheckResult[w.id]}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2 border-t border-canvas-border pt-3">
                  {w.status === "pending" && (
                    <>
                      {canAutoPay && (
                        <button
                          onClick={() => void approve(w.id)}
                          disabled={busyId === w.id}
                          className="btn-primary px-3 py-1.5 text-xs"
                        >
                          {busyId === w.id ? "Paying…" : "Pay via Paystack"}
                        </button>
                      )}
                      <button
                        onClick={() => void markPaidManually(w.id)}
                        disabled={busyId === w.id}
                        className="btn-secondary px-3 py-1.5 text-xs"
                      >
                        Mark as paid manually
                      </button>
                      <button
                        onClick={() => void reject(w.id)}
                        disabled={busyId === w.id}
                        className="btn-outline px-3 py-1.5 text-xs text-rose-600"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {w.provider_reference && w.provider_response?.manual !== true && (
                    <button
                      onClick={() => void recheck(w.id)}
                      disabled={busyId === w.id}
                      className="btn-outline flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      <RefreshCw
                        size={12}
                        className={busyId === w.id ? "animate-spin" : ""}
                      />
                      Recheck on Paystack
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </AdminLayout>
  );
}
