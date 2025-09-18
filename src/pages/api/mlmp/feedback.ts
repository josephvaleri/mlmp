import { NextApiRequest, NextApiResponse } from 'next'
import { createServiceClient } from '../../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { action, candidates, feedback } = req.body

    if (action === 'save_predictions' && candidates) {
      // Save candidate predictions
      const serviceSupabase = createServiceClient()
      
      const predictions = candidates.map((candidate: any) => ({
        pred_id: candidate.id,
        menu_id: candidate.menu_id,
        text: candidate.text,
        user_id: candidate.user_id,
        model_version: 'heuristic',
        features: candidate.features,
        confidence: candidate.confidence
      }))

      const { error } = await serviceSupabase
        .from('mlmp_predictions')
        .insert(predictions)

      if (error) {
        console.error('Failed to save predictions:', error)
        return res.status(500).json({ error: 'Failed to save predictions' })
      }

      return res.status(200).json({ success: true, count: predictions.length })
    }

    if (action === 'save_feedback' && feedback) {
      // Save user feedback
      const serviceSupabase = createServiceClient()
      
      const { error } = await serviceSupabase
        .from('mlmp_labels')
        .insert({
          pred_id: feedback.candidate_id,
          user_id: feedback.user_id,
          label: feedback.user_action === 'approve' ? 'approve' : 
                 feedback.user_action === 'deny' ? 'deny' : 'edit',
          edited_text: feedback.edited_text
        })

      if (error) {
        console.error('Failed to save feedback:', error)
        return res.status(500).json({ error: 'Failed to save feedback' })
      }

      return res.status(200).json({ success: true })
    }

    if (action === 'get_stats') {
      // Get learning statistics
      const serviceSupabase = createServiceClient()
      
      // Get predictions count
      const predictionsResult = await serviceSupabase
        .from('mlmp_predictions')
        .select('pred_id', { count: 'exact' })
      const totalPredictions = predictionsResult.count || 0

      // Get labels count
      const labelsResult = await serviceSupabase
        .from('mlmp_labels')
        .select('label', { count: 'exact' })
      const totalLabels = labelsResult.count || 0

      // Get latest model version
      let lastModelVersion: string | undefined
      try {
        const modelResult = await serviceSupabase
          .from('mlmp_model_versions')
          .select('version')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        lastModelVersion = modelResult.data?.version
      } catch (error) {
        console.warn('Failed to get latest model version:', error)
      }

      // Get label breakdown
      let approvedCount = 0
      let deniedCount = 0
      let editedCount = 0
      try {
        const { data: labels } = await serviceSupabase
          .from('mlmp_labels')
          .select('label')
        
        if (labels) {
          approvedCount = labels.filter(l => l.label === 'approve').length
          deniedCount = labels.filter(l => l.label === 'deny').length
          editedCount = labels.filter(l => l.label === 'edit').length
        }
      } catch (error) {
        console.warn('Failed to get label breakdown:', error)
      }

      return res.status(200).json({
        totalPredictions,
        totalLabels,
        lastModelVersion,
        labelBreakdown: {
          approved: approvedCount,
          denied: deniedCount,
          edited: editedCount
        }
      })
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
