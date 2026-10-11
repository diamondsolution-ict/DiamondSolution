-- ============================================================================
-- Temporary placeholder questions — one per course that has zero real questions, so the
-- catalog isn't empty while the real question bank is still being imported (hand-entry via
-- /admin/courses/:id/questions, CSV import, or scripts/migrate-questions-from-firebase.mjs).
--
-- Each placeholder is an honest, obviously-fake notice — NEVER disguised as real exam content.
-- This platform is exam prep for health-science students (Nursing, Pharmacy, MBBS, ...);
-- auto-generating plausible-looking clinical trivia with an AI-picked "correct answer" would
-- risk teaching something actually wrong, which is a real harm here, not just a cosmetic one.
-- A clearly-labeled placeholder avoids that entirely while still giving every course *some*
-- content to show instead of an empty state.
--
-- Every placeholder's explanation carries the exact marker string below — the Firebase
-- migration script (scripts/migrate-questions-from-firebase.mjs) checks for it and
-- automatically replaces (not skips) a placeholder-only course once real questions exist for
-- it. Don't change this string without updating that script's matching constant too.
--
-- Safe to re-run: only touches courses that currently have zero active questions.
-- ============================================================================

do $$
declare
  c record;
  v_question_id uuid;
  v_marker constant text :=
    '[PLACEHOLDER — auto-generated, safe to delete once real questions are added]';
begin
  for c in
    select co.id, co.title, co.default_question_type
    from courses co
    where co.deleted_at is null
      and not exists (
        select 1 from questions q
        where q.course_id = co.id and q.status = 'active'
      )
  loop
    insert into questions (course_id, type, prompt, expected_answer, explanation, sort_order)
    values (
      c.id,
      c.default_question_type,
      'Placeholder — real questions for "' || c.title || '" are coming soon.',
      case
        when c.default_question_type = 'application'
          then 'This is a temporary placeholder, not real exam content. Check back once the real question bank has been imported.'
        else null
      end,
      v_marker,
      0
    )
    returning id into v_question_id;

    if c.default_question_type = 'objective' then
      insert into question_options (question_id, label, body, is_correct, sort_order)
      values
        (v_question_id, 'A', 'This course has no real questions yet — this is a placeholder', true, 0),
        (v_question_id, 'B', '(placeholder option)', false, 1),
        (v_question_id, 'C', '(placeholder option)', false, 2);
    end if;
  end loop;
end $$;
