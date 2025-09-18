import React, { useRef, useState, useCallback, useEffect } from 'react'

interface CameraCaptureProps {
  onImageCapture: (file: File) => void
  onClose: () => void
}

interface ImageQuality {
  isGood: boolean
  issues: string[]
  suggestions: string[]
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onImageCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [imageQuality, setImageQuality] = useState<ImageQuality | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showGuidance, setShowGuidance] = useState(true)

  // Start camera when component mounts
  useEffect(() => {
    startCamera()
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })
      
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch (err) {
      setError('Unable to access camera. Please check permissions.')
      console.error('Camera error:', err)
    }
  }

  const captureImage = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return

    setIsCapturing(true)
    
    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    
    if (!context) return

    // Set canvas size to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert to blob and create file
    canvas.toBlob(async (blob) => {
      if (!blob) return

      // Create preview URL
      const imageUrl = URL.createObjectURL(blob)
      setCapturedImage(imageUrl)

      // Analyze image quality
      const quality = await analyzeImageQuality(canvas, blob)
      setImageQuality(quality)

      setIsCapturing(false)
    }, 'image/jpeg', 0.9)
  }, [])

  const analyzeImageQuality = async (canvas: HTMLCanvasElement, blob: Blob): Promise<ImageQuality> => {
    const issues: string[] = []
    const suggestions: string[] = []

    // Check image dimensions
    const { width, height } = canvas
    const aspectRatio = width / height
    
    if (width < 800 || height < 600) {
      issues.push('Image resolution is too low')
      suggestions.push('Move closer to the menu or use a higher resolution camera')
    }

    // Check aspect ratio (should be roughly square or rectangular)
    if (aspectRatio < 0.5 || aspectRatio > 2.0) {
      issues.push('Image is too stretched or compressed')
      suggestions.push('Try to frame the menu section more squarely')
    }

    // Check for blur (simple edge detection)
    const context = canvas.getContext('2d')
    if (context) {
      const imageData = context.getImageData(0, 0, width, height)
      const blurScore = calculateBlurScore(imageData)
      
      if (blurScore < 0.1) {
        issues.push('Image appears blurry')
        suggestions.push('Hold the camera steady and ensure good lighting')
      }
    }

    // Check for darkness (average brightness)
    const brightness = await calculateBrightness(canvas)
    if (brightness < 0.3) {
      issues.push('Image is too dark')
      suggestions.push('Move to better lighting or use flash')
    } else if (brightness > 0.9) {
      issues.push('Image is too bright/overexposed')
      suggestions.push('Avoid direct sunlight or bright reflections')
    }

    // Check file size
    const fileSizeMB = blob.size / (1024 * 1024)
    if (fileSizeMB < 0.1) {
      issues.push('Image file is very small')
      suggestions.push('Try capturing at higher resolution')
    }

    const isGood = issues.length === 0

    return {
      isGood,
      issues,
      suggestions
    }
  }

  const calculateBlurScore = (imageData: ImageData): number => {
    const data = imageData.data
    let edgeCount = 0
    const width = imageData.width
    const height = imageData.height

    // Simple edge detection using Sobel operator
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4
        // Calculate gradient
        const gx = -data[idx - 4] + data[idx + 4] - 2 * data[idx - width * 4] + 2 * data[idx + width * 4] - data[idx - (width + 1) * 4] + data[idx + (width + 1) * 4]
        const gy = -data[idx - width * 4] + data[idx + width * 4] - 2 * data[idx - 4] + 2 * data[idx + 4] - data[idx - (width - 1) * 4] + data[idx + (width + 1) * 4]

        const magnitude = Math.sqrt(gx * gx + gy * gy)
        if (magnitude > 50) edgeCount++
      }
    }

    return edgeCount / (width * height)
  }

  const calculateBrightness = async (canvas: HTMLCanvasElement): Promise<number> => {
    const context = canvas.getContext('2d')
    if (!context) return 0.5

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    let totalBrightness = 0

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const brightness = (r + g + b) / 3 / 255
      totalBrightness += brightness
    }

    return totalBrightness / (data.length / 4)
  }

  const handleRetake = () => {
    setCapturedImage(null)
    setImageQuality(null)
    setShowGuidance(true)
  }

  const handleUseImage = () => {
    if (!capturedImage) return

    // Convert the captured image back to a file
    fetch(capturedImage)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], `menu-capture-${Date.now()}.jpg`, {
          type: 'image/jpeg'
        })
        onImageCapture(file)
        onClose()
      })
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
    onClose()
  }

  if (error) {
    return (
      <div className="camera-overlay">
        <div className="camera-container">
          <div className="camera-error">
            <h3>Camera Error</h3>
            <p>{error}</p>
            <button onClick={onClose} className="btn btn-primary">
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="camera-overlay">
      <div className="camera-container">
        <div className="camera-header">
          <h3>Capture Menu Image</h3>
          <button onClick={stopCamera} className="close-btn">×</button>
        </div>

        {showGuidance && (
          <div className="camera-guidance">
            <h4>📸 Tips for a Great Menu Photo:</h4>
            <ul>
              <li>✅ <strong>Good Lighting:</strong> Use natural light or bright indoor lighting</li>
              <li>✅ <strong>Frame Squarely:</strong> Try to capture the menu section as square as possible</li>
              <li>✅ <strong>Close Up:</strong> Focus on the Entree section, get close enough to read text clearly</li>
              <li>✅ <strong>Hold Steady:</strong> Keep the camera stable to avoid blur</li>
              <li>✅ <strong>Full Section:</strong> Capture the complete menu section you want to analyze</li>
            </ul>
            <button onClick={() => setShowGuidance(false)} className="btn btn-secondary">
              Got it, start camera
            </button>
          </div>
        )}

        {!showGuidance && !capturedImage && (
          <div className="camera-preview">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-video"
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            
            <div className="camera-controls">
              <button
                onClick={captureImage}
                disabled={isCapturing}
                className="capture-btn"
              >
                {isCapturing ? 'Capturing...' : '📸 Capture'}
              </button>
            </div>
          </div>
        )}

        {capturedImage && (
          <div className="image-preview">
            <img src={capturedImage} alt="Captured menu" className="preview-image" />
            
            {imageQuality && (
              <div className={`quality-assessment ${imageQuality.isGood ? 'good' : 'needs-improvement'}`}>
                <h4>
                  {imageQuality.isGood ? '✅ Great Image!' : '⚠️ Image Needs Improvement'}
                </h4>
                
                {imageQuality.issues.length > 0 && (
                  <div className="issues">
                    <h5>Issues Found:</h5>
                    <ul>
                      {imageQuality.issues.map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {imageQuality.suggestions.length > 0 && (
                  <div className="suggestions">
                    <h5>Suggestions:</h5>
                    <ul>
                      {imageQuality.suggestions.map((suggestion, index) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            <div className="preview-controls">
              <button onClick={handleRetake} className="btn btn-secondary">
                📷 Retake
              </button>
              <button 
                onClick={handleUseImage} 
                className="btn btn-primary"
                disabled={imageQuality ? !imageQuality.isGood : false}
              >
                {imageQuality && !imageQuality.isGood ? '⚠️ Use Anyway' : '✅ Use This Image'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CameraCapture
