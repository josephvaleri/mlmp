// Test script to verify trained model loading
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testModelLoading() {
  console.log('🔍 Testing trained model loading...');
  
  try {
    // Create Supabase client
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Check if we have any trained models
    const { data: models, error } = await supabase
      .from('mlmp_model_versions')
      .select('version, metrics, created_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Error fetching models:', error);
      return;
    }
    
    console.log(`📊 Found ${models.length} trained models:`);
    models.forEach((model, index) => {
      console.log(`  ${index + 1}. Version: ${model.version}`);
      console.log(`     Created: ${model.created_at}`);
      console.log(`     Has weights: ${!!model.metrics?.feature_weights}`);
      if (model.metrics?.feature_weights) {
        console.log(`     Weight keys: ${Object.keys(model.metrics.feature_weights).length}`);
        console.log(`     Sample weights:`, Object.entries(model.metrics.feature_weights).slice(0, 3));
      }
    });
    
    if (models.length > 0) {
      const latestModel = models[0];
      console.log('\n✅ Latest model details:');
      console.log(`   Version: ${latestModel.version}`);
      console.log(`   Feature weights:`, latestModel.metrics?.feature_weights);
    } else {
      console.log('\n❌ No trained models found in database');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testModelLoading();
