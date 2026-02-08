'use client'

import { useState } from 'react'
import type { ProfileInput } from '@/lib/validations/profile'

interface Profile {
  id: string
  email: string
  full_name: string | null
  headline: string | null
  location: string | null
  bio: string | null
}

interface ProfileFormProps {
  profile: Profile
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const [formData, setFormData] = useState<ProfileInput>({
    full_name: profile.full_name || '',
    headline: profile.headline || '',
    location: profile.location || '',
    bio: profile.bio || '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (result.success) {
        setMessage('Profile updated successfully')
      } else {
        setMessage(result.error || 'Failed to update profile')
      }
    } catch {
      setMessage('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
          Full Name
        </label>
        <input
          type="text"
          id="full_name"
          value={formData.full_name || ''}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          maxLength={100}
        />
      </div>

      <div>
        <label htmlFor="headline" className="block text-sm font-medium text-gray-700">
          Headline
        </label>
        <input
          type="text"
          id="headline"
          value={formData.headline || ''}
          onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
          placeholder="e.g., Senior Software Engineer at Tech Co"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          maxLength={200}
        />
      </div>

      <div>
        <label htmlFor="location" className="block text-sm font-medium text-gray-700">
          Location
        </label>
        <input
          type="text"
          id="location"
          value={formData.location || ''}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          placeholder="e.g., San Francisco, CA"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          maxLength={100}
        />
      </div>

      <div>
        <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
          Bio
        </label>
        <textarea
          id="bio"
          value={formData.bio || ''}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          rows={4}
          placeholder="Tell us about yourself..."
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          maxLength={2000}
        />
        <p className="mt-1 text-sm text-gray-500">
          {(formData.bio || '').length}/2000 characters
        </p>
      </div>

      {message && (
        <div className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {isSaving ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  )
}
