// Quick test script to verify candidate extraction improvements
import { extractCandidates } from './src/lib/candidates/extractCandidates.js'

// Mock OCR data for testing
const mockOcrLines = [
  {
    text: "SAUTEED MAINE SEA SCALLOP $24",
    bbox: { x: 0, y: 0, w: 300, h: 20 },
    confidence: 0.9
  },
  {
    text: "Lamb Loin En Persillade $28",
    bbox: { x: 0, y: 25, w: 300, h: 20 },
    confidence: 0.9
  },
  {
    text: "Japanese Style Fried Chicken $16",
    bbox: { x: 0, y: 50, w: 300, h: 20 },
    confidence: 0.9
  },
  {
    text: "Roaster Chesapeake Oysters $22",
    bbox: { x: 0, y: 75, w: 300, h: 20 },
    confidence: 0.9
  }
]

console.log('Testing candidate extraction...')
const candidates = extractCandidates(mockOcrLines, 1, 10)

console.log('\nExtracted candidates:')
candidates.forEach((candidate, index) => {
  console.log(`${index + 1}. "${candidate.text}" (confidence: ${candidate.confidence.toFixed(2)})`)
})

console.log('\nTest completed!')
