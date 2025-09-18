/**
 * Regular expressions for menu parsing
 */

// Price patterns - supports multiple currencies and formats
export const PRICE_PATTERNS = [
  // $12.00, $12, $ 12.00
  /(?<!\w)(?:[$])\s?\d{1,3}(?:[.,]\d{2})?(?!\w)/g,
  // €12,50, € 12.50, 12€
  /(?<!\w)(?:[€])\s?\d{1,3}(?:[.,]\d{2})?(?!\w)|(?<!\w)\d{1,3}(?:[.,]\d{2})?\s?[€](?!\w)/g,
  // £12.00, £ 12.00
  /(?<!\w)(?:[£])\s?\d{1,3}(?:[.,]\d{2})?(?!\w)/g,
  // ¥1200, ¥ 1200
  /(?<!\w)(?:[¥])\s?\d{1,4}(?!\w)/g,
  // Just numbers that could be prices (12.00, 12,50) - more restrictive for French menus
  /(?<!\w)\d{1,3}(?:[.,]\d{2})(?!\w)/g,
  // French format: numbers at end of line (common in French menus without currency symbols)
  /(?<!\w)\d{1,3}(?:[.,]\d{2})?\s*$/g
]

// Section header patterns (case insensitive)
export const SECTION_HEADERS = [
  // English
  'entrees', 'entrées', 'mains', 'main courses', 'main', 'specialties', 'specialities',
  'plates', 'plats', 'platos', 'secondi', 'secondi piatti', 'piatti principali',
  'a la carte', 'a la carte menu', 'from the grill', 'chef\'s specials',
  'house specialties', 'signature dishes', 'featured items',
  
  // French
  'plats principaux', 'plats', 'spécialités', 'specialites', 'à la carte',
  
  // Italian
  'secondi', 'piatti principali', 'specialità', 'specialita', 'alla griglia',
  
  // Spanish
  'platos principales', 'platos', 'especialidades', 'a la carta'
]

// Blacklisted terms that should not be considered entree names
export const BLACKLISTED_TERMS = [
  // Section headers
  'appetizers', 'appetisers', 'starters', 'hors d\'oeuvres', 'soups', 'salads',
  'sides', 'side dishes', 'desserts', 'beverages', 'drinks', 'beer',
  'cocktails', 'coffee', 'breakfast', 'lunch',
  
  // Allergens and dietary info
  'gluten free', 'contains nuts', 'dairy free', 'mild',
  
  // Course indicators
  'first course', 'second course', 'third course', 'main course',
  
  // Common menu terms
  'ask server'
]

// Common articles and prepositions to ignore in word counting
export const STOP_WORDS = [
  'a', 'an', 'and', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
  'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'among', 'under', 'over', 'around', 'near',
  // French articles and prepositions
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'dans', 'sur', 'avec', 'pour',
  'par', 'sans', 'sous', 'entre', 'chez', 'vers', 'depuis', 'jusqu', 'pendant'
]

// French descriptive words that indicate descriptions, not menu items
export const FRENCH_DESCRIPTIVE_WORDS = [
  'avec', 'servi', 'garni', 'frais', 'local', 'bio', 'organique',
  'ail', 'citron', 'beurre', 'pain', 'miettes', 'grillé', 'baguette',
  'assaisonné', 'mariné', 'rôti', 'grillé', 'frit', 'cuit à la vapeur',
  'accompagné', 'arrosé', 'sauté', 'fini', 'garni', 'sauce', 'jus',
  'cuit', 'préparé', 'mélangé', 'haché', 'coupé', 'émincé', 'tranché'
]

/**
 * Check if text contains a price pattern
 */
export function containsPrice(text: string): boolean {
  return PRICE_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * Extract all prices from text
 */
export function extractPrices(text: string): string[] {
  const prices: string[] = []
  PRICE_PATTERNS.forEach(pattern => {
    const matches = text.match(pattern)
    if (matches) {
      prices.push(...matches)
    }
  })
  return prices
}

/**
 * Check if text is a section header
 */
export function isSectionHeader(text: string): boolean {
  const normalizedText = text.toLowerCase().trim()
  return SECTION_HEADERS.some(header => 
    normalizedText.includes(header) || header.includes(normalizedText)
  )
}

/**
 * Check if text contains blacklisted terms
 */
export function containsBlacklistedTerms(text: string): boolean {
  const normalizedText = text.toLowerCase().trim()
  
  // Use word boundary matching to avoid false positives like "tea" in "Won Tons"
  const matchingTerm = BLACKLISTED_TERMS.find(term => {
    // Create word boundary regex for the term
    const wordBoundaryRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    return wordBoundaryRegex.test(normalizedText)
  })
  
  // Debug logging for blacklist matching
  if (matchingTerm && (normalizedText.includes('goat cheese') || normalizedText.includes('new york steak') || 
      normalizedText.includes('cheese and beef crepes') || normalizedText.includes('cheese crepe'))) {
    console.log('=== BLACKLIST MATCH DEBUG ===')
    console.log('Text:', text)
    console.log('Normalized text:', normalizedText)
    console.log('Matching blacklisted term:', matchingTerm)
    console.log('=== END BLACKLIST MATCH DEBUG ===')
  }
  
  return !!matchingTerm
}

/**
 * Count meaningful words (excluding stop words)
 */
export function countMeaningfulWords(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(word => 
    word.length > 0 && !STOP_WORDS.includes(word)
  )
  return words.length
}

/**
 * Calculate punctuation density
 */
export function calculatePunctuationDensity(text: string): number {
  const punctuationCount = (text.match(/[,;:]/g) || []).length
  return punctuationCount / Math.max(text.length, 1)
}

/**
 * Check if text is all caps
 */
export function isAllCaps(text: string): boolean {
  return text === text.toUpperCase() && /[A-Z]/.test(text)
}

/**
 * Check if text is title case
 */
export function isTitleCase(text: string): boolean {
  const words = text.split(/\s+/)
  return words.every(word => 
    word.length === 0 || 
    word[0] === word[0].toUpperCase() && 
    word.slice(1) === word.slice(1).toLowerCase()
  )
}

/**
 * Calculate letter ratio (letters vs total characters)
 */
export function calculateLetterRatio(text: string): number {
  const letterCount = (text.match(/[a-zA-Z]/g) || []).length
  return letterCount / Math.max(text.length, 1)
}

/**
 * Calculate uppercase ratio
 */
export function calculateUppercaseRatio(text: string): number {
  const upperCount = (text.match(/[A-Z]/g) || []).length
  const letterCount = (text.match(/[a-zA-Z]/g) || []).length
  return letterCount > 0 ? upperCount / letterCount : 0
}

/**
 * Check if text starts with an article
 */
export function startsWithArticle(text: string): boolean {
  const firstWord = text.toLowerCase().trim().split(/\s+/)[0]
  return ['a', 'an', 'the', 'le', 'la', 'les', 'un', 'une', 'il', 'lo', 'la', 'el', 'los', 'las'].includes(firstWord)
}

/**
 * Check if text ends with a stop word
 */
export function endsWithStopWord(text: string): boolean {
  const words = text.toLowerCase().trim().split(/\s+/)
  const lastWord = words[words.length - 1]
  return STOP_WORDS.includes(lastWord)
}

/**
 * Calculate average token length
 */
export function calculateAverageTokenLength(text: string): number {
  const tokens = text.split(/\s+/).filter(token => token.length > 0)
  if (tokens.length === 0) return 0
  const totalLength = tokens.reduce((sum, token) => sum + token.length, 0)
  return totalLength / tokens.length
}
