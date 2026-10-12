import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  BookX,
  CheckCircle2,
  ChevronLeft,
  Lightbulb,
  Lock,
  PartyPopper,
  Timer,
  Trophy,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
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

export default function StudyPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
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
  const [showResults, setShowResults] = useState(false);
  const [sectionComplete, setSectionComplete] = useState<OutlineSection | null>(
    null,
  );

  const [secondsLeft, setSecondsLeft] = useState(OBJECTIVE_SECONDS);
  const questionStartRef = useRef(Date.now());

  const question = questions[currentIndex];
  const totalSubmitted = Object.keys(sessionResults).length;
  const totalCorrect = Object.values(sessionResults).filter(
    (r) => r === "correct" || r === "applied",
  ).length;

  useEffect(() => {
    async function load() {
      if (!courseId || !user) return;
      setLoading(true);

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

      const [
        { data: questionRows },
        { data: outlineRows },
        { data: progress },
      ] = await Promise.all([
        supabase
          .from("questions")
          .select("id, type, prompt, expected_answer, explanation, sort_order")
          .eq("course_id", courseId)
          .eq("status", "active")
          .order("sort_order"),
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
      setOutline(outlineRows ?? []);

      // A "Jump to question N" or "Resume session" link from CourseDetail carries an explicit
      // ?start= — honor it over study_progress (even past a completed run), since the student
      // deliberately chose this starting point rather than asking to continue where they left
      // off or see their last result.
      const startParam = Number(searchParams.get("start"));
      const total = questionRows?.length ?? 0;
      if (Number.isInteger(startParam) && startParam >= 1 && total > 0) {
        setCurrentIndex(Math.min(startParam - 1, total - 1));
      } else if (progress?.completed) {
        setShowResults(true);
      } else if (progress) {
        setCurrentIndex(Math.min(progress.current_order, Math.max(total - 1, 0)));
      }
      setLoading(false);
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

    const isLast = currentIndex === questions.length - 1;
    const nextOrder = currentIndex + 1;

    // Local calendar date, not UTC — record_question_attempt() stamps daily_practice_stats
    // with this, and the Dashboard's 7-day chart is built from the browser's local dates too;
    // using the server's default (UTC) current_date here could shift late-day sessions onto
    // the "wrong" day for students outside UTC.
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

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
        p_practice_date: localDate,
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

  function handleNext() {
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
    advance();
  }

  function advance() {
    setCurrentIndex((i) => i + 1);
    setSelectedOptionId(null);
    setSubmitted(false);
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

  if (accessDenied) {
    return (
      <Layout
        title="Restricted"
        onBack={() => navigate(`/courses/${courseId}`)}
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
        onBack={() => navigate(`/courses/${courseId}`)}
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
        onBack={() => navigate(`/courses/${courseId}`)}
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
              onClick={() => navigate(`/courses/${courseId}`)}
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
        onBack={() => navigate(`/courses/${courseId}`)}
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
              onClick={() => navigate(`/courses/${courseId}`)}
              className="btn-outline flex-1"
            >
              Outline
            </button>
            <button
              onClick={() => (isLastSection ? setShowResults(true) : advance())}
              className="btn-primary flex-1"
            >
              {isLastSection ? "Final results" : "Next section"}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Dark "protocol" header, matching the old app's immersive quiz chrome — distinct from
          the rest of this app's light Layout, deliberately, only for the live question view. */}
      <header className="sticky top-0 z-20 bg-navy px-4 py-3 text-white md:px-8">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            onClick={() => navigate(`/courses/${courseId}`)}
            className="shrink-0 rounded-full p-1.5 hover:bg-white/10"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {courseTitle}
              {activeSection ? ` — ${activeSection.title}` : ""}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gold">
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                secondsLeft <= 10
                  ? "animate-pulse bg-rose-500/90"
                  : "bg-white/10"
              }`}
            >
              <Timer size={12} />
              {secondsLeft}s
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">
              Score: {totalCorrect}
            </span>
          </div>
        </div>
        <div className="mx-auto mt-3 h-1 max-w-3xl overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-gold transition-all"
            style={{
              width: `${((currentIndex + 1) / questions.length) * 100}%`,
            }}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-8 md:px-8">
        <div className="mx-auto max-w-2xl">
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
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
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
                            ? "bg-emerald-500 text-white"
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
                        <CheckCircle2
                          size={16}
                          className="shrink-0 text-emerald-600"
                        />
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
                  <div className="diamond-gradient rounded-xl p-4 text-sm text-white">
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
                <p className="flex items-center gap-2 font-semibold">
                  <Lightbulb size={15} />
                  Explanation
                </p>
                <p className="mt-1 whitespace-pre-wrap text-white/90">
                  {question.explanation}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="sticky bottom-0 z-20 bg-navy px-4 py-3 text-white md:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button
            onClick={() => navigate(`/courses/${courseId}`)}
            className="flex items-center gap-2 text-left hover:opacity-80"
          >
            <ChevronLeft size={16} />
            <span>
              <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Session
              </span>
              <span className="block text-sm font-bold">Exit quiz</span>
            </span>
          </button>
          {!submitted ? (
            <button
              onClick={() => void handleSubmit(false)}
              disabled={question.type === "objective" && !selectedOptionId}
              className="rounded-full bg-gold px-6 py-2.5 text-sm font-bold text-navy transition-opacity disabled:opacity-40"
            >
              {question.type === "application" ? "Check answer" : "Submit"}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="rounded-full bg-gold px-6 py-2.5 text-sm font-bold text-navy"
            >
              {currentIndex === questions.length - 1 ? "Finish" : "Next"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
