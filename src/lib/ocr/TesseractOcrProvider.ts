import { createWorker } from 'tesseract.js'
import type { OcrProvider, OcrResult, OcrLine, OcrWord } from './OcrProvider'

export class TesseractOcrProvider implements OcrProvider {
  private worker: Tesseract.Worker | null = null
  private isInitialized = false

  constructor() {
    this.initialize()
  }

  private async initialize() {
    try {
      // Create worker with English and French languages
      this.worker = await createWorker('eng+fra', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`)
          }
        }
      })
      
      this.isInitialized = true
      console.log('Tesseract OCR initialized with English + French support')
    } catch (error) {
      console.error('Failed to initialize Tesseract worker:', error)
      this.isInitialized = false
    }
  }

  getName(): string {
    return 'Tesseract.js'
  }

  isAvailable(): boolean {
    return this.isInitialized && this.worker !== null
  }

  async processImage(imageData: ImageData | HTMLCanvasElement | HTMLImageElement): Promise<OcrResult> {
    if (!this.worker || !this.isInitialized) {
      throw new Error('Tesseract worker not initialized')
    }

    const startTime = Date.now()
    console.log('Starting OCR processing...')

    try {
      console.log('Calling Tesseract recognize...')
      const { data } = await this.worker.recognize(imageData)
      const processingTime = Date.now() - startTime
      
      console.log(`OCR completed in ${processingTime}ms`)
      console.log(`OCR confidence: ${data.confidence}%`)
      console.log(`Found ${data.words?.length || 0} words, ${data.lines?.length || 0} lines`)

      // Convert Tesseract result to our format
      const lines: OcrLine[] = []
      const words: OcrWord[] = []

      // Process words first
      if (data.words) {
        for (const word of data.words) {
          if (word.text.trim() && word.confidence > 0) {
            const ocrWord: OcrWord = {
              text: word.text,
              bbox: {
                x: word.bbox.x0,
                y: word.bbox.y0,
                w: word.bbox.x1 - word.bbox.x0,
                h: word.bbox.y1 - word.bbox.y0
              },
              confidence: word.confidence / 100 // Convert to 0-1 scale
            }
            words.push(ocrWord)
          }
        }
      }

      // Group words into lines
      const lineMap = new Map<string, OcrWord[]>()
      
      for (const word of words) {
        // Group words by approximate y-coordinate (same line)
        const lineKey = Math.round(word.bbox.y / 10) * 10 // Round to nearest 10px
        if (!lineMap.has(lineKey.toString())) {
          lineMap.set(lineKey.toString(), [])
        }
        lineMap.get(lineKey.toString())!.push(word)
      }

      // Create lines from grouped words
      for (const [_, lineWords] of lineMap) {
        if (lineWords.length === 0) continue

        // Sort words by x-coordinate
        lineWords.sort((a, b) => a.bbox.x - b.bbox.x)

        // Calculate line bounding box
        const minX = Math.min(...lineWords.map(w => w.bbox.x))
        const minY = Math.min(...lineWords.map(w => w.bbox.y))
        const maxX = Math.max(...lineWords.map(w => w.bbox.x + w.bbox.w))
        const maxY = Math.max(...lineWords.map(w => w.bbox.y + w.bbox.h))

        const lineText = lineWords.map(w => w.text).join(' ')
        const avgConfidence = lineWords.reduce((sum, w) => sum + w.confidence, 0) / lineWords.length

        const ocrLine: OcrLine = {
          text: lineText,
          bbox: {
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY
          },
          words: lineWords,
          confidence: avgConfidence
        }

        lines.push(ocrLine)
      }

      // Sort lines by y-coordinate (top to bottom)
      lines.sort((a, b) => a.bbox.y - b.bbox.y)

      return {
        lines,
        words,
        confidence: data.confidence / 100, // Convert to 0-1 scale
        processingTime
      }
    } catch (error) {
      console.error('OCR processing failed:', error)
      throw new Error(`OCR processing failed: ${error}`)
    }
  }

  async destroy() {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
      this.isInitialized = false
    }
  }
}