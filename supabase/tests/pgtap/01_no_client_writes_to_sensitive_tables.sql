-- The Dirty-Dozen successor (02-DATA-MODEL-AND-SECURITY.md §9): user_roles, payments,
-- access_grants, and commissions all deliberately have a select policy but NO insert/update
-- policy at all — "deny by omission" is the entire enforcement mechanism (§8: RLS enabled +
-- zero matching policies = fully closed, even to the row's own owner or an admin). This test
-- exists so that mechanism can never silently regress (e.g. someone "helpfully" adding an
-- update policy to let users edit their own payment status) without a CI failure.
--
-- Note on method: INSERT denials throw 42501 (the new row is checked against WITH CHECK and
-- fails), which throws_ok() catches directly. UPDATE denials do NOT throw — with no policy at
-- all, the implicit USING clause filters the target row out before it's ever reached, so the
-- UPDATE just silently matches zero rows. Those are tested by attempting the write, then
-- asserting the row is unchanged.
begin;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'pgtap-student@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'pgtap-admin@test.local');

-- Seeded as superuser (bypasses RLS) — this is test setup, not what's under test.
insert into user_roles (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'student'),
  ('22222222-2222-2222-2222-222222222222', 'admin');

insert into departments (name, slug) values ('pgTAP Dept', 'pgtap-dept');

-- One already-'success' payment (to reference by FK from the commissions insert attempt
-- below) and one 'pending' payment (to attempt flipping to 'success' and confirm it doesn't
-- move) — so the UPDATE test fails on RLS, never ambiguously on "there was nothing to update."
insert into payments (id, user_id, provider, provider_reference, purpose, department_id, amount, currency, status)
select '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
  'paystack', 'pgtap-seed-ref', 'department_access', id, 100, 'NGN', 'success'
from departments where slug = 'pgtap-dept';

insert into payments (id, user_id, provider, provider_reference, purpose, department_id, amount, currency, status)
select '88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111',
  'paystack', 'pgtap-pending-ref', 'department_access', id, 100, 'NGN', 'pending'
from departments where slug = 'pgtap-dept';

-- --- As an ordinary authenticated student ---
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

update user_roles set role = 'admin' where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select role::text from user_roles where user_id = '11111111-1111-1111-1111-111111111111'),
  'student',
  'a student cannot self-promote via direct UPDATE — role is unchanged'
);

select throws_ok(
  $$ insert into payments (user_id, provider, provider_reference, purpose, amount, currency, status)
     values ('11111111-1111-1111-1111-111111111111', 'paystack', 'pgtap-ref-1', 'department_access', 1, 'NGN', 'success') $$,
  '42501',
  null,
  'a student cannot insert a payments row claiming success'
);

select throws_ok(
  $$ insert into access_grants (user_id, department_id)
     select '11111111-1111-1111-1111-111111111111', id from departments where slug = 'pgtap-dept' $$,
  '42501',
  null,
  'a student cannot grant themselves department access'
);

select throws_ok(
  $$ insert into commissions (payment_id, referrer_user_id, referred_user_id, base_amount, base_currency, commission_rate, commission_amount, commission_currency)
     values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 100, 'NGN', 0.25, 25, 'NGN') $$,
  '42501',
  null,
  'a student cannot insert a commissions row referencing their own (real) payment'
);

-- --- As an admin — staff get read access to these tables, never write access; the write
-- path is exclusively the service_role Edge Functions (admin-manage-user,
-- admin-approve-commission, verify-payment, ...). ---
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

update user_roles set role = 'moderator' where user_id = '22222222-2222-2222-2222-222222222222';
select is(
  (select role::text from user_roles where user_id = '22222222-2222-2222-2222-222222222222'),
  'admin',
  'even an admin cannot change their own role via direct UPDATE — role is unchanged'
);

update payments set status = 'success' where id = '88888888-8888-8888-8888-888888888888';
select is(
  (select status::text from payments where id = '88888888-8888-8888-8888-888888888888'),
  'pending',
  'even an admin cannot mark a payment successful via direct UPDATE — status is unchanged'
);

select throws_ok(
  $$ insert into access_grants (user_id, department_id)
     select '11111111-1111-1111-1111-111111111111', id from departments where slug = 'pgtap-dept' $$,
  '42501',
  null,
  'even an admin cannot grant access directly through the client'
);

-- A real commission row to attempt flipping (seeded as superuser below, after switching back).
reset role;
insert into commissions (id, payment_id, referrer_user_id, referred_user_id, base_amount, base_currency, commission_rate, commission_amount, commission_currency, status)
values ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
  100, 'NGN', 0.25, 25, 'NGN', 'pending');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
update commissions set status = 'paid' where id = '99999999-9999-9999-9999-999999999999';
select is(
  (select status::text from commissions where id = '99999999-9999-9999-9999-999999999999'),
  'pending',
  'even an admin cannot mark a commission paid via direct UPDATE — status is unchanged'
);

select * from finish();
rollback;
