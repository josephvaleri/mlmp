import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '../../../lib/supabase'
import { trainNewModel } from '../../../lib/ml/train'

export async function POST(request: NextRequest) {
  try {
    // Check for admin authorization
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      )
    }

    const serviceClient = createServiceClient()
    const token = authHeader.substring(7)

    try {
      const { data: { user } } = await serviceClient.auth.getUser(token)
      if (!user) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        )
      }

      // TODO: Add admin role check here
      // For now, allow any authenticated user to train
      console.log(`Training request from user: ${user.id}`)

    } catch (authError) {
      return NextResponse.json(
        { error: 'Invalid authorization token' },
        { status: 401 }
      )
    }

    // Check if there's enough training data
    const { data: labelCount, error: countError } = await serviceClient
      .from('mlmp_labels')
      .select('label_id', { count: 'exact' })

    if (countError) {
      throw new Error(`Failed to check training data: ${countError.message}`)
    }

    const totalLabels = labelCount?.length || 0
    if (totalLabels < 50) {
      return NextResponse.json(
        { 
          error: 'Insufficient training data',
          message: `At least 50 labeled samples are required. Currently have ${totalLabels}.`
        },
        { status: 400 }
      )
    }

    // Start training
    console.log('Starting model training...')
    const trainingResult = await trainNewModel()

    return NextResponse.json({
      success: true,
      version: trainingResult.version,
      metrics: trainingResult.metrics,
      training_samples: trainingResult.trainingSamples,
      validation_samples: trainingResult.validationSamples
    })

  } catch (error) {
    console.error('Training API Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Training failed' },
      { status: 500 }
    )
  }
}

// GET endpoint to check training status and get latest model info
export async function GET(_request: NextRequest) {
  try {
    const serviceClient = createServiceClient()

    // Get latest model version
    const { data: latestModel, error: modelError } = await serviceClient
      .from('mlmp_model_versions')
      .select('version, created_at, metrics')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (modelError && modelError.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new Error(`Failed to fetch model info: ${modelError.message}`)
    }

    // Get training statistics
    const [labelsResult, predictionsResult] = await Promise.all([
      serviceClient.from('mlmp_labels').select('label', { count: 'exact' }),
      serviceClient.from('mlmp_predictions').select('pred_id', { count: 'exact' })
    ])

    const totalLabels = labelsResult.count || 0
    const totalPredictions = predictionsResult.count || 0

    // Count by label type
    const { data: labelCounts } = await serviceClient
      .from('mlmp_labels')
      .select('label')

    const approvedCount = labelCounts?.filter(l => l.label === 'approve').length || 0
    const deniedCount = labelCounts?.filter(l => l.label === 'deny').length || 0
    const editedCount = labelCounts?.filter(l => l.label === 'edit').length || 0

    const response = {
      latest_model: latestModel || null,
      training_stats: {
        total_labels: totalLabels,
        total_predictions: totalPredictions,
        approved_count: approvedCount,
        denied_count: deniedCount,
        edited_count: editedCount
      },
      can_train: totalLabels >= 50
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Training Status API Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get training status' },
      { status: 500 }
    )
  }
}
