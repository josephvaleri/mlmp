import type { CandidateFeatures } from '../candidates/extractCandidates'

/**
 * Convert candidate features to a normalized feature vector for ML model
 */
export function featuresToVector(features: CandidateFeatures): number[] {
  return [
    // Normalize token count (0-1 scale, optimal range 2-6)
    Math.min(1, Math.max(0, (features.tokenCount - 1) / 5)),
    
    // Binary features (already 0 or 1)
    features.hasDigits,
    features.hasCurrency,
    features.isAllCaps,
    features.isTitleCase,
    features.priceSameLine,
    features.priceNextLines1to3,
    features.underEntreeHeader,
    features.nextLineDescription,
    features.prevLineHeader,
    features.startsWithArticle,
    features.endsWithStop,
    
    // Continuous features (already normalized)
    features.punctDensity,
    features.uppercaseRatio,
    features.lettersRatio,
    features.avgTokenLen / 10, // Normalize average token length
  ]
}

/**
 * Create character-level embeddings for text
 */
export function createCharacterEmbeddings(text: string, maxLength: number = 50): number[] {
  const embeddings: number[] = []
  const normalizedText = text.toLowerCase().padEnd(maxLength, ' ')
  
  for (let i = 0; i < maxLength; i++) {
    const char = normalizedText[i] || ' '
    const charCode = char.charCodeAt(0)
    
    // Normalize character code to 0-1 range
    embeddings.push(charCode / 128)
  }
  
  return embeddings
}

/**
 * Create word-level embeddings (simple bag of words)
 */
export function createWordEmbeddings(text: string, vocabulary: string[]): number[] {
  const words = text.toLowerCase().split(/\s+/)
  const embeddings = new Array(vocabulary.length).fill(0)
  
  for (const word of words) {
    const index = vocabulary.indexOf(word)
    if (index !== -1) {
      embeddings[index] += 1
    }
  }
  
  // Normalize by word count
  const wordCount = words.length
  if (wordCount > 0) {
    for (let i = 0; i < embeddings.length; i++) {
      embeddings[i] /= wordCount
    }
  }
  
  return embeddings
}

/**
 * Common vocabulary for word embeddings
 */
export const COMMON_VOCABULARY = [
  'chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'lobster', 'crab',
  'pasta', 'pizza', 'risotto', 'soup', 'salad', 'sandwich', 'burger',
  'grilled', 'roasted', 'fried', 'baked', 'steamed', 'braised',
  'with', 'and', 'served', 'topped', 'garnished', 'fresh', 'local',
  'organic', 'seasonal', 'special', 'house', 'chef', 'signature',
  'sauce', 'butter', 'cream', 'cheese', 'herbs', 'spices', 'garlic',
  'onion', 'tomato', 'mushroom', 'spinach', 'basil', 'oregano'
]

/**
 * Create combined feature vector (features + character embeddings + word embeddings)
 */
export function createCombinedFeatureVector(
  features: CandidateFeatures, 
  text: string
): number[] {
  const featureVector = featuresToVector(features)
  const charEmbeddings = createCharacterEmbeddings(text)
  const wordEmbeddings = createWordEmbeddings(text, COMMON_VOCABULARY)
  
  return [...featureVector, ...charEmbeddings, ...wordEmbeddings]
}

/**
 * Get feature vector dimensions
 */
export function getFeatureVectorDimensions(): number {
  return 14 + 50 + COMMON_VOCABULARY.length // features + char embeddings + word embeddings
}
