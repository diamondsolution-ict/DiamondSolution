import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/AdminLayout";
import { ImageUpload } from "@/components/ImageUpload";

type SubTab = "departments" | "courses";

interface DeptRow {
  id: string;
  name: string;
  image_path: string | null;
}
interface CourseRow {
  id: string;
  title: string;
  image_path: string | null;
  department_id: string;
  level_label: string;
}

export default function AdminMedia() {
  const [subTab, setSubTab] = useState<SubTab>("departments");
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: deptRows }, { data: courseRows }] = await Promise.all([
      supabase
        .from("departments")
        .select("id, name, image_path")
        .order("name"),
      supabase
        .from("courses")
        .select("id, title, image_path, department_id, department_levels ( label )")
        .is("deleted_at", null)
        .order("title"),
    ]);
    setDepartments(deptRows ?? []);
    setCourses(
      ((courseRows ?? []) as unknown as (CourseRow & {
        department_levels: { label: string } | null;
      })[]).map((c) => ({
        id: c.id,
        title: c.title,
        image_path: c.image_path,
        department_id: c.department_id,
        level_label: c.department_levels?.label ?? "",
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function setDeptImage(id: string, path: string | null) {
    setDepartments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, image_path: path } : d)),
    );
    await supabase.from("departments").update({ image_path: path }).eq("id", id);
  }

  async function setCourseImage(id: string, path: string | null) {
    setCourses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, image_path: path } : c)),
    );
    await supabase.from("courses").update({ image_path: path }).eq("id", id);
  }

  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => d.name.toLowerCase().includes(q));
  }, [departments, search]);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => c.title.toLowerCase().includes(q));
  }, [courses, search]);

  return (
    <AdminLayout>
      <div className="diamond-gradient card-luxury p-6 text-white">
        <span className="badge-gold">Media &amp; Visual Assets Hub</span>
        <h1 className="mt-2 font-heading text-xl font-bold">
          Department &amp; Course Picture Manager
        </h1>
        <p className="mt-1 max-w-xl text-sm text-white/80">
          Upload pictures displayed on each Department and Course card across
          the student dashboard.
        </p>
      </div>

      <div className="mt-4 inline-flex rounded-xl border border-canvas-border bg-white p-1">
        {(["departments", "courses"] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
              subTab === t ? "bg-royal text-white" : "text-text-3"
            }`}
          >
            {t === "departments"
              ? `Departments (${departments.length})`
              : `Courses (${courses.length})`}
          </button>
        ))}
      </div>

      <input
        placeholder={`Search ${subTab}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-4 w-full max-w-sm rounded-xl border border-canvas-border bg-white px-3 py-2 text-sm text-text-1 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15"
      />

      {loading ? (
        <p className="mt-4 text-sm text-text-3">Loading…</p>
      ) : subTab === "departments" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDepartments.map((d) => (
            <div key={d.id} className="card-luxury p-4">
              <p className="font-heading text-sm font-bold text-text-1">
                {d.name}
              </p>
              <div className="mt-2">
                <ImageUpload
                  currentPath={d.image_path}
                  folder="departments"
                  entityId={d.id}
                  onUploaded={(path) => void setDeptImage(d.id, path)}
                  onRemoved={() => void setDeptImage(d.id, null)}
                />
              </div>
            </div>
          ))}
          {filteredDepartments.length === 0 && (
            <p className="text-sm text-text-3">No departments match.</p>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map((c) => (
            <div key={c.id} className="card-luxury p-4">
              <p className="font-heading text-sm font-bold text-text-1">
                {c.title}
              </p>
              <p className="text-xs text-text-3">{c.level_label}</p>
              <div className="mt-2">
                <ImageUpload
                  currentPath={c.image_path}
                  folder="courses"
                  entityId={c.id}
                  onUploaded={(path) => void setCourseImage(c.id, path)}
                  onRemoved={() => void setCourseImage(c.id, null)}
                />
              </div>
            </div>
          ))}
          {filteredCourses.length === 0 && (
            <p className="text-sm text-text-3">No courses match.</p>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
