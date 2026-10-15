-- ============================================================================
-- Security fix found during pre-launch audit: profiles_update_own_or_admin's `with check`
-- (20261001221814_init_identity_and_catalog.sql) only pinned `status`/`suspension_reason` to
-- their existing values for a non-admin — every other column on `profiles` was left open to a
-- normal client update for `user_id = auth.uid()`. Nine migrations later,
-- 20261013210000_device_login_limits.sql added device_block_started_at/device_epoch/
-- active_device_id to that same table to back the paid 24h device-unlock flow, but this policy
-- was never revisited. As written, any signed-in student could clear their own lock for free
-- with a plain client call, e.g.:
--   supabase.from('profiles').update({ device_block_started_at: null, device_epoch: 999 })
--     .eq('user_id', user.id)
-- — satisfies RLS (own row, status/suspension_reason untouched) and fully defeats
-- register_device_login()/the ₦1,000 paid-unlock flow. This pins those three columns the same
-- way status/suspension_reason are already pinned; only is_admin() or a security-definer
-- function (register_device_login, admin_unlock_device, processDeviceUnlock.ts's service-role
-- client — all bypass RLS as table owner/service_role) can actually change them.
-- ============================================================================

drop policy "profiles_update_own_or_admin" on profiles;
create policy "profiles_update_own_or_admin"
  on profiles for update
  using (user_id = auth.uid() or is_admin())
  with check (
    is_admin()
    or (
      user_id = auth.uid()
      and status = (select status from profiles p where p.user_id = auth.uid())
      and suspension_reason is not distinct from (select suspension_reason from profiles p where p.user_id = auth.uid())
      and device_block_started_at is not distinct from (select device_block_started_at from profiles p where p.user_id = auth.uid())
      and device_epoch = (select device_epoch from profiles p where p.user_id = auth.uid())
      and active_device_id is not distinct from (select active_device_id from profiles p where p.user_id = auth.uid())
    )
  );
