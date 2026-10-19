-- Migration: storage_product_media
-- Public-read bucket for product imagery (served via Supabase Storage CDN URLs).
-- Only ops/owner staff can upload, replace or delete objects.
--
-- Rollback notes:
--   drop policy if exists "product-media: staff list" on storage.objects;
--   drop policy if exists "product-media: ops uploads" on storage.objects;
--   drop policy if exists "product-media: ops updates" on storage.objects;
--   drop policy if exists "product-media: ops deletes" on storage.objects;
--   delete from storage.buckets where id = 'product-media';   -- only once the bucket is empty

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media', 'product-media', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4']
)
on conflict (id) do nothing;

create policy "product-media: staff list"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'product-media' and (select public.is_staff()));

create policy "product-media: ops uploads"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-media' and (select public.is_staff('ops')));

create policy "product-media: ops updates"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-media' and (select public.is_staff('ops')))
  with check (bucket_id = 'product-media' and (select public.is_staff('ops')));

create policy "product-media: ops deletes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-media' and (select public.is_staff('ops')));
