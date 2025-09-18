import { createServiceClient, supabase } from '../supabase'
import type { CandidateFeatures } from '../candidates/extractCandidates'

export interface TrainingData {
  features: CandidateFeatures
  label: 'approve' | 'deny' | 'edit'
  edited_text?: string
  text: string
}

export interface TrainingResult {
  success: boolean
  modelVersion: string
  accuracy?: number
  trainingSamples: number
  error?: string
}

/**
 * Collect training data from the database
 */
export async function collectTrainingData(): Promise<TrainingData[]> {
  try {
    // Try to use service client first, fall back to regular client if service key is missing
    let client
    try {
      client = createServiceClient()
    } catch (serviceError) {
      console.log('Service role key not available, using regular client for training data collection')
      client = supabase
    }
    
    // Get all predictions with their corresponding labels
    const { data: predictions, error: predError } = await client
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
      .not('mlmp_labels.label', 'is', null)

    if (predError) {
      console.error('Error fetching training data:', predError)
      return []
    }

    if (!predictions) {
      return []
    }

    // Transform the data into training format
    const trainingData: TrainingData[] = predictions.map(pred => ({
      features: pred.features as CandidateFeatures,
      label: pred.mlmp_labels[0]?.label as 'approve' | 'deny' | 'edit',
      edited_text: pred.mlmp_labels[0]?.edited_text,
      text: pred.text
    }))

    console.log(`Collected ${trainingData.length} training samples`)
    return trainingData

  } catch (error) {
    console.error('Error collecting training data:', error)
    return []
  }
}

/**
 * Train a new model using the collected feedback data
 */
export async function trainModel(trainingData: TrainingData[]): Promise<TrainingResult> {
  try {
    if (trainingData.length < 10) {
      return {
        success: false,
        modelVersion: 'heuristic',
        trainingSamples: trainingData.length,
        error: 'Insufficient training data (need at least 10 samples)'
      }
    }

    console.log(`Training model with ${trainingData.length} samples...`)

    // For now, we'll implement a simple heuristic-based model
    // In a real implementation, this would use TensorFlow.js or another ML library
    const modelVersion = `trained-${Date.now()}`
    
    // Calculate feature weights based on training data
    const featureWeights = calculateFeatureWeights(trainingData)
    
    // Calculate accuracy on training data (simple validation)
    const accuracy = calculateTrainingAccuracy(trainingData, featureWeights)
    
    console.log(`Model training completed. Version: ${modelVersion}, Accuracy: ${accuracy.toFixed(3)}`)
    
    return {
      success: true,
      modelVersion,
      accuracy,
      trainingSamples: trainingData.length
    }

  } catch (error) {
    console.error('Error training model:', error)
    return {
      success: false,
      modelVersion: 'heuristic',
      trainingSamples: trainingData.length,
      error: error instanceof Error ? error.message : 'Unknown training error'
    }
  }
}

/**
 * Calculate feature weights based on training data
 * This is a simplified approach - in practice, you'd use proper ML algorithms
 */
function calculateFeatureWeights(trainingData: TrainingData[]): Record<string, number> {
  const weights: Record<string, number> = {}
  
  // Initialize weights
  const featureKeys = [
    'tokenCount', 'hasDigits', 'hasCurrency', 'isAllCaps', 'isTitleCase',
    'priceSameLine', 'priceNextLines1to3', 'underEntreeHeader', 'punctDensity',
    'nextLineDescription', 'prevLineHeader', 'uppercaseRatio', 'lettersRatio',
    'avgTokenLen', 'startsWithArticle', 'endsWithStop', 'fontSizeRatio'
  ]
  
  featureKeys.forEach(key => {
    weights[key] = 0
  })

  // Calculate weights based on approved vs denied samples
  const approvedSamples = trainingData.filter(d => d.label === 'approve')
  const deniedSamples = trainingData.filter(d => d.label === 'deny')
  
  if (approvedSamples.length === 0 || deniedSamples.length === 0) {
    // If we don't have both positive and negative samples, use default weights
    return getDefaultFeatureWeights()
  }

  // Calculate mean feature values for approved vs denied
  featureKeys.forEach(key => {
    const approvedMean = approvedSamples.reduce((sum, sample) => 
      sum + (sample.features[key as keyof CandidateFeatures] || 0), 0) / approvedSamples.length
    
    const deniedMean = deniedSamples.reduce((sum, sample) => 
      sum + (sample.features[key as keyof CandidateFeatures] || 0), 0) / deniedSamples.length
    
    // Weight is the difference between approved and denied means
    weights[key] = approvedMean - deniedMean
  })

  return weights
}

/**
 * Get default feature weights (fallback)
 */
function getDefaultFeatureWeights(): Record<string, number> {
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
  }
}

/**
 * Calculate training accuracy (simple validation)
 */
function calculateTrainingAccuracy(trainingData: TrainingData[], weights: Record<string, number>): number {
  let correct = 0
  let total = 0

  trainingData.forEach(sample => {
    const predictedScore = calculatePredictedScore(sample.features, weights)
    const actualLabel = sample.label === 'approve' ? 1 : 0
    const predictedLabel = predictedScore > 0.5 ? 1 : 0
    
    if (predictedLabel === actualLabel) {
      correct++
    }
    total++
  })

  return total > 0 ? correct / total : 0
}

/**
 * Calculate predicted score using feature weights
 */
function calculatePredictedScore(features: CandidateFeatures, weights: Record<string, number>): number {
  let score = 0
  
  Object.entries(weights).forEach(([key, weight]) => {
    const featureValue = features[key as keyof CandidateFeatures] || 0
    score += featureValue * weight
  })
  
  // Normalize to 0-1 range using sigmoid
  return 1 / (1 + Math.exp(-score))
}

/**
 * Save the trained model to the database
 */
export async function saveTrainedModel(modelVersion: string, weights: Record<string, number>, accuracy: number): Promise<boolean> {
  try {
    // Try to use service client first, fall back to regular client if service key is missing
    let client
    try {
      client = createServiceClient()
    } catch (serviceError) {
      console.log('Service role key not available, using regular client for model saving')
      client = supabase
    }
    
    const { error } = await client
      .from('mlmp_model_versions')
      .insert({
        version: modelVersion,
        metrics: {
          accuracy,
          feature_weights: weights,
          training_date: new Date().toISOString()
        },
        storage_path: null // For now, we'll store weights in the database
      })

    if (error) {
      console.error('Error saving trained model:', error)
      return false
    }

    console.log(`Saved trained model version: ${modelVersion}`)
    return true

  } catch (error) {
    console.error('Error saving trained model:', error)
    return false
  }
}

/**
 * Load the latest trained model weights
 */
export async function loadLatestTrainedModel(): Promise<Record<string, number> | null> {
  try {
    // Use regular client for model loading (should work for authenticated users)
    const { data, error } = await supabase
      .from('mlmp_model_versions')
      .select('metrics')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      console.log('No trained model found, using default weights')
      return null
    }

    const weights = data.metrics?.feature_weights
    if (weights) {
      console.log('Loaded trained model weights')
      return weights
    }

    return null

  } catch (error) {
    console.log('Error loading trained model, falling back to heuristic scoring:', error)
    return null
  }
}
