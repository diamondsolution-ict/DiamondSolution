import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";

const PAGE_SIZE = 20;

interface PaymentRow {
  id: string;
  provider: string;
  purpose: "department_access" | "suspension_reactivation";
  amount: number;
  currency: string;
  status: "pending" | "success" | "failed";
  created_at: string;
  departments: { name: string } | null;
}

const PURPOSE_LABEL: Record<PaymentRow["purpose"], string> = {
  department_access: "Department access",
  suspension_reactivation: "Account reactivation",
};

export default function PaymentHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);

  async function loadPage(pageIndex: number) {
    if (!user) return;
    setLoading(true);
    const from = pageIndex * PAGE_SIZE;
    const { data } = await supabase
      .from("payments")
      .select(
        "id, provider, purpose, amount, currency, status, created_at, departments ( name )",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    const rows = (data ?? []) as unknown as PaymentRow[];
    setPayments((prev) => (pageIndex === 0 ? rows : [...prev, ...rows]));
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }

  useEffect(() => {
    void loadPage(0);
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <Layout title="Payment History" onBack={() => navigate("/profile")}>
      {loading && payments.length === 0 ? (
        <p className="text-sm text-text-3">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="text-sm text-text-3">No payments yet.</p>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div
              key={p.id}
              className="card-luxury flex items-center justify-between p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-1">
                  {p.departments?.name ?? PURPOSE_LABEL[p.purpose]}
                </p>
                <p className="mt-0.5 text-xs text-text-3">
                  {format(new Date(p.created_at), "MMM d, yyyy · HH:mm")} ·{" "}
                  {p.provider}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-text-1">
                  {Number(p.amount).toLocaleString()} {p.currency}
                </p>
                <StatusBadge status={p.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && payments.length > 0 && (
        <button
          onClick={() => {
            const next = page + 1;
            setPage(next);
            void loadPage(next);
          }}
          disabled={loading}
          className="btn-outline mt-4 w-full"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </Layout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "success"
      ? "badge-royal"
      : status === "failed"
        ? "bg-rose-100 text-rose-700 rounded-full px-2.5 py-0.5 text-xs font-semibold"
        : "badge-gold";
  return <span className={classes}>{status}</span>;
}
