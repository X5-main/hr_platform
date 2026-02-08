import { describe, it, expect } from 'vitest'
import { applicationFormSchema, createApplicationSchema } from './application'

describe('applicationFormSchema', () => {
  it('validates a complete application form', () => {
    const input = {
      cover_letter: 'I am very interested in this position...',
      availability: 'Immediately',
      salary_expectations: '$100k - $150k',
      custom_answers: {
        question1: 'My answer to question 1',
        question2: 'My answer to question 2',
      },
    }
    const result = applicationFormSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('validates an empty form', () => {
    const result = applicationFormSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('validates form with only cover letter', () => {
    const input = {
      cover_letter: 'Short cover letter',
    }
    const result = applicationFormSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects cover_letter exceeding max length', () => {
    const input = {
      cover_letter: 'a'.repeat(5001),
    }
    const result = applicationFormSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('validates form with custom answers only', () => {
    const input = {
      custom_answers: {
        q1: 'Answer 1',
      },
    }
    const result = applicationFormSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects non-string cover_letter', () => {
    const input = {
      cover_letter: 123,
    }
    const result = applicationFormSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects non-object custom_answers', () => {
    const input = {
      custom_answers: 'invalid',
    }
    const result = applicationFormSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('createApplicationSchema', () => {
  it('validates a valid position_id', () => {
    const input = {
      position_id: '550e8400-e29b-41d4-a716-446655440000',
    }
    const result = createApplicationSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects missing position_id', () => {
    const result = createApplicationSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects invalid UUID format', () => {
    const input = {
      position_id: 'not-a-uuid',
    }
    const result = createApplicationSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects empty position_id', () => {
    const input = {
      position_id: '',
    }
    const result = createApplicationSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects non-string position_id', () => {
    const input = {
      position_id: 123,
    }
    const result = createApplicationSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})
