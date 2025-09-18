import React, { useState, useEffect } from 'react'
import type { CandidateWithStatus } from '../pages/mlmp/MLMPPage'

interface CandidatesListProps {
  candidates: CandidateWithStatus[]
  selectedCandidate: string | null
  onCandidateSelect: (candidateId: string | null) => void
  onCandidateAction: (candidateId: string, action: 'approve' | 'deny' | 'edit', editedText?: string) => void
  onEditCandidate: (candidate: CandidateWithStatus) => void
  getConfidenceClass: (confidence: number) => string
}

type FilterType = 'all' | 'pending' | 'approved' | 'denied' | 'edited'
type SortType = 'confidence' | 'page' | 'status'

const CandidatesList: React.FC<CandidatesListProps> = ({
  candidates,
  selectedCandidate,
  onCandidateSelect,
  onCandidateAction,
  onEditCandidate,
  getConfidenceClass
}) => {
  const [filter, setFilter] = useState<FilterType>('all')
  const [sortBy, setSortBy] = useState<SortType>('confidence')
  const [filteredCandidates, setFilteredCandidates] = useState<CandidateWithStatus[]>([])

  // Filter and sort candidates
  useEffect(() => {
    let filtered = candidates

    // Apply filter
    if (filter !== 'all') {
      filtered = candidates.filter(candidate => candidate.status === filter)
    }

    // Apply sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          return b.confidence - a.confidence
        case 'page':
          return a.page - b.page
        case 'status':
          const statusOrder = { pending: 0, approved: 1, edited: 2, denied: 3 }
          return statusOrder[a.status] - statusOrder[b.status]
        default:
          return 0
      }
    })

    setFilteredCandidates(filtered)
  }, [candidates, filter, sortBy])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return // Don't handle shortcuts when typing
      }

      const selectedIndex = filteredCandidates.findIndex(c => c.id === selectedCandidate)
      
      switch (e.key.toLowerCase()) {
        case 'arrowdown':
          e.preventDefault()
          if (selectedIndex < filteredCandidates.length - 1) {
            onCandidateSelect(filteredCandidates[selectedIndex + 1].id)
          }
          break
        case 'arrowup':
          e.preventDefault()
          if (selectedIndex > 0) {
            onCandidateSelect(filteredCandidates[selectedIndex - 1].id)
          }
          break
        case 'a':
          e.preventDefault()
          if (selectedCandidate) {
            onCandidateAction(selectedCandidate, 'approve')
          }
          break
        case 'd':
          e.preventDefault()
          if (selectedCandidate) {
            onCandidateAction(selectedCandidate, 'deny')
          }
          break
        case 'e':
          e.preventDefault()
          if (selectedCandidate) {
            const candidate = filteredCandidates.find(c => c.id === selectedCandidate)
            if (candidate) {
              onEditCandidate(candidate)
            }
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [filteredCandidates, selectedCandidate, onCandidateSelect, onCandidateAction, onEditCandidate])

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'approved': return 'status-approved'
      case 'denied': return 'status-denied'
      case 'edited': return 'status-edited'
      default: return 'status-pending'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return '✓ Approved'
      case 'denied': return '✗ Denied'
      case 'edited': return '✏️ Edited'
      default: return '⏳ Pending'
    }
  }

  return (
    <div className="candidates-list">
      <div className="candidates-header">
        <div className="candidates-count">
          {filteredCandidates.length} candidates
        </div>
        <div className="candidates-filters">
          <select 
            className="filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterType)}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
            <option value="edited">Edited</option>
          </select>
          <select 
            className="filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortType)}
          >
            <option value="confidence">Confidence</option>
            <option value="page">Page</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filteredCandidates.map((candidate) => (
          <div
            key={candidate.id}
            className={`candidate-item ${selectedCandidate === candidate.id ? 'selected' : ''}`}
            onClick={() => onCandidateSelect(candidate.id)}
          >
            <div className="candidate-text">
              {candidate.status === 'edited' ? candidate.editedText : candidate.text}
            </div>
            
            <div className="candidate-meta">
              <div>
                <span className={`confidence-badge ${getConfidenceClass(candidate.confidence)}`}>
                  {Math.round(candidate.confidence * 100)}%
                </span>
                <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#999' }}>
                  Page {candidate.page}
                </span>
              </div>
              <div className={`candidate-status ${getStatusClass(candidate.status)}`}>
                {getStatusText(candidate.status)}
              </div>
            </div>

            {candidate.headerContext && (
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                📍 {candidate.headerContext}
              </div>
            )}

            {candidate.priceContext && candidate.priceContext.length > 0 && (
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '2px' }}>
                💰 {candidate.priceContext.join(', ')}
              </div>
            )}

            <div className="candidate-actions">
              <button
                className="action-btn approve-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onCandidateAction(candidate.id, 'approve')
                }}
                disabled={candidate.status === 'approved'}
              >
                Approve
              </button>
              <button
                className="action-btn deny-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onCandidateAction(candidate.id, 'deny')
                }}
                disabled={candidate.status === 'denied'}
              >
                Deny
              </button>
              <button
                className="action-btn edit-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditCandidate(candidate)
                }}
              >
                Edit
              </button>
            </div>
          </div>
        ))}

        {filteredCandidates.length === 0 && (
          <div style={{ 
            padding: '40px 20px', 
            textAlign: 'center', 
            color: '#666',
            fontSize: '0.9rem'
          }}>
            No candidates found for the selected filter.
          </div>
        )}
      </div>
    </div>
  )
}

export default CandidatesList
