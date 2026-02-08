import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ApplicationRepository } from '@/lib/repositories/applications'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const appRepo = new ApplicationRepository()
  const applications = await appRepo.listByProfile(user.id)
  const activeApplications = applications.filter(
    (app) => app.status !== 'rejected' && app.status !== 'accepted'
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome back! Manage your job applications and profile.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900">Active Applications</h2>
          <p className="text-3xl font-bold text-blue-600 mt-2">{activeApplications.length}</p>
          <Link
            href="/applications"
            className="text-sm text-blue-600 hover:text-blue-800 mt-4 inline-block"
          >
            View all applications →
          </Link>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900">Browse Positions</h2>
          <p className="text-gray-600 mt-2">Find your next opportunity</p>
          <Link
            href="/positions"
            className="text-sm text-blue-600 hover:text-blue-800 mt-4 inline-block"
          >
            Browse positions →
          </Link>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
          <p className="text-gray-600 mt-2">Update your information</p>
          <Link
            href="/profile"
            className="text-sm text-blue-600 hover:text-blue-800 mt-4 inline-block"
          >
            Edit profile →
          </Link>
        </div>
      </div>

      {applications.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Recent Applications</h2>
          </div>
          <div className="divide-y">
            {applications.slice(0, 5).map((app) => (
              <div key={app.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{app.positions.title}</p>
                  <p className="text-sm text-gray-600">{app.positions.companies.name}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  app.status === 'submitted'
                    ? 'bg-yellow-100 text-yellow-800'
                    : app.status === 'screening'
                    ? 'bg-blue-100 text-blue-800'
                    : app.status === 'accepted'
                    ? 'bg-green-100 text-green-800'
                    : app.status === 'rejected'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {app.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
