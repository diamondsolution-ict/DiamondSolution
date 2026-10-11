import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfWeek, endOfWeek } from "date-fns";
import {
  BookOpen,
  CheckCircle,
  Clock,
  Facebook,
  Gift,
  Globe,
  Instagram,
  ListChecks,
  Mail,
  MessageCircle,
  Quote,
  Search,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Twitter,
  X,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { DiamondLogo } from "@/components/DiamondLogo";
import { OnboardingTour } from "@/components/OnboardingTour";

interface Department {
  id: string;
  name: string;
  image_path: string | null;
}
interface DayStat {
  date: string;
  attempted: number;
  correct: number;
  studyDuration: number;
}
interface ResumeCourse {
  course_id: string;
  current_order: number;
  course_title: string;
  level_label: string | null;
  totalQuestions: number;
}
interface SearchResult {
  id: string;
  title: string;
  department_name: string | null;
  level_label: string | null;
}
interface TopRanker {
  user_id: string;
  display_name: string;
  points: number;
  accuracy: number;
  attempted: number;
}
interface InstitutionalLinks {
  telegram: string | null;
  whatsapp: string | null;
  facebook: string | null;
  twitter: string | null;
  instagram: string | null;
  support_email: string | null;
}
interface Quote {
  text: string;
  author: string;
}

// Fallback pool for when the admin-curated `quotes` table (AdminQuotes.tsx) is empty — never
// an empty state on the dashboard just because no admin has published one yet.
const FALLBACK_QUOTES: Quote[] = [
  {
    text: "The secret of getting ahead is getting started. Master your clinical questions one day at a time.",
    author: "Diamond Solution Academy",
  },
  {
    text: "Discipline beats motivation when exam day actually arrives.",
    author: "Diamond Solution Academy",
  },
  {
    text: "Every question you attempt today is a patient you'll serve with more confidence tomorrow.",
    author: "Diamond Solution Academy",
  },
  {
    text: "Consistency compounds — a little practice daily outperforms a single long session.",
    author: "Diamond Solution Academy",
  },
  {
    text: "Review your misses as closely as your wins; that's where the real learning is.",
    author: "Diamond Solution Academy",
  },
];

function quoteOfTheDay(pool: Quote[]): Quote {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  return pool[dayOfYear % pool.length];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// A raw email address is never a presentable greeting name — fall back to the username, or
// a title-cased version of the email's local part, before giving up to a generic "Scholar".
// display_name should already be set for everyone who signed up through Register.tsx (it's a
// required field there), so landing here at all means an older or externally-created account.
function greetingName(
  profile: { display_name: string | null; username: string | null } | null,
  email: string | undefined,
) {
  if (profile?.display_name) return profile.display_name;
  if (profile?.username) return profile.username;
  if (email) {
    const local = email.split("@")[0].replace(/[._-]+/g, " ");
    return local.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Scholar";
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [points, setPoints] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [week, setWeek] = useState<DayStat[]>([]);
  const [resume, setResume] = useState<ResumeCourse | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [topRanker, setTopRanker] = useState<TopRanker | null>(null);
  const [quotePool, setQuotePool] = useState<Quote[]>(FALLBACK_QUOTES);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<InstitutionalLinks | null>(null);
  const [showChannels, setShowChannels] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

      const [
        { data: allStats },
        { data: progressRows },
        { data: depts },
        { data: grants },
        { data: affiliateRow },
        { data: standings },
        { data: quoteRows },
        { data: channelsRow },
      ] = await Promise.all([
        supabase
          .from("daily_practice_stats")
          .select("practice_date, attempted, correct, study_duration_seconds")
          .eq("user_id", user.id),
        supabase
          .from("study_progress")
          .select(
            "course_id, current_order, updated_at, completed, courses(title, department_levels(label))",
          )
          .eq("user_id", user.id)
          .eq("completed", false)
          .order("updated_at", { ascending: false })
          .limit(1),
        supabase
          .from("departments")
          .select("id, name, image_path")
          .eq("status", "active")
          .order("name"),
        supabase
          .from("access_grants")
          .select("department_id")
          .eq("user_id", user.id),
        supabase
          .from("affiliate_profiles")
          .select("referral_code")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.rpc("leaderboard", {
          p_from: format(weekStart, "yyyy-MM-dd"),
          p_to: format(weekEnd, "yyyy-MM-dd"),
          p_department_id: profile?.department_id ?? null,
          p_limit: 1,
        }),
        supabase.from("quotes").select("text, author"),
        supabase
          .from("institutional_links")
          .select("telegram, whatsapp, facebook, twitter, instagram, support_email")
          .eq("id", 1)
          .maybeSingle(),
      ]);

      if (quoteRows && quoteRows.length > 0) setQuotePool(quoteRows);
      setChannels(channelsRow ?? null);

      const totalAttempted = (allStats ?? []).reduce(
        (s, r) => s + r.attempted,
        0,
      );
      const totalCorrect = (allStats ?? []).reduce((s, r) => s + r.correct, 0);
      setAttempted(totalAttempted);
      setPoints(
        Math.round((totalAttempted * 2 + totalCorrect * 0.5) * 10) / 10,
      );
      setAccuracy(
        totalAttempted > 0
          ? Math.round((totalCorrect / totalAttempted) * 100)
          : 0,
      );

      const byDate = new Map((allStats ?? []).map((r) => [r.practice_date, r]));
      const days: DayStat[] = Array.from({ length: 7 }, (_, i) => {
        const date = format(subDays(new Date(), 6 - i), "yyyy-MM-dd");
        const row = byDate.get(date);
        return {
          date,
          attempted: row?.attempted ?? 0,
          correct: row?.correct ?? 0,
          studyDuration: row?.study_duration_seconds ?? 0,
        };
      });
      setWeek(days);

      const progress = progressRows?.[0] as
        | {
            course_id: string;
            current_order: number;
            courses: {
              title: string;
              department_levels: { label: string } | null;
            } | null;
          }
        | undefined;

      if (progress) {
        const { count } = await supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("course_id", progress.course_id)
          .eq("status", "active");
        setResume({
          course_id: progress.course_id,
          current_order: progress.current_order,
          course_title: progress.courses?.title ?? "",
          level_label: progress.courses?.department_levels?.label ?? null,
          totalQuestions: count ?? 0,
        });
      } else {
        setResume(null);
      }

      setDepartments(depts ?? []);
      setGrantedIds(new Set((grants ?? []).map((g) => g.department_id)));
      setReferralCode(affiliateRow?.referral_code ?? null);

      const top = (standings ?? [])[0] as
        { user_id: string; attempted: number; correct: number } | undefined;
      if (top) {
        const { data: names } = await supabase.rpc("public_profile_names", {
          p_user_ids: [top.user_id],
        });
        const name = (names ?? [])[0] as { display_name?: string } | undefined;
        setTopRanker({
          user_id: top.user_id,
          display_name: name?.display_name ?? "Scholar",
          points: Math.round((top.attempted * 2 + top.correct * 0.5) * 10) / 10,
          accuracy:
            top.attempted > 0
              ? Math.round((top.correct / top.attempted) * 100)
              : 0,
          attempted: top.attempted,
        });
      } else {
        setTopRanker(null);
      }

      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.department_id]);

  // Debounced course/topic search — courses_select_signed_in's RLS policy already lets any
  // signed-in, non-suspended user read every published course regardless of department access
  // (the paywall is enforced on CourseList/CourseDetail, not here), so this can search across
  // the whole catalog rather than just the student's own department.
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("courses")
        .select("id, title, departments(name), department_levels(label)")
        .ilike("title", `%${query}%`)
        .eq("status", "published")
        .is("deleted_at", null)
        .order("title")
        .limit(8);
      setSearchResults(
        (data ?? []).map((c) => {
          const row = c as unknown as {
            id: string;
            title: string;
            departments: { name: string } | null;
            department_levels: { label: string } | null;
          };
          return {
            id: row.id,
            title: row.title,
            department_name: row.departments?.name ?? null,
            level_label: row.department_levels?.label ?? null,
          };
        }),
      );
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  function goToSearchResult(id: string) {
    setSearchQuery("");
    setSearchResults([]);
    navigate(`/courses/${id}`);
  }

  const weekTimeSpentMinutes = Math.round(
    week.reduce((s, d) => s + d.studyDuration, 0) / 60,
  );
  const weekAttempted = week.reduce((s, d) => s + d.attempted, 0);
  const weekCorrect = week.reduce((s, d) => s + d.correct, 0);
  const weekAccuracy =
    weekAttempted > 0 ? Math.round((weekCorrect / weekAttempted) * 100) : 0;

  const weeklyStats = week.map((d) => ({
    date: d.date,
    dayLabel: format(new Date(d.date), "EEE").toUpperCase(),
    fullDate: format(new Date(d.date), "MMM d, yyyy"),
    studyDurationMins: Math.round(d.studyDuration / 60),
    attempted: d.attempted,
    correct: d.correct,
    accuracy: d.attempted > 0 ? Math.round((d.correct / d.attempted) * 100) : 0,
  }));
  const focusedDay =
    selectedDayIndex !== null ? weeklyStats[selectedDayIndex] : null;
  const displayDuration = focusedDay
    ? `${focusedDay.studyDurationMins}m`
    : `${weekTimeSpentMinutes}m`;
  const displayAttempted = focusedDay ? focusedDay.attempted : weekAttempted;
  const displayCorrect = focusedDay ? focusedDay.correct : weekCorrect;
  const displayAccuracy = focusedDay ? focusedDay.accuracy : weekAccuracy;
  const statsLabel = focusedDay
    ? `${focusedDay.dayLabel} (${focusedDay.fullDate})`
    : "7-Day Total";

  const resumePercent =
    resume && resume.totalQuestions > 0
      ? Math.round((resume.current_order / resume.totalQuestions) * 100)
      : 0;

  return (
    <>
      <OnboardingTour />
      <Layout title="Dashboard" wide>
        <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
          {/* Main column */}
          <div className="lg:col-span-2">
            <div className="diamond-gradient card-luxury p-5 text-white">
              <div className="flex items-center gap-2">
                <DiamondLogo size={22} variant="white" layout="icon" />
                <span className="font-heading text-sm font-bold">
                  Diamond Solution
                </span>
              </div>
              <p className="mt-3 text-xs text-white/70">{greeting()},</p>
              <p className="font-heading text-xl font-bold">
                {greetingName(profile, user?.email)}
              </p>

              <div className="relative mt-4">
                <div className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5">
                  <Search size={17} className="shrink-0 text-text-3" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    placeholder="Search a course, topic or exam (e.g. Hematology)…"
                    className="w-full bg-transparent text-sm text-text-1 placeholder:text-text-3 focus:outline-none"
                  />
                </div>

                {searchFocused && searchQuery.trim() && (
                  <div className="card-luxury absolute left-0 right-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto p-1.5 text-left">
                    {searching ? (
                      <p className="px-3 py-2.5 text-sm text-text-3">
                        Searching…
                      </p>
                    ) : searchResults.length === 0 ? (
                      <p className="px-3 py-2.5 text-sm text-text-3">
                        No courses match "{searchQuery.trim()}".
                      </p>
                    ) : (
                      searchResults.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => goToSearchResult(r.id)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-canvas-soft"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-text-1">
                              {r.title}
                            </span>
                            {r.department_name && (
                              <span className="block truncate text-xs text-text-3">
                                {r.department_name}
                              </span>
                            )}
                          </span>
                          {r.level_label && (
                            <span className="badge-royal shrink-0">
                              {r.level_label}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <HeroStat label="Points" value={points} />
                <HeroStat label="Accuracy" value={`${accuracy}%`} />
                <HeroStat label="Attempted" value={attempted} />
              </div>
            </div>

            <div className="card-luxury mt-4 p-5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gold">
                <Quote size={13} />
                Wisdom of the day
              </p>
              <p className="mt-2 text-sm italic text-text-2">
                "{quoteOfTheDay(quotePool).text}"
              </p>
              <p className="mt-1 text-xs text-text-3">
                — {quoteOfTheDay(quotePool).author}
              </p>
            </div>

            {!loading && resume && (
              <button
                onClick={() => navigate(`/courses/${resume.course_id}`)}
                className="diamond-gradient card-luxury mt-4 flex w-full items-center gap-4 p-5 text-left text-white"
              >
                <ProgressRing percent={resumePercent} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-gold">
                      Recently practiced
                    </p>
                    {resume.level_label && (
                      <span className="rounded-full border border-white/25 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                        {resume.level_label}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate font-heading text-base font-bold">
                    {resume.course_title}
                  </p>
                  <p className="mt-1 text-xs text-white/80">
                    {resume.current_order} of {resume.totalQuestions} questions
                    completed
                  </p>
                  <span className="mt-2 inline-block rounded-full bg-gold px-3 py-1 text-xs font-bold text-navy">
                    Resume Quiz →
                  </span>
                </div>
              </button>
            )}

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-royal-border bg-royal-soft text-royal">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <h2 className="font-heading text-sm font-bold text-text-1">
                      Study Analytics
                    </h2>
                    <p className="text-[10px] font-bold text-text-3">
                      7-day performance &amp; time spent
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {selectedDayIndex !== null && (
                    <button
                      onClick={() => setSelectedDayIndex(null)}
                      className="rounded-lg bg-royal-soft px-2.5 py-1 text-[11px] font-bold text-royal hover:bg-[#e0eaff]"
                    >
                      Reset Selection
                    </button>
                  )}
                  <button
                    onClick={() => navigate("/activity-log")}
                    className="flex items-center gap-1 text-xs font-semibold text-royal hover:underline"
                  >
                    <ListChecks size={14} />
                    Full activity log →
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="card-luxury flex flex-col justify-between p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-3">
                      Time Spent
                    </span>
                    <Clock size={16} className="text-royal" />
                  </div>
                  <div className="mt-2">
                    <div className="font-heading text-xl font-bold text-text-1 sm:text-2xl">
                      {displayDuration}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] font-medium text-text-3">
                      {statsLabel}
                    </div>
                  </div>
                </div>

                <div className="card-luxury flex flex-col justify-between p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-3">
                      Attempted
                    </span>
                    <Target size={16} className="text-indigo-600" />
                  </div>
                  <div className="mt-2">
                    <div className="font-heading text-xl font-bold text-text-1 sm:text-2xl">
                      {displayAttempted}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] font-medium text-text-3">
                      {statsLabel} questions
                    </div>
                  </div>
                </div>

                <div className="card-luxury flex flex-col justify-between p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-3">
                      Correct Answers
                    </span>
                    <CheckCircle size={16} className="text-emerald-600" />
                  </div>
                  <div className="mt-2">
                    <div className="font-heading text-xl font-bold text-emerald-700 sm:text-2xl">
                      {displayCorrect}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] font-medium text-text-3">
                      {displayAttempted > 0
                        ? `${Math.round((displayCorrect / displayAttempted) * 100)}% correct`
                        : "No attempts"}
                    </div>
                  </div>
                </div>

                <div className="card-luxury flex flex-col justify-between p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-3">
                      Average Score
                    </span>
                    <Zap size={16} className="text-gold" />
                  </div>
                  <div className="mt-2">
                    <div className="font-heading text-xl font-bold text-text-1 sm:text-2xl">
                      {displayAccuracy}%
                    </div>
                    <div className="mt-0.5 truncate text-[10px] font-medium text-text-3">
                      Accuracy score
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-luxury space-y-4 p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="font-heading text-sm font-bold text-text-1">
                      Daily Time Spent &amp; Practice Volume
                    </h3>
                    <p className="text-[11px] text-text-3">
                      Tap or hover any day bar to inspect questions attempted
                      and score percentage.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded-md bg-gradient-to-t from-navy to-royal" />
                      <span className="text-[11px] font-bold text-text-2">
                        Time (Mins)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-gold" />
                      <span className="text-[11px] font-bold text-text-2">
                        Accuracy %
                      </span>
                    </div>
                  </div>
                </div>

                <div className="h-56 w-full pt-2 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={weeklyStats}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      onClick={(state) => {
                        const idx = Number(state?.activeTooltipIndex);
                        if (Number.isFinite(idx)) {
                          setSelectedDayIndex(
                            selectedDayIndex === idx ? null : idx,
                          );
                        }
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--color-royal-soft)"
                      />
                      <XAxis
                        dataKey="dayLabel"
                        tickLine={false}
                        axisLine={{ stroke: "var(--color-royal-border)" }}
                        tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                        unit="m"
                      />
                      <Tooltip
                        cursor={{ fill: "var(--color-royal-soft)", opacity: 0.7 }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) {
                            return null;
                          }
                          const d = payload[0].payload as (typeof weeklyStats)[number];
                          return (
                            <div className="space-y-1.5 rounded-2xl border border-white/10 bg-navy p-3 text-xs text-white shadow-xl">
                              <div className="text-[10px] font-black uppercase tracking-wider text-gold">
                                {d.dayLabel} • {d.fullDate}
                              </div>
                              <div className="flex items-center justify-between gap-4 text-white/90">
                                <span>⏱️ Time Spent:</span>
                                <span className="font-bold text-white">
                                  {d.studyDurationMins} mins
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4 text-white/90">
                                <span>🎯 Attempted:</span>
                                <span className="font-bold text-white">
                                  {d.attempted} questions
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4 text-white/90">
                                <span>✅ Correct:</span>
                                <span className="font-bold text-emerald-400">
                                  {d.correct} correct
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-1 text-white/90">
                                <span>⚡ Avg Score:</span>
                                <span className="font-bold text-gold">
                                  {d.accuracy}%
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="studyDurationMins"
                        fill="var(--color-royal)"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={42}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-7 gap-1 border-t border-royal-soft pt-2 sm:gap-2">
                  {weeklyStats.map((d, idx) => {
                    const isSelected = selectedDayIndex === idx;
                    return (
                      <button
                        key={d.date}
                        onClick={() =>
                          setSelectedDayIndex(isSelected ? null : idx)
                        }
                        className={`flex flex-col items-center rounded-xl border px-1 py-2 text-center transition-all ${
                          isSelected
                            ? "border-royal bg-royal text-white shadow-md shadow-royal/20"
                            : "border-royal-border bg-canvas-soft text-text-1 hover:bg-royal-soft"
                        }`}
                      >
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider ${
                            isSelected ? "text-white/80" : "text-text-3"
                          }`}
                        >
                          {d.dayLabel}
                        </span>
                        <span
                          className={`mt-0.5 text-xs font-black ${
                            isSelected ? "text-white" : "text-text-1"
                          }`}
                        >
                          {d.studyDurationMins}m
                        </span>
                        <span
                          className={`mt-1 rounded px-1 text-[8px] font-bold ${
                            isSelected
                              ? "bg-white/20 text-gold"
                              : "border border-canvas-border bg-white text-text-2"
                          }`}
                        >
                          {d.attempted}q
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-text-1">
                <BookOpen size={16} className="text-royal" />
                Departments
              </h2>
              <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                {departments.map((d) => {
                  const imageUrl = d.image_path
                    ? supabase.storage.from("media").getPublicUrl(
                        d.image_path,
                      ).data.publicUrl
                    : null;
                  return (
                    <button
                      key={d.id}
                      onClick={() => navigate(`/courses?department=${d.id}`)}
                      className="card-luxury flex w-32 shrink-0 flex-col items-start gap-2 p-3 text-left"
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="h-10 w-10 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="diamond-gradient flex h-10 w-10 items-center justify-center rounded-xl">
                          <BookOpen size={16} className="text-white/70" />
                        </div>
                      )}
                      <span className="font-heading text-sm font-bold text-text-1">
                        {d.name}
                      </span>
                      {grantedIds.has(d.id) && (
                        <span className="badge-royal">Active</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <QuickAction
                icon={BookOpen}
                label="Study"
                onClick={() => navigate("/courses")}
              />
              <QuickAction
                icon={Trophy}
                label="Leaderboard"
                onClick={() => navigate("/leaderboard")}
              />
              <QuickAction
                icon={Gift}
                label="Affiliate"
                onClick={() => navigate("/affiliate")}
              />
              <QuickAction
                icon={Globe}
                label="Channels"
                onClick={() => setShowChannels(true)}
              />
            </div>
          </div>

          {/* Right rail */}
          <div className="mt-4 lg:col-span-1 lg:mt-0">
            <button
              onClick={() => navigate("/affiliate")}
              className="diamond-gradient card-luxury w-full p-5 text-left text-white"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                <Sparkles size={18} className="text-gold" />
              </div>
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gold">
                Revenue program
              </p>
              <p className="mt-1 font-heading text-xl font-bold">
                Refer &amp; earn 25%
              </p>
              <p className="mt-1 text-sm text-white/80">
                Share your referral code and earn on every successful
                enrollment.
              </p>
              <span className="mt-3 inline-block rounded-full border border-white/30 bg-white/10 px-4 py-2 font-mono text-sm tracking-wider text-gold">
                {referralCode ?? "Become an affiliate →"}
              </span>
            </button>

            {topRanker && (
              <div className="card-luxury mt-4 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-text-1">
                    <Trophy size={16} className="text-gold" />
                    Top this week
                  </h2>
                  <button
                    onClick={() => navigate("/leaderboard")}
                    className="text-xs font-semibold text-royal hover:underline"
                  >
                    See full rankings →
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="badge-gold flex h-8 w-8 items-center justify-center rounded-full font-bold">
                    1
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text-1">
                      {topRanker.user_id === user?.id
                        ? "You"
                        : topRanker.display_name}
                    </p>
                    <p className="text-xs text-text-3">
                      {topRanker.accuracy}% accuracy · {topRanker.attempted} q's
                    </p>
                  </div>
                  <span className="font-heading text-sm font-bold text-royal">
                    {topRanker.points} pts
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Layout>

      {showChannels && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-4"
          onClick={() => setShowChannels(false)}
        >
          <div
            className="card-luxury w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-text-1">
                <Globe size={18} className="text-royal" />
                Channels
              </h2>
              <button
                onClick={() => setShowChannels(false)}
                className="rounded-full p-1 hover:bg-canvas-soft"
              >
                <X size={18} className="text-text-3" />
              </button>
            </div>
            <p className="mt-1 text-sm text-text-3">
              Stay connected — follow our official channels for updates.
            </p>
            <div className="mt-4 space-y-2">
              {channelLinks(channels).length === 0 ? (
                <p className="rounded-xl bg-canvas-soft px-3 py-4 text-center text-sm text-text-3">
                  No channels have been set up yet.
                </p>
              ) : (
                channelLinks(channels).map((c) => (
                  <a
                    key={c.label}
                    href={c.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-canvas-border px-3 py-2.5 text-sm font-semibold text-text-1 transition-colors hover:border-royal/40 hover:bg-royal-soft"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-royal-soft text-royal">
                      <c.icon size={15} />
                    </span>
                    {c.label}
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function channelLinks(channels: InstitutionalLinks | null) {
  if (!channels) return [];
  const withScheme = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);
  const links: { label: string; href: string; icon: typeof Globe }[] = [];
  if (channels.telegram) {
    links.push({
      label: "Telegram",
      href: `https://t.me/${channels.telegram.replace(/^@/, "")}`,
      icon: Send,
    });
  }
  if (channels.whatsapp) {
    links.push({
      label: "WhatsApp",
      href: `https://wa.me/${channels.whatsapp.replace(/\D/g, "")}`,
      icon: MessageCircle,
    });
  }
  if (channels.facebook) {
    links.push({
      label: "Facebook",
      href: withScheme(channels.facebook),
      icon: Facebook,
    });
  }
  if (channels.twitter) {
    links.push({
      label: "Twitter (X)",
      href: `https://twitter.com/${channels.twitter.replace(/^@/, "")}`,
      icon: Twitter,
    });
  }
  if (channels.instagram) {
    links.push({
      label: "Instagram",
      href: `https://instagram.com/${channels.instagram.replace(/^@/, "")}`,
      icon: Instagram,
    });
  }
  if (channels.support_email) {
    links.push({
      label: channels.support_email,
      href: `mailto:${channels.support_email}`,
      icon: Mail,
    });
  }
  return links;
}

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/10 p-2 text-center">
      <p className="font-heading text-base font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/70">
        {label}
      </p>
    </div>
  );
}


function ProgressRing({ percent }: { percent: number }) {
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - percent / 100);
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="5"
      />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="#D4AF37"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 26 26)"
      />
      <text
        x="26"
        y="30"
        textAnchor="middle"
        className="fill-white text-[11px] font-bold"
      >
        {percent}%
      </text>
    </svg>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof BookOpen;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="btn-secondary flex-col gap-1 py-3 text-xs"
    >
      <Icon size={18} />
      {label}
    </button>
  );
}
