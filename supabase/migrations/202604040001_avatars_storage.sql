-- Supabase Storage bucket for user profile avatars.
-- Images are stored at: avatars/{user_id}.jpg
-- Public read access, authenticated write for own avatar.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload/update their own avatar
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read for all avatars
create policy "Anyone can read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
