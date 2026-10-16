import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePaystackPayment } from "react-paystack";
import { BookOpen, ChevronRight, FolderOpen, Lock, Sparkles } from "lucide-react";
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

export default function CourseList() {
  const { user, profile, isAdmin } = useAuth();
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

  useEffect(() => {
    async function loadCourses() {
      if (!departmentId) {
        setCourses([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const [{ data: courseRows }, { data: levelRows }] = await Promise.all([
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
      ]);
      setCourses(courseRows ?? []);
      setLevels(levelRows ?? []);
      // No "All levels" option anymore — a department's courses are always viewed one level
      // at a time, so default to the first one instead of an unfiltered mixed list.
      setSelectedLevelId(levelRows?.[0]?.id ?? "");
      setLoading(false);
    }
    void loadCourses();
  }, [departmentId]);

  const activeDept = departments.find((d) => d.id === departmentId);
  // Admins read everything for free, matching has_department_access()'s own is_admin() OR —
  // the backend already allowed this; the paywall UI just didn't know to skip itself for them.
  const hasAccess = departmentId
    ? isAdmin || grantedDepartmentIds.has(departmentId)
    : false;
  const price = prices.find(
    (p) => p.department_id === departmentId && p.currency === "NGN",
  );

  const paystackConfig = {
    reference: `dept_${departmentId}_${user?.id}_${Date.now()}`,
    email: user?.email ?? "",
    amount: Math.round((price?.amount ?? 0) * 100),
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? "",
    currency: "NGN",
    metadata: {
      user_id: user?.id,
      department_id: departmentId,
      custom_fields: [],
    },
  };
  const initializePayment = usePaystackPayment(paystackConfig);

  async function handlePay() {
    if (!paystackConfig.publicKey) {
      alert(
        "Payments aren't configured yet (missing VITE_PAYSTACK_PUBLIC_KEY).",
      );
      return;
    }
    initializePayment({
      onSuccess: async (transaction: { reference: string }) => {
        setPaying(true);
        const { data, error } = await supabase.functions.invoke(
          "verify-payment",
          {
            body: {
              reference: transaction.reference,
              department_id: departmentId,
            },
          },
        );
        setPaying(false);
        if (error || !data?.success) {
          alert(
            `Payment verification failed: ${await functionErrorMessage(data, error, "unknown error")}`,
          );
          return;
        }
        // Mirrors processDepartmentAccessPayment's own expires_at computation so the badge
        // that appears right after paying matches what the server actually just granted.
        const newExpiresAt = price?.access_duration_days
          ? new Date(
              Date.now() + price.access_duration_days * 86_400_000,
            ).toISOString()
          : null;
        setGrantedDepartmentIds((prev) =>
          new Map(prev).set(departmentId, newExpiresAt),
        );
      },
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
            Restricted
          </h2>
          <p className="mt-2 text-sm text-text-3">
            {describePaywall(
              price?.access_duration_days ?? null,
              activeDept?.name ?? "this department",
            )}
          </p>
          <button
            onClick={() => void handlePay()}
            disabled={paying}
            className="btn-primary mt-6 w-full"
          >
            {paying
              ? "Confirming…"
              : `Authorize payment — ₦${price?.amount.toLocaleString() ?? "—"}${describePriceTerm(price?.access_duration_days ?? null)}`}
          </button>
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
                isAdmin,
              )}
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
