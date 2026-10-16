-- Department access is a yearly fee (20261017000000_department_pricing_default_yearly.sql):
-- a price row inserted without an explicit duration must come out as 365 days, not lifetime,
-- while an explicit NULL (the admin screen's "leave blank for lifetime") is still honoured.
begin;
select plan(2);

insert into departments (name, slug) values ('pgTAP Yearly Dept', 'pgtap-yearly-dept');

insert into department_pricing (department_id, currency, amount)
select id, 'NGN', 1000 from departments where slug = 'pgtap-yearly-dept';

select is(
  (select access_duration_days from department_pricing
    where department_id = (select id from departments where slug = 'pgtap-yearly-dept')
      and currency = 'NGN'),
  365,
  'a price row inserted without a duration defaults to 365 days (yearly)'
);

insert into department_pricing (department_id, currency, amount, access_duration_days, effective_from)
select id, 'USD', 2, null, now() from departments where slug = 'pgtap-yearly-dept';

select is(
  (select access_duration_days from department_pricing
    where department_id = (select id from departments where slug = 'pgtap-yearly-dept')
      and currency = 'USD'),
  null,
  'an explicit NULL duration still means lifetime access'
);

select * from finish();
rollback;
