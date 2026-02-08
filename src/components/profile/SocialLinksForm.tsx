'use client'

import { useState } from 'react'
import type { SocialAccountInput } from '@/lib/validations/profile'

interface SocialAccount {
  id: string
  platform: 'linkedin' | 'github' | 'google_scholar' | 'twitter' | 'website'
  url: string
  username: string | null
}

interface SocialLinksFormProps {
  userId: string
  accounts: SocialAccount[]
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  google_scholar: 'Google Scholar',
  twitter: 'Twitter',
  website: 'Website',
}

export function SocialLinksForm({ accounts }: SocialLinksFormProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newAccount, setNewAccount] = useState<SocialAccountInput>({
    platform: 'linkedin',
    url: '',
    username: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/profile/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount),
      })

      const result = await response.json()

      if (result.success) {
        setMessage('Social link added successfully')
        setIsAdding(false)
        setNewAccount({ platform: 'linkedin', url: '', username: '' })
        window.location.reload()
      } else {
        setMessage(result.error || 'Failed to add social link')
      }
    } catch {
      setMessage('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async (accountId: string) => {
    if (!confirm('Are you sure you want to remove this link?')) return

    try {
      const response = await fetch(`/api/profile/social/${accountId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        window.location.reload()
      } else {
        setMessage(result.error || 'Failed to remove link')
      }
    } catch {
      setMessage('An error occurred')
    }
  }

  return (
    <div className="space-y-6">
      {accounts.length > 0 ? (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {PLATFORM_LABELS[account.platform]}
                </p>
                <a
                  href={account.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {account.url}
                </a>
              </div>
              <button
                onClick={() => handleRemove(account.id)}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500">No social links added yet.</p>
      )}

      {!isAdding ? (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Add Social Link
        </button>
      ) : (
        <form onSubmit={handleAdd} className="space-y-4 border-t pt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Platform
            </label>
            <select
              value={newAccount.platform}
              onChange={(e) =>
                setNewAccount({
                  ...newAccount,
                  platform: e.target.value as SocialAccountInput['platform'],
                })
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="linkedin">LinkedIn</option>
              <option value="github">GitHub</option>
              <option value="google_scholar">Google Scholar</option>
              <option value="twitter">Twitter</option>
              <option value="website">Website</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              URL
            </label>
            <input
              type="url"
              value={newAccount.url}
              onChange={(e) =>
                setNewAccount({ ...newAccount, url: e.target.value })
              }
              placeholder="https://..."
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Username (optional)
            </label>
            <input
              type="text"
              value={newAccount.username}
              onChange={(e) =>
                setNewAccount({ ...newAccount, username: e.target.value })
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>

          {message && (
            <div
              className={`text-sm ${
                message.includes('success') ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {message}
            </div>
          )}

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSaving ? 'Adding...' : 'Add Link'}
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
