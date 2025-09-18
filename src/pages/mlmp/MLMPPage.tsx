import React, { useState, useCallback, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { createOcrProvider } from '../../lib/ocr'
import { pdfToImages } from '../../lib/pdf/pdfToImages'
import { extractCandidates, normalizeCandidateText, validateEntreeName } from '../../lib/candidates'
import { FRENCH_DESCRIPTIVE_WORDS } from '../../lib/candidates/regex'
import { loadLatestModel } from '../../lib/ml'
import { saveUserFeedback, saveCandidatePredictions, triggerRetrainingIfNeeded, getLearningStats } from '../../lib/learning/feedback'
import type { OcrResult } from '../../lib/ocr/OcrProvider'
import type { Candidate } from '../../lib/candidates/extractCandidates'
import type { MenuUpload, ExtractedLine } from '../../lib/supabase'
import Auth from '../../components/Auth'
import UploadArea from '../../components/UploadArea'
import ProcessingStatus from '../../components/ProcessingStatus'
import CandidatesList from '../../components/CandidatesList'
import MenuCanvas from '../../components/MenuCanvas'
import EditModal from '../../components/EditModal'

export interface ProcessingState {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  message: string
  error?: string
}

export interface CandidateWithStatus extends Candidate {
  status: 'pending' | 'approved' | 'denied' | 'edited'
  editedText?: string
  databaseMatch?: import('../../lib/candidates/entreeLookup').EntreeMatch
}

const MLMPPage: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [processingState, setProcessingState] = useState<ProcessingState>({
    status: 'idle',
    progress: 0,
    message: ''
  })
  
  const [menuUpload, setMenuUpload] = useState<MenuUpload | null>(null)
  const [candidates, setCandidates] = useState<CandidateWithStatus[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null)
  const [editingCandidate, setEditingCandidate] = useState<CandidateWithStatus | null>(null)
  const [menuImage, setMenuImage] = useState<HTMLImageElement | null>(null)
  const [ocrProvider, setOcrProvider] = useState<any>(null)
  const [learningStats, setLearningStats] = useState<any>(null)
  const [retrainingNotification, setRetrainingNotification] = useState<string | null>(null)

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setIsAuthenticated(!!user)
    }
    checkAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Initialize OCR provider (only if authenticated)
  useEffect(() => {
    if (!isAuthenticated) return
    
    const initOcr = async () => {
      try {
        const provider = createOcrProvider('tesseract')
        setOcrProvider(provider)
        console.log('OCR provider initialized successfully')
      } catch (error) {
        console.error('Failed to initialize OCR provider:', error)
        console.log('Continuing without OCR provider...')
      }
    }
    initOcr()
  }, [isAuthenticated])

  // Load learning stats
  useEffect(() => {
    if (isAuthenticated) {
      loadLearningStats()
    }
  }, [isAuthenticated])

  const loadLearningStats = async () => {
    try {
      const stats = await getLearningStats()
      setLearningStats(stats)
    } catch (error) {
      console.error('Failed to load learning stats:', error)
    }
  }

  const handleFileUpload = useCallback(async (file: File) => {
    if (!ocrProvider) {
      setProcessingState({
        status: 'error',
        progress: 0,
        message: 'OCR provider not initialized',
        error: 'Please wait for OCR provider to initialize'
      })
      return
    }

    setProcessingState({
      status: 'uploading',
      progress: 0,
      message: 'Uploading file...'
    })

    try {
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const { data: { user } } = await supabase.auth.getUser()
      const filePath = `${user?.id || 'anonymous'}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('mlmp')
        .upload(filePath, file)

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      // Get page count
      let pageCount = 1
      if (file.type === 'application/pdf') {
        const { pdfToImages } = await import('../../lib/pdf/pdfToImages')
        const result = await pdfToImages(file)
        pageCount = result.totalPages
      }

      // Save menu upload record
      const { data: menuData, error: menuError } = await supabase
        .from('mlmp_menu_uploads')
        .insert({
          file_name: file.name,
          file_type: file.type,
          page_count: pageCount,
          user_id: user?.id // FIX: Include user_id for RLS
        })
        .select()
        .single()

      if (menuError) {
        throw new Error(`Failed to save menu record: ${menuError.message}`)
      }

      setMenuUpload(menuData)
      setProcessingState({
        status: 'processing',
        progress: 10,
        message: 'Processing file...'
      })

      // Process the file
      await processFile(file, menuData.menu_id)

    } catch (error) {
      console.error('File upload failed:', error)
      setProcessingState({
        status: 'error',
        progress: 0,
        message: 'Upload failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }, [ocrProvider])

  const processFile = async (file: File, menuId: string) => {
    try {
      // Check if OCR provider is available
      if (!ocrProvider || !ocrProvider.isAvailable()) {
        throw new Error('OCR provider not available. Please refresh the page and try again.')
      }

      setProcessingState(prev => ({
        ...prev,
        progress: 20,
        message: 'Extracting text...'
      }))

      let ocrResults: OcrResult[] = []
      let menuImageElement: HTMLImageElement | null = null

      if (file.type === 'application/pdf') {
        // Process PDF
        const pdfResult = await pdfToImages(file)
        ocrResults = []
        
        for (let i = 0; i < pdfResult.pages.length; i++) {
          const page = pdfResult.pages[i]
          setProcessingState(prev => ({
            ...prev,
            progress: 20 + (i / pdfResult.pages.length) * 40,
            message: `Processing page ${i + 1} of ${pdfResult.pages.length}...`
          }))
          
          console.log(`Processing PDF page ${i + 1} with OCR...`)
          const result = await ocrProvider.processImage(page.imageData)
          console.log(`PDF page ${i + 1} OCR result:`, result)
          ocrResults.push(result)
        }
        
        // Use first page for display
        if (pdfResult.pages.length > 0) {
          menuImageElement = new Image()
          menuImageElement.src = pdfResult.pages[0].canvas.toDataURL()
        }
      } else {
        // Process image
        const imageElement = new Image()
        imageElement.src = URL.createObjectURL(file)
        
        await new Promise((resolve, reject) => {
          imageElement.onload = resolve
          imageElement.onerror = reject
        })

        setProcessingState(prev => ({
          ...prev,
          progress: 40,
          message: 'Running OCR...'
        }))

        console.log('Processing image with OCR...')
        const result = await ocrProvider.processImage(imageElement)
        console.log('OCR result:', result)
        ocrResults = [result]
        menuImageElement = imageElement
      }

      setMenuImage(menuImageElement)

      // Check if OCR produced any results
      if (ocrResults.length === 0 || ocrResults.every(result => result.lines.length === 0)) {
        throw new Error('OCR failed to extract any text from the image. The image may be too blurry, low resolution, or contain text in an unsupported language.')
      }

      setProcessingState(prev => ({
        ...prev,
        progress: 60,
        message: 'Extracting candidates...'
      }))

      // Extract candidates from OCR results
      const allCandidates: CandidateWithStatus[] = []
      const allLines: ExtractedLine[] = []

      for (let pageIndex = 0; pageIndex < ocrResults.length; pageIndex++) {
        const ocrResult = ocrResults[pageIndex]
        
        // Save extracted lines to database
        for (const line of ocrResult.lines) {
          const { data: lineData, error: lineError } = await supabase
            .from('mlmp_extracted_lines')
            .insert({
              menu_id: menuId,
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
        const pageCandidates = await extractCandidates(ocrResult.lines, pageIndex + 1)
        const candidatesWithStatus: CandidateWithStatus[] = pageCandidates.map(candidate => ({
          ...candidate,
          status: 'pending' as const
        }))

        allCandidates.push(...candidatesWithStatus)
      }

      setProcessingState(prev => ({
        ...prev,
        progress: 80,
        message: 'Applying ML model...'
      }))

      // Apply ML model if available
      try {
        const mlModel = await loadLatestModel()
        if (mlModel) {
          const predictions = await mlModel.batchPredict(
            allCandidates.map(c => ({ features: c.features, text: c.text }))
          )

          // Update candidates with ML confidence
          allCandidates.forEach((candidate, index) => {
            candidate.confidence = predictions[index]
          })

          // Sort by ML confidence
          allCandidates.sort((a, b) => b.confidence - a.confidence)
        } else {
          console.log('No ML model available, using heuristic confidence scores')
        }
      } catch (mlError) {
        console.warn('ML model not available, using heuristic confidence:', mlError)
      }

      // Save candidate predictions for learning
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await saveCandidatePredictions(allCandidates, menuId, user.id)
          console.log('Saved candidate predictions for learning')
        }
      } catch (error) {
        console.error('Failed to save candidate predictions:', error)
        // Don't fail the whole process if learning data saving fails
      }

      setCandidates(allCandidates)

      setProcessingState({
        status: 'completed',
        progress: 100,
        message: `Found ${allCandidates.length} candidates`
      })

    } catch (error) {
      console.error('File processing failed:', error)
      setProcessingState({
        status: 'error',
        progress: 0,
        message: 'Processing failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  const handleCandidateAction = useCallback(async (candidateId: string, action: 'approve' | 'deny' | 'edit', editedText?: string) => {
    // Update UI state
    setCandidates(prev => prev.map(candidate => {
      if (candidate.id === candidateId) {
        if (action === 'edit') {
          return {
            ...candidate,
            status: 'edited',
            editedText: editedText
          }
        } else if (action === 'approve') {
          // When approving, use the edited text if it exists, otherwise use original text
          const finalText = candidate.editedText || candidate.text
          return {
            ...candidate,
            status: 'approved',
            text: finalText, // Update the main text with the edited version
            editedText: candidate.editedText // Keep the edited text for reference
          }
        } else if (action === 'deny') {
          return {
            ...candidate,
            status: 'denied'
          }
        }
      }
      return candidate
    }))

    // Save user feedback for learning
    try {
      const candidate = candidates.find(c => c.id === candidateId)
      if (candidate && menuUpload) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await saveUserFeedback({
            candidate_id: candidateId,
            text: candidate.text,
            features: candidate.features,
            confidence: candidate.confidence,
            user_action: action,
            edited_text: editedText,
            menu_id: menuUpload.menu_id,
            user_id: user.id
          })

          console.log(`Saved user feedback: ${action} for candidate ${candidateId}`)

          // Check if we should trigger retraining
          const newModelVersion = await triggerRetrainingIfNeeded()
          if (newModelVersion) {
            console.log('Model retraining completed based on new feedback:', newModelVersion)
            setRetrainingNotification(`Retraining completed. Current model is version ${newModelVersion}`)
            // Auto-hide notification after 5 seconds
            setTimeout(() => {
              setRetrainingNotification(null)
            }, 5000)
            // Reload learning stats
            await loadLearningStats()
          }
        }
      }
    } catch (error) {
      console.error('Failed to save user feedback:', error)
      // Don't fail the UI action if learning data saving fails
    }
  }, [candidates, menuUpload])

  // Handle adding manual candidate
  const handleAddManualCandidate = useCallback(async (text: string, bbox: { x: number, y: number, w: number, h: number }) => {
    if (!menuUpload) return

    // Look up in database for entree match
    const { findEntreeMatch } = await import('../../lib/candidates/entreeLookup')
    const databaseMatch = await findEntreeMatch(text)

    // Create a new candidate with manual selection
    const newCandidate: CandidateWithStatus = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      page: 1, // Assume page 1 for manual selections
      text: text,
      bbox: bbox,
      features: {
        tokenCount: text.split(' ').length,
        hasDigits: /\d/.test(text) ? 1 : 0,
        hasCurrency: /[$€£¥]/.test(text) ? 1 : 0,
        isAllCaps: text === text.toUpperCase() && text.length > 1 ? 1 : 0,
        isTitleCase: /^[A-Z][a-z]/.test(text) ? 1 : 0,
        priceSameLine: 0, // Manual candidates don't have price context
        priceNextLines1to3: 0,
        underEntreeHeader: 0, // Could be enhanced to detect context
        punctDensity: (text.match(/[.,;:!?]/g) || []).length / text.length,
        nextLineDescription: 0,
        lettersRatio: text.replace(/[^a-zA-Z]/g, '').length / text.length,
        uppercaseRatio: text.replace(/[^A-Z]/g, '').length / text.length,
        startsWithArticle: /^(the|a|an|le|la|les|un|une|des)\s/i.test(text) ? 1 : 0,
        endsWithStop: /\s(of|and|or|with|in|on|at|to|for|de|du|des|et|ou|avec|dans|sur|à|pour)\s*$/i.test(text) ? 1 : 0,
        avgTokenLen: text.split(' ').reduce((sum, token) => sum + token.length, 0) / text.split(' ').length,
        fontSizeRatio: 1.0 // Manual candidates get default font ratio
      },
      confidence: databaseMatch ? 0.9 + databaseMatch.confidence_boost : 0.8, // Higher confidence if database match found
      status: 'pending',
      databaseMatch: databaseMatch || undefined
    }

    // Add to candidates list
    setCandidates(prev => [...prev, newCandidate])

    // Save as prediction for learning
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await saveCandidatePredictions([newCandidate], menuUpload.menu_id, user.id)
        console.log('Saved manual candidate prediction for learning')
      }
    } catch (error) {
      console.error('Failed to save manual candidate prediction:', error)
      // Don't fail the UI action if learning data saving fails
    }
  }, [menuUpload])

  const handleSaveApproved = useCallback(async () => {
    if (!menuUpload) return

    const approvedCandidates = candidates.filter(c => c.status === 'approved' || c.status === 'edited')
    
    if (approvedCandidates.length === 0) {
      alert('No approved candidates to save')
      return
    }

    try {
      // Save approved entrees to database
      const entreesToSave = approvedCandidates.map(candidate => ({
        menu_id: menuUpload.menu_id,
        text: normalizeCandidateText(candidate.text), // Use the main text field (which now contains edited text if applicable)
        source_line_id: null // TODO: Link to actual line_id
      })).filter(entree => validateEntreeName(entree.text))

      // Use insert with ignoreDuplicates to handle conflicts gracefully
      const { error } = await supabase
        .from('mlmp_entrees')
        .insert(entreesToSave)

      if (error) {
        throw new Error(`Failed to save entrees: ${error.message}`)
      }

      alert(`Successfully saved ${entreesToSave.length} entrees!`)
      
      // Reset state
      setCandidates([])
      setMenuUpload(null)
      setMenuImage(null)
      setProcessingState({
        status: 'idle',
        progress: 0,
        message: ''
      })

      // Reload learning stats
      await loadLearningStats()
      
      // Check if we should trigger retraining
      const newModelVersion = await triggerRetrainingIfNeeded()
      if (newModelVersion) {
        setRetrainingNotification(`Retraining completed. Current model is version ${newModelVersion}`)
        // Auto-hide notification after 5 seconds
        setTimeout(() => {
          setRetrainingNotification(null)
        }, 5000)
      }

    } catch (error) {
      console.error('Failed to save approved entrees:', error)
      alert(`Failed to save entrees: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [candidates, menuUpload])

  const handleEditCandidate = useCallback((candidate: CandidateWithStatus) => {
    setEditingCandidate(candidate)
  }, [])

  const handleSaveEdit = useCallback((candidateId: string, editedText: string) => {
    setCandidates(prev => prev.map(candidate => {
      if (candidate.id === candidateId) {
        return {
          ...candidate,
          editedText: editedText,
          status: 'edited'
        }
      }
      return candidate
    }))
    setEditingCandidate(null)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setIsAuthenticated(false)
  }

  const getConfidenceClass = (confidence: number) => {
    if (confidence >= 0.8) return 'confidence-high'
    if (confidence >= 0.6) return 'confidence-medium'
    return 'confidence-low'
  }

  const approvedCount = candidates.filter(c => c.status === 'approved').length
  const deniedCount = candidates.filter(c => c.status === 'denied').length
  const pendingCount = candidates.filter(c => c.status === 'pending').length

  if (!isAuthenticated) {
    return <Auth onAuthSuccess={() => setIsAuthenticated(true)} />
  }

  return (
    <div className="mlmp-container">
      {/* Retraining Notification */}
      {retrainingNotification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#10b981',
          color: 'white',
          padding: '15px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          maxWidth: '400px',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🔄</span>
            <span>{retrainingNotification}</span>
            <button
              onClick={() => setRetrainingNotification(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '0',
                marginLeft: '10px'
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="mlmp-header">
        <h1>Machine Learning Menu Processor</h1>
        <p>Upload a menu image or PDF to extract entree names using OCR and machine learning</p>
        
        {/* Learning Stats */}
        {learningStats && (
          <div style={{ 
            position: 'absolute', 
            top: '20px', 
            left: '20px', 
            backgroundColor: '#f0f9ff',
            border: '1px solid #0ea5e9',
            borderRadius: '8px',
            padding: '10px',
            fontSize: '0.9rem'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Learning Progress</div>
            <div>Labels: {learningStats.totalLabels} | Predictions: {learningStats.totalPredictions}</div>
            <div>Approved: {learningStats.approvedCount} | Denied: {learningStats.deniedCount} | Edited: {learningStats.editedCount}</div>
            {learningStats.pendingRetrain && (
              <div style={{ color: '#f59e0b', fontWeight: 'bold' }}>🔄 Retraining pending</div>
            )}
            {learningStats.lastModelVersion && (
              <div style={{ color: '#10b981' }}>Model: {learningStats.lastModelVersion}</div>
            )}
          </div>
        )}
        
        <button 
          onClick={handleLogout}
          style={{ 
            position: 'absolute', 
            top: '20px', 
            right: '20px', 
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>

      <div className="mlmp-content">
        {processingState.status === 'idle' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <UploadArea onFileUpload={handleFileUpload} />
          </div>
        )}

        {processingState.status === 'uploading' && (
          <ProcessingStatus 
            status={processingState.status}
            progress={processingState.progress}
            message={processingState.message}
          />
        )}

        {processingState.status === 'processing' && (
          <ProcessingStatus 
            status={processingState.status}
            progress={processingState.progress}
            message={processingState.message}
          />
        )}

        {processingState.status === 'error' && (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            padding: '40px',
            textAlign: 'center'
          }}>
            <h2 style={{ color: '#ef4444', marginBottom: '20px' }}>Processing Failed</h2>
            <p style={{ marginBottom: '20px' }}>{processingState.message}</p>
            {processingState.error && (
              <p style={{ 
                color: '#6b7280', 
                fontSize: '0.9rem',
                backgroundColor: '#f9fafb',
                padding: '10px',
                borderRadius: '4px',
                fontFamily: 'monospace'
              }}>
                {processingState.error}
              </p>
            )}
            <button 
              onClick={() => setProcessingState({ status: 'idle', progress: 0, message: '' })}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {processingState.status === 'completed' && menuImage && (
          <div style={{ 
            display: 'flex', 
            height: 'calc(100vh - 200px)', 
            gap: '20px',
            padding: '20px'
          }}>
            {/* Left Column - Menu Image */}
            <div style={{ 
              flex: '1', 
              border: '1px solid #ddd', 
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: '#f9f9f9'
            }}>
              <div style={{ 
                padding: '15px', 
                borderBottom: '1px solid #ddd',
                backgroundColor: '#fff',
                fontWeight: 'bold'
              }}>
                Menu Image
              </div>
              <div style={{ 
                height: 'calc(100% - 50px)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                overflow: 'auto'
              }}>
                <MenuCanvas 
                  image={menuImage}
                  candidates={candidates}
                  selectedCandidate={selectedCandidate}
                  onCandidateSelect={setSelectedCandidate}
                  onAddManualCandidate={handleAddManualCandidate}
                />
              </div>
            </div>

            {/* Right Column - Candidates */}
            <div style={{ 
              flex: '1', 
              border: '1px solid #ddd', 
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: '#f9f9f9',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ 
                padding: '15px', 
                borderBottom: '1px solid #ddd',
                backgroundColor: '#fff',
                fontWeight: 'bold'
              }}>
                Detected Candidates ({candidates.length})
              </div>
              
              <div style={{ 
                flex: '1', 
                overflow: 'auto',
                padding: '15px'
              }}>
                <CandidatesList
                  candidates={candidates}
                  selectedCandidate={selectedCandidate}
                  onCandidateSelect={setSelectedCandidate}
                  onCandidateAction={handleCandidateAction}
                  onEditCandidate={handleEditCandidate}
                  getConfidenceClass={getConfidenceClass}
                />
              </div>
              
              <div style={{ 
                padding: '15px', 
                borderTop: '1px solid #ddd',
                backgroundColor: '#fff'
              }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(4, 1fr)', 
                  gap: '10px',
                  marginBottom: '15px'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                      {approvedCount}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>Approved</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>
                      {deniedCount}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>Denied</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
                      {pendingCount}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>Pending</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6b7280' }}>
                      {candidates.length}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>Total</div>
                  </div>
                </div>
                
                <button 
                  onClick={handleSaveApproved}
                  disabled={approvedCount === 0}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: approvedCount > 0 ? '#3b82f6' : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: approvedCount > 0 ? 'pointer' : 'not-allowed'
                  }}
                >
                  Save {approvedCount} Approved Entrees
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {editingCandidate && (
        <EditModal
          candidate={editingCandidate}
          onSave={(editedText) => handleSaveEdit(editingCandidate.id, editedText)}
          onCancel={() => setEditingCandidate(null)}
        />
      )}

      <div className="keyboard-shortcuts">
        <div>Keyboard shortcuts:</div>
        <div>
          <span className="shortcut">↑↓</span> Navigate • 
          <span className="shortcut">A</span> Approve • 
          <span className="shortcut">D</span> Deny • 
          <span className="shortcut">E</span> Edit
        </div>
      </div>
    </div>
  )
}

export default MLMPPage