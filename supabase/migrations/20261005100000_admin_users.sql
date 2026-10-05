-- ============================================================================
-- Admin Users tab support. Design reference: FUNCTIONAL_SPEC.md §20.4 (old app), rebuilt
-- against this schema's actual constraints rather than ported as-is:
--
-- - auth.users.email is deliberately never exposed through public_profile_names()
--   (20261002041845_leaderboard_support.sql) — that function is for ordinary users seeing
--   referral/leaderboard names. Admins genuinely need email for support/identification, so
--   this is a second, narrower, admin-only function instead of loosening that one.
-- - user_roles has no client write policy at all (20261001221814_init_identity_and_catalog.sql)
--   — role changes only ever happen through the admin-manage-user Edge Function, which this
--   migration doesn't change; it only adds the two reads/writes that function's surrounding UI
--   needs and that a client genuinely can do safely without a step-up token.
-- ============================================================================

create or replace function admin_list_emails(p_user_ids uuid[])
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_moderator_or_admin() then
    raise exception 'Admin or moderator access required.';
  end if;
  return query select id, email from auth.users where id = any(p_user_ids);
end;
$$;

-- "Approve Partner" in the old app was deliberately not OTP-gated (FUNCTIONAL_SPEC.md §20.2's
-- explicit "not gated" list) — activating affiliate status isn't destructive, so it stays a
-- direct RPC rather than routing through the step-up Edge Function like suspend/role/delete do.
-- affiliate_profiles' own write policy is "own row only" (20261002043126_affiliate_program.sql),
-- so staff need this security-definer path to do it on someone else's behalf.
create or replace function admin_activate_affiliate(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed text;
  v_code text;
  v_attempt int := 0;
begin
  if not is_moderator_or_admin() then
    raise exception 'Admin or moderator access required.';
  end if;

  if exists (select 1 from affiliate_profiles where user_id = p_user_id) then
    update affiliate_profiles
    set status = 'active', activated_at = coalesce(activated_at, now())
    where user_id = p_user_id;
    return;
  end if;

  select coalesce(nullif(regexp_replace(upper(username), '[^A-Z0-9]', '', 'g'), ''), 'SCHOLAR')
    into v_seed
    from profiles where user_id = p_user_id;

  loop
    v_code := left(v_seed, 8) || floor(1000 + random() * 9000)::text;
    begin
      insert into affiliate_profiles (user_id, referral_code, status, activated_at)
      values (p_user_id, v_code, 'active', now());
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt >= 6 then
        raise exception 'Could not generate a unique referral code.';
      end if;
    end;
  end loop;
end;
$$;
