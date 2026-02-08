import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the Supabase server client
const mockExchangeCodeForSession = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
    },
  }),
}))

describe('Auth Callback Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = (code: string | null, next: string | null = null) => {
    const url = new URL('http://localhost:3000/auth/callback')
    if (code) url.searchParams.set('code', code)
    if (next) url.searchParams.set('next', next)
    return new NextRequest(url)
  }

  it('should exchange code for session on successful callback', async () => {
    const { GET } = await import('./route')
    mockExchangeCodeForSession.mockResolvedValue({ error: null })

    const request = createMockRequest('valid-auth-code')
    const response = await GET(request)

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid-auth-code')
    expect(response.status).toBe(307)
  })

  it('should redirect to portal on successful authentication', async () => {
    const { GET } = await import('./route')
    mockExchangeCodeForSession.mockResolvedValue({ error: null })

    const request = createMockRequest('valid-auth-code')
    const response = await GET(request)

    expect(response.headers.get('location')).toBe('http://localhost:3000/portal')
  })

  it('should redirect to custom next URL when provided', async () => {
    const { GET } = await import('./route')
    mockExchangeCodeForSession.mockResolvedValue({ error: null })

    const request = createMockRequest('valid-auth-code', '/dashboard')
    const response = await GET(request)

    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard')
  })

  it('should redirect to error page when code is missing', async () => {
    const { GET } = await import('./route')
    const request = createMockRequest(null)
    const response = await GET(request)

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/auth-code-error')
  })

  it('should redirect to error page on exchange failure', async () => {
    const { GET } = await import('./route')
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: 'Invalid code' },
    })

    const request = createMockRequest('invalid-code')
    const response = await GET(request)

    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/auth-code-error')
  })

  it('should handle exchange errors gracefully', async () => {
    const { GET } = await import('./route')
    mockExchangeCodeForSession.mockRejectedValue(new Error('Network error'))

    const request = createMockRequest('valid-code')
    const response = await GET(request)

    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/auth-code-error')
  })

  it('should default next to /portal when not provided', async () => {
    const { GET } = await import('./route')
    mockExchangeCodeForSession.mockResolvedValue({ error: null })

    const request = createMockRequest('valid-code')
    const response = await GET(request)

    const location = response.headers.get('location')
    expect(location).not.toContain('next=')
    expect(location).toBe('http://localhost:3000/portal')
  })

  it('should handle URL-encoded next parameter', async () => {
    const { GET } = await import('./route')
    mockExchangeCodeForSession.mockResolvedValue({ error: null })

    const request = createMockRequest('valid-code', '/portal/dashboard')
    const response = await GET(request)

    // URL constructor decodes the path automatically
    expect(response.headers.get('location')).toContain('/portal/dashboard')
  })

  it('should use request origin for redirects', async () => {
    const { GET } = await import('./route')
    mockExchangeCodeForSession.mockResolvedValue({ error: null })

    const url = new URL('https://production.com/auth/callback')
    url.searchParams.set('code', 'valid-code')
    const request = new NextRequest(url)

    const response = await GET(request)

    expect(response.headers.get('location')).toBe('https://production.com/portal')
  })
})
