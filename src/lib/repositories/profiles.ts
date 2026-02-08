import { createClient as createServerClient } from '@/lib/supabase/server'
import type { ProfileInput, SocialAccountInput } from '@/lib/validations/profile'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  headline: string | null
  location: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

export interface SocialAccount {
  id: string
  profile_id: string
  platform: 'linkedin' | 'github' | 'google_scholar' | 'twitter' | 'website'
  url: string
  username: string | null
  verified: boolean
  created_at: string
  updated_at: string
}

export class ProfileRepository {
  async getCurrentProfile(): Promise<Profile | null> {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) throw error
    return data as Profile
  }

  async updateProfile(userId: string, input: ProfileInput): Promise<Profile> {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('profiles')
      .update(input)
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error
    return data as Profile
  }

  async getSocialAccounts(userId: string): Promise<SocialAccount[]> {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('profile_id', userId)

    if (error) throw error
    return (data || []) as SocialAccount[]
  }

  async addSocialAccount(userId: string, input: SocialAccountInput): Promise<SocialAccount> {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('social_accounts')
      .insert({ ...input, profile_id: userId })
      .select()
      .single()

    if (error) throw error
    return data as SocialAccount
  }

  async removeSocialAccount(userId: string, accountId: string): Promise<void> {
    const supabase = createServerClient()
    const { error } = await supabase
      .from('social_accounts')
      .delete()
      .eq('id', accountId)
      .eq('profile_id', userId)

    if (error) throw error
  }
}
