-- ============================================================================
-- Referral code is now mandatory at signup, with no exceptions — explicitly requested,
-- reversing 03-BUSINESS-RULES-REDESIGN.md §1's original "opt-in, not auto-enrolled" design.
-- Previously a missing or unrecognized referral_code was silently ignored (the student still
-- got an account, just no referrals row) — now handle_new_user() raises, which aborts the
-- whole auth.users insert transaction and makes supabase.auth.signUp() fail outright. This is
-- enforced at the trigger level specifically so it can't be bypassed by skipping the frontend
-- form, calling the Auth API directly, or disabling client-side JS — the same posture every
-- other security-relevant check in this schema already takes.
--
-- Real consequence worth flagging in the migration itself: this also blocks the FIRST-EVER
-- admin bootstrap (00-bootstrap-admin.sql step 1 says "sign up normally through the Register
-- page", which now needs a referral code too, same as any student). Before running that
-- script for a brand-new project, first create one throwaway affiliate_profiles row (e.g. for
-- yourself) to get a code to register with:
--   insert into auth.users (...) -- or just register a first "seed" account with NO code,
--   which will now fail — so instead: insert into affiliate_profiles (user_id, referral_code,
--   status) values (<any existing user_id>, 'BOOTSTRAP0001', 'active'); then register the
--   real admin account using ?ref=BOOTSTRAP0001.
-- (00-bootstrap-admin.sql's own header comment should be updated to mention this the next time
-- it's touched — not done here since this migration only owns the trigger/function.)
-- ============================================================================

-- Narrow, public, read-only existence check — callable by anon (no session yet, by
-- definition, since this runs before/during signup) without exposing anything about
-- affiliate_profiles beyond "does this code exist". Normalizes case/whitespace so a student
-- pasting a code with different casing or stray spaces isn't needlessly rejected.
create or replace function is_valid_referral_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from affiliate_profiles
    where upper(trim(referral_code)) = upper(trim(p_code))
  );
$$;

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

  if v_code is null or trim(v_code) = '' then
    raise exception 'A referral code is required to register.';
  end if;

  select user_id into v_referrer_id
  from affiliate_profiles
  where upper(trim(referral_code)) = upper(trim(v_code));

  if v_referrer_id is null then
    raise exception 'That referral code was not recognized.';
  end if;

  if v_referrer_id <> new.id then
    insert into referrals (referred_user_id, referrer_user_id)
    values (new.id, v_referrer_id)
    on conflict (referred_user_id) do nothing;
  end if;

  return new;
end;
$$;
