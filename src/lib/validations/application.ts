import { z } from 'zod'

// Schema for validating application form data (save/continue functionality)
export const applicationFormSchema = z.object({
  cover_letter: z.string().max(5000).optional(),
  availability: z.string().max(100).optional(),
  salary_expectations: z.string().max(100).optional(),
  custom_answers: z.record(z.string()).optional(),
})

// Schema for creating a new application
export const createApplicationSchema = z.object({
  position_id: z.string().uuid(),
})

export const applicationSchema = z.object({
  id: z.string().uuid().optional(),
  profile_id: z.string().uuid(),
  position_id: z.string().uuid(),
  status: z.enum([
    'started',
    'submitted',
    'screening',
    'screening_completed',
    'technical_assessment',
    'technical_completed',
    'review',
    'accepted',
    'rejected'
  ]).default('started'),
  form_data: z.record(z.unknown()).default({}),
  form_completed: z.boolean().default(false),
  classification_score: z.number().min(0).max(1).optional(),
  classification_notes: z.string().optional(),
  submitted_at: z.string().datetime().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
})

export const applicationUpdateSchema = applicationSchema.partial().omit({ id: true, profile_id: true, position_id: true })

export const saveFormProgressSchema = z.object({
  applicationId: z.string().uuid(),
  formData: z.record(z.unknown()),
})

export const submitApplicationSchema = z.object({
  applicationId: z.string().uuid(),
})

export type Application = z.infer<typeof applicationSchema>
export type ApplicationUpdate = z.infer<typeof applicationUpdateSchema>
export type SaveFormProgressInput = z.infer<typeof saveFormProgressSchema>
export type SubmitApplicationInput = z.infer<typeof submitApplicationSchema>
export type ApplicationFormData = z.infer<typeof applicationFormSchema>
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>
