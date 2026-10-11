// SUPERSEDED for the real import by scripts/import-questions-from-export.mjs — this script
// requires live Firestore access (a service-account key for the old project) and only matches
// against courses supabase/seed/02-courses.sql already created, silently skipping anything
// else. The exporter tool + JSON export we actually used instead needs neither Firebase
// credentials nor that narrower matching; use import-questions-from-export.mjs unless you
// specifically need to pull straight from live Firestore again. Left here for reference.
//
// One-time migration: pulls the real question bank out of the old Firebase app's Firestore
// (`courses/{id}` + `courses/{id}/content` subcollection — see Tobinioluwa/Diamond-Solution-app's
// src/pages/AdminDashboard.tsx) and inserts it straight into this app's Supabase `questions`/
// `question_options` tables, matching each old course to its new one by
// (department name, level label, course title).
//
// Run this on YOUR machine, not in a sandbox — it needs network access to both Firebase and
// Supabase, and two credentials that should never be pasted into a chat:
//
//   1. A Firebase service-account key for the OLD project:
//        Firebase Console → old project → Project Settings → Service Accounts →
//        "Generate new private key" → save the JSON file somewhere local (NOT in this repo).
//   2. This app's Supabase service-role key (bypasses RLS — only ever used server-side):
//        Supabase Dashboard → this project → Project Settings → API → service_role key.
//
// Usage:
//   npm install firebase-admin   (one-time, devDependency)
//   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/old-project-key.json \
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//     node scripts/migrate-questions-from-firebase.mjs --dry-run
//
// Review the dry-run report (it prints every course it would import into, skip because the new
// catalog has no matching course, or skip because the new course already has real questions),
// then re-run without --dry-run to actually write.
//
// A course whose only active question is the temporary placeholder from
// supabase/seed/03-placeholder-questions.sql is NOT skipped — its placeholder is trashed and
// real content is imported in its place. Only a course with genuine existing content is left
// untouched.
//
// Safe to re-run: any course that already has real (non-placeholder) active questions is
// skipped, so a second run only picks up courses that were skipped or failed the first time.

import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const OPTION_LABELS = ["A", "B", "C", "D", "E"];
// Must match supabase/seed/03-placeholder-questions.sql's v_marker exactly — a course whose
// only active question(s) carry this marker has no real content yet, so this script replaces
// it (trashes the placeholder, imports for real) instead of treating it as "already has
// questions" and skipping.
const PLACEHOLDER_MARKER =
  "[PLACEHOLDER — auto-generated, safe to delete once real questions are added]";

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

// Mirrors the old app's formatFormattedText() (src/lib/utils.ts there) — Firestore question
// text sometimes carries literal "<br>" tags or escaped "\n"/"\r\n" sequences (two characters,
// not a real line break) from however it was originally entered/imported. Left as-is, those
// render as literal garbage in a plain <p>/<textarea> here instead of a line break. Applied to
// every piece of question text this script writes.
function normalizeContent(val) {
  if (val === null || val === undefined) return "";
  let str = String(val);
  str = str.replace(/<br\s*\/?>/gi, "\n");
  str = str.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
  str = str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return str.trim();
}

async function main() {
  const serviceAccountPath = env("FIREBASE_SERVICE_ACCOUNT_PATH");
  const supabaseUrl = env("SUPABASE_URL");
  const supabaseServiceKey = env("SUPABASE_SERVICE_ROLE_KEY");

  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  initializeApp({ credential: cert(serviceAccount) });
  const firestore = getFirestore();

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  console.log(DRY_RUN ? "Running in --dry-run mode (no writes).\n" : "Running for real — this will write to Supabase.\n");

  // ---- Build a lookup of every course already in the new catalog -----------------------
  const { data: newCourses, error: coursesErr } = await supabase
    .from("courses")
    .select("id, title, department_id, level_id, default_question_type, departments(name), department_levels(label)")
    .is("deleted_at", null);
  if (coursesErr) throw coursesErr;

  const courseByKey = new Map();
  for (const c of newCourses) {
    const key = `${normalize(c.departments.name)}::${normalize(c.department_levels.label)}::${normalize(c.title)}`;
    courseByKey.set(key, c);
  }

  // ---- Pull every course from the old Firestore project ---------------------------------
  const oldCoursesSnap = await firestore.collection("courses").get();
  const oldCourses = oldCoursesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.isDeleted !== true);

  console.log(`Found ${oldCourses.length} active course(s) in the old Firestore project.\n`);

  const skippedNoMatch = [];
  const skippedAlreadyHasQuestions = [];
  const dataWarnings = [];
  let coursesImported = 0;
  let questionsImported = 0;

  for (const oldCourse of oldCourses) {
    const key = `${normalize(oldCourse.department)}::${normalize(oldCourse.level)}::${normalize(oldCourse.title)}`;
    const newCourse = courseByKey.get(key);

    if (!newCourse) {
      skippedNoMatch.push(oldCourse);
      continue;
    }

    const { data: existingRows, error: countErr } = await supabase
      .from("questions")
      .select("id, explanation")
      .eq("course_id", newCourse.id)
      .eq("status", "active");
    if (countErr) throw countErr;

    const existingCount = existingRows?.length ?? 0;
    const isPlaceholderOnly =
      existingCount > 0 &&
      existingRows.every((q) => q.explanation === PLACEHOLDER_MARKER);

    if (existingCount > 0 && !isPlaceholderOnly) {
      skippedAlreadyHasQuestions.push({ ...oldCourse, existingCount });
      continue;
    }

    if (isPlaceholderOnly) {
      console.log(
        `${DRY_RUN ? "[dry-run] would replace" : "Replacing"} placeholder question in "${newCourse.title}" with real content…`,
      );
      if (!DRY_RUN) {
        await supabase
          .from("questions")
          .update({ status: "trashed", deleted_at: new Date().toISOString() })
          .in("id", existingRows.map((q) => q.id));
      }
    }

    const contentSnap = await firestore
      .collection("courses")
      .doc(oldCourse.id)
      .collection("content")
      .get();
    const oldQuestions = contentSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((q) => q.isDeleted !== true)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (oldQuestions.length === 0) continue;

    console.log(
      `${DRY_RUN ? "[dry-run] would import" : "Importing"} ${oldQuestions.length} question(s) → ` +
        `"${newCourse.title}" (${oldCourse.department} / ${oldCourse.level})`,
    );

    if (DRY_RUN) {
      coursesImported++;
      questionsImported += oldQuestions.length;
      continue;
    }

    let sortOrder = 0;
    for (const oq of oldQuestions) {
      const isApplication = oq.type === "application";
      const prompt = normalizeContent(oq.question);
      if (!prompt) {
        dataWarnings.push(`${oldCourse.title}: question ${oq.id} has no prompt text — skipped.`);
        continue;
      }

      const { data: inserted, error: qErr } = await supabase
        .from("questions")
        .insert({
          course_id: newCourse.id,
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
  console.log(`Courses imported into: ${coursesImported}`);
  console.log(`Questions imported: ${questionsImported}`);
  console.log(`Courses already had questions (skipped): ${skippedAlreadyHasQuestions.length}`);
  console.log(`Courses with no match in the new catalog (skipped): ${skippedNoMatch.length}`);

  if (skippedNoMatch.length > 0) {
    console.log(
      "\nNo matching course in the new catalog (the new catalog deliberately dropped some of the " +
        "old app's duplicate-category courses — see supabase/seed/02-courses.sql's header comment). " +
        "Add a course manually first if you want these questions kept:",
    );
    for (const c of skippedNoMatch) {
      console.log(`  - [${c.department} / ${c.level}] "${c.title}"`);
    }
  }
  if (skippedAlreadyHasQuestions.length > 0) {
    console.log("\nAlready had questions, left untouched:");
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
  console.error("Migration failed:", err);
  process.exit(1);
});
