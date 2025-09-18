import { TesseractOcrProvider } from './TesseractOcrProvider'
import type { OcrProvider, OcrResult, OcrLine, OcrWord, OcrBoundingBox } from './OcrProvider'

export { TesseractOcrProvider }
export type { OcrProvider, OcrResult, OcrLine, OcrWord, OcrBoundingBox }

// Factory function to create OCR provider based on configuration
export const createOcrProvider = (providerType: string = 'tesseract'): OcrProvider => {
  switch (providerType.toLowerCase()) {
    case 'tesseract':
      return new TesseractOcrProvider()
    default:
      throw new Error(`Unsupported OCR provider: ${providerType}`)
  }
}
