import { describe, it, expect } from 'vitest'
import { 
  containsPrice, 
  extractPrices, 
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
  calculateAverageTokenLength
} from '../../src/lib/candidates/regex'

describe('Candidate Detection Regex Functions', () => {
  describe('Price Detection', () => {
    it('should detect various price formats', () => {
      expect(containsPrice('Chicken Parmigiana $18.50')).toBe(true)
      expect(containsPrice('Pasta €12,50')).toBe(true)
      expect(containsPrice('Steak £25.00')).toBe(true)
      expect(containsPrice('Sushi ¥1500')).toBe(true)
      expect(containsPrice('Salad 12.99')).toBe(true)
      expect(containsPrice('Just a dish name')).toBe(false)
    })

    it('should extract prices correctly', () => {
      expect(extractPrices('Chicken $18.50 and Pasta €12,50')).toEqual(['$18.50', '€12,50'])
      expect(extractPrices('No prices here')).toEqual([])
    })
  })

  describe('Section Header Detection', () => {
    it('should identify section headers', () => {
      expect(isSectionHeader('Entrees')).toBe(true)
      expect(isSectionHeader('MAIN COURSES')).toBe(true)
      expect(isSectionHeader('Secondi Piatti')).toBe(true)
      expect(isSectionHeader('Plats Principaux')).toBe(true)
      expect(isSectionHeader('Chicken Parmigiana')).toBe(false)
    })
  })

  describe('Blacklist Detection', () => {
    it('should identify blacklisted terms', () => {
      expect(containsBlacklistedTerms('Gluten Free')).toBe(true)
      expect(containsBlacklistedTerms('Contains nuts')).toBe(true)
      expect(containsBlacklistedTerms('Daily special')).toBe(true)
      expect(containsBlacklistedTerms('Chicken Parmigiana')).toBe(false)
    })
  })

  describe('Text Analysis', () => {
    it('should count meaningful words correctly', () => {
      expect(countMeaningfulWords('Chicken Parmigiana')).toBe(2)
      expect(countMeaningfulWords('The Chicken and Pasta')).toBe(2) // excludes 'the' and 'and'
      expect(countMeaningfulWords('A Very Good Dish')).toBe(3) // excludes 'a'
    })

    it('should calculate punctuation density', () => {
      expect(calculatePunctuationDensity('Chicken, pasta; and salad:')).toBe(3 / 30)
      expect(calculatePunctuationDensity('Simple dish')).toBe(0)
    })

    it('should detect text case', () => {
      expect(isAllCaps('CHICKEN PARMIGIANA')).toBe(true)
      expect(isAllCaps('Chicken Parmigiana')).toBe(false)
      expect(isTitleCase('Chicken Parmigiana')).toBe(true)
      expect(isTitleCase('chicken parmigiana')).toBe(false)
    })

    it('should calculate ratios correctly', () => {
      expect(calculateLetterRatio('Chicken123')).toBe(7 / 10)
      expect(calculateUppercaseRatio('Chicken')).toBe(1 / 7)
      expect(calculateUppercaseRatio('CHICKEN')).toBe(7 / 7)
    })

    it('should detect articles and stop words', () => {
      expect(startsWithArticle('The Chicken')).toBe(true)
      expect(startsWithArticle('A Pasta Dish')).toBe(true)
      expect(startsWithArticle('Chicken Parmigiana')).toBe(false)
      expect(endsWithStopWord('Chicken and')).toBe(true)
      expect(endsWithStopWord('Chicken Parmigiana')).toBe(false)
    })

    it('should calculate average token length', () => {
      expect(calculateAverageTokenLength('Chicken Parmigiana')).toBe(8.5)
      expect(calculateAverageTokenLength('A')).toBe(1)
    })
  })
})
