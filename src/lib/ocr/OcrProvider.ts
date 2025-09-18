export interface OcrBoundingBox {
  x: number
  y: number
  w: number
  h: number
}

export interface OcrWord {
  text: string
  bbox: OcrBoundingBox
  confidence: number
}

export interface OcrLine {
  text: string
  bbox: OcrBoundingBox
  words: OcrWord[]
  confidence: number
}

export interface OcrResult {
  lines: OcrLine[]
  words: OcrWord[]
  confidence: number
  processingTime: number
}

export interface OcrProvider {
  /**
   * Process an image and extract text with bounding boxes
   */
  processImage(imageData: ImageData | HTMLCanvasElement | HTMLImageElement): Promise<OcrResult>
  
  /**
   * Get provider name for logging/debugging
   */
  getName(): string
  
  /**
   * Check if provider is available/initialized
   */
  isAvailable(): boolean
}
