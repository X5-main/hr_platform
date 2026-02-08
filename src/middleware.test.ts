import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the updateSession function
const mockUpdateSession = vi.fn()
vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: (req: NextRequest) => mockUpdateSession(req),
}))

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = (pathname: string = '/') => {
    const url = new URL(`http://localhost:3000${pathname}`)
    return new NextRequest(url)
  }

  const createMockResponse = (redirectUrl?: string) => {
    if (redirectUrl) {
      return {
        status: 307,
        headers: new Headers({ location: redirectUrl }),
      }
    }
    return {
      status: 200,
      headers: new Headers(),
    }
  }

  it('should allow access to public routes without auth', async () => {
    const { middleware } = await import('./middleware')
    const request = createMockRequest('/auth/login')

    mockUpdateSession.mockResolvedValue(createMockResponse())

    const response = await middleware(request)

    expect(response.status).not.toBe(307)
  })

  it('should allow access to callback route without auth', async () => {
    const { middleware } = await import('./middleware')
    const request = createMockRequest('/auth/callback')

    mockUpdateSession.mockResolvedValue(createMockResponse())

    const response = await middleware(request)

    expect(response.status).not.toBe(307)
  })

  it('should redirect unauthenticated users to login', async () => {
    const { middleware } = await import('./middleware')
    const request = createMockRequest('/portal')

    // Response without auth token
    mockUpdateSession.mockResolvedValue(createMockResponse())

    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/auth/login')
  })

  it('should preserve redirect URL when redirecting to login', async () => {
    const { middleware } = await import('./middleware')
    const request = createMockRequest('/portal/dashboard')

    mockUpdateSession.mockResolvedValue(createMockResponse())

    const response = await middleware(request)

    const location = response.headers.get('location')
    expect(location).toContain('/auth/login')
    expect(location).toContain('redirect=')
  })

  it('should allow access to protected routes with valid auth', async () => {
    const { middleware } = await import('./middleware')
    const request = createMockRequest('/portal')

    // Mock request with auth cookie
    request.cookies.set('sb-auth-token', 'valid-token')

    mockUpdateSession.mockResolvedValue(createMockResponse())

    const response = await middleware(request)

    expect(response.status).not.toBe(307)
  })

  it('should allow access to static files without auth', async () => {
    const { middleware, config } = await import('./middleware')
    const request = createMockRequest('/_next/static/chunk.js')

    mockUpdateSession.mockResolvedValue(createMockResponse())

    const response = await middleware(request)

    // Static files should bypass auth check but still call updateSession
    expect(mockUpdateSession).toHaveBeenCalled()
  })

  it('should call updateSession for all non-static routes', async () => {
    const { middleware } = await import('./middleware')
    const request = createMockRequest('/some-page')

    mockUpdateSession.mockResolvedValue(createMockResponse())

    await middleware(request)

    expect(mockUpdateSession).toHaveBeenCalledWith(request)
  })

  describe('Route matchers', () => {
    it('should have correct matcher config', async () => {
      const { config } = await import('./middleware')

      expect(config).toHaveProperty('matcher')
      expect(config.matcher).toContain('/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)')
    })
  })
})
