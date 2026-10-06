import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";

interface Department {
  id: string;
  name: string;
}
interface Course {
  id: string;
  title: string;
  department_id: string;
  level_label: string;
}

export default function AdminQuestionsBrowser() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: deptRows }, { data: courseRows }] = await Promise.all([
        supabase.from("departments").select("id, name").order("name"),
        supabase
          .from("courses")
          .select("id, title, department_id, department_levels ( label )")
          .is("deleted_at", null)
          .order("title"),
      ]);
      setDepartments(deptRows ?? []);
      setCourses(
        ((courseRows ?? []) as unknown as (Course & {
          department_levels: { label: string } | null;
        })[]).map((c) => ({
          id: c.id,
          title: c.title,
          department_id: c.department_id,
          level_label: c.department_levels?.label ?? "",
        })),
      );
      setLoading(false);
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      if (departmentId && c.department_id !== departmentId) return false;
      if (q && !c.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [courses, departmentId, search]);

  return (
    <AdminLayout>
      <h1 className="font-heading text-2xl font-bold text-text-1">
        Questions
      </h1>
      <p className="mt-1 text-sm text-text-3">
        Browse by department, then pick a course to manage its questions.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="rounded-xl border border-canvas-border bg-white px-3 py-2 text-sm text-text-1"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Search series/courses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[240px] flex-1 rounded-xl border border-canvas-border bg-white px-3 py-2 text-sm text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
        />
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-text-3">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-text-3">No courses match.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/admin/courses/${c.id}/questions`)}
              className="rounded-xl border border-canvas-border bg-white px-3 py-2 text-xs font-semibold text-text-2 transition-colors hover:border-royal/40 hover:bg-royal-soft hover:text-royal"
            >
              {c.title}
              {c.level_label && (
                <span className="ml-1.5 text-text-3">({c.level_label})</span>
              )}
            </button>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
