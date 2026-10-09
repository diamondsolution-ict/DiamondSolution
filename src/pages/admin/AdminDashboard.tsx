import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  ShieldAlert,
  Banknote,
  HandCoins,
  Link2,
  Clock,
  Receipt,
  PieChart,
  Inbox,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";

interface Stats {
  total_students: number;
  suspended_students: number;
  revenue_ngn: number;
  revenue_usd: number;
  paid_out_ngn: number;
  paid_out_usd: number;
  active_affiliates: number;
  pending_payouts: number;
}
interface RecentPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  display_name: string | null;
  department_name: string | null;
}
interface RevenueRow {
  department_id: string;
  department_name: string;
  enrolled_count: number;
  total_amount: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentPayment[]>([]);
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: statRows }, { data: revenueRows }, { data: paymentRows }] =
        await Promise.all([
          supabase.rpc("admin_dashboard_stats"),
          supabase.rpc("admin_revenue_by_department"),
          supabase
            .from("payments")
            .select(
              "id, amount, currency, status, user_id, department_id, departments ( name )",
            )
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      setStats((statRows ?? [])[0] ?? null);
      setRevenue(revenueRows ?? []);

      const rows = (paymentRows ?? []) as unknown as {
        id: string;
        amount: number;
        currency: string;
        status: string;
        user_id: string;
        departments: { name: string } | null;
      }[];
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const { data: profileRows } =
        userIds.length > 0
          ? await supabase
              .from("profiles")
              .select("user_id, display_name")
              .in("user_id", userIds)
          : { data: [] as { user_id: string; display_name: string | null }[] };
      const names = Object.fromEntries(
        (profileRows ?? []).map((p) => [p.user_id, p.display_name]),
      );
      setRecent(
        rows.map((r) => ({
          id: r.id,
          amount: r.amount,
          currency: r.currency,
          status: r.status,
          display_name: names[r.user_id] ?? null,
          department_name: r.departments?.name ?? null,
        })),
      );
      setLoading(false);
    }
    void load();
  }, []);

  const maxRevenue = Math.max(1, ...revenue.map((r) => r.total_amount));

  return (
    <AdminLayout>
      {loading || !stats ? (
        <p className="text-sm text-text-3">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard
              icon={Users}
              color="royal"
              label="Total Students"
              value={stats.total_students.toLocaleString()}
              sub={`${stats.suspended_students} suspended`}
            />
            <StatCard
              icon={ShieldAlert}
              color="rose"
              label="Protocol Violation"
              value={stats.suspended_students.toLocaleString()}
              sub="Total suspended"
            />
            <StatCard
              icon={Banknote}
              color="emerald"
              label="Total Revenue"
              value={formatMixed(stats.revenue_ngn, stats.revenue_usd)}
              sub="All-time success"
            />
            <StatCard
              icon={HandCoins}
              color="gold"
              label="Total Paid Out"
              value={formatMixed(stats.paid_out_ngn, stats.paid_out_usd)}
              sub="Successful withdrawals"
            />
            <StatCard
              icon={Link2}
              color="royal"
              label="Active Affiliates"
              value={stats.active_affiliates.toLocaleString()}
              sub="Opted-in partners"
            />
            <StatCard
              icon={Clock}
              color="amber"
              label="Pending Payouts"
              value={stats.pending_payouts.toLocaleString()}
              sub="Awaiting approval"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-5">
            <div className="card-luxury p-5 lg:col-span-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-text-1">
                  <Receipt size={16} className="text-royal" />
                  Recent Payments
                </h2>
                <Link
                  to="/admin/payments"
                  className="text-xs font-semibold text-royal hover:underline"
                >
                  View Ledger →
                </Link>
              </div>
              {recent.length === 0 ? (
                <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
                  <Inbox size={24} className="text-text-3" />
                  <p className="text-sm text-text-3">No payments yet.</p>
                </div>
              ) : (
                <div className="mt-3 divide-y divide-canvas-border">
                  {recent.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 py-2.5 text-sm"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-royal-soft text-xs font-bold text-royal">
                        {(p.display_name ?? "A").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-text-1">
                          {p.display_name ?? "Academic Partner"}
                        </p>
                        <p className="truncate text-xs text-text-3">
                          {p.department_name ?? "—"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold text-text-1">
                          {p.amount.toLocaleString()} {p.currency}
                        </p>
                        <span
                          className={
                            p.status === "success"
                              ? "badge-royal"
                              : "bg-rose-100 text-rose-700 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          }
                        >
                          {p.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-luxury p-5 lg:col-span-2">
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-text-1">
                <PieChart size={16} className="text-royal" />
                Revenue Breakdown
              </h2>
              {revenue.length === 0 ? (
                <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
                  <TrendingUp size={24} className="text-text-3" />
                  <p className="text-sm text-text-3">No revenue yet.</p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {revenue.map((r) => (
                    <div key={r.department_id}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-text-1">
                          {r.department_name}
                        </span>
                        <span className="text-text-3">
                          {r.enrolled_count} enrolled
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas-soft">
                        <div
                          className="h-full rounded-full bg-royal"
                          style={{
                            width: `${(r.total_amount / maxRevenue) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="mt-0.5 text-right text-[11px] text-text-3">
                        ₦{(r.total_amount / 1_000_000).toFixed(2)}M
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function formatMixed(ngn: number, usd: number): string {
  const parts: string[] = [];
  if (ngn > 0) parts.push(`₦${compact(ngn)}`);
  if (usd > 0) parts.push(`$${compact(usd)}`);
  return parts.length > 0 ? parts.join(" + ") : "₦0";
}
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}

const COLOR_CLASSES: Record<string, { bg: string; text: string }> = {
  royal: { bg: "bg-royal-soft", text: "text-royal" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  gold: { bg: "bg-gold-pale", text: "text-gold-dark" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
};

function StatCard({
  icon: Icon,
  color,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  color: keyof typeof COLOR_CLASSES;
  label: string;
  value: string;
  sub: string;
}) {
  const c = COLOR_CLASSES[color];
  return (
    <div className="card-luxury relative overflow-hidden p-4">
      <div
        className={`absolute -right-4 -top-4 h-16 w-16 rounded-full ${c.bg} opacity-60`}
      />
      <div
        className={`relative inline-flex h-8 w-8 items-center justify-center rounded-xl ${c.bg} ${c.text}`}
      >
        <Icon size={16} />
      </div>
      <p className="relative mt-2 text-[10px] font-bold uppercase tracking-wide text-text-3">
        {label}
      </p>
      <p className="relative font-heading text-xl font-bold text-text-1">
        {value}
      </p>
      <p className="relative text-[11px] text-text-3">{sub}</p>
    </div>
  );
}
