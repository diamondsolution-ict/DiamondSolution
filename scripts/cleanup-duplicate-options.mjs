// One-time cleanup for a pagination bug in an earlier version of backfill-missing-options.mjs
// (fixed in this repo's history — see that file's own comments): before the fix, that script
// could only ever read the first 1000 rows of question_options when checking "does this
// question already have options" (Supabase/PostgREST caps a single request at 1000 rows,
// silently). A question whose real existing options weren't within that first page could be
// wrongly treated as having none, and get a duplicate set of options inserted into it.
//
// This finds every question with more than 5 option rows (5 — OPTION_LABELS A-E — is the
// maximum any real question should ever have) and removes the duplicate set. It only touches a
// question when its extra rows are a *clean* duplication: every option label present appears
// the same whole number of times, and every row sharing a label has byte-for-byte identical
// body/is_correct content. Anything that doesn't fit that exact shape is left completely alone
// and reported for manual review — never guessed at or deleted speculatively.
//
// Usage (same env vars/working directory as the other import scripts):
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//     node scripts/cleanup-duplicate-options.mjs --dry-run
//
// Review the dry-run report, then re-run without --dry-run. Safe to re-run: a question already
// at 5 or fewer options is never touched.

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const OPTION_LABELS = ["A", "B", "C", "D", "E"];
const PAGE_SIZE = Number(process.env.BACKFILL_PAGE_SIZE) || 1000;
const DELETE_CHUNK_SIZE = 200;

function env(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. See this script's header comment.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const supabaseUrl = env("SUPABASE_URL");
  const supabaseServiceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  console.log(DRY_RUN ? "Running in --dry-run mode (no writes).\n" : "Running for real — this will write to Supabase.\n");

  async function fetchAll(table, columns, applyFilters) {
    const rows = [];
    let from = 0;
    for (;;) {
      let query = supabase.from(table).select(columns).order("id").range(from, from + PAGE_SIZE - 1);
      if (applyFilters) query = applyFilters(query);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return rows;
  }

  const allOptions = await fetchAll("question_options", "id, question_id, label, body, is_correct, sort_order");

  const byQuestion = new Map();
  for (const o of allOptions) {
    if (!byQuestion.has(o.question_id)) byQuestion.set(o.question_id, []);
    byQuestion.get(o.question_id).push(o);
  }

  const affected = [...byQuestion.entries()].filter(([, rows]) => rows.length > OPTION_LABELS.length);
  console.log(`${affected.length} question(s) found with more than ${OPTION_LABELS.length} option rows.\n`);
  if (affected.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const idsToDelete = [];
  let cleaned = 0;
  let skipped = 0;
  const skippedDetails = [];

  for (const [questionId, rows] of affected) {
    const byLabel = new Map();
    for (const r of rows) {
      if (!byLabel.has(r.label)) byLabel.set(r.label, []);
      byLabel.get(r.label).push(r);
    }

    // Every label must repeat the same number of times (N >= 2), and every row sharing a label
    // must be byte-for-byte identical in body/is_correct — otherwise this isn't a clean "the
    // whole set got inserted twice" duplication, and nothing here is touched.
    const counts = new Set([...byLabel.values()].map((group) => group.length));
    const allLabelsPresent = OPTION_LABELS.every((l) => byLabel.has(l));
    const consistentContent = [...byLabel.values()].every((group) =>
      group.every((r) => r.body === group[0].body && r.is_correct === group[0].is_correct),
    );

    if (!allLabelsPresent || counts.size !== 1 || [...counts][0] < 2 || !consistentContent) {
      skipped++;
      skippedDetails.push({
        questionId,
        reason: `${rows.length} option rows don't form a clean duplicate set (mismatched labels or content) — review manually`,
      });
      continue;
    }

    // Keep the lowest sort_order copy of each label (the original insert), delete the rest.
    for (const group of byLabel.values()) {
      const sorted = [...group].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
      for (const extra of sorted.slice(1)) idsToDelete.push(extra.id);
    }
    cleaned++;
    console.log(`${DRY_RUN ? "[dry-run] would remove" : "Removing"} ${rows.length - OPTION_LABELS.length} duplicate option row(s) for question ${questionId}`);
  }

  if (!DRY_RUN && idsToDelete.length > 0) {
    for (let i = 0; i < idsToDelete.length; i += DELETE_CHUNK_SIZE) {
      const chunk = idsToDelete.slice(i, i + DELETE_CHUNK_SIZE);
      const { error } = await supabase.from("question_options").delete().in("id", chunk);
      if (error) throw error;
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Questions cleaned: ${cleaned} (${idsToDelete.length} duplicate row(s) ${DRY_RUN ? "would be" : ""} removed)`);
  console.log(`Questions skipped (need manual review): ${skipped}`);
  if (skippedDetails.length > 0) {
    for (const { questionId, reason } of skippedDetails) console.log(`  - [question ${questionId}] ${reason}`);
  }
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
