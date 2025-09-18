-- Fix mlmp_predictions table to allow null line_id for manual candidates
-- This allows manual candidates to be saved without being associated with extracted lines

-- Make line_id nullable in mlmp_predictions table
ALTER TABLE mlmp_predictions ALTER COLUMN line_id DROP NOT NULL;

-- Update the foreign key constraint to allow null values
-- (PostgreSQL automatically handles this when we drop NOT NULL)

-- Add a comment to document this change
COMMENT ON COLUMN mlmp_predictions.line_id IS 'References extracted line for OCR-based candidates, null for manual candidates';
