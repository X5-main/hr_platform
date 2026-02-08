import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ApplicationRepository } from '@/lib/repositories/applications'
import { applicationFormSchema } from '@/lib/validations/application'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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
    const validation = applicationFormSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid form data' },
        { status: 400 }
      )
    }

    const repository = new ApplicationRepository()
    await repository.saveFormProgress(params.id, user.id, validation.data)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save form progress:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save progress' },
      { status: 500 }
    )
  }
}
