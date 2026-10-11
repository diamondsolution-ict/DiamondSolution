-- ============================================================================
-- record_question_attempt() stamped daily_practice_stats with current_date — the database
-- server's (UTC) calendar date, not the student's. A session done late in the student's local
-- day could land on the "wrong" UTC date relative to the Dashboard's locally-computed 7-day
-- window, making real activity look missing. Accept the student's local date explicitly from
-- the client instead; `default current_date` keeps any other/future caller working unchanged.
-- ============================================================================

create or replace function record_question_attempt(
  p_course_id uuid,
  p_question_id uuid,
  p_selected_option_id uuid,
  p_result attempt_result,
  p_time_taken_seconds int,
  p_current_order int,
  p_completed boolean,
  p_practice_date date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_counts_as_correct boolean := p_result in ('correct', 'applied');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into question_attempts (
    user_id, course_id, question_id, selected_option_id, result, time_taken_seconds
  ) values (
    v_user_id, p_course_id, p_question_id, p_selected_option_id, p_result, p_time_taken_seconds
  );

  insert into daily_practice_stats (user_id, practice_date, attempted, correct, study_duration_seconds)
  values (v_user_id, p_practice_date, 1, case when v_counts_as_correct then 1 else 0 end, coalesce(p_time_taken_seconds, 0))
  on conflict (user_id, practice_date) do update
    set attempted = daily_practice_stats.attempted + 1,
        correct = daily_practice_stats.correct + case when v_counts_as_correct then 1 else 0 end,
        study_duration_seconds = daily_practice_stats.study_duration_seconds + coalesce(p_time_taken_seconds, 0);

  insert into study_progress (user_id, course_id, current_order, completed, score_correct, score_total, updated_at)
  values (v_user_id, p_course_id, p_current_order, p_completed, case when v_counts_as_correct then 1 else 0 end, 1, now())
  on conflict (user_id, course_id) do update
    set current_order = p_current_order,
        completed = p_completed,
        score_correct = study_progress.score_correct + case when v_counts_as_correct then 1 else 0 end,
        score_total = study_progress.score_total + 1,
        updated_at = now();
end;
$$;
