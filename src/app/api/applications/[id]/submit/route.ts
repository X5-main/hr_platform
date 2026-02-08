import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ApplicationRepository } from '@/lib/repositories/applications'

export async function POST(
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

    // Get the current application to verify ownership and status
    const repository = new ApplicationRepository()
    const application = await repository.getById(params.id, user.id)

    if (!application) {
      return NextResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      )
    }

    if (application.status !== 'started') {
      return NextResponse.json(
        { success: false, error: 'Application already submitted' },
        { status: 400 }
      )
    }

    await repository.submit(params.id, user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to submit application:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to submit application' },
      { status: 500 }
    )
  }
}
