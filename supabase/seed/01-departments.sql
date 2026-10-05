-- ============================================================================
-- Seeds the five departments the original Firebase app shipped with (its hardcoded
-- `DEPARTMENTS`/`DEPARTMENT_PRICES` constants — see Tobinioluwa/Diamond-Solution-app's
-- src/constants.ts), so the live Register page's department picker isn't empty on day one.
-- Not run automatically by `supabase db push` — run it once after the schema is live, the
-- same way `00-bootstrap-admin.sql` is run (Supabase dashboard → SQL Editor → New query →
-- paste → Run, or `psql <connection string> -f supabase/seed/01-departments.sql`).
--
-- Safe to re-run: the departments insert uses `on conflict do nothing` off departments.name's
-- unique constraint; the pricing insert uses `where not exists` rather than `on conflict`,
-- because department_pricing's actual unique constraint includes `effective_from`, which
-- defaults to `now()` — an `on conflict` there would never match on a second run (different
-- timestamp each time) and would silently insert a duplicate "current" price every re-run.
--
-- Deliberately NOT included: `DEPARTMENT_PRICES`' two orphaned entries ("Human Nutrition and
-- Dietetics", "Veterinary Medicine") that existed in the old app's price map but never
-- appeared in its actual selectable `DEPARTMENTS` list — that's exactly the kind of
-- config/reality drift 02-DATA-MODEL-AND-SECURITY.md's redesign is meant to stop reproducing.
-- Course/level content (department_levels, courses, questions) is deliberately left for the
-- admin UI (06-SUPABASE-DEPLOYMENT-CHECKLIST.md step 11) — this seeds departments + pricing
-- only, matching what's needed to unblock the Register page.
-- ============================================================================

insert into departments (name, slug, status) values
  ('Pharmacy', 'pharmacy', 'active'),
  ('Physiotherapy', 'physiotherapy', 'active'),
  ('Biomedical Laboratory Science (BMLS)', 'biomedical-laboratory-science-bmls', 'active'),
  ('Medicine and Surgery (MBBS)', 'medicine-and-surgery-mbbs', 'active'),
  ('Nursing', 'nursing', 'active')
on conflict (name) do nothing;

insert into department_pricing (department_id, currency, amount)
select d.id, p.currency, p.amount
from departments d
join (values
  ('Pharmacy', 'NGN', 10000), ('Pharmacy', 'USD', 7),
  ('Physiotherapy', 'NGN', 10000), ('Physiotherapy', 'USD', 7),
  ('Biomedical Laboratory Science (BMLS)', 'NGN', 10000), ('Biomedical Laboratory Science (BMLS)', 'USD', 7),
  ('Medicine and Surgery (MBBS)', 'NGN', 15000), ('Medicine and Surgery (MBBS)', 'USD', 10),
  ('Nursing', 'NGN', 10000), ('Nursing', 'USD', 7)
) as p(department_name, currency, amount)
  on p.department_name = d.name
where not exists (
  select 1 from department_pricing existing
  where existing.department_id = d.id and existing.currency = p.currency
);
