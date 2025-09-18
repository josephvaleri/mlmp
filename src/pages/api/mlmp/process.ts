import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '../../../lib/supabase'
import { createOcrProvider } from '../../../lib/ocr'
import { pdfToImages } from '../../../lib/pdf/pdfToImages'
import { extractCandidates } from '../../../lib/candidates'
import { loadLatestModel } from '../../../lib/ml'

export async function POST(request: NextRequest) {
  try {
    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPG, PNG, and PDF files are supported.' },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    // Save menu upload record
    const { data: menuData, error: menuError } = await serviceClient
      .from('mlmp_menu_uploads')
      .insert({
        file_name: file.name,
        file_type: file.type,
        page_count: 1 // Will be updated after processing
      })
      .select()
      .single()

    if (menuError) {
      throw new Error(`Failed to save menu record: ${menuError.message}`)
    }

    // Initialize OCR provider
    const ocrProvider = createOcrProvider('tesseract')
    if (!ocrProvider.isAvailable()) {
      throw new Error('OCR provider not available')
    }

    // Process the file
    let ocrResults: any[] = []
    let pageCount = 1

    if (file.type === 'application/pdf') {
      // Process PDF
      const pdfResult = await pdfToImages(file)
      pageCount = pdfResult.totalPages
      ocrResults = []
      
      for (const page of pdfResult.pages) {
        const result = await ocrProvider.processImage(page.imageData)
        ocrResults.push(result)
      }
    } else {
      // Process image
      const arrayBuffer = await file.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: file.type })
      const imageUrl = URL.createObjectURL(blob)
      
      const image = new Image()
      image.src = imageUrl
      
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
      })

      const result = await ocrProvider.processImage(image)
      ocrResults = [result]
      
      URL.revokeObjectURL(imageUrl)
    }

    // Update page count
    await serviceClient
      .from('mlmp_menu_uploads')
      .update({ page_count: pageCount })
      .eq('menu_id', menuData.menu_id)

    // Extract candidates and save to database
    const allCandidates: any[] = []
    const allLines: any[] = []

    for (let pageIndex = 0; pageIndex < ocrResults.length; pageIndex++) {
      const ocrResult = ocrResults[pageIndex]
      
      // Save extracted lines to database
      for (const line of ocrResult.lines) {
        const { data: lineData, error: lineError } = await serviceClient
          .from('mlmp_extracted_lines')
          .insert({
            menu_id: menuData.menu_id,
            page: pageIndex + 1,
            text: line.text,
            bbox: line.bbox,
            raw: { confidence: line.confidence, words: line.words }
          })
          .select()
          .single()

        if (lineError) {
          console.error('Failed to save extracted line:', lineError)
          continue
        }

        allLines.push(lineData)
      }

      // Extract candidates
      const pageCandidates = extractCandidates(ocrResult.lines, pageIndex + 1)
      allCandidates.push(...(await pageCandidates))
    }

    // Apply ML model if available
    try {
      const mlModel = await loadLatestModel()
      const predictions = await mlModel?.batchPredict(
        allCandidates.map(c => ({ features: c.features, text: c.text }))
      )

      // Update candidates with ML confidence
      if (predictions) {
        allCandidates.forEach((candidate, index) => {
          candidate.confidence = predictions[index]
        })
      }

      // Sort by ML confidence
      allCandidates.sort((a, b) => b.confidence - a.confidence)
    } catch (mlError) {
      console.warn('ML model not available, using heuristic confidence:', mlError)
    }

    // Save predictions to database
    for (const candidate of allCandidates) {
      const lineId = allLines.find(line => 
        line.text === candidate.text && line.page === candidate.page
      )?.line_id

      if (lineId) {
        await serviceClient
          .from('mlmp_predictions')
          .insert({
            line_id: lineId,
            model_version: 'heuristic', // TODO: Use actual model version
            features: candidate.features,
            confidence: candidate.confidence
          })
      }
    }

    // Return response
    const response = {
      menu_id: menuData.menu_id,
      candidates: allCandidates.map(candidate => ({
        id: candidate.id,
        text: candidate.text,
        confidence: candidate.confidence,
        page: candidate.page
      }))
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
