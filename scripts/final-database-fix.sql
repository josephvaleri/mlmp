-- Final Database Schema Fix for MLMP Learning System
-- This script will properly update the database to support the learning functionality

-- First, let's check what columns currently exist and fix them properly

-- Step 1: Make line_id nullable in mlmp_predictions (if it exists and is NOT NULL)
ALTER TABLE mlmp_predictions ALTER COLUMN line_id DROP NOT NULL;

-- Step 2: Add the new columns if they don't exist
ALTER TABLE mlmp_predictions 
  ADD COLUMN IF NOT EXISTS pred_id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS menu_id UUID REFERENCES mlmp_menu_uploads(menu_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS text TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 3: Add the new column to mlmp_labels if it doesn't exist
ALTER TABLE mlmp_labels 
  ADD COLUMN IF NOT EXISTS pred_id UUID REFERENCES mlmp_predictions(pred_id) ON DELETE CASCADE;

-- Step 4: Make line_id nullable in mlmp_labels (if it exists and is NOT NULL)
ALTER TABLE mlmp_labels ALTER COLUMN line_id DROP NOT NULL;

-- Step 5: Add indexes for performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_mlmp_predictions_pred_id ON mlmp_predictions(pred_id);
CREATE INDEX IF NOT EXISTS idx_mlmp_predictions_menu_id ON mlmp_predictions(menu_id);
CREATE INDEX IF NOT EXISTS idx_mlmp_predictions_user_id ON mlmp_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_mlmp_labels_pred_id ON mlmp_labels(pred_id);
CREATE INDEX IF NOT EXISTS idx_mlmp_labels_user_id ON mlmp_labels(user_id);

-- Step 6: Update any existing records to have pred_id values
UPDATE mlmp_predictions SET pred_id = gen_random_uuid() WHERE pred_id IS NULL;

-- Step 7: Make pred_id NOT NULL after populating it
ALTER TABLE mlmp_predictions ALTER COLUMN pred_id SET NOT NULL;

-- Step 8: Add primary key constraint on pred_id if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mlmp_predictions_pkey') THEN
        ALTER TABLE mlmp_predictions ADD PRIMARY KEY (pred_id);
    END IF;
END $$;

-- Step 9: Ensure we have proper RLS policies
-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Users can view predictions for their own lines" ON mlmp_predictions;
DROP POLICY IF EXISTS "Users can view predictions for their own menus" ON mlmp_predictions;
DROP POLICY IF EXISTS "Service role can insert predictions" ON mlmp_predictions;
DROP POLICY IF EXISTS "Service role can manage predictions" ON mlmp_predictions;
DROP POLICY IF EXISTS "Users can view their own labels" ON mlmp_labels;
DROP POLICY IF EXISTS "Users can insert their own labels" ON mlmp_labels;
DROP POLICY IF EXISTS "Users can update their own labels" ON mlmp_labels;
DROP POLICY IF EXISTS "Users can delete their own labels" ON mlmp_labels;
DROP POLICY IF EXISTS "Service role can manage labels" ON mlmp_labels;

-- Recreate RLS policies for predictions
CREATE POLICY "Users can view predictions for their own menus" ON mlmp_predictions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM mlmp_menu_uploads u
      WHERE u.menu_id = mlmp_predictions.menu_id
      AND u.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert predictions" ON mlmp_predictions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update predictions" ON mlmp_predictions
  FOR UPDATE WITH CHECK (true);

-- Recreate RLS policies for labels
CREATE POLICY "Users can view their own labels" ON mlmp_labels
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own labels" ON mlmp_labels
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own labels" ON mlmp_labels
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own labels" ON mlmp_labels
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage labels" ON mlmp_labels
  FOR ALL WITH CHECK (true);

-- Step 10: Enable RLS on both tables
ALTER TABLE mlmp_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlmp_labels ENABLE ROW LEVEL SECURITY;

-- Success message
SELECT 'Database schema updated successfully for MLMP learning system!' as status;
