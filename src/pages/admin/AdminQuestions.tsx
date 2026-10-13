import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Download,
  FilePlus,
  FileQuestion,
  Lightbulb,
  ListTree,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabasePaging";
import { AdminLayout } from "@/components/AdminLayout";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ImageUpload } from "@/components/ImageUpload";
import { parseCSV, downloadCSV } from "@/lib/csv";

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
  department_id: string;
  level_id: string;
  default_question_type: "objective" | "application";
  description: string | null;
  image_path: string | null;
}

interface Option {
  id: string;
  label: string;
  body: string;
  is_correct: boolean;
}

interface Question {
  id: string;
  type: "objective" | "application";
  prompt: string;
  expected_answer: string | null;
  explanation: string | null;
  sort_order: number;
  status: "active" | "trashed";
  options: Option[];
}

interface OutlineSection {
  id: string;
  title: string;
  start_question_order: number;
  end_question_order: number;
  sort_order: number;
}

const OPTION_LABELS = ["A", "B", "C", "D", "E"];
// Must match supabase/seed/03-placeholder-questions.sql's v_marker exactly.
const PLACEHOLDER_MARKER =
  "[PLACEHOLDER — auto-generated, safe to delete once real questions are added]";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function matchesSearch(q: Question, needle: string) {
  if (!needle) return true;
  const haystack = [
    q.prompt,
    q.expected_answer ?? "",
    q.explanation ?? "",
    ...q.options.map((o) => o.body),
  ]
    .join(" \n ")
    .toLowerCase();
  return haystack.includes(needle);
}

export default function AdminQuestions() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outlineSectionRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [showEditDetails, setShowEditDetails] = useState(false);
  const [detailsTitle, setDetailsTitle] = useState("");
  const [detailsDeptId, setDetailsDeptId] = useState("");
  const [detailsLevelId, setDetailsLevelId] = useState("");
  const [detailsType, setDetailsType] = useState<"objective" | "application">(
    "objective",
  );
  const [detailsDescription, setDetailsDescription] = useState("");
  const [detailsImagePath, setDetailsImagePath] = useState<string | null>(null);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const detailsTitleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showEditDetails) return;
    detailsTitleRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowEditDetails(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showEditDetails]);

  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [type, setType] = useState<"objective" | "application">("objective");
  const [prompt, setPrompt] = useState("");
  const [explanation, setExplanation] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const questionPromptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!showQuestionForm) return;
    questionPromptRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") resetForm();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQuestionForm]);

  const [outline, setOutline] = useState<OutlineSection[]>([]);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [outlineSaving, setOutlineSaving] = useState(false);
  const [editingOutlineId, setEditingOutlineId] = useState<string | null>(
    null,
  );
  const [outlineTitle, setOutlineTitle] = useState("");
  const [outlineStart, setOutlineStart] = useState("");
  const [outlineEnd, setOutlineEnd] = useState("");
  const [showOutlineForm, setShowOutlineForm] = useState(false);

  async function load() {
    if (!courseId) return;
    setLoading(true);
    setLoadError(null);

    try {
      const [{ data: courseRow }, { data: deptRows }, { data: levelRows }] =
        await Promise.all([
          supabase
            .from("courses")
            .select(
              "id, title, slug, department_id, level_id, default_question_type, description, image_path",
            )
            .eq("id", courseId)
            .single(),
          supabase.from("departments").select("id, name").order("name"),
          supabase
            .from("department_levels")
            .select("id, department_id, label")
            .order("sort_order"),
        ]);
      setCourse(courseRow);
      setDepartments(deptRows ?? []);
      setLevels(levelRows ?? []);
      if (courseRow) setType(courseRow.default_question_type);

      // Keyset-paginated — a plain .select() here silently caps at Supabase's 1000-row default,
      // which a large course's question count can exceed outright. Options come embedded in the
      // same query (a PostgREST foreign-table select, already used elsewhere in this app) rather
      // than a separate .in(questionIds) fetch — for a course with hundreds of questions that
      // .in() filter's URL grew large enough on every single page request to risk failing
      // outright, since it had to repeat the full id list on every page, not just the first.
      const questionRowsUnsorted = await fetchAllRows<{
        id: string;
        type: "objective" | "application";
        prompt: string;
        expected_answer: string | null;
        explanation: string | null;
        sort_order: number;
        status: "active" | "trashed";
        question_options: {
          id: string;
          label: string;
          body: string;
          is_correct: boolean;
          sort_order: number;
        }[];
      }>((after) => {
        let q = supabase
          .from("questions")
          .select(
            "id, type, prompt, expected_answer, explanation, sort_order, status, question_options(id, label, body, is_correct, sort_order)",
          )
          .eq("course_id", courseId)
          .in("status", ["active", "trashed"])
          .order("id")
          .limit(1000);
        if (after) q = q.gt("id", after);
        return q;
      });
      // fetchAllRows paginates by id for correctness, not display order — this page's own
      // question order comes from sort_order, applied here instead.
      const questionRows = [...questionRowsUnsorted].sort((a, b) => a.sort_order - b.sort_order);

      setQuestions(
        questionRows.map((q) => ({
          ...q,
          options: [...q.question_options].sort((a, b) => a.sort_order - b.sort_order),
        })),
      );

      const { data: outlineRows } = await supabase
        .from("course_outline_sections")
        .select("id, title, start_question_order, end_question_order, sort_order")
        .eq("course_id", courseId)
        .order("sort_order");
      setOutline(outlineRows ?? []);
    } catch (err) {
      // Previously unhandled — any failure here (a timeout, a bad response) left the loading
      // spinner showing forever with no error and no way to tell what went wrong.
      console.error("AdminQuestions load failed:", err);
      setLoadError(
        err instanceof Error ? err.message : "Something went wrong loading this course.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const activeQuestions = useMemo(
    () => questions.filter((q) => q.status === "active"),
    [questions],
  );
  const archivedQuestions = useMemo(
    () => questions.filter((q) => q.status === "trashed"),
    [questions],
  );
  const needle = search.trim().toLowerCase();
  const visibleQuestions = (tab === "active" ? activeQuestions : archivedQuestions).filter(
    (q) => matchesSearch(q, needle),
  );

  function resetForm() {
    setEditingId(null);
    setType(course?.default_question_type ?? "objective");
    setPrompt("");
    setExplanation("");
    setExpectedAnswer("");
    setOptions(["", "", "", ""]);
    setCorrectIndex(0);
    setShowQuestionForm(false);
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setType(q.type);
    setPrompt(q.prompt);
    setExplanation(q.explanation ?? "");
    setExpectedAnswer(q.expected_answer ?? "");
    if (q.type === "objective") {
      const byLabel = (label: string) =>
        q.options.find((o) => o.label === label)?.body ?? "";
      setOptions(OPTION_LABELS.map((l) => byLabel(l)));
      const correct = q.options.findIndex((o) => o.is_correct);
      setCorrectIndex(correct >= 0 ? correct : 0);
    } else {
      setOptions(["", "", "", ""]);
      setCorrectIndex(0);
    }
    setShowQuestionForm(true);
  }

  async function handleSubmitForm(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (type === "objective" && options.filter((o) => o.trim()).length < 2) {
      setError("Add at least two options.");
      return;
    }
    if (type === "application" && !expectedAnswer.trim()) {
      setError("Add the expected answer.");
      return;
    }

    setSaving(true);

    const questionId = editingId;
    if (questionId) {
      const { error: qError } = await supabase
        .from("questions")
        .update({
          type,
          prompt,
          explanation: explanation || null,
          expected_answer: type === "application" ? expectedAnswer : null,
        })
        .eq("id", questionId);
      if (qError) {
        setSaving(false);
        setError(qError.message);
        return;
      }
      // Options are replaced wholesale rather than diffed — simpler and matches how creation
      // itself builds them, with no edge cases around a relabeled/reordered/removed option.
      await supabase.from("question_options").delete().eq("question_id", questionId);
    }

    const { data: question, error: qError } = questionId
      ? { data: { id: questionId }, error: null }
      : await supabase
          .from("questions")
          .insert({
            course_id: courseId,
            type,
            prompt,
            explanation: explanation || null,
            expected_answer: type === "application" ? expectedAnswer : null,
            sort_order: activeQuestions.length,
          })
          .select("id")
          .single();

    if (qError || !question) {
      setSaving(false);
      setError(qError?.message ?? "Failed to save question.");
      return;
    }

    if (type === "objective") {
      const rows = options
        .map((body, i) => ({ body, i }))
        .filter((o) => o.body.trim())
        .map((o) => ({
          question_id: question.id,
          label: OPTION_LABELS[o.i],
          body: o.body,
          is_correct: o.i === correctIndex,
          sort_order: o.i,
        }));
      await supabase.from("question_options").insert(rows);
    }

    resetForm();
    setSaving(false);
    await load();
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this question? It's hidden from students immediately, and can be restored later from the Archived tab.")) return;
    if (editingId === id) resetForm();
    await supabase
      .from("questions")
      .update({ status: "trashed", deleted_at: new Date().toISOString() })
      .eq("id", id);
    await load();
  }

  async function handleRestore(id: string) {
    await supabase
      .from("questions")
      .update({ status: "active", deleted_at: null })
      .eq("id", id);
    await load();
  }

  async function handleHardDelete(id: string) {
    if (
      !confirm(
        "Permanently delete this question? This cannot be undone — if you just want to hide it, use Archive instead.",
      )
    )
      return;
    await supabase.from("questions").delete().eq("id", id);
    await load();
  }

  async function handleBulkDelete() {
    if (activeQuestions.length === 0) return;
    const confirmed = confirm(
      `Archive all ${activeQuestions.length} active question(s) in "${course?.title}"? They'll be hidden from students immediately and can be restored one at a time from the Archived tab.`,
    );
    if (!confirmed) return;
    setBulkDeleting(true);
    await supabase
      .from("questions")
      .update({ status: "trashed", deleted_at: new Date().toISOString() })
      .eq("course_id", courseId)
      .eq("status", "active");
    setBulkDeleting(false);
    await load();
  }

  function resetOutlineForm() {
    setEditingOutlineId(null);
    setOutlineTitle("");
    setOutlineStart("");
    setOutlineEnd("");
    setShowOutlineForm(false);
  }

  function startAddOutline() {
    resetOutlineForm();
    const lastEnd = outline.reduce(
      (max, s) => Math.max(max, s.end_question_order),
      0,
    );
    setOutlineStart(String(lastEnd + 1));
    setOutlineEnd(String(activeQuestions.length));
    setShowOutlineForm(true);
  }

  function startEditOutline(s: OutlineSection) {
    setEditingOutlineId(s.id);
    setOutlineTitle(s.title);
    setOutlineStart(String(s.start_question_order));
    setOutlineEnd(String(s.end_question_order));
    setShowOutlineForm(true);
  }

  async function handleSubmitOutline(e: FormEvent) {
    e.preventDefault();
    setOutlineError(null);

    const start = Number(outlineStart);
    const end = Number(outlineEnd);
    if (!outlineTitle.trim()) {
      setOutlineError("Give this section a title.");
      return;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1) {
      setOutlineError("Start/end must be whole numbers, starting from 1.");
      return;
    }
    if (end < start) {
      setOutlineError("End must be greater than or equal to start.");
      return;
    }
    if (end > activeQuestions.length) {
      setOutlineError(
        `This course only has ${activeQuestions.length} question(s) — end can't exceed that.`,
      );
      return;
    }

    setOutlineSaving(true);
    if (editingOutlineId) {
      const { error: updateError } = await supabase
        .from("course_outline_sections")
        .update({
          title: outlineTitle.trim(),
          start_question_order: start,
          end_question_order: end,
        })
        .eq("id", editingOutlineId);
      setOutlineSaving(false);
      if (updateError) {
        setOutlineError(updateError.message);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("course_outline_sections")
        .insert({
          course_id: courseId,
          title: outlineTitle.trim(),
          start_question_order: start,
          end_question_order: end,
          sort_order: outline.length,
        });
      setOutlineSaving(false);
      if (insertError) {
        setOutlineError(insertError.message);
        return;
      }
    }
    resetOutlineForm();
    await load();
  }

  async function handleRemoveOutline(id: string) {
    if (editingOutlineId === id) resetOutlineForm();
    await supabase.from("course_outline_sections").delete().eq("id", id);
    await load();
  }

  function openEditDetails() {
    if (!course) return;
    setDetailsTitle(course.title);
    setDetailsDeptId(course.department_id);
    setDetailsLevelId(course.level_id);
    setDetailsType(course.default_question_type);
    setDetailsDescription(course.description ?? "");
    setDetailsImagePath(course.image_path);
    setDetailsError(null);
    setShowEditDetails(true);
  }

  async function handleSaveDetails(e: FormEvent) {
    e.preventDefault();
    setDetailsError(null);
    if (!detailsTitle.trim() || !detailsDeptId || !detailsLevelId) {
      setDetailsError("Title, department, and level are all required.");
      return;
    }
    setDetailsSaving(true);
    const { error: updateError } = await supabase
      .from("courses")
      .update({
        title: detailsTitle.trim(),
        slug: slugify(detailsTitle),
        department_id: detailsDeptId,
        level_id: detailsLevelId,
        default_question_type: detailsType,
        description: detailsDescription.trim() || null,
        image_path: detailsImagePath,
      })
      .eq("id", courseId);
    setDetailsSaving(false);
    if (updateError) {
      setDetailsError(updateError.message);
      return;
    }
    setShowEditDetails(false);
    await load();
  }

  function downloadTemplate() {
    const isApp = course?.default_question_type === "application";
    const headers = isApp
      ? ["Question", "Expected Answer"]
      : [
          "Question",
          "Option A",
          "Option B",
          "Option C",
          "Option D",
          "Option E",
          "Correct Answer (A-E or 0-4)",
          "Explanation",
        ];
    const sampleRow = isApp
      ? [
          "Describe the key concepts of the system architecture.",
          "Key concepts: microservices decoupling, event-driven processing.",
        ]
      : [
          "Sample question?",
          "Option 1",
          "Option 2",
          "Option 3",
          "Option 4",
          "Option 5",
          "A",
          "Because it is A",
        ];
    downloadCSV(
      isApp
        ? "application_question_template.csv"
        : "question_import_template.csv",
      [headers, sampleRow],
    );
  }

  function handleExport() {
    if (!course || activeQuestions.length === 0) return;
    const isApp = course.default_question_type === "application";
    const headers = isApp
      ? ["Question", "Expected Answer"]
      : [
          "Question",
          "Option A",
          "Option B",
          "Option C",
          "Option D",
          "Option E",
          "Correct Answer (A-E or 0-4)",
          "Explanation",
        ];
    const rows = activeQuestions.map((q) => {
      if (isApp) return [q.prompt, q.expected_answer ?? ""];
      const byLabel = (label: string) =>
        q.options.find((o) => o.label === label)?.body ?? "";
      const correct = q.options.find((o) => o.is_correct)?.label ?? "A";
      return [
        q.prompt,
        byLabel("A"),
        byLabel("B"),
        byLabel("C"),
        byLabel("D"),
        byLabel("E"),
        correct,
        q.explanation ?? "",
      ];
    });
    downloadCSV(`archive_${course.title.replace(/\s+/g, "_")}.csv`, [
      headers,
      ...rows,
    ]);
  }

  // Column mapping matches the old app's export exactly (see 05-BACKEND.md's note on this
  // being the migration path from the old question bank) — objective: question, options A-E,
  // correct answer (letter A-E or index 0-4), explanation; application: question, expected
  // answer (or column 7, for a file exported from the 8-column objective-style template).
  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !courseId || !course) return;
    e.target.value = "";

    const text = await file.text();
    const rows = parseCSV(text).slice(1); // drop header
    const isApp = course.default_question_type === "application";

    setImporting(true);
    setError(null);
    let imported = 0;
    let nextOrder = activeQuestions.length;

    for (const row of rows) {
      if (!row || row.length === 0) continue;
      if (!isApp && row.length < 6) continue;
      const questionText = (row[0] ?? "").trim();
      if (isApp && !questionText && !(row[1] ?? "").trim()) continue;
      if (!questionText) continue;

      const { data: inserted, error: qError } = await supabase
        .from("questions")
        .insert({
          course_id: courseId,
          type: isApp ? "application" : "objective",
          prompt: questionText,
          expected_answer: isApp ? (row[1] || row[7] || "").trim() : null,
          explanation: isApp ? null : (row[7] ?? "").trim() || null,
          sort_order: nextOrder++,
        })
        .select("id")
        .single();

      if (qError || !inserted) continue;

      if (!isApp) {
        const rawCorrect = (row[6] ?? "").trim().toUpperCase();
        const correctIndex = OPTION_LABELS.includes(rawCorrect)
          ? OPTION_LABELS.indexOf(rawCorrect)
          : Number.isInteger(Number(rawCorrect)) &&
              Number(rawCorrect) >= 0 &&
              Number(rawCorrect) <= 4
            ? Number(rawCorrect)
            : 0;

        const optionRows = OPTION_LABELS.map((label, i) => ({
          question_id: inserted.id,
          label,
          body: (row[i + 1] ?? "").trim() || `Option ${label}`,
          is_correct: i === correctIndex,
          sort_order: i,
        }));
        await supabase.from("question_options").insert(optionRows);
      }
      imported++;
    }

    setImporting(false);
    await load();
    alert(`${imported} question(s) imported.`);
  }

  if (loadError && !loading) {
    return (
      <AdminLayout>
        <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
          <AlertTriangle size={24} className="text-rose-500" />
          <p className="text-sm font-semibold text-text-1">Couldn't load this course</p>
          <p className="text-sm text-text-3">{loadError}</p>
          <button onClick={() => void load()} className="btn-primary mt-2">
            Retry
          </button>
        </div>
      </AdminLayout>
    );
  }

  if (!course && !loading) {
    return (
      <AdminLayout>
        <p className="text-sm text-text-3">Course not found.</p>
      </AdminLayout>
    );
  }

  const departmentName = departments.find((d) => d.id === course?.department_id)?.name;
  const levelLabel = levels.find((l) => l.id === course?.level_id)?.label;
  const levelsForDetailsDept = levels.filter((l) => l.department_id === detailsDeptId);
  const courseImageUrl = course?.image_path
    ? supabase.storage.from("media").getPublicUrl(course.image_path).data.publicUrl
    : null;

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start gap-4">
        {courseImageUrl ? (
          <img
            src={courseImageUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-royal-soft">
            <FileQuestion size={24} className="text-royal" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-2xl font-bold text-text-1">
            {course?.title}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {departmentName && <span className="badge-gold">{departmentName}</span>}
            {levelLabel && <span className="badge-royal">{levelLabel}</span>}
            <span className="badge-royal capitalize">
              {course?.default_question_type}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={openEditDetails}
              className="btn-outline flex items-center gap-1.5 text-xs"
            >
              <Pencil size={13} />
              Edit details
            </button>
            <button
              onClick={() => void handleBulkDelete()}
              disabled={bulkDeleting || activeQuestions.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
            >
              <Archive size={13} />
              {bulkDeleting ? "Archiving…" : `Bulk archive (${activeQuestions.length})`}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={downloadTemplate}
          className="btn-outline flex items-center gap-1.5 text-sm"
        >
          <Download size={14} />
          Download template
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <Upload size={14} />
          {importing ? "Importing…" : "Import archive"}
        </button>
        <button
          onClick={() =>
            outlineSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className="btn-outline flex items-center gap-1.5 text-sm"
        >
          <ListTree size={14} />
          Course content
        </button>
        <button
          onClick={handleExport}
          disabled={activeQuestions.length === 0}
          className="btn-outline flex items-center gap-1.5 text-sm disabled:opacity-50"
        >
          <Download size={14} />
          Export archive
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(e) => void handleImport(e)}
          className="hidden"
        />
      </div>

      <button
        onClick={() => {
          resetForm();
          setShowQuestionForm(true);
        }}
        className="btn-primary mt-6 flex w-full items-center justify-center gap-2 sm:w-auto"
      >
        <Plus size={16} />
        Add new question
      </button>

      <div className="relative mt-4">
        <Search
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search queries, options, expected answer, or explanation…"
          className="w-full rounded-xl border border-canvas-border bg-white py-2.5 pl-10 pr-3 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
        />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setTab("active")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
            tab === "active" ? "bg-royal text-white" : "bg-canvas-soft text-text-3"
          }`}
        >
          Active ({activeQuestions.length})
        </button>
        <button
          onClick={() => setTab("archived")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
            tab === "archived" ? "bg-royal text-white" : "bg-canvas-soft text-text-3"
          }`}
        >
          Archived ({archivedQuestions.length})
        </button>
      </div>

      {showQuestionForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
          onClick={resetForm}
        >
          <form
            onSubmit={handleSubmitForm}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="question-form-heading"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
          <div className="flex items-center justify-between">
            <h2
              id="question-form-heading"
              className="flex items-center gap-2 font-heading text-base font-bold text-text-1"
            >
              {editingId ? (
                <Pencil size={17} className="text-royal" />
              ) : (
                <FilePlus size={17} className="text-royal" />
              )}
              {editingId ? "Edit question" : "Add question"}
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

          <div className="mt-4">
            <label htmlFor="question-type" className="block text-sm font-medium text-text-2">Type</label>
            <select
              id="question-type"
              value={type}
              onChange={(e) =>
                setType(e.target.value as "objective" | "application")
              }
              className={`${inputClass} max-w-xs`}
            >
              <option value="objective">Objective (multiple choice)</option>
              <option value="application">Application</option>
            </select>
          </div>

          <div className="mt-4">
            <label htmlFor="question-prompt" className="block text-sm font-medium text-text-2">
              Question
            </label>
            <textarea
              id="question-prompt"
              ref={questionPromptRef}
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className={inputClass}
              rows={3}
            />
          </div>

          {type === "objective" ? (
            <fieldset className="mt-4 space-y-2">
              <legend className="block text-sm font-medium text-text-2">
                Options (select the correct one)
              </legend>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    id={`question-option-correct-${i}`}
                    type="radio"
                    name="correct"
                    checked={correctIndex === i}
                    onChange={() => setCorrectIndex(i)}
                    className="h-4 w-4 accent-[#1B3FA0]"
                  />
                  <label
                    htmlFor={`question-option-${i}`}
                    className="w-5 text-sm font-semibold text-text-3"
                  >
                    {OPTION_LABELS[i]}
                  </label>
                  <input
                    id={`question-option-${i}`}
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[i] = e.target.value;
                      setOptions(next);
                    }}
                    className={inputClass}
                  />
                </div>
              ))}
            </fieldset>
          ) : (
            <div className="mt-4">
              <label htmlFor="question-expected-answer" className="block text-sm font-medium text-text-2">
                Expected answer
              </label>
              <textarea
                id="question-expected-answer"
                value={expectedAnswer}
                onChange={(e) => setExpectedAnswer(e.target.value)}
                className={inputClass}
                rows={2}
              />
            </div>
          )}

          <div className="mt-4">
            <label htmlFor="question-explanation" className="block text-sm font-medium text-text-2">
              Explanation (optional)
            </label>
            <textarea
              id="question-explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary mt-6 flex items-center gap-2"
          >
            {editingId ? <Pencil size={15} /> : <FilePlus size={15} />}
            {saving
              ? editingId
                ? "Saving…"
                : "Adding…"
              : editingId
                ? "Save changes"
                : "Add question"}
          </button>
          </form>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          <LoadingScreen />
        ) : visibleQuestions.length === 0 ? (
          <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
            <FileQuestion size={28} className="text-text-3" />
            <p className="text-sm text-text-3">
              {needle
                ? "No questions match your search."
                : tab === "archived"
                  ? "No archived questions."
                  : "No questions yet — add one above."}
            </p>
          </div>
        ) : (
          visibleQuestions.map((q, i) => (
            <div
              key={q.id}
              className={`card-luxury p-4 ${editingId === q.id ? "ring-2 ring-royal" : ""} ${q.status === "trashed" ? "opacity-70" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="badge-royal flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 text-xs">
                    {i + 1}
                  </span>
                  <div>
                    <p className="whitespace-pre-wrap text-sm font-medium text-text-1">
                      {q.prompt}
                    </p>
                    {q.explanation === PLACEHOLDER_MARKER && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        <AlertTriangle size={10} />
                        Placeholder — not real content
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {q.status === "active" ? (
                    <>
                      <button
                        onClick={() => startEdit(q)}
                        title="Edit"
                        className="rounded-lg p-1.5 text-royal transition-colors hover:bg-royal-soft"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => void handleArchive(q.id)}
                        title="Archive"
                        className="rounded-lg p-1.5 text-rose-600 transition-colors hover:bg-rose-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => void handleRestore(q.id)}
                        title="Restore"
                        className="rounded-lg p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50"
                      >
                        <ArchiveRestore size={15} />
                      </button>
                      <button
                        onClick={() => void handleHardDelete(q.id)}
                        title="Delete permanently"
                        className="rounded-lg p-1.5 text-rose-600 transition-colors hover:bg-rose-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {q.type === "objective" ? (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {q.options.map((o) => (
                    <div
                      key={o.id}
                      className={`flex items-start gap-1.5 whitespace-pre-wrap rounded-lg border p-2 text-sm ${
                        o.is_correct
                          ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-800"
                          : "border-canvas-border text-text-2"
                      }`}
                    >
                      {o.is_correct && (
                        <CheckCircle2
                          size={13}
                          className="mt-0.5 shrink-0 text-emerald-600"
                        />
                      )}
                      <span>
                        {o.label}. {o.body}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-canvas-soft p-2 text-sm text-text-2">
                  Expected: {q.expected_answer}
                </p>
              )}

              {q.explanation && q.explanation !== PLACEHOLDER_MARKER && (
                <div className="mt-3 border-t border-canvas-border pt-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-navy">
                    <Lightbulb size={12} />
                    Explanation
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm italic text-text-3">
                    {q.explanation}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div ref={outlineSectionRef} className="card-luxury mt-8 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-base font-bold text-text-1">
              <ListTree size={17} className="text-royal" />
              Course outline
            </h2>
            <p className="mt-1 text-sm text-text-3">
              Breaks the {activeQuestions.length} question(s) above into named
              sections — shown to students as "Academic objectives" on the
              course page, and triggers the "section complete" checkpoint
              mid-quiz.
            </p>
          </div>
          {!showOutlineForm && (
            <button
              onClick={startAddOutline}
              disabled={activeQuestions.length === 0}
              className="btn-secondary flex shrink-0 items-center gap-1.5 text-sm disabled:opacity-50"
            >
              <Plus size={14} />
              Add section
            </button>
          )}
        </div>

        {activeQuestions.length === 0 && (
          <p className="mt-3 text-xs text-text-3">
            Add questions above first — sections reference question
            positions.
          </p>
        )}

        {showOutlineForm && (
          <form
            onSubmit={handleSubmitOutline}
            className="mt-4 space-y-3 rounded-xl border border-canvas-border p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-1">
                {editingOutlineId ? "Edit section" : "New section"}
              </p>
              <button
                type="button"
                onClick={resetOutlineForm}
                className="flex items-center gap-1 text-xs font-semibold text-text-3 hover:text-text-1"
              >
                <X size={13} />
                Cancel
              </button>
            </div>

            {outlineError && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {outlineError}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-text-2">
                Title
              </label>
              <input
                required
                value={outlineTitle}
                onChange={(e) => setOutlineTitle(e.target.value)}
                placeholder="e.g. Orbit and Ear (Part 1)"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-2">
                  Start question #
                </label>
                <input
                  type="number"
                  min={1}
                  max={activeQuestions.length}
                  required
                  value={outlineStart}
                  onChange={(e) => setOutlineStart(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-2">
                  End question #
                </label>
                <input
                  type="number"
                  min={1}
                  max={activeQuestions.length}
                  required
                  value={outlineEnd}
                  onChange={(e) => setOutlineEnd(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={outlineSaving}
              className="btn-primary flex items-center gap-2"
            >
              {editingOutlineId ? <Pencil size={15} /> : <Plus size={15} />}
              {outlineSaving
                ? "Saving…"
                : editingOutlineId
                  ? "Save changes"
                  : "Add section"}
            </button>
          </form>
        )}

        {outline.length === 0 ? (
          <p className="mt-4 text-sm text-text-3">
            No outline sections yet — the course page will just show "no
            outline published" until you add one.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {outline.map((s, i) => (
              <li
                key={s.id}
                className={`card-luxury flex items-center gap-3 p-3 ${editingOutlineId === s.id ? "ring-2 ring-royal" : ""}`}
              >
                <span className="badge-royal flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-1">
                    {s.title}
                  </p>
                  <p className="text-xs text-text-3">
                    Q{s.start_question_order}–{s.end_question_order}
                  </p>
                </div>
                <button
                  onClick={() => startEditOutline(s)}
                  className="flex shrink-0 items-center gap-1 text-xs font-semibold text-royal hover:underline"
                >
                  <Pencil size={12} />
                  Edit
                </button>
                <button
                  onClick={() => void handleRemoveOutline(s.id)}
                  className="flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-600 hover:underline"
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showEditDetails && course && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
          onClick={() => setShowEditDetails(false)}
        >
          <form
            onSubmit={handleSaveDetails}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-archive-details-heading"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2
                id="edit-archive-details-heading"
                className="font-heading text-lg font-bold text-text-1"
              >
                Edit archive details
              </h2>
              <button
                type="button"
                onClick={() => setShowEditDetails(false)}
                aria-label="Close"
                className="rounded-full p-1 text-text-3 hover:bg-canvas-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {detailsError && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {detailsError}
              </p>
            )}

            <div className="mt-4">
              <p className="text-sm font-medium text-text-2">
                Course picture (shown on left of course cards)
              </p>
              <div className="mt-1">
                <ImageUpload
                  currentPath={detailsImagePath}
                  folder="courses"
                  entityId={courseId ?? ""}
                  onUploaded={(path) => setDetailsImagePath(path)}
                  onRemoved={() => setDetailsImagePath(null)}
                />
              </div>
            </div>

            <div className="mt-4">
              <label
                htmlFor="details-title"
                className="block text-sm font-medium text-text-2"
              >
                Archive title
              </label>
              <input
                id="details-title"
                ref={detailsTitleRef}
                required
                value={detailsTitle}
                onChange={(e) => setDetailsTitle(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="details-department"
                  className="block text-sm font-medium text-text-2"
                >
                  Department
                </label>
                <select
                  id="details-department"
                  required
                  value={detailsDeptId}
                  onChange={(e) => {
                    setDetailsDeptId(e.target.value);
                    setDetailsLevelId("");
                  }}
                  className={inputClass}
                >
                  <option value="">Select</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="details-level"
                  className="block text-sm font-medium text-text-2"
                >
                  Level
                </label>
                <select
                  id="details-level"
                  required
                  value={detailsLevelId}
                  onChange={(e) => setDetailsLevelId(e.target.value)}
                  disabled={!detailsDeptId}
                  className={`${inputClass} disabled:opacity-50`}
                >
                  <option value="">Select</option>
                  {levelsForDetailsDept.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label
                htmlFor="details-type"
                className="block text-sm font-medium text-text-2"
              >
                Question type
              </label>
              <select
                id="details-type"
                value={detailsType}
                onChange={(e) =>
                  setDetailsType(e.target.value as "objective" | "application")
                }
                className={inputClass}
              >
                <option value="objective">Objectives (multiple choice)</option>
                <option value="application">Application</option>
              </select>
            </div>

            <div className="mt-4">
              <label
                htmlFor="details-description"
                className="block text-sm font-medium text-text-2"
              >
                Description (optional)
              </label>
              <textarea
                id="details-description"
                value={detailsDescription}
                onChange={(e) => setDetailsDescription(e.target.value)}
                placeholder="Description of the course archive…"
                className={inputClass}
                rows={3}
              />
            </div>

            <button
              type="submit"
              disabled={detailsSaving}
              className="btn-primary mt-6 w-full"
            >
              {detailsSaving ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>
      )}
    </AdminLayout>
  );
}

const inputClass =
  "mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15";
