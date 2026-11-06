-- ============================================================================
-- Two explicitly requested changes:
--
-- 1. Referral code is optional at signup again — reverses
--    20261016010000_require_referral_code_at_signup.sql's mandatory-with-no-exceptions
--    policy back to the original "opt-in, not auto-enrolled" design
--    (03-BUSINESS-RULES-REDESIGN.md §1). A missing or unrecognized code is once again
--    silently ignored (the account is still created, just no referrals row) rather than
--    aborting the signup — same behavior the very first version of handle_new_user() had,
--    just keeping the later case/whitespace-insensitive code matching, which was a genuine
--    improvement unrelated to mandatory-ness.
--
-- 2. A 14-day free trial for brand-new accounts with no real department access yet: full
--    read access to every department's course content, capped at 3 "theory" (application-
--    type) and 50 "objective"-type questions actually ANSWERED per day. After 14 days (from
--    signup, not configurable per-department — this is an account-wide perk, not something
--    that resets per department), a student with no paid/exempted access goes back to seeing
--    the normal paywall everywhere, same as before this migration ever existed.
--
-- Mechanics:
--   - has_department_access() gets a third OR clause: true for the first trial_days after
--     profiles.created_at, with no other condition — this is what lets a trial student read
--     ANY department's questions (via the existing questions/question_options RLS, which
--     already funnels entirely through this one function). Existing accounts (signed up more
--     than trial_days ago) get nothing from this clause — it only ever helps genuinely new
--     signups, never opens access for long-time unpaid accounts.
--   - record_question_attempt() is where the daily cap is actually enforced: it looks up
--     whether the student has a REAL grant (access_grants row, paid or admin-exempted — see
--     20261025010000) for the question's own department. If yes, nothing changes — unlimited,
--     exactly today's behavior, whether or not they're also still inside their trial window.
--     If no, it's a trial-sourced attempt: reject once today's count for that question's type
--     already meets the configured limit, with a clear error the UI surfaces (not swallowed
--     like the generic network-failure case this function already logs-and-continues on).
--   - question_attempts gains `via_trial` (so the cap query only ever counts attempts that
--     were actually trial-sourced, never attempts in a department the student legitimately
--     paid for) and `practice_date` (the student's own local calendar date, supplied by the
--     client exactly like daily_practice_stats already requires — deriving the day from
--     attempted_at's UTC timestamp instead would reintroduce the exact midnight/timezone bug
--     20261011180000_record_attempt_local_date.sql already had to fix once).
--   - app_settings gains the three trial numbers (admin-editable later from Admin -> Settings,
--     not wired into that screen in this pass) so they're never hardcoded in application code.
-- ============================================================================

alter table app_settings add column trial_days int not null default 14 check (trial_days >= 0);
alter table app_settings add column trial_daily_theory_limit int not null default 3 check (trial_daily_theory_limit >= 0);
alter table app_settings add column trial_daily_objective_limit int not null default 50 check (trial_daily_objective_limit >= 0);

alter table question_attempts add column via_trial boolean not null default false;
alter table question_attempts add column practice_date date;
update question_attempts set practice_date = attempted_at::date where practice_date is null;
alter table question_attempts alter column practice_date set not null;
alter table question_attempts alter column practice_date set default current_date;
create index question_attempts_trial_cap_idx
  on question_attempts (user_id, practice_date, via_trial) where via_trial;

-- ----------------------------------------------------------------------------
-- 1. Referral code optional again
-- ----------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_code text := new.raw_user_meta_data ->> 'referral_code';
begin
  insert into public.profiles (
    user_id, display_name, username, university,
    department_id, phone, whatsapp, language
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'university',
    nullif(new.raw_user_meta_data ->> 'department_id', '')::uuid,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'whatsapp',
    coalesce(new.raw_user_meta_data ->> 'language', 'en')
  )
  on conflict (user_id) do nothing;

  if v_code is not null and trim(v_code) <> '' then
    select user_id into v_referrer_id
    from affiliate_profiles
    where upper(trim(referral_code)) = upper(trim(v_code));

    if v_referrer_id is not null and v_referrer_id <> new.id then
      insert into referrals (referred_user_id, referrer_user_id)
      values (new.id, v_referrer_id)
      on conflict (referred_user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Free trial
-- ----------------------------------------------------------------------------

create or replace function has_department_access(dept uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_moderator_or_admin()
    or exists (
      select 1 from access_grants
      where user_id = auth.uid()
        and department_id = dept
        and (expires_at is null or expires_at > now())
    )
    or exists (
      select 1 from profiles p, app_settings s
      where p.user_id = auth.uid()
        and s.id = 1
        and now() < p.created_at + (s.trial_days || ' days')::interval
    );
$$;

-- Lets the frontend show a trial banner/countdown and remaining daily counts before a
-- student runs into a hard rejection from record_question_attempt() below.
create or replace function trial_status()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_created_at timestamptz;
  v_trial_days int;
  v_theory_limit int;
  v_objective_limit int;
  v_days_left int;
  v_theory_used int;
  v_objective_used int;
begin
  if v_user_id is null then
    return jsonb_build_object('in_trial', false);
  end if;

  select created_at into v_created_at from profiles where user_id = v_user_id;
  select trial_days, trial_daily_theory_limit, trial_daily_objective_limit
    into v_trial_days, v_theory_limit, v_objective_limit
    from app_settings where id = 1;

  if v_created_at is null or now() >= v_created_at + (v_trial_days || ' days')::interval then
    return jsonb_build_object('in_trial', false);
  end if;

  v_days_left := greatest(0, ceil(extract(epoch from (v_created_at + (v_trial_days || ' days')::interval - now())) / 86400)::int);

  select count(*) filter (where q.type = 'application'), count(*) filter (where q.type = 'objective')
    into v_theory_used, v_objective_used
  from question_attempts qa
  join questions q on q.id = qa.question_id
  where qa.user_id = v_user_id
    and qa.via_trial = true
    and qa.practice_date = current_date;

  return jsonb_build_object(
    'in_trial', true,
    'days_left', v_days_left,
    'theory_used', coalesce(v_theory_used, 0),
    'theory_limit', v_theory_limit,
    'objective_used', coalesce(v_objective_used, 0),
    'objective_limit', v_objective_limit
  );
end;
$$;

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
  v_department_id uuid;
  v_question_type question_type;
  v_has_real_grant boolean;
  v_via_trial boolean;
  v_trial_days int;
  v_theory_limit int;
  v_objective_limit int;
  v_created_at timestamptz;
  v_today_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.department_id, q.type into v_department_id, v_question_type
  from courses c
  join questions q on q.course_id = c.id
  where c.id = p_course_id and q.id = p_question_id;

  if v_department_id is null then
    raise exception 'Question not found for this course.';
  end if;

  select exists (
    select 1 from access_grants
    where user_id = v_user_id
      and department_id = v_department_id
      and (expires_at is null or expires_at > now())
  ) into v_has_real_grant;

  v_via_trial := not v_has_real_grant and not is_moderator_or_admin();

  if v_via_trial then
    select created_at into v_created_at from profiles where user_id = v_user_id;
    select trial_days, trial_daily_theory_limit, trial_daily_objective_limit
      into v_trial_days, v_theory_limit, v_objective_limit
      from app_settings where id = 1;

    if v_created_at is null or now() >= v_created_at + (v_trial_days || ' days')::interval then
      raise exception 'Your free trial has ended. Purchase access to keep studying this department.';
    end if;

    select count(*) into v_today_count
    from question_attempts qa
    join questions q on q.id = qa.question_id
    where qa.user_id = v_user_id
      and qa.via_trial = true
      and qa.practice_date = p_practice_date
      and q.type = v_question_type;

    if v_question_type = 'application' and v_today_count >= v_theory_limit then
      raise exception 'You have reached today''s free-trial limit of % theory question(s). Come back tomorrow, or purchase access.', v_theory_limit;
    elsif v_question_type = 'objective' and v_today_count >= v_objective_limit then
      raise exception 'You have reached today''s free-trial limit of % objective question(s). Come back tomorrow, or purchase access.', v_objective_limit;
    end if;
  end if;

  insert into question_attempts (
    user_id, course_id, question_id, selected_option_id, result, time_taken_seconds, via_trial, practice_date
  ) values (
    v_user_id, p_course_id, p_question_id, p_selected_option_id, p_result, p_time_taken_seconds, v_via_trial, p_practice_date
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
