import { friendlyError } from "@/lib/friendlyError";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BookPlus,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";

// Must match supabase/seed/03-placeholder-questions.sql's v_marker and
// scripts/migrate-questions-from-firebase.mjs's PLACEHOLDER_MARKER exactly — see either file's
// header comment for why a literal string, not a dedicated column, is how "placeholder" is
// tracked here.
const PLACEHOLDER_MARKER =
  "[PLACEHOLDER — auto-generated, safe to delete once real questions are added]";

interface Department {
  id: string;
  name: string;
}
interface Level {
  id: string;
  department_id: string;
  label: string;
}
interface Course {
  id: string;
  title: string;
  slug: string;
  status: string;
  department_id: string;
  level_id: string;
  default_question_type: "objective" | "application";
  description: string | null;
  image_path: string | null;
}
// "none" = zero active questions at all; "placeholder" = only the auto-generated stand-in from
// 03-placeholder-questions.sql; "real" = at least one genuine question.
type ContentState = "none" | "placeholder" | "real";

const STATUSES = ["draft", "published", "archived"] as const;

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminCourses() {
  const [searchParams, setSearchParams] = useSearchParams();
  const departmentId = searchParams.get("department") ?? "";

  const [departments, setDepartments] = useState<Department[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [contentState, setContentState] = useState<
    Record<string, ContentState>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [levelId, setLevelId] = useState("");
  const [questionType, setQuestionType] = useState<"objective" | "application">(
    "objective",
  );
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("published");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showForm) return;
    titleRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") resetForm();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  async function load() {
    setLoading(true);
    const { data: depts } = await supabase
      .from("departments")
      .select("id, name")
      .order("name");
    setDepartments(depts ?? []);

    if (departmentId) {
      const [{ data: levelRows }, { data: courseRows }] = await Promise.all([
        supabase
          .from("department_levels")
          .select("id, department_id, label")
          .eq("department_id", departmentId)
          .order("sort_order"),
        supabase
          .from("courses")
          .select(
            "id, title, slug, status, department_id, level_id, default_question_type, description, image_path",
          )
          .eq("department_id", departmentId)
          .is("deleted_at", null)
          .order("title"),
      ]);
      setLevels(levelRows ?? []);
      setCourses(courseRows ?? []);

      const courseIds = (courseRows ?? []).map((c) => c.id);
      if (courseIds.length > 0) {
        const { data: questionRows } = await supabase
          .from("questions")
          .select("course_id, explanation")
          .in("course_id", courseIds)
          .eq("status", "active")
          .is("deleted_at", null);

        const byCourse = new Map<string, string[]>();
        for (const q of questionRows ?? []) {
          const list = byCourse.get(q.course_id) ?? [];
          list.push(q.explanation ?? "");
          byCourse.set(q.course_id, list);
        }
        const next: Record<string, ContentState> = {};
        for (const id of courseIds) {
          const explanations = byCourse.get(id);
          if (!explanations || explanations.length === 0) {
            next[id] = "none";
          } else if (explanations.every((e) => e === PLACEHOLDER_MARKER)) {
            next[id] = "placeholder";
          } else {
            next[id] = "real";
          }
        }
        setContentState(next);
      } else {
        setContentState({});
      }
    } else {
      setLevels([]);
      setCourses([]);
      setContentState({});
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setLevelId("");
    setQuestionType("objective");
    setDescription("");
    setStatus("published");
    setShowForm(false);
  }

  function openAdd() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(c: Course) {
    setEditingId(c.id);
    setTitle(c.title);
    setLevelId(c.level_id);
    setQuestionType(c.default_question_type);
    setDescription(c.description ?? "");
    setStatus(c.status as (typeof STATUSES)[number]);
    setShowForm(true);
  }

  async function handleSubmitForm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!departmentId || !levelId) {
      setError("Pick a department and level first.");
      return;
    }
    setSaving(true);

    if (editingId) {
      const { error: updateError } = await supabase
        .from("courses")
        .update({
          level_id: levelId,
          title,
          slug: slugify(title),
          description: description || null,
          default_question_type: questionType,
          status,
        })
        .eq("id", editingId);
      setSaving(false);
      if (updateError) {
        setError(friendlyError(updateError));
        return;
      }
      resetForm();
      await load();
      return;
    }

    const { error: insertError } = await supabase.from("courses").insert({
      department_id: departmentId,
      level_id: levelId,
      title,
      slug: slugify(title),
      description: description || null,
      default_question_type: questionType,
      status: "published",
    });

    setSaving(false);
    if (insertError) {
      setError(friendlyError(insertError));
      return;
    }
    resetForm();
    await load();
  }

  function levelLabel(id: string) {
    return levels.find((l) => l.id === id)?.label ?? "—";
  }

  // Hard delete. Blocked by a foreign-key violation (23503) if any question_attempts rows
  // reference this course or one of its questions — i.e. a student has actually studied it —
  // since question_attempts has no ON DELETE CASCADE from courses/questions (see
  // 20261002041327_study_activity.sql): that table is a student's permanent Revision Center
  // history, so losing it isn't an acceptable side effect of an admin cleaning up the catalog.
  // Same safety pattern as department/level deletion in AdminDepartments.tsx — archive instead.
  async function handleDelete(c: Course) {
    if (
      !confirm(
        `Delete "${c.title}"? This can't be undone. Courses a student has already studied can't be deleted — archive them instead (Edit → Status).`,
      )
    )
      return;

    setListError(null);
    const { error: deleteError } = await supabase
      .from("courses")
      .delete()
      .eq("id", c.id);

    if (deleteError) {
      setListError(
        deleteError.code === "23503"
          ? `Can't delete "${c.title}" — one or more students have already studied it. Archive it instead (Edit → Status).`
          : deleteError.message,
      );
      return;
    }

    if (c.image_path) {
      await supabase.storage.from("media").remove([c.image_path]);
    }
    await load();
  }

  return (
    <AdminLayout>
      <h1 className="font-heading text-2xl font-bold text-text-1">Courses</h1>

      <div className="mt-4">
        <label className="block text-sm font-medium text-text-2">
          Department
        </label>
        <select
          value={departmentId}
          onChange={(e) =>
            setSearchParams(
              e.target.value ? { department: e.target.value } : {},
            )
          }
          className={`${inputClass} max-w-sm`}
        >
          <option value="">Select a department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {departmentId && (
        <>
          <button
            onClick={openAdd}
            className="btn-primary mt-6 flex items-center gap-2"
          >
            <Plus size={16} />
            Add course
          </button>

          {showForm && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
              onClick={resetForm}
            >
              <form
                onSubmit={handleSubmitForm}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="course-form-heading"
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <h2
                    id="course-form-heading"
                    className="flex items-center gap-2 font-heading text-base font-bold text-text-1"
                  >
                    {editingId ? (
                      <Pencil size={17} className="text-royal" />
                    ) : (
                      <BookPlus size={17} className="text-royal" />
                    )}
                    {editingId ? "Edit course" : "Add course"}
                  </h2>
                  <button
                    type="button"
                    onClick={resetForm}
                    aria-label={editingId ? "Cancel edit" : "Close"}
                    className="flex items-center gap-1 text-xs font-semibold text-text-3 hover:text-text-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                  >
                    <X size={13} aria-hidden="true" />
                    {editingId ? "Cancel edit" : "Close"}
                  </button>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                  >
                    {error}
                  </p>
                )}

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="course-title" className="block text-sm font-medium text-text-2">
                      Title
                    </label>
                    <input
                      id="course-title"
                      ref={titleRef}
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="course-level" className="block text-sm font-medium text-text-2">
                      Level
                    </label>
                    <select
                      id="course-level"
                      required
                      value={levelId}
                      onChange={(e) => setLevelId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select a level</option>
                      {levels.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="course-question-type" className="block text-sm font-medium text-text-2">
                    Question type
                  </label>
                  <select
                    id="course-question-type"
                    value={questionType}
                    onChange={(e) =>
                      setQuestionType(e.target.value as "objective" | "application")
                    }
                    className={`${inputClass} max-w-xs`}
                  >
                    <option value="objective">Objective (multiple choice)</option>
                    <option value="application">Application</option>
                  </select>
                </div>

                <div className="mt-4">
                  <label htmlFor="course-description" className="block text-sm font-medium text-text-2">
                    Description (optional)
                  </label>
                  <textarea
                    id="course-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={inputClass}
                    rows={3}
                  />
                </div>

                {editingId && (
                  <div className="mt-4">
                    <label htmlFor="course-status" className="block text-sm font-medium text-text-2">
                      Status
                    </label>
                    <select
                      id="course-status"
                      value={status}
                      onChange={(e) =>
                        setStatus(e.target.value as (typeof STATUSES)[number])
                      }
                      className={`${inputClass} max-w-xs capitalize`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary mt-6 flex items-center gap-2"
                >
                  {editingId ? <Pencil size={15} /> : <BookPlus size={15} />}
                  {saving
                    ? editingId
                      ? "Saving…"
                      : "Creating…"
                    : editingId
                      ? "Save changes"
                      : "Create course"}
                </button>
              </form>
            </div>
          )}

          <div className="mt-8">
            {listError && (
              <p
                role="alert"
                className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {listError}
              </p>
            )}
            {loading ? (
              <p className="text-sm text-text-3">Loading…</p>
            ) : courses.length === 0 ? (
              <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
                <BookOpen size={28} className="text-text-3" />
                <p className="text-sm text-text-3">
                  No courses yet — add one above.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {courses.map((c) => (
                  <div
                    key={c.id}
                    className={`card-luxury p-4 ${editingId === c.id ? "ring-2 ring-royal" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-royal-soft">
                        <BookOpen size={17} className="text-royal" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading font-bold text-text-1">
                          {c.title}
                        </p>
                        <p className="truncate text-sm text-text-3">
                          {levelLabel(c.level_id)} · {c.default_question_type} ·{" "}
                          {c.status}
                        </p>
                      </div>
                      <ContentBadge state={contentState[c.id]} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-canvas-border pt-3">
                      <button
                        onClick={() => startEdit(c)}
                        className="flex shrink-0 items-center gap-1 text-sm font-semibold text-royal hover:underline"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                      <Link
                        to={`/admin/courses/${c.id}/questions`}
                        className="flex shrink-0 items-center gap-1 text-sm font-semibold text-royal hover:underline"
                      >
                        <ListChecks size={13} />
                        Manage questions <ArrowRight size={13} />
                      </Link>
                      <button
                        onClick={() => void handleDelete(c)}
                        className="flex shrink-0 items-center gap-1 text-sm font-semibold text-rose-600 hover:underline"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}

const inputClass =
  "mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15";

// Pre-launch content-completeness signal — see 03-placeholder-questions.sql's header for why
// this exists: that seed script quietly fills an empty course with an obviously-fake stand-in
// question so the catalog isn't empty, but nothing previously surfaced which courses were still
// running on that stand-in rather than real content. A state of "none" (not just "placeholder")
// is also flagged, since a course can have zero questions before the seed script has even run.
function ContentBadge({ state }: { state: ContentState | undefined }) {
  if (state === "real") {
    return null;
  }
  if (state === "placeholder") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
        <AlertTriangle size={12} />
        Placeholder only
      </span>
    );
  }
  // "none" (no real content yet) or state not loaded yet (loading, same visual either way —
  // the real state fills in a moment later).
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
      <AlertTriangle size={12} />
      No questions
    </span>
  );
}
