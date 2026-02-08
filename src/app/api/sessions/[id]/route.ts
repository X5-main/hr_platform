import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionStatus, destroySession } from '@/lib/container-service'

interface RouteParams {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionId = params.id

    // Authenticate user
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get session from database
    const { data: sessionRecord, error: sessionError } = await supabase
      .from('technical_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !sessionRecord) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (sessionRecord.candidate_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Get real-time container status if container exists
    let containerStatus = null
    if (sessionRecord.container_id) {
      try {
        containerStatus = await getSessionStatus(sessionRecord.container_id)
      } catch (error) {
        console.warn('Failed to get container status:', error)
        // Continue with database status if container check fails
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionRecord.id,
        applicationId: sessionRecord.application_id,
        status: containerStatus?.status || sessionRecord.status,
        containerId: sessionRecord.container_id,
        vncUrl: containerStatus?.vncUrl || sessionRecord.vnc_url,
        codeServerUrl: containerStatus?.codeServerUrl || sessionRecord.code_server_url,
        startedAt: sessionRecord.started_at,
        endedAt: sessionRecord.ended_at,
        expiresAt: sessionRecord.expires_at,
      },
    })
  } catch (error) {
    console.error('Failed to get session status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get session status' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionId = params.id

    // Authenticate user
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get session from database
    const { data: sessionRecord, error: sessionError } = await supabase
      .from('technical_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !sessionRecord) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (sessionRecord.candidate_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Check if session can be ended
    if (!['active', 'spawning', 'pending'].includes(sessionRecord.status)) {
      return NextResponse.json(
        { success: false, error: 'Session is already ended' },
        { status: 409 }
      )
    }

    // Destroy container if it exists
    if (sessionRecord.container_id && sessionRecord.network_id) {
      try {
        await destroySession(
          sessionId,
          sessionRecord.container_id,
          sessionRecord.network_id
        )
      } catch (error) {
        console.error('Failed to destroy container:', error)
        // Continue - we'll update the database status anyway
      }
    }

    // Update session record
    const { error: updateError } = await supabase
      .from('technical_sessions')
      .update({
        status: 'stopped',
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Failed to update session record:', updateError)
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        status: 'stopped',
        endedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to end session:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to end session' },
      { status: 500 }
    )
  }
}
