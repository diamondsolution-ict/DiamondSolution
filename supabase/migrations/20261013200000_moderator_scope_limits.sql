-- ============================================================================
-- Narrows the moderator role to a fixed set of areas (Dashboard, Analytics, WhatsApp Numbers,
-- Affiliates, Payments, Notifications, Quotes, Support) at the explicit request that followed
-- discovering AdminUsers.tsx/AdminSettings.tsx showed moderators controls they couldn't
-- actually use (the server already blocked those, just not visibly). This migration is the
-- other half of that fix: everywhere is_moderator_or_admin() currently grants WRITE access (or,
-- for admin_actions_log, read access) to something outside the moderator's new scope —
-- curriculum content (courses/questions/options/translations/outline), department pictures and
-- media uploads, affiliate withdrawal approval/settlement, and the admin audit log — is
-- downgraded to is_admin() only. is_moderator_or_admin() itself is untouched (it still backs
-- every area a moderator DOES keep: profiles visibility, chat, broadcasts, affiliate
-- activation/viewing, quotes, dashboard/analytics stats), and so is every read-only visibility
-- policy not tied to one of these now-admin-only actions (e.g. a moderator can still see a
-- payment or an affiliate's profile — seeing data that's part of an allowed page is not the
-- same as being able to act outside one).
--
-- The UI-level counterpart (AdminLayout's sidebar, the new AdminOnlyRoute route guard in
-- ProtectedRoute.tsx) hides/blocks the same areas — this migration is what makes that a real
-- boundary rather than a UI-only one a moderator could bypass by calling the API directly.
-- ============================================================================

-- Curriculum content: courses, course_outline_sections, questions, question_options,
-- question_translations — write access only (their own select policies already correctly
-- distinguish "published, for any signed-in user" from "everything, for staff"; a moderator no
-- longer needs the staff branch of that since Departments/Courses/Questions is off their nav,
-- but leaving select as moderator-visible is harmless read-only access, not an action).
drop policy "courses_write_staff" on courses;
create policy "courses_write_staff"
  on courses for all
  using (is_admin())
  with check (is_admin());

drop policy "course_outline_sections_write_staff" on course_outline_sections;
create policy "course_outline_sections_write_staff"
  on course_outline_sections for all
  using (is_admin())
  with check (is_admin());

drop policy "questions_write_staff" on questions;
create policy "questions_write_staff"
  on questions for all
  using (is_admin())
  with check (is_admin());

drop policy "question_options_write_staff" on question_options;
create policy "question_options_write_staff"
  on question_options for all
  using (is_admin())
  with check (is_admin());

drop policy "question_translations_write_staff" on question_translations;
create policy "question_translations_write_staff"
  on question_translations for all
  using (is_admin())
  with check (is_admin());

-- The own-attempt carve-out this same migration series added in
-- 20261013190000_revision_center_own_attempts.sql stays exactly as it was — this only touches
-- the "is_moderator_or_admin() sees everything" branch of those two select policies, not a
-- student's own revision history.
drop policy "questions_select_with_access" on questions;
create policy "questions_select_with_access"
  on questions for select
  using (
    is_admin()
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
    is_admin()
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

-- Media storage (Pictures & Media is off the moderator's nav now) — public read is unaffected.
drop policy "media_write_staff" on storage.objects;
create policy "media_write_staff"
  on storage.objects for insert
  with check (bucket_id = 'media' and is_admin());

drop policy "media_update_staff" on storage.objects;
create policy "media_update_staff"
  on storage.objects for update
  using (bucket_id = 'media' and is_admin());

drop policy "media_delete_staff" on storage.objects;
create policy "media_delete_staff"
  on storage.objects for delete
  using (bucket_id = 'media' and is_admin());

-- Withdrawals (Affiliates stays moderator-visible for activating accounts/viewing balances,
-- but approving/settling a payout is now admin-only — "Payments" on the moderator's list is
-- the separate AdminPayments/course-payment page, not this).
drop policy "withdrawals_staff_manage" on withdrawals;
create policy "withdrawals_staff_manage"
  on withdrawals for update using (is_admin());

drop policy "withdrawals_staff_delete" on withdrawals;
create policy "withdrawals_staff_delete"
  on withdrawals for delete using (is_admin());

create or replace function mark_withdrawal_paid_manually(
  p_withdrawal_id uuid,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_amount numeric;
  v_currency text;
  v_status text;
begin
  if not is_admin() then
    raise exception 'Admin access required.';
  end if;

  select user_id, amount, currency, status
    into v_user_id, v_amount, v_currency, v_status
    from withdrawals
    where id = p_withdrawal_id
    for update;

  if v_user_id is null then
    raise exception 'Withdrawal not found.';
  end if;
  if v_status <> 'pending' then
    raise exception 'Withdrawal is already %.', v_status;
  end if;

  update withdrawals
  set status = 'success',
      provider_reference = p_reference,
      provider_response = jsonb_build_object('manual', true),
      processed_at = now(),
      processed_by = auth.uid()
  where id = p_withdrawal_id;

  insert into notifications (user_id, type, title, body)
  values (
    v_user_id,
    'withdrawal_processed',
    'Withdrawal paid',
    format('Your withdrawal of %s %s was paid out.', v_amount, v_currency)
  );

  insert into admin_actions_log (actor_user_id, action, target_table, target_id, reason)
  values (auth.uid(), 'withdrawal_paid_manually', 'withdrawals', p_withdrawal_id::text, p_reference);
end;
$$;

-- System Logs is off the moderator's nav.
drop policy "admin_actions_log_select_staff" on admin_actions_log;
create policy "admin_actions_log_select_staff"
  on admin_actions_log for select
  using (is_admin());
