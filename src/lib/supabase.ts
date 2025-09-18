import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Service role client for server-side operations
export const createServiceClient = () => {
  const serviceKey = (import.meta as any).env?.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error('Missing Supabase service role key')
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Database types
export interface MenuUpload {
  menu_id: string
  user_id: string | null
  file_name: string
  file_type: string
  page_count: number
  created_at: string
}

export interface ExtractedLine {
  line_id: string
  menu_id: string
  page: number
  text: string
  bbox?: {
    x: number
    y: number
    w: number
    h: number
  }
  raw?: any
  created_at: string
}

export interface Prediction {
  pred_id: string
  line_id: string
  model_version: string
  features: Record<string, number | boolean>
  confidence: number
  created_at: string
}

export interface Label {
  label_id: string
  line_id: string
  user_id: string | null
  label: 'approve' | 'deny' | 'edit'
  edited_text?: string
  created_at: string
}

export interface Entree {
  entree_id: string
  menu_id: string
  text: string
  source_line_id?: string
  created_by?: string
  created_at: string
}

export interface ModelVersion {
  version: string
  created_at: string
  metrics?: {
    precision: number
    recall: number
    f1: number
  }
  storage_path?: string
}
