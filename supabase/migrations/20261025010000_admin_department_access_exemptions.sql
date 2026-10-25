-- ============================================================================
-- Admin-only free access, separate from payments entirely: an admin can grant a specific
-- student free access to a specific department ("exempt" them from paying), and later remove
-- that exemption so they'd need to pay normally again.
--
-- No new table — access_grants already had granted_via_payment_id and granted_by columns that
-- were never actually used by anything (every real grant always came with a payment; see
-- processPayment.ts), clearly meant for exactly this. An exemption is simply a grant row with
-- granted_via_payment_id = null (never paid for) and granted_by = the admin who made the call,
-- expires_at = null ("Full access", same wording a lifetime/staff grant already shows — honest
-- here, since there's no purchase term to attach a date to).
--
-- Admin-only (not moderator) — same scope as every other Users-tab action (suspend, delete,
-- change role): a business decision to waive a fee, not a support action.
--
-- Deliberately defensive against a real paid grant:
--   - Granting an exemption never overwrites a student's real paid access (the ON CONFLICT's
--     WHERE clause only fires when the existing row is itself an exemption or doesn't exist) —
--     an admin exempting someone who already paid is a silent no-op, not a destructive
--     overwrite of their actual purchased term.
--   - Removing an exemption refuses outright if the student has since paid for real access in
--     the meantime (granted_via_payment_id is no longer null) — there would be nothing left to
--     "remove" without taking away access they legitimately paid for.
-- ============================================================================

create or replace function admin_grant_department_access(p_user_id uuid, p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Admin access required.';
  end if;

  insert into access_grants (user_id, department_id, granted_via_payment_id, granted_by, expires_at, starts_at)
  values (p_user_id, p_department_id, null, auth.uid(), null, now())
  on conflict (user_id, department_id) do update
    set granted_via_payment_id = null,
        granted_by = auth.uid(),
        expires_at = null,
        starts_at = now()
  where access_grants.granted_via_payment_id is null;

  insert into admin_actions_log (actor_user_id, action, target_table, target_id)
  values (auth.uid(), 'grant_department_access', 'access_grants', p_user_id::text || ':' || p_department_id::text);
end;
$$;

create or replace function admin_revoke_department_access(p_user_id uuid, p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_found boolean;
begin
  if not is_admin() then
    raise exception 'Admin access required.';
  end if;

  select granted_via_payment_id, true into v_payment_id, v_found
  from access_grants
  where user_id = p_user_id and department_id = p_department_id;

  if not coalesce(v_found, false) then
    raise exception 'This student has no access grant for this department.';
  end if;

  if v_payment_id is not null then
    raise exception 'This student has since paid for real access — nothing to remove.';
  end if;

  delete from access_grants
  where user_id = p_user_id and department_id = p_department_id and granted_via_payment_id is null;

  insert into admin_actions_log (actor_user_id, action, target_table, target_id)
  values (auth.uid(), 'revoke_department_access', 'access_grants', p_user_id::text || ':' || p_department_id::text);
end;
$$;
