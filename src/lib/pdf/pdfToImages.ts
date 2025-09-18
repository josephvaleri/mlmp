import * as pdfjsLib from 'pdfjs-dist'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export interface PdfPageImage {
  pageNumber: number
  canvas: HTMLCanvasElement
  imageData: ImageData
  width: number
  height: number
}

export interface PdfProcessingResult {
  pages: PdfPageImage[]
  totalPages: number
  processingTime: number
}

/**
 * Convert PDF file to array of canvas images for OCR processing
 */
export async function pdfToImages(pdfFile: File): Promise<PdfProcessingResult> {
  const startTime = Date.now()

  try {
    // Convert file to ArrayBuffer
    const arrayBuffer = await pdfFile.arrayBuffer()
    
    // Load PDF document
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const totalPages = pdf.numPages

    const pages: PdfPageImage[] = []

    // Process each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2.0 }) // Higher scale for better OCR

      // Create canvas
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      
      if (!context) {
        throw new Error('Failed to get canvas context')
      }

      canvas.width = viewport.width
      canvas.height = viewport.height

      // Render page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      }

      await page.render(renderContext).promise

      // Get image data
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

      pages.push({
        pageNumber: pageNum,
        canvas,
        imageData,
        width: canvas.width,
        height: canvas.height
      })
    }

    const processingTime = Date.now() - startTime

    return {
      pages,
      totalPages,
      processingTime
    }
  } catch (error) {
    console.error('PDF processing failed:', error)
    throw new Error(`PDF processing failed: ${error}`)
  }
}

/**
 * Convert PDF file to individual page images as blobs
 */
export async function pdfToImageBlobs(pdfFile: File): Promise<Blob[]> {
  const result = await pdfToImages(pdfFile)
  
  return result.pages.map(page => {
    return new Promise<Blob>((resolve) => {
      page.canvas.toBlob((blob) => {
        resolve(blob!)
      }, 'image/png')
    })
  }).reduce(async (acc, promise) => {
    const blobs = await acc
    const blob = await promise
    return [...blobs, blob]
  }, Promise.resolve([] as Blob[]))
}

/**
 * Get PDF page count without processing all pages
 */
export async function getPdfPageCount(pdfFile: File): Promise<number> {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    return pdf.numPages
  } catch (error) {
    console.error('Failed to get PDF page count:', error)
    throw new Error(`Failed to get PDF page count: ${error}`)
  }
}
