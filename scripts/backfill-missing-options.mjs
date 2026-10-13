// One-time cleanup for orphaned questions left by the OLD (pre-batching) version of
// import-questions-from-export.mjs: that script inserted a question, then its options, as two
// separate sequential network calls with nothing tying them together. Across a two-day,
// unthrottled, badly-lagging run, a connection hiccup or interruption landing between those two
// awaits for any one question left that question's prompt in the database with zero options —
// silently, since the failure was only ever a console.log warning easy to miss among thousands
// of other lines.
//
// The export JSON itself has no gaps (verified: 0 of 102,713 real objective questions across all
// 6 export files are missing usable options), so every orphan in the database has a real,
// correct answer sitting in the export — this script finds it and backfills it, rather than
// re-importing (which the main script's own "skip if this course already has real questions"
// check would refuse to do, since the course isn't actually empty, just missing options on a
// few rows within it).
//
// Usage (same env vars/working directory as the main import script):
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//     node scripts/backfill-missing-options.mjs --dry-run
//
// Review the dry-run report, then re-run without --dry-run. Safe to re-run: a question that
// already has options is never touched again.

import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const OPTION_LABELS = ["A", "B", "C", "D", "E"];

function env(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. See this script's header comment.`);
    process.exit(1);
  }
  return v;
}

function normalize(s) {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeContent(val) {
  if (val === null || val === undefined) return "";
  let str = String(val);
  str = str.replace(/<br\s*\/?>/gi, "\n");
  str = str.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
  str = str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return str.trim();
}

function loadExportedCourses() {
  const files = readdirSync(process.cwd()).filter(
    (f) => /export.*questions.*part.*of.*\.json$/i.test(f) || /export.*questions\.json$/i.test(f),
  );
  if (files.length === 0) {
    console.error(
      "No export JSON file(s) found in the current directory. Run this from the repo root, " +
        'next to files named like "...Questions-part-1-of-6.json".',
    );
    process.exit(1);
  }
  const courses = [];
  for (const f of files) {
    const data = JSON.parse(readFileSync(f, "utf8"));
    for (const c of data.courses) if (!c.isDeleted) courses.push(c);
  }
  return courses;
}

async function main() {
  const supabaseUrl = env("SUPABASE_URL");
  const supabaseServiceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  console.log(DRY_RUN ? "Running in --dry-run mode (no writes).\n" : "Running for real — this will write to Supabase.\n");

  const exportedCourses = loadExportedCourses();

  const { data: departments, error: deptErr } = await supabase.from("departments").select("id, name");
  if (deptErr) throw deptErr;
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));

  const { data: levels, error: levelErr } = await supabase.from("department_levels").select("id, label");
  if (levelErr) throw levelErr;
  const levelLabelById = new Map(levels.map((l) => [l.id, l.label]));

  const { data: courses, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, department_id, level_id")
    .is("deleted_at", null);
  if (courseErr) throw courseErr;
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // Every active objective question with zero rows in question_options.
  const { data: allObjective, error: qErr } = await supabase
    .from("questions")
    .select("id, course_id, prompt, sort_order")
    .eq("status", "active")
    .eq("type", "objective");
  if (qErr) throw qErr;

  const { data: existingOptionRows, error: optCheckErr } = await supabase
    .from("question_options")
    .select("question_id");
  if (optCheckErr) throw optCheckErr;
  const hasOptions = new Set(existingOptionRows.map((o) => o.question_id));

  const broken = allObjective.filter((q) => !hasOptions.has(q.id));
  console.log(`${broken.length} active objective question(s) found with zero options.\n`);
  if (broken.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Group broken questions by course, so each course's export candidate pool is built once.
  const byCourse = new Map();
  for (const q of broken) {
    if (!byCourse.has(q.course_id)) byCourse.set(q.course_id, []);
    byCourse.get(q.course_id).push(q);
  }

  let fixed = 0;
  let ambiguous = 0;
  let noMatch = 0;
  const unresolved = [];

  for (const [courseId, brokenQuestions] of byCourse) {
    const course = courseById.get(courseId);
    if (!course) {
      for (const q of brokenQuestions) unresolved.push({ q, reason: "course no longer exists" });
      noMatch += brokenQuestions.length;
      continue;
    }
    const deptName = normalize(deptNameById.get(course.department_id));
    const levelLabel = normalize(levelLabelById.get(course.level_id));

    // Pool every matching old course's questions by department+level (not title) — a course
    // here can be the merge of two old courses with slightly different titles (see the
    // slug-collision fix in the main import script), so matching only on an exact title would
    // miss questions that came from the "other" old course title.
    const candidatePool = [];
    for (const oldCourse of exportedCourses) {
      if (normalize(oldCourse.department) !== deptName) continue;
      if (normalize(oldCourse.level) !== levelLabel) continue;
      for (const oq of oldCourse.questions ?? []) {
        if (oq.isDeleted || oq.type === "application") continue;
        candidatePool.push(oq);
      }
    }

    // Index the pool by normalized prompt text — most prompts are unique within a
    // department+level; a prompt with more than one candidate is left for manual review rather
    // than guessed.
    const byPrompt = new Map();
    for (const oq of candidatePool) {
      const key = normalize(normalizeContent(oq.question));
      if (!byPrompt.has(key)) byPrompt.set(key, []);
      byPrompt.get(key).push(oq);
    }

    const optionRowsForCourse = [];
    for (const q of brokenQuestions) {
      const key = normalize(q.prompt);
      const candidates = byPrompt.get(key) ?? [];
      if (candidates.length === 0) {
        unresolved.push({ q, reason: "no matching question found in the export data" });
        noMatch++;
        continue;
      }
      if (candidates.length > 1) {
        unresolved.push({ q, reason: `${candidates.length} export questions share this exact prompt — ambiguous` });
        ambiguous++;
        continue;
      }
      const oq = candidates[0];
      const rawOptions = Array.isArray(oq.options) ? oq.options : [];
      const builtOptions = rawOptions
        .map((body, i) => ({ label: OPTION_LABELS[i], body: normalizeContent(body), i }))
        .filter((o) => o.label && o.body)
        .map((o) => ({
          id: randomUUID(),
          question_id: q.id,
          label: o.label,
          body: o.body,
          is_correct: o.i === oq.correctAnswer,
          sort_order: o.i,
        }));
      if (builtOptions.length < 2 || !builtOptions.some((o) => o.is_correct)) {
        unresolved.push({ q, reason: "matched export question itself has no usable options (unexpected — review manually)" });
        noMatch++;
        continue;
      }
      optionRowsForCourse.push(...builtOptions);
      fixed++;
      console.log(
        `${DRY_RUN ? "[dry-run] would backfill" : "Backfilling"} ${builtOptions.length} option(s) for: "${q.prompt.slice(0, 70)}${q.prompt.length > 70 ? "…" : ""}"`,
      );
    }

    if (!DRY_RUN && optionRowsForCourse.length > 0) {
      const { error: insErr } = await supabase.from("question_options").insert(optionRowsForCourse);
      if (insErr) {
        console.error(`  Insert failed for course ${course.title}: ${insErr.message}`);
      }
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Backfilled: ${fixed}`);
  console.log(`No match found in export data: ${noMatch}`);
  console.log(`Ambiguous (multiple export matches, skipped): ${ambiguous}`);
  if (unresolved.length > 0) {
    console.log(`\n${unresolved.length} question(s) still need manual review:`);
    for (const { q, reason } of unresolved) {
      console.log(`  - [course ${q.course_id}] "${q.prompt.slice(0, 70)}${q.prompt.length > 70 ? "…" : ""}" — ${reason}`);
    }
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
