const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing Supabase environment variables');
  process.exit(1);
}

// Use service key if available, otherwise fall back to anon key
const supabase = createClient(supabaseUrl, serviceKey || supabaseKey);

async function forceModelBuild() {
  try {
    console.log('=== FORCING MODEL BUILD ===');
    
    // Check current stats
    const { count: predictionsCount } = await supabase
      .from('mlmp_predictions')
      .select('*', { count: 'exact', head: true });
    
    const { count: labelsCount } = await supabase
      .from('mlmp_labels')
      .select('*', { count: 'exact', head: true });
    
    console.log(`Current stats: ${predictionsCount} predictions, ${labelsCount} labels`);
    
    if (labelsCount < 10) {
      console.log('❌ Not enough labels for training (need at least 10)');
      return;
    }
    
    // Check if there are predictions with labels
    const { data: labeledPredictions } = await supabase
      .from('mlmp_predictions')
      .select(`
        pred_id,
        features,
        text,
        mlmp_labels!inner(
          label,
          edited_text
        )
      `)
      .not('mlmp_labels.label', 'is', null);
    
    console.log(`Found ${labeledPredictions?.length || 0} predictions with labels`);
    
    if (!labeledPredictions || labeledPredictions.length === 0) {
      console.log('❌ No predictions with labels found');
      return;
    }
    
    // Call the training API
    console.log('🚀 Calling training API...');
    const response = await fetch('http://localhost:3002/api/mlmp/train', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'train_model'
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Training completed successfully!');
      console.log(`Model version: ${result.modelVersion}`);
      console.log(`Accuracy: ${result.accuracy}`);
      console.log(`Training samples: ${result.trainingSamples}`);
    } else {
      const errorData = await response.json();
      console.log('❌ Training failed:', errorData.error);
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

forceModelBuild();
