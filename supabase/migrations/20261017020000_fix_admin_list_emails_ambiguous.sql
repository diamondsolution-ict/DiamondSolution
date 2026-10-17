-- admin_list_emails() has failed on every call since it was created:
--   ERROR 42702: column reference "email" is ambiguous
-- Its OUT columns (user_id, email) are plpgsql variables, and the body's unqualified `email`
-- could mean either that variable or auth.users.email. Qualify every column. This broke the
-- Users, Payments, Affiliates, Withdrawals and Support screens (all use it for payer emails).
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
  return query
    select u.id, u.email::text
    from auth.users u
    where u.id = any(p_user_ids);
end;
$$;
