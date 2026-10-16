import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  FolderPlus,
  GraduationCap,
  Layers,
  LayoutGrid,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";
import { ImageUpload } from "@/components/ImageUpload";

const DEPT_STATUSES = ["active", "archived"] as const;

interface Department {
  id: string;
  name: string;
  slug: string;
  status: string;
  image_path: string | null;
}

interface PriceRow {
  department_id: string;
  currency: string;
  amount: number;
  access_duration_days: number | null;
  effective_from: string;
}

interface LevelRow {
  id: string;
  department_id: string;
  label: string;
  sort_order: number;
}

function durationLabel(days: number | null): string {
  if (days === null) return "No expiry";
  if (days === 365) return "1 year";
  return `${days} days`;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function publicImageUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

export default function AdminDepartments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [modal, setModal] = useState<"create" | "edit" | "levels" | null>(
    null,
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!modal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setModal(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modal]);

  const [name, setName] = useState("");
  const [priceNgn, setPriceNgn] = useState("10000");
  const [priceUsd, setPriceUsd] = useState("");
  // Default policy: 1 year — blank means no expiry (access_duration_days null), which students never see as "lifetime".
  const [accessDurationDays, setAccessDurationDays] = useState("365");
  const [levelInput, setLevelInput] = useState("100L, 200L, 300L, 400L");
  const [editStatus, setEditStatus] =
    useState<(typeof DEPT_STATUSES)[number]>("active");
  const [editImagePath, setEditImagePath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [newLevelLabel, setNewLevelLabel] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [editLevelLabel, setEditLevelLabel] = useState("");
  const [levelError, setLevelError] = useState<string | null>(null);
  const [levelBusyId, setLevelBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: depts }, { data: priceRows }, { data: levelRows }] =
      await Promise.all([
        supabase
          .from("departments")
          .select("id, name, slug, status, image_path")
          .order("name"),
        supabase
          .from("department_pricing")
          .select(
            "department_id, currency, amount, access_duration_days, effective_from",
          )
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

  function priceAmountFor(deptId: string, currency: "NGN" | "USD"): number {
    return (
      prices.find((p) => p.department_id === deptId && p.currency === currency)
        ?.amount ?? 0
    );
  }

  // One duration policy per department, not per currency — NGN's current row stands in for
  // "the" department duration, since both currencies are always set together from this form.
  function priceDurationFor(deptId: string): number | null {
    return (
      prices.find((p) => p.department_id === deptId && p.currency === "NGN")
        ?.access_duration_days ?? null
    );
  }

  function levelsFor(deptId: string) {
    return levels
      .filter((l) => l.department_id === deptId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  function activeDept() {
    return departments.find((d) => d.id === activeId) ?? null;
  }

  function openCreate() {
    setName("");
    setPriceNgn("10000");
    setPriceUsd("");
    setAccessDurationDays("365");
    setLevelInput("100L, 200L, 300L, 400L");
    setFormError(null);
    setModal("create");
  }

  function openEdit(d: Department) {
    setActiveId(d.id);
    setName(d.name);
    setPriceNgn(String(priceAmountFor(d.id, "NGN") || ""));
    setPriceUsd(String(priceAmountFor(d.id, "USD") || ""));
    const duration = priceDurationFor(d.id);
    setAccessDurationDays(duration === null ? "" : String(duration));
    setEditStatus(d.status as (typeof DEPT_STATUSES)[number]);
    setEditImagePath(d.image_path);
    setFormError(null);
    setModal("edit");
  }

  function openLevels(d: Department) {
    setActiveId(d.id);
    setNewLevelLabel("");
    setEditingLevelId(null);
    setLevelError(null);
    setModal("levels");
  }

  function closeModal() {
    setModal(null);
    setActiveId(null);
  }

  async function upsertPrice(
    departmentId: string,
    currency: "NGN" | "USD",
    raw: string,
    durationRaw: string,
  ) {
    const amount = raw.trim() === "" ? 0 : Number(raw);
    if (!Number.isFinite(amount)) return;
    const accessDurationDays =
      durationRaw.trim() === "" ? null : Number(durationRaw);
    if (
      amount === priceAmountFor(departmentId, currency) &&
      accessDurationDays === priceDurationFor(departmentId)
    ) {
      return;
    }
    await supabase.from("department_pricing").insert({
      department_id: departmentId,
      currency,
      amount,
      access_duration_days: accessDurationDays,
    });
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    const slug = slugify(name);
    const { data: dept, error: deptError } = await supabase
      .from("departments")
      .insert({ name, slug })
      .select("id")
      .single();

    if (deptError || !dept) {
      setSaving(false);
      setFormError(deptError?.message ?? "Failed to create department.");
      return;
    }

    const accessDuration =
      accessDurationDays.trim() === "" ? null : Number(accessDurationDays);

    const ngn = Number(priceNgn);
    if (ngn > 0) {
      await supabase.from("department_pricing").insert({
        department_id: dept.id,
        currency: "NGN",
        amount: ngn,
        access_duration_days: accessDuration,
      });
    }
    const usd = Number(priceUsd);
    if (usd > 0) {
      await supabase.from("department_pricing").insert({
        department_id: dept.id,
        currency: "USD",
        amount: usd,
        access_duration_days: accessDuration,
      });
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

    setSaving(false);
    closeModal();
    await load();
  }

  async function handleEditSave(e: FormEvent) {
    e.preventDefault();
    if (!activeId) return;
    setFormError(null);
    setSaving(true);

    const { error: updateError } = await supabase
      .from("departments")
      .update({ name, slug: slugify(name), status: editStatus })
      .eq("id", activeId);
    if (updateError) {
      setSaving(false);
      setFormError(updateError.message);
      return;
    }

    // department_pricing is a price-history table (unique on department_id/currency/
    // effective_from) — a changed amount becomes a new row, not an in-place update, so every
    // price that was ever actually charged stays on record.
    await Promise.all([
      upsertPrice(activeId, "NGN", priceNgn, accessDurationDays),
      upsertPrice(activeId, "USD", priceUsd, accessDurationDays),
    ]);

    setSaving(false);
    closeModal();
    await load();
  }

  async function addLevel() {
    if (!activeId) return;
    const label = newLevelLabel.trim();
    if (!label) return;
    setLevelError(null);
    const nextOrder =
      Math.max(
        -1,
        ...levels
          .filter((l) => l.department_id === activeId)
          .map((l) => l.sort_order ?? 0),
      ) + 1;
    const { error } = await supabase
      .from("department_levels")
      .insert({ department_id: activeId, label, sort_order: nextOrder });
    if (error) {
      setLevelError(error.message);
      return;
    }
    setNewLevelLabel("");
    await load();
  }

  function startEditLevel(l: LevelRow) {
    setLevelError(null);
    setEditingLevelId(l.id);
    setEditLevelLabel(l.label);
  }

  async function saveLevelLabel() {
    if (!editingLevelId) return;
    const label = editLevelLabel.trim();
    if (!label) return;
    setLevelBusyId(editingLevelId);
    setLevelError(null);
    const { error } = await supabase
      .from("department_levels")
      .update({ label })
      .eq("id", editingLevelId);
    setLevelBusyId(null);
    if (error) {
      setLevelError(error.message);
      return;
    }
    setEditingLevelId(null);
    await load();
  }

  async function deleteLevel(l: LevelRow) {
    if (
      !window.confirm(
        `Delete level "${l.label}"? Courses using this level block deletion — remove or move them first.`,
      )
    ) {
      return;
    }
    setLevelBusyId(l.id);
    setLevelError(null);
    const { error } = await supabase
      .from("department_levels")
      .delete()
      .eq("id", l.id);
    setLevelBusyId(null);
    if (error) {
      setLevelError(
        error.code === "23503"
          ? `Can't delete "${l.label}" — one or more courses still use this level. Move or delete those courses first.`
          : error.message,
      );
      return;
    }
    await load();
  }

  async function handleDelete(d: Department) {
    if (
      !window.confirm(
        `Delete "${d.name}"? This can't be undone. Departments with existing courses, pricing history, or students can't be deleted — archive them instead.`,
      )
    ) {
      return;
    }
    setDeletingId(d.id);
    setListError(null);
    const { error } = await supabase.from("departments").delete().eq("id", d.id);
    setDeletingId(null);
    if (error) {
      setListError(
        error.code === "23503"
          ? `Can't delete "${d.name}" — it still has courses, pricing history, or students attached. Archive it instead (Edit Details → Status).`
          : error.message,
      );
      return;
    }
    await load();
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-1">
            Departments &amp; Faculties
          </h1>
          <p className="mt-1 text-sm text-text-3">
            Manage department tuition fees, custom levels, and pictures.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary flex items-center gap-1.5 text-xs uppercase tracking-wide"
        >
          <Plus size={14} />
          Manifest new department
        </button>
      </div>

      {listError && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {listError}
        </p>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-text-3">Loading…</p>
        ) : departments.length === 0 ? (
          <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
            <LayoutGrid size={28} className="text-text-3" />
            <p className="text-sm text-text-3">
              No departments yet — manifest one above.
            </p>
          </div>
        ) : (
          <>
          {/* Below sm: the table's 5 columns don't fit a phone screen and scrolling it
              sideways hides whichever columns (price, status, actions) aren't currently in
              view with no sign more exist — a stacked card shows every field at once instead. */}
          <div className="space-y-3 sm:hidden">
            {departments.map((d) => {
              const imageUrl = publicImageUrl(d.image_path);
              const ngn = priceAmountFor(d.id, "NGN");
              const usd = priceAmountFor(d.id, "USD");
              const duration = priceDurationFor(d.id);
              const isActive = d.status === "active";
              return (
                <div key={d.id} className="card-luxury p-4">
                  <div className="flex items-center gap-3">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="diamond-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                        <GraduationCap size={18} className="text-white" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-text-1">{d.name}</p>
                      <p className="truncate font-mono text-xs italic text-text-3">
                        {d.slug}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-text-3"}`}
                      />
                      <span className={isActive ? "text-emerald-600" : "text-text-3"}>
                        {isActive ? "Active" : "Archived"}
                      </span>
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-canvas-border pt-3">
                    <div>
                      {ngn > 0 ? (
                        <>
                          <p className="font-bold text-text-1">
                            ₦{ngn.toLocaleString()}
                          </p>
                          {usd > 0 && (
                            <p className="text-xs font-semibold text-text-3">
                              ${usd.toLocaleString()}
                            </p>
                          )}
                          <p className="text-xs text-text-3">
                            {durationLabel(duration)} access
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-text-3">No price set</p>
                      )}
                    </div>
                    <p
                      className={`text-xs ${imageUrl ? "text-emerald-600" : "text-text-3"}`}
                    >
                      {imageUrl ? "✓ Picture uploaded" : "No picture"}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-canvas-border pt-3 text-xs font-bold tracking-wide">
                    <Link
                      to={`/admin/courses?department=${d.id}`}
                      className="uppercase text-royal hover:underline"
                    >
                      Edit archives
                    </Link>
                    <button
                      onClick={() => openEdit(d)}
                      className="uppercase text-emerald-600 hover:underline"
                    >
                      Edit details
                    </button>
                    <button
                      onClick={() => openLevels(d)}
                      className="flex items-center gap-1 uppercase text-amber-600 hover:underline"
                    >
                      <Layers size={12} />
                      Levels
                    </button>
                    <button
                      onClick={() => void handleDelete(d)}
                      disabled={deletingId === d.id}
                      aria-label="Delete department"
                      className="ml-auto text-rose-600 hover:text-rose-700 disabled:opacity-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-canvas-border bg-white sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-canvas-border bg-canvas-soft text-[11px] font-bold uppercase tracking-widest text-text-3">
                  <th className="px-5 py-3 font-bold">Picture &amp; name</th>
                  <th className="px-5 py-3 font-bold">System slug</th>
                  <th className="px-5 py-3 font-bold">Tuition base</th>
                  <th className="px-5 py-3 font-bold">Operational mode</th>
                  <th className="px-5 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => {
                  const imageUrl = publicImageUrl(d.image_path);
                  const ngn = priceAmountFor(d.id, "NGN");
                  const usd = priceAmountFor(d.id, "USD");
                  const duration = priceDurationFor(d.id);
                  const isActive = d.status === "active";
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-canvas-border last:border-0"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-xl object-cover"
                            />
                          ) : (
                            <div className="diamond-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                              <GraduationCap size={17} className="text-white" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-text-1">{d.name}</p>
                            <p
                              className={`text-xs ${imageUrl ? "text-emerald-600" : "text-text-3"}`}
                            >
                              {imageUrl ? "✓ Picture uploaded" : "No picture"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs italic text-text-3">
                        {d.slug}
                      </td>
                      <td className="px-5 py-4">
                        {ngn > 0 ? (
                          <>
                            <p className="font-bold text-text-1">
                              ₦{ngn.toLocaleString()}
                            </p>
                            {usd > 0 && (
                              <p className="text-xs font-semibold text-text-3">
                                ${usd.toLocaleString()}
                              </p>
                            )}
                            <p className="text-xs text-text-3">
                              {durationLabel(duration)} access
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-text-3">No price set</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-text-3"}`}
                          />
                          <span className={isActive ? "text-emerald-600" : "text-text-3"}>
                            {isActive ? "Admin customized" : "Archived"}
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-3 text-xs font-bold tracking-wide">
                          <Link
                            to={`/admin/courses?department=${d.id}`}
                            className="uppercase text-royal hover:underline"
                          >
                            Edit archives
                          </Link>
                          <button
                            onClick={() => openEdit(d)}
                            className="uppercase text-emerald-600 hover:underline"
                          >
                            Edit details
                          </button>
                          <button
                            onClick={() => openLevels(d)}
                            className="flex items-center gap-1 uppercase text-amber-600 hover:underline"
                          >
                            <Layers size={12} />
                            Levels
                          </button>
                          <button
                            onClick={() => void handleDelete(d)}
                            disabled={deletingId === d.id}
                            className="text-rose-600 hover:text-rose-700 disabled:opacity-50"
                            title="Delete department"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {modal === "create" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-4 py-8">
          <form
            onSubmit={handleCreate}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-department-heading"
            className="card-luxury w-full max-w-md space-y-4 p-6"
          >
            <div className="flex items-center justify-between">
              <h2
                id="create-department-heading"
                className="flex items-center gap-2 font-heading text-base font-bold text-text-1"
              >
                <FolderPlus size={17} className="text-royal" />
                Manifest new department
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="text-text-3 hover:text-text-1"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {formError}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-text-2">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Nursing"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-2">Price (₦)</label>
                <input
                  type="number"
                  min={0}
                  value={priceNgn}
                  onChange={(e) => setPriceNgn(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-2">
                  Price ($) <span className="font-normal text-text-3">optional</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-2">
                Access duration (days)
              </label>
              <input
                type="number"
                min={0}
                placeholder="365"
                value={accessDurationDays}
                onChange={(e) => setAccessDurationDays(e.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-text-3">
                365 = 1 year from purchase (the standard yearly fee). Leave blank only for access that never expires.
              </p>
            </div>
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

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={closeModal} className="btn-outline flex-1">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary flex flex-1 items-center justify-center gap-2"
              >
                <FolderPlus size={15} />
                {saving ? "Creating…" : "Create department"}
              </button>
            </div>
          </form>
        </div>
      )}

      {modal === "edit" && activeDept() && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-4 py-8">
          <form
            onSubmit={handleEditSave}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-department-heading"
            className="card-luxury flex max-h-full w-full max-w-md flex-col overflow-y-auto space-y-4 p-6"
          >
            <div className="flex items-center justify-between">
              <h2
                id="edit-department-heading"
                className="flex items-center gap-2 font-heading text-base font-bold text-text-1"
              >
                <Pencil size={17} className="text-royal" />
                Edit details
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="text-text-3 hover:text-text-1"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {formError}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-text-2">Picture</label>
              <div className="mt-1">
                <ImageUpload
                  currentPath={editImagePath}
                  folder="departments"
                  entityId={activeId!}
                  onUploaded={(path) => setEditImagePath(path)}
                  onRemoved={() => setEditImagePath(null)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-2">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-2">Price (₦)</label>
                <input
                  type="number"
                  min={0}
                  value={priceNgn}
                  onChange={(e) => setPriceNgn(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-2">Price ($)</label>
                <input
                  type="number"
                  min={0}
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-2">
                Access duration (days)
              </label>
              <input
                type="number"
                min={0}
                placeholder="365"
                value={accessDurationDays}
                onChange={(e) => setAccessDurationDays(e.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-text-3">
                365 = 1 year from purchase (the standard yearly fee). Leave blank only for access that never expires.
                Changing this only affects future purchases — students who
                already paid keep the terms they bought under.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-2">Status</label>
              <select
                value={editStatus}
                onChange={(e) =>
                  setEditStatus(e.target.value as (typeof DEPT_STATUSES)[number])
                }
                className={`${inputClass} capitalize`}
              >
                {DEPT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-text-3">
                Levels are managed separately (the Levels action) — they're never touched here.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={closeModal} className="btn-outline flex-1">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary flex flex-1 items-center justify-center gap-2"
              >
                <Pencil size={15} />
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {modal === "levels" && activeDept() && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-4 py-8">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="levels-modal-heading"
            className="card-luxury w-full max-w-md p-6"
          >
            <div className="flex items-center justify-between">
              <h2
                id="levels-modal-heading"
                className="flex items-center gap-2 font-heading text-base font-bold text-text-1"
              >
                <Layers size={17} className="text-royal" />
                Levels — {activeDept()!.name}
              </h2>
              <button
                onClick={closeModal}
                aria-label="Close"
                className="text-text-3 hover:text-text-1"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {levelError && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {levelError}
              </p>
            )}

            <div className="mt-4 space-y-1.5">
              {levelsFor(activeId!).length === 0 ? (
                <p className="text-sm text-text-3">No levels yet.</p>
              ) : (
                levelsFor(activeId!).map((l) =>
                  editingLevelId === l.id ? (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 rounded-lg border border-royal/40 px-3 py-2"
                    >
                      <input
                        autoFocus
                        value={editLevelLabel}
                        onChange={(e) => setEditLevelLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveLevelLabel();
                          }
                          if (e.key === "Escape") setEditingLevelId(null);
                        }}
                        className={`${inputClass} mt-0 flex-1`}
                      />
                      <button
                        onClick={() => void saveLevelLabel()}
                        disabled={levelBusyId === l.id}
                        className="shrink-0 text-xs font-bold uppercase text-emerald-600 hover:underline disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingLevelId(null)}
                        className="shrink-0 text-xs font-bold uppercase text-text-3 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div
                      key={l.id}
                      className="flex items-center justify-between rounded-lg border border-canvas-border px-3 py-2 text-sm"
                    >
                      <span className="font-semibold text-text-1">{l.label}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => startEditLevel(l)}
                          aria-label={`Rename ${l.label}`}
                          title="Rename"
                          className="rounded-lg p-1 text-royal transition-colors hover:bg-royal-soft"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => void deleteLevel(l)}
                          disabled={levelBusyId === l.id}
                          aria-label={`Delete ${l.label}`}
                          title="Delete"
                          className="rounded-lg p-1 text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-canvas-border pt-4">
              <input
                value={newLevelLabel}
                onChange={(e) => setNewLevelLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addLevel();
                  }
                }}
                placeholder="e.g. 600L"
                className={`${inputClass} mt-0`}
              />
              <button
                onClick={() => void addLevel()}
                className="btn-secondary shrink-0 px-3 py-2.5 text-xs"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

const inputClass =
  "mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15";
