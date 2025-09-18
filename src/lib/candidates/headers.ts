import { SECTION_HEADERS } from './regex'

export interface SectionHeader {
  text: string
  confidence: number
  lineIndex: number
}

/**
 * Detect section headers in OCR lines using similarity matching
 */
export function detectSectionHeaders(lines: string[]): SectionHeader[] {
  const headers: SectionHeader[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const confidence = calculateHeaderConfidence(line)
    if (confidence > 0.5) {
      headers.push({
        text: line,
        confidence,
        lineIndex: i
      })
    }
  }

  return headers
}

/**
 * Calculate confidence that a line is a section header
 */
function calculateHeaderConfidence(line: string): number {
  const normalizedLine = normalizeText(line)
  let maxSimilarity = 0

  for (const header of SECTION_HEADERS) {
    const similarity = calculateSimilarity(normalizedLine, header)
    maxSimilarity = Math.max(maxSimilarity, similarity)
  }

  // Additional criteria for section headers:
  // 1. Should not contain prices
  // 2. Should be relatively short (1-4 words)
  // 3. Should not contain common food words that indicate actual menu items
  
  const hasPrice = /[$€£¥]\s?\d|^\d+[.,]\d{2}$/.test(line)
  const wordCount = normalizedLine.split(/\s+/).filter(w => w.length > 0).length
  const isShort = wordCount <= 4
  
  // Common food words that suggest it's an actual menu item, not a header
  const foodWords = ['chicken', 'beef', 'pork', 'fish', 'salmon', 'pasta', 'pizza', 'soup', 'salad', 'bread', 'rice', 'noodles']
  const containsFoodWords = foodWords.some(word => normalizedLine.includes(word))
  
  // Penalize if it has prices, is too long, or contains food words
  let penalty = 0
  if (hasPrice) penalty += 0.5
  if (!isShort) penalty += 0.3
  if (containsFoodWords) penalty += 0.4
  
  return Math.max(0, maxSimilarity - penalty)
}

/**
 * Normalize text for comparison (lowercase, remove accents, etc.)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
}

/**
 * Calculate cosine similarity between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(/\s+/).filter(w => w.length > 0)
  const words2 = str2.split(/\s+/).filter(w => w.length > 0)

  if (words1.length === 0 || words2.length === 0) return 0

  // Create word frequency vectors
  const vector1 = createWordVector(words1)
  const vector2 = createWordVector(words2)

  // Calculate cosine similarity
  const dotProduct = calculateDotProduct(vector1, vector2)
  const magnitude1 = calculateMagnitude(vector1)
  const magnitude2 = calculateMagnitude(vector2)

  if (magnitude1 === 0 || magnitude2 === 0) return 0

  return dotProduct / (magnitude1 * magnitude2)
}

/**
 * Create word frequency vector
 */
function createWordVector(words: string[]): Record<string, number> {
  const vector: Record<string, number> = {}
  for (const word of words) {
    vector[word] = (vector[word] || 0) + 1
  }
  return vector
}

/**
 * Calculate dot product of two vectors
 */
function calculateDotProduct(vector1: Record<string, number>, vector2: Record<string, number>): number {
  let dotProduct = 0
  const allKeys = new Set([...Object.keys(vector1), ...Object.keys(vector2)])
  
  for (const key of allKeys) {
    dotProduct += (vector1[key] || 0) * (vector2[key] || 0)
  }
  
  return dotProduct
}

/**
 * Calculate magnitude of a vector
 */
function calculateMagnitude(vector: Record<string, number>): number {
  let sum = 0
  for (const value of Object.values(vector)) {
    sum += value * value
  }
  return Math.sqrt(sum)
}

/**
 * Find the nearest section header above a given line index
 */
export function findNearestHeaderAbove(lineIndex: number, headers: SectionHeader[], maxDistance: number = 10): SectionHeader | null {
  let nearestHeader: SectionHeader | null = null
  let minDistance = Infinity

  for (const header of headers) {
    if (header.lineIndex < lineIndex) {
      const distance = lineIndex - header.lineIndex
      if (distance <= maxDistance && distance < minDistance) {
        minDistance = distance
        nearestHeader = header
      }
    }
  }

  return nearestHeader
}

/**
 * Check if a line is under an entree section header
 */
export function isUnderEntreeHeader(lineIndex: number, headers: SectionHeader[]): boolean {
  const nearestHeader = findNearestHeaderAbove(lineIndex, headers)
  if (!nearestHeader) return false

  // Check if the header is an entree-related section
  const entreeKeywords = ['entree', 'entrées', 'mains', 'main courses', 'secondi', 'piatti principali', 'plats principaux', 'platos principales']
  const headerText = nearestHeader.text.toLowerCase()
  
  return entreeKeywords.some(keyword => headerText.includes(keyword))
}
