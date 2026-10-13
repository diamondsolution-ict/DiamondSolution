-- ============================================================================
-- Per-admin step-up code — replaces the single shared admin_stepup_code singleton. The shared
-- code meant any admin changing it silently locked every other admin out with no warning, and
-- gave no way to tell which admin actually approved a destructive action (anyone who knew the
-- one code could act as any admin). Each admin now has their own code: sets it themselves (no
-- "current code" needed the first time — there isn't one yet), changes it themselves, and it's
-- also what gates entry to the admin area itself now, not just destructive actions within it.
--
-- Every admin that already exists is seeded with the OLD singleton's code hash, so nobody is
-- locked out by this migration — each should set their own from Admin → Settings right after.
-- A later-promoted admin simply has no row until they set one; admin-verify-stepup-code and
-- admin-set-stepup-code both treat "no row" as "needs first-time setup", not an error.
-- ============================================================================

create table admin_stepup_code_v2 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table admin_stepup_code_v2 enable row level security;
-- No select/write policy for any client role — service_role only, same posture as the table
-- it replaces.

create trigger admin_stepup_code_v2_set_updated_at
  before update on admin_stepup_code_v2
  for each row execute function set_updated_at();

insert into admin_stepup_code_v2 (user_id, code_hash)
select ur.user_id, old.code_hash
from user_roles ur
cross join admin_stepup_code old
where ur.role = 'admin' and old.id = 1;

drop table admin_stepup_code;
alter table admin_stepup_code_v2 rename to admin_stepup_code;
alter trigger admin_stepup_code_v2_set_updated_at on admin_stepup_code
  rename to admin_stepup_code_set_updated_at;
