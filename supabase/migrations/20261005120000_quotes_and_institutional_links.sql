-- ============================================================================
-- Admin Quotes and Settings tabs. Design reference: 02-DATA-MODEL-AND-SECURITY.md (the
-- `quotes` / `institutional_links` sketch), FUNCTIONAL_SPEC.md §20.14/§20.17 (old app).
--
-- Deliberately NOT included here: the broader `app_settings` key-value table from the same
-- design-doc sketch. Several numbers elsewhere in this codebase (COMMISSION_RATE,
-- MIN_WITHDRAWAL, REACTIVATION_FEE_*, PASSWORD_MIN_LENGTH, ...) are still hardcoded constants
-- with "pending app_settings" comments — adding the table without also rewiring every one of
-- those reads would produce an admin UI that edits numbers nothing actually consults, which is
-- worse than the honest hardcoded-with-a-comment state today. That rewiring is its own
-- follow-up, not bundled into this pass.
-- ============================================================================

create table quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  author text not null default 'Diamond Intelligence',
  created_at timestamptz not null default now()
);
alter table quotes enable row level security;

create policy "quotes_select_public"
  on quotes for select
  using (true);

-- Matches the old app exactly: adding/removing a quote is content curation, not a destructive
-- or financial action — no OTP step-up, same posture as courses/questions.
create policy "quotes_write_staff"
  on quotes for all
  using (is_moderator_or_admin())
  with check (is_moderator_or_admin());

create table institutional_links (
  id int primary key default 1 check (id = 1),  -- singleton row
  telegram text,
  whatsapp text,
  facebook text,
  twitter text,
  instagram text,
  support_email text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table institutional_links enable row level security;

insert into institutional_links (id) values (1);

create trigger institutional_links_set_updated_at
  before update on institutional_links
  for each row execute function set_updated_at();

create policy "institutional_links_select_public"
  on institutional_links for select
  using (true);

-- Admin-only (not moderator) — this is organization-wide contact info, a narrower write
-- surface than ordinary content curation.
create policy "institutional_links_write_admin"
  on institutional_links for update
  using (is_admin())
  with check (is_admin());
