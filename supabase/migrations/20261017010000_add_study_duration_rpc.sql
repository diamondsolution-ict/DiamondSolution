-- ============================================================================
-- Fix: the Daily Time Spent chart undercounted real study time. record_question_attempt()'s
-- p_time_taken_seconds only ever measured from when a question appeared to the moment Submit
-- was clicked (see StudyPage.tsx's questionStartRef) — time spent reading the explanation or
-- expected-answer panel AFTERWARD, while still on the Q&A page, was never counted at all,
-- because the next question's clock only starts once the student actually clicks Next. That's
-- a real gap, not just a rounding error: a student who reads every explanation for 20-30s adds
-- up to many uncounted minutes a session.
--
-- Fix is client-side (StudyPage.tsx now tracks "time spent on this question after submitting,
-- until moving to the next one" and reports it separately) plus this one small RPC to add that
-- extra time to today's study_duration_seconds — deliberately NOT through
-- record_question_attempt(), since that also logs a question_attempts row and bumps `attempted`
-- /study_progress, none of which should happen again for time spent re-reading an already-
-- answered question.
-- ============================================================================

create or replace function add_study_duration(p_seconds int, p_practice_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_seconds is null or p_seconds <= 0 then
    return;
  end if;

  insert into daily_practice_stats (user_id, practice_date, attempted, correct, study_duration_seconds)
  values (v_user_id, p_practice_date, 0, 0, p_seconds)
  on conflict (user_id, practice_date) do update
    set study_duration_seconds = daily_practice_stats.study_duration_seconds + p_seconds;
end;
$$;
