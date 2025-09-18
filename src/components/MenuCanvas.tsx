import React, { useRef, useEffect, useState } from 'react'
import type { CandidateWithStatus } from '../pages/mlmp/MLMPPage'

// Text Input Modal Component
interface TextInputModalProps {
  onConfirm: (text: string) => void
  onCancel: () => void
}

const TextInputModal: React.FC<TextInputModalProps> = ({ onConfirm, onCancel }) => {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim()) {
      onConfirm(text.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter entree name..."
        style={{
          width: '100%',
          padding: '10px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '1rem',
          marginBottom: '15px'
        }}
      />
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            background: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!text.trim()}
          style={{
            padding: '8px 16px',
            background: text.trim() ? '#3b82f6' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: text.trim() ? 'pointer' : 'not-allowed'
          }}
        >
          Add Candidate
        </button>
      </div>
    </form>
  )
}

interface MenuCanvasProps {
  image: HTMLImageElement
  candidates: CandidateWithStatus[]
  selectedCandidate: string | null
  onCandidateSelect: (candidateId: string | null) => void
  onAddManualCandidate?: (text: string, bbox: { x: number, y: number, w: number, h: number }) => void
}

const MenuCanvas: React.FC<MenuCanvasProps> = ({
  image,
  candidates,
  selectedCandidate,
  onCandidateSelect,
  onAddManualCandidate
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  
  // Text selection mode
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectStart, setSelectStart] = useState({ x: 0, y: 0 })
  const [selectEnd, setSelectEnd] = useState({ x: 0, y: 0 })
  const [showTextInput, setShowTextInput] = useState(false)
  const [selectedBbox, setSelectedBbox] = useState<{ x: number, y: number, w: number, h: number } | null>(null)

  // Draw image and bounding boxes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match image
    canvas.width = image.width
    canvas.height = image.height

    // Draw image
    ctx.drawImage(image, 0, 0)

    // Draw bounding boxes
    candidates.forEach(candidate => {
      if (!candidate.bbox) return

      const isSelected = candidate.id === selectedCandidate
      const alpha = isSelected ? 0.3 : 0.1
      const borderColor = isSelected ? '#c66542' : '#DA734E'

      // Draw bounding box
      ctx.fillStyle = `rgba(218, 115, 78, ${alpha})`
      ctx.fillRect(
        candidate.bbox.x,
        candidate.bbox.y,
        candidate.bbox.w,
        candidate.bbox.h
      )

      // Draw border
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 2
      ctx.strokeRect(
        candidate.bbox.x,
        candidate.bbox.y,
        candidate.bbox.w,
        candidate.bbox.h
      )

      // Draw confidence score
      if (candidate.bbox.w > 50 && candidate.bbox.h > 20) {
        ctx.fillStyle = borderColor
        ctx.font = '12px Arial'
        ctx.fillText(
          `${Math.round(candidate.confidence * 100)}%`,
          candidate.bbox.x + 2,
          candidate.bbox.y + 15
        )
      }
    })

    // Draw selection rectangle if in select mode
    if (isSelectMode && isSelecting) {
      const x = Math.min(selectStart.x, selectEnd.x)
      const y = Math.min(selectStart.y, selectEnd.y)
      const w = Math.abs(selectEnd.x - selectStart.x)
      const h = Math.abs(selectEnd.y - selectStart.y)

      // Draw selection rectangle
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])

      // Draw selection fill
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'
      ctx.fillRect(x, y, w, h)
    }
  }, [image, candidates, selectedCandidate, isSelectMode, isSelecting, selectStart, selectEnd])

  // Handle canvas click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    if (isSelectMode) {
      // Start text selection
      setIsSelecting(true)
      setSelectStart({ x, y })
      setSelectEnd({ x, y })
    } else {
      // Find clicked candidate
      const clickedCandidate = candidates.find(candidate => {
        if (!candidate.bbox) return false
        return (
          x >= candidate.bbox.x &&
          x <= candidate.bbox.x + candidate.bbox.w &&
          y >= candidate.bbox.y &&
          y <= candidate.bbox.y + candidate.bbox.h
        )
      })

      onCandidateSelect(clickedCandidate?.id || null)
    }
  }

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (!isSelectMode) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setScale(prev => Math.max(0.1, Math.min(3, prev * delta)))
    }
  }

  // Handle mouse drag for panning and text selection
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSelectMode) {
      // Handle text selection
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) / scale
      const y = (e.clientY - rect.top) / scale

      setIsSelecting(true)
      setSelectStart({ x, y })
      setSelectEnd({ x, y })
    } else {
      // Handle panning
      setIsDragging(true)
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSelectMode && isSelecting) {
      // Update selection rectangle
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) / scale
      const y = (e.clientY - rect.top) / scale

      setSelectEnd({ x, y })
    } else if (isDragging) {
      // Handle panning
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isSelectMode && isSelecting) {
      // Finish text selection
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) / scale
      const y = (e.clientY - rect.top) / scale

      setSelectEnd({ x, y })
      setIsSelecting(false)

      // Calculate bounding box
      const bbox = {
        x: Math.min(selectStart.x, x),
        y: Math.min(selectStart.y, y),
        w: Math.abs(x - selectStart.x),
        h: Math.abs(y - selectStart.y)
      }

      // Only show text input if selection is large enough
      if (bbox.w > 20 && bbox.h > 10) {
        setSelectedBbox(bbox)
        setShowTextInput(true)
      }
    } else {
      setIsDragging(false)
    }
  }

  // Reset zoom and pan
  const resetView = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  // Handle adding manual candidate
  const handleAddManualCandidate = (text: string) => {
    if (selectedBbox && onAddManualCandidate) {
      onAddManualCandidate(text, selectedBbox)
      setShowTextInput(false)
      setSelectedBbox(null)
      setIsSelectMode(false)
    }
  }

  // Cancel text selection
  const cancelTextSelection = () => {
    setShowTextInput(false)
    setSelectedBbox(null)
    setIsSelecting(false)
  }

  return (
    <div className="canvas-container" ref={containerRef}>
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        right: '10px', 
        zIndex: 10,
        display: 'flex',
        gap: '10px'
      }}>
        <button 
          onClick={() => setIsSelectMode(!isSelectMode)}
          style={{ 
            padding: '8px 12px', 
            fontSize: '0.8rem',
            background: isSelectMode ? '#3b82f6' : 'white',
            color: isSelectMode ? 'white' : 'black',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isSelectMode ? 'Exit Select' : 'Select Text'}
        </button>
        <button 
          onClick={resetView}
          style={{ 
            padding: '8px 12px', 
            fontSize: '0.8rem',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reset View
        </button>
        <div style={{ 
          padding: '8px 12px', 
          fontSize: '0.8rem',
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }}>
          {Math.round(scale * 100)}%
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="menu-canvas"
        style={{
          transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
          transformOrigin: 'top left',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      <div style={{ 
        position: 'absolute', 
        bottom: '10px', 
        left: '10px', 
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '4px',
        fontSize: '0.8rem'
      }}>
        {isSelectMode 
          ? 'Drag to select text area • Click "Exit Select" to cancel'
          : 'Click on bounding boxes to select candidates • Scroll to zoom • Drag to pan'
        }
      </div>

      {/* Text Input Modal */}
      {showTextInput && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            minWidth: '400px',
            maxWidth: '600px'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>
              Add Manual Candidate
            </h3>
            <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '0.9rem' }}>
              Enter the text for the selected area:
            </p>
            <TextInputModal 
              onConfirm={handleAddManualCandidate}
              onCancel={cancelTextSelection}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default MenuCanvas
