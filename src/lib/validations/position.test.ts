import { describe, it, expect } from 'vitest'
import { positionQuerySchema } from './position'

describe('positionQuerySchema', () => {
  it('validates empty query', () => {
    const result = positionQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(20)
    }
  })

  it('validates query with search term', () => {
    const input = { search: 'software engineer' }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.search).toBe('software engineer')
    }
  })

  it('validates query with location_type', () => {
    const input = { location_type: 'remote' as const }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.location_type).toBe('remote')
    }
  })

  it('validates query with employment_type', () => {
    const input = { employment_type: 'full_time' as const }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.employment_type).toBe('full_time')
    }
  })

  it('validates query with pagination', () => {
    const input = { page: 2, limit: 10 }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(2)
      expect(result.data.limit).toBe(10)
    }
  })

  it('rejects invalid location_type', () => {
    const input = { location_type: 'invalid' }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects invalid employment_type', () => {
    const input = { employment_type: 'intern' }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects page less than 1', () => {
    const input = { page: 0 }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects limit less than 1', () => {
    const input = { limit: 0 }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects limit exceeding max', () => {
    const input = { limit: 100 }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('coerces string page to number', () => {
    const input = { page: '3' }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(3)
    }
  })

  it('coerces string limit to number', () => {
    const input = { limit: '15' }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(15)
    }
  })

  it('validates complete query', () => {
    const input = {
      search: 'senior developer',
      location_type: 'hybrid' as const,
      employment_type: 'contract' as const,
      page: 2,
      limit: 25,
    }
    const result = positionQuerySchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})
