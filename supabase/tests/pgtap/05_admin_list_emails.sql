-- admin_list_emails() once failed on every call ("column reference \"email\" is ambiguous") and
-- nothing caught it. Staff must get emails back; a plain student must be refused.
begin;
select plan(3);

set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000a001', 'pgtap-listmails-admin@test.local'),
  ('aaaaaaaa-0000-0000-0000-00000000a002', 'pgtap-listmails-student@test.local');
set local session_replication_role = origin;

insert into user_roles (user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000a001', 'admin'),
  ('aaaaaaaa-0000-0000-0000-00000000a002', 'student');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-00000000a001', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000a001', true);

select is(
  (select count(*)::int from admin_list_emails(array['aaaaaaaa-0000-0000-0000-00000000a002']::uuid[])),
  1,
  'an admin gets a row back for the requested user'
);
select is(
  (select email from admin_list_emails(array['aaaaaaaa-0000-0000-0000-00000000a002']::uuid[])),
  'pgtap-listmails-student@test.local',
  'and it carries that user''s email'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-00000000a002', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000a002', true);
select throws_ok(
  $$ select * from admin_list_emails(array['aaaaaaaa-0000-0000-0000-00000000a001']::uuid[]) $$,
  'Admin or moderator access required.',
  'a student is refused'
);

select * from finish();
rollback;
