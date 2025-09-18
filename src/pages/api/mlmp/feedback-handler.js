// Import Supabase client - we'll need to handle this differently
// since the TypeScript files need to be compiled
const { createClient } = require('@supabase/supabase-js');

function createServiceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function handleFeedback(req, res) {
  try {
    const { action, candidates, feedback } = req.body;

    if (action === 'save_predictions' && candidates) {
      // Save candidate predictions
      const serviceSupabase = createServiceClient();
      
      const predictions = candidates.map((candidate) => ({
        pred_id: candidate.id,
        menu_id: candidate.menu_id,
        text: candidate.text,
        user_id: candidate.user_id,
        model_version: 'heuristic',
        features: candidate.features,
        confidence: candidate.confidence
      }));

      const { error } = await serviceSupabase
        .from('mlmp_predictions')
        .insert(predictions);

      if (error) {
        console.error('Failed to save predictions:', error);
        return res.status(500).json({ error: 'Failed to save predictions' });
      }

      return res.json({ success: true, count: predictions.length });

    } else if (action === 'save_feedback' && feedback) {
      // Save user feedback
      const serviceSupabase = createServiceClient();
      
      const { error } = await serviceSupabase
        .from('mlmp_labels')
        .insert({
          pred_id: feedback.candidate_id,
          user_id: feedback.user_id,
          label: feedback.user_action === 'approve' ? 'approve' :
                 feedback.user_action === 'deny' ? 'deny' : 'edit',
          edited_text: feedback.edited_text
        });

      if (error) {
        console.error('Failed to save feedback:', error);
        return res.status(500).json({ error: 'Failed to save feedback' });
      }

      return res.json({ success: true });

    } else if (action === 'get_stats') {
      // Get learning statistics
      const serviceSupabase = createServiceClient();
      
      // Get predictions count
      const predictionsResult = await serviceSupabase
        .from('mlmp_predictions')
        .select('pred_id', { count: 'exact' });
      const totalPredictions = predictionsResult.count || 0;

      // Get labels count
      const labelsResult = await serviceSupabase
        .from('mlmp_labels')
        .select('label', { count: 'exact' });
      const totalLabels = labelsResult.count || 0;

      // Get latest model version
      const modelResult = await serviceSupabase
        .from('mlmp_model_versions')
        .select('version')
        .order('created_at', { ascending: false })
        .limit(1);
      const lastModelVersion = modelResult.data?.[0]?.version || 'heuristic';

      // Get label breakdown
      const labelBreakdownResult = await serviceSupabase
        .from('mlmp_labels')
        .select('label');
      
      const labelBreakdown = {
        approved: 0,
        denied: 0,
        edited: 0
      };
      
      if (labelBreakdownResult.data) {
        labelBreakdownResult.data.forEach(label => {
          if (label.label === 'approve') labelBreakdown.approved++;
          else if (label.label === 'deny') labelBreakdown.denied++;
          else if (label.label === 'edit') labelBreakdown.edited++;
        });
      }

      return res.json({
        totalPredictions,
        totalLabels,
        lastModelVersion,
        labelBreakdown
      });

    } else {
      return res.status(400).json({ error: 'Invalid action or missing data' });
    }

  } catch (error) {
    console.error('Feedback handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { handleFeedback };
