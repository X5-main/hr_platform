import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApplicationRepository } from './applications'

const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockSingle = vi.fn()
const mockFrom = vi.fn()

const mockSupabaseClient = {
  from: mockFrom,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabaseClient,
}))

describe('ApplicationRepository', () => {
  let repository: ApplicationRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repository = new ApplicationRepository()
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    })
  })

  describe('listByProfile', () => {
    it('returns applications for profile', async () => {
      const mockApplications = [
        {
          id: 'app-1',
          profile_id: 'user-123',
          position_id: 'pos-1',
          status: 'started',
          positions: {
            id: 'pos-1',
            title: 'Software Engineer',
            companies: { id: 'comp-1', name: 'Tech Co' },
          },
          screening_interviews: null,
        },
      ]

      mockEq.mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: mockApplications, error: null }),
      })
      mockSelect.mockReturnValue({ eq: mockEq })

      const result = await repository.listByProfile('user-123')

      expect(result).toHaveLength(1)
      expect(result[0].positions.title).toBe('Software Engineer')
    })

    it('returns empty array when no applications', async () => {
      mockEq.mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })
      mockSelect.mockReturnValue({ eq: mockEq })

      const result = await repository.listByProfile('user-123')

      expect(result).toEqual([])
    })

    it('throws error when query fails', async () => {
      mockEq.mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
      })
      mockSelect.mockReturnValue({ eq: mockEq })

      await expect(repository.listByProfile('user-123')).rejects.toThrow('DB error')
    })
  })

  describe('getById', () => {
    it('returns application by id', async () => {
      const mockApplication = {
        id: 'app-1',
        profile_id: 'user-123',
        position_id: 'pos-1',
        status: 'submitted',
        positions: {
          id: 'pos-1',
          title: 'Software Engineer',
          companies: { id: 'comp-1', name: 'Tech Co' },
        },
      }

      mockEq.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockApplication, error: null }),
        }),
      })
      mockSelect.mockReturnValue({ eq: mockEq })

      const result = await repository.getById('app-1', 'user-123')

      expect(result).toEqual(mockApplication)
    })

    it('returns null when not found', async () => {
      mockEq.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      })
      mockSelect.mockReturnValue({ eq: mockEq })

      const result = await repository.getById('non-existent', 'user-123')

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('creates application successfully', async () => {
      const mockApplication = {
        id: 'app-1',
        profile_id: 'user-123',
        position_id: 'pos-1',
        status: 'started',
        positions: {
          id: 'pos-1',
          title: 'Software Engineer',
          companies: { id: 'comp-1', name: 'Tech Co' },
        },
      }

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockApplication, error: null }),
        }),
      })

      const result = await repository.create('user-123', { position_id: 'pos-1' })

      expect(result).toEqual(mockApplication)
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        profile_id: 'user-123',
        position_id: 'pos-1',
        status: 'started',
      }))
    })

    it('throws error when creation fails', async () => {
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: new Error('Insert failed') }),
        }),
      })

      await expect(repository.create('user-123', { position_id: 'pos-1' })).rejects.toThrow('Insert failed')
    })
  })

  describe('saveFormProgress', () => {
    it('saves form data successfully', async () => {
      const formData = {
        cover_letter: 'My cover letter',
        availability: '2 weeks',
      }

      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })

      await expect(repository.saveFormProgress('app-1', 'user-123', formData)).resolves.not.toThrow()
    })

    it('throws error when save fails', async () => {
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: new Error('Update failed') }),
        }),
      })

      await expect(repository.saveFormProgress('app-1', 'user-123', {})).rejects.toThrow('Update failed')
    })
  })

  describe('submit', () => {
    it('submits application successfully', async () => {
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })

      await expect(repository.submit('app-1', 'user-123')).resolves.not.toThrow()
    })

    it('throws error when submit fails', async () => {
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: new Error('Submit failed') }),
        }),
      })

      await expect(repository.submit('app-1', 'user-123')).rejects.toThrow('Submit failed')
    })
  })

  describe('findByPosition', () => {
    it('finds existing application for position', async () => {
      const mockApplication = {
        id: 'app-1',
        profile_id: 'user-123',
        position_id: 'pos-1',
        status: 'started',
      }

      mockEq.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockApplication, error: null }),
        }),
      })
      mockSelect.mockReturnValue({ eq: mockEq })

      const result = await repository.findByPosition('user-123', 'pos-1')

      expect(result).toEqual(mockApplication)
    })

    it('returns null when no application exists', async () => {
      mockEq.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      })
      mockSelect.mockReturnValue({ eq: mockEq })

      const result = await repository.findByPosition('user-123', 'pos-1')

      expect(result).toBeNull()
    })
  })
})
