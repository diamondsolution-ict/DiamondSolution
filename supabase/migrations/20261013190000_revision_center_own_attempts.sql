-- ============================================================================
-- Fix: Revision Center (ActivityLog.tsx) showing some attempts with a blank question — a
-- student's own question_attempts row always stayed visible (its own RLS policy already
-- allows that), but the embedded `questions(...)` / `question_options(...)` join in that page's
-- query silently came back null for any question that's since been trashed, archived, or
-- edited out of 'active' status — questions_select_with_access and
-- question_options_select_with_access both require status = 'active' and deleted_at is null for
-- a non-staff read, with no exception for a question the student actually attempted. An admin
-- routinely retiring/replacing old questions therefore broke that question's row in every
-- student's OWN revision history who'd ever answered it, even though it's their own past work,
-- not catalog browsing.
--
-- Fix: add a carve-out — a student can always read a question (and its options) they have a
-- question_attempts row for, regardless of its current status/deleted_at. Department access is
-- deliberately NOT re-checked here: this is reviewing what they already did, not new access to
-- the catalog, so even a since-expired department grant shouldn't blank out history they earned
-- by actually doing the work. Still blocked for a suspended account, same as every other
-- student-facing read.
-- ============================================================================

drop policy "questions_select_with_access" on questions;
create policy "questions_select_with_access"
  on questions for select
  using (
    is_moderator_or_admin()
    or (
      not is_suspended()
      and (
        (
          status = 'active'
          and deleted_at is null
          and has_department_access((select department_id from courses where courses.id = questions.course_id))
        )
        or exists (
          select 1 from question_attempts qa
          where qa.question_id = questions.id and qa.user_id = auth.uid()
        )
      )
    )
  );

drop policy "question_options_select_with_access" on question_options;
create policy "question_options_select_with_access"
  on question_options for select
  using (
    is_moderator_or_admin()
    or (
      not is_suspended()
      and (
        exists (
          select 1 from questions q
          join courses c on c.id = q.course_id
          where q.id = question_options.question_id
            and q.status = 'active'
            and q.deleted_at is null
            and has_department_access(c.department_id)
        )
        or exists (
          select 1 from question_attempts qa
          where qa.question_id = question_options.question_id and qa.user_id = auth.uid()
        )
      )
    )
  );
