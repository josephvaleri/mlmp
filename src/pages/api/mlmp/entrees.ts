import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '../../../lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const menuId = searchParams.get('menu_id')

    if (!menuId) {
      return NextResponse.json(
        { error: 'menu_id parameter is required' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    // Get approved entrees for the menu
    const { data: entrees, error } = await serviceClient
      .from('mlmp_entrees')
      .select('text')
      .eq('menu_id', menuId)
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch entrees: ${error.message}`)
    }

    const response = {
      menu_id: menuId,
      entrees: entrees?.map(entree => entree.text) || []
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
