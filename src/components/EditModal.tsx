import React, { useState, useEffect, useRef } from 'react'
import type { CandidateWithStatus } from '../pages/mlmp/MLMPPage'

interface EditModalProps {
  candidate: CandidateWithStatus
  onSave: (editedText: string) => void
  onCancel: () => void
}

const EditModal: React.FC<EditModalProps> = ({ candidate, onSave, onCancel }) => {
  const [editedText, setEditedText] = useState(candidate.text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus input when modal opens
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  const handleSave = () => {
    const trimmedText = editedText.trim()
    if (trimmedText && trimmedText !== candidate.text) {
      onSave(trimmedText)
    } else {
      onCancel()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="edit-modal" onClick={onCancel}>
      <div className="edit-modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Edit Entree Name</h3>
        
        <div style={{ marginBottom: '15px', fontSize: '0.9rem', color: '#666' }}>
          Original: <em>{candidate.text}</em>
        </div>
        
        <input
          ref={inputRef}
          type="text"
          className="edit-input"
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Enter the corrected entree name..."
        />
        
        <div style={{ 
          fontSize: '0.8rem', 
          color: '#666', 
          marginBottom: '20px',
          lineHeight: '1.4'
        }}>
          <strong>Tips:</strong>
          <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
            <li>Remove any prices or numbers</li>
            <li>Use proper capitalization</li>
            <li>Keep it concise (2-6 words)</li>
            <li>Press Enter to save, Escape to cancel</li>
          </ul>
        </div>
        
        <div className="edit-modal-actions">
          <button className="cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button 
            className="save-edit-btn" 
            onClick={handleSave}
            disabled={!editedText.trim()}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

export default EditModal
