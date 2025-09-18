import React, { useCallback, useState } from 'react'
import CameraCapture from './CameraCapture'

interface UploadAreaProps {
  onFileUpload: (file: File) => void
}

const UploadArea: React.FC<UploadAreaProps> = ({ onFileUpload }) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [showCamera, setShowCamera] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    const file = files[0]
    
    if (file) {
      handleFileSelect(file)
    }
  }, [])

  const handleFileSelect = useCallback((file: File) => {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      alert('Please select a JPG, PNG, or PDF file')
      return
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      alert('File size must be less than 10MB')
      return
    }

    onFileUpload(file)
  }, [onFileUpload])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  const handleCameraCapture = useCallback((file: File) => {
    onFileUpload(file)
    setShowCamera(false)
  }, [onFileUpload])

  const handleCameraClose = useCallback(() => {
    setShowCamera(false)
  }, [])

  return (
    <>
      <div
        className={`upload-area ${isDragOver ? 'dragover' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          onChange={handleFileInputChange}
        />
        
        <div className="upload-icon">📄</div>
        <div className="upload-text">
          {isDragOver ? 'Drop your menu file here' : 'Click to upload or drag and drop'}
        </div>
        <div className="upload-hint">
          Supports JPG, PNG, and PDF files up to 10MB
        </div>
      </div>
      
      <div className="upload-options">
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          className="camera-btn"
        >
          📸 Take Photo
        </button>
      </div>

      {showCamera && (
        <CameraCapture
          onImageCapture={handleCameraCapture}
          onClose={handleCameraClose}
        />
      )}
    </>
  )
}

export default UploadArea
