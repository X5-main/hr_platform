import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ApplicationRepository } from '@/lib/repositories/applications'

export default async function ApplicationsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const appRepo = new ApplicationRepository()
  const applications = await appRepo.listByProfile(user.id)

  const STATUS_LABELS: Record<string, string> = {
    started: 'Started',
    submitted: 'Submitted',
    screening: 'Screening',
    screening_completed: 'Screening Completed',
    technical_assessment: 'Technical Assessment',
    technical_completed: 'Technical Completed',
    review: 'Under Review',
    accepted: 'Accepted',
    rejected: 'Rejected',
  }

  const STATUS_COLORS: Record<string, string> = {
    started: 'bg-gray-100 text-gray-800',
    submitted: 'bg-yellow-100 text-yellow-800',
    screening: 'bg-blue-100 text-blue-800',
    screening_completed: 'bg-blue-100 text-blue-800',
    technical_assessment: 'bg-purple-100 text-purple-800',
    technical_completed: 'bg-purple-100 text-purple-800',
    review: 'bg-orange-100 text-orange-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">My Applications</h1>
        <p className="mt-2 text-gray-600">
          Track the status of your job applications.
        </p>
      </div>

      {applications.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="divide-y">
            {applications.map((app) => (
              <div
                key={app.id}
                className="p-6 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {app.positions.title}
                  </h3>
                  <p className="text-gray-600">{app.positions.companies.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Applied {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      STATUS_COLORS[app.status]
                    }`}
                  >
                    {STATUS_LABELS[app.status]}
                  </span>

                  {app.status === 'started' && (
                    <Link
                      href={`/applications/${app.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Continue →
                    </Link>
                  )}

                  {app.status === 'screening' && app.screening_interviews?.status === 'pending' && (
                    <Link
                      href={`/interview/${app.screening_interviews.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Start Interview →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
          <p className="text-gray-600 mb-4">You haven&apos;t applied to any positions yet.</p>
          <Link
            href="/positions"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Browse Positions
          </Link>
        </div>
      )}
    </div>
  )
}
