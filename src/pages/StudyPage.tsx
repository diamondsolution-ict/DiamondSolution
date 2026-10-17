import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BookX,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Lock,
  PartyPopper,
  Timer,
  Trophy,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabasePaging";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { LoadingScreen } from "@/components/LoadingScreen";

type QuestionType = "objective" | "application";
type Result = "correct" | "incorrect" | "skipped" | "applied";

interface Option {
  id: string;
  label: string;
  body: string;
  is_correct: boolean;
}
interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  expected_answer: string | null;
  explanation: string | null;
  options: Option[];
}
interface OutlineSection {
  title: string;
  start_question_order: number;
  end_question_order: number;
}

const OBJECTIVE_SECONDS = 60;
const APPLICATION_SECONDS = 120;

// Local calendar date, not UTC — record_question_attempt()/add_study_duration() both stamp
// daily_practice_stats with this, and the Dashboard's 7-day chart is built from the browser's
// local dates too; the server's default (UTC) current_date could shift late-day sessions onto
// the "wrong" day for students outside UTC.
function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function StudyPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [outline, setOutline] = useState<OutlineSection[]>([]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [sessionResults, setSessionResults] = useState<Record<string, Result>>(
    {},
  );
  // Remembers which option was picked for each question answered this session, so stepping
  // back with "Previous" and then forward again restores the same view instead of a blank one.
  const [selectedByQuestion, setSelectedByQuestion] = useState<
    Record<string, string | null>
  >({});
  const [showResults, setShowResults] = useState(false);
  const [sectionComplete, setSectionComplete] = useState<OutlineSection | null>(
    null,
  );

  const [secondsLeft, setSecondsLeft] = useState(OBJECTIVE_SECONDS);
  const questionStartRef = useRef(Date.now());
  // Set the moment a FRESH submit happens (never on revisiting an already-answered question via
  // Previous), cleared by flushReadingTime() below. Lets the time between "I just submitted"
  // and "I clicked Next" — reading the explanation, while still on this page — count toward
  // study_duration_seconds, which record_question_attempt()'s own p_time_taken_seconds never
  // covered (that one stops the clock at Submit).
  const submittedAtRef = useRef<number | null>(null);

  const question = questions[currentIndex];
  const totalSubmitted = Object.keys(sessionResults).length;
  const totalCorrect = Object.values(sessionResults).filter(
    (r) => r === "correct" || r === "applied",
  ).length;

  useEffect(() => {
    async function load() {
      if (!courseId || !user) return;
      setLoading(true);
      setLoadError(null);

      try {
        const { data: courseRow } = await supabase
          .from("courses")
          .select("id, title, department_id")
          .eq("id", courseId)
          .single();
        if (!courseRow) {
          setLoading(false);
          return;
        }
        setCourseTitle(courseRow.title);

        // Admins read everything for free, matching has_department_access()'s own is_admin()
        // OR — the backend already allowed this; the paywall gate just didn't know to skip
        // itself for them.
        if (!isAdmin) {
          const { data: grant } = await supabase
            .from("access_grants")
            .select("department_id")
            .eq("user_id", user.id)
            .eq("department_id", courseRow.department_id)
            .maybeSingle();
          if (!grant) {
            setAccessDenied(true);
            setLoading(false);
            return;
          }
        }

        const [questionRowsUnsorted, { data: outlineRows }, { data: progress }] =
          await Promise.all([
            // Keyset-paginated — a plain .select() here silently caps at Supabase's 1000-row
            // default, which a large course's question count can exceed outright. Options come
            // embedded in the same query (a PostgREST foreign-table select, already used
            // elsewhere in this app) rather than a separate .in(questionIds) fetch — for a
            // course with hundreds of questions that .in() filter's URL grew large enough on
            // every single page request to risk failing outright, since it had to repeat the
            // full id list on every page, not just the first.
            fetchAllRows<{
              id: string;
              type: QuestionType;
              prompt: string;
              expected_answer: string | null;
              explanation: string | null;
              sort_order: number;
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
                  "id, type, prompt, expected_answer, explanation, sort_order, question_options(id, label, body, is_correct, sort_order)",
                )
                .eq("course_id", courseId)
                .eq("status", "active")
                .order("id")
                .limit(1000);
              if (after) q = q.gt("id", after);
              return q;
            }),
            supabase
              .from("course_outline_sections")
              .select("title, start_question_order, end_question_order")
              .eq("course_id", courseId)
              .order("sort_order"),
            supabase
              .from("study_progress")
              .select("current_order, completed")
              .eq("user_id", user.id)
              .eq("course_id", courseId)
              .maybeSingle(),
          ]);
        // fetchAllRows paginates by id for correctness, not display order — the quiz's own
        // question order comes from sort_order, applied here instead.
        const questionRows = [...questionRowsUnsorted].sort(
          (a, b) => a.sort_order - b.sort_order,
        );

        setQuestions(
          questionRows.map((q) => ({
            ...q,
            options: [...q.question_options].sort((a, b) => a.sort_order - b.sort_order),
          })),
        );
        setOutline(outlineRows ?? []);

        // A "Jump to question N" or "Resume session" link from CourseDetail carries an explicit
        // ?start= — honor it over study_progress (even past a completed run), since the student
        // deliberately chose this starting point rather than asking to continue where they left
        // off or see their last result.
        const startParam = Number(searchParams.get("start"));
        const total = questionRows.length;
        if (Number.isInteger(startParam) && startParam >= 1 && total > 0) {
          setCurrentIndex(Math.min(startParam - 1, total - 1));
        } else if (progress?.completed) {
          setShowResults(true);
        } else if (progress) {
          setCurrentIndex(Math.min(progress.current_order, Math.max(total - 1, 0)));
        }
      } catch (err) {
        // Previously unhandled — any failure here (a timeout, a bad response) left the loading
        // spinner showing forever with no error and no way out beside the header's back button.
        console.error("StudyPage load failed:", err);
        setLoadError(
          err instanceof Error ? err.message : "Something went wrong loading this course.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, user, isAdmin]);

  // Per-question timer
  useEffect(() => {
    if (!question || submitted || showResults) return;
    const limit =
      question.type === "application" ? APPLICATION_SECONDS : OBJECTIVE_SECONDS;
    setSecondsLeft(limit);
    questionStartRef.current = Date.now();

    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          void handleSubmit(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, question?.id, submitted, showResults]);

  const activeSection = useMemo(
    () =>
      outline.find(
        (s) =>
          currentIndex + 1 >= s.start_question_order &&
          currentIndex + 1 <= s.end_question_order,
      ),
    [outline, currentIndex],
  );

  async function handleSubmit(timedOut = false) {
    if (!question || submitted) return;
    const timeTaken = Math.round(
      (Date.now() - questionStartRef.current) / 1000,
    );

    let result: Result;
    if (question.type === "application") {
      result = timedOut && !selectedOptionId ? "skipped" : "applied";
    } else if (timedOut && !selectedOptionId) {
      result = "skipped";
    } else {
      const chosen = question.options.find((o) => o.id === selectedOptionId);
      result = chosen?.is_correct ? "correct" : "incorrect";
    }

    setSubmitted(true);
    setSessionResults((prev) => ({ ...prev, [question.id]: result }));
    setSelectedByQuestion((prev) => ({ ...prev, [question.id]: selectedOptionId }));
    // Starts the "reading the explanation" clock — stopped and reported by flushReadingTime()
    // once the student actually navigates away from this question.
    submittedAtRef.current = Date.now();

    const isLast = currentIndex === questions.length - 1;
    const nextOrder = currentIndex + 1;

    const { error: attemptError } = await supabase.rpc(
      "record_question_attempt",
      {
        p_course_id: courseId,
        p_question_id: question.id,
        p_selected_option_id:
          question.type === "objective" ? selectedOptionId : null,
        p_result: result,
        p_time_taken_seconds: timeTaken,
        p_current_order: nextOrder,
        p_completed: isLast,
        p_practice_date: localDateString(),
      },
    );
    // Never block the quiz UI on this — the question is already answered and the local
    // session state above already reflects it. But this previously failed completely
    // silently, so a real failure here (bad param, network blip) left daily_practice_stats
    // permanently missing that attempt with no way to tell. Logging it is the minimum fix;
    // worth revisiting with a retry or a subtle "not synced" indicator if it recurs.
    if (attemptError) {
      console.error("record_question_attempt failed:", attemptError);
    }
  }

  // Reports time spent on this question AFTER submitting (reading the explanation/expected
  // answer) as extra study_duration_seconds, separately from record_question_attempt()'s own
  // p_time_taken_seconds (which only covers up to the Submit click). Fire-and-forget, same as
  // record_question_attempt's own error handling — never blocks navigation. A no-op when the
  // question being left was only being revisited (Previous into an already-answered question),
  // since submittedAtRef is only ever set by a fresh handleSubmit, not by goToIndex.
  function flushReadingTime() {
    if (submittedAtRef.current === null) return;
    const elapsed = Math.round((Date.now() - submittedAtRef.current) / 1000);
    submittedAtRef.current = null;
    if (elapsed <= 0) return;
    void supabase
      .rpc("add_study_duration", {
        p_seconds: elapsed,
        p_practice_date: localDateString(),
      })
      .then(({ error }) => {
        if (error) console.error("add_study_duration failed:", error);
      });
  }

  function handleNext() {
    flushReadingTime();
    const isLast = currentIndex === questions.length - 1;
    const reachedSectionEnd =
      activeSection && currentIndex + 1 === activeSection.end_question_order;

    if (isLast) {
      setShowResults(true);
      return;
    }
    if (reachedSectionEnd) {
      setSectionComplete(activeSection);
      return;
    }
    goToIndex(currentIndex + 1);
  }

  function handlePrevious() {
    if (currentIndex === 0) return;
    flushReadingTime();
    goToIndex(currentIndex - 1);
  }

  // Already answered this session (sessionResults has it) → restore that view read-only
  // instead of a blank unanswered question, so stepping back and forward again doesn't lose
  // what was picked. Not-yet-answered → fresh/unanswered as usual.
  function goToIndex(i: number) {
    const target = questions[i];
    const alreadyAnswered = !!target && sessionResults[target.id] !== undefined;
    setCurrentIndex(i);
    setSelectedOptionId(alreadyAnswered ? (selectedByQuestion[target.id] ?? null) : null);
    setSubmitted(alreadyAnswered);
    setSectionComplete(null);
  }

  async function handleResync() {
    await supabase.rpc("reset_study_progress", { p_course_id: courseId });
    window.location.reload();
  }

  if (loading) {
    return (
      <Layout title="Studying" onBack={() => navigate(-1)}>
        <LoadingScreen />
      </Layout>
    );
  }

  if (loadError) {
    return (
      <Layout title="Studying" onBack={() => navigate(-1)}>
        <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
            <AlertTriangle size={22} className="text-rose-500" />
          </div>
          <p className="text-sm font-semibold text-text-1">
            Couldn't load this course
          </p>
          <p className="text-sm text-text-3">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary mt-2"
          >
            Retry
          </button>
        </div>
      </Layout>
    );
  }

  if (accessDenied) {
    return (
      <Layout
        title="Restricted"
        onBack={() => navigate(-1)}
      >
        <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
            <Lock size={22} className="text-rose-500" />
          </div>
          <p className="text-sm text-text-3">
            You don't have access to this course.
          </p>
        </div>
      </Layout>
    );
  }

  if (questions.length === 0) {
    return (
      <Layout
        title={courseTitle}
        onBack={() => navigate(-1)}
      >
        <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
          <BookX size={28} className="text-text-3" />
          <p className="text-sm text-text-3">
            No study content available for this course yet.
          </p>
        </div>
      </Layout>
    );
  }

  if (showResults) {
    const pct =
      totalSubmitted > 0
        ? Math.round((totalCorrect / totalSubmitted) * 100)
        : 0;
    return (
      <Layout
        title={courseTitle}
        onBack={() => navigate(-1)}
      >
        <div className="card-luxury p-8 text-center">
          <div className="diamond-gradient mx-auto flex h-14 w-14 items-center justify-center rounded-full">
            <Trophy size={26} className="text-white" />
          </div>
          <h2 className="mt-4 font-heading text-2xl font-bold text-text-1">
            {totalCorrect} / {totalSubmitted || questions.length}
          </h2>
          <p className="mt-1 text-sm text-text-3">{pct}% compliance</p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-canvas-soft">
            <div
              className="h-full bg-royal transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => void handleResync()}
              className="btn-outline flex-1"
            >
              Re-sync
            </button>
            <button
              onClick={() => navigate(-1)}
              className="btn-primary flex-1"
            >
              Exit
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (sectionComplete) {
    const sectionEntries = Object.entries(sessionResults).slice(
      -(
        sectionComplete.end_question_order -
        sectionComplete.start_question_order +
        1
      ),
    );
    const sectionCorrect = sectionEntries.filter(
      ([, r]) => r === "correct" || r === "applied",
    ).length;
    const sectionPct =
      sectionEntries.length > 0
        ? Math.round((sectionCorrect / sectionEntries.length) * 100)
        : 0;
    const message =
      sectionPct >= 90
        ? "Outstanding mastery."
        : sectionPct >= 70
          ? "Solid progress."
          : "Keep going.";
    const isLastSection =
      outline[outline.length - 1]?.title === sectionComplete.title;

    return (
      <Layout
        title={courseTitle}
        onBack={() => navigate(-1)}
      >
        <div className="card-luxury p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <PartyPopper size={24} className="text-emerald-600" />
          </div>
          <h2 className="mt-4 font-heading text-lg font-bold text-text-1">
            Section complete
          </h2>
          <p className="mt-1 text-sm text-text-3">{sectionComplete.title}</p>
          <p className="mt-4 font-heading text-3xl font-bold text-royal">
            {sectionPct}%
          </p>
          <p className="mt-1 text-sm text-text-3">{message}</p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => navigate(-1)}
              className="btn-outline flex-1"
            >
              Outline
            </button>
            <button
              onClick={() => (isLastSection ? setShowResults(true) : goToIndex(currentIndex + 1))}
              className="btn-primary flex-1"
            >
              {isLastSection ? "Final results" : "Next section"}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const progressPct = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-canvas-soft pb-28">
      <header className="sticky top-0 z-10 bg-navy text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => {
              flushReadingTime();
              navigate(-1);
            }}
            aria-label="Go back"
            className="rounded-full p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {activeSection ? activeSection.title : courseTitle}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
              secondsLeft <= 10
                ? "animate-pulse bg-rose-500/20 text-rose-300"
                : "bg-white/10 text-slate-200"
            }`}
          >
            <Timer size={12} />
            {secondsLeft}s
          </span>
          <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-gold">
            Score: {totalCorrect}
          </span>
        </div>
        <div className="h-1 w-full bg-white/10">
          <div
            className="h-full bg-gold transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        <div className="card-luxury p-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-3">
            Archive query · {question.type === "objective" ? "MCQ" : "Application"}
          </p>
          <p className="mt-2 whitespace-pre-wrap font-medium text-text-1">
            {question.prompt}
          </p>

          {question.type === "objective" ? (
            <div className="mt-4 space-y-2">
              {question.options.map((opt) => {
                const isSelected = selectedOptionId === opt.id;
                const showCorrect = submitted && opt.is_correct;
                const showWrong = submitted && isSelected && !opt.is_correct;
                return (
                  <button
                    key={opt.id}
                    disabled={submitted}
                    onClick={() => setSelectedOptionId(opt.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      showCorrect
                        ? "border-royal bg-royal-soft text-royal"
                        : showWrong
                          ? "border-rose-400 bg-rose-50 text-rose-800"
                          : isSelected
                            ? "border-royal bg-royal-soft text-royal"
                            : submitted
                              ? "border-canvas-border opacity-50"
                              : "border-canvas-border hover:border-royal/40"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        showCorrect
                          ? "bg-royal text-white"
                          : showWrong
                            ? "bg-rose-500 text-white"
                            : isSelected
                              ? "bg-royal text-white"
                              : "bg-canvas-soft text-text-2"
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap">
                      {opt.body}
                    </span>
                    {showCorrect && (
                      <CheckCircle2 size={16} className="shrink-0 text-royal" />
                    )}
                    {showWrong && (
                      <XCircle size={16} className="shrink-0 text-rose-600" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-4">
              {submitted && (
                <div className="rounded-xl bg-navy p-4 text-sm text-white">
                  <p className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 size={15} />
                    Expected response
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-white/90">
                    {question.expected_answer || "No expected answer recorded."}
                  </p>
                </div>
              )}
            </div>
          )}

          {submitted && question.explanation && (
            <div className="mt-4 rounded-xl bg-navy p-4 text-sm text-white">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gold">
                <Lightbulb size={15} />
                Explanation
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-white/90">
                {question.explanation}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            flushReadingTime();
            navigate(-1);
          }}
          className="mx-auto mt-4 block text-xs font-semibold text-text-3 hover:text-text-1 hover:underline"
        >
          Exit quiz
        </button>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-10 bg-navy text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              aria-label="Previous question"
              className="shrink-0 rounded-full p-1.5 text-slate-300 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Protocol status
              </span>
              <span className="block truncate text-xs font-bold text-gold">
                {submitted ? "Synthesis complete" : "Awaiting response"}
              </span>
            </span>
          </div>

          {!submitted ? (
            <button
              onClick={() => void handleSubmit(false)}
              disabled={question.type === "objective" && !selectedOptionId}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-navy transition-all hover:bg-gold-light active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
            >
              {question.type === "application" ? "Check answer" : "Submit"}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-navy transition-all hover:bg-gold-light active:scale-[0.98]"
            >
              {currentIndex === questions.length - 1 ? "Finish" : "Next"}
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
