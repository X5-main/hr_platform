# Implementation Plan: Authentication & Database Component (Supabase)

## Overview

This plan details the implementation of the Authentication and Database layer for the HR Candidate Screening Platform using Supabase. This replaces the self-hosted PostgreSQL and NextAuth.js approach with Supabase's managed services.

---

## 1. Supabase Project Setup

### 1.1 Project Creation

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com) and create a new project
   - Choose a project name (e.g., `hr-screening-platform`)
   - Select a region closest to your primary user base
   - Set a secure database password (store in password manager)

2. **Environment Configuration**
   Create `.env.local` file with the following variables:

   ```
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

   # Application
   NEXT_PUBLIC_APP_URL=http://localhost:3000

   # OAuth Providers (to be configured)
   LINKEDIN_CLIENT_ID=
   LINKEDIN_CLIENT_SECRET=
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   ```

3. **Install Dependencies**

   ```bash
   npm install @supabase/supabase-js @supabase/auth-helpers-nextjs @supabase/ssr
   ```

### 1.2 Project Structure

Create the following directory structure for Supabase integration:

```
src/
├── lib/
│   ├── supabase/
│   │   ├── client.ts          # Browser client
│   │   ├── server.ts          # Server client
│   │   ├── middleware.ts      # Auth middleware
│   │   └── admin.ts           # Service role client (server-only)
│   └── database.types.ts      # Generated Supabase types
├── app/
│   ├── auth/
│   │   ├── callback/
│   │   │   └── route.ts       # Auth callback handler
│   │   ├── confirm/
│   │   │   └── route.ts       # Email confirmation
│   │   └── login/
│   │       └── page.tsx       # Login page
│   └── (portal)/
│       └── layout.tsx         # Protected layout with auth check
└── middleware.ts              # Global auth middleware
```

---

## 2. Database Schema Design

### 2.1 Core Tables

#### profiles
Extends Supabase Auth users with candidate profile information.

```sql
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  headline text,                    -- Professional headline
  location text,
  bio text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table profiles enable row level security;

-- RLS Policies
create policy "Users can view own profile"
  on profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Public profiles are viewable"
  on profiles for select
  to anon
  using (true);
```

#### social_accounts
Stores linked social media and professional accounts.

```sql
create type platform_type as enum ('linkedin', 'github', 'google_scholar', 'twitter', 'website');

create table social_accounts (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references profiles(id) on delete cascade not null,
  platform platform_type not null,
  username text,
  url text not null,
  verified boolean default false,
  metadata jsonb default '{}',      -- Platform-specific data (followers, repos, etc.)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(profile_id, platform)
);

-- Enable RLS
alter table social_accounts enable row level security;

-- RLS Policies
create policy "Users can manage own social accounts"
  on social_accounts for all
  to authenticated
  using (profile_id = auth.uid());
```

#### companies
Company information for the portal.

```sql
create table companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,        -- URL-friendly identifier
  logo_url text,
  website text,
  description text,
  culture text,                     -- Company culture description
  benefits jsonb default '[]',      -- Array of benefit strings
  location text,
  size text,                        -- Company size (e.g., "10-50 employees")
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table companies enable row level security;

-- RLS Policies - Public read, Admin write
create policy "Companies are viewable by everyone"
  on companies for select
  to anon, authenticated
  using (true);
```

#### positions
Job positions/role listings.

```sql
create type position_status as enum ('draft', 'active', 'paused', 'closed');
create type employment_type as enum ('full_time', 'part_time', 'contract', 'internship');

create table positions (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  title text not null,
  slug text not null,
  description text not null,
  requirements text[],              -- Array of requirement strings
  responsibilities text[],          -- Array of responsibility strings
  employment_type employment_type not null,
  location text,                    -- Location or "Remote"
  salary_range jsonb,               -- { min: number, max: number, currency: string }
  status position_status default 'draft',
  screening_questions jsonb default '[]', -- Questions for AI screening
  technical_assessment boolean default false, -- Requires Phase 2
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(company_id, slug)
);

-- Enable RLS
alter table positions enable row level security;

-- RLS Policies
create policy "Active positions are viewable by everyone"
  on positions for select
  to anon, authenticated
  using (status = 'active');

create policy "Users can view all positions"
  on positions for select
  to authenticated
  using (true);
```

#### applications
Candidate applications to positions.

```sql
create type application_status as enum (
  'started',           -- Started but not submitted
  'submitted',         -- Submitted, awaiting screening
  'screening_scheduled',
  'screening_completed',
  'screening_passed',
  'screening_failed',
  'technical_invited',
  'technical_completed',
  'offer_pending',
  'offer_accepted',
  'offer_declined',
  'withdrawn',
  'rejected'
);

create table applications (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references profiles(id) on delete cascade not null,
  position_id uuid references positions(id) on delete cascade not null,
  status application_status default 'started',

  -- Form data (save/continue later)
  form_data jsonb default '{}',     -- Store partial form responses
  form_completed boolean default false,

  -- Resume/CV
  resume_url text,

  -- Cover letter
  cover_letter text,

  -- Additional answers
  additional_answers jsonb default '{}',

  -- Timestamps
  started_at timestamptz default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(profile_id, position_id)
);

-- Enable RLS
alter table applications enable row level security;

-- RLS Policies
create policy "Users can view own applications"
  on applications for select
  to authenticated
  using (profile_id = auth.uid());

create policy "Users can create own applications"
  on applications for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "Users can update own draft applications"
  on applications for update
  to authenticated
  using (profile_id = auth.uid() and status = 'started');
```

#### application_events
Audit trail for application status changes.

```sql
create table application_events (
  id uuid default gen_random_uuid() primary key,
  application_id uuid references applications(id) on delete cascade not null,
  event_type text not null,         -- e.g., 'status_change', 'form_saved', 'submitted'
  data jsonb default '{}',          -- Event-specific data
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

-- Enable RLS
alter table application_events enable row level security;

-- RLS Policies
create policy "Users can view own application events"
  on application_events for select
  to authenticated
  using (
    application_id in (
      select id from applications where profile_id = auth.uid()
    )
  );
```

### 2.2 Database Functions and Triggers

#### Auto-create profile on signup

```sql
-- Function to create profile on user signup
create or replace function public.handle_new_user()
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

-- Trigger to call function on user creation
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

#### Update timestamp trigger

```sql
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to all tables with updated_at
create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure public.handle_updated_at();

create trigger social_accounts_updated_at
  before update on social_accounts
  for each row execute procedure public.handle_updated_at();

create trigger positions_updated_at
  before update on positions
  for each row execute procedure public.handle_updated_at();

create trigger applications_updated_at
  before update on applications
  for each row execute procedure public.handle_updated_at();
```

#### Application event logging

```sql
create or replace function public.log_application_event()
returns trigger as $$
begin
  insert into application_events (application_id, event_type, data, created_by)
  values (
    new.id,
    case
      when old.status is distinct from new.status then 'status_change'
      when old.form_data is distinct from new.form_data then 'form_saved'
      when old.submitted_at is null and new.submitted_at is not null then 'submitted'
      else 'updated'
    end,
    jsonb_build_object(
      'old_status', old.status,
      'new_status', new.status,
      'changed_fields', (
        select jsonb_agg(key)
        from jsonb_each(to_jsonb(new))
        where to_jsonb(new)->key is distinct from to_jsonb(old)->key
      )
    ),
    auth.uid()
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger applications_event_log
  after update on applications
  for each row execute procedure public.log_application_event();
```

### 2.3 Indexes

```sql
-- Performance indexes
create index idx_social_accounts_profile_id on social_accounts(profile_id);
create index idx_positions_company_id on positions(company_id);
create index idx_positions_status on positions(status);
create index idx_applications_profile_id on applications(profile_id);
create index idx_applications_position_id on applications(position_id);
create index idx_applications_status on applications(status);
create index idx_application_events_application_id on application_events(application_id);
```

---

## 3. Auth Configuration

### 3.1 Magic Link Authentication

#### Supabase Dashboard Configuration

1. **Authentication Settings**
   - Go to Authentication > Settings in Supabase Dashboard
   - Enable "Email" provider
   - Disable "Confirm email" (magic links are pre-confirmed)
   - Set "Mailer" to Supabase Auth (or configure custom SMTP)

2. **Email Templates**

   Magic Link Email Template:
   ```html
   <h2>Magic Link</h2>
   <p>Click the button below to sign in to the HR Screening Platform:</p>
   <a href="{{ .ConfirmationURL }}">Sign In</a>
   <p>This link expires in 1 hour.</p>
   <p>If you didn't request this, please ignore this email.</p>
   ```

3. **Site URL and Redirects**
   - Site URL: `http://localhost:3000` (dev) / `https://yourdomain.com` (prod)
   - Add redirect URLs:
     - `http://localhost:3000/auth/callback`
     - `https://yourdomain.com/auth/callback`

### 3.2 OAuth Providers (Social Login)

Configure these in Supabase Dashboard > Authentication > Providers:

#### GitHub OAuth

1. Go to GitHub Settings > Developer Settings > OAuth Apps
2. Create new OAuth App:
   - Application name: HR Screening Platform
   - Homepage URL: `https://yourdomain.com`
   - Authorization callback URL: `https://your-project-ref.supabase.co/auth/v1/callback`
3. Copy Client ID and Secret to Supabase GitHub provider settings
4. Enable "GitHub" provider in Supabase

#### LinkedIn OAuth

1. Go to LinkedIn Developer Portal
2. Create app and request "Sign In with LinkedIn" product
3. Add OAuth 2.0 redirect URL: `https://your-project-ref.supabase.co/auth/v1/callback`
4. Copy Client ID and Secret to Supabase LinkedIn provider settings
5. Enable "LinkedIn" provider in Supabase

**Note**: Google Scholar does not provide OAuth. Users will manually add their Scholar profile URL.

### 3.3 Client-Side Implementation

#### Supabase Client Setup

`/src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

`/src/lib/supabase/server.ts`:
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
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Handle middleware context
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Handle middleware context
          }
        },
      },
    }
  )
}
```

`/src/lib/supabase/middleware.ts`:
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  await supabase.auth.getUser()

  return response
}
```

#### Middleware

`/src/middleware.ts`:
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

#### Auth Callback Handler

`/src/app/auth/callback/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

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

---

## 4. API Integration Patterns

### 4.1 Data Access Patterns

#### Type-Safe Database Client

Generate types from Supabase schema:

```bash
npx supabase gen types typescript --project-id your-project-ref > src/lib/database.types.ts
```

#### Repository Pattern

`/src/lib/repositories/profiles.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { type Database } from '@/lib/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export class ProfileRepository {
  async getById(id: string): Promise<Profile | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  }

  async update(id: string, updates: ProfileUpdate): Promise<Profile> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }
}
```

#### Server Actions Pattern

`/src/app/(portal)/profile/actions.ts`:
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

  // Validate user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Validate input
  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get('fullName'),
    headline: formData.get('headline'),
    location: formData.get('location'),
    bio: formData.get('bio'),
  })

  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  // Update profile
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      headline: parsed.data.headline,
      location: parsed.data.location,
      bio: parsed.data.bio,
    })
    .eq('id', user.id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/profile')
  return { success: true }
}
```

### 4.2 Application Form Save/Continue Pattern

`/src/lib/repositories/applications.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { type Database } from '@/lib/database.types'

type Application = Database['public']['Tables']['applications']['Row']
type ApplicationInsert = Database['public']['Tables']['applications']['Insert']
type ApplicationUpdate = Database['public']['Tables']['applications']['Update']

export class ApplicationRepository {
  async create(data: ApplicationInsert): Promise<Application> {
    const supabase = createClient()
    const { data: application, error } = await supabase
      .from('applications')
      .insert(data)
      .select()
      .single()

    if (error) throw error
    return application
  }

  async saveFormProgress(
    applicationId: string,
    formData: Record<string, unknown>
  ): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('applications')
      .update({
        form_data: formData,
        updated_at: new Date().toISOString()
      })
      .eq('id', applicationId)

    if (error) throw error
  }

  async getWithFormData(applicationId: string): Promise<Application | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('applications')
      .select('*, position:positions(*)')
      .eq('id', applicationId)
      .single()

    if (error) throw error
    return data
  }

  async submit(applicationId: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('applications')
      .update({
        status: 'submitted',
        form_completed: true,
        submitted_at: new Date().toISOString()
      })
      .eq('id', applicationId)
      .eq('status', 'started') // Only allow submitting started applications

    if (error) throw error
  }
}
```

### 4.3 Social Accounts Management

`/src/app/(portal)/profile/social/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const addSocialAccountSchema = z.object({
  platform: z.enum(['linkedin', 'github', 'google_scholar', 'twitter', 'website']),
  url: z.string().url(),
  username: z.string().optional(),
})

export async function addSocialAccount(formData: FormData) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const parsed = addSocialAccountSchema.safeParse({
    platform: formData.get('platform'),
    url: formData.get('url'),
    username: formData.get('username'),
  })

  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  // Upsert social account
  const { error } = await supabase
    .from('social_accounts')
    .upsert({
      profile_id: user.id,
      platform: parsed.data.platform,
      url: parsed.data.url,
      username: parsed.data.username,
    }, {
      onConflict: 'profile_id,platform'
    })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function removeSocialAccount(platform: string) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('social_accounts')
    .delete()
    .eq('profile_id', user.id)
    .eq('platform', platform)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
```

---

## 5. Migration Strategy

### 5.1 Local Development Setup

1. **Install Supabase CLI**

   ```bash
   brew install supabase/tap/supabase  # macOS
   # or
   npm install -g supabase
   ```

2. **Initialize Local Project**

   ```bash
   supabase init
   ```

3. **Start Local Supabase**

   ```bash
   supabase start
   ```

   This starts local PostgreSQL, Auth, Storage, and other services.

### 5.2 Migration Files Structure

```
supabase/
├── migrations/
│   ├── 00000000000000_initial_schema.sql
│   ├── 20240208120000_add_profiles.sql
│   ├── 20240208130000_add_social_accounts.sql
│   ├── 20240208140000_add_companies.sql
│   ├── 20240208150000_add_positions.sql
│   └── 20240208160000_add_applications.sql
├── seed.sql                          # Seed data for development
└── config.toml                       # Local configuration
```

### 5.3 Migration Commands

```bash
# Create new migration
supabase migration new add_interview_tables

# Apply migrations locally
supabase db reset

# Push migrations to remote project
supabase db push

# Generate TypeScript types
supabase gen types typescript --local > src/lib/database.types.ts
# or for remote:
supabase gen types typescript --project-id your-project-ref > src/lib/database.types.ts
```

### 5.4 Seed Data

`/supabase/seed.sql`:
```sql
-- Seed companies
insert into companies (id, name, slug, description, location, size) values
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'TechCorp', 'techcorp', 'Leading AI company', 'San Francisco, CA', '100-500'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'StartupXYZ', 'startupxyz', 'Fast-growing startup', 'Remote', '10-50');

-- Seed positions
insert into positions (id, company_id, title, slug, description, requirements, employment_type, status) values
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Senior Full Stack Engineer', 'senior-full-stack', 'Build amazing products', ARRAY['5+ years experience', 'React', 'Node.js'], 'full_time', 'active'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Machine Learning Engineer', 'ml-engineer', 'Work on cutting-edge AI', ARRAY['Python', 'PyTorch', 'MLOps'], 'full_time', 'active');
```

### 5.5 Production Deployment Checklist

- [ ] Create production Supabase project
- [ ] Configure production environment variables
- [ ] Set up custom SMTP for auth emails
- [ ] Configure OAuth providers with production URLs
- [ ] Run migrations: `supabase db push`
- [ ] Verify RLS policies are working correctly
- [ ] Set up database backups (automatic on Supabase)
- [ ] Configure connection pooling (PgBouncer enabled by default)
- [ ] Set up monitoring and alerts

---

## 6. Security Considerations

### 6.1 Row Level Security (RLS)

All tables have RLS enabled with appropriate policies:

- **profiles**: Users can only read/update their own profile
- **social_accounts**: Users can only manage their own accounts
- **applications**: Users can only access their own applications
- **companies/positions**: Public read access

### 6.2 Service Role Key Usage

Only use `SUPABASE_SERVICE_ROLE_KEY` in server-side contexts (never in browser):

```typescript
// Server-only admin client
import { createClient } from '@supabase/supabase-js'

export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)
```

### 6.3 Input Validation

Always validate inputs with Zod before database operations:

```typescript
import { z } from 'zod'

const schema = z.object({
  // Define strict schemas
})
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

Test repositories with mocked Supabase client:

```typescript
// __tests__/repositories/applications.test.ts
import { ApplicationRepository } from '@/lib/repositories/applications'

// Mock Supabase client
jest.mock('@/lib/supabase/server')

describe('ApplicationRepository', () => {
  it('should save form progress', async () => {
    // Test implementation
  })
})
```

### 7.2 Integration Tests

Use Supabase local stack for integration tests:

```bash
# Start local Supabase
supabase start

# Run tests
npm test
```

### 7.3 E2E Tests

Use Playwright with test user seeded in database.

---

## Summary

This implementation plan provides a complete foundation for the Authentication and Database layer using Supabase:

1. **Supabase Auth** handles email magic links and OAuth (GitHub, LinkedIn)
2. **PostgreSQL Database** with proper schema design for profiles, social accounts, companies, positions, and applications
3. **RLS Policies** ensure data security and isolation
4. **Save/Continue Later** functionality via JSONB form_data field
5. **Type Safety** through generated TypeScript types
6. **Migration Strategy** using Supabase CLI for version-controlled schema changes

---

### Critical Files for Implementation

- `/src/lib/supabase/client.ts` - Browser Supabase client initialization
- `/src/lib/supabase/server.ts` - Server-side Supabase client with cookie handling
- `/src/middleware.ts` - Auth session middleware for route protection
- `/supabase/migrations/` - Database schema migrations (SQL files)
- `/src/lib/database.types.ts` - Generated TypeScript types from Supabase schema
