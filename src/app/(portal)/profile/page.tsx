import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileRepository } from '@/lib/repositories/profiles'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { SocialLinksForm } from '@/components/profile/SocialLinksForm'

export default async function ProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const profileRepo = new ProfileRepository()
  const profile = await profileRepo.getCurrentProfile()
  const socialAccounts = await profileRepo.getSocialAccounts(user.id)

  if (!profile) {
    redirect('/auth/login')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Your Profile</h1>
        <p className="mt-2 text-gray-600">
          Manage your personal information and social links.
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Personal Information</h2>
        <ProfileForm profile={profile} />
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Social Links</h2>
        <SocialLinksForm
          userId={user.id}
          accounts={socialAccounts}
        />
      </div>
    </div>
  )
}
