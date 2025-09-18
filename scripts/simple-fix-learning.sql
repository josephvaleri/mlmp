-- Simple fix for MLMP Learning Database
-- This version only adds missing columns and indexes, without recreating policies

-- Add missing columns to mlmp_predictions table
alter table mlmp_predictions 
  add column if not exists menu_id uuid references mlmp_menu_uploads(menu_id) on delete cascade,
  add column if not exists text text,
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Add missing column to mlmp_labels table
alter table mlmp_labels 
  add column if not exists pred_id uuid references mlmp_predictions(pred_id) on delete cascade;

-- Add indexes for better performance
create index if not exists idx_mlmp_predictions_menu_id on mlmp_predictions(menu_id);
create index if not exists idx_mlmp_predictions_user_id on mlmp_predictions(user_id);
create index if not exists idx_mlmp_labels_pred_id on mlmp_labels(pred_id);
create index if not exists idx_mlmp_labels_user_id on mlmp_labels(user_id);
create index if not exists idx_mlmp_labels_created_at on mlmp_labels(created_at);

-- Verify the changes
select 'Database schema updated successfully!' as status;
