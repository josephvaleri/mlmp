import { describe, it, expect } from 'vitest'
import { 
  featuresToVector, 
  createCharacterEmbeddings, 
  createWordEmbeddings,
  createCombinedFeatureVector,
  getFeatureVectorDimensions,
  COMMON_VOCABULARY 
} from '../../src/lib/ml/features'
import type { CandidateFeatures } from '../../src/lib/candidates/extractCandidates'

describe('ML Features', () => {
  const mockFeatures: CandidateFeatures = {
    tokenCount: 3,
    hasDigits: 0,
    hasCurrency: 0,
    isAllCaps: 0,
    isTitleCase: 1,
    priceSameLine: 0,
    priceNextLines1to3: 1,
    underEntreeHeader: 1,
    punctDensity: 0.1,
    nextLineDescription: 0,
    prevLineHeader: 0,
    uppercaseRatio: 0.2,
    lettersRatio: 0.9,
    avgTokenLen: 6.5,
    startsWithArticle: 0,
    endsWithStop: 0,
    confidence: 0.8
  }

  describe('featuresToVector', () => {
    it('should convert features to normalized vector', () => {
      const vector = featuresToVector(mockFeatures)
      
      expect(vector).toHaveLength(14)
      expect(vector[0]).toBeCloseTo(0.4) // normalized token count (3-1)/5
      expect(vector[1]).toBe(0) // hasDigits
      expect(vector[2]).toBe(0) // hasCurrency
      expect(vector[3]).toBe(0) // isAllCaps
      expect(vector[4]).toBe(1) // isTitleCase
      expect(vector[5]).toBe(0) // priceSameLine
      expect(vector[6]).toBe(1) // priceNextLines1to3
      expect(vector[7]).toBe(1) // underEntreeHeader
      expect(vector[8]).toBe(0) // nextLineDescription
      expect(vector[9]).toBe(0) // prevLineHeader
      expect(vector[10]).toBe(0) // startsWithArticle
      expect(vector[11]).toBe(0) // endsWithStop
      expect(vector[12]).toBe(0.1) // punctDensity
      expect(vector[13]).toBeCloseTo(0.65) // normalized avgTokenLen
    })
  })

  describe('createCharacterEmbeddings', () => {
    it('should create character embeddings', () => {
      const embeddings = createCharacterEmbeddings('Chicken', 10)
      
      expect(embeddings).toHaveLength(10)
      expect(embeddings[0]).toBeCloseTo(99 / 128) // 'C' char code / 128
      expect(embeddings[1]).toBeCloseTo(104 / 128) // 'h' char code / 128
      expect(embeddings[7]).toBeCloseTo(32 / 128) // space char code / 128
    })

    it('should handle text longer than max length', () => {
      const embeddings = createCharacterEmbeddings('Very Long Text That Exceeds Max Length', 5)
      
      expect(embeddings).toHaveLength(5)
      expect(embeddings[0]).toBeCloseTo(86 / 128) // 'V' char code / 128
    })
  })

  describe('createWordEmbeddings', () => {
    it('should create word embeddings', () => {
      const embeddings = createWordEmbeddings('chicken pasta', COMMON_VOCABULARY)
      
      expect(embeddings).toHaveLength(COMMON_VOCABULARY.length)
      
      const chickenIndex = COMMON_VOCABULARY.indexOf('chicken')
      const pastaIndex = COMMON_VOCABULARY.indexOf('pasta')
      
      expect(embeddings[chickenIndex]).toBeCloseTo(0.5) // 1/2 words
      expect(embeddings[pastaIndex]).toBeCloseTo(0.5) // 1/2 words
    })

    it('should handle empty text', () => {
      const embeddings = createWordEmbeddings('', COMMON_VOCABULARY)
      
      expect(embeddings).toHaveLength(COMMON_VOCABULARY.length)
      expect(embeddings.every(val => val === 0)).toBe(true)
    })
  })

  describe('createCombinedFeatureVector', () => {
    it('should create combined feature vector', () => {
      const vector = createCombinedFeatureVector(mockFeatures, 'Chicken Parmigiana')
      
      const expectedLength = 14 + 50 + COMMON_VOCABULARY.length
      expect(vector).toHaveLength(expectedLength)
      
      // First 14 elements should be feature vector
      const featureVector = featuresToVector(mockFeatures)
      expect(vector.slice(0, 14)).toEqual(featureVector)
      
      // Next 50 elements should be character embeddings
      const charEmbeddings = createCharacterEmbeddings('Chicken Parmigiana')
      expect(vector.slice(14, 64)).toEqual(charEmbeddings)
      
      // Remaining elements should be word embeddings
      const wordEmbeddings = createWordEmbeddings('Chicken Parmigiana', COMMON_VOCABULARY)
      expect(vector.slice(64)).toEqual(wordEmbeddings)
    })
  })

  describe('getFeatureVectorDimensions', () => {
    it('should return correct dimensions', () => {
      const dimensions = getFeatureVectorDimensions()
      const expectedDimensions = 14 + 50 + COMMON_VOCABULARY.length
      
      expect(dimensions).toBe(expectedDimensions)
    })
  })
})
