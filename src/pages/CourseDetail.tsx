import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Award,
  BookOpen,
  FileQuestion,
  Lock,
  PlayCircle,
  Share2,
  ShieldCheck,
  Target,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { LoadingScreen } from "@/components/LoadingScreen";
import { describeAccessStatus } from "@/lib/accessDuration";

interface Course {
  id: string;
  title: string;
  description: string | null;
  department_id: string;
  level_id: string;
  image_path: string | null;
}
interface OutlineSection {
  id: string;
  title: string;
  start_question_order: number;
  end_question_order: number;
}
interface Counts {
  departmentName: string;
  levelLabel: string;
  questionCount: number;
}
interface Progress {
  current_order: number;
  completed: boolean;
}

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, isModerator } = useAuth();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [outline, setOutline] = useState<OutlineSection[]>([]);
  const [meta, setMeta] = useState<Counts | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [grantExpiresAt, setGrantExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [jumpToQn, setJumpToQn] = useState("");
  const [jumpError, setJumpError] = useState("");

  useEffect(() => {
    async function load() {
      if (!id || !user) return;
      setLoading(true);

      const { data: courseRow } = await supabase
        .from("courses")
        .select("id, title, description, department_id, level_id, image_path")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!courseRow) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCourse(courseRow);

      const [
        { data: dept },
        { data: level },
        { count },
        { data: outlineRows },
        { data: grant },
        { data: progressRow },
      ] = await Promise.all([
        supabase
          .from("departments")
          .select("name")
          .eq("id", courseRow.department_id)
          .single(),
        supabase
          .from("department_levels")
          .select("label")
          .eq("id", courseRow.level_id)
          .single(),
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("course_id", id)
          .eq("status", "active"),
        supabase
          .from("course_outline_sections")
          .select("id, title, start_question_order, end_question_order")
          .eq("course_id", id)
          .order("sort_order"),
        supabase
          .from("access_grants")
          .select("department_id, expires_at")
          .eq("user_id", user.id)
          .eq("department_id", courseRow.department_id)
          .maybeSingle(),
        supabase
          .from("study_progress")
          .select("current_order, completed")
          .eq("user_id", user.id)
          .eq("course_id", id)
          .maybeSingle(),
      ]);

      setMeta({
        departmentName: dept?.name ?? "",
        levelLabel: level?.label ?? "",
        questionCount: count ?? 0,
      });
      setOutline(outlineRows ?? []);
      setProgress(progressRow ?? null);
      // Staff read everything for free, matching has_department_access()'s own
      // is_moderator_or_admin() OR — the backend already allowed this; the paywall UI just
      // didn't know to skip itself.
      setHasAccess(isAdmin || isModerator || !!grant);
      setGrantExpiresAt(grant?.expires_at ?? null);
      setLoading(false);
    }
    void load();
  }, [id, user, isAdmin, isModerator]);

  function handleJump() {
    const n = Number(jumpToQn);
    const total = meta?.questionCount ?? 0;
    if (!Number.isInteger(n) || n < 1 || n > total) {
      setJumpError(`Enter a number between 1 and ${total}.`);
      return;
    }
    setJumpError("");
    navigate(`/courses/${id}/study?start=${n}`);
  }

  if (notFound) {
    return (
      <Layout title="Not found" onBack={() => navigate("/courses")}>
        <p className="text-sm text-text-3">
          This course doesn't exist or has been removed.
        </p>
      </Layout>
    );
  }

  if (loading || !course) {
    return (
      <Layout title="Course" onBack={() => navigate("/courses")}>
        <LoadingScreen />
      </Layout>
    );
  }

  const courseImageUrl = course.image_path
    ? supabase.storage.from("media").getPublicUrl(course.image_path).data
        .publicUrl
    : null;

  return (
    <Layout title={course.title} onBack={() => navigate(-1)}>
      {courseImageUrl ? (
        <div className="h-36 w-full overflow-hidden rounded-2xl">
          <img
            src={courseImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="diamond-gradient flex h-24 w-full items-center justify-center rounded-2xl">
          <BookOpen size={32} className="text-white/40" />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="badge-gold">{meta?.departmentName}</span>
        {meta?.levelLabel && (
          <span className="badge-royal">{meta.levelLabel} Level</span>
        )}
      </div>

      <h1 className="mt-3 font-heading text-2xl font-bold text-text-1">
        {course.title}
      </h1>

      <blockquote className="mt-3 border-l-2 border-gold pl-4 text-sm italic text-text-2">
        {course.description ||
          "Practice questions for this course, reviewed by the academic team."}
      </blockquote>

      <div className="mt-6 grid grid-cols-3 divide-x divide-canvas-border border-y border-canvas-border py-4 text-center">
        {[
          { icon: Award, label: "Status", value: "Institutional" },
          { icon: ShieldCheck, label: "Security", value: "Encrypted" },
          { icon: Share2, label: "Endowment", value: "25% Yield" },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col items-center gap-1.5 px-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-royal-soft">
              <Icon size={16} className="text-royal" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-3">
              {label}
            </span>
            <span className="text-sm font-bold text-text-1">{value}</span>
          </div>
        ))}
      </div>

      {!hasAccess ? (
        <div className="card-luxury mt-6 flex flex-col items-center gap-2 p-6 text-center">
          <Lock size={24} className="text-text-3" />
          <p className="text-sm text-text-3">
            You need access to {meta?.departmentName} to study this course.
          </p>
          <button
            onClick={() =>
              navigate(`/courses?department=${course.department_id}`)
            }
            className="btn-primary mt-2 w-full"
          >
            Go to department
          </button>
        </div>
      ) : (
        <div className="diamond-gradient card-luxury mt-6 p-6 text-white">
          <p className="flex items-center gap-1.5 text-sm text-white/80">
            <FileQuestion size={15} />
            {meta?.questionCount} question(s) available
          </p>

          {meta?.questionCount ? (
            <>
              <p className="mt-5 text-[11px] font-bold uppercase tracking-widest text-gold">
                Protocol launch configurations
              </p>

              {progress && !progress.completed && progress.current_order > 0 && (
                <button
                  onClick={() =>
                    navigate(`/courses/${course.id}/study?start=${progress.current_order + 1}`)
                  }
                  className="mt-3 flex w-full items-center gap-3 rounded-xl bg-white/10 p-3 text-left transition-colors hover:bg-white/15"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-navy">
                    <PlayCircle size={18} />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">Resume session</span>
                    <span className="block text-xs text-white/70">
                      Continue from question {progress.current_order + 1}
                    </span>
                  </span>
                </button>
              )}

              <div className="mt-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Custom start question number (1 – {meta.questionCount})
                </label>
                <input
                  type="number"
                  min={1}
                  max={meta.questionCount}
                  value={jumpToQn}
                  onChange={(e) => {
                    setJumpToQn(e.target.value);
                    setJumpError("");
                  }}
                  placeholder={`e.g. ${Math.min(5, meta.questionCount)}`}
                  className="mt-1.5 w-full rounded-lg bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-gold"
                />
                {jumpError && (
                  <p className="mt-1 text-xs text-rose-200">{jumpError}</p>
                )}
              </div>
              <button
                onClick={handleJump}
                className="btn-gold mt-3 flex w-full items-center justify-center gap-2"
              >
                <Target size={16} />
                Jump to Qn
              </button>

              <button
                onClick={() => navigate(`/courses/${course.id}/study`)}
                className="mt-3 w-full text-center text-xs font-bold uppercase tracking-widest text-white/60 hover:text-white/90"
              >
                {progress && progress.current_order > 0
                  ? "Or start over from question 1"
                  : "Start studying →"}
              </button>
            </>
          ) : (
            <button
              disabled
              className="btn-gold mt-4 flex w-full items-center justify-center gap-2 disabled:opacity-50"
            >
              <PlayCircle size={16} />
              No questions yet
            </button>
          )}
        </div>
      )}
      {hasAccess && !!meta?.questionCount && (
        <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-text-3">
          {isAdmin || isModerator
            ? "Lifetime access"
            : describeAccessStatus(grantExpiresAt)}{" "}
          ·
          One-time payment · Secured transaction
        </p>
      )}

      <div className="mt-8">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-widest text-text-1">
          <BookOpen size={16} className="text-royal" />
          Academic objectives
        </h2>
        {outline.length === 0 ? (
          <p className="mt-2 text-sm text-text-3">
            No outline published for this course yet.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {outline.map((section) => (
              <button
                key={section.id}
                onClick={() =>
                  hasAccess &&
                  navigate(`/courses/${course.id}/study?start=${section.start_question_order}`)
                }
                disabled={!hasAccess}
                className="diamond-gradient flex w-full items-center gap-2.5 rounded-2xl p-3.5 text-left text-white shadow-md transition-transform disabled:opacity-60 enabled:hover:scale-[1.01]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <PlayCircle size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold leading-snug">
                    {section.title}: Q{section.start_question_order}–
                    {section.end_question_order}
                  </span>
                  <span className="mt-1 block text-[9px] font-bold uppercase tracking-widest text-gold">
                    {hasAccess ? "Click to launch section" : "Requires access"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
