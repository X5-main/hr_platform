import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ProfileRepository } from '@/lib/repositories/profiles'
import { profileSchema } from '@/lib/validations/profile'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const repository = new ProfileRepository()
    const profile = await repository.getCurrentProfile()

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: profile })
  } catch (error) {
    console.error('Failed to fetch profile:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validation = profileSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      )
    }

    const repository = new ProfileRepository()
    const profile = await repository.updateProfile(user.id, validation.data)

    return NextResponse.json({ success: true, data: profile })
  } catch (error) {
    console.error('Failed to update profile:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
