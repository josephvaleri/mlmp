import { createServiceClient } from '../supabase'
import { EntreeClassifier, type ModelMetrics, type TrainingData } from './model'

export interface TrainingResult {
  version: string
  metrics: ModelMetrics
  trainingSamples: number
  validationSamples: number
}

/**
 * Prepare training data from database using real user labels
 */
export async function prepareTrainingData(): Promise<{
  trainingData: TrainingData
  validationData: TrainingData
  totalSamples: number
}> {
  const serviceClient = createServiceClient()

  // Get all predictions with their corresponding labels
  const { data: predictionsWithLabels, error: predError } = await serviceClient
    .from('mlmp_predictions')
    .select(`
      pred_id,
      features,
      confidence,
      text,
      mlmp_labels!inner(
        label,
        edited_text
      )
    `)

  if (predError) {
    throw new Error(`Failed to fetch predictions with labels: ${predError.message}`)
  }

  if (!predictionsWithLabels || predictionsWithLabels.length === 0) {
    throw new Error('No training data available')
  }

  // Process predictions and labels using real user feedback
  const trainingSamples: Array<{ features: any; label: number; text: string }> = []

  for (const pred of predictionsWithLabels) {
    // Convert user action to binary label
    let label: number
    if (pred.mlmp_labels.label === 'approve' || pred.mlmp_labels.label === 'edit') {
      label = 1 // Positive (is an entree)
    } else if (pred.mlmp_labels.label === 'deny') {
      label = 0 // Negative (not an entree)
    } else {
      continue // Skip unknown labels
    }

    // Use edited text if available, otherwise use original text
    const finalText = pred.mlmp_labels.edited_text || pred.text

    trainingSamples.push({
      features: pred.features,
      label: label,
      text: finalText
    })
  }

  if (trainingSamples.length === 0) {
    throw new Error('No labeled training samples available')
  }

  console.log(`Prepared ${trainingSamples.length} training samples from user feedback`)
  console.log(`Positive samples: ${trainingSamples.filter(s => s.label === 1).length}`)
  console.log(`Negative samples: ${trainingSamples.filter(s => s.label === 0).length}`)

  // Balance classes (optional - you might want to keep imbalanced data)
  const positiveSamples = trainingSamples.filter(s => s.label === 1)
  const negativeSamples = trainingSamples.filter(s => s.label === 0)
  
  // Use all samples or balance to the smaller class
  const minClassSize = Math.min(positiveSamples.length, negativeSamples.length)
  const balancedSamples = [
    ...positiveSamples.slice(0, minClassSize),
    ...negativeSamples.slice(0, minClassSize)
  ]

  // Shuffle the data
  const shuffledSamples = balancedSamples.sort(() => Math.random() - 0.5)

  // Split into training and validation (80/20)
  const splitIndex = Math.floor(shuffledSamples.length * 0.8)
  const trainingSet = shuffledSamples.slice(0, splitIndex)
  const validationSet = shuffledSamples.slice(splitIndex)

  // Convert to training format
  const trainingData: TrainingData = {
    features: trainingSet.map(s => Object.values(s.features) as number[]),
    labels: trainingSet.map(s => s.label)
  }

  const validationData: TrainingData = {
    features: validationSet.map(s => Object.values(s.features) as number[]),
    labels: validationSet.map(s => s.label)
  }

  return {
    trainingData,
    validationData,
    totalSamples: shuffledSamples.length
  }
}

/**
 * Train a new model and save it
 */
export async function trainNewModel(): Promise<TrainingResult> {
  console.log('Starting model training...')

  // Prepare training data
  const { trainingData, validationData } = await prepareTrainingData()
  
  console.log(`Training with ${trainingData.features.length} samples, validating with ${validationData.features.length} samples`)

  // Create and train model
  const classifier = new EntreeClassifier()
  const metrics = await classifier.train(trainingData, validationData, 50)

  // Save model to storage
  const modelData = await classifier.saveModel()
  const version = `v${new Date().toISOString().split('T')[0]}-${Date.now()}`
  
  // Upload model to Supabase Storage
  const serviceClient = createServiceClient()
  const modelPath = `models/${version}/model.json`
  
  // Convert model data to JSON string
  const modelJson = JSON.stringify({
    modelTopology: modelData.modelTopology,
    weightSpecs: modelData.weightSpecs,
    weightData: Array.from(new Uint8Array(modelData.weightData))
  })

  const { error: uploadError } = await serviceClient.storage
    .from('mlmp')
    .upload(modelPath, modelJson, {
      contentType: 'application/json',
      upsert: true
    })

  if (uploadError) {
    throw new Error(`Failed to upload model: ${uploadError.message}`)
  }

  // Save model version to database
  const { error: dbError } = await serviceClient
    .from('mlmp_model_versions')
    .insert({
      version,
      metrics,
      storage_path: modelPath
    })

  if (dbError) {
    throw new Error(`Failed to save model version: ${dbError.message}`)
  }

  // Clean up
  classifier.dispose()

  console.log(`Model training completed. Version: ${version}`)
  console.log(`Metrics: Precision=${metrics.precision}, Recall=${metrics.recall}, F1=${metrics.f1}`)

  return {
    version,
    metrics,
    trainingSamples: trainingData.features.length,
    validationSamples: validationData.features.length
  }
}

/**
 * Load the latest trained model
 */
export async function loadLatestModel(): Promise<EntreeClassifier | null> {
  try {
    // Try to use service client if available (server-side)
    const serviceClient = createServiceClient()

    // Get the latest model version
    const { data: latestModel, error } = await serviceClient
      .from('mlmp_model_versions')
      .select('version, storage_path')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !latestModel) {
      console.log('No trained model found, using heuristic approach')
      return null
    }

    // Download model from storage
    const { data: modelJson, error: downloadError } = await serviceClient.storage
      .from('mlmp')
      .download(latestModel.storage_path)

    if (downloadError) {
      console.log('Failed to download model, using heuristic approach')
      return null
    }

    // Parse model data
    const modelText = await modelJson.text()
    const modelData = JSON.parse(modelText)
    
    // Convert weight data back to ArrayBuffer
    const weightData = new Uint8Array(modelData.weightData).buffer

    // Load model
    const classifier = new EntreeClassifier()
    await classifier.loadModel({
      modelTopology: modelData.modelTopology,
      weightSpecs: modelData.weightSpecs,
      weightData
    })

    return classifier
  } catch (error) {
    // If service client is not available (browser environment), return null
    console.log('ML model not available, using heuristic confidence:', error)
    return null
  }
}

/**
 * Get training statistics
 */
export async function getTrainingStats(): Promise<{
  totalPredictions: number
  totalLabels: number
  approvedCount: number
  deniedCount: number
  editedCount: number
  latestModelVersion?: string
}> {
  const serviceClient = createServiceClient()

  // Get counts
  const [predictionsResult, labelsResult, modelResult] = await Promise.all([
    serviceClient.from('mlmp_predictions').select('pred_id', { count: 'exact' }),
    serviceClient.from('mlmp_labels').select('label', { count: 'exact' }),
    serviceClient.from('mlmp_model_versions').select('version').order('created_at', { ascending: false }).limit(1).single()
  ])

  const totalPredictions = predictionsResult.count || 0
  const totalLabels = labelsResult.count || 0

  // Count by label type
  const { data: labelCounts } = await serviceClient
    .from('mlmp_labels')
    .select('label')

  const approvedCount = labelCounts?.filter(l => l.label === 'approve').length || 0
  const deniedCount = labelCounts?.filter(l => l.label === 'deny').length || 0
  const editedCount = labelCounts?.filter(l => l.label === 'edit').length || 0

  return {
    totalPredictions,
    totalLabels,
    approvedCount,
    deniedCount,
    editedCount,
    latestModelVersion: modelResult.data?.version
  }
}