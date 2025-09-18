import { v4 as uuidv4 } from 'uuid'
import type { OcrLine } from '../ocr/OcrProvider'
import { 
  isSectionHeader, 
  containsBlacklistedTerms,
  countMeaningfulWords,
  calculatePunctuationDensity,
  isAllCaps,
  isTitleCase,
  calculateLetterRatio,
  calculateUppercaseRatio,
  startsWithArticle,
  endsWithStopWord,
  calculateAverageTokenLength,
  FRENCH_DESCRIPTIVE_WORDS
} from './regex'
import { detectSectionHeaders, isUnderEntreeHeader } from './headers'
import { 
  removeAllPrices, 
  containsAnyPrice, 
  extractAllPrices, 
  normalizeTextWithPriceRemoval, 
  validateNoPrices 
} from './priceRemoval'
import { findEntreeMatch, type EntreeMatch } from './entreeLookup'
import { loadLatestTrainedModel } from '../ml/training'

export interface CandidateFeatures {
  tokenCount: number
  hasDigits: number
  hasCurrency: number
  isAllCaps: number
  isTitleCase: number
  priceSameLine: number
  priceNextLines1to3: number
  underEntreeHeader: number
  punctDensity: number
  nextLineDescription: number
  prevLineHeader: number
  uppercaseRatio: number
  lettersRatio: number
  avgTokenLen: number
  startsWithArticle: number
  endsWithStop: number
  fontSizeRatio: number // New feature: ratio of this line's height to average height
  confidence: number
}

export interface Candidate {
  id: string
  page: number
  text: string
  bbox?: {
    x: number
    y: number
    w: number
    h: number
  }
  headerContext?: string
  priceContext?: string[]
  features: CandidateFeatures
  confidence: number
  databaseMatch?: EntreeMatch
}

/**
 * Extract candidate entree names from OCR lines
 */
/**
 * Calculate font size ratio for a line compared to average height
 */
function calculateFontSizeRatio(line: OcrLine, allLines: OcrLine[]): number {
  if (!line.bbox || !line.bbox.h) return 1.0
  
  // Calculate average height of all lines
  const heights = allLines
    .filter(l => l.bbox && l.bbox.h && l.bbox.h > 0)
    .map(l => l.bbox!.h)
  
  if (heights.length === 0) return 1.0
  
  const avgHeight = heights.reduce((sum, h) => sum + h, 0) / heights.length
  return line.bbox.h / avgHeight
}

/**
 * Check if a line has bold text based on OCR confidence and font characteristics
 * Lower confidence often indicates bold text (harder for OCR to read)
 */
function isBoldText(line: OcrLine, allLines: OcrLine[]): boolean {
  if (!line.confidence) return false
  
  // Calculate average confidence of all lines
  const confidences = allLines
    .filter(l => l.confidence !== undefined)
    .map(l => l.confidence!)
  
  if (confidences.length === 0) return false
  
  const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length
  
  // Bold text typically has lower OCR confidence (harder to read)
  // Also check if font size is larger than average
  const fontSizeRatio = calculateFontSizeRatio(line, allLines)
  const isLowConfidence = line.confidence < avgConfidence * 0.8
  const isLargerFont = fontSizeRatio > 1.1
  
  return isLowConfidence || isLargerFont
}

/**
 * Check if text is ALL CAPS with proper Unicode support
 */
function isAllCapsText(text: string): boolean {
  // Remove spaces, hyphens, apostrophes, and ampersands for checking
  const cleanText = text.replace(/[\s\-'&]/g, '')
  
  // Check if all remaining characters are uppercase (including accented characters)
  return cleanText.length > 0 && cleanText === cleanText.toUpperCase() && /[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ]/.test(cleanText)
}

/**
 * Calculate visual hierarchy score based on multiple factors
 */
function calculateVisualHierarchyScore(line: OcrLine, allLines: OcrLine[]): number {
  let score = 0
  
  // ALL CAPS text gets highest priority
  if (isAllCapsText(line.text)) {
    score += 0.5 // Increased from 0.4
  }
  
  // Font size ratio (enhanced weights)
  const fontSizeRatio = calculateFontSizeRatio(line, allLines)
  if (fontSizeRatio > 1.5) {
    score += 0.4 // Very large font - strongest indicator
  } else if (fontSizeRatio > 1.3) {
    score += 0.35 // Significantly larger font
  } else if (fontSizeRatio > 1.1) {
    score += 0.25 // Moderately larger font
  } else if (fontSizeRatio > 1.0) {
    score += 0.15 // Slightly larger font
  }
  
  // Bold text detection (enhanced weight)
  if (isBoldText(line, allLines)) {
    score += 0.3 // Increased from 0.2
  }
  
  // Price proximity (check if there's a price on the same line or nearby)
  const hasPriceOnLine = containsAnyPrice(line.text)
  if (hasPriceOnLine) {
    score += 0.3 // Price on same line is very strong indicator
  }
  
  // Check for prices in nearby lines (within 2 lines)
  const nearbyLines = allLines.slice(
    Math.max(0, allLines.indexOf(line) - 2),
    Math.min(allLines.length, allLines.indexOf(line) + 3)
  )
  const hasNearbyPrice = nearbyLines.some(l => l !== line && containsAnyPrice(l.text))
  if (hasNearbyPrice) {
    score += 0.15
  }
  
  // Spacing detection - larger spacing above often indicates menu items
  const spacingScore = calculateSpacingScore(line, allLines)
  score += spacingScore
  
  return Math.min(1.0, score)
}

/**
 * Calculate spacing score based on vertical spacing above and below the line
 */
function calculateSpacingScore(line: OcrLine, allLines: OcrLine[]): number {
  if (!line.bbox || !line.bbox.y) return 0
  
  const lineIndex = allLines.indexOf(line)
  if (lineIndex <= 0) return 0
  
  const prevLine = allLines[lineIndex - 1]
  if (!prevLine.bbox || !prevLine.bbox.y || !prevLine.bbox.h) return 0
  
  // Calculate spacing above this line
  const spacingAbove = line.bbox.y - (prevLine.bbox.y + prevLine.bbox.h)
  
  // Calculate average spacing in the document
  let totalSpacing = 0
  let spacingCount = 0
  
  for (let i = 1; i < allLines.length; i++) {
    const current = allLines[i]
    const previous = allLines[i - 1]
    
    if (current.bbox && current.bbox.y && previous.bbox && previous.bbox.y && previous.bbox.h) {
      const spacing = current.bbox.y - (previous.bbox.y + previous.bbox.h)
      if (spacing > 0) {
        totalSpacing += spacing
        spacingCount++
      }
    }
  }
  
  if (spacingCount === 0) return 0
  
  const avgSpacing = totalSpacing / spacingCount
  const spacingRatio = spacingAbove / avgSpacing
  
  // Reward larger spacing (common for menu items)
  if (spacingRatio > 2.0) {
    return 0.2 // Very large spacing
  } else if (spacingRatio > 1.5) {
    return 0.15 // Large spacing
  } else if (spacingRatio > 1.2) {
    return 0.1 // Above average spacing
  }
  
  return 0
}

/**
 * Check if text is a valid entree name (not a fragment or invalid pattern)
 */
function isValidEntreeName(text: string): boolean {
  const normalizedText = text.toLowerCase().trim()
  
  // Debug logging for specific items
  if (text.includes('Cheese and Beef Crepes') || text.includes('Cheese Crepe')) {
    console.log('=== VALIDATION DEBUG ===')
    console.log('Validating entree name:', text)
    console.log('Normalized:', normalizedText)
  }
  
  // Filter out candidates that start with invalid words
  const invalidStartWords = ['and', 'or', 'with', 'including', 'served', 'topped', 'garnished']
  const startsWithInvalid = invalidStartWords.some(word => normalizedText.startsWith(word + ' '))
  
  if (startsWithInvalid) {
    if (text.includes('Cheese and Beef Crepes') || text.includes('Cheese Crepe')) {
      console.log('❌ Rejected - starts with invalid word')
    }
    return false
  }
  
  // Filter out candidates with commas or periods in the middle (rare in entree names)
  const hasMiddlePunctuation = /[.,]\s/.test(text)
  if (hasMiddlePunctuation) {
    return false
  }
  
  // Filter out very short fragments (likely incomplete)
  if (normalizedText.length < 4) {
    return false
  }
  
  // Filter out single words (entrees are usually 2+ words)
  const wordCount = normalizedText.split(/\s+/).filter(w => w.length > 0).length
  if (wordCount < 2) {
    return false
  }
  
  // CRITICAL: Ensure no prices remain in the text
  if (!validateNoPrices(text)) {
    if (text.includes('Cheese and Beef Crepes') || text.includes('Cheese Crepe')) {
      console.log('❌ Rejected - prices remain in text')
    }
    console.log('Rejecting candidate with remaining prices:', text)
    return false
  }
  
  if (text.includes('Cheese and Beef Crepes') || text.includes('Cheese Crepe')) {
    console.log('✅ Validation passed for:', text)
  }
  
  return true
}

/**
 * Check if text is likely a description that should be excluded
 */
function isDescriptionText(text: string, lineIndex: number, allLines: string[]): boolean {
  const normalizedText = text.toLowerCase().trim()
  const words = normalizedText.split(/\s+/).filter(w => w.length > 0)
  
  // Descriptions are usually:
  // 1. Longer than 6 words
  // 2. Don't have prices
  // 3. Contain descriptive words
  // 4. Often follow menu items
  // 5. Have high comma density (comma-separated ingredients)
  
  const isLong = words.length > 6
  const hasNoPrice = !containsAnyPrice(text)
  
  // Check for high comma density (common in descriptions)
  const commaCount = (text.match(/,/g) || []).length
  const hasHighCommaDensity = commaCount >= 2 || (commaCount > 0 && words.length > 4)
  
  // Descriptive words that indicate it's a description, not a menu item
  const descriptiveWords = [
    'with', 'served', 'topped', 'garnished', 'fresh', 'local', 'organic',
    'garlic', 'lemon', 'butter', 'sourdough', 'crumbs', 'grilled', 'baguette',
    'seasoned', 'marinated', 'roasted', 'grilled', 'fried', 'steamed',
    'accompanied', 'drizzled', 'sprinkled', 'finished', 'garnished'
  ]
  
  // Combine English and French descriptive words
  const allDescriptiveWords = [...descriptiveWords, ...FRENCH_DESCRIPTIVE_WORDS]
  const containsDescriptiveWords = allDescriptiveWords.some(word => normalizedText.includes(word))
  
  // Check if previous line looks like a menu item (has price, is shorter, or is ALL CAPS)
  const prevLine = lineIndex > 0 ? allLines[lineIndex - 1].trim() : ''
  const prevLineIsShorter = prevLine.length < text.length * 0.8
  const prevLineIsAllCaps = /^[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ\s\-'&]+$/.test(prevLine) && prevLine.length > 3
  
  // Check if next line looks like another menu item
  const nextLine = lineIndex < allLines.length - 1 ? allLines[lineIndex + 1].trim() : ''
  const nextLineHasPrice = containsAnyPrice(nextLine)
  const nextLineIsAllCaps = /^[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ\s\-'&]+$/.test(nextLine) && nextLine.length > 3
  
  // It's likely a description if:
  // - It's long and has no price AND contains descriptive words
  // - Has high comma density (comma-separated ingredients)
  // - Is between menu items (previous line shorter/ALL CAPS, next line has price/ALL CAPS)
  // - OR follows an ALL CAPS line (common pattern: ALL CAPS menu item, then description)
  // BUT NOT if it's a short, simple entree name (like "Potato Skins", "Ribs", etc.)
  // OR if it's a clear entree name (like "Crab and Scallop Cake")
  const isShortSimpleEntree = words.length <= 3 && !containsDescriptiveWords && !hasHighCommaDensity
  const isClearEntreeName = words.length <= 5 && !containsDescriptiveWords && !hasHighCommaDensity && 
                           (words.some(w => ['crab', 'scallop', 'cake', 'steak', 'ribs', 'skins', 'platter', 'newburg'].includes(w.toLowerCase())))
  
  const isDescription = hasNoPrice && !isShortSimpleEntree && !isClearEntreeName && (
    (isLong && containsDescriptiveWords) ||
    hasHighCommaDensity ||
    (prevLineIsShorter && nextLineHasPrice) ||
    (prevLineIsAllCaps && isLong) || // Only if it's also long
    (prevLineIsAllCaps && nextLineIsAllCaps && isLong) // Between two ALL CAPS items and long
  )
  
  // Debug logging for description detection
  if ((isDescription || normalizedText.includes('potato') || normalizedText.includes('skins') || normalizedText.includes('ribs') || 
       normalizedText.includes('crab') || normalizedText.includes('scallop')) && 
      (normalizedText.includes('garlic') || normalizedText.includes('butter') || normalizedText.includes('scallop') || normalizedText.includes('avec') ||
       normalizedText.includes('lobster') || normalizedText.includes('newburg') || normalizedText.includes('combination') || normalizedText.includes('platter') ||
       normalizedText.includes('potato') || normalizedText.includes('skins') || normalizedText.includes('ribs'))) {
    console.log('=== DESCRIPTION FILTERING DEBUG ===')
    console.log('Text:', text)
    console.log('Is description:', isDescription)
    console.log('Is short simple entree:', isShortSimpleEntree)
    console.log('Is clear entree name:', isClearEntreeName)
    console.log('Previous line:', prevLine)
    console.log('Previous line is ALL CAPS:', prevLineIsAllCaps)
    console.log('Comma count:', commaCount, 'High comma density:', hasHighCommaDensity)
    console.log('Is long:', isLong, 'Contains descriptive words:', containsDescriptiveWords)
    console.log('Has no price:', hasNoPrice)
    console.log('=== END DESCRIPTION FILTERING ===')
  }
  
  return isDescription
}

/**
 * Check if text is likely a restaurant name or header that should be excluded
 */
function isRestaurantNameOrHeader(
  text: string, 
  lineIndex: number, 
  sectionHeaders: any[], 
  allLines: string[]
): boolean {
  const normalizedText = text.toLowerCase().trim()
  
  // Check if it's a section header
  if (isSectionHeader(text)) {
    return true
  }
  
  // Restaurant names are usually:
  // 1. Short (1-4 words)
  // 2. Appear early in the menu (first 20% of lines)
  // 3. Often in title case or all caps
  // 4. Don't have prices
  // 5. Are followed by section headers
  
  const words = normalizedText.split(/\s+/).filter(w => w.length > 0)
  const isShort = words.length <= 4
  const isEarly = lineIndex < allLines.length * 0.2
  const isTitleCase = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(text)
  const isAllCaps = /^[A-Z\s]+$/.test(text)
  const hasNoPrice = !containsAnyPrice(text)
  
  // Check if next few lines contain section headers
  const hasSectionHeaderAfter = sectionHeaders.some(header => 
    header.lineIndex > lineIndex && header.lineIndex <= lineIndex + 5
  )
  
  // Restaurant name indicators
  const isRestaurantName = isShort && isEarly && (isTitleCase || isAllCaps) && hasNoPrice && hasSectionHeaderAfter
  
  // Additional patterns that suggest restaurant names (more specific to avoid false positives)
  const restaurantPatterns = [
    /^[A-Z][a-z]*'?s\s+(Restaurant|Cafe|Bistro|Grill|Kitchen|Dining|Eatery|Bar|Lounge)$/i, // "Joe's Restaurant", "Mary's Cafe"
    /^[A-Z][a-z]+\s+&\s+[A-Z][a-z]+'?s$/i, // "Joe & Jane's"
    /^[A-Z][a-z]+\s+(Italian|French|Chinese|Mexican|Thai|Indian|Japanese|American)\s+(Restaurant|Cafe|Bistro|Grill|Kitchen|Dining|Eatery)$/i, // "Joe's Italian Restaurant"
    /^[A-Z][a-z]+\s+[A-Z][a-z]+\s+(Restaurant|Cafe|Bistro|Grill|Kitchen|Dining|Eatery|Bar|Lounge)$/i, // "Joe's Fine Restaurant"
    /^(The\s+)?[A-Z][a-z]+\s+(Restaurant|Cafe|Bistro|Grill|Kitchen|Dining|Eatery|Bar|Lounge)$/i // "The Restaurant", "Joe's Restaurant"
  ]
  
  const matchesRestaurantPattern = restaurantPatterns.some(pattern => pattern.test(text))
  
  // Check if it's a description (longer text, no price, contains descriptive words)
  const isDescription = isDescriptionText(text, lineIndex, allLines)
  
  const result = isRestaurantName || matchesRestaurantPattern || isDescription
  
  // Debug logging for restaurant name/header filtering
  if (result && (normalizedText.includes('lobster') || normalizedText.includes('newburg') || 
      normalizedText.includes('combination') || normalizedText.includes('platter') ||
      normalizedText.includes('potato') || normalizedText.includes('skins') || normalizedText.includes('ribs'))) {
    console.log('=== RESTAURANT NAME FILTERING DEBUG ===')
    console.log('Filtering out as restaurant name/header:', text)
    console.log('Is restaurant name:', isRestaurantName)
    console.log('Matches restaurant pattern:', matchesRestaurantPattern)
    console.log('Is description:', isDescription)
    console.log('Is short:', isShort, 'Is early:', isEarly, 'Is title case:', isTitleCase, 'Is all caps:', isAllCaps, 'Has no price:', hasNoPrice, 'Has section header after:', hasSectionHeaderAfter)
    console.log('=== END RESTAURANT NAME FILTERING ===')
  }
  
  return result
}

/**
 * Detect compound menu items that should be split into separate entrees
 * Examples: "Combination Platter Lobster Newburg $40.00" -> ["Combination Platter $40.00", "Lobster Newburg $40.00"]
 *           "Tomato Pasta Salmon Rolls $25.00" -> ["Tomato Pasta $25.00", "Salmon Rolls $25.00"]
 */
function detectCompoundMenuItems(text: string): string[] {
  // Add specific debug logging for the problematic cases
  const shouldDebug = text.includes('Chicken Fajita') || text.includes('Greek Steak') || 
                     text.includes('Thai Chicken') || text.includes('Kale Crunch')
  
  if (shouldDebug) {
    console.log('=== DETECT COMPOUND MENU ITEMS DEBUG (SPECIFIC CASES) ===')
    console.log('Input text:', text)
  }
  
  // Extract price from the end of the text
  const priceMatch = text.match(/(.*?)\s*([$€£¥]\s?\d{1,4}(?:[.,]\d{2})?)\s*$/i)
  const baseText = priceMatch ? priceMatch[1].trim() : text
  const price = priceMatch ? priceMatch[2].trim() : ''
  
  if (shouldDebug) {
    console.log('Price match:', priceMatch)
    console.log('Base text:', baseText)
    console.log('Price:', price)
  }
  
  // Known compound patterns that should be split
  const compoundPatterns = [
    // Pattern: "Combination Platter [Item Name]" - more specific
    {
      pattern: /^(combination\s+platter)\s+(.+)$/i,
      split: (match: RegExpMatchArray) => [match[1], match[2]]
    },
    // Pattern: "[Item1] [Item2] Rolls" - split before "Rolls"
    {
      pattern: /^(.+?)\s+(.+?\s+rolls?)$/i,
      split: (match: RegExpMatchArray) => [match[1], match[2]]
    },
    // Pattern: "[Item1] [Item2] Pasta" - split before "Pasta"
    {
      pattern: /^(.+?)\s+(.+?\s+pasta)$/i,
      split: (match: RegExpMatchArray) => [match[1], match[2]]
    },
    // Pattern: "[Item1] [Item2] Steak" - split before "Steak"
    {
      pattern: /^(.+?)\s+(.+?\s+steak)$/i,
      split: (match: RegExpMatchArray) => [match[1], match[2]]
    },
    // Pattern: "[Item1] [Item2] Salad" - split before "Salad"
    {
      pattern: /^(.+?)\s+(.+?\s+salad)$/i,
      split: (match: RegExpMatchArray) => [match[1], match[2]]
    },
    // Pattern: "[Item1] [Item2] Newburg" - split before "Newburg"
    {
      pattern: /^(.+?)\s+(.+?\s+newburg)$/i,
      split: (match: RegExpMatchArray) => [match[1], match[2]]
    },
    // NEW: Pattern for "Chicken Fajita Greek Steak" - split at Greek
    {
      pattern: /^(.+?)\s+(greek\s+.+)$/i,
      split: (match: RegExpMatchArray) => [match[1], match[2]]
    },
    // NEW: Pattern for "Thai Chicken Kale Crunch" - split at Kale
    {
      pattern: /^(.+?)\s+(kale\s+.+)$/i,
      split: (match: RegExpMatchArray) => [match[1], match[2]]
    },
    // NEW: General pattern for items with multiple words that could be separate entrees
    // This catches cases like "Chicken Fajita Greek Steak" where we have two distinct food items
    {
      pattern: /^([a-z]+\s+[a-z]+)\s+([a-z]+\s+[a-z]+(?:\s+[a-z]+)?)$/i,
      split: (match: RegExpMatchArray) => [match[1], match[2]]
    }
  ]
  
  for (const { pattern, split } of compoundPatterns) {
    if (shouldDebug) {
      console.log('Testing pattern:', pattern)
    }
    const match = baseText.match(pattern)
    if (shouldDebug) {
      console.log('Pattern match result:', match)
    }
    if (match) {
      const items = split(match)
      if (shouldDebug) {
        console.log('Split items:', items)
      }
      // Validate that both parts are substantial menu items
      if (items.length === 2 && 
          items[0].trim().length >= 3 && 
          items[1].trim().length >= 3 &&
          /[a-zA-Z]/.test(items[0]) && 
          /[a-zA-Z]/.test(items[1])) {
        // Add price to each item if it exists
        const itemsWithPrice = items.map(item => {
          const cleanItem = item.trim()
          return price ? `${cleanItem} ${price}` : cleanItem
        })
        if (shouldDebug) {
          console.log('Final compound items with price:', itemsWithPrice)
          console.log('=== END DETECT COMPOUND MENU ITEMS DEBUG ===')
        }
        return itemsWithPrice
      } else {
        if (shouldDebug) {
          console.log('Items failed validation:', items)
        }
      }
    }
  }
  
  if (shouldDebug) {
    console.log('No compound pattern matched, returning original text')
    console.log('=== END DETECT COMPOUND MENU ITEMS DEBUG ===')
  }
  return [text] // Return original if no compound pattern matches
}

/**
 * Split a line that contains multiple menu items separated by prices
 * Returns an array of {text, bbox} objects for each menu item
 */
function splitLineByPrices(line: OcrLine): Array<{text: string, bbox?: any}> {
  const text = line.text.trim()
  const prices = extractAllPrices(text)
  
  // Debug logging for text truncation issues
  if (text.includes('Japanese Style Fried Chicken') || text.includes('Roaster Chesapeake Oysters') || 
      text.includes('Lamb Loin En Persillade') || text.includes('Loin En Persillade') ||
      text.includes('Lobster Newburg') || text.includes('Combination Platter') ||
      text.includes('Cheese and Beef Crepes') || text.includes('Tomato Pasta Salmon Rolls') ||
      text.includes('Cheese Crepe')) {
    console.log('=== SPLIT LINE BY PRICES DEBUG ===')
    console.log('Processing line:', text)
    console.log('Found prices:', prices)
    console.log('Original text length:', text.length)
    console.log('=== END SPLIT LINE BY PRICES DEBUG ===')
  }
  
  // If no prices found, return the original line
  if (prices.length === 0) {
    return [{ text, bbox: line.bbox }]
  }
  
  // NEW APPROACH: Split by price patterns to get individual menu items
  // Enhanced pattern to handle multiple menu items on same line
  // Pattern to match: "Menu Item Name $Price" or "Menu Item Name Price"
  // FIXED: Made pattern more inclusive to capture full menu item names
  const menuItemWithPricePattern = /([A-Za-z][A-Za-z\s\-'&]+?)\s*([$€£¥]\s?\d{1,4}(?:[.,]\d{2})?)/g
  
  const results: Array<{text: string, bbox?: any}> = []
  let match
  
  while ((match = menuItemWithPricePattern.exec(text)) !== null) {
    const menuItemName = match[1].trim()
    const price = match[2].trim()
    
    // Debug logging for each menu item found
    if (text.includes('Lobster Newburg') || text.includes('Combination Platter') ||
        text.includes('Cheese and Beef Crepes') || text.includes('Tomato Pasta Salmon Rolls')) {
      console.log('Found menu item:', menuItemName, 'with price:', price)
    }
    
    // Only include if the menu item name is substantial
    if (menuItemName.length >= 3 && /[a-zA-Z]/.test(menuItemName)) {
      results.push({ 
        text: menuItemName, 
        bbox: line.bbox // Use same bbox for now, could be improved with position calculation
      })
    }
  }
  
  // If we found menu items, return them
  if (results.length > 0) {
    return results
  }

  // ENHANCED APPROACH: Handle compound menu items without prices
  // Check for patterns like "Combination Platter Lobster Newburg" or "Tomato Pasta Salmon Rolls"
  const compoundMenuItems = detectCompoundMenuItems(text)
  if (compoundMenuItems.length > 1) {
    console.log('Detected compound menu items:', compoundMenuItems)
    return compoundMenuItems.map(item => ({ text: item, bbox: line.bbox }))
  }
  
  // Fallback: try to split by price patterns
  const pricePattern = /(?<!\w)(?:[$€£¥])\s?\d{1,4}(?:[.,]\d{2})?(?!\w)|(?<!\w)\d{1,3}(?:[.,]\d{2})(?!\w)|(?<!\w)\d{1,4}(?:[.,]\d{2})?\s*$/g
  const parts = text.split(pricePattern).map(part => part.trim()).filter(part => part.length > 0)
  
  // Debug logging for splitting
  if (text.includes('Japanese Style Fried Chicken') || text.includes('Roaster Chesapeake Oysters') ||
      text.includes('Lobster Newburg') || text.includes('Combination Platter') ||
      text.includes('Cheese and Beef Crepes') || text.includes('Tomato Pasta Salmon Rolls')) {
    console.log('Fallback split parts:', parts)
  }
  
  // If we only have one part after splitting, return original
  if (parts.length <= 1) {
    return [{ text, bbox: line.bbox }]
  }
  
  // Create separate candidates for each part
  const fallbackResults: Array<{text: string, bbox?: any}> = []
  
  for (const part of parts) {
    // Skip parts that are too short or contain only prices/digits/punctuation
    if (part.length < 2 || /^[\d\s\$€£¥\.\,\-\/]+$/.test(part)) {
      continue
    }
    
    // Skip parts that are just single characters or very short
    if (part.trim().length < 3) {
      continue
    }
    
    // Clean up the text more carefully - preserve important characters
    let cleanText = part
      // Remove only leading/trailing punctuation (not hyphens, apostrophes, ampersands)
      .replace(/^[^\w\s\-'&]+|[^\w\s\-'&]+$/g, '')
      // Remove multiple spaces
      .replace(/\s+/g, ' ')
      // Remove standalone punctuation (but preserve hyphens in words)
      .replace(/\s+[^\w\s\-'&]+\s+/g, ' ')
      .trim()
    
    // Debug logging for text cleaning issues
    if (part.includes('Cheese and Beef Crepes') || part.includes('Cheese Crepe') || 
        part.includes('and Beef') || part.includes('Beef Crepes')) {
      console.log('=== TEXT CLEANING DEBUG ===')
      console.log('Original part:', part)
      console.log('Cleaned text:', cleanText)
      console.log('Part length:', part.length, 'Clean length:', cleanText.length)
      console.log('=== END TEXT CLEANING ===')
    }
    
    // Debug logging for text cleaning
    if (part.includes('Lamb') || part.includes('Loin') || part.includes('Persillade') || 
        part.includes('Japanese') || part.includes('Fried') || part.includes('Chicken') || 
        part.includes('Roaster') || part.includes('Chesapeake') || part.includes('Oysters')) {
      console.log('Original part:', part)
      console.log('Cleaned text:', cleanText)
      console.log('Part length:', part.length, 'Clean length:', cleanText.length)
    }
    
    // Additional validation - must contain at least one letter
    if (cleanText.length >= 2 && /[a-zA-Z]/.test(cleanText)) {
      // Filter out invalid entree patterns
      if (isValidEntreeName(cleanText)) {
        fallbackResults.push({ 
          text: cleanText, 
          bbox: line.bbox // Use same bbox for now, could be improved with position calculation
        })
      }
    }
  }
  
  return fallbackResults.length > 0 ? fallbackResults : [{ text, bbox: line.bbox }]
}

export async function extractCandidates(
  ocrLines: OcrLine[], 
  pageNumber: number = 1,
  topN: number = 100
): Promise<Candidate[]> {
  const lines = ocrLines.map(line => line.text)
  const sectionHeaders = detectSectionHeaders(lines)
  
  // Debug: Log section headers
  console.log('=== SECTION HEADERS DEBUG ===')
  console.log('Detected section headers:', sectionHeaders)
  console.log('=== END SECTION HEADERS ===')
  
  // Debug: Log all OCR lines to see what we're working with
  console.log('=== OCR LINES DEBUG ===')
  ocrLines.forEach((line, index) => {
    if (line.text.trim().length > 0) {
      console.log(`Line ${index}: "${line.text}" (confidence: ${line.confidence}, bbox: ${JSON.stringify(line.bbox)})`)
    }
  })
  console.log('=== END OCR LINES ===')
  
  const candidates: Candidate[] = []

  for (let i = 0; i < ocrLines.length; i++) {
    const line = ocrLines[i]
    const text = line.text.trim()
    
    // STEP 1: OCR INPUT - Trace the exact text from OCR
    if (text.includes('Combination Platter') || text.includes('Lobster Newburg')) {
      console.log('=== STEP 1: OCR INPUT ===')
      console.log('Line index:', i)
      console.log('Raw OCR text:', JSON.stringify(text))
      console.log('Trimmed text:', JSON.stringify(text.trim()))
      console.log('Text length:', text.length)
      console.log('Full OCR line object:', JSON.stringify(line, null, 2))
      console.log('=== END STEP 1: OCR INPUT ===')
    }
    
    if (!text || text.length < 2) continue

    // STEP 2: BLACKLIST/SECTION HEADER CHECK
    if (text.includes('Combination Platter') || text.includes('Lobster Newburg')) {
      console.log('=== STEP 2: BLACKLIST/SECTION HEADER CHECK ===')
      console.log('Text:', text)
      console.log('Contains blacklisted terms:', containsBlacklistedTerms(text))
      console.log('Is section header:', isSectionHeader(text))
      console.log('=== END STEP 2: BLACKLIST/SECTION HEADER CHECK ===')
    }
    
    if (containsBlacklistedTerms(text) || isSectionHeader(text)) {
      if (text.includes('Combination Platter') || text.includes('Lobster Newburg')) {
        console.log('❌ FILTERED OUT by blacklist/section header')
      }
      continue
    }

    // STEP 3: RESTAURANT NAME/HEADER CHECK
    if (text.includes('Combination Platter') || text.includes('Lobster Newburg')) {
      console.log('=== STEP 3: RESTAURANT NAME/HEADER CHECK ===')
      console.log('Text:', text)
      console.log('Is restaurant name or header:', isRestaurantNameOrHeader(text, i, sectionHeaders, lines))
      console.log('=== END STEP 3: RESTAURANT NAME/HEADER CHECK ===')
    }
    
    if (isRestaurantNameOrHeader(text, i, sectionHeaders, lines)) {
      if (text.includes('Combination Platter') || text.includes('Lobster Newburg')) {
        console.log('❌ FILTERED OUT as restaurant name/header')
      }
      continue
    }

    // STEP 4: VISUAL HIERARCHY AND ALL CAPS CHECK
    if (text.includes('Combination Platter') || text.includes('Lobster Newburg')) {
      console.log('=== STEP 4: VISUAL HIERARCHY AND ALL CAPS CHECK ===')
      console.log('Text:', text)
      const visualHierarchyScore = calculateVisualHierarchyScore(line, ocrLines)
      const isAllCaps = isAllCapsText(text)
      console.log('Visual hierarchy score:', visualHierarchyScore)
      console.log('Is ALL CAPS:', isAllCaps)
      console.log('=== END STEP 4: VISUAL HIERARCHY AND ALL CAPS CHECK ===')
    }
    
    const visualHierarchyScore = calculateVisualHierarchyScore(line, ocrLines)
    
    // ALL CAPS text is almost always a menu item - prioritize it heavily
    const isAllCaps = isAllCapsText(text)
    if (isAllCaps) {
      // CRITICAL: Remove all prices from ALL CAPS text
      const cleanText = removeAllPrices(text)
      
      // Debug logging for ALL CAPS detection
      if (text.includes('SAUTEED') || text.includes('SCALLOP') || text.includes('MAINE') || text.includes('SAUTÉ') ||
          text.includes('Goat Cheese') || text.includes('New York Steak') ||
          text.includes('Potato Skins') || text.includes('Beef Ribs') ||
          text.includes('Crab and Scallop Cake') || text.includes('Fish Fillet')) {
        console.log('=== ALL CAPS DETECTION ===')
        console.log('Found ALL CAPS menu item:', text)
        console.log('After price removal:', cleanText)
        console.log('Visual hierarchy score:', visualHierarchyScore)
        console.log('=== END ALL CAPS DETECTION ===')
      }
      
      // Skip if text becomes too short after price removal
      if (cleanText.length < 3) {
        continue
      }
      
      // Skip the description filtering for ALL CAPS text
      const features = extractFeatures(cleanText, lines, i, sectionHeaders, ocrLines)
      
      // Look up in database for entree match
      console.log(`🔍 About to lookup in database (ALL CAPS): "${cleanText}"`)
      const databaseMatch = await findEntreeMatch(cleanText)
      console.log(`📊 Database lookup result for "${cleanText}":`, databaseMatch ? `Found: ${databaseMatch.name}` : 'No match')
      
      const baseConfidence = calculateConfidenceScore(features, databaseMatch || undefined)
      
      // Boost confidence significantly for ALL CAPS text with visual hierarchy
      const boostedConfidence = Math.min(1.0, baseConfidence + 0.4 + visualHierarchyScore * 0.3)
      
      if (boostedConfidence > 0.1 && isValidEntreeName(cleanText)) {
        const candidate: Candidate = {
          id: uuidv4(),
          page: pageNumber,
          text: cleanText,
          bbox: line.bbox,
          headerContext: getHeaderContext(i, sectionHeaders),
          priceContext: [], // Should be empty after price removal
          features,
          confidence: boostedConfidence,
          databaseMatch: databaseMatch || undefined
        }
        
        candidates.push(candidate)
        continue // Skip the normal processing for this line
      }
    }
    
    // High visual hierarchy score indicates likely menu item
    // BUT we still need to check for compound items that should be split
    if (visualHierarchyScore > 0.5) {
      // Check if this is a compound item that should be split first
      const shouldCheckCompounds = text.includes('Combination Platter') || 
                                  text.includes('Tomato Pasta') ||
                                  text.includes('Salmon Rolls') ||
                                  text.includes('Lobster Newburg') ||
                                  text.includes('Combination Platter Lobster Newburg') ||
                                  text.includes('Tomato Pasta Salmon Rolls') ||
                                  text.includes('Chicken Fajita') ||
                                  text.includes('Greek Steak') ||
                                  text.includes('Thai Chicken') ||
                                  text.includes('Kale Crunch') ||
                                  // General check: if text has multiple words and could be compound
                                  (text.split(/\s+/).length >= 4 && /[A-Z]/.test(text))
      
      if (shouldCheckCompounds) {
        console.log('=== HIGH VISUAL HIERARCHY + COMPOUND DETECTION ===')
        console.log('Text:', text)
        console.log('Visual hierarchy score:', visualHierarchyScore)
        console.log('About to check for compound items...')
        
        const compoundMenuItems = detectCompoundMenuItems(text)
        console.log('Compound detection result:', compoundMenuItems)
        
        if (compoundMenuItems.length > 1) {
          console.log('✅ COMPOUND ITEMS DETECTED in high visual hierarchy - processing each separately')
          // Process each compound item as a separate candidate
          for (const compoundItem of compoundMenuItems) {
            const cleanItem = removeAllPrices(compoundItem)
            console.log(`Processing compound item: "${compoundItem}" -> "${cleanItem}"`)
            
            if (cleanItem.length >= 3) {
              const features = extractFeatures(cleanItem, lines, i, sectionHeaders, ocrLines)
              const databaseMatch = await findEntreeMatch(cleanItem)
              const baseConfidence = calculateConfidenceScore(features, databaseMatch || undefined)
              const boostedConfidence = Math.min(1.0, baseConfidence + visualHierarchyScore * 0.4)
              
              if (boostedConfidence > 0.1 && isValidEntreeName(cleanItem)) {
                const candidate: Candidate = {
                  id: uuidv4(),
                  page: pageNumber,
                  text: cleanItem,
                  bbox: line.bbox,
                  headerContext: getHeaderContext(i, sectionHeaders),
                  priceContext: [],
                  features,
                  confidence: boostedConfidence,
                  databaseMatch: databaseMatch || undefined
                }
                
                candidates.push(candidate)
                console.log(`✅ Created compound candidate: "${cleanItem}"`)
              }
            }
          }
          continue // Skip the normal processing for this line
        } else {
          console.log('❌ No compound items detected, proceeding with normal high visual hierarchy processing')
        }
        console.log('=== END HIGH VISUAL HIERARCHY + COMPOUND DETECTION ===')
      }
      
      // CRITICAL: Remove all prices from high visual hierarchy text
      const cleanText = removeAllPrices(text)
      
      // Debug logging for high visual hierarchy
      if (text.includes('Lamb') || text.includes('Loin') || text.includes('Persillade') || text.includes('Fish Fillet')) {
        console.log('High visual hierarchy detected:', text)
        console.log('After price removal:', cleanText)
        console.log('Visual hierarchy score:', visualHierarchyScore)
        console.log('Font size ratio:', calculateFontSizeRatio(line, ocrLines))
        console.log('Is bold:', isBoldText(line, ocrLines))
        console.log('Has price on line:', containsAnyPrice(text))
      }
      
      // Skip if text becomes too short after price removal
      if (cleanText.length < 3) {
        continue
      }
      
      // Skip description filtering for high visual hierarchy
      const features = extractFeatures(cleanText, lines, i, sectionHeaders, ocrLines)
      const baseConfidence = calculateConfidenceScore(features)
      
      // Boost confidence for high visual hierarchy
      const boostedConfidence = Math.min(1.0, baseConfidence + visualHierarchyScore * 0.4)
      
      if (boostedConfidence > 0.1 && isValidEntreeName(cleanText)) {
        const candidate: Candidate = {
          id: uuidv4(),
          page: pageNumber,
          text: cleanText,
          bbox: line.bbox,
          headerContext: getHeaderContext(i, sectionHeaders),
          priceContext: [], // Should be empty after price removal
          features,
          confidence: boostedConfidence
        }
        
        candidates.push(candidate)
        continue // Skip the normal processing for this line
      }
    }

    // STEP 5: LINE SPLITTING AND COMPOUND DETECTION
    if (text.includes('Combination Platter') || text.includes('Lobster Newburg')) {
      console.log('=== STEP 5: LINE SPLITTING AND COMPOUND DETECTION ===')
      console.log('Original text:', text)
      console.log('About to call splitLineByPrices...')
    }
    
    // Use normal price-based splitting first
    let lineParts = splitLineByPrices(line)
    
    if (text.includes('Combination Platter') || text.includes('Lobster Newburg')) {
      console.log('After splitLineByPrices:')
      console.log('Number of parts:', lineParts.length)
      lineParts.forEach((part, index) => {
        console.log(`Part ${index}:`, JSON.stringify(part.text))
      })
    }
    
    // Only apply compound detection for specific known patterns
    const shouldCheckCompounds = text.includes('Combination Platter') || 
                                text.includes('Tomato Pasta') ||
                                text.includes('Salmon Rolls') ||
                                text.includes('Lobster Newburg') ||
                                text.includes('Combination Platter Lobster Newburg') ||
                                text.includes('Tomato Pasta Salmon Rolls')
    
    if (text.includes('Combination Platter') || text.includes('Lobster Newburg')) {
      console.log('Should check compounds:', shouldCheckCompounds)
      console.log('=== END STEP 5: LINE SPLITTING AND COMPOUND DETECTION ===')
    }
    
    if (shouldCheckCompounds) {
      console.log('=== STEP 6: COMPOUND DETECTION ===')
      console.log('Original line:', text)
      console.log('About to call detectCompoundMenuItems...')
      const compoundMenuItems = detectCompoundMenuItems(text)
      console.log('Compound detection result:', compoundMenuItems)
      console.log('Number of compound items:', compoundMenuItems.length)
      if (compoundMenuItems.length > 1) {
        console.log('✅ COMPOUND ITEMS DETECTED - Replacing line parts')
        console.log('Original line parts:', lineParts.map(p => p.text))
        // Create line parts from compound items, then remove prices from each
        lineParts = compoundMenuItems.map(item => {
          const cleanItem = removeAllPrices(item)
          console.log(`Compound item: "${item}" -> "${cleanItem}"`)
          return { text: cleanItem, bbox: line.bbox }
        })
        console.log('New line parts after compound detection:', lineParts.map(p => p.text))
      } else {
        console.log('❌ No compound items detected, using price-based splitting')
      }
      console.log('=== END STEP 6: COMPOUND DETECTION ===')
    }
    
    // Debug logging for compound detection
    if (text.includes('Cheese and Beef Crepes') || text.includes('Cheese Crepe')) {
      console.log('=== COMPOUND DETECTION DEBUG ===')
      console.log('Original text:', text)
      console.log('Should check compounds:', shouldCheckCompounds)
      console.log('Line parts after processing:', lineParts.map(p => `"${p.text}"`))
      console.log('=== END COMPOUND DETECTION DEBUG ===')
    }
    
    // Debug logging for line splitting
    if (text.includes('Lobster') || text.includes('Newburg') || text.includes('New York') || text.includes('Goat Cheese') ||
        text.includes('Combination Platter') || text.includes('Potato Skins') || text.includes('Beef Ribs') ||
        text.includes('Crab and Scallop Cake') || text.includes('Tomato Pasta') || text.includes('Salmon Rolls') ||
        text.includes('Cheese and Beef Crepes')) {
      console.log('=== LINE SPLITTING DEBUG ===')
      console.log('Original line:', text)
      console.log('Split into parts:', lineParts.map(p => `"${p.text}"`))
      console.log('Number of parts:', lineParts.length)
      console.log('=== END LINE SPLITTING DEBUG ===')
    }
    
    // STEP 7: PROCESS EACH PART
    if (text.includes('Combination Platter') || text.includes('Lobster Newburg')) {
      console.log('=== STEP 7: PROCESS EACH PART ===')
      console.log('Total parts to process:', lineParts.length)
      console.log('=== END STEP 7: PROCESS EACH PART ===')
    }
    
    for (const part of lineParts) {
      let partText = part.text
      
      // STEP 8: INDIVIDUAL PART PROCESSING
      if (partText.includes('Combination Platter') || partText.includes('Lobster Newburg')) {
        console.log('=== STEP 8: INDIVIDUAL PART PROCESSING ===')
        console.log('Processing part:', JSON.stringify(partText))
        console.log('Part text length:', partText.length)
        console.log('=== END STEP 8: INDIVIDUAL PART PROCESSING ===')
      }
      
      // STEP 9: PRICE REMOVAL
      const originalPartText = partText
      if (partText.includes('Combination Platter') || partText.includes('Lobster Newburg')) {
        console.log('=== STEP 9: PRICE REMOVAL ===')
        console.log('Original part text:', JSON.stringify(originalPartText))
        console.log('About to call removeAllPrices...')
      }
      
      partText = removeAllPrices(partText)
      
      if (originalPartText.includes('Combination Platter') || originalPartText.includes('Lobster Newburg')) {
        console.log('After price removal:', JSON.stringify(partText))
        console.log('=== END STEP 9: PRICE REMOVAL ===')
      }
      
      // STEP 10: VALIDATION CHECK
      if (partText.includes('Combination Platter') || partText.includes('Lobster Newburg')) {
        console.log('=== STEP 10: VALIDATION CHECK ===')
        console.log('Part text after price removal:', JSON.stringify(partText))
        console.log('Part length:', partText.length)
        console.log('Is too short (< 2):', partText.length < 2)
        console.log('Is only prices/digits:', /^[\d\s\$€£¥\.\,\-\/]+$/.test(partText))
        console.log('=== END STEP 10: VALIDATION CHECK ===')
      }
      
      if (partText.length < 2 || /^[\d\s\$€£¥\.\,\-\/]+$/.test(partText)) {
        if (partText.includes('Combination Platter') || partText.includes('Lobster Newburg')) {
          console.log('❌ SKIPPING PART - too short or only prices/digits')
        }
        continue
      }

      // Additional filtering for restaurant names and headers
      if (isRestaurantNameOrHeader(partText, i, sectionHeaders, lines)) {
        if (partText.includes('Lobster') || partText.includes('Newburg') || 
            partText.includes('New York') || partText.includes('Goat Cheese') ||
            partText.includes('Combination Platter') || partText.includes('Potato Skins') ||
            partText.includes('Ribs') || partText.includes('Crab and Scallop Cake')) {
          console.log('=== FILTERED OUT DEBUG ===')
          console.log('Filtered out as restaurant name or header:', partText)
          console.log('=== END FILTERED OUT ===')
        }
        continue
      }

      // Extract features for this part
      const features = extractFeatures(partText, lines, i, sectionHeaders, ocrLines)
      
      // Debug logging for feature extraction
      if (partText.includes('Lobster') || partText.includes('Newburg') || 
          partText.includes('New York') || partText.includes('Goat Cheese') ||
          partText.includes('Combination Platter') || partText.includes('Potato Skins') ||
          partText.includes('Ribs') || partText.includes('Crab and Scallop Cake')) {
        console.log('=== FEATURE EXTRACTION DEBUG ===')
        console.log('Extracted features for:', partText)
        console.log('Features:', features)
        console.log('=== END FEATURE EXTRACTION ===')
      }
      
      // STEP 11: DATABASE LOOKUP AND CONFIDENCE CALCULATION
      if (partText.includes('Combination Platter') || partText.includes('Lobster Newburg')) {
        console.log('=== STEP 11: DATABASE LOOKUP AND CONFIDENCE CALCULATION ===')
        console.log('About to lookup in database:', JSON.stringify(partText))
      }
      
      const databaseMatch = await findEntreeMatch(partText)
      
      if (partText.includes('Combination Platter') || partText.includes('Lobster Newburg')) {
        console.log('Database lookup result:', databaseMatch ? `Found: ${databaseMatch.name}` : 'No match')
      }
      
      const confidence = calculateConfidenceScore(features, databaseMatch || undefined)
      
      if (partText.includes('Combination Platter') || partText.includes('Lobster Newburg')) {
        console.log('Confidence score:', confidence)
        console.log('=== END STEP 11: DATABASE LOOKUP AND CONFIDENCE CALCULATION ===')
      }
      
      // Debug logging for specific items
      if (partText.includes('Lobster Newburg') || partText.includes('New York Steak') || 
          partText.includes('Goat Cheese') || partText.includes('Potato Skins') ||
          partText.includes('Combination Platter') || partText.includes('Beef Ribs') ||
          partText.includes('Crab and Scallop Cake')) {
        console.log('=== CANDIDATE PROCESSING DEBUG ===')
        console.log('Processing candidate:', partText)
        console.log('Confidence score:', confidence)
        console.log('Is valid entree name:', isValidEntreeName(partText))
        console.log('Features:', features)
        console.log('Price same line:', features.priceSameLine)
        console.log('Price next lines:', features.priceNextLines1to3)
        console.log('Under entree header:', features.underEntreeHeader)
        console.log('Font size ratio:', features.fontSizeRatio)
        console.log('Is all caps:', features.isAllCaps)
        console.log('Is title case:', features.isTitleCase)
        console.log('=== END CANDIDATE PROCESSING ===')
      }
      
      // STEP 12: FINAL CANDIDATE CREATION
      if (partText.includes('Combination Platter') || partText.includes('Lobster Newburg')) {
        console.log('=== STEP 12: FINAL CANDIDATE CREATION ===')
        console.log('Part text:', JSON.stringify(partText))
        console.log('Confidence:', confidence)
        console.log('Is valid entree name:', isValidEntreeName(partText))
        console.log('Confidence threshold (0.03):', confidence > 0.03)
        console.log('Will create candidate:', confidence > 0.03 && isValidEntreeName(partText))
        console.log('=== END STEP 12: FINAL CANDIDATE CREATION ===')
      }
      
      if (confidence > 0.03 && isValidEntreeName(partText)) {
        const candidate: Candidate = {
          id: uuidv4(),
          page: pageNumber,
          text: partText,
          bbox: part.bbox,
          headerContext: getHeaderContext(i, sectionHeaders),
          priceContext: [], // Should be empty after price removal
          features,
          confidence,
          databaseMatch: databaseMatch || undefined
        }
        
        if (partText.includes('Combination Platter') || partText.includes('Lobster Newburg')) {
          console.log('✅ CREATED CANDIDATE:', JSON.stringify(partText))
        }
        
        candidates.push(candidate)
      } else {
        if (partText.includes('Combination Platter') || partText.includes('Lobster Newburg')) {
          console.log('❌ REJECTED CANDIDATE:', JSON.stringify(partText), 'Confidence:', confidence, 'Valid:', isValidEntreeName(partText))
        }
      }
    }
  }

  // Debug logging for final candidates
  console.log('=== FINAL CANDIDATES DEBUG ===')
  console.log('Total candidates found:', candidates.length)
  candidates.forEach((candidate, index) => {
    console.log(`Candidate ${index + 1}: "${candidate.text}" (confidence: ${candidate.confidence})`)
  })
  console.log('=== END FINAL CANDIDATES ===')
  
  // Sort by confidence and return top N
  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topN)
}

/**
 * Extract features for a candidate line
 */
function extractFeatures(
  text: string, 
  allLines: string[], 
  lineIndex: number, 
  sectionHeaders: any[],
  ocrLines?: OcrLine[] // Add OCR lines for font size calculation
): CandidateFeatures {
  const tokenCount = countMeaningfulWords(text)
  const hasDigits = /\d/.test(text)
  const hasCurrency = containsAnyPrice(text)
  const isAllCapsText = isAllCaps(text)
  const isTitleCaseText = isTitleCase(text)
  const priceSameLine = hasCurrency
  const priceNextLines1to3 = checkPriceInNextLines(allLines, lineIndex, 3)
  const underEntreeHeader = isUnderEntreeHeader(lineIndex, sectionHeaders)
  const punctDensity = calculatePunctuationDensity(text)
  const nextLineDescription = checkNextLineDescription(allLines, lineIndex)
  const prevLineHeader = checkPrevLineHeader(allLines, lineIndex, sectionHeaders)
  const uppercaseRatio = calculateUppercaseRatio(text)
  const lettersRatio = calculateLetterRatio(text)
  const avgTokenLen = calculateAverageTokenLength(text)
  const startsWithArticleText = startsWithArticle(text)
  const endsWithStop = endsWithStopWord(text)
  
  // Calculate font size ratio if OCR lines are available
  const fontSizeRatio = ocrLines && ocrLines[lineIndex] ? 
    calculateFontSizeRatio(ocrLines[lineIndex], ocrLines) : 1.0

  return {
    tokenCount,
    hasDigits: hasDigits ? 1 : 0,
    hasCurrency: hasCurrency ? 1 : 0,
    isAllCaps: isAllCapsText ? 1 : 0,
    isTitleCase: isTitleCaseText ? 1 : 0,
    priceSameLine: priceSameLine ? 1 : 0,
    priceNextLines1to3: priceNextLines1to3 ? 1 : 0,
    underEntreeHeader: underEntreeHeader ? 1 : 0,
    punctDensity,
    nextLineDescription: nextLineDescription ? 1 : 0,
    prevLineHeader: prevLineHeader ? 1 : 0,
    uppercaseRatio,
    lettersRatio,
    avgTokenLen,
    startsWithArticle: startsWithArticleText ? 1 : 0,
    endsWithStop: endsWithStop ? 1 : 0,
    fontSizeRatio,
    confidence: 0 // Will be calculated separately
  }
}

/**
 * Calculate confidence score based on features and database match
 */
function calculateConfidenceScore(features: CandidateFeatures, databaseMatch?: EntreeMatch): number {
  let score = 0.1 // Base score for any potential entree name

  // DATABASE MATCH - Most important factor
  if (databaseMatch) {
    score += databaseMatch.confidence_boost
    console.log(`Database match found: "${databaseMatch.name}" (${databaseMatch.match_type}) - boost: ${databaseMatch.confidence_boost}`)
  }

  // Try to use trained model weights if available
  const trainedWeights = getTrainedModelWeights()
  if (trainedWeights) {
    console.log('✅ Using trained model weights for confidence calculation')
    return calculateTrainedConfidenceScore(features, trainedWeights, databaseMatch)
  } else {
    console.log('⚠️ No trained model weights available, using heuristic scoring')
  }

  // Token count (2-6 tokens strongly positive)
  if (features.tokenCount >= 2 && features.tokenCount <= 6) {
    score += 0.3
  } else if (features.tokenCount === 1 || features.tokenCount > 8) {
    score -= 0.2
  }

  // Price proximity (reduced weight to be less restrictive)
  if (features.priceSameLine) {
    score += 0.2 // Reduced from 0.3 to 0.2
  }
  if (features.priceNextLines1to3) {
    score += 0.15 // Reduced from 0.2 to 0.15
  }

  // Section header context (strong positive)
  if (features.underEntreeHeader) {
    score += 0.25
  }

  // Typography hints (significantly enhanced weights)
  if (features.isTitleCase) {
    score += 0.2 // Increased from 0.15
  }
  if (features.isAllCaps) {
    score += 0.35 // Significantly increased from 0.25 for ALL CAPS
  }
  
  // Font size hints (significantly enhanced weights for visual hierarchy)
  if (features.fontSizeRatio > 1.5) {
    score += 0.35 // Very large font - strongest indicator
  } else if (features.fontSizeRatio > 1.3) {
    score += 0.3 // Significantly larger font - very strong indicator
  } else if (features.fontSizeRatio > 1.1) {
    score += 0.2 // Moderately larger font - strong indicator
  } else if (features.fontSizeRatio > 1.0) {
    score += 0.15 // Slightly larger font
  } else if (features.fontSizeRatio < 0.8) {
    score -= 0.15 // Smaller font (likely description)
  }

  // Negative signals (enhanced penalties)
  if (features.hasDigits) {
    score -= 0.3
  }
  if (features.hasCurrency) {
    score -= 0.2
  }
  if (features.punctDensity > 0.1) {
    score -= 0.15
  }

  // Description proximity (positive)
  if (features.nextLineDescription) {
    score += 0.1
  }

  // Character quality
  if (features.lettersRatio < 0.7) {
    score -= 0.2
  }

  // Normalize to 0-1 range
  return Math.max(0, Math.min(1, score))
}

/**
 * Check if there are prices in the next N lines
 */
function checkPriceInNextLines(allLines: string[], lineIndex: number, maxLines: number): boolean {
  for (let i = 1; i <= maxLines && lineIndex + i < allLines.length; i++) {
    const nextLine = allLines[lineIndex + i].trim()
    if (nextLine && containsAnyPrice(nextLine)) {
      return true
    }
  }
  return false
}

/**
 * Check if the next line looks like a description
 */
function checkNextLineDescription(allLines: string[], lineIndex: number): boolean {
  if (lineIndex + 1 >= allLines.length) return false
  
  const nextLine = allLines[lineIndex + 1].trim()
  if (!nextLine) return false

  // Description indicators: shorter line with punctuation and ingredients
  const hasPunctuation = /[,;:]/.test(nextLine)
  const isShorter = nextLine.length < allLines[lineIndex].length * 0.8
  const hasIngredients = /\b(and|with|served|topped|garnished|fresh|local|organic)\b/i.test(nextLine)

  return hasPunctuation && isShorter && hasIngredients
}

/**
 * Check if the previous line is a header
 */
function checkPrevLineHeader(_allLines: string[], lineIndex: number, sectionHeaders: any[]): boolean {
  if (lineIndex === 0) return false
  
  return sectionHeaders.some(header => header.lineIndex === lineIndex - 1)
}

/**
 * Get header context for a line
 */
function getHeaderContext(lineIndex: number, sectionHeaders: any[]): string | undefined {
  for (const header of sectionHeaders) {
    if (header.lineIndex < lineIndex && lineIndex - header.lineIndex <= 10) {
      return header.text
    }
  }
  return undefined
}

/**
 * Normalize candidate text for final storage - COMPREHENSIVE PRICE REMOVAL
 */
export function normalizeCandidateText(text: string): string {
  // Use the comprehensive price removal function
  return normalizeTextWithPriceRemoval(text)
}

/**
 * Validate final entree name
 */
export function validateEntreeName(text: string): boolean {
  const normalized = normalizeCandidateText(text)
  
  // Must have at least 2 words
  const words = normalized.split(/\s+/).filter(w => w.length > 0)
  if (words.length < 2) return false
  
  // Must be at least 4 characters
  if (normalized.length < 4) return false
  
  // Must contain at least 70% letters
  const letterCount = (normalized.match(/[a-zA-Z]/g) || []).length
  const letterRatio = letterCount / normalized.length
  if (letterRatio < 0.7) return false
  
  // CRITICAL: Must have no prices remaining
  if (!validateNoPrices(normalized)) {
    console.log('Validation failed - prices remain in text:', normalized)
    return false
  }
  
  return true
}

// Cache for trained model weights
let trainedWeightsCache: Record<string, number> | null = null
let weightsCacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

/**
 * Get trained model weights (with caching)
 */
function getTrainedModelWeights(): Record<string, number> | null {
  const now = Date.now()
  
  // Return cached weights if still valid
  if (trainedWeightsCache && (now - weightsCacheTimestamp) < CACHE_DURATION) {
    console.log('📦 Using cached trained model weights')
    return trainedWeightsCache
  }
  
  console.log('🔍 Attempting to load trained model weights...')
  
  // Load weights asynchronously (don't block the main thread)
  loadLatestTrainedModel().then(weights => {
    if (weights) {
      trainedWeightsCache = weights
      weightsCacheTimestamp = now
      console.log('✅ Loaded trained model weights into cache')
    } else {
      console.log('❌ No trained model weights found in database')
    }
  }).catch(error => {
    console.warn('❌ Failed to load trained model weights:', error)
  })
  
  // Return cached weights if available, otherwise null
  return trainedWeightsCache
}

/**
 * Calculate confidence score using trained model weights
 */
function calculateTrainedConfidenceScore(
  features: CandidateFeatures, 
  weights: Record<string, number>, 
  databaseMatch?: EntreeMatch
): number {
  let score = 0.1 // Base score
  
  // Apply database match boost
  if (databaseMatch) {
    score += databaseMatch.confidence_boost
  }
  
  // Apply trained feature weights
  Object.entries(weights).forEach(([key, weight]) => {
    const featureValue = features[key as keyof CandidateFeatures] || 0
    score += featureValue * weight
  })
  
  // Normalize to 0-1 range using sigmoid
  const normalizedScore = 1 / (1 + Math.exp(-score))
  
  // Ensure score is within reasonable bounds
  return Math.max(0, Math.min(1, normalizedScore))
}