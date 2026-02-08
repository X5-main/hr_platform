import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @supabase/ssr before any imports that use it
const mockCreateServerClient = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}))

// Mock NextResponse
const mockNextResponse = {
  next: vi.fn().mockReturnValue({
    cookies: {
      set: vi.fn(),
    },
  }),
}
vi.mock('next/server', () => ({
  NextResponse: mockNextResponse,
}))

describe('Supabase Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  const createMockRequest = (pathname: string = '/') => {
    return {
      cookies: {
        get: vi.fn().mockReturnValue({ value: 'test-cookie-value' }),
        set: vi.fn(),
      },
      headers: new Headers(),
      url: `http://localhost:3000${pathname}`,
    }
  }

  it('should create server client with cookie handlers', async () => {
    const { updateSession } = await import('./middleware')
    const request = createMockRequest()

    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })

    await updateSession(request as unknown as import('next/server').NextRequest)

    expect(mockCreateServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({
        cookies: expect.objectContaining({
          get: expect.any(Function),
          set: expect.any(Function),
          remove: expect.any(Function),
        }),
      })
    )
  })

  it('should return response', async () => {
    const { updateSession } = await import('./middleware')
    const request = createMockRequest()

    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
        }),
      },
    })

    const response = await updateSession(request as unknown as import('next/server').NextRequest)

    expect(response).toBeDefined()
  })

  it('should get cookie from request', async () => {
    const { updateSession } = await import('./middleware')
    const mockGet = vi.fn().mockReturnValue({ value: 'test-value' })
    const request = {
      cookies: { get: mockGet, set: vi.fn() },
      headers: new Headers(),
      url: 'http://localhost:3000/',
    }

    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })

    await updateSession(request as unknown as import('next/server').NextRequest)

    const cookieConfig = mockCreateServerClient.mock.calls[0][2]
    cookieConfig.cookies.get('test-cookie')

    expect(mockGet).toHaveBeenCalledWith('test-cookie')
  })

  it('should call getUser to refresh session', async () => {
    const { updateSession } = await import('./middleware')
    const request = createMockRequest()

    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    })

    mockCreateServerClient.mockReturnValue({
      auth: { getUser: mockGetUser },
    })

    await updateSession(request as unknown as import('next/server').NextRequest)

    expect(mockGetUser).toHaveBeenCalledTimes(1)
  })

  it('should handle getUser errors gracefully', async () => {
    const { updateSession } = await import('./middleware')
    const request = createMockRequest()

    const mockGetUser = vi.fn().mockRejectedValue(new Error('Auth error'))

    mockCreateServerClient.mockReturnValue({
      auth: { getUser: mockGetUser },
    })

    // Should not throw, should return response
    const response = await updateSession(request as unknown as import('next/server').NextRequest)
    expect(response).toBeDefined()
  })
})
