import { z } from 'zod'

// Schema for validating profile form data (all fields optional for updates)
export const profileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  headline: z.string().max(200).optional(),
  location: z.string().max(100).optional(),
  bio: z.string().max(2000).optional(),
})

export const profileUpdateSchema = profileSchema

export const socialAccountSchema = z.object({
  platform: z.enum(['linkedin', 'github', 'google_scholar', 'twitter', 'website']),
  url: z.string().url(),
  username: z.string().optional(),
})

export type ProfileInput = z.infer<typeof profileSchema>
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>
export type SocialAccountInput = z.infer<typeof socialAccountSchema>
