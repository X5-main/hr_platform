import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PositionRepository } from './positions'

const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockOr = vi.fn()
const mockOrder = vi.fn()
const mockRange = vi.fn()
const mockSingle = vi.fn()
const mockFrom = vi.fn()

const mockSupabaseClient = {
  from: mockFrom,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabaseClient,
}))

describe('PositionRepository', () => {
  let repository: PositionRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repository = new PositionRepository()
    mockFrom.mockReturnValue({
      select: mockSelect,
    })
  })

  describe('list', () => {
    it('returns positions with default pagination', async () => {
      const mockPositions = [
        {
          id: 'pos-1',
          title: 'Software Engineer',
          description: 'Build things',
          status: 'active',
          companies: { id: 'comp-1', name: 'Tech Co' },
        },
        {
          id: 'pos-2',
          title: 'Product Manager',
          description: 'Manage things',
          status: 'active',
          companies: { id: 'comp-2', name: 'Product Co' },
        },
      ]

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: mockPositions,
              error: null,
              count: 2,
            }),
          }),
        }),
      })

      const result = await repository.list({ page: 1, limit: 20 })

      expect(result.positions).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.page).toBe(1)
      expect(result.totalPages).toBe(1)
    })

    it('filters by search term', async () => {
      const mockRange = vi.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      })
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange })
      const mockOrFn = vi.fn().mockReturnValue({ order: mockOrder })
      const mockEqFn = vi.fn().mockReturnValue({ or: mockOrFn })

      mockSelect.mockReturnValue({
        eq: mockEqFn,
      })

      await repository.list({ page: 1, limit: 20, search: 'engineer' })

      expect(mockOrFn).toHaveBeenCalled()
    })

    it('filters by location_type', async () => {
      const mockRange = vi.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      })
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange })
      const mockSecondEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockFirstEq = vi.fn().mockReturnValue({ eq: mockSecondEq })

      mockSelect.mockReturnValue({
        eq: mockFirstEq,
      })

      await repository.list({ page: 1, limit: 20, location_type: 'remote' })

      expect(mockSecondEq).toHaveBeenCalledWith('location_type', 'remote')
    })

    it('filters by employment_type', async () => {
      const mockRange = vi.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      })
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange })
      const mockSecondEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockFirstEq = vi.fn().mockReturnValue({ eq: mockSecondEq })

      mockSelect.mockReturnValue({
        eq: mockFirstEq,
      })

      await repository.list({ page: 1, limit: 20, employment_type: 'full_time' })

      expect(mockSecondEq).toHaveBeenCalledWith('employment_type', 'full_time')
    })

    it('calculates totalPages correctly', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [],
              error: null,
              count: 45,
            }),
          }),
        }),
      })

      const result = await repository.list({ page: 1, limit: 20 })

      expect(result.totalPages).toBe(3)
    })

    it('throws error when query fails', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Query failed'),
            }),
          }),
        }),
      })

      await expect(repository.list({ page: 1, limit: 20 })).rejects.toThrow('Query failed')
    })
  })

  describe('getById', () => {
    it('returns position by id', async () => {
      const mockPosition = {
        id: 'pos-1',
        title: 'Software Engineer',
        companies: { id: 'comp-1', name: 'Tech Co' },
      }

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockPosition, error: null }),
          }),
        }),
      })

      const result = await repository.getById('pos-1')

      expect(result).toEqual(mockPosition)
    })

    it('returns null when position not found', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          }),
        }),
      })

      const result = await repository.getById('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('getBySlug', () => {
    it('returns position by company and position slug', async () => {
      const mockPosition = {
        id: 'pos-1',
        title: 'Software Engineer',
        slug: 'software-engineer',
        companies: { id: 'comp-1', name: 'Tech Co', slug: 'tech-co' },
      }

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockPosition, error: null }),
            }),
          }),
        }),
      })

      const result = await repository.getBySlug('tech-co', 'software-engineer')

      expect(result).toEqual(mockPosition)
    })

    it('returns null when position not found', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        }),
      })

      const result = await repository.getBySlug('non-existent', 'non-existent')

      expect(result).toBeNull()
    })
  })
})
