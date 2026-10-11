import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  FolderPlus,
  GraduationCap,
  Layers,
  LayoutGrid,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";

const DEPT_STATUSES = ["active", "archived"] as const;

interface Department {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface PriceRow {
  department_id: string;
  currency: string;
  amount: number;
  effective_from: string;
}

interface LevelRow {
  id: string;
  department_id: string;
  label: string;
  sort_order: number;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminDepartments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [priceNgn, setPriceNgn] = useState("10000");
  const [levelInput, setLevelInput] = useState("100L, 200L, 300L, 400L");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] =
    useState<(typeof DEPT_STATUSES)[number]>("active");
  const [newLevelLabel, setNewLevelLabel] = useState("");
  const [addingLevelFor, setAddingLevelFor] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: depts }, { data: priceRows }, { data: levelRows }] =
      await Promise.all([
        supabase
          .from("departments")
          .select("id, name, slug, status")
          .order("name"),
        supabase
          .from("department_pricing")
          .select("department_id, currency, amount, effective_from")
          .lte("effective_from", new Date().toISOString())
          .order("effective_from", { ascending: false }),
        supabase
          .from("department_levels")
          .select("id, department_id, label, sort_order")
          .order("sort_order"),
      ]);
    setDepartments(depts ?? []);
    setPrices(priceRows ?? []);
    setLevels(levelRows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setPriceNgn("10000");
    setLevelInput("100L, 200L, 300L, 400L");
    setEditStatus("active");
  }

  function startEdit(d: Department) {
    setEditingId(d.id);
    setName(d.name);
    setPriceNgn(String(priceAmountFor(d.id)));
    setEditStatus(d.status as (typeof DEPT_STATUSES)[number]);
  }

  async function handleSubmitForm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    if (editingId) {
      const { error: updateError } = await supabase
        .from("departments")
        .update({ name, slug: slugify(name), status: editStatus })
        .eq("id", editingId);
      if (updateError) {
        setSaving(false);
        setError(updateError.message);
        return;
      }
      // A new row, not an update-in-place: department_pricing is a price-history table
      // (unique on department_id/currency/effective_from, see its migration) — every price
      // that was ever actually charged stays on record, and processDepartmentAccessPayment
      // already resolves "the current price" as the latest effective_from <= now(), so a
      // plain insert here becomes the new current price without touching history.
      const amount = Number(priceNgn);
      if (amount !== priceAmountFor(editingId)) {
        await supabase
          .from("department_pricing")
          .insert({ department_id: editingId, currency: "NGN", amount });
      }
      resetForm();
      setSaving(false);
      await load();
      return;
    }

    const slug = slugify(name);
    const { data: dept, error: deptError } = await supabase
      .from("departments")
      .insert({ name, slug })
      .select("id")
      .single();

    if (deptError || !dept) {
      setSaving(false);
      setError(deptError?.message ?? "Failed to create department.");
      return;
    }

    const amount = Number(priceNgn);
    if (amount > 0) {
      await supabase
        .from("department_pricing")
        .insert({ department_id: dept.id, currency: "NGN", amount });
    }

    const levelLabels = levelInput
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    if (levelLabels.length > 0) {
      await supabase.from("department_levels").insert(
        levelLabels.map((label, i) => ({
          department_id: dept.id,
          label,
          sort_order: i,
        })),
      );
    }

    resetForm();
    setSaving(false);
    await load();
  }

  async function addLevel(deptId: string) {
    const label = newLevelLabel.trim();
    if (!label) return;
    const nextOrder =
      Math.max(
        -1,
        ...levels
          .filter((l) => l.department_id === deptId)
          .map((l) => l.sort_order ?? 0),
      ) + 1;
    await supabase
      .from("department_levels")
      .insert({ department_id: deptId, label, sort_order: nextOrder });
    setNewLevelLabel("");
    setAddingLevelFor(null);
    await load();
  }

  function priceAmountFor(deptId: string): number {
    return (
      prices.find((p) => p.department_id === deptId && p.currency === "NGN")
        ?.amount ?? 0
    );
  }

  function priceFor(deptId: string) {
    const amount = priceAmountFor(deptId);
    return amount > 0 ? `₦${amount.toLocaleString()}` : "No price set";
  }

  function levelsFor(deptId: string) {
    return levels.filter((l) => l.department_id === deptId).map((l) => l.label);
  }

  return (
    <AdminLayout>
      <h1 className="font-heading text-2xl font-bold text-text-1">
        Departments
      </h1>
      <p className="mt-1 text-sm text-text-3">
        Create a department, set its price, and define its levels. Courses are
        added per department on the Courses tab.
      </p>

      <form
        onSubmit={handleSubmitForm}
        className="card-luxury mt-6 space-y-4 p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-text-1">
            {editingId ? (
              <Pencil size={17} className="text-royal" />
            ) : (
              <FolderPlus size={17} className="text-royal" />
            )}
            {editingId ? "Edit department" : "Add department"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-1 text-xs font-semibold text-text-3 hover:text-text-1"
            >
              <X size={13} />
              Cancel edit
            </button>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-text-2">
              Name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Nursing"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-2">
              Price (₦)
            </label>
            <input
              type="number"
              min={0}
              value={priceNgn}
              onChange={(e) => setPriceNgn(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {editingId ? (
          <div>
            <label className="block text-sm font-medium text-text-2">
              Status
            </label>
            <select
              value={editStatus}
              onChange={(e) =>
                setEditStatus(e.target.value as (typeof DEPT_STATUSES)[number])
              }
              className={`${inputClass} max-w-xs capitalize`}
            >
              {DEPT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-3">
              Levels are managed per-department below — editing here never
              touches existing levels (courses may already use them).
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-text-2">
              Levels (comma-separated)
            </label>
            <input
              value={levelInput}
              onChange={(e) => setLevelInput(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {editingId ? <Pencil size={15} /> : <FolderPlus size={15} />}
          {saving
            ? editingId
              ? "Saving…"
              : "Creating…"
            : editingId
              ? "Save changes"
              : "Create department"}
        </button>
      </form>

      <div className="mt-8">
        {loading ? (
          <p className="text-sm text-text-3">Loading…</p>
        ) : departments.length === 0 ? (
          <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
            <LayoutGrid size={28} className="text-text-3" />
            <p className="text-sm text-text-3">
              No departments yet — add one above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {departments.map((d) => (
              <div
                key={d.id}
                className={`card-luxury p-4 ${editingId === d.id ? "ring-2 ring-royal" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="diamond-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                    <GraduationCap size={17} className="text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-heading font-bold text-text-1">
                      {d.name}
                      {d.status === "archived" && (
                        <span className="ml-2 text-xs font-normal text-text-3">
                          (archived)
                        </span>
                      )}
                    </p>
                    <p className="flex items-center gap-1 text-sm text-text-3">
                      <Layers size={12} />
                      {priceFor(d.id)} ·{" "}
                      {levelsFor(d.id).join(", ") || "no levels"}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(d)}
                    className="flex shrink-0 items-center gap-1 text-sm font-semibold text-royal hover:underline"
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                  <Link
                    to={`/admin/courses?department=${d.id}`}
                    className="flex shrink-0 items-center gap-1 text-sm font-semibold text-royal hover:underline"
                  >
                    Manage courses <ArrowRight size={13} />
                  </Link>
                </div>

                {addingLevelFor === d.id ? (
                  <div className="mt-3 flex items-center gap-2 border-t border-canvas-border pt-3">
                    <input
                      autoFocus
                      value={newLevelLabel}
                      onChange={(e) => setNewLevelLabel(e.target.value)}
                      placeholder="e.g. 600L"
                      className={`${inputClass} mt-0 max-w-[160px]`}
                    />
                    <button
                      onClick={() => void addLevel(d.id)}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setAddingLevelFor(null);
                        setNewLevelLabel("");
                      }}
                      className="text-xs font-semibold text-text-3 hover:text-text-1"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingLevelFor(d.id)}
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-royal hover:underline"
                  >
                    <Plus size={12} />
                    Add a level
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

const inputClass =
  "mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15";
