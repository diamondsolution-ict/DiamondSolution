import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { Crown, Medal, Target, Trophy, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";

type Range = "week" | "all";

interface Row {
  user_id: string;
  attempted: number;
  correct: number;
  points: number;
  accuracy: number;
  display_name: string;
  university: string;
}

interface Department {
  id: string;
  name: string;
}

const AVATAR_GRADIENTS = [
  "from-royal to-royal-dark",
  "from-emerald-500 to-emerald-700",
  "from-amber-500 to-amber-700",
  "from-purple-500 to-purple-700",
  "from-rose-500 to-rose-700",
  "from-sky-500 to-sky-700",
];

function avatarGradient(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export default function Leaderboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>("week");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("departments")
      .select("id, name")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setDepartments(data ?? []));
  }, []);

  useEffect(() => {
    if (profile?.department_id && !departmentId)
      setDepartmentId(profile.department_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const today = new Date();
      const from =
        range === "week"
          ? startOfWeek(today, { weekStartsOn: 1 })
          : new Date("2000-01-01");
      const to =
        range === "week" ? endOfWeek(today, { weekStartsOn: 1 }) : today;

      const { data: standings } = await supabase.rpc("leaderboard", {
        p_from: format(from, "yyyy-MM-dd"),
        p_to: format(to, "yyyy-MM-dd"),
        p_department_id: departmentId || null,
        p_limit: 50,
      });

      const userIds = (standings ?? []).map(
        (s: { user_id: string }) => s.user_id,
      );
      const { data: names } =
        userIds.length > 0
          ? await supabase.rpc("public_profile_names", { p_user_ids: userIds })
          : { data: [] };

      const nameMap = new Map((names ?? []).map((n: Row) => [n.user_id, n]));

      setRows(
        (standings ?? []).map(
          (s: { user_id: string; attempted: number; correct: number }) => {
            const name = nameMap.get(s.user_id);
            return {
              user_id: s.user_id,
              attempted: s.attempted,
              correct: s.correct,
              points: Math.round((s.attempted * 2 + s.correct * 0.5) * 10) / 10,
              accuracy:
                s.attempted > 0
                  ? Math.round((s.correct / s.attempted) * 100)
                  : 0,
              display_name:
                (name as { display_name?: string })?.display_name ??
                (user?.id === s.user_id ? "You" : "Scholar"),
              university: (name as { university?: string })?.university ?? "",
            };
          },
        ),
      );
      setLoading(false);
    }
    void load();
  }, [range, departmentId, user]);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const rankStyle = [
    "bg-gold text-navy",
    "bg-slate-300 text-navy",
    "bg-amber-700 text-white",
  ];
  const rankIcon = [Crown, Medal, Medal];

  return (
    <Layout title="Leaderboard" onBack={() => navigate("/dashboard")}>
      <div className="mb-4 flex gap-2">
        {(["week", "all"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
              range === r ? "bg-royal text-white" : "bg-canvas-soft text-text-2"
            }`}
          >
            {r === "week" ? "This week" : "All time"}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setDepartmentId("")}
          className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold ${
            !departmentId ? "bg-navy text-white" : "bg-canvas-soft text-text-2"
          }`}
        >
          All departments
        </button>
        {departments.map((d) => (
          <button
            key={d.id}
            onClick={() => setDepartmentId(d.id)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold ${
              departmentId === d.id
                ? "bg-navy text-white"
                : "bg-canvas-soft text-text-2"
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-1.5 text-xs text-text-3">
        <Zap size={13} className="text-gold" />
        Formula: (Attempts × 2) + (Correct × 0.5)
      </div>

      {loading ? (
        <p className="text-sm text-text-3">Calculating standings…</p>
      ) : rows.length === 0 ? (
        <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
          <Trophy size={28} className="text-text-3" />
          <p className="font-heading text-sm font-bold text-text-1">
            No rankings yet
          </p>
          <p className="text-sm text-text-3">
            Be the first to practice this week and claim the top spot.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {top3.map((r, i) => {
              const RankIcon = rankIcon[i];
              return (
                <div key={r.user_id} className="card-luxury p-3 text-center">
                  <div
                    className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br text-base font-bold text-white ${avatarGradient(r.user_id)}`}
                  >
                    {r.display_name.charAt(0).toUpperCase()}
                  </div>
                  <span
                    className={`relative -mt-4 mx-auto flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold ${rankStyle[i]}`}
                  >
                    <RankIcon size={12} />
                  </span>
                  <p className="mt-1 truncate font-heading text-sm font-bold text-text-1">
                    {r.display_name}
                  </p>
                  <p className="truncate text-xs text-text-3">
                    {r.university}
                  </p>
                  <p className="mt-1 text-sm font-bold text-royal">
                    {r.points} pts
                  </p>
                  <p className="text-xs text-text-3">{r.accuracy}% accuracy</p>
                </div>
              );
            })}
          </div>

          <div className="space-y-1">
            {rest.map((r, i) => (
              <div
                key={r.user_id}
                className="flex items-center justify-between rounded-xl px-3 py-2 odd:bg-canvas-soft/60"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-sm font-semibold text-text-3">
                    {i + 4}
                  </span>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${avatarGradient(r.user_id)}`}
                  >
                    {r.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-1">
                      {r.display_name}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-text-3">
                      <Target size={11} />
                      {r.correct} correct of {r.attempted}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-royal">{r.points} pts</p>
                  <p className="text-xs text-text-3">{r.accuracy}%</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
