import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FilePlus,
  FileQuestion,
  ListTree,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";
import { LoadingScreen } from "@/components/LoadingScreen";
import { parseCSV, downloadCSV } from "@/lib/csv";

interface Course {
  id: string;
  title: string;
  default_question_type: "objective" | "application";
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

export default function AdminQuestions() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<"objective" | "application">("objective");
  const [prompt, setPrompt] = useState("");
  const [explanation, setExplanation] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

    const { data: courseRow } = await supabase
      .from("courses")
      .select("id, title, default_question_type")
      .eq("id", courseId)
      .single();
    setCourse(courseRow);
    if (courseRow) setType(courseRow.default_question_type);

    const { data: questionRows } = await supabase
      .from("questions")
      .select("id, type, prompt, expected_answer, explanation, sort_order")
      .eq("course_id", courseId)
      .eq("status", "active")
      .order("sort_order");

    const questionIds = (questionRows ?? []).map((q) => q.id);
    const { data: optionRows } =
      questionIds.length > 0
        ? await supabase
            .from("question_options")
            .select("id, question_id, label, body, is_correct")
            .in("question_id", questionIds)
            .order("sort_order")
        : { data: [] };

    setQuestions(
      (questionRows ?? []).map((q) => ({
        ...q,
        options: (optionRows ?? []).filter((o) => o.question_id === q.id),
      })),
    );

    const { data: outlineRows } = await supabase
      .from("course_outline_sections")
      .select("id, title, start_question_order, end_question_order, sort_order")
      .eq("course_id", courseId)
      .order("sort_order");
    setOutline(outlineRows ?? []);

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  function resetForm() {
    setEditingId(null);
    setType(course?.default_question_type ?? "objective");
    setPrompt("");
    setExplanation("");
    setExpectedAnswer("");
    setOptions(["", "", "", ""]);
    setCorrectIndex(0);
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
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            sort_order: questions.length,
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

  async function handleRemove(id: string) {
    if (editingId === id) resetForm();
    await supabase
      .from("questions")
      .update({ status: "trashed", deleted_at: new Date().toISOString() })
      .eq("id", id);
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
    setOutlineEnd(String(questions.length));
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
    if (end > questions.length) {
      setOutlineError(
        `This course only has ${questions.length} question(s) — end can't exceed that.`,
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
    if (!course || questions.length === 0) return;
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
    const rows = questions.map((q) => {
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
    let nextOrder = questions.length;

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

  if (!course && !loading) {
    return (
      <AdminLayout>
        <p className="text-sm text-text-3">Course not found.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="font-heading text-2xl font-bold text-text-1">
        Questions — {course?.title}
      </h1>
      <p className="mt-1 text-sm text-text-3">
        {questions.length} active question(s)
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={downloadTemplate}
          className="btn-outline flex items-center gap-1.5 text-sm"
        >
          <Download size={14} />
          Download template
        </button>
        <button
          onClick={handleExport}
          disabled={questions.length === 0}
          className="btn-outline flex items-center gap-1.5 text-sm disabled:opacity-50"
        >
          <Download size={14} />
          Export CSV
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <Upload size={14} />
          {importing ? "Importing…" : "Import CSV"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(e) => void handleImport(e)}
          className="hidden"
        />
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmitForm}
        className="card-luxury mt-6 space-y-4 p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-text-1">
            {editingId ? (
              <Pencil size={17} className="text-royal" />
            ) : (
              <FilePlus size={17} className="text-royal" />
            )}
            {editingId ? "Edit question" : "Add question"}
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

        <div>
          <label className="block text-sm font-medium text-text-2">Type</label>
          <select
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

        <div>
          <label className="block text-sm font-medium text-text-2">
            Question
          </label>
          <textarea
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className={inputClass}
            rows={3}
          />
        </div>

        {type === "objective" ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-2">
              Options (select the correct one)
            </label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={correctIndex === i}
                  onChange={() => setCorrectIndex(i)}
                  className="h-4 w-4 accent-[#1B3FA0]"
                />
                <span className="w-5 text-sm font-semibold text-text-3">
                  {OPTION_LABELS[i]}
                </span>
                <input
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
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-text-2">
              Expected answer
            </label>
            <textarea
              value={expectedAnswer}
              onChange={(e) => setExpectedAnswer(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-text-2">
            Explanation (optional)
          </label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className={inputClass}
            rows={2}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary flex items-center gap-2"
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

      <div className="mt-8 space-y-3">
        {loading ? (
          <LoadingScreen />
        ) : questions.length === 0 ? (
          <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
            <FileQuestion size={28} className="text-text-3" />
            <p className="text-sm text-text-3">
              No questions yet — add one above.
            </p>
          </div>
        ) : (
          questions.map((q, i) => (
            <div
              key={q.id}
              className={`card-luxury p-4 ${editingId === q.id ? "ring-2 ring-royal" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="whitespace-pre-wrap text-sm font-medium text-text-1">
                    {i + 1}. {q.prompt}
                  </p>
                  {q.explanation === PLACEHOLDER_MARKER && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      <AlertTriangle size={10} />
                      Placeholder — not real content
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => startEdit(q)}
                    className="flex items-center gap-1 text-xs font-semibold text-royal hover:underline"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button
                    onClick={() => void handleRemove(q.id)}
                    className="flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline"
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                </div>
              </div>
              {q.type === "objective" ? (
                <ul className="mt-2 space-y-1 text-sm text-text-3">
                  {q.options.map((o) => (
                    <li
                      key={o.id}
                      className={`flex items-start gap-1.5 whitespace-pre-wrap ${o.is_correct ? "font-semibold text-royal" : ""}`}
                    >
                      {o.is_correct && (
                        <CheckCircle2
                          size={13}
                          className="mt-0.5 shrink-0 text-royal"
                        />
                      )}
                      <span>
                        {o.label}. {o.body}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm text-text-3">
                  Expected: {q.expected_answer}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card-luxury mt-8 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-base font-bold text-text-1">
              <ListTree size={17} className="text-royal" />
              Course outline
            </h2>
            <p className="mt-1 text-sm text-text-3">
              Breaks the {questions.length} question(s) above into named
              sections — shown to students on the course page, and triggers
              the "section complete" checkpoint mid-quiz.
            </p>
          </div>
          {!showOutlineForm && (
            <button
              onClick={startAddOutline}
              disabled={questions.length === 0}
              className="btn-secondary flex shrink-0 items-center gap-1.5 text-sm disabled:opacity-50"
            >
              <Plus size={14} />
              Add section
            </button>
          )}
        </div>

        {questions.length === 0 && (
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
                  max={questions.length}
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
                  max={questions.length}
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
    </AdminLayout>
  );
}

const inputClass =
  "mt-1 w-full rounded-xl border border-canvas-border bg-white px-3 py-2.5 text-sm text-text-1 transition-colors focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15";
