-- "An expired access_grants row does not satisfy has_department_access()"
-- (02-DATA-MODEL-AND-SECURITY.md §9's third named example) — this is what actually gates
-- read access to questions/question_options (see has_department_access() usage in the
-- questions/question_options select policies), so a regression here silently lets a lapsed
-- subscription keep reading paid content forever.
begin;
select plan(4);

-- Both test users seeded up front, before any role-switching below — auth.users isn't
-- writable as the 'authenticated' role, only as the superuser this file runs as by default.
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'pgtap-expiry@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'pgtap-nogrant@test.local');

insert into departments (name, slug) values ('pgTAP Expiry Dept', 'pgtap-expiry-dept');

-- A currently-valid grant (no expiry) and one that lapsed yesterday — both seeded as
-- superuser, since access_grants has no client write policy (covered by test 01).
insert into access_grants (user_id, department_id, expires_at)
select '44444444-4444-4444-4444-444444444444', id, null
from departments where slug = 'pgtap-expiry-dept';

insert into departments (name, slug) values ('pgTAP Expired Dept', 'pgtap-expired-dept');
insert into access_grants (user_id, department_id, expires_at)
select '44444444-4444-4444-4444-444444444444', id, now() - interval '1 day'
from departments where slug = 'pgtap-expired-dept';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

select ok(
  has_department_access((select id from departments where slug = 'pgtap-expiry-dept')),
  'a grant with no expiry still satisfies has_department_access()'
);

select ok(
  not has_department_access((select id from departments where slug = 'pgtap-expired-dept')),
  'an expired grant does NOT satisfy has_department_access()'
);

select ok(
  not has_department_access(gen_random_uuid()),
  'a department the user was never granted access to does not satisfy has_department_access()'
);

-- A student with zero rows in the table at all behaves the same as "no access" (exists()
-- over zero rows is false, is_admin() is false) — not a crash, not an implicit grant.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select ok(
  not has_department_access((select id from departments where slug = 'pgtap-expiry-dept')),
  'a student with no access_grants row at all has no access'
);

select * from finish();
rollback;
