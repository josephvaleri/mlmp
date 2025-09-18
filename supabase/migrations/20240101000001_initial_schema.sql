-- MLMP Database Schema
-- Machine Learning Menu Processor

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Uploaded menus
create table if not exists mlmp_menu_uploads (
  menu_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  file_name text not null,
  file_type text not null,
  page_count int not null default 1,
  created_at timestamptz not null default now()
);

-- OCR extracted lines
create table if not exists mlmp_extracted_lines (
  line_id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references mlmp_menu_uploads(menu_id) on delete cascade,
  page int not null,
  text text not null,
  bbox jsonb,
  raw jsonb, -- raw OCR info
  created_at timestamptz not null default now()
);

-- Candidate predictions (features + score at extraction time)
create table if not exists mlmp_predictions (
  pred_id uuid primary key default gen_random_uuid(),
  line_id uuid not null references mlmp_extracted_lines(line_id) on delete cascade,
  model_version text not null,
  features jsonb not null,
  confidence double precision not null,
  created_at timestamptz not null default now()
);

-- Human labels (one line can be labeled multiple times by different users; latest wins)
create table if not exists mlmp_labels (
  label_id uuid primary key default gen_random_uuid(),
  line_id uuid not null references mlmp_extracted_lines(line_id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  label text not null check (label in ('approve','deny','edit')),
  edited_text text,
  created_at timestamptz not null default now()
);

-- Final accepted entree names (deduped per menu + text)
create table if not exists mlmp_entrees (
  entree_id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references mlmp_menu_uploads(menu_id) on delete cascade,
  text text not null,
  source_line_id uuid references mlmp_extracted_lines(line_id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Track and store model binaries/metadata (tfjs JSON manifest path in storage)
create table if not exists mlmp_model_versions (
  version text primary key,
  created_at timestamptz not null default now(),
  metrics jsonb,
  storage_path text
);

-- Indexes for performance
create index if not exists idx_mlmp_extracted_lines_menu_id on mlmp_extracted_lines(menu_id);
create index if not exists idx_mlmp_extracted_lines_page on mlmp_extracted_lines(page);
create index if not exists idx_mlmp_predictions_line_id on mlmp_predictions(line_id);
create index if not exists idx_mlmp_predictions_model_version on mlmp_predictions(model_version);
create index if not exists idx_mlmp_labels_line_id on mlmp_labels(line_id);
create index if not exists idx_mlmp_labels_user_id on mlmp_labels(user_id);
create index if not exists idx_mlmp_entrees_menu_id on mlmp_entrees(menu_id);
create index if not exists idx_mlmp_entrees_text on mlmp_entrees(text);

-- Unique constraint for deduplication
create unique index if not exists idx_mlmp_entrees_menu_text_unique 
on mlmp_entrees(menu_id, lower(trim(text)));
