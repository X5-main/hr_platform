import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

// Mock @supabase/ssr
const mockCreateServerClient = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}))

describe('Supabase Server Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  it('should create server client with correct configuration', async () => {
    const { createClient } = await import('./server')
    createClient()

    expect(mockCreateServerClient).toHaveBeenCalledTimes(1)
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

  it('should get cookie value', async () => {
    const { cookies } = await import('next/headers')
    const mockCookieStore = {
      get: vi.fn().mockReturnValue({ value: 'test-cookie-value' }),
      set: vi.fn(),
    }
    vi.mocked(cookies).mockReturnValue(mockCookieStore as unknown as ReturnType<typeof cookies>)

    const { createClient } = await import('./server')
    createClient()

    const cookieConfig = mockCreateServerClient.mock.calls[0][2]
    const value = cookieConfig.cookies.get('test-cookie')

    expect(mockCookieStore.get).toHaveBeenCalledWith('test-cookie')
    expect(value).toBe('test-cookie-value')
  })

  it('should set cookie value', async () => {
    const { cookies } = await import('next/headers')
    const mockCookieStore = {
      get: vi.fn(),
      set: vi.fn(),
    }
    vi.mocked(cookies).mockReturnValue(mockCookieStore as unknown as ReturnType<typeof cookies>)

    const { createClient } = await import('./server')
    createClient()

    const cookieConfig = mockCreateServerClient.mock.calls[0][2]
    cookieConfig.cookies.set('test-cookie', 'test-value', { path: '/', maxAge: 3600 })

    expect(mockCookieStore.set).toHaveBeenCalledWith({
      name: 'test-cookie',
      value: 'test-value',
      path: '/',
      maxAge: 3600,
    })
  })

  it('should remove cookie by setting empty value', async () => {
    const { cookies } = await import('next/headers')
    const mockCookieStore = {
      get: vi.fn(),
      set: vi.fn(),
    }
    vi.mocked(cookies).mockReturnValue(mockCookieStore as unknown as ReturnType<typeof cookies>)

    const { createClient } = await import('./server')
    createClient()

    const cookieConfig = mockCreateServerClient.mock.calls[0][2]
    cookieConfig.cookies.remove('test-cookie', { path: '/' })

    expect(mockCookieStore.set).toHaveBeenCalledWith({
      name: 'test-cookie',
      value: '',
      path: '/',
    })
  })

  it('should handle missing environment variables', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    vi.resetModules()
    const { createClient } = await import('./server')

    // Should not throw, but will pass undefined to createServerClient
    expect(() => createClient()).not.toThrow()
    expect(mockCreateServerClient).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.any(Object)
    )
  })
})
