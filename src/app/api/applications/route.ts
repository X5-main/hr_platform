import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ApplicationRepository } from '@/lib/repositories/applications'
import { createApplicationSchema } from '@/lib/validations/application'

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

    const repository = new ApplicationRepository()
    const applications = await repository.listByProfile(user.id)

    return NextResponse.json({ success: true, data: applications })
  } catch (error) {
    console.error('Failed to fetch applications:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch applications' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
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
    const validation = createApplicationSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      )
    }

    const repository = new ApplicationRepository()

    // Check if already applied
    const existing = await repository.findByPosition(user.id, validation.data.position_id)
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Already applied to this position' },
        { status: 409 }
      )
    }

    const application = await repository.create(user.id, validation.data)

    return NextResponse.json({ success: true, data: application }, { status: 201 })
  } catch (error) {
    console.error('Failed to create application:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create application' },
      { status: 500 }
    )
  }
}
