-- Run this SQL in your Supabase SQL Editor to fix the learning functionality
-- Copy and paste this entire script into the Supabase SQL Editor

-- Fix MLMP Learning Schema
-- Update the predictions and labels tables to support learning functionality

-- Drop existing constraints and policies (handle all possible policy names)
drop policy if exists "Users can view predictions for their own lines" on mlmp_predictions;
drop policy if exists "Users can view predictions for their own menus" on mlmp_predictions;
drop policy if exists "Service role can insert predictions" on mlmp_predictions;
drop policy if exists "Service role can manage predictions" on mlmp_predictions;
drop policy if exists "Users can view their own labels" on mlmp_labels;
drop policy if exists "Users can insert their own labels" on mlmp_labels;
drop policy if exists "Users can update their own labels" on mlmp_labels;
drop policy if exists "Users can delete their own labels" on mlmp_labels;
drop policy if exists "Service role can manage labels" on mlmp_labels;

-- Update mlmp_predictions table to support learning
alter table mlmp_predictions 
  add column if not exists menu_id uuid references mlmp_menu_uploads(menu_id) on delete cascade,
  add column if not exists text text,
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Update mlmp_labels table to support learning
alter table mlmp_labels 
  add column if not exists pred_id uuid references mlmp_predictions(pred_id) on delete cascade;

-- Create new policies for learning functionality
-- Predictions policies
create policy "Users can view predictions for their own menus" on mlmp_predictions
  for select using (
    exists (
      select 1 from mlmp_menu_uploads u 
      where u.menu_id = mlmp_predictions.menu_id 
      and u.user_id = auth.uid()
    )
  );

create policy "Users can insert predictions for their own menus" on mlmp_predictions
  for insert with check (
    exists (
      select 1 from mlmp_menu_uploads u 
      where u.menu_id = mlmp_predictions.menu_id 
      and u.user_id = auth.uid()
    )
  );

create policy "Service role can manage predictions" on mlmp_predictions
  for all using (true);

-- Labels policies
create policy "Users can view their own labels" on mlmp_labels
  for select using (auth.uid() = user_id);

create policy "Users can insert their own labels" on mlmp_labels
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own labels" on mlmp_labels
  for update using (auth.uid() = user_id);

create policy "Users can delete their own labels" on mlmp_labels
  for delete using (auth.uid() = user_id);

create policy "Service role can manage labels" on mlmp_labels
  for all using (true);

-- Add indexes for better performance
create index if not exists idx_mlmp_predictions_menu_id on mlmp_predictions(menu_id);
create index if not exists idx_mlmp_predictions_user_id on mlmp_predictions(user_id);
create index if not exists idx_mlmp_labels_pred_id on mlmp_labels(pred_id);
create index if not exists idx_mlmp_labels_user_id on mlmp_labels(user_id);
create index if not exists idx_mlmp_labels_created_at on mlmp_labels(created_at);

-- Verify the changes
select 'Database schema updated successfully!' as status;
