import type { Candidate } from '../candidates/extractCandidates'

export interface UserFeedback {
  candidate_id: string
  text: string
  features: any
  confidence: number
  user_action: 'approve' | 'deny' | 'edit'
  edited_text?: string
  menu_id: string
  user_id: string
}

export interface Prediction {
  pred_id: string
  features: any
  confidence: number
  line_id?: string
  menu_id: string
  text: string
  user_id: string
}

/**
 * Save user feedback to the database for learning
 * This is a simplified version that works with the current schema
 */
export async function saveUserFeedback(feedback: UserFeedback): Promise<void> {
  console.log('Saving user feedback:', feedback)
  
  console.log('User feedback logged:', {
    candidate_id: feedback.candidate_id,
    text: feedback.text,
    user_action: feedback.user_action,
    edited_text: feedback.edited_text,
    menu_id: feedback.menu_id,
    user_id: feedback.user_id
  })
  
  // Save feedback via API endpoint
  try {
    const response = await fetch('http://localhost:3002/api/mlmp/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'save_feedback',
        feedback: {
          candidate_id: feedback.candidate_id,
          user_id: feedback.user_id,
          user_action: feedback.user_action,
          edited_text: feedback.edited_text
        }
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.warn('Failed to save user feedback:', errorData.error)
    } else {
      console.log('User feedback saved successfully')
    }
  } catch (error) {
    console.warn('Error saving feedback:', error)
  }
}

/**
 * Save predictions for all candidates to enable learning
 * This is a simplified version that works with the current schema
 */
export async function saveCandidatePredictions(
  candidates: Candidate[],
  menuId: string,
  userId: string
): Promise<void> {
  console.log(`Saving ${candidates.length} candidate predictions for learning`)

  // Log each prediction for debugging
  candidates.forEach(candidate => {
    console.log('Prediction logged:', {
      pred_id: candidate.id,
      text: candidate.text,
      confidence: candidate.confidence,
      menu_id: menuId,
      user_id: userId
    })
  })

  // Save predictions via API endpoint
  try {
    const response = await fetch('http://localhost:3002/api/mlmp/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'save_predictions',
        candidates: candidates.map(candidate => ({
          id: candidate.id,
          menu_id: menuId,
          text: candidate.text,
          user_id: userId,
          features: candidate.features,
          confidence: candidate.confidence
        }))
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.warn('Failed to save candidate predictions:', errorData.error)
    } else {
      const result = await response.json()
      console.log(`Saved ${result.count} predictions successfully`)
    }
  } catch (error) {
    console.warn('Error saving predictions:', error)
  }
}

/**
 * Check if there's enough new feedback to trigger retraining
 */
export async function shouldRetrainModel(): Promise<boolean> {
  try {
    // Get current learning stats
    const stats = await getLearningStats()
    
    // Check if we have enough labels and if it's time to retrain
    // Retrain every 10 labels
    const shouldRetrain = stats.totalLabels >= 10 && stats.totalLabels % 10 === 0
    
    if (shouldRetrain) {
      console.log(`Retraining triggered: ${stats.totalLabels} total labels (multiple of 10)`)
    }
    
    return shouldRetrain
  } catch (error) {
    console.error('Error checking retrain condition:', error)
    return false
  }
}

/**
 * Trigger model retraining if conditions are met
 */
export async function triggerRetrainingIfNeeded(): Promise<string | null> {
  try {
    const shouldRetrain = await shouldRetrainModel()
    
    if (shouldRetrain) {
      console.log('Triggering model retraining...')
      
      // Call the training API endpoint
      const response = await fetch('http://localhost:3002/api/mlmp/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'train_model'
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Model retraining completed:', result)
        return result.modelVersion
      } else {
        const errorData = await response.json()
        console.error('Failed to trigger retraining:', errorData.error)
        return null
      }
    }

    return null
  } catch (error) {
    console.error('Error triggering retraining:', error)
    return null
  }
}

/**
 * Get learning statistics with comprehensive error handling
 */
export async function getLearningStats(): Promise<{
  totalPredictions: number
  totalLabels: number
  approvedCount: number
  deniedCount: number
  editedCount: number
  lastModelVersion?: string
  pendingRetrain: boolean
}> {
  try {
    // Get learning stats via API endpoint
    const response = await fetch('http://localhost:3002/api/mlmp/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get_stats'
      })
    })

    if (!response.ok) {
      console.warn('Failed to get learning stats:', response.statusText)
      return {
        totalPredictions: 0,
        totalLabels: 0,
        approvedCount: 0,
        deniedCount: 0,
        editedCount: 0,
        pendingRetrain: false
      }
    }

    const stats = await response.json()
    
    // Check if we should retrain (every 10 labels)
    const pendingRetrain = stats.totalLabels >= 10 && stats.totalLabels % 10 === 0

    return {
      totalPredictions: stats.totalPredictions || 0,
      totalLabels: stats.totalLabels || 0,
      approvedCount: stats.labelBreakdown?.approved || 0,
      deniedCount: stats.labelBreakdown?.denied || 0,
      editedCount: stats.labelBreakdown?.edited || 0,
      lastModelVersion: stats.lastModelVersion,
      pendingRetrain
    }
  } catch (error) {
    console.error('Error getting learning stats:', error)
    return {
      totalPredictions: 0,
      totalLabels: 0,
      approvedCount: 0,
      deniedCount: 0,
      editedCount: 0,
      pendingRetrain: false
    }
  }
}