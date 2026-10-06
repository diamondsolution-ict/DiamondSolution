-- ============================================================================
-- Admin Pictures & Media tab (FUNCTIONAL_SPEC.md §20.12, old app) — the actual Storage
-- integration 02-DATA-MODEL-AND-SECURITY.md §9 planned: departments.image_path/
-- courses.image_path already exist (init migration) as just a storage object key; this
-- migration is what makes that key resolvable to a real file.
--
-- Public bucket, not signed URLs: department/course card pictures are browsable marketing
-- content shown on the catalog before signup (same posture as departments_select_public),
-- not sensitive — a public bucket with public URLs is simpler than generating/refreshing
-- signed URLs for content that was never access-controlled in the first place. If
-- course-specific imagery ever needs to be gated behind paid access, that's a deliberate
-- later change, not the default here.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "media_select_public"
  on storage.objects for select
  using (bucket_id = 'media');

create policy "media_write_staff"
  on storage.objects for insert
  with check (bucket_id = 'media' and is_moderator_or_admin());

create policy "media_update_staff"
  on storage.objects for update
  using (bucket_id = 'media' and is_moderator_or_admin());

create policy "media_delete_staff"
  on storage.objects for delete
  using (bucket_id = 'media' and is_moderator_or_admin());
