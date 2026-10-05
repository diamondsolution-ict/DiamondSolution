-- ============================================================================
-- Seeds department_levels + courses from the original Firebase app's hardcoded
-- `DEPARTMENT_STRUCTURE` (Tobinioluwa/Diamond-Solution-app's src/constants.ts). Run this once,
-- after 01-departments.sql, the same manual way (Supabase SQL Editor, or
-- `psql <connection string> -f supabase/seed/02-courses.sql`).
--
-- WHAT THIS DOES NOT INCLUDE, on purpose:
-- - No questions. These courses are catalog entries only (title/level/department) — they will
--   show up in /courses but render empty in StudyPage until real questions are added via
--   /admin/courses/:id/questions (hand-entered or CSV-imported, per
--   06-SUPABASE-DEPLOYMENT-CHECKLIST.md step 11). Seeding plausible-looking fake questions
--   would be worse than an honest "no content yet" state.
-- - The old app's "category" dimension (MCQ Practice / Theoretical Questions / OCHEI Question
--   Bank / Application Questions / Object Questions / Practical Application / ...) is NOT
--   reproduced. That schema had the same course title repeated under multiple categories at
--   the same level (e.g. BMLS 300L "Hematology" existed as four near-duplicate rows: one per
--   category) — this schema's `courses` table is just department + level + title, matching
--   02-DATA-MODEL-AND-SECURITY.md's simpler model, so one category's course list was kept per
--   department/level (the one closest to "the main objective practice bank") and the
--   duplicates dropped rather than carried forward as confusing near-identical entries. Where a
--   department had two genuinely different non-overlapping category course lists (MBBS's
--   "Professional Exam" covers MB1/MB3/MB4, "Object Questions" covers MB2), both are kept
--   since there's no actual overlap.
-- - BMLS's and Nursing's old `levels` arrays each had a category name leaking in as if it were
--   an academic level ("Ochei Questions", "Application Questions") — not reproduced; only real
--   academic levels are seeded.
--
-- Safe to re-run: `on conflict do nothing` throughout.
-- ============================================================================

insert into department_levels (department_id, label, sort_order)
select d.id, l.label, l.sort_order
from departments d
join (values
  ('Pharmacy', '200L', 0), ('Pharmacy', '300L', 1), ('Pharmacy', '400L', 2), ('Pharmacy', '500L', 3),
  ('Physiotherapy', '200L', 0), ('Physiotherapy', '300L', 1), ('Physiotherapy', '400L', 2), ('Physiotherapy', '500L', 3),
  ('Biomedical Laboratory Science (BMLS)', '200L', 0), ('Biomedical Laboratory Science (BMLS)', '300L', 1),
  ('Biomedical Laboratory Science (BMLS)', '400L', 2), ('Biomedical Laboratory Science (BMLS)', '500L', 3),
  ('Medicine and Surgery (MBBS)', 'MB 1', 0), ('Medicine and Surgery (MBBS)', 'MB 2', 1),
  ('Medicine and Surgery (MBBS)', 'MB 3', 2), ('Medicine and Surgery (MBBS)', 'MB 4', 3),
  ('Nursing', '200L', 0), ('Nursing', '300L', 1), ('Nursing', '400L', 2), ('Nursing', '500L', 3)
) as l(department_name, label, sort_order)
  on l.department_name = d.name
on conflict (department_id, label) do nothing;

-- department_name, level_label, course_title
-- Not ON COMMIT DROP: both the SQL Editor and a plain `psql -f` run each statement as its own
-- auto-committed transaction, which would drop this table before the INSERT below ever ran.
-- Dropped explicitly at the end of this file instead.
drop table if exists _course_seed;
create temporary table _course_seed (department_name text, level_label text, title text);
insert into _course_seed (department_name, level_label, title) values
  -- Pharmacy — "General" category
  ('Pharmacy', '200L', 'Physiology'),
  ('Pharmacy', '200L', 'Inorganic Pharmaceutical Chemistry'),
  ('Pharmacy', '200L', 'Pharmaceutical Microbiology'),
  ('Pharmacy', '200L', 'Pharmacognosy'),
  ('Pharmacy', '200L', 'Physical Pharmaceutical Chemistry 1'),
  ('Pharmacy', '300L', 'Applied Pharmaceutical Microbiology'),
  ('Pharmacy', '300L', 'Biochemistry'),
  ('Pharmacy', '300L', 'Drug of Biological Origin'),
  ('Pharmacy', '300L', 'Organic Pharmaceutical Chemistry'),
  ('Pharmacy', '300L', 'Pharmacology'),
  ('Pharmacy', '300L', 'Physical Pharmaceutical Chemistry 2'),
  ('Pharmacy', '300L', 'Physical Pharmaceutics'),
  ('Pharmacy', '300L', 'Pharmacognosy'),
  ('Pharmacy', '400L', 'Applied Pharmaceutical Microbiology'),
  ('Pharmacy', '400L', 'Chemotherapy'),
  ('Pharmacy', '400L', 'Herbal Medicine and Phototherapy'),
  ('Pharmacy', '400L', 'Medicinal Chemistry'),
  ('Pharmacy', '400L', 'Biopharmacy and Pharmacokinetics'),
  ('Pharmacy', '400L', 'Pharmaceutical Biotechnology'),
  ('Pharmacy', '400L', 'Drug Dosage Form II'),
  ('Pharmacy', '400L', 'Pharmacotherapeutics'),
  ('Pharmacy', '400L', 'Traditional Medicine'),
  ('Pharmacy', '400L', 'Veterinary Pharmacy'),
  ('Pharmacy', '500L', 'Drug Metabolism'),
  ('Pharmacy', '500L', 'Endocrine and Nutritional Disorder'),
  ('Pharmacy', '500L', 'Immunology'),
  ('Pharmacy', '500L', 'Pharmaceutical Clinical Pharmacology'),
  ('Pharmacy', '500L', 'Pharmacogenetics and Clinical Pharmacy'),
  ('Pharmacy', '500L', 'Pharmacotherapy and Clinical Pharmacokinetics'),
  ('Pharmacy', '500L', 'Public Health Pharmacy'),
  ('Pharmacy', '500L', 'Systemic Toxicology'),
  ('Pharmacy', '500L', 'Total Quality System'),

  -- Physiotherapy — "General" category
  ('Physiotherapy', '200L', 'Anatomy'),
  ('Physiotherapy', '200L', 'Physiology'),
  ('Physiotherapy', '200L', 'Biochemistry'),
  ('Physiotherapy', '300L', 'Kinesiology'),
  ('Physiotherapy', '300L', 'Electrotherapy'),
  ('Physiotherapy', '300L', 'Medical Science'),
  ('Physiotherapy', '400L', 'Orthopedics'),
  ('Physiotherapy', '400L', 'Neurology'),
  ('Physiotherapy', '400L', 'Pediatrics'),
  ('Physiotherapy', '500L', 'Clinical Practice'),
  ('Physiotherapy', '500L', 'Professional Ethics'),

  -- BMLS — "MCQ Practice" category (the main objective practice bank)
  ('Biomedical Laboratory Science (BMLS)', '200L', 'Anatomy'),
  ('Biomedical Laboratory Science (BMLS)', '200L', 'Physiology'),
  ('Biomedical Laboratory Science (BMLS)', '200L', 'Biochemistry'),
  ('Biomedical Laboratory Science (BMLS)', '300L', 'Hematology'),
  ('Biomedical Laboratory Science (BMLS)', '300L', 'Chemical Pathology'),
  ('Biomedical Laboratory Science (BMLS)', '300L', 'Histopathology'),
  ('Biomedical Laboratory Science (BMLS)', '300L', 'Medical Microbiology'),
  ('Biomedical Laboratory Science (BMLS)', '300L', 'Immunology'),
  ('Biomedical Laboratory Science (BMLS)', '400L', 'Hematology'),
  ('Biomedical Laboratory Science (BMLS)', '400L', 'Chemical Pathology'),
  ('Biomedical Laboratory Science (BMLS)', '400L', 'Histopathology'),
  ('Biomedical Laboratory Science (BMLS)', '400L', 'Medical Microbiology'),
  ('Biomedical Laboratory Science (BMLS)', '400L', 'Virology'),
  ('Biomedical Laboratory Science (BMLS)', '500L', 'Hematology'),
  ('Biomedical Laboratory Science (BMLS)', '500L', 'Chemical Pathology'),
  ('Biomedical Laboratory Science (BMLS)', '500L', 'Histopathology'),
  ('Biomedical Laboratory Science (BMLS)', '500L', 'Medical Microbiology'),

  -- MBBS — "Professional Exam" (MB1/MB3/MB4) + "Object Questions" (MB2, no overlap)
  ('Medicine and Surgery (MBBS)', 'MB 1', 'Gross Anatomy'),
  ('Medicine and Surgery (MBBS)', 'MB 1', 'Histology'),
  ('Medicine and Surgery (MBBS)', 'MB 1', 'Neuroanatomy'),
  ('Medicine and Surgery (MBBS)', 'MB 1', 'Embryology'),
  ('Medicine and Surgery (MBBS)', 'MB 1', 'Medical Biochemistry'),
  ('Medicine and Surgery (MBBS)', 'MB 1', 'Physiology'),
  ('Medicine and Surgery (MBBS)', 'MB 2', 'Chemical Pathology'),
  ('Medicine and Surgery (MBBS)', 'MB 2', 'Histopathology'),
  ('Medicine and Surgery (MBBS)', 'MB 2', 'Medical Microbiology'),
  ('Medicine and Surgery (MBBS)', 'MB 2', 'Hematology'),
  ('Medicine and Surgery (MBBS)', 'MB 2', 'Pharmacology'),
  ('Medicine and Surgery (MBBS)', 'MB 3', 'Gynecology'),
  ('Medicine and Surgery (MBBS)', 'MB 3', 'Obstetrics'),
  ('Medicine and Surgery (MBBS)', 'MB 3', 'Internal Medicine'),
  ('Medicine and Surgery (MBBS)', 'MB 3', 'Surgery'),
  ('Medicine and Surgery (MBBS)', 'MB 3', 'Paediatrics'),
  ('Medicine and Surgery (MBBS)', 'MB 4', 'Anaesthesiology'),
  ('Medicine and Surgery (MBBS)', 'MB 4', 'Dentistry'),
  ('Medicine and Surgery (MBBS)', 'MB 4', 'Opthalmology'),
  ('Medicine and Surgery (MBBS)', 'MB 4', 'Othorhinolarygology'),
  ('Medicine and Surgery (MBBS)', 'MB 4', 'Psychiatry'),
  ('Medicine and Surgery (MBBS)', 'MB 4', 'Radiology'),

  -- Nursing — "General" category
  ('Nursing', '200L', 'Anatomy'),
  ('Nursing', '200L', 'Physiology'),
  ('Nursing', '200L', 'Biochemistry'),
  ('Nursing', '300L', 'Reproductive System'),
  ('Nursing', '300L', 'Human Behaviour and Health'),
  ('Nursing', '300L', 'Maternal and Child Health'),
  ('Nursing', '300L', 'Medical Surgical Nursing'),
  ('Nursing', '300L', 'Mental Health and Behaviour'),
  ('Nursing', '300L', 'Midwifery'),
  ('Nursing', '400L', 'Maternal and Child Health'),
  ('Nursing', '400L', 'Medical Surgical Nursing'),
  ('Nursing', '400L', 'Midwifery'),
  ('Nursing', '500L', 'Intensive Care Nursing'),
  ('Nursing', '500L', 'Gerontological Nursing'),
  ('Nursing', '500L', 'Midwifery'),
  ('Nursing', '500L', 'Opthalmic Nursing'),
  ('Nursing', '500L', 'Perioperative Nursing'),
  ('Nursing', '500L', 'Neurological Disorder');

insert into courses (department_id, level_id, title, slug, default_question_type, status)
select
  d.id,
  dl.id,
  s.title,
  -- slugify: lowercase, non-alphanumeric runs -> hyphen, trim leading/trailing hyphens
  trim(both '-' from regexp_replace(lower(s.title), '[^a-z0-9]+', '-', 'g')),
  'objective',
  'published'
from _course_seed s
join departments d on d.name = s.department_name
join department_levels dl on dl.department_id = d.id and dl.label = s.level_label
on conflict (department_id, level_id, slug) do nothing;

drop table _course_seed;
