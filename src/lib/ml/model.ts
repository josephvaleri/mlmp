import * as tf from '@tensorflow/tfjs'
import { createCombinedFeatureVector, getFeatureVectorDimensions } from './features'
import type { CandidateFeatures } from '../candidates/extractCandidates'

export interface ModelMetrics {
  precision: number
  recall: number
  f1: number
  accuracy: number
}

export interface TrainingData {
  features: number[][]
  labels: number[]
}

export class EntreeClassifier {
  private model: tf.LayersModel | null = null
  private isLoaded = false

  /**
   * Create a new model architecture
   */
  createModel(): tf.LayersModel {
    const inputDim = getFeatureVectorDimensions()
    
    const model = tf.sequential({
      layers: [
        // Input layer
        tf.layers.dense({
          inputShape: [inputDim],
          units: 64,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
        }),
        
        // Dropout for regularization
        tf.layers.dropout({ rate: 0.3 }),
        
        // Hidden layer
        tf.layers.dense({
          units: 32,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
        }),
        
        // Dropout for regularization
        tf.layers.dropout({ rate: 0.2 }),
        
        // Output layer (binary classification)
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid'
        })
      ]
    })

    // Compile the model
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy', 'precision', 'recall']
    })

    return model
  }

  /**
   * Train the model on provided data
   */
  async train(
    trainingData: TrainingData,
    validationData?: TrainingData,
    epochs: number = 50
  ): Promise<ModelMetrics> {
    if (!this.model) {
      this.model = this.createModel()
    }

    const { features, labels } = trainingData
    const xs = tf.tensor2d(features)
    const ys = tf.tensor2d(labels, [labels.length, 1])

    let validationXs: tf.Tensor2D | undefined
    let validationYs: tf.Tensor2D | undefined

    if (validationData) {
      validationXs = tf.tensor2d(validationData.features)
      validationYs = tf.tensor2d(validationData.labels, [validationData.labels.length, 1])
    }

    // Train the model
    const history = await this.model.fit(xs, ys, {
      epochs,
      batchSize: 32,
      validationData: validationData ? [validationXs!, validationYs!] : undefined,
      validationSplit: validationData ? undefined : 0.2,
      verbose: 1,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch + 1}: loss=${logs?.loss?.toFixed(4)}, accuracy=${logs?.acc?.toFixed(4)}`)
        }
      }
    })

    // Calculate metrics
    const metrics = this.calculateMetrics(history)

    // Clean up tensors
    xs.dispose()
    ys.dispose()
    if (validationXs) validationXs.dispose()
    if (validationYs) validationYs.dispose()

    this.isLoaded = true
    return metrics
  }

  /**
   * Predict probability that a candidate is an entree name
   */
  async predict(features: CandidateFeatures, text: string): Promise<number> {
    if (!this.model || !this.isLoaded) {
      throw new Error('Model not loaded. Train or load a model first.')
    }

    const featureVector = createCombinedFeatureVector(features, text)
    const xs = tf.tensor2d([featureVector])
    
    const prediction = this.model.predict(xs) as tf.Tensor
    const probability = await prediction.data()
    
    xs.dispose()
    prediction.dispose()
    
    return probability[0]
  }

  /**
   * Batch predict multiple candidates
   */
  async batchPredict(
    candidates: Array<{ features: CandidateFeatures; text: string }>
  ): Promise<number[]> {
    if (!this.model || !this.isLoaded) {
      throw new Error('Model not loaded. Train or load a model first.')
    }

    const featureVectors = candidates.map(candidate => 
      createCombinedFeatureVector(candidate.features, candidate.text)
    )
    
    const xs = tf.tensor2d(featureVectors)
    const predictions = this.model.predict(xs) as tf.Tensor
    const probabilities = await predictions.data()
    
    xs.dispose()
    predictions.dispose()
    
    return Array.from(probabilities)
  }

  /**
   * Save model to JSON format
   */
  async saveModel(): Promise<{ modelTopology: any; weightSpecs: any; weightData: ArrayBuffer }> {
    if (!this.model) {
      throw new Error('No model to save')
    }

    // Simplified model save - just return empty structure for now
    return {
      modelTopology: {},
      weightSpecs: [],
      weightData: new ArrayBuffer(0)
    }
  }

  /**
   * Load model from JSON format
   */
  async loadModel(modelData: { modelTopology: any; weightSpecs: any; weightData: ArrayBuffer }): Promise<void> {
    this.model = await tf.loadLayersModel(tf.io.fromMemory({
      modelTopology: modelData.modelTopology,
      weightSpecs: modelData.weightSpecs,
      weightData: modelData.weightData
    }))
    
    this.isLoaded = true
  }

  /**
   * Check if model is loaded and ready for predictions
   */
  isModelLoaded(): boolean {
    return this.isLoaded && this.model !== null
  }

  /**
   * Get model summary
   */
  getModelSummary(): string {
    if (!this.model) {
      return 'No model loaded'
    }
    
    this.model.summary()
    return 'Model summary printed to console'
  }

  /**
   * Calculate metrics from training history
   */
  private calculateMetrics(history: tf.History): ModelMetrics {
    const epochs = history.epoch.length
    const lastEpoch = epochs - 1

    // Get the last epoch metrics
    const accuracy = history.history.acc ? Number(history.history.acc[lastEpoch]) : 0
    const precision = history.history.precision ? Number(history.history.precision[lastEpoch]) : 0
    const recall = history.history.recall ? Number(history.history.recall[lastEpoch]) : 0
    
    // Calculate F1 score
    const f1 = precision && recall ? 2 * (precision * recall) / (precision + recall) : 0

    return {
      accuracy: Number(accuracy.toFixed(4)),
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4))
    }
  }

  /**
   * Dispose of the model and free memory
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose()
      this.model = null
      this.isLoaded = false
    }
  }
}
