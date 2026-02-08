import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { ApplicationRepository } from '@/lib/repositories/applications'
import { createClient } from '@/lib/supabase/server'

vi.mock('@/lib/repositories/applications')
vi.mock('@/lib/supabase/server')

describe('GET /api/applications', () => {
  const mockListByProfile = vi.fn()
  const mockGetUser = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(ApplicationRepository as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      listByProfile: mockListByProfile,
    }))
    ;(createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: { getUser: mockGetUser },
    })
  })

  it('returns applications for authenticated user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockListByProfile.mockResolvedValue([
      { id: 'app-1', status: 'started', positions: { title: 'Engineer' } },
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 500 when repository throws error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockListByProfile.mockRejectedValue(new Error('Database error'))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Failed to fetch applications')
  })
})

describe('POST /api/applications', () => {
  const mockCreate = vi.fn()
  const mockFindByPosition = vi.fn()
  const mockGetUser = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(ApplicationRepository as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      create: mockCreate,
      findByPosition: mockFindByPosition,
    }))
    ;(createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: { getUser: mockGetUser },
    })
  })

  it('creates application successfully', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockFindByPosition.mockResolvedValue(null)
    mockCreate.mockResolvedValue({
      id: 'app-1',
      profile_id: 'user-123',
      position_id: 'pos-1',
      status: 'started',
    })

    const request = new Request('http://localhost:3000/api/applications', {
      method: 'POST',
      body: JSON.stringify({ position_id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('app-1')
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const request = new Request('http://localhost:3000/api/applications', {
      method: 'POST',
      body: JSON.stringify({ position_id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.success).toBe(false)
  })

  it('returns 400 for invalid input', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    const request = new Request('http://localhost:3000/api/applications', {
      method: 'POST',
      body: JSON.stringify({ position_id: 'not-a-uuid' }),
    })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Invalid input')
  })

  it('returns 409 when already applied to position', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockFindByPosition.mockResolvedValue({ id: 'existing-app' })

    const request = new Request('http://localhost:3000/api/applications', {
      method: 'POST',
      body: JSON.stringify({ position_id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Already applied to this position')
  })
})
