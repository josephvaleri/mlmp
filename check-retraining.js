const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRetrainingStatus() {
  try {
    // Check predictions count
    const { count: predictionsCount } = await supabase
      .from('mlmp_predictions')
      .select('*', { count: 'exact', head: true });
    
    // Check labels count
    const { count: labelsCount } = await supabase
      .from('mlmp_labels')
      .select('*', { count: 'exact', head: true });
    
    // Check model versions count
    const { count: modelsCount } = await supabase
      .from('mlmp_model_versions')
      .select('*', { count: 'exact', head: true });
    
    console.log('=== CURRENT STATUS ===');
    console.log(`Total Predictions: ${predictionsCount || 0}`);
    console.log(`Total Labels: ${labelsCount || 0}`);
    console.log(`Total Model Versions: ${modelsCount || 0}`);
    console.log(`Should retrain (every 10): ${labelsCount >= 10 && labelsCount % 10 === 0}`);
    console.log(`Retraining should have happened: ${Math.floor(labelsCount / 10)} times`);
    console.log('');
    
    // Check if there are predictions with labels
    const { data: labeledPredictions } = await supabase
      .from('mlmp_predictions')
      .select(`
        pred_id,
        mlmp_labels!inner(label)
      `)
      .not('mlmp_labels.label', 'is', null);
    
    console.log(`Predictions with labels: ${labeledPredictions?.length || 0}`);
    
    // Check recent labels
    const { data: recentLabels } = await supabase
      .from('mlmp_labels')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log('\n=== RECENT LABELS ===');
    if (recentLabels && recentLabels.length > 0) {
      recentLabels.forEach((label, index) => {
        console.log(`${index + 1}. ${label.label} - ${label.created_at}`);
      });
    }
    
    // Check if retraining should be triggered
    const shouldRetrain = labelsCount >= 10 && labelsCount % 10 === 0;
    console.log(`\n=== RETRAINING ANALYSIS ===`);
    console.log(`Current labels: ${labelsCount}`);
    console.log(`Should retrain now: ${shouldRetrain}`);
    console.log(`Next retraining at: ${Math.ceil(labelsCount / 10) * 10} labels`);
    
  } catch (error) {
    console.log('Error:', error.message);
  }
}

checkRetrainingStatus();
