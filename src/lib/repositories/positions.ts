import { createClient } from '@/lib/supabase/server'
import type { PositionQueryInput } from '@/lib/validations/position'

export interface Company {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  website: string | null
  location: string | null
  size: string | null
  created_at: string
  updated_at: string
}

export interface Position {
  id: string
  company_id: string
  title: string
  slug: string
  description: string
  requirements: string[] | null
  employment_type: string | null
  location_type: string | null
  salary_range: { min?: number; max?: number; currency: string } | null
  screening_questions: unknown[] | null
  status: string
  created_at: string
  updated_at: string
  companies: Company
}

export interface PositionListResult {
  positions: Position[]
  total: number
  page: number
  totalPages: number
}

export class PositionRepository {
  async list(query: PositionQueryInput): Promise<PositionListResult> {
    const supabase = createClient()
    const { search, location_type, employment_type, page, limit } = query
    const offset = (page - 1) * limit

    let dbQuery = supabase
      .from('positions')
      .select('*, companies(*)', { count: 'exact' })
      .eq('status', 'active')

    if (search) {
      dbQuery = dbQuery.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
    }

    if (location_type) {
      dbQuery = dbQuery.eq('location_type', location_type)
    }

    if (employment_type) {
      dbQuery = dbQuery.eq('employment_type', employment_type)
    }

    const { data, error, count } = await dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return {
      positions: (data || []) as Position[],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    }
  }

  async getById(id: string): Promise<Position | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('positions')
      .select('*, companies(*)')
      .eq('id', id)
      .eq('status', 'active')
      .single()

    if (error) return null
    return data as Position
  }

  async getBySlug(companySlug: string, positionSlug: string): Promise<Position | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('positions')
      .select('*, companies(*)')
      .eq('slug', positionSlug)
      .eq('companies.slug', companySlug)
      .eq('status', 'active')
      .single()

    if (error) return null
    return data as Position
  }
}
