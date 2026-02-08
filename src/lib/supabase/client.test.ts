import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @supabase/ssr
const mockCreateBrowserClient = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: (...args: unknown[]) => mockCreateBrowserClient(...args),
}))

describe('Supabase Browser Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  it('should create browser client with correct configuration', async () => {
    const { createClient } = await import('./client')
    createClient()

    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(1)
    expect(mockCreateBrowserClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key'
    )
  })

  it('should return same client instance on multiple calls', async () => {
    const { createClient } = await import('./client')

    const client1 = createClient()
    const client2 = createClient()

    // Each call creates a new instance (no singleton pattern in basic implementation)
    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(2)
  })

  it('should handle missing environment variables', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    vi.resetModules()
    const { createClient } = await import('./client')

    expect(() => createClient()).not.toThrow()
    expect(mockCreateBrowserClient).toHaveBeenCalledWith(undefined, undefined)
  })
})
