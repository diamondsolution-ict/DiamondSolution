import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  CheckCircle2,
  Clock,
  Receipt,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { functionErrorMessage } from "@/lib/functionError";

interface PaymentRow {
  id: string;
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
  departments: { name: string } | null;
}

type StatusFilter = "all" | "success" | "pending" | "failed";

const PURPOSE_LABEL: Record<PaymentRow["purpose"], string> = {
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

export default function PaymentHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [recheckResult, setRecheckResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    // A student's own payment history realistically never exceeds a few dozen rows (one per
    // department purchased, the occasional reactivation) — a single fetch is plenty, no
    // keyset pagination needed the way the admin-wide ledger needs it.
    const { data } = await supabase
      .from("payments")
      .select(
        "id, provider, provider_reference, purpose, department_id, amount, currency, status, created_at, verified_at, raw_provider_response, departments ( name )",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);

    setPayments((data ?? []) as unknown as PaymentRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function recheckSelected() {
    if (!selected || rechecking) return;
    setRechecking(true);
    setRecheckResult(null);

    // Reuses the exact same verify-payment function the checkout flow calls right after
    // Paystack's widget closes — it's already idempotent (unique constraint on
    // payments(provider, provider_reference)) and already re-verifies fresh against Paystack,
    // so calling it again for an existing reference is a safe "did this actually go through"
    // recheck, not a special case. No separate student-facing Edge Function needed.
    const { data, error } = await supabase.functions.invoke("verify-payment", {
      body: {
        reference: selected.provider_reference,
        department_id: selected.department_id,
        purpose: selected.purpose,
      },
    });

    if (error || !data?.success) {
      setRecheckResult({
        ok: false,
        message: await functionErrorMessage(
          data,
          error,
          "Couldn't check this payment right now.",
        ),
      });
    } else {
      setRecheckResult({
        ok: true,
        message: data.alreadyProcessed
          ? "Paystack confirms this was successful — already recorded, nothing to change."
          : "Paystack confirms this was successful — recorded now and access granted.",
      });
      await load();
      const { data: fresh } = await supabase
        .from("payments")
        .select(
          "id, provider, provider_reference, purpose, department_id, amount, currency, status, created_at, verified_at, raw_provider_response, departments ( name )",
        )
        .eq("id", selected.id)
        .maybeSingle();
      if (fresh) setSelected(fresh as unknown as PaymentRow);
    }
    setRechecking(false);
  }

  function openDetail(p: PaymentRow) {
    setSelected(p);
    setRecheckResult(null);
  }

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      payments.filter((p) => {
        if (status !== "all" && p.status !== status) return false;
        if (!needle) return true;
        return (
          (p.departments?.name ?? "").toLowerCase().includes(needle) ||
          PURPOSE_LABEL[p.purpose].toLowerCase().includes(needle) ||
          p.provider_reference.toLowerCase().includes(needle)
        );
      }),
    [payments, status, needle],
  );

  const statusStyle: Record<string, string> = {
    success: "badge-royal",
    failed:
      "inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700",
    pending: "badge-gold",
  };
  const statusIcon: Record<string, typeof CheckCircle2> = {
    success: CheckCircle2,
    failed: XCircle,
    pending: Clock,
  };

  const selectedFields = selected ? paystackFields(selected.raw_provider_response) : null;

  return (
    <Layout title="Payment History" onBack={() => navigate("/profile")}>
      <div className="flex flex-wrap gap-2">
        {(["all", "success", "pending", "failed"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold capitalize ${
              status === s ? "bg-royal text-white" : "bg-canvas-soft text-text-2"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="relative mt-3">
        <Search
          size={14}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search department, type, or reference…"
          className="w-full rounded-xl border border-canvas-border bg-white py-2.5 pl-10 pr-3 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
        />
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-text-3">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card-luxury mt-4 flex flex-col items-center gap-2 p-10 text-center">
          <Receipt size={28} className="text-text-3" />
          <p className="text-sm text-text-3">
            {payments.length === 0 ? "No payments yet." : "No payments match."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => openDetail(p)}
              className="card-luxury flex w-full items-center gap-3 p-4 text-left"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-royal-soft">
                <Receipt size={15} className="text-royal" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-1">
                  {p.departments?.name ?? PURPOSE_LABEL[p.purpose]}
                </p>
                <p className="mt-0.5 text-xs text-text-3">
                  {format(new Date(p.created_at), "MMM d, yyyy · HH:mm")} · {p.provider}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-text-1">
                  {Number(p.amount).toLocaleString()} {p.currency}
                </p>
                <StatusBadge status={p.status} statusStyle={statusStyle} statusIcon={statusIcon} />
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-detail-heading"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 id="payment-detail-heading" className="font-heading text-lg font-bold text-text-1">
                Payment details
              </h2>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="rounded-full p-1 text-text-3 hover:bg-canvas-soft"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-0.5 font-mono text-xs text-text-3">
              {selected.provider_reference}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                  Amount
                </p>
                <p className="font-bold text-text-1">
                  {Number(selected.amount).toLocaleString()} {selected.currency}
                </p>
                <StatusBadge
                  status={selected.status}
                  statusStyle={statusStyle}
                  statusIcon={statusIcon}
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                  For
                </p>
                <p className="text-text-1">
                  {selected.departments?.name ?? PURPOSE_LABEL[selected.purpose]}
                </p>
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
              {selected.verified_at && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                    Verified
                  </p>
                  <p className="text-text-1">
                    {format(new Date(selected.verified_at), "yyyy-MM-dd HH:mm:ss")}
                  </p>
                </div>
              )}
            </div>

            {selectedFields && (
              <div className="mt-4 rounded-xl border border-canvas-border bg-canvas-soft p-3 text-xs text-text-2">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-3">
                  Gateway detail
                </p>
                <div className="grid grid-cols-2 gap-y-1">
                  {selectedFields.channel && <p>Channel: {selectedFields.channel}</p>}
                  {selectedFields.bank && <p>Bank: {selectedFields.bank}</p>}
                  {selectedFields.cardType && (
                    <p>
                      Card: {selectedFields.cardType} …{selectedFields.last4}
                    </p>
                  )}
                  {selectedFields.paidAt && <p>Paid at: {selectedFields.paidAt}</p>}
                  {selectedFields.gatewayResponse && (
                    <p className="col-span-2">
                      Gateway response: {selectedFields.gatewayResponse}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-royal/20 bg-royal-soft/40 p-3">
              <p className="text-xs font-semibold text-royal">Check live on Paystack</p>
              <p className="mt-0.5 text-xs text-text-3">
                Paid but it's not reflecting? Recheck this reference directly against Paystack —
                a confirmed success is recorded and access granted immediately if it wasn't
                already.
              </p>
              <button
                onClick={() => void recheckSelected()}
                disabled={rechecking}
                className="btn-outline mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                <RefreshCw size={12} className={rechecking ? "animate-spin" : ""} />
                {rechecking ? "Checking…" : "Recheck payment"}
              </button>
              {recheckResult && (
                <p
                  className={`mt-2 text-xs font-medium ${recheckResult.ok ? "text-emerald-700" : "text-rose-600"}`}
                >
                  {recheckResult.message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function StatusBadge({
  status,
  statusStyle,
  statusIcon,
}: {
  status: string;
  statusStyle: Record<string, string>;
  statusIcon: Record<string, typeof CheckCircle2>;
}) {
  const Icon = statusIcon[status] ?? Clock;
  return (
    <span className={statusStyle[status] ?? "badge-gold"}>
      <Icon size={11} />
      {status}
    </span>
  );
}
