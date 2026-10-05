import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const PERIODS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

interface Overview {
  paid_enrollments: number;
  avg_enrollment_ngn: number;
  suspension_rate: number;
}
interface DashboardStats {
  total_students: number;
  revenue_ngn: number;
  revenue_usd: number;
}
interface RevenueMonth {
  month: number;
  amount: number;
}
interface Scholar {
  user_id: string;
  display_name: string;
  department_name: string | null;
  attempted: number;
  correct: number;
  study_seconds: number;
}

export default function AdminAnalytics() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueMonth[]>([]);
  const [scholars, setScholars] = useState<Scholar[]>([]);
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  async function load(days: number) {
    setLoading(true);
    const [{ data: ov }, { data: ds }, { data: rev }, { data: sch }] =
      await Promise.all([
        supabase.rpc("admin_analytics_overview"),
        supabase.rpc("admin_dashboard_stats"),
        supabase.rpc("admin_revenue_history_monthly"),
        supabase.rpc("admin_most_active_scholars", { p_days: days }),
      ]);
    setOverview((ov ?? [])[0] ?? null);
    setDashStats((ds ?? [])[0] ?? null);
    setRevenue(rev ?? []);
    setScholars(sch ?? []);
    setRefreshedAt(new Date());
    setLoading(false);
  }

  useEffect(() => {
    void load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const maxRevenue = Math.max(1, ...revenue.map((r) => r.amount));

  return (
    <AdminLayout>
      {loading || !overview || !dashStats ? (
        <p className="text-sm text-text-3">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Live Revenue (MTD)"
              value={`₦${dashStats.revenue_ngn.toLocaleString()}`}
              sub="All-time success"
              color="text-emerald-600"
            />
            <KpiCard
              label="Scholarly Access"
              value={dashStats.total_students.toLocaleString()}
              sub="Institutional connections"
              color="text-royal"
            />
            <KpiCard
              label="Avg Enrollment"
              value={`₦${Math.round(overview.avg_enrollment_ngn).toLocaleString()}`}
              sub="Mean tuition value"
              color="text-royal"
            />
            <KpiCard
              label="Suspension Rate"
              value={`${overview.suspension_rate}%`}
              sub="Violation deactivations"
              color="text-rose-600"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="card-luxury p-5">
              <h2 className="font-heading text-sm font-bold text-royal">
                Revenue History (Annual)
              </h2>
              <div
                className="mt-4 flex items-end gap-1.5"
                style={{ height: 100 }}
              >
                {revenue.map((r) => (
                  <div
                    key={r.month}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-t bg-royal"
                      style={{
                        height: `${Math.max(2, (r.amount / maxRevenue) * 84)}px`,
                      }}
                      title={`₦${r.amount.toLocaleString()}`}
                    />
                    <span className="text-[9px] text-text-3">
                      {MONTH_LABELS[r.month - 1]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-luxury p-5">
              <h2 className="font-heading text-sm font-bold text-text-1">
                Visit Frequency / Peak Hours
              </h2>
              <p className="mt-4 text-sm text-text-3">
                Not available yet — this needs the device/session tracking
                tables from Phase 5, which haven't been built.
              </p>
            </div>
          </div>

          <div className="card-luxury mt-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-sm font-bold text-text-1">
                  Engagement Analytics
                </h2>
                <p className="text-xs text-text-3">
                  Snapshot as of {refreshedAt.toLocaleTimeString()} — not
                  live.
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-canvas-border bg-white p-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.days}
                    onClick={() => setPeriod(p.days)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                      period === p.days
                        ? "bg-royal text-white"
                        : "text-text-3"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => void load(period)}
                  className="rounded-lg px-3 py-1 text-xs font-semibold text-royal"
                >
                  Refresh
                </button>
              </div>
            </div>

            <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-text-3">
              Most Active Scholars
            </h3>
            {scholars.length === 0 ? (
              <p className="mt-2 text-sm text-text-3">
                No practice activity in this period.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-canvas-border text-[10px] font-bold uppercase tracking-wide text-text-3">
                      <th className="py-2">Rank</th>
                      <th className="py-2">Scholar</th>
                      <th className="py-2">Department</th>
                      <th className="py-2">Attempted</th>
                      <th className="py-2">Accuracy</th>
                      <th className="py-2">Study Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-canvas-border">
                    {scholars.map((s, i) => (
                      <tr key={s.user_id}>
                        <td className="py-2 text-text-3">#{i + 1}</td>
                        <td className="py-2 font-semibold text-text-1">
                          {s.display_name}
                        </td>
                        <td className="py-2 text-text-3">
                          {s.department_name ?? "—"}
                        </td>
                        <td className="py-2 text-text-1">{s.attempted}</td>
                        <td className="py-2 text-text-1">
                          {s.attempted > 0
                            ? Math.round((s.correct / s.attempted) * 100)
                            : 0}
                          %
                        </td>
                        <td className="py-2 text-text-1">
                          {Math.floor(s.study_seconds / 3600)}h{" "}
                          {Math.round((s.study_seconds % 3600) / 60)}m
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="card-luxury p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-3">
        {label}
      </p>
      <p className={`font-heading text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-text-3">{sub}</p>
    </div>
  );
}
