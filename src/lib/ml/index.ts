export { EntreeClassifier } from './model'
export { trainNewModel, loadLatestModel, prepareTrainingData, getTrainingStats } from './train'
export { 
  featuresToVector, 
  createCharacterEmbeddings, 
  createWordEmbeddings, 
  createCombinedFeatureVector,
  getFeatureVectorDimensions,
  COMMON_VOCABULARY 
} from './features'
export type { ModelMetrics, TrainingData } from './model'
export type { TrainingResult } from './train'
