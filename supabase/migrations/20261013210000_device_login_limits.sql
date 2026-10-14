-- ============================================================================
-- Single-device-at-a-time login, with a paid 24h lockout for a 3rd distinct device —
-- explicitly requested to bring back the old app's FUNCTIONAL_SPEC.md §9.2 behavior, which an
-- earlier pass of this rebuild (03-BUSINESS-RULES-REDESIGN.md §2) deliberately replaced with a
-- plain concurrent-session cap specifically because a client-generated localStorage device id
-- isn't a real security boundary (clearing site data resets it). That critique still holds —
-- this is reinstated anyway because it's what was explicitly asked for, matching the old app's
-- real-world design exactly. It should be understood as a practical deterrent for ordinary
-- account sharing, not a hard security guarantee.
--
-- Mechanics, as specified:
-- - Students only (admins/moderators are completely exempt — is_moderator_or_admin() short-
--   circuits register_device_login() below).
-- - A 2nd distinct device signs the student in there and signs out every other session
--   (supabase.auth.signOut({scope: 'others'}), called client-side right after a successful
--   register_device_login() — a real, server-enforced session invalidation, not spoofable the
--   way the device id itself is).
-- - A 3rd distinct device (device_epoch resets this count on unlock, see below) blocks the
--   whole account immediately: device_block_started_at is set, and nothing unblocks it but a
--   successful ₦1000 payment made no earlier than 24h after that timestamp — time alone never
--   unblocks it, matching "pay to unlock, not just wait."
-- - Paying bumps device_epoch, which resets the distinct-device count to zero going forward
--   (a judgment call: otherwise every single new device for the rest of this student's time on
--   the platform would immediately re-trigger another block, which isn't a sane product for a
--   paying long-term user).
-- - An admin or moderator can unlock an account directly, no payment, from Admin → Users
--   (admin_unlock_device below) — same exemption scope as everything else staff already does.
-- ============================================================================

alter type payment_purpose add value 'device_unlock';

alter table profiles add column device_block_started_at timestamptz;
alter table profiles add column device_epoch int not null default 0;
alter table profiles add column active_device_id text;

create table user_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  epoch int not null,
  first_seen_at timestamptz not null default now(),
  primary key (user_id, device_id, epoch)
);
alter table user_devices enable row level security;

create policy "user_devices_select_own_or_staff"
  on user_devices for select
  using (user_id = auth.uid() or is_moderator_or_admin());
-- No client write policy at all — every row is written by register_device_login() below
-- (security definer), never directly by a client claiming a device id is registered.

-- Called once per app load/sign-in, with a device id the client persists in localStorage (see
-- src/lib/device.ts) — not because that id is unbeatable (it isn't, see header comment above),
-- but because it's what "a device" practically means for a web app with no native device APIs.
create or replace function register_device_login(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block_started timestamptz;
  v_epoch int;
  v_device_count int;
begin
  if is_moderator_or_admin() then
    return jsonb_build_object('status', 'ok');
  end if;
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    raise exception 'device_id is required.';
  end if;

  select device_block_started_at, device_epoch into v_block_started, v_epoch
  from profiles where user_id = auth.uid();

  if v_block_started is not null then
    return jsonb_build_object('status', 'blocked', 'blocked_since', v_block_started);
  end if;

  if exists (
    select 1 from user_devices
    where user_id = auth.uid() and device_id = p_device_id and epoch = v_epoch
  ) then
    update profiles set active_device_id = p_device_id where user_id = auth.uid();
    return jsonb_build_object('status', 'ok');
  end if;

  select count(*) into v_device_count
  from user_devices where user_id = auth.uid() and epoch = v_epoch;

  if v_device_count >= 2 then
    update profiles set device_block_started_at = now() where user_id = auth.uid();
    return jsonb_build_object('status', 'blocked', 'blocked_since', now());
  end if;

  insert into user_devices (user_id, device_id, epoch) values (auth.uid(), p_device_id, v_epoch);
  update profiles set active_device_id = p_device_id where user_id = auth.uid();

  return jsonb_build_object(
    'status', case when v_device_count = 0 then 'ok' else 'ok_kicked_other' end
  );
end;
$$;

-- Staff override: unlock a blocked student with no payment. Same exemption scope as everything
-- else staff already does; logged like every other admin action.
create or replace function admin_unlock_device(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_moderator_or_admin() then
    raise exception 'Admin or moderator access required.';
  end if;

  update profiles
  set device_block_started_at = null,
      device_epoch = device_epoch + 1,
      active_device_id = null
  where user_id = p_user_id;

  insert into admin_actions_log (actor_user_id, action, target_table, target_id)
  values (auth.uid(), 'device_unlock', 'profiles', p_user_id::text);
end;
$$;
