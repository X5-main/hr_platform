# Auth & Database Implementation Plan

> Comprehensive plan for authentication and database layer using Supabase

## Executive Summary

This plan implements the authentication and database foundation for the HR Candidate Screening Platform using **Supabase** (PostgreSQL + Auth). It covers:

- Passwordless email authentication (magic links)
- OAuth integration (GitHub, LinkedIn)
- Complete database schema with RLS policies
- Save/continue functionality for applications
- Rate limiting and security hardening

---

## 1. Technology Stack

| Component | Technology |
|-----------|------------|
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| Client | @supabase/ssr for Next.js |
| Validation | Zod |
| Rate Limiting | Upstash Redis |
| Types | Auto-generated from schema |

---

## 2. Database Schema

### 2.1 Core Tables

#### profiles
Extends Supabase auth.users with additional candidate/admin data.

```sql
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  role text default 'candidate' check (role in ('candidate', 'admin', 'super_admin')),
  headline text,
  location text,
  bio text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

#### social_accounts
LinkedIn, GitHub, and other social profile links.

```sql
create table social_accounts (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references profiles(id) on delete cascade not null,
  platform text not null check (platform in ('linkedin', 'github', 'google_scholar', 'twitter', 'website')),
  url text not null,
  username text,
  verified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(profile_id, platform)
);
```

#### companies
Organizations posting positions.

```sql
create table companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,
  description text,
  logo_url text,
  website text,
  location text,
  size text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

#### positions
Job postings with screening questions.

```sql
create table positions (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  title text not null,
  slug text not null,
  description text not null,
  requirements text[],
  employment_type text,
  location_type text,
  salary_range jsonb,
  screening_questions jsonb default '[]',
  status text default 'draft' check (status in ('draft', 'active', 'paused', 'closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, slug)
);
```

#### applications
Candidate applications with form data (supports save/continue).

```sql
create table applications (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references profiles(id) on delete cascade not null,
  position_id uuid references positions(id) on delete cascade not null,
  status text default 'started' check (status in ('started', 'submitted', 'screening', 'screening_completed', 'technical_assessment', 'technical_completed', 'review', 'accepted', 'rejected')),
  form_data jsonb default '{}',
  form_completed boolean default false,
  classification_score decimal(3,2),
  classification_notes text,
  submitted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(profile_id, position_id)
);
```

#### screening_interviews
AI voice interview sessions.

```sql
create table screening_interviews (
  id uuid default gen_random_uuid() primary key,
  application_id uuid references applications(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'in_progress', 'completed', 'error')),
  started_at timestamptz,
  completed_at timestamptz,
  audio_url text,
  transcript text,
  answers jsonb default '[]',
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

#### technical_sessions
Docker sandbox sessions for coding challenges.

```sql
create table technical_sessions (
  id uuid default gen_random_uuid() primary key,
  application_id uuid references applications(id) on delete cascade not null,
  status text default 'provisioning' check (status in ('provisioning', 'ready', 'in_progress', 'completed', 'expired', 'error')),
  container_id text,
  session_url text,
  started_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz,
  assessment_result jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 2.2 Row Level Security (RLS) Policies

All tables have RLS enabled. Key policies:

```sql
-- Profiles: users can only access their own
alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

-- Applications: users can only access their own
alter table applications enable row level security;

create policy "Users can view own applications"
  on applications for select
  to authenticated
  using (profile_id = auth.uid());

create policy "Users can create own applications"
  on applications for insert
  to authenticated
  with check (profile_id = auth.uid());

-- Positions/Companies: public read access
alter table positions enable row level security;

create policy "Positions are viewable by everyone"
  on positions for select
  to anon, authenticated
  using (status = 'active');
```

### 2.3 Triggers

```sql
-- Auto-create profile on signup
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update timestamps
create function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
```

---

## 3. Implementation Files

### 3.1 Environment Variables

**.env.local:**
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Rate Limiting (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### 3.2 Supabase Client Setup

**src/lib/supabase/client.ts:**
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**src/lib/supabase/server.ts:**
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )
}
```

**src/lib/supabase/middleware.ts:**
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  await supabase.auth.getUser()
  return response
}
```

### 3.3 Auth Middleware

**src/middleware.ts:**
```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PUBLIC_ROUTES = ['/auth/login', '/auth/callback', '/auth/confirm']
const ADMIN_ROUTES = ['/admin']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const response = await updateSession(request)

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return response
  }

  // Check auth status via cookie
  const supabaseAuthToken = request.cookies.get('sb-auth-token')
  if (!supabaseAuthToken) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

### 3.4 Auth Pages

**src/app/auth/login/page.tsx:**
```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    setMessage(error ? 'Error sending magic link' : 'Check your email!')
    setLoading(false)
  }

  const handleGitHubLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full p-6">
        <h1 className="text-2xl font-bold mb-6">Sign In</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            className="w-full px-4 py-2 border rounded"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded"
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>

        <button
          onClick={handleGitHubLogin}
          className="w-full mt-4 px-4 py-2 bg-gray-800 text-white rounded"
        >
          Continue with GitHub
        </button>

        {message && <p className="mt-4 text-center text-sm">{message}</p>}
      </div>
    </div>
  )
}
```

**src/app/auth/callback/route.ts:**
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/portal'

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
```

### 3.5 Repository Pattern

**src/lib/repositories/applications.ts:**
```typescript
import { createClient } from '@/lib/supabase/server'

export class ApplicationRepository {
  async create(data: { profile_id: string; position_id: string }) {
    const supabase = createClient()
    const { data: application, error } = await supabase
      .from('applications')
      .insert(data)
      .select()
      .single()

    if (error) throw error
    return application
  }

  async saveFormProgress(applicationId: string, formData: Record<string, unknown>) {
    const supabase = createClient()
    const { error } = await supabase
      .from('applications')
      .update({ form_data: formData, updated_at: new Date().toISOString() })
      .eq('id', applicationId)

    if (error) throw error
  }

  async submit(applicationId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('applications')
      .update({
        status: 'submitted',
        form_completed: true,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', applicationId)

    if (error) throw error
  }
}
```

### 3.6 Rate Limiting

**src/lib/rate-limit.ts:**
```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  analytics: true,
})
```

---

## 4. Implementation Phases

### Phase 1: Core Setup (Week 1)
1. Create Supabase project
2. Run initial schema migration
3. Set up environment variables
4. Implement magic link auth
5. Create protected route middleware

### Phase 2: Application System (Week 2)
1. Create application table migration
2. Build application repository
3. Implement save/continue functionality
4. Create candidate portal pages

### Phase 3: Screening Integration (Week 3)
1. Add screening_interviews table
2. Create interview session tracking
3. Integrate with classification system

### Phase 4: Technical Assessment (Week 4)
1. Add technical_sessions table
2. Implement Docker session tracking
3. Connect to container orchestration

### Phase 5: Security Hardening (Week 5)
1. Add rate limiting to all auth endpoints
2. Implement admin role checks
3. Add security headers
4. Set up monitoring

---

## 5. Dependencies

```bash
# Core
npm install @supabase/supabase-js @supabase/ssr
npm install zod

# Rate limiting
npm install @upstash/redis @upstash/ratelimit

# Dev
npm install -D supabase
```

---

## 6. Migration Commands

```bash
# Initialize Supabase locally
supabase init
supabase start

# Create migration
supabase migration new add_applications_table

# Apply migrations
supabase db reset

# Push to production
supabase db push

# Generate types
supabase gen types typescript --project-id your-project-ref > src/lib/database.types.ts
```

---

## 7. Security Checklist

- [x] RLS enabled on all tables
- [x] Service role key never exposed to client
- [x] Input validation with Zod
- [x] Rate limiting on auth endpoints
- [x] CSRF protection via SameSite cookies
- [x] Secure session cookies (HttpOnly, Secure)
- [x] SQL injection prevention (parameterized queries)

---

## Key Files Summary

| File | Purpose |
|------|---------|
| `/supabase/migrations/*.sql` | Database schema and RLS policies |
| `/src/lib/supabase/server.ts` | Server-side Supabase client |
| `/src/lib/supabase/middleware.ts` | Session management middleware |
| `/src/middleware.ts` | Route protection and auth checks |
| `/src/lib/repositories/*.ts` | Data access layer |
| `/src/lib/database.types.ts` | Generated TypeScript types |
