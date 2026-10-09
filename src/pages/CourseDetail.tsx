import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BookOpen, FileQuestion, Lock, PlayCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";

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

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [outline, setOutline] = useState<OutlineSection[]>([]);
  const [meta, setMeta] = useState<Counts | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
          .select("department_id")
          .eq("user_id", user.id)
          .eq("department_id", courseRow.department_id)
          .maybeSingle(),
      ]);

      setMeta({
        departmentName: dept?.name ?? "",
        levelLabel: level?.label ?? "",
        questionCount: count ?? 0,
      });
      setOutline(outlineRows ?? []);
      // Admins read everything for free, matching has_department_access()'s own is_admin() OR
      // — the backend already allowed this; the paywall UI just didn't know to skip itself.
      setHasAccess(isAdmin || !!grant);
      setLoading(false);
    }
    void load();
  }, [id, user, isAdmin]);

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
        <p className="text-sm text-text-3">Loading…</p>
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

      <div className="mt-4 flex gap-2">
        <span className="badge-gold">{meta?.departmentName}</span>
        <span className="badge-royal">{meta?.levelLabel}</span>
      </div>

      <blockquote className="mt-4 border-l-2 border-canvas-border pl-4 text-sm text-text-2">
        {course.description ||
          "Practice questions for this course, reviewed by the academic team."}
      </blockquote>

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
          <button
            onClick={() => navigate(`/courses/${course.id}/study`)}
            disabled={!meta?.questionCount}
            className="btn-gold mt-4 flex w-full items-center justify-center gap-2 disabled:opacity-50"
          >
            <PlayCircle size={16} />
            {meta?.questionCount ? "Start studying" : "No questions yet"}
          </button>
        </div>
      )}

      <div className="mt-8">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold text-text-1">
          <BookOpen size={16} className="text-royal" />
          Course outline
        </h2>
        {outline.length === 0 ? (
          <p className="mt-2 text-sm text-text-3">
            No outline published for this course yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {outline.map((section, i) => (
              <li
                key={section.id}
                className="card-luxury flex items-center gap-3 p-3 text-sm text-text-2"
              >
                <span className="badge-royal flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-0">
                  {i + 1}
                </span>
                <span>
                  {section.title}{" "}
                  <span className="text-text-3">
                    (Q{section.start_question_order}–
                    {section.end_question_order})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
