-- ============================================================================
-- Admin Notifications (broadcast) tab. Design reference: FUNCTIONAL_SPEC.md §20.13 (old app).
-- "No per-user targeting, scheduling, or read-tracking UI — a single global broadcast list,"
-- so this fans a single compose action out to every user's own `notifications` row (so the
-- existing bell/dropdown picks it up with zero client changes) while keeping one
-- `admin_broadcasts` row as the compose-history record shown on this tab.
--
-- "Revoke Log" in the old app deleted the compose-history Firestore doc only — it never
-- un-notified anyone who'd already seen it (there was no mechanism to reach back into
-- per-user copies). Reproduced exactly: deleting an admin_broadcasts row removes it from this
-- tab's history; the notifications already fanned out to users are untouched.
-- ============================================================================

alter type notification_type add value 'admin_broadcast';

create table admin_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  sent_by uuid not null references auth.users(id),
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table admin_broadcasts enable row level security;

create policy "admin_broadcasts_select_staff"
  on admin_broadcasts for select
  using (is_moderator_or_admin());

create policy "admin_broadcasts_delete_staff"
  on admin_broadcasts for delete
  using (is_moderator_or_admin());

-- No insert/update policy — writes only ever happen through broadcast_notification() below,
-- so the recipient fan-out and the history row are always created together, atomically.

create or replace function broadcast_notification(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast_id uuid;
  v_count int;
begin
  if not is_moderator_or_admin() then
    raise exception 'Admin or moderator access required.';
  end if;
  if trim(p_title) = '' or trim(p_body) = '' then
    raise exception 'Title and message are both required.';
  end if;

  insert into admin_broadcasts (title, body, sent_by)
  values (p_title, p_body, auth.uid())
  returning id into v_broadcast_id;

  insert into notifications (user_id, type, title, body)
  select user_id, 'admin_broadcast', p_title, p_body from profiles;
  get diagnostics v_count = row_count;

  update admin_broadcasts set recipient_count = v_count where id = v_broadcast_id;

  return v_broadcast_id;
end;
$$;
