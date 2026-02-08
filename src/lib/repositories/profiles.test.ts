import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProfileRepository } from './profiles'

// Mock the Supabase client
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockFrom = vi.fn()

const mockSupabaseClient = {
  from: mockFrom,
  auth: {
    getUser: vi.fn(),
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabaseClient,
}))

describe('ProfileRepository', () => {
  let repository: ProfileRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repository = new ProfileRepository()
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ single: mockSingle })
  })

  describe('getCurrentProfile', () => {
    it('returns profile when user is authenticated', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockProfile = {
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        headline: 'Developer',
        location: 'NYC',
        bio: 'A developer',
        role: 'candidate',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      }

      mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
      mockSingle.mockResolvedValue({ data: mockProfile, error: null })

      const result = await repository.getCurrentProfile()

      expect(result).toEqual(mockProfile)
      expect(mockFrom).toHaveBeenCalledWith('profiles')
      expect(mockSelect).toHaveBeenCalledWith('*')
    })

    it('returns null when user is not authenticated', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

      const result = await repository.getCurrentProfile()

      expect(result).toBeNull()
    })

    it('throws error when profile fetch fails', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
      mockSingle.mockResolvedValue({ data: null, error: new Error('DB error') })

      await expect(repository.getCurrentProfile()).rejects.toThrow('DB error')
    })
  })

  describe('updateProfile', () => {
    it('updates profile successfully', async () => {
      const mockProfile = {
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Updated Name',
        headline: 'Updated Headline',
      }

      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      })

      const result = await repository.updateProfile('user-123', {
        full_name: 'Updated Name',
        headline: 'Updated Headline',
      })

      expect(result).toEqual(mockProfile)
    })

    it('throws error when update fails', async () => {
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: new Error('Update failed') }),
          }),
        }),
      })

      await expect(repository.updateProfile('user-123', { full_name: 'Test' })).rejects.toThrow('Update failed')
    })
  })

  describe('getSocialAccounts', () => {
    it('returns social accounts for user', async () => {
      const mockAccounts = [
        { id: '1', profile_id: 'user-123', platform: 'linkedin', url: 'https://linkedin.com/in/test', username: 'test' },
        { id: '2', profile_id: 'user-123', platform: 'github', url: 'https://github.com/test', username: 'test' },
      ]

      mockEq.mockReturnValue({ data: mockAccounts, error: null })

      const result = await repository.getSocialAccounts('user-123')

      expect(result).toEqual(mockAccounts)
      expect(mockFrom).toHaveBeenCalledWith('social_accounts')
    })

    it('returns empty array when no accounts', async () => {
      mockEq.mockReturnValue({ data: [], error: null })

      const result = await repository.getSocialAccounts('user-123')

      expect(result).toEqual([])
    })
  })

  describe('addSocialAccount', () => {
    it('adds social account successfully', async () => {
      const mockAccount = {
        id: '1',
        profile_id: 'user-123',
        platform: 'linkedin' as const,
        url: 'https://linkedin.com/in/test',
        username: 'test',
      }

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockAccount, error: null }),
        }),
      })

      const result = await repository.addSocialAccount('user-123', {
        platform: 'linkedin',
        url: 'https://linkedin.com/in/test',
        username: 'test',
      })

      expect(result).toEqual(mockAccount)
    })
  })

  describe('removeSocialAccount', () => {
    it('removes social account successfully', async () => {
      const mockSecondEq = vi.fn().mockResolvedValue({ error: null })
      const mockFirstEq = vi.fn().mockReturnValue({ eq: mockSecondEq })
      mockDelete.mockReturnValue({ eq: mockFirstEq })

      await repository.removeSocialAccount('user-123', 'account-123')

      expect(mockFrom).toHaveBeenCalledWith('social_accounts')
      expect(mockDelete).toHaveBeenCalled()
    })
  })
})
