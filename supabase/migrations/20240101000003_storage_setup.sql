-- Storage bucket setup for MLMP

-- Create storage bucket for menu files and model files
insert into storage.buckets (id, name, public)
values ('mlmp', 'mlmp', false)
on conflict (id) do nothing;

-- Storage policies for menu uploads
create policy "Users can upload their own menu files" on storage.objects
  for insert with check (
    bucket_id = 'mlmp' 
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view their own menu files" on storage.objects
  for select using (
    bucket_id = 'mlmp' 
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own menu files" on storage.objects
  for update using (
    bucket_id = 'mlmp' 
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own menu files" on storage.objects
  for delete using (
    bucket_id = 'mlmp' 
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for model files (public read)
create policy "Anyone can view model files" on storage.objects
  for select using (bucket_id = 'mlmp' and name like 'models/%');

create policy "Service role can manage model files" on storage.objects
  for all using (bucket_id = 'mlmp' and name like 'models/%');
