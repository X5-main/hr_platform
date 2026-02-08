import { describe, it, expect } from 'vitest'
import { profileSchema, socialAccountSchema } from './profile'

describe('profileSchema', () => {
  it('validates a complete profile', () => {
    const input = {
      full_name: 'John Doe',
      headline: 'Senior Software Engineer',
      location: 'San Francisco, CA',
      bio: 'I am a software engineer with 10 years of experience.',
    }
    const result = profileSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('validates a partial profile', () => {
    const input = {
      full_name: 'Jane Doe',
    }
    const result = profileSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('validates empty object', () => {
    const result = profileSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects full_name exceeding max length', () => {
    const input = {
      full_name: 'a'.repeat(101),
    }
    const result = profileSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects headline exceeding max length', () => {
    const input = {
      headline: 'a'.repeat(201),
    }
    const result = profileSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects location exceeding max length', () => {
    const input = {
      location: 'a'.repeat(101),
    }
    const result = profileSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects bio exceeding max length', () => {
    const input = {
      bio: 'a'.repeat(2001),
    }
    const result = profileSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects non-string values', () => {
    const input = {
      full_name: 123,
      headline: true,
    }
    const result = profileSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('socialAccountSchema', () => {
  it('validates a linkedin account', () => {
    const input = {
      platform: 'linkedin' as const,
      url: 'https://linkedin.com/in/johndoe',
      username: 'johndoe',
    }
    const result = socialAccountSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('validates a github account', () => {
    const input = {
      platform: 'github' as const,
      url: 'https://github.com/johndoe',
    }
    const result = socialAccountSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('validates a google_scholar account', () => {
    const input = {
      platform: 'google_scholar' as const,
      url: 'https://scholar.google.com/citations?user=123',
    }
    const result = socialAccountSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('validates without username', () => {
    const input = {
      platform: 'website' as const,
      url: 'https://johndoe.com',
    }
    const result = socialAccountSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects invalid platform', () => {
    const input = {
      platform: 'facebook',
      url: 'https://facebook.com/johndoe',
    }
    const result = socialAccountSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects invalid URL', () => {
    const input = {
      platform: 'linkedin' as const,
      url: 'not-a-url',
    }
    const result = socialAccountSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing URL', () => {
    const input = {
      platform: 'linkedin' as const,
    }
    const result = socialAccountSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing platform', () => {
    const input = {
      url: 'https://linkedin.com/in/johndoe',
    }
    const result = socialAccountSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})
