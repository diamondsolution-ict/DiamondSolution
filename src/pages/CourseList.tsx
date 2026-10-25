import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePaystackPayment } from "react-paystack";
import {
  BookOpen,
  ChevronRight,
  Clock,
  FolderOpen,
  Lock,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { LoadingScreen } from "@/components/LoadingScreen";
import { functionErrorMessage } from "@/lib/functionError";
import {
  describeAccessStatus,
  describePaywall,
  describePriceTerm,
} from "@/lib/accessDuration";

interface Department {
  id: string;
  name: string;
  slug: string;
  image_path: string | null;
}
interface PriceRow {
  department_id: string;
  amount: number;
  currency: string;
  access_duration_days: number | null;
}
interface Course {
  id: string;
  title: string;
  level_id: string;
}
interface Level {
  id: string;
  label: string;
  sort_order: number;
}
// The student's own most-recent instalment plan for the active department, if one exists —
// installments_paid === 3 means it's fully paid off (no different from a full payment from
// here on); anything less means there's a next instalment still outstanding, whether or not
// access is currently locked (that's just whether next_due_at has already passed).
interface PlanRow {
  installments_paid: number;
  total_amount: number;
  installment_amount: number;
  next_due_at: string | null;
}

export default function CourseList() {
  const { user, profile, isAdmin, isModerator } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const departmentId = searchParams.get("department") ?? "";

  const [departments, setDepartments] = useState<Department[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  // department_id -> expires_at (null = lifetime) for this student's own grants, so the
  // "access active" badge reflects what THEY actually bought, not today's pricing policy.
  const [grantedDepartmentIds, setGrantedDepartmentIds] = useState<
    Map<string, string | null>
  >(new Map());
  const [courses, setCourses] = useState<Course[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState("");
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    async function loadOverview() {
      const [{ data: depts }, { data: priceRows }, { data: grants }] =
        await Promise.all([
          supabase
            .from("departments")
            .select("id, name, slug, image_path")
            .eq("status", "active")
            .order("name"),
          // department_pricing is a price *history* table — every change inserts a new row
          // rather than updating in place (see AdminDepartments.tsx's upsertPrice), so an
          // unfiltered, unordered select can return any past price. "Current price" is the
          // newest row whose effective_from isn't in the future — same rule processPayment.ts
          // uses server-side when actually charging. Without the filter/order here, .find()
          // below returned whatever row Postgres happened to return first (in practice the
          // oldest), so the paywall kept showing a price after an admin changed it.
          supabase
            .from("department_pricing")
            .select("department_id, amount, currency, access_duration_days")
            .lte("effective_from", new Date().toISOString())
            .order("effective_from", { ascending: false }),
          user
            ? supabase
                .from("access_grants")
                .select("department_id, expires_at")
                .eq("user_id", user.id)
            : Promise.resolve({
                data: [] as { department_id: string; expires_at: string | null }[],
              }),
        ]);
      setDepartments(depts ?? []);
      setPrices(priceRows ?? []);
      setGrantedDepartmentIds(
        new Map((grants ?? []).map((g) => [g.department_id, g.expires_at])),
      );
    }
    void loadOverview();
  }, [user]);

  async function loadCourses() {
    if (!departmentId) {
      setCourses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: courseRows }, { data: levelRows }, { data: planRows }] =
      await Promise.all([
        supabase
          .from("courses")
          .select("id, title, level_id")
          .eq("department_id", departmentId)
          .eq("status", "published")
          .is("deleted_at", null)
          .order("title"),
        supabase
          .from("department_levels")
          .select("id, label, sort_order")
          .eq("department_id", departmentId)
          .order("sort_order"),
        // Most recent instalment plan for this department, if any — installments_paid < 3
        // means there's a next instalment outstanding, whether or not access is currently
        // locked (see PlanRow's own comment).
        user
          ? supabase
              .from("department_payment_plans")
              .select("installments_paid, total_amount, installment_amount, next_due_at")
              .eq("user_id", user.id)
              .eq("department_id", departmentId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
    setCourses(courseRows ?? []);
    setLevels(levelRows ?? []);
    setPlan(planRows && planRows.installments_paid < 3 ? planRows : null);
    // No "All levels" option anymore — a department's courses are always viewed one level
    // at a time, so default to the first one instead of an unfiltered mixed list.
    setSelectedLevelId(levelRows?.[0]?.id ?? "");
    setLoading(false);
  }

  useEffect(() => {
    void loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, user]);

  const activeDept = departments.find((d) => d.id === departmentId);
  // Staff read everything for free, matching has_department_access()'s own
  // is_moderator_or_admin() OR — the backend already allowed this; the paywall UI just didn't
  // know to skip itself for them.
  const hasAccess = departmentId
    ? isAdmin || isModerator || grantedDepartmentIds.has(departmentId)
    : false;
  const price = prices.find(
    (p) => p.department_id === departmentId && p.currency === "NGN",
  );

  // Instalments 1 and 2 are the floor of price/3; instalment 3 absorbs whatever's left — same
  // split processPayment.ts computes server-side, so the amount shown here is exactly the
  // amount the server will actually accept. Purely a display/charge-amount computation: the
  // server infers "full payment" vs "instalment" from the verified amount itself, never from
  // anything this page sends it.
  // Supabase returns numeric columns as strings over the wire — Number(...) here guards every
  // downstream .toLocaleString() call (String.prototype.toLocaleString() is a no-op, not an
  // error, so a missed conversion would silently show "5000.00" instead of "5,000").
  const firstInstallmentAmount = price ? Math.floor(Number(price.amount) / 3) : 0;
  const nextInstallmentAmount = plan
    ? plan.installments_paid === 2
      ? Number(plan.total_amount) - 2 * Number(plan.installment_amount)
      : Number(plan.installment_amount)
    : firstInstallmentAmount;
  const instalmentsPaid = plan?.installments_paid ?? 0;

  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? "";
  const fullPaystackConfig = {
    reference: `dept_full_${departmentId}_${user?.id}_${Date.now()}`,
    email: user?.email ?? "",
    amount: Math.round((price?.amount ?? 0) * 100),
    publicKey,
    currency: "NGN",
    metadata: { user_id: user?.id, department_id: departmentId, custom_fields: [] },
  };
  const instalmentPaystackConfig = {
    reference: `dept_inst_${departmentId}_${user?.id}_${Date.now()}`,
    email: user?.email ?? "",
    amount: Math.round(nextInstallmentAmount * 100),
    publicKey,
    currency: "NGN",
    metadata: { user_id: user?.id, department_id: departmentId, custom_fields: [] },
  };
  const initializeFullPayment = usePaystackPayment(fullPaystackConfig);
  const initializeInstalmentPayment = usePaystackPayment(instalmentPaystackConfig);

  async function finishPayment(reference: string) {
    setPaying(true);
    const { data, error } = await supabase.functions.invoke("verify-payment", {
      body: { reference, department_id: departmentId },
    });
    setPaying(false);
    if (error || !data?.success) {
      alert(
        `Payment verification failed: ${await functionErrorMessage(data, error, "unknown error")}`,
      );
      return;
    }
    // Reload rather than hand-computing the new state — once instalments, 30-day grace
    // windows and a possible plan-completion extension are all in play, the server's own
    // computation is the only source of truth worth trusting for what just happened.
    await loadCourses();
    const { data: grants } = await supabase
      .from("access_grants")
      .select("department_id, expires_at")
      .eq("user_id", user!.id);
    setGrantedDepartmentIds(
      new Map((grants ?? []).map((g) => [g.department_id, g.expires_at])),
    );
  }

  function handlePayFull() {
    if (!publicKey) {
      alert("Payments aren't configured yet (missing VITE_PAYSTACK_PUBLIC_KEY).");
      return;
    }
    initializeFullPayment({
      onSuccess: (transaction: { reference: string }) =>
        void finishPayment(transaction.reference),
      onClose: () => {},
    });
  }

  function handlePayInstalment() {
    if (!publicKey) {
      alert("Payments aren't configured yet (missing VITE_PAYSTACK_PUBLIC_KEY).");
      return;
    }
    initializeInstalmentPayment({
      onSuccess: (transaction: { reference: string }) =>
        void finishPayment(transaction.reference),
      onClose: () => {},
    });
  }

  function levelLabel(id: string) {
    return levels.find((l) => l.id === id)?.label ?? "";
  }

  const visibleCourses = selectedLevelId
    ? courses.filter((c) => c.level_id === selectedLevelId)
    : courses;

  if (!departmentId) {
    return (
      <Layout title="Departments" wide>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => {
            const granted = grantedDepartmentIds.has(d.id);
            const imageUrl = d.image_path
              ? supabase.storage.from("media").getPublicUrl(d.image_path).data
                  .publicUrl
              : null;
            return (
              <button
                key={d.id}
                onClick={() => setSearchParams({ department: d.id })}
                className="card-luxury flex w-full items-center gap-3 p-4 text-left"
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-royal-soft font-heading text-sm font-bold text-royal">
                    {d.name.charAt(0)}
                  </div>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-heading font-bold text-text-1">
                    {d.name}
                  </span>
                  {granted && (
                    <span className="badge-royal mt-1 inline-flex">Authorized</span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-royal-soft text-royal"
                >
                  <ChevronRight size={18} />
                </span>
              </button>
            );
          })}
          {departments.length === 0 && (
            <div className="card-luxury col-span-full flex flex-col items-center gap-2 p-10 text-center">
              <FolderOpen size={28} className="text-text-3" />
              <p className="text-sm text-text-3">
                No departments available yet.
              </p>
            </div>
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title={activeDept?.name ?? "Department"}
      onBack={() => setSearchParams({})}
    >
      {!hasAccess ? (
        <div className="card-luxury p-8 text-center">
          <div className="diamond-gradient mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
            <Lock size={22} className="text-gold" />
          </div>
          <h2 className="mt-4 font-heading text-lg font-bold text-text-1">
            {plan ? "Access locked" : "Restricted"}
          </h2>
          {plan ? (
            <>
              <p className="mt-2 text-sm text-text-3">
                Instalment {instalmentsPaid} of 3 is paid, but instalment{" "}
                {instalmentsPaid + 1} of 3 wasn't paid in time, so access to{" "}
                {activeDept?.name ?? "this department"} is locked. Pay it now to
                restore access immediately — no penalty, no waiting.
              </p>
              <button
                onClick={handlePayInstalment}
                disabled={paying}
                className="btn-primary mt-6 w-full"
              >
                {paying
                  ? "Confirming…"
                  : `Pay instalment ${instalmentsPaid + 1} of 3 — ₦${nextInstallmentAmount.toLocaleString()}`}
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-text-3">
                {describePaywall(
                  price?.access_duration_days ?? null,
                  activeDept?.name ?? "this department",
                )}
              </p>
              <button
                onClick={handlePayFull}
                disabled={paying}
                className="btn-primary mt-6 w-full"
              >
                {paying
                  ? "Confirming…"
                  : `Pay in full — ₦${price?.amount.toLocaleString() ?? "—"}${describePriceTerm(price?.access_duration_days ?? null)}`}
              </button>
              <button
                onClick={handlePayInstalment}
                disabled={paying}
                className="btn-outline mt-2.5 w-full"
              >
                {paying
                  ? "Confirming…"
                  : `Or pay in 3 instalments — ₦${firstInstallmentAmount.toLocaleString()} now`}
              </button>
              <p className="mt-2 text-xs text-text-3">
                1st instalment unlocks every course immediately. 2nd due in 30
                days, 3rd due 30 days after that.
              </p>
            </>
          )}
          {profile?.currency === "USD" && (
            <p className="mt-2 text-xs text-text-3">
              Charged in NGN via Paystack.
            </p>
          )}
        </div>
      ) : loading ? (
        <LoadingScreen />
      ) : courses.length === 0 ? (
        <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
          <BookOpen size={28} className="text-text-3" />
          <p className="text-sm text-text-3">
            No courses in this department yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {hasAccess && (
            <div className="badge-gold inline-flex items-center gap-1.5">
              <Sparkles size={12} />
              {describeAccessStatus(
                grantedDepartmentIds.get(departmentId) ?? null,
                isAdmin || isModerator,
              )}
            </div>
          )}

          {plan && (
            <div className="card-luxury flex items-center gap-3 border-gold-border bg-gold-pale p-3.5">
              <Clock size={16} className="shrink-0 text-gold-dark" />
              <p className="flex-1 text-xs font-semibold text-text-2">
                Instalment {instalmentsPaid} of 3 paid — instalment{" "}
                {instalmentsPaid + 1} of 3 (₦{nextInstallmentAmount.toLocaleString()}) due by{" "}
                {plan.next_due_at
                  ? new Date(plan.next_due_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
                .
              </p>
              <button
                onClick={handlePayInstalment}
                disabled={paying}
                className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
              >
                {paying ? "…" : "Pay now"}
              </button>
            </div>
          )}

          {levels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {levels.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLevelId(l.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                    selectedLevelId === l.id
                      ? "bg-royal text-white"
                      : "bg-canvas-soft text-text-2 hover:bg-royal-soft"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}

          {visibleCourses.length === 0 ? (
            <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
              <BookOpen size={28} className="text-text-3" />
              <p className="text-sm text-text-3">
                No courses at this level yet.
              </p>
            </div>
          ) : (
            visibleCourses.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/courses/${c.id}`)}
                className="card-luxury flex w-full items-center gap-3 p-4 text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal-soft">
                  <BookOpen size={18} className="text-royal" />
                </div>
                <span className="flex-1 font-heading font-bold text-text-1">
                  {c.title}
                </span>
                <span className="badge-royal">{levelLabel(c.level_id)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </Layout>
  );
}
