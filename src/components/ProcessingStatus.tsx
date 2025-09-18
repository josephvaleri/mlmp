import React from 'react'

interface ProcessingStatusProps {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  message: string
  error?: string
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ progress, message, error }) => {
  return (
    <div className="processing-status">
      <div className="processing-spinner"></div>
      <div style={{ fontSize: '1.1rem', marginBottom: '10px', fontWeight: '600' }}>
        {message}
      </div>
      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '20px' }}>
        {Math.round(progress)}% complete
      </div>
      <div style={{ 
        width: '100%', 
        height: '8px', 
        backgroundColor: '#e9ecef', 
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <div 
          style={{ 
            width: `${progress}%`, 
            height: '100%', 
            backgroundColor: '#DA734E',
            transition: 'width 0.3s ease'
          }}
        />
      </div>
      {error && (
        <div style={{ 
          marginTop: '10px', 
          padding: '10px', 
          backgroundColor: '#fee', 
          border: '1px solid #fcc', 
          borderRadius: '4px',
          color: '#c33',
          fontSize: '0.9rem'
        }}>
          {error}
        </div>
      )}
    </div>
  )
}

export default ProcessingStatus