// Import the training functions - we'll implement them inline since TypeScript imports don't work in JS
const { createClient } = require('@supabase/supabase-js');

function createServiceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function collectTrainingData() {
  try {
    const supabase = createServiceClient();
    
    // Get all predictions with their corresponding labels
    const { data: predictions, error: predError } = await supabase
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

    if (predError) {
      console.error('Error fetching training data:', predError);
      return [];
    }

    if (!predictions) {
      return [];
    }

    // Transform the data into training format
    const trainingData = predictions.map(pred => ({
      features: pred.features,
      label: pred.mlmp_labels.label,
      edited_text: pred.mlmp_labels.edited_text,
      text: pred.text
    }));

    console.log(`Collected ${trainingData.length} training samples`);
    return trainingData;

  } catch (error) {
    console.error('Error collecting training data:', error);
    return [];
  }
}

async function trainModel(trainingData) {
  try {
    if (trainingData.length < 10) {
      return {
        success: false,
        modelVersion: 'heuristic',
        trainingSamples: trainingData.length,
        error: 'Insufficient training data (need at least 10 samples)'
      };
    }

    console.log(`Training model with ${trainingData.length} samples...`);

    // For now, we'll implement a simple heuristic-based model
    const modelVersion = `trained-${Date.now()}`;
    
    // Calculate feature weights based on training data
    const featureWeights = calculateFeatureWeights(trainingData);
    
    // Calculate accuracy on training data (simple validation)
    const accuracy = calculateTrainingAccuracy(trainingData, featureWeights);
    
    console.log(`Model training completed. Version: ${modelVersion}, Accuracy: ${accuracy.toFixed(3)}`);
    
    return {
      success: true,
      modelVersion,
      accuracy,
      trainingSamples: trainingData.length
    };

  } catch (error) {
    console.error('Error training model:', error);
    return {
      success: false,
      modelVersion: 'heuristic',
      trainingSamples: trainingData.length,
      error: error instanceof Error ? error.message : 'Unknown training error'
    };
  }
}

async function saveTrainedModel(modelVersion, weights, accuracy) {
  try {
    const supabase = createServiceClient();
    
    const { error } = await supabase
      .from('mlmp_model_versions')
      .insert({
        version: modelVersion,
        metrics: {
          accuracy,
          feature_weights: weights,
          training_date: new Date().toISOString()
        },
        storage_path: null
      });

    if (error) {
      console.error('Error saving trained model:', error);
      return false;
    }

    console.log(`Saved trained model version: ${modelVersion}`);
    return true;

  } catch (error) {
    console.error('Error saving trained model:', error);
    return false;
  }
}

async function handleTraining(req, res) {
  try {
    const { action } = req.body;

    if (action === 'train_model') {
      console.log('Starting model training...');
      
      // Collect training data from the database
      const trainingData = await collectTrainingData();
      
      if (trainingData.length === 0) {
        return res.status(400).json({ 
          error: 'No training data available',
          trainingSamples: 0
        });
      }

      // Train the model
      const result = await trainModel(trainingData);
      
      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          trainingSamples: result.trainingSamples
        });
      }

      // Save the trained model
      const weights = calculateFeatureWeights(trainingData);
      const saved = await saveTrainedModel(result.modelVersion, weights, result.accuracy);
      
      if (!saved) {
        return res.status(500).json({
          error: 'Failed to save trained model',
          trainingSamples: result.trainingSamples
        });
      }

      console.log(`Model training completed successfully. Version: ${result.modelVersion}`);
      
      return res.json({
        success: true,
        modelVersion: result.modelVersion,
        accuracy: result.accuracy,
        trainingSamples: result.trainingSamples
      });

    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Training handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper function to calculate feature weights (copied from training.ts)
function calculateFeatureWeights(trainingData) {
  const weights = {};
  
  // Initialize weights
  const featureKeys = [
    'tokenCount', 'hasDigits', 'hasCurrency', 'isAllCaps', 'isTitleCase',
    'priceSameLine', 'priceNextLines1to3', 'underEntreeHeader', 'punctDensity',
    'nextLineDescription', 'prevLineHeader', 'uppercaseRatio', 'lettersRatio',
    'avgTokenLen', 'startsWithArticle', 'endsWithStop', 'fontSizeRatio'
  ];
  
  featureKeys.forEach(key => {
    weights[key] = 0;
  });

  // Calculate weights based on approved vs denied samples
  const approvedSamples = trainingData.filter(d => d.label === 'approve');
  const deniedSamples = trainingData.filter(d => d.label === 'deny');
  
  if (approvedSamples.length === 0 || deniedSamples.length === 0) {
    // If we don't have both positive and negative samples, use default weights
    return getDefaultFeatureWeights();
  }

  // Calculate mean feature values for approved vs denied
  featureKeys.forEach(key => {
    const approvedMean = approvedSamples.reduce((sum, sample) => 
      sum + (sample.features[key] || 0), 0) / approvedSamples.length;
    
    const deniedMean = deniedSamples.reduce((sum, sample) => 
      sum + (sample.features[key] || 0), 0) / deniedSamples.length;
    
    // Weight is the difference between approved and denied means
    weights[key] = approvedMean - deniedMean;
  });

  return weights;
}

function getDefaultFeatureWeights() {
  return {
    tokenCount: 0.1,
    hasDigits: -0.5,
    hasCurrency: -0.3,
    isAllCaps: 0.8,
    isTitleCase: 0.6,
    priceSameLine: 0.7,
    priceNextLines1to3: 0.5,
    underEntreeHeader: 0.9,
    punctDensity: -0.2,
    nextLineDescription: -0.3,
    prevLineHeader: 0.4,
    uppercaseRatio: 0.3,
    lettersRatio: 0.4,
    avgTokenLen: 0.2,
    startsWithArticle: -0.1,
    endsWithStop: -0.2,
    fontSizeRatio: 0.6
  };
}

function calculateTrainingAccuracy(trainingData, featureWeights) {
  if (trainingData.length === 0) return 0;
  
  let correctPredictions = 0;
  
  trainingData.forEach(sample => {
    // Calculate confidence score using the trained weights
    let score = 0.1; // Base score
    
    Object.entries(featureWeights).forEach(([key, weight]) => {
      const featureValue = sample.features[key] || 0;
      score += featureValue * weight;
    });
    
    // Apply sigmoid to get probability
    const probability = 1 / (1 + Math.exp(-score));
    
    // Predict based on probability threshold
    const predicted = probability > 0.5 ? 'approve' : 'deny';
    
    // Check if prediction matches actual label
    if (predicted === sample.label) {
      correctPredictions++;
    }
  });
  
  return correctPredictions / trainingData.length;
}

module.exports = { handleTraining };
