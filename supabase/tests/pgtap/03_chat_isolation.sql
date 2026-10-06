-- Chat RLS (20261006100000_chat.sql): a student can only ever see their own thread/messages,
-- and can't bypass send_chat_message() to post as another student or to forge admin_unread
-- bookkeeping by inserting into chat_messages directly.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'pgtap-chat-a@test.local'),
  ('77777777-7777-7777-7777-777777777777', 'pgtap-chat-b@test.local');

-- Student A starts a conversation via the real RPC, as themselves.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select send_chat_message('Hello, I need help.');

select is(
  (select count(*)::int from chat_threads),
  1,
  'student A sees exactly one thread — their own'
);

select is(
  (select count(*)::int from chat_messages),
  1,
  'student A sees exactly one message — their own'
);

select throws_ok(
  $$ insert into chat_messages (thread_id, sender_role, sender_user_id, body)
     select id, 'student', '66666666-6666-6666-6666-666666666666', 'sneaky direct insert'
     from chat_threads limit 1 $$,
  '42501',
  null,
  'a student cannot insert into chat_messages directly, bypassing send_chat_message()'
);

-- Student B has no thread of their own yet — must see neither A's thread nor A's messages.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '77777777-7777-7777-7777-777777777777', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);

select is(
  (select count(*)::int from chat_threads),
  0,
  'student B cannot see student A''s thread'
);

select is(
  (select count(*)::int from chat_messages),
  0,
  'student B cannot see student A''s messages'
);

select * from finish();
rollback;
