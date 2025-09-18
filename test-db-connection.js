const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('=== DATABASE CONNECTION TEST ===');
console.log('URL exists:', !!supabaseUrl);
console.log('Key exists:', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  try {
    // Check model versions
    const { data: models, error: modelError } = await supabase
      .from('mlmp_model_versions')
      .select('*')
      .order('created_at', { ascending: false });
    
    console.log('\n=== TRAINED MODELS ===');
    if (modelError) {
      console.log('Error fetching models:', modelError.message);
    } else if (models && models.length > 0) {
      models.forEach((model, index) => {
        console.log(`Model ${index + 1}:`);
        console.log(`  Version: ${model.version}`);
        console.log(`  Created: ${model.created_at}`);
        console.log(`  Accuracy: ${model.metrics?.accuracy || 'N/A'}`);
        console.log(`  Has weights: ${model.metrics?.feature_weights ? 'Yes' : 'No'}`);
        console.log('');
      });
    } else {
      console.log('No trained models found');
    }

    // Check learning stats
    const { count: predictionsCount } = await supabase
      .from('mlmp_predictions')
      .select('*', { count: 'exact', head: true });
    
    const { count: labelsCount } = await supabase
      .from('mlmp_labels')
      .select('*', { count: 'exact', head: true });
    
    console.log('=== LEARNING STATISTICS ===');
    console.log(`Total Predictions: ${predictionsCount || 0}`);
    console.log(`Total Labels: ${labelsCount || 0}`);
    console.log(`Should retrain (every 10): ${labelsCount >= 10 && labelsCount % 10 === 0}`);
    
    // Check for labeled predictions
    const { data: labeledPredictions } = await supabase
      .from('mlmp_predictions')
      .select(`
        pred_id,
        mlmp_labels!inner(label)
      `)
      .not('mlmp_labels.label', 'is', null);
    
    console.log(`Predictions with labels: ${labeledPredictions?.length || 0}`);
    
  } catch (error) {
    console.log('Database error:', error.message);
  }
}

checkDatabase();
