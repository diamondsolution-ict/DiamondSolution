-- ============================================================================
-- Chat (FUNCTIONAL_SPEC.md §19/§20.15, old app) — the last deferred piece of Phase 4
-- (04-ROADMAP.md: "the old app's bottom nav had a 'Chats' tab the new one doesn't yet").
-- One thread per student with "the admin" collectively (any staff member can reply, matching
-- the old app's behavior exactly — it was never routed to a specific admin). The one place
-- Realtime is actually used in this app, per 01-ARCHITECTURE.md's original design intent.
-- ============================================================================

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  user_unread_count int not null default 0,
  admin_unread_count int not null default 0,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table chat_threads enable row level security;

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  sender_role text not null check (sender_role in ('student', 'admin')),
  sender_user_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
alter table chat_messages enable row level security;

create index chat_messages_thread_idx on chat_messages (thread_id, created_at);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

create policy "chat_threads_select_own_or_staff"
  on chat_threads for select
  using (user_id = auth.uid() or is_moderator_or_admin());

-- No direct insert/update policy — both are handled by the two RPCs below (security definer),
-- so unread counts and last_message_at can never drift out of sync with a client-side write.

create policy "chat_messages_select_own_thread_or_staff"
  on chat_messages for select
  using (
    is_moderator_or_admin()
    or exists (
      select 1 from chat_threads t
      where t.id = chat_messages.thread_id and t.user_id = auth.uid()
    )
  );

-- No direct insert policy either — see send_chat_message()/send_chat_message_as_admin() below.

-- ----------------------------------------------------------------------------
-- Student side: creates the thread on first message (upsert), then posts into it. One
-- function instead of a client-side "check if thread exists, create if not, then insert" —
-- removes the race between two tabs sending a first message at the same time.
-- ----------------------------------------------------------------------------

create or replace function send_chat_message(p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id uuid;
begin
  if trim(p_body) = '' then
    raise exception 'Message cannot be empty.';
  end if;

  insert into chat_threads (user_id)
  values (auth.uid())
  on conflict (user_id) do update set user_id = excluded.user_id
  returning id into v_thread_id;

  insert into chat_messages (thread_id, sender_role, sender_user_id, body)
  values (v_thread_id, 'student', auth.uid(), p_body);

  update chat_threads
  set admin_unread_count = admin_unread_count + 1,
      last_message_at = now()
  where id = v_thread_id;

  return v_thread_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Staff side: replies into an existing thread. Never creates one — the old app's admin never
-- initiates a conversation, only responds (FUNCTIONAL_SPEC.md §20.15).
-- ----------------------------------------------------------------------------

create or replace function send_chat_message_as_admin(p_thread_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_moderator_or_admin() then
    raise exception 'Admin or moderator access required.';
  end if;
  if trim(p_body) = '' then
    raise exception 'Message cannot be empty.';
  end if;
  if not exists (select 1 from chat_threads where id = p_thread_id) then
    raise exception 'Thread not found.';
  end if;

  insert into chat_messages (thread_id, sender_role, sender_user_id, body)
  values (p_thread_id, 'admin', auth.uid(), p_body);

  update chat_threads
  set user_unread_count = user_unread_count + 1,
      last_message_at = now()
  where id = p_thread_id;
end;
$$;

create or replace function mark_chat_thread_read_by_user()
returns void
language sql
security definer
set search_path = public
as $$
  update chat_threads set user_unread_count = 0 where user_id = auth.uid();
$$;

create or replace function mark_chat_thread_read_by_admin(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_moderator_or_admin() then
    raise exception 'Admin or moderator access required.';
  end if;
  update chat_threads set admin_unread_count = 0 where id = p_thread_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Realtime — the one place this app actually uses it (live message delivery without
-- polling). Everything else deliberately uses plain fetch-on-mount/manual-refresh, per the
-- read-amplification lessons documented throughout 02-DATA-MODEL-AND-SECURITY.md.
-- ----------------------------------------------------------------------------

alter publication supabase_realtime add table chat_messages;
