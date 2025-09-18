import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '../../../lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { line_id, label, edited_text } = body

    // Validate required fields
    if (!line_id || !label) {
      return NextResponse.json(
        { error: 'line_id and label are required' },
        { status: 400 }
      )
    }

    // Validate label value
    if (!['approve', 'deny', 'edit'].includes(label)) {
      return NextResponse.json(
        { error: 'label must be one of: approve, deny, edit' },
        { status: 400 }
      )
    }

    // Validate edited_text for edit label
    if (label === 'edit' && !edited_text) {
      return NextResponse.json(
        { error: 'edited_text is required when label is "edit"' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    // Get user ID from auth (if available)
    const authHeader = request.headers.get('authorization')
    let userId = null
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7)
        const { data: { user } } = await serviceClient.auth.getUser(token)
        userId = user?.id
      } catch (authError) {
        console.warn('Failed to get user from token:', authError)
      }
    }

    // Save the label
    const { data: labelData, error: labelError } = await serviceClient
      .from('mlmp_labels')
      .insert({
        line_id,
        user_id: userId,
        label,
        edited_text: label === 'edit' ? edited_text : null
      })
      .select()
      .single()

    if (labelError) {
      throw new Error(`Failed to save label: ${labelError.message}`)
    }

    // If approved or edited, also save to entrees table
    if (label === 'approve' || label === 'edit') {
      const finalText = label === 'edit' ? edited_text : null
      
      if (finalText) {
        // Get menu_id from the line
        const { data: lineData, error: lineError } = await serviceClient
          .from('mlmp_extracted_lines')
          .select('menu_id, text')
          .eq('line_id', line_id)
          .single()

        if (lineError) {
          console.error('Failed to get line data:', lineError)
        } else {
          // Save to entrees table
          await serviceClient
            .from('mlmp_entrees')
            .upsert({
              menu_id: lineData.menu_id,
              text: finalText,
              source_line_id: line_id,
              created_by: userId
            })
        }
      }
    }

    return NextResponse.json({
      success: true,
      label_id: labelData.label_id
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
