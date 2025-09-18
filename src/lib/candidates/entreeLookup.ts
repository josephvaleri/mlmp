import { createServiceClient } from '../supabase'

export interface EntreeMatch {
  id: string
  name: string
  normalized_name: string
  category?: string
  popularity_score?: number
  confidence_boost: number
  match_type: 'exact' | 'partial' | 'fuzzy'
}

/**
 * Find entree match in the common_entrees database table
 */
export async function findEntreeMatch(text: string): Promise<EntreeMatch | null> {
  try {
    console.log(`🔍 Looking up entree in database: "${text}"`)
    
    // Try to use service client first, fall back to regular client
    let supabase
    try {
      supabase = createServiceClient()
      console.log(`🔌 Using service client for database lookup`)
    } catch (serviceError) {
      console.log(`⚠️ Service client not available, using regular client`)
      // Import the regular supabase client
      const { supabase: regularSupabase } = await import('../supabase')
      supabase = regularSupabase
    }
    
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, '').trim()
    console.log(`📝 Normalized text: "${normalized}"`)
    
    // Test database connection first
    console.log(`🔌 Testing database connection...`)
    const { data: testData, error: testError } = await supabase
      .from('common_entrees')
      .select('count')
      .limit(1)
    
    if (testError) {
      console.error(`❌ Database connection error:`, testError)
      return null
    }
    console.log(`✅ Database connection successful`)
    
    // 1. Exact match (case-insensitive, punctuation-agnostic)
    const { data: exactMatch, error: exactError } = await supabase
      .from('common_entrees')
      .select('*')
      .ilike('entree_name', normalized)
      .limit(1)
      .single()

    if (!exactError && exactMatch) {
      console.log(`✅ Exact match found: "${exactMatch.entree_name}"`)
      return {
        id: exactMatch.id,
        name: exactMatch.entree_name,
        normalized_name: exactMatch.entree_name,
        category: exactMatch.category,
        popularity_score: exactMatch.popularity_score,
        confidence_boost: 0.95, // Very high confidence for exact match
        match_type: 'exact'
      }
    } else {
      console.log(`❌ No exact match found. Error: ${exactError?.message || 'No data'}`)
    }

    // 2. Partial match (text contains the entree name, synonyms, or vice versa)
    const { data: partialMatches, error: partialError } = await supabase
      .from('common_entrees')
      .select('*')
      .or(`entree_name.ilike.%${normalized}%,${normalized}.ilike.%entree_name%,synonyms.ilike.%${normalized}%,${normalized}.ilike.%synonyms%`)
      .limit(5)

    if (!partialError && partialMatches && partialMatches.length > 0) {
      // Find the best partial match
      const bestMatch = partialMatches.reduce((best, current) => {
        const currentScore = calculatePartialMatchScore(normalized, current.entree_name)
        const bestScore = calculatePartialMatchScore(normalized, best.entree_name)
        return currentScore > bestScore ? current : best
      })

      const matchScore = calculatePartialMatchScore(normalized, bestMatch.entree_name)
      if (matchScore > 0.7) { // Only accept good partial matches
        console.log(`☑️ Partial match found: "${bestMatch.entree_name}"`)
        return {
          id: bestMatch.id,
          name: bestMatch.entree_name,
          normalized_name: bestMatch.entree_name,
          category: bestMatch.category,
          popularity_score: bestMatch.popularity_score,
          confidence_boost: 0.8, // High confidence for good partial match
          match_type: 'partial'
        }
      }
    }

    // 3. Fuzzy match using word similarity
    const words = normalized.split(/\s+/).filter(w => w.length > 2)
    if (words.length > 0) {
      const { data: fuzzyMatches, error: fuzzyError } = await supabase
        .from('common_entrees')
        .select('*')
        .limit(20) // Get more candidates for fuzzy matching

      if (!fuzzyError && fuzzyMatches && fuzzyMatches.length > 0) {
        const bestFuzzyMatch = fuzzyMatches.reduce((best, current) => {
          const currentScore = calculateFuzzyMatchScore(normalized, current.entree_name)
          const bestScore = calculateFuzzyMatchScore(normalized, best.entree_name)
          return currentScore > bestScore ? current : best
        })

        const fuzzyScore = calculateFuzzyMatchScore(normalized, bestFuzzyMatch.entree_name)
        if (fuzzyScore > 0.6) { // Accept reasonable fuzzy matches
          console.log(`🔍 Fuzzy match found: "${bestFuzzyMatch.entree_name}"`)
          return {
            id: bestFuzzyMatch.id,
            name: bestFuzzyMatch.entree_name,
            normalized_name: bestFuzzyMatch.entree_name,
            category: bestFuzzyMatch.category,
            popularity_score: bestFuzzyMatch.popularity_score,
            confidence_boost: 0.7, // Good confidence for fuzzy match
            match_type: 'fuzzy'
          }
        }
      }
    }

    console.log(`❌ No match found for: "${text}"`)
    return null
  } catch (error) {
    console.error('❌ Error looking up entree in database:', error)
    console.error('Error details:', error.message)
    return null
  }
}

/**
 * Calculate partial match score between two strings
 */
function calculatePartialMatchScore(text1: string, text2: string): number {
  const longer = text1.length > text2.length ? text1 : text2
  const shorter = text1.length > text2.length ? text2 : text1
  
  if (longer.length === 0) return 1.0
  
  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

/**
 * Calculate fuzzy match score using word overlap and similarity
 */
function calculateFuzzyMatchScore(text1: string, text2: string): number {
  if (!text1 || !text2) return 0
  const words1 = text1.split(/\s+/).filter(w => w.length > 2)
  const words2 = text2.split(/\s+/).filter(w => w.length > 2)
  
  if (words1.length === 0 || words2.length === 0) return 0
  
  let totalScore = 0
  let matchCount = 0
  
  for (const word1 of words1) {
    let bestMatch = 0
    for (const word2 of words2) {
      const similarity = calculateWordSimilarity(word1, word2)
      bestMatch = Math.max(bestMatch, similarity)
    }
    totalScore += bestMatch
    if (bestMatch > 0.7) matchCount++
  }
  
  // Weight by both average similarity and number of matching words
  const avgSimilarity = totalScore / words1.length
  const matchRatio = matchCount / words1.length
  
  return (avgSimilarity * 0.7) + (matchRatio * 0.3)
}

/**
 * Calculate similarity between two words
 */
function calculateWordSimilarity(word1: string, word2: string): number {
  const distance = levenshteinDistance(word1, word2)
  const maxLength = Math.max(word1.length, word2.length)
  return maxLength === 0 ? 1.0 : (maxLength - distance) / maxLength
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

/**
 * Batch lookup multiple entree names for efficiency
 */
export async function findEntreeMatches(texts: string[]): Promise<Map<string, EntreeMatch | null>> {
  const results = new Map<string, EntreeMatch | null>()
  
  // Process in batches to avoid overwhelming the database
  const batchSize = 10
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchPromises = batch.map(text => findEntreeMatch(text))
    const batchResults = await Promise.all(batchPromises)
    
    batch.forEach((text, index) => {
      results.set(text, batchResults[index])
    })
  }
  
  return results
}
