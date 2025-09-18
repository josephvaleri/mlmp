-- Row Level Security Policies for MLMP

-- Enable RLS on all tables
alter table mlmp_menu_uploads enable row level security;
alter table mlmp_extracted_lines enable row level security;
alter table mlmp_predictions enable row level security;
alter table mlmp_labels enable row level security;
alter table mlmp_entrees enable row level security;
alter table mlmp_model_versions enable row level security;

-- Menu uploads policies
create policy "Users can view their own uploads" on mlmp_menu_uploads
  for select using (auth.uid() = user_id);

create policy "Users can insert their own uploads" on mlmp_menu_uploads
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own uploads" on mlmp_menu_uploads
  for update using (auth.uid() = user_id);

create policy "Users can delete their own uploads" on mlmp_menu_uploads
  for delete using (auth.uid() = user_id);

-- Extracted lines policies
create policy "Users can view lines from their own uploads" on mlmp_extracted_lines
  for select using (
    exists (
      select 1 from mlmp_menu_uploads u 
      where u.menu_id = mlmp_extracted_lines.menu_id 
      and u.user_id = auth.uid()
    )
  );

create policy "Service role can insert extracted lines" on mlmp_extracted_lines
  for insert with check (true);

-- Predictions policies
create policy "Users can view predictions for their own lines" on mlmp_predictions
  for select using (
    exists (
      select 1 from mlmp_extracted_lines el
      join mlmp_menu_uploads u on u.menu_id = el.menu_id
      where el.line_id = mlmp_predictions.line_id
      and u.user_id = auth.uid()
    )
  );

create policy "Service role can insert predictions" on mlmp_predictions
  for insert with check (true);

-- Labels policies
create policy "Users can view their own labels" on mlmp_labels
  for select using (auth.uid() = user_id);

create policy "Users can insert their own labels" on mlmp_labels
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own labels" on mlmp_labels
  for update using (auth.uid() = user_id);

create policy "Users can delete their own labels" on mlmp_labels
  for delete using (auth.uid() = user_id);

-- Entrees policies
create policy "Users can view entrees from their own menus" on mlmp_entrees
  for select using (
    exists (
      select 1 from mlmp_menu_uploads u 
      where u.menu_id = mlmp_entrees.menu_id 
      and u.user_id = auth.uid()
    )
  );

create policy "Users can insert entrees for their own menus" on mlmp_entrees
  for insert with check (
    exists (
      select 1 from mlmp_menu_uploads u 
      where u.menu_id = mlmp_entrees.menu_id 
      and u.user_id = auth.uid()
    )
  );

create policy "Users can update entrees for their own menus" on mlmp_entrees
  for update using (
    exists (
      select 1 from mlmp_menu_uploads u 
      where u.menu_id = mlmp_entrees.menu_id 
      and u.user_id = auth.uid()
    )
  );

create policy "Users can delete entrees for their own menus" on mlmp_entrees
  for delete using (
    exists (
      select 1 from mlmp_menu_uploads u 
      where u.menu_id = mlmp_entrees.menu_id 
      and u.user_id = auth.uid()
    )
  );

-- Model versions policies (global read access)
create policy "Anyone can view model versions" on mlmp_model_versions
  for select using (true);

create policy "Service role can manage model versions" on mlmp_model_versions
  for all using (true);
