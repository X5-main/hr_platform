# Implementation Plan: Candidate Portal Component

## Overview

The Candidate Portal is the primary user-facing interface of the HR Candidate Screening Platform. It provides authenticated candidates with access to profile management, position browsing, application tracking, and interview interfaces. This plan builds upon the Authentication & Database foundation and integrates with the Voice Screening and Technical Interview components.

---

## 1. Route Structure

### 1.1 Route Group Architecture

```
src/app/
├── (auth)/                    # Public auth routes (no layout wrapper)
│   ├── login/
│   │   └── page.tsx           # Magic link + OAuth login
│   ├── callback/
│   │   └── route.ts           # Supabase auth callback
│   └── confirm/
│       └── route.ts           # Email confirmation handler
│
├── (portal)/                  # Protected candidate portal
│   ├── layout.tsx             # Auth check + portal shell
│   ├── page.tsx               # Dashboard (redirect from /)
│   ├── profile/
│   │   ├── page.tsx           # Profile edit form
│   │   ├── social/
│   │   │   └── page.tsx       # Social accounts management
│   │   └── resume/
│   │       └── page.tsx       # Resume upload
│   ├── positions/
│   │   ├── page.tsx           # Position list + search
│   │   └── [slug]/
│   │       └── page.tsx       # Position detail + apply
│   ├── applications/
│   │   ├── page.tsx           # My applications list
│   │   └── [id]/
│   │       ├── page.tsx       # Application detail + status
│   │       └── interview/
│   │           └── page.tsx   # Voice interview interface
│   └── technical/
│       └── [sessionId]/
│           └── page.tsx       # Technical interview access
│
└── api/                       # API routes (if not using server actions)
```

### 1.2 Route Protection Strategy

**Middleware-based Protection** (`/src/middleware.ts`):

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PUBLIC_ROUTES = ['/', '/login', '/auth/callback', '/auth/confirm', '/api/webhooks']
const AUTH_ROUTES = ['/login']

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)
  const { pathname } = request.nextUrl
  const { data: { user } } = await supabase.auth.getUser()

  if (user && AUTH_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!user && !PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

---

## 2. Page Components and Layout

### 2.1 Portal Layout Structure

**Portal Layout** (`/src/app/(portal)/layout.tsx`):

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PortalShell } from '@/components/portal/PortalShell'
import { ProfileProvider } from '@/contexts/ProfileContext'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, social_accounts(*)')
    .eq('id', user.id)
    .single()

  return (
    <ProfileProvider initialProfile={profile}>
      <PortalShell user={user} profile={profile}>
        {children}
      </PortalShell>
    </ProfileProvider>
  )
}
```

**Portal Shell Component** (`/src/components/portal/PortalShell.tsx`):

```typescript
interface PortalShellProps {
  user: User
  profile: ProfileWithSocial
  children: React.ReactNode
}

export function PortalShell({ user, profile, children }: PortalShellProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader user={user} profile={profile} />
      <div className="flex">
        <PortalSidebar profileCompleteness={calculateCompleteness(profile)} />
        <main className="flex-1 p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
```

### 2.2 Page Component Inventory

| Page | Component | Key Features |
|------|-----------|--------------|
| `/login` | `LoginPage` | Magic link form, OAuth buttons (GitHub, LinkedIn), redirect handling |
| `/dashboard` | `DashboardPage` | Quick stats, recent applications, action items, profile completeness |
| `/profile` | `ProfileEditPage` | Form with validation, auto-save, avatar upload |
| `/profile/social` | `SocialAccountsPage` | LinkedIn, GitHub, Scholar links, verification status |
| `/profile/resume` | `ResumeUploadPage` | Drag-drop upload, PDF preview, version history |
| `/positions` | `PositionsListPage` | Grid/list view, search, filters, pagination |
| `/positions/[slug]` | `PositionDetailPage` | Full description, requirements, apply CTA |
| `/applications` | `ApplicationsListPage` | Status cards, progress indicators, continue drafts |
| `/applications/[id]` | `ApplicationDetailPage` | Timeline, status history, screening results |
| `/applications/[id]/interview` | `VoiceInterviewPage` | ElevenLabs integration, WebSocket connection |
| `/technical/[sessionId]` | `TechnicalSessionPage` | noVNC embed, session timer, instructions |

---

## 3. Integration Points with Supabase

### 3.1 Data Fetching Patterns

**Server Components** (default approach):

```typescript
// src/app/(portal)/positions/page.tsx
import { createClient } from '@/lib/supabase/server'

export default async function PositionsPage({ searchParams }: { searchParams: { q?: string; dept?: string } }) {
  const supabase = createClient()

  let query = supabase
    .from('positions')
    .select('*, companies(name, logo_url)')
    .eq('status', 'active')

  if (searchParams.q) {
    query = query.ilike('title', `%${searchParams.q}%`)
  }

  const { data: positions, error } = await query

  if (error) throw error

  return <PositionsList positions={positions} />
}
```

**Client Components** (for interactive features):

```typescript
// src/hooks/useApplications.ts
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useApplications() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchApplications = async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('*, positions(title, companies(name))')
        .order('created_at', { ascending: false })

      if (!error) setApplications(data || [])
      setLoading(false)
    }

    fetchApplications()

    // Real-time subscription
    const subscription = supabase
      .channel('applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' },
        (payload) => {
          setApplications(current =>
            current.map(app => app.id === payload.new.id ? { ...app, ...payload.new } : app)
          )
        }
      )
      .subscribe()

    return () => subscription.unsubscribe()
  }, [])

  return { applications, loading }
}
```

### 3.2 Server Actions

**Profile Update Action** (`/src/app/(portal)/profile/actions.ts`):

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(100),
  headline: z.string().max(200).optional(),
  location: z.string().max(100).optional(),
  bio: z.string().max(2000).optional(),
})

export async function updateProfile(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get('fullName'),
    headline: formData.get('headline'),
    location: formData.get('location'),
    bio: formData.get('bio'),
  })

  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      headline: parsed.data.headline,
      location: parsed.data.location,
      bio: parsed.data.bio,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/profile')
  revalidatePath('/dashboard')
  return { success: true }
}
```

---

## 4. Interview Page Architecture

### 4.1 Voice Interview Flow

**Interview Page** (`/src/app/(portal)/applications/[id]/interview/page.tsx`):

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { VoiceInterview } from '@/components/interview/VoiceInterview'

export default async function InterviewPage({ params: { id } }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: application } = await supabase
    .from('applications')
    .select(`*, positions(title, screening_questions), screening_interviews(*)`)
    .eq('id', id)
    .eq('profile_id', user?.id)
    .single()

  if (!application) notFound()
  if (application.status !== 'screening_scheduled') {
    redirect(`/applications/${id}`)
  }

  let interview = application.screening_interviews

  if (!interview) {
    const { data: newInterview } = await supabase
      .from('screening_interviews')
      .insert({
        application_id: id,
        status: 'pending',
        scheduled_at: new Date().toISOString(),
      })
      .select()
      .single()
    interview = newInterview
  }

  return (
    <VoiceInterview
      interviewId={interview.id}
      positionTitle={application.positions.title}
      questions={application.positions.screening_questions}
    />
  )
}
```

**Voice Interview Component** (`/src/components/interview/VoiceInterview.tsx`):

```typescript
'use client'

import { useState, useCallback } from 'react'
import { useInterviewSocket } from '@/hooks/useInterviewSocket'
import { AudioVisualizer } from './AudioVisualizer'
import { TranscriptPanel } from './TranscriptPanel'
import { InterviewControls } from './InterviewControls'
import { ConnectionStatus } from './ConnectionStatus'

interface VoiceInterviewProps {
  interviewId: string
  positionTitle: string
  questions: string[]
}

export function VoiceInterview({ interviewId, positionTitle, questions }: VoiceInterviewProps) {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(0)

  const handleTranscriptUpdate = useCallback((update: TranscriptUpdate) => {
    setTranscript(current => {
      const newTranscript = [...current]
      const index = newTranscript.findIndex(s => s.id === update.segmentId)
      if (index >= 0) {
        newTranscript[index] = { ...newTranscript[index], ...update }
      } else {
        newTranscript.push({
          id: update.segmentId,
          speaker: update.speaker,
          text: update.text,
          timestamp: update.timestamp,
        })
      }
      return newTranscript
    })
  }, [])

  const { isConnected, isConnecting, sendAudio, endInterview, connectionQuality } =
    useInterviewSocket({
      interviewId,
      onTranscriptUpdate: handleTranscriptUpdate,
      onCompleted: () => {
        window.location.href = `/applications/${interviewId}/complete`
      },
    })

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Screening Interview</h1>
          <p className="text-gray-600">{positionTitle}</p>
        </div>
        <ConnectionStatus isConnected={isConnected} quality={connectionQuality} />
      </div>

      <div className="flex flex-1 gap-6">
        <div className="flex flex-1 flex-col gap-4">
          <AudioVisualizer isActive={isRecording} onAudioData={sendAudio} />
          <div className="rounded-lg bg-gray-100 p-6">
            <h3 className="mb-2 font-semibold">Current Question</h3>
            <p className="text-lg">{questions[currentQuestion]}</p>
          </div>
          <InterviewControls
            isRecording={isRecording}
            onStart={() => setIsRecording(true)}
            onEnd={endInterview}
            disabled={!isConnected}
          />
        </div>
        <div className="w-96">
          <TranscriptPanel segments={transcript} />
        </div>
      </div>
    </div>
  )
}
```

---

## 5. Status/Polling for Real-time Updates

### 5.1 Polling Strategy

**Application Status Polling** (`/src/hooks/usePollingStatus.ts`):

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'

interface UsePollingStatusOptions {
  applicationId: string
  interval?: number
  onStatusChange?: (newStatus: string, oldStatus: string) => void
}

export function usePollingStatus({ applicationId, interval = 5000, onStatusChange }: UsePollingStatusOptions) {
  const [status, setStatus] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(true)

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/applications/${applicationId}/status`)
      const data = await response.json()
      if (data.status !== status) {
        onStatusChange?.(data.status, status || '')
        setStatus(data.status)
      }
    } catch (error) {
      console.error('Status check failed:', error)
    }
  }, [applicationId, status, onStatusChange])

  useEffect(() => {
    if (!isPolling) return
    checkStatus()
    const intervalId = setInterval(checkStatus, interval)
    return () => clearInterval(intervalId)
  }, [isPolling, interval, checkStatus])

  return { status, isPolling, setIsPolling }
}
```

---

## 6. Mobile Responsiveness Considerations

### 6.1 Responsive Design Strategy

**Interview Device Detection** (`/src/components/interview/DeviceCheck.tsx`):

```typescript
'use client'

import { useEffect, useState } from 'react'

export function DeviceCheck({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkDevice = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
      const isSmallScreen = window.innerWidth < 768
      setIsMobile(isMobileDevice || isSmallScreen)
    }
    checkDevice()
    window.addEventListener('resize', checkDevice)
    return () => window.removeEventListener('resize', checkDevice)
  }, [])

  if (isMobile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h2 className="mb-4 text-xl font-bold">Desktop Required</h2>
          <p className="text-gray-600">
            The screening interview requires a desktop or laptop computer with a microphone.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)

| Task | Files | Priority |
|------|-------|----------|
| Set up route structure | `src/app/(auth)/`, `src/app/(portal)/` | High |
| Create portal layout shell | `PortalShell.tsx`, `PortalHeader.tsx`, `PortalSidebar.tsx` | High |
| Implement login page | `login/page.tsx`, `AuthForm.tsx` | High |
| Build dashboard | `dashboard/page.tsx` | High |
| Profile read view | `profile/page.tsx` | High |

### Phase 2: Profile Management (Week 2)

| Task | Files | Priority |
|------|-------|----------|
| Profile edit form | `profile/actions.ts`, `ProfileForm.tsx` | High |
| Social accounts management | `profile/social/page.tsx`, `SocialLinks.tsx` | High |
| Resume upload | `profile/resume/page.tsx`, `ResumeUploader.tsx` | High |
| Profile completeness calculation | `lib/profile-completeness.ts` | Medium |
| Avatar upload | `AvatarUpload.tsx` | Medium |

### Phase 3: Position Browser (Week 3)

| Task | Files | Priority |
|------|-------|----------|
| Positions list page | `positions/page.tsx` | High |
| Position detail page | `positions/[slug]/page.tsx` | High |
| Search and filters | `PositionFilters.tsx` | High |
| Application submission | `apply/actions.ts` | High |
| Position card components | `PositionCard.tsx`, `PositionGrid.tsx` | Medium |

### Phase 4: Application Dashboard (Week 4)

| Task | Files | Priority |
|------|-------|----------|
| Applications list | `applications/page.tsx` | High |
| Application detail view | `applications/[id]/page.tsx` | High |
| Status timeline | `StatusTimeline.tsx` | High |
| Real-time status updates | `useApplicationStatus.ts` | High |
| Draft application continuation | `ApplicationContinue.tsx` | Medium |

### Phase 5: Interview Interface (Week 5-6)

| Task | Files | Priority |
|------|-------|----------|
| Voice interview page shell | `interview/page.tsx` | High |
| ElevenLabs WebSocket integration | `useInterviewSocket.ts` | High |
| Audio visualizer component | `AudioVisualizer.tsx` | High |
| Transcript panel | `TranscriptPanel.tsx` | High |
| Interview controls | `InterviewControls.tsx` | High |
| Technical session access | `technical/[sessionId]/page.tsx` | High |
| Session countdown/timer | `SessionTimer.tsx` | Medium |
| Interview completion screen | `CompletionScreen.tsx` | Medium |

### Phase 6: Polish & Mobile (Week 7)

| Task | Files | Priority |
|------|-------|----------|
| Mobile responsive pass | All components | High |
| Loading states | `Skeleton.tsx`, `LoadingSpinner.tsx` | Medium |
| Error boundaries | `error.tsx` files | Medium |
| Empty states | `EmptyState.tsx` | Medium |
| Toast notifications | `ToastProvider.tsx` | Medium |

---

## 8. Critical Files for Implementation

- `/src/app/(portal)/layout.tsx` - Protected portal layout with auth check and profile context
- `/src/app/(portal)/profile/page.tsx` - Profile management with server actions for updates
- `/src/app/(portal)/positions/page.tsx` - Position browser with search, filters, and pagination
- `/src/app/(portal)/applications/page.tsx` - Application dashboard with real-time status updates
- `/src/app/(portal)/applications/[id]/interview/page.tsx` - Voice interview interface with ElevenLabs WebSocket integration
- `/src/hooks/useInterviewSocket.ts` - WebSocket hook for real-time interview communication
- `/src/components/portal/PortalShell.tsx` - Main portal layout shell with navigation
- `/src/components/interview/VoiceInterview.tsx` - Core interview component integrating all interview sub-components
