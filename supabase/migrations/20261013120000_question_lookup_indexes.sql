-- ============================================================================
-- The questions/question_options tables have had zero indexes beyond their primary keys since
-- the very first migration — every single query filtering `questions` by course_id (every course
-- page, every quiz load) or `question_options` by question_id (every options lookup, including
-- the embedded select StudyPage/AdminQuestions now use) has been a full sequential table scan.
-- That was invisible with a mostly-empty database; now that the real import has landed
-- (107,505 questions, 490,495 option rows), those scans are slow enough to intermittently exceed
-- Supabase's statement timeout — exactly the "sometimes it loads, sometimes it just times out"
-- behavior reported against a large course. Nothing about the application code was wrong; the
-- schema was just never given the indexes its own query patterns need now that there's real data
-- volume behind them.
--
-- Not CONCURRENTLY: that can't run inside the transaction a migration applies in, and this app
-- has no real concurrent production traffic yet to protect against a brief write lock during
-- index creation.
-- ============================================================================

-- Every real query against `questions` filters by course_id, nearly always combined with status
-- (active vs. trashed) — composite index serves both together.
create index if not exists idx_questions_course_id_status on questions (course_id, status);

-- Every options lookup — the join StudyPage/AdminQuestions now embed, and the plain .in() filter
-- the admin CSV export/import paths still use — filters by question_id. A foreign key does NOT
-- implicitly index its own referencing column in Postgres; this has to be created explicitly.
create index if not exists idx_question_options_question_id on question_options (question_id);

-- Same missing-index gap, same tables' neighbor: every course page reads its outline sections by
-- course_id too.
create index if not exists idx_course_outline_sections_course_id on course_outline_sections (course_id);
