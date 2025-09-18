/**
 * Comprehensive price removal utilities
 */

// Comprehensive price patterns that should be removed
export const COMPREHENSIVE_PRICE_PATTERNS = [
  // Currency symbols with numbers
  /[$€£¥]\s?\d{1,4}(?:[.,]\d{2})?/g,
  // Numbers with currency symbols
  /\d{1,4}(?:[.,]\d{2})?\s?[$€£¥]/g,
  // Just numbers that look like prices (with decimal places)
  /\d{1,3}(?:[.,]\d{2})/g,
  // Numbers at end of line (common in French menus)
  /\d{1,4}(?:[.,]\d{2})?\s*$/g,
  // Numbers at start of line
  /^\s*\d{1,4}(?:[.,]\d{2})?\s+/g,
  // Numbers with common price indicators
  /\d{1,4}(?:[.,]\d{2})?\s*(?:euros?|dollars?|cents?|pounds?|yen)/gi,
  // Standalone numbers that could be prices (3+ digits, more conservative)
  /(?<!\w)\d{3,4}(?!\w)/g,
  // Numbers with spaces and currency-like patterns
  /\d{1,4}\s*[.,]\s*\d{2}/g,
  // Market price indicators (treat as price)
  /\bmarket\s+price\b/gi
]

/**
 * Remove all price patterns from text
 */
export function removeAllPrices(text: string): string {
  let cleanedText = text
  
  // Debug logging for specific items
  if (text.includes('Cheese and Beef Crepes') || text.includes('Cheese Crepe') || text.includes('market price') || text.includes('Fish Fillet')) {
    console.log('=== REMOVE ALL PRICES DEBUG ===')
    console.log('Original text:', text)
  }
  
  // Apply all price patterns
  for (const pattern of COMPREHENSIVE_PRICE_PATTERNS) {
    const beforeReplace = cleanedText
    cleanedText = cleanedText.replace(pattern, '')
    if (beforeReplace !== cleanedText && (text.includes('Cheese and Beef Crepes') || text.includes('Cheese Crepe') || text.includes('market price') || text.includes('Fish Fillet'))) {
      console.log('Pattern applied:', pattern, 'Result:', cleanedText)
    }
  }
  
  // Clean up any remaining standalone digits (likely prices) - more conservative
  const beforeDigits = cleanedText
  cleanedText = cleanedText.replace(/\b\d{3,4}\b/g, '')
  if (beforeDigits !== cleanedText && (text.includes('Cheese and Beef Crepes') || text.includes('Cheese Crepe') || text.includes('market price') || text.includes('Fish Fillet'))) {
    console.log('Removed standalone digits. Result:', cleanedText)
  }
  
  // Remove any remaining currency symbols
  const beforeCurrency = cleanedText
  cleanedText = cleanedText.replace(/[$€£¥]/g, '')
  if (beforeCurrency !== cleanedText && (text.includes('Cheese and Beef Crepes') || text.includes('Cheese Crepe') || text.includes('market price') || text.includes('Fish Fillet'))) {
    console.log('Removed currency symbols. Result:', cleanedText)
  }
  
  // Clean up multiple spaces and trim
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim()
  
  if (text.includes('Cheese and Beef Crepes') || text.includes('Cheese Crepe') || text.includes('market price') || text.includes('Fish Fillet')) {
    console.log('Final cleaned text:', cleanedText)
    console.log('=== END REMOVE ALL PRICES DEBUG ===')
  }
  
  return cleanedText
}

/**
 * Check if text contains any price patterns
 */
export function containsAnyPrice(text: string): boolean {
  return COMPREHENSIVE_PRICE_PATTERNS.some(pattern => pattern.test(text)) ||
         /\bmarket\s+price\b/gi.test(text)
}

/**
 * Extract all price patterns from text (for debugging)
 */
export function extractAllPrices(text: string): string[] {
  const prices: string[] = []
  
  for (const pattern of COMPREHENSIVE_PRICE_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) {
      prices.push(...matches)
    }
  }
  
  // Also extract market price patterns
  const marketPriceMatches = text.match(/\bmarket\s+price\b/gi)
  if (marketPriceMatches) {
    prices.push(...marketPriceMatches)
  }
  
  return prices
}

/**
 * Comprehensive text normalization that removes ALL prices
 */
export function normalizeTextWithPriceRemoval(text: string): string {
  // First remove all prices
  let normalized = removeAllPrices(text)
  
  // Then apply standard normalization
  normalized = normalized
    .trim()
    .replace(/\s+/g, ' ') // Collapse whitespace
    // Remove any remaining punctuation except hyphens, apostrophes, ampersands
    .replace(/[^\w\s\-'&]/g, '')
    // Remove any remaining digits (shouldn't be any after price removal)
    .replace(/\d/g, '')
    // Clean up any double spaces created by removals
    .replace(/\s+/g, ' ')
    .trim()
  
  return normalized
}

/**
 * Validate that text has no prices remaining
 */
export function validateNoPrices(text: string): boolean {
  // Check for any remaining price patterns
  const hasPrices = containsAnyPrice(text)
  
  // Check for standalone numbers (likely prices)
  const hasStandaloneNumbers = /\b\d{2,4}\b/.test(text)
  
  // Check for currency symbols
  const hasCurrencySymbols = /[$€£¥]/.test(text)
  
  // Check for market price indicators
  const hasMarketPrice = /\bmarket\s+price\b/gi.test(text)
  
  return !hasPrices && !hasStandaloneNumbers && !hasCurrencySymbols && !hasMarketPrice
}
