// One-time migration: imports the real question bank from the old Firebase app's data,
// using the JSON export produced by the "Question Bank Exporter" tool (reads Firestore's
// `courses/{id}` + its `content` subcollection and downloads one combined JSON file) instead
// of connecting to Firestore directly — this is the version to use once you have that export.
//
// Supersedes migrate-questions-from-firebase.mjs for this import: that script matched each old
// course only against courses this app's seed already created (supabase/seed/02-courses.sql)
// and silently skipped anything that didn't match by exact (department, level, title). A
// verification pass against the real export found that catalog only covers 60 of 273 real old
// courses (22%) — the old app had many more courses per level (numbered variants like
// "Paediatrics I/II/III", plus whole exam-prep categories like NMCN Exams / PCN Exam / Ochei
// Questions / Application Questions / MRTB MCQS) that 02-courses.sql never seeded. Rather than
// force everything into that narrower catalog, THIS script creates whatever's missing —
// department_levels and courses alike — using the old app's own titles, so no real content is
// silently dropped. It only ever skips: (a) a course with zero questions in the export (nothing
// to import), (b) a department with no live match at all (Veterinary Medicine and Human
// Nutrition and Dietetics in the real export — both confirmed to have zero questions across
// every one of their courses, so there is nothing lost by leaving them out).
//
// Run this on YOUR machine, not in a sandbox — it needs network access to Supabase (and to
// unsplash.com, to re-host the course thumbnails that already lived on the old site), and your
// Supabase service-role key, which should never be pasted into chat:
//
//   Supabase Dashboard → this project → Project Settings → API → service_role key.
//
// Usage (run from the repo root, where the 6 export JSON files already live):
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//     node scripts/import-questions-from-export.mjs --dry-run
//
// Review the dry-run report (every department_level / course it would create, and the
// question/thumbnail counts), then re-run without --dry-run to actually write.
//
// A course whose only active question is the temporary placeholder from
// supabase/seed/03-placeholder-questions.sql is NOT skipped — its placeholder is trashed and
// real content is imported in its place. Only a course with genuine existing content is left
// untouched. Safe to re-run: anything already imported is skipped on the next run.

import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const OPTION_LABELS = ["A", "B", "C", "D", "E"];
const PLACEHOLDER_MARKER =
  "[PLACEHOLDER — auto-generated, safe to delete once real questions are added]";
const MEDIA_BUCKET = "media";

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

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Mirrors the old app's formatFormattedText() — Firestore question text sometimes carries
// literal "<br>" tags or escaped "\n"/"\r\n" sequences (two characters, not a real line break).
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
  console.log(`Reading ${files.length} export file(s): ${files.join(", ")}`);
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
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  console.log(DRY_RUN ? "Running in --dry-run mode (no writes).\n" : "Running for real — this will write to Supabase.\n");

  const oldCourses = loadExportedCourses().filter(
    (c) => Array.isArray(c.questions) && c.questions.length > 0,
  );
  console.log(`${oldCourses.length} old course(s) have real questions and will be considered.\n`);

  // ---- Load live departments + levels + courses --------------------------------------------
  const { data: departments, error: deptErr } = await supabase
    .from("departments")
    .select("id, name");
  if (deptErr) throw deptErr;
  const deptByName = new Map(departments.map((d) => [normalize(d.name), d]));

  const { data: levels, error: levelErr } = await supabase
    .from("department_levels")
    .select("id, department_id, label, sort_order");
  if (levelErr) throw levelErr;
  const levelByKey = new Map(levels.map((l) => [`${l.department_id}::${normalize(l.label)}`, l]));
  const maxSortByDept = new Map();
  for (const l of levels) {
    maxSortByDept.set(l.department_id, Math.max(maxSortByDept.get(l.department_id) ?? -1, l.sort_order));
  }

  const { data: courses, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, department_id, level_id, image_path")
    .is("deleted_at", null);
  if (courseErr) throw courseErr;
  const courseByKey = new Map(
    courses.map((c) => [`${c.department_id}::${c.level_id}::${normalize(c.title)}`, c]),
  );

  // ---- Thumbnail dedup cache (41 distinct Unsplash URLs shared across ~103 old courses) ----
  const thumbnailPathByUrl = new Map();
  async function ensureThumbnail(imageUrl) {
    if (!imageUrl) return null;
    if (thumbnailPathByUrl.has(imageUrl)) return thumbnailPathByUrl.get(imageUrl);
    if (DRY_RUN) {
      thumbnailPathByUrl.set(imageUrl, "[dry-run: would download + upload]");
      return thumbnailPathByUrl.get(imageUrl);
    }
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      const buffer = Buffer.from(await res.arrayBuffer());
      const hash = Buffer.from(imageUrl).toString("base64url").slice(0, 24);
      const path = `courses/imported-${hash}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, buffer, { contentType, upsert: true });
      if (uploadErr) throw uploadErr;
      thumbnailPathByUrl.set(imageUrl, path);
      return path;
    } catch (err) {
      console.log(`  (thumbnail download/upload failed for ${imageUrl}: ${err.message} — leaving course without an image)`);
      thumbnailPathByUrl.set(imageUrl, null);
      return null;
    }
  }

  const skippedNoDepartment = [];
  const skippedAlreadyHasQuestions = [];
  const dataWarnings = [];
  const levelsCreated = [];
  const coursesCreated = [];
  let coursesImported = 0;
  let questionsImported = 0;
  let thumbnailsSet = 0;

  for (const oldCourse of oldCourses) {
    const dept = deptByName.get(normalize(oldCourse.department));
    if (!dept) {
      skippedNoDepartment.push(oldCourse);
      continue;
    }

    // ---- Resolve or create the level ----
    const levelKey = `${dept.id}::${normalize(oldCourse.level)}`;
    let level = levelByKey.get(levelKey);
    if (!level) {
      const nextSort = (maxSortByDept.get(dept.id) ?? -1) + 1;
      if (DRY_RUN) {
        // Must be unique per (department, label) — a flat literal here would make two
        // different new levels in the same department (e.g. BMLS's "Ochei Questions" and
        // "Application Questions", which share some course titles between them) collide in
        // courseByKey below, since courseKey is built from this id.
        level = {
          id: `[dry-run-new-level:${dept.id}:${normalize(oldCourse.level)}]`,
          department_id: dept.id,
          label: oldCourse.level,
          sort_order: nextSort,
        };
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("department_levels")
          .insert({ department_id: dept.id, label: oldCourse.level, sort_order: nextSort })
          .select("id, department_id, label, sort_order")
          .single();
        if (insErr) throw insErr;
        level = inserted;
      }
      levelByKey.set(levelKey, level);
      maxSortByDept.set(dept.id, nextSort);
      levelsCreated.push(`${oldCourse.department} / ${oldCourse.level}`);
    }

    // ---- Resolve or create the course ----
    const courseKey = `${dept.id}::${level.id}::${normalize(oldCourse.title)}`;
    let course = courseByKey.get(courseKey);
    // A dry run never really inserts a course, so a *second* old course landing on the same
    // key within this same run (e.g. two export entries with the same department/level/title)
    // would otherwise find the first one's placeholder object here and try to query the real
    // database using its fake "[dry-run-new-course:...]" id — not a UUID, so Postgres rejects
    // it. Treat that case as still new: nothing real exists for it either way.
    const isDryRunPlaceholder =
      DRY_RUN && typeof course?.id === "string" && course.id.startsWith("[dry-run-new-course:");
    let courseIsNew = !course || isDryRunPlaceholder;
    if (!course) {
      courseIsNew = true;
      const slug = slugify(oldCourse.title) || `course-${oldCourse.id}`;
      const defaultType = oldCourse.questionType === "application" ? "application" : "objective";
      if (DRY_RUN) {
        course = { id: `[dry-run-new-course:${oldCourse.id}]`, title: oldCourse.title, department_id: dept.id, level_id: level.id, image_path: null };
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("courses")
          .insert({
            department_id: dept.id,
            level_id: level.id,
            title: oldCourse.title,
            slug,
            description: normalizeContent(oldCourse.description) || null,
            default_question_type: defaultType,
            status: "published",
          })
          .select("id, title, department_id, level_id, image_path")
          .single();
        if (insErr) throw insErr;
        course = inserted;
      }
      courseByKey.set(courseKey, course);
      coursesCreated.push(`[${oldCourse.department} / ${oldCourse.level}] "${oldCourse.title}"`);
    }

    // ---- Thumbnail (only set if the course doesn't already have one) ----
    const sourceImage = oldCourse.imageUrl || oldCourse.thumbnail;
    if (sourceImage && !course.image_path) {
      const path = await ensureThumbnail(sourceImage);
      if (path) {
        thumbnailsSet++;
        if (!DRY_RUN) {
          await supabase.from("courses").update({ image_path: path }).eq("id", course.id);
        }
      }
    }

    // ---- Skip if real (non-placeholder) questions already exist ----
    if (!courseIsNew) {
      const { data: existingRows, error: countErr } = await supabase
        .from("questions")
        .select("id, explanation")
        .eq("course_id", course.id)
        .eq("status", "active");
      if (countErr) throw countErr;

      const existingCount = existingRows?.length ?? 0;
      const isPlaceholderOnly =
        existingCount > 0 && existingRows.every((q) => q.explanation === PLACEHOLDER_MARKER);

      if (existingCount > 0 && !isPlaceholderOnly) {
        skippedAlreadyHasQuestions.push({ ...oldCourse, existingCount });
        continue;
      }
      if (isPlaceholderOnly) {
        console.log(`${DRY_RUN ? "[dry-run] would replace" : "Replacing"} placeholder question in "${course.title}"…`);
        if (!DRY_RUN) {
          await supabase
            .from("questions")
            .update({ status: "trashed", deleted_at: new Date().toISOString() })
            .in("id", existingRows.map((q) => q.id));
        }
      }
    }

    console.log(
      `${DRY_RUN ? "[dry-run] would import" : "Importing"} ${oldCourse.questions.length} question(s) → ` +
        `"${oldCourse.title}" (${oldCourse.department} / ${oldCourse.level})${courseIsNew ? " [new course]" : ""}`,
    );

    if (DRY_RUN) {
      coursesImported++;
      questionsImported += oldCourse.questions.length;
      continue;
    }

    let sortOrder = 0;
    const sortedQuestions = [...oldCourse.questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const oq of sortedQuestions) {
      if (oq.isDeleted === true) continue;
      const isApplication = oq.type === "application";
      const prompt = normalizeContent(oq.question);
      if (!prompt) {
        dataWarnings.push(`${oldCourse.title}: question ${oq.id} has no prompt text — skipped.`);
        continue;
      }

      const { data: inserted, error: qErr } = await supabase
        .from("questions")
        .insert({
          course_id: course.id,
          type: isApplication ? "application" : "objective",
          prompt,
          expected_answer: isApplication
            ? normalizeContent(oq.answerText || oq.explanation) || null
            : null,
          explanation: isApplication ? null : normalizeContent(oq.explanation) || null,
          sort_order: sortOrder++,
        })
        .select("id")
        .single();
      if (qErr || !inserted) {
        dataWarnings.push(`${oldCourse.title}: question ${oq.id} failed to insert — ${qErr?.message}`);
        continue;
      }

      if (!isApplication) {
        const rawOptions = Array.isArray(oq.options) ? oq.options : [];
        const optionRows = rawOptions
          .map((body, i) => ({ label: OPTION_LABELS[i], body: normalizeContent(body), i }))
          .filter((o) => o.label && o.body)
          .map((o) => ({
            question_id: inserted.id,
            label: o.label,
            body: o.body,
            is_correct: o.i === oq.correctAnswer,
            sort_order: o.i,
          }));
        if (optionRows.length < 2) {
          dataWarnings.push(`${oldCourse.title}: question ${oq.id} has fewer than 2 usable options.`);
        }
        if (!optionRows.some((o) => o.is_correct)) {
          dataWarnings.push(
            `${oldCourse.title}: question ${oq.id} — no option matched its correctAnswer index (${oq.correctAnswer}); check it manually.`,
          );
        }
        if (optionRows.length > 0) {
          const { error: optErr } = await supabase.from("question_options").insert(optionRows);
          if (optErr) dataWarnings.push(`${oldCourse.title}: question ${oq.id} options failed — ${optErr.message}`);
        }
      }

      questionsImported++;
    }
    coursesImported++;
  }

  console.log("\n--- Summary ---");
  console.log(`Department levels created: ${levelsCreated.length}`);
  for (const l of levelsCreated) console.log(`  - ${l}`);
  console.log(`Courses created: ${coursesCreated.length}`);
  for (const c of coursesCreated) console.log(`  - ${c}`);
  console.log(`Course thumbnails set: ${thumbnailsSet}`);
  console.log(`Courses imported into: ${coursesImported}`);
  console.log(`Questions imported: ${questionsImported}`);
  console.log(`Courses already had real questions (left untouched): ${skippedAlreadyHasQuestions.length}`);
  console.log(`Courses with no matching department (skipped — nothing imported for them): ${skippedNoDepartment.length}`);

  if (skippedNoDepartment.length > 0) {
    console.log("\nNo live department match for these old courses:");
    for (const c of skippedNoDepartment) {
      console.log(`  - [${c.department} / ${c.level}] "${c.title}" (${c.questions.length} questions)`);
    }
  }
  if (skippedAlreadyHasQuestions.length > 0) {
    console.log("\nAlready had real questions, left untouched:");
    for (const c of skippedAlreadyHasQuestions) {
      console.log(`  - [${c.department} / ${c.level}] "${c.title}" (${c.existingCount} existing)`);
    }
  }
  if (dataWarnings.length > 0) {
    console.log(`\n${dataWarnings.length} data warning(s) — review these manually in the admin UI:`);
    for (const w of dataWarnings) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
