import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/container-service', () => ({
  createSession: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createSession } from '@/lib/container-service'

describe('POST /api/sessions', () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return 401 if user is not authenticated', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Not authenticated'),
    })

    const request = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ applicationId: '550e8400-e29b-41d4-a716-446655440000' }),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(401)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 400 for invalid request body', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    const request = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ applicationId: 'invalid-uuid' }),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Invalid request body')
  })

  it('should return 404 if application not found', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: new Error('Not found') }),
        }),
      }),
    })

    const request = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ applicationId: '550e8400-e29b-41d4-a716-446655440000' }),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Application not found')
  })

  it('should return 403 if application does not belong to user', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'app-123', status: 'pending', candidate_id: 'different-user' },
            error: null,
          }),
        }),
      }),
    })

    const request = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ applicationId: '550e8400-e29b-41d4-a716-446655440000' }),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(403)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Forbidden')
  })

  it('should return 409 if session already exists', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    const mockFrom = vi.fn()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'applications') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'app-123', status: 'pending', candidate_id: 'user-123' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'technical_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'session-123', status: 'active' },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    mockSupabase.from = mockFrom

    const request = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ applicationId: '550e8400-e29b-41d4-a716-446655440000' }),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(409)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Session already exists for this application')
  })

  it('should create session successfully', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    const mockSessionRecord = {
      id: 'db-session-123',
      application_id: 'app-123',
      candidate_id: 'user-123',
      status: 'pending',
    }

    const mockFrom = vi.fn()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'applications') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'app-123', status: 'pending', candidate_id: 'user-123' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'technical_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockSessionRecord,
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      return {}
    })

    mockSupabase.from = mockFrom

    const mockSessionInfo = {
      sessionId: 'session-123',
      applicationId: 'app-123',
      candidateId: 'user-123',
      containerId: 'container-456',
      networkId: 'network-789',
      status: 'active' as const,
      vncUrl: 'http://172.18.0.2:6080/vnc.html',
      codeServerUrl: 'http://172.18.0.2:8080',
      workspacePath: '/workspace',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    }

    ;(createSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSessionInfo)

    const request = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ applicationId: '550e8400-e29b-41d4-a716-446655440000' }),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.sessionId).toBe('session-123')
    expect(data.data.status).toBe('active')
    expect(data.data.vncUrl).toBe('http://172.18.0.2:6080/vnc.html')
    expect(data.data.codeServerUrl).toBe('http://172.18.0.2:8080')
  })

  it('should return 500 on container service error', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    const mockSessionRecord = {
      id: 'db-session-123',
      application_id: 'app-123',
      candidate_id: 'user-123',
      status: 'pending',
    }

    const mockFrom = vi.fn()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'applications') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'app-123', status: 'pending', candidate_id: 'user-123' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'technical_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockSessionRecord,
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })

    mockSupabase.from = mockFrom

    ;(createSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Docker daemon not reachable'))

    const request = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ applicationId: '550e8400-e29b-41d4-a716-446655440000' }),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(500)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Failed to create session')
  })
})
