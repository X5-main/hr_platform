import { createClient } from '@/lib/supabase/server'
import type { ApplicationFormInput, CreateApplicationInput } from '@/lib/validations/application'

export interface Application {
  id: string
  profile_id: string
  position_id: string
  status: string
  form_data: Record<string, unknown>
  form_completed: boolean
  classification_score: number | null
  classification_notes: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
  positions: {
    id: string
    title: string
    description: string
    companies: {
      id: string
      name: string
      slug: string
    }
  }
  screening_interviews: {
    id: string
    status: string
    started_at: string | null
    completed_at: string | null
  } | null
}

export class ApplicationRepository {
  async listByProfile(profileId: string): Promise<Application[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('applications')
      .select('*, positions(*, companies(*)), screening_interviews(*)')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as Application[]
  }

  async getById(id: string, profileId: string): Promise<Application | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('applications')
      .select('*, positions(*, companies(*)), screening_interviews(*)')
      .eq('id', id)
      .eq('profile_id', profileId)
      .single()

    if (error) return null
    return data as Application
  }

  async create(profileId: string, input: CreateApplicationInput): Promise<Application> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('applications')
      .insert({
        profile_id: profileId,
        position_id: input.position_id,
        status: 'started',
      })
      .select('*, positions(*, companies(*)), screening_interviews(*)')
      .single()

    if (error) throw error
    return data as Application
  }

  async saveFormProgress(applicationId: string, profileId: string, formData: ApplicationFormInput): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('applications')
      .update({
        form_data: formData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId)
      .eq('profile_id', profileId)

    if (error) throw error
  }

  async submit(applicationId: string, profileId: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('applications')
      .update({
        status: 'submitted',
        form_completed: true,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId)
      .eq('profile_id', profileId)

    if (error) throw error
  }

  async findByPosition(profileId: string, positionId: string): Promise<Application | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('applications')
      .select('*, positions(*, companies(*)), screening_interviews(*)')
      .eq('profile_id', profileId)
      .eq('position_id', positionId)
      .single()

    if (error) return null
    return data as Application
  }
}
