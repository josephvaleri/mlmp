// Test script to verify frontend can load trained model
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testFrontendModelLoading() {
  console.log('🔍 Testing frontend model loading...');
  
  try {
    // Create Supabase client (same as frontend)
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Test loading the latest trained model (same query as frontend)
    const { data, error } = await supabase
      .from('mlmp_model_versions')
      .select('metrics')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.error('❌ Error loading model:', error);
      console.log('This suggests RLS policies might be blocking access');
      return;
    }
    
    if (!data) {
      console.log('❌ No trained model found');
      return;
    }
    
    const weights = data.metrics?.feature_weights;
    if (weights) {
      console.log('✅ Successfully loaded trained model weights');
      console.log(`   Weight keys: ${Object.keys(weights).length}`);
      console.log(`   Sample weights:`, Object.entries(weights).slice(0, 3));
    } else {
      console.log('❌ Model found but no weights in metrics');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testFrontendModelLoading();
