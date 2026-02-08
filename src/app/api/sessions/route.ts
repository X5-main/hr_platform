import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createSession } from '@/lib/container-service'

const createSessionSchema = z.object({
  applicationId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validationResult = createSessionSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: validationResult.error.format() },
        { status: 400 }
      )
    }

    const { applicationId } = validationResult.data

    // Verify application exists and belongs to user
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, status, candidate_id')
      .eq('id', applicationId)
      .single()

    if (appError || !application) {
      return NextResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      )
    }

    if (application.candidate_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Check if session already exists
    const { data: existingSession } = await supabase
      .from('technical_sessions')
      .select('id, status')
      .eq('application_id', applicationId)
      .in('status', ['pending', 'spawning', 'active'])
      .single()

    if (existingSession) {
      return NextResponse.json(
        { success: false, error: 'Session already exists for this application' },
        { status: 409 }
      )
    }

    // Create technical session record
    const { data: sessionRecord, error: sessionError } = await supabase
      .from('technical_sessions')
      .insert({
        application_id: applicationId,
        candidate_id: user.id,
        status: 'pending',
      })
      .select()
      .single()

    if (sessionError || !sessionRecord) {
      console.error('Failed to create session record:', sessionError)
      return NextResponse.json(
        { success: false, error: 'Failed to create session record' },
        { status: 500 }
      )
    }

    // Spawn container
    const sessionInfo = await createSession({
      applicationId,
      candidateId: user.id,
      sessionDurationMinutes: 60,
    })

    // Update session record with container info
    const { error: updateError } = await supabase
      .from('technical_sessions')
      .update({
        status: sessionInfo.status,
        container_id: sessionInfo.containerId,
        network_id: sessionInfo.networkId,
        vnc_url: sessionInfo.vncUrl,
        code_server_url: sessionInfo.codeServerUrl,
        workspace_path: sessionInfo.workspacePath,
        started_at: sessionInfo.createdAt.toISOString(),
        expires_at: sessionInfo.expiresAt.toISOString(),
      })
      .eq('id', sessionRecord.id)

    if (updateError) {
      console.error('Failed to update session record:', updateError)
      // Continue - container is running, we can recover
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionInfo.sessionId,
        status: sessionInfo.status,
        vncUrl: sessionInfo.vncUrl,
        codeServerUrl: sessionInfo.codeServerUrl,
        expiresAt: sessionInfo.expiresAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to create session:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create session' },
      { status: 500 }
    )
  }
}
