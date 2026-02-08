import { z } from 'zod'

export const positionSchema = z.object({
  id: z.string().uuid().optional(),
  company_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  description: z.string().min(1).max(10000),
  requirements: z.array(z.string()).optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'internship']).optional(),
  location_type: z.enum(['remote', 'on_site', 'hybrid']).optional(),
  salary_range: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().default('USD'),
  }).optional(),
  screening_questions: z.array(z.object({
    question: z.string(),
    type: z.enum(['text', 'number', 'boolean', 'select']),
    required: z.boolean().default(false),
    options: z.array(z.string()).optional(),
  })).default([]),
  status: z.enum(['draft', 'active', 'paused', 'closed']).default('draft'),
})

export const positionUpdateSchema = positionSchema.partial().omit({ id: true, company_id: true })

export const companySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  logo_url: z.string().url().optional(),
  website: z.string().url().optional(),
  location: z.string().max(200).optional(),
  size: z.string().max(50).optional(),
})

export const positionQuerySchema = z.object({
  search: z.string().optional(),
  location_type: z.enum(['remote', 'on_site', 'hybrid']).optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'internship']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type Position = z.infer<typeof positionSchema>
export type PositionUpdate = z.infer<typeof positionUpdateSchema>
export type Company = z.infer<typeof companySchema>
export type PositionQueryInput = z.infer<typeof positionQuerySchema>
