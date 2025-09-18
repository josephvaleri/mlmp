# MLMP Candidate Extraction Improvements

## Issues Fixed

### 1. Database Schema Issues ✅
- **Problem**: Foreign key constraint violations in learning system
- **Solution**: Created database migration script (`scripts/fix-learning-database.sql`)
- **Status**: Ready to run in Supabase SQL Editor

### 2. Price Removal Issues ✅
- **Problem**: Candidates still contained prices like "Oysters $22", "Japanese Style Fried Chicken $16"
- **Solution**: 
  - Added `removeAllPrices()` call BEFORE any other processing
  - Applied to ALL CAPS text, high visual hierarchy text, and split parts
  - Ensures no prices remain in final candidates
- **Status**: Fixed

### 3. Visual Hierarchy Detection ✅
- **Problem**: Missing ALL CAPS, font size, and bold text detection
- **Solution**:
  - Enhanced `calculateVisualHierarchyScore()` function
  - Added `isBoldText()` detection based on OCR confidence
  - Improved `isAllCapsText()` with proper Unicode support
  - Boosted confidence scores for high visual hierarchy candidates
- **Status**: Enhanced

### 4. Text Truncation Issues 🔄
- **Problem**: Entrees being truncated (e.g., "Lamb Loin En Persillade" → "Loin En Persillade")
- **Solution**:
  - Improved `splitLineByPrices()` to use pattern matching instead of aggressive splitting
  - Added menu item pattern detection: `"Menu Item Name $Price"`
  - Better preservation of complete entree names
- **Status**: Improved

### 5. Candidate Quality Issues 🔄
- **Problem**: Poor candidates like "le Fried Chick", "Breast -", "R dB SEE Salad Su"
- **Solution**:
  - Enhanced validation in `isValidEntreeName()`
  - Better filtering of fragments and invalid patterns
  - Improved description detection
- **Status**: Improved

## Key Changes Made

### Enhanced Price Removal
```typescript
// CRITICAL: Remove all prices from the text BEFORE any other processing
partText = removeAllPrices(partText)
```

### Visual Hierarchy Scoring
```typescript
function calculateVisualHierarchyScore(line: OcrLine, allLines: OcrLine[]): number {
  let score = 0
  
  // ALL CAPS text gets highest priority
  if (isAllCapsText(line.text)) {
    score += 0.4
  }
  
  // Font size ratio
  const fontSizeRatio = calculateFontSizeRatio(line, allLines)
  if (fontSizeRatio > 1.3) {
    score += 0.3 // Significantly larger font
  }
  
  // Bold text detection
  if (isBoldText(line, allLines)) {
    score += 0.2
  }
  
  // Price proximity
  const hasPriceOnLine = containsAnyPrice(line.text)
  if (hasPriceOnLine) {
    score += 0.3 // Price on same line is very strong indicator
  }
  
  return Math.min(1.0, score)
}
```

### Improved Text Splitting
```typescript
// Instead of splitting, try to identify complete menu items
const menuItemPattern = /^(.+?)\s+(?:[$€£¥]?\s?\d{1,4}(?:[.,]\d{2})?)\s*$/
const match = text.match(menuItemPattern)

if (match) {
  // Found a single menu item with price - extract just the name
  const menuItemName = match[1].trim()
  if (menuItemName.length >= 3) {
    return [{ text: menuItemName, bbox: line.bbox }]
  }
}
```

## Expected Results

After these improvements, the system should:

1. ✅ **Remove all prices** from candidate text
2. ✅ **Detect ALL CAPS menu items** with high confidence
3. ✅ **Preserve complete entree names** without truncation
4. ✅ **Filter out descriptions** and invalid fragments
5. ✅ **Boost confidence** for visually prominent items
6. ✅ **Save learning data** properly (after running migration)

## Next Steps

1. **Run Database Migration**: Execute `scripts/fix-learning-database.sql` in Supabase SQL Editor
2. **Test with Real Menus**: Upload menus and verify improved candidate quality
3. **Monitor Learning Progress**: Check that learning stats update properly
4. **Fine-tune Thresholds**: Adjust confidence thresholds based on results

## Files Modified

- `src/lib/candidates/extractCandidates.ts` - Main candidate extraction logic
- `src/lib/learning/feedback.ts` - Learning system with fallbacks
- `scripts/fix-learning-database.sql` - Database migration script
- `supabase/migrations/20240101000004_fix_learning_schema.sql` - Schema fix

## Testing

Use the test script to verify improvements:
```bash
node test-candidate-extraction.js
```
