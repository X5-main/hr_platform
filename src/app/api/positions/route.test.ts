import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { PositionRepository } from '@/lib/repositories/positions'

vi.mock('@/lib/repositories/positions')

describe('GET /api/positions', () => {
  const mockList = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(PositionRepository as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      list: mockList,
    }))
  })

  it('returns positions list successfully', async () => {
    const mockResult = {
      positions: [
        { id: '1', title: 'Software Engineer', companies: { name: 'Tech Co' } },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    }
    mockList.mockResolvedValue(mockResult)

    const request = new Request('http://localhost:3000/api/positions')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(mockResult)
  })

  it('parses query parameters correctly', async () => {
    mockList.mockResolvedValue({
      positions: [],
      total: 0,
      page: 2,
      totalPages: 0,
    })

    const request = new Request('http://localhost:3000/api/positions?page=2&limit=10&search=engineer&location_type=remote')
    await GET(request)

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({
      page: 2,
      limit: 10,
      search: 'engineer',
      location_type: 'remote',
    }))
  })

  it('returns 400 for invalid query parameters', async () => {
    const request = new Request('http://localhost:3000/api/positions?page=invalid')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Invalid query parameters')
  })

  it('returns 500 when repository throws error', async () => {
    mockList.mockRejectedValue(new Error('Database error'))

    const request = new Request('http://localhost:3000/api/positions')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Failed to fetch positions')
  })
})
