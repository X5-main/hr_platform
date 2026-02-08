# Implementation Plan: Company Portal & Admin Dashboard

## Overview

This plan details the implementation of the Company Portal & Admin Dashboard component for HR recruiters and hiring managers. This dashboard provides comprehensive tools for managing job positions, reviewing candidates, tracking application pipelines, and configuring screening settings.

---

## 1. Page Structure and Routing

### 1.1 Route Hierarchy

```
src/app/
├── (admin)/                          # Admin route group with shared layout
│   ├── layout.tsx                    # Admin layout with sidebar, auth check
│   ├── page.tsx                      # Dashboard overview (redirects to /admin/dashboard)
│   ├── dashboard/
│   │   └── page.tsx                  # Main dashboard with stats
│   ├── positions/
│   │   ├── page.tsx                  # List all positions
│   │   ├── new/
│   │   │   └── page.tsx              # Create new position
│   │   └── [id]/
│   │       ├── page.tsx              # Position detail view
│   │       ├── edit/
│   │       │   └── page.tsx          # Edit position
│   │       └── applications/
│   │           └── page.tsx          # Applications for this position
│   ├── candidates/
│   │   ├── page.tsx                  # Candidate list with filters
│   │   └── [id]/
│   │       ├── page.tsx              # Candidate detail view
│   │       └── applications/
│   │           └── page.tsx          # Candidate's applications
│   ├── applications/
│   │   ├── page.tsx                  # All applications list
│   │   └── [id]/
│   │       └── page.tsx              # Application detail (review interface)
│   ├── pipeline/
│   │   └── page.tsx                  # Kanban pipeline view
│   └── settings/
│       ├── page.tsx                  # Settings overview
│       ├── company/
│       │   └── page.tsx              # Company profile settings
│       ├── email-templates/
│       │   └── page.tsx              # Email template editor
│       └── classification/
│           └── page.tsx              # Classification thresholds
└── api/                              # API routes (shared with candidate portal)
    └── admin/                        # Admin-specific API routes
        ├── positions/
        ├── candidates/
        ├── applications/
        └── settings/
```

### 1.2 Route Protection

All admin routes are protected by:
1. **Authentication check** - User must be logged in via Supabase Auth
2. **Authorization check** - User must have `admin` or `viewer` role
3. **Role-based access control** - Viewers have read-only access

---

## 2. Database Schema Additions

### 2.1 New Tables

#### 2.1.1 Admin Users and Roles

```sql
-- Admin roles enum
create type admin_role as enum ('admin', 'viewer', 'recruiter');

-- Company staff table (links auth users to companies with roles)
create table company_staff (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references profiles(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  role admin_role default 'viewer',
  is_active boolean default true,
  invited_by uuid references auth.users(id),
  invited_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(profile_id, company_id)
);

-- Enable RLS
alter table company_staff enable row level security;

-- RLS Policies
create policy "Staff can view company members"
  on company_staff for select
  to authenticated
  using (
    exists (
      select 1 from company_staff cs
      where cs.profile_id = auth.uid()
      and cs.company_id = company_staff.company_id
    )
  );

create policy "Admins can manage staff"
  on company_staff for all
  to authenticated
  using (
    exists (
      select 1 from company_staff cs
      where cs.profile_id = auth.uid()
      and cs.company_id = company_staff.company_id
      and cs.role = 'admin'
    )
  );
```

#### 2.1.2 Classification Results

```sql
-- Classification results table (extends voice screening plan)
create table classification_results (
  id uuid default gen_random_uuid() primary key,
  interview_id uuid references screening_interviews(id) on delete cascade not null,

  -- Scores
  overall_score decimal(3,2) not null,  -- 0.00 to 1.00
  experience_match decimal(3,2),
  technical_fit decimal(3,2),
  communication decimal(3,2),
  culture_fit decimal(3,2),

  -- Processing metadata
  method text not null,  -- 'rule_based', 'llm', 'hybrid'
  processing_time_ms integer,
  confidence decimal(3,2),

  -- Results
  passed boolean not null,
  reasoning text,
  strengths jsonb default '[]',
  concerns jsonb default '[]',

  -- Manual override
  manual_review boolean default false,
  manual_reviewed_by uuid references auth.users(id),
  manual_reviewed_at timestamptz,
  manual_notes text,

  created_at timestamptz default now(),

  unique(interview_id)
);

-- Enable RLS
alter table classification_results enable row level security;

-- RLS Policies
create policy "Staff can view classification results"
  on classification_results for select
  to authenticated
  using (
    exists (
      select 1 from screening_interviews si
      join applications a on si.application_id = a.id
      join positions p on a.position_id = p.id
      join company_staff cs on p.company_id = cs.company_id
      where si.id = classification_results.interview_id
      and cs.profile_id = auth.uid()
    )
  );
```

#### 2.1.3 Email Templates

```sql
-- Email template types
create type email_template_type as enum (
  'application_received',
  'screening_invitation',
  'screening_passed',
  'screening_failed',
  'technical_invitation',
  'offer_extended',
  'rejection'
);

create table email_templates (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  template_type email_template_type not null,
  name text not null,
  subject text not null,
  body_html text not null,
  body_text text not null,
  variables jsonb default '[]',  -- Available template variables
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(company_id, template_type)
);

-- Enable RLS
alter table email_templates enable row level security;

-- RLS Policies
create policy "Staff can manage email templates"
  on email_templates for all
  to authenticated
  using (
    exists (
      select 1 from company_staff cs
      where cs.profile_id = auth.uid()
      and cs.company_id = email_templates.company_id
    )
  );
```

#### 2.1.4 Classification Settings

```sql
create table classification_settings (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  position_id uuid references positions(id) on delete cascade,  -- null = company default

  -- Thresholds
  pass_threshold decimal(3,2) default 0.70,
  auto_accept_threshold decimal(3,2) default 0.80,
  auto_reject_threshold decimal(3,2) default 0.30,

  -- Weights
  experience_weight decimal(3,2) default 0.30,
  technical_weight decimal(3,2) default 0.35,
  communication_weight decimal(3,2) default 0.20,
  culture_weight decimal(3,2) default 0.15,

  -- Keywords
  required_keywords text[] default '{}',
  preferred_keywords text[] default '{}',
  red_flag_keywords text[] default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(company_id, position_id)
);

-- Enable RLS
alter table classification_settings enable row level security;

-- RLS Policies
create policy "Staff can view classification settings"
  on classification_settings for select
  to authenticated
  using (
    exists (
      select 1 from company_staff cs
      where cs.profile_id = auth.uid()
      and cs.company_id = classification_settings.company_id
    )
  );

create policy "Admins can manage classification settings"
  on classification_settings for all
  to authenticated
  using (
    exists (
      select 1 from company_staff cs
      where cs.profile_id = auth.uid()
      and cs.company_id = classification_settings.company_id
      and cs.role = 'admin'
    )
  );
```

#### 2.1.5 Application Reviews (Audit Trail)

```sql
create table application_reviews (
  id uuid default gen_random_uuid() primary key,
  application_id uuid references applications(id) on delete cascade not null,
  reviewer_id uuid references auth.users(id) not null,

  -- Review data
  action text not null,  -- 'viewed', 'commented', 'status_changed', 'invited_to_technical'
  previous_status application_status,
  new_status application_status,
  comment text,

  -- Technical interview invitation
  technical_session_id uuid,

  created_at timestamptz default now()
);

-- Enable RLS
alter table application_reviews enable row level security;

-- RLS Policies
create policy "Staff can view application reviews"
  on application_reviews for select
  to authenticated
  using (
    exists (
      select 1 from applications a
      join positions p on a.position_id = p.id
      join company_staff cs on p.company_id = cs.company_id
      where a.id = application_reviews.application_id
      and cs.profile_id = auth.uid()
    )
  );

create policy "Staff can create reviews"
  on application_reviews for insert
  to authenticated
  with check (
    exists (
      select 1 from applications a
      join positions p on a.position_id = p.id
      join company_staff cs on p.company_id = cs.company_id
      where a.id = application_reviews.application_id
      and cs.profile_id = auth.uid()
    )
  );
```

### 2.2 Indexes

```sql
-- Performance indexes
create index idx_company_staff_profile_id on company_staff(profile_id);
create index idx_company_staff_company_id on company_staff(company_id);
create index idx_classification_results_interview_id on classification_results(interview_id);
create index idx_classification_results_score on classification_results(overall_score);
create index idx_email_templates_company_id on email_templates(company_id);
create index idx_classification_settings_company_id on classification_settings(company_id);
create index idx_application_reviews_application_id on application_reviews(application_id);
create index idx_application_reviews_reviewer_id on application_reviews(reviewer_id);
```

---

## 3. Component Architecture

### 3.1 Directory Structure

```
src/
├── app/(admin)/                    # Admin pages
├── components/
│   ├── admin/                      # Admin-specific components
│   │   ├── layout/
│   │   │   ├── AdminSidebar.tsx    # Navigation sidebar
│   │   │   ├── AdminHeader.tsx     # Top header with user menu
│   │   │   ├── AdminBreadcrumbs.tsx
│   │   │   └── RoleGuard.tsx       # Role-based access control
│   │   ├── dashboard/
│   │   │   ├── StatsCards.tsx      # Key metric cards
│   │   │   ├── RecentApplications.tsx
│   │   │   ├── PipelineSummary.tsx
│   │   │   └── ActivityFeed.tsx
│   │   ├── positions/
│   │   │   ├── PositionList.tsx
│   │   │   ├── PositionCard.tsx
│   │   │   ├── PositionForm.tsx    # Create/edit form
│   │   │   ├── PositionStatusBadge.tsx
│   │   │   └── ScreeningQuestionsEditor.tsx
│   │   ├── candidates/
│   │   │   ├── CandidateList.tsx
│   │   │   ├── CandidateCard.tsx
│   │   │   ├── CandidateProfile.tsx
│   │   │   ├── SocialLinks.tsx
│   │   │   └── CandidateFilters.tsx
│   │   ├── applications/
│   │   │   ├── ApplicationList.tsx
│   │   │   ├── ApplicationCard.tsx
│   │   │   ├── ApplicationDetail.tsx
│   │   │   ├── ApplicationFilters.tsx
│   │   │   ├── ClassificationScore.tsx  # Visual score indicator
│   │   │   ├── TranscriptViewer.tsx
│   │   │   ├── AudioPlayer.tsx
│   │   │   └── ReviewActions.tsx   # Pass/fail/invite buttons
│   │   ├── pipeline/
│   │   │   ├── PipelineBoard.tsx   # Kanban board
│   │   │   ├── PipelineColumn.tsx
│   │   │   ├── PipelineCard.tsx
│   │   │   └── DragDropProvider.tsx
│   │   └── settings/
│   │       ├── CompanyProfileForm.tsx
│   │       ├── EmailTemplateEditor.tsx
│   │       ├── ClassificationThresholds.tsx
│   │       └── StaffManagement.tsx
│   └── ui/                         # shadcn/ui components
├── hooks/
│   ├── useAdminAuth.ts             # Admin auth check
│   ├── useCompanyStaff.ts
│   ├── usePositions.ts
│   ├── useCandidates.ts
│   ├── useApplications.ts
│   └── useClassification.ts
├── lib/
│   ├── repositories/               # Data access layer
│   │   ├── admin-positions.ts
│   │   ├── admin-candidates.ts
│   │   ├── admin-applications.ts
│   │   └── admin-settings.ts
│   └── permissions.ts              # Role-based permissions
└── types/
    └── admin.ts                    # Admin-specific types
```

### 3.2 Key Components

#### 3.2.1 Layout Components

**AdminSidebar.tsx**
- Collapsible sidebar navigation
- Role-aware menu items (admins see Settings, viewers don't)
- Active route highlighting
- Company logo and name display

**RoleGuard.tsx**
- Hides/shows UI elements based on role
- Blocks access to admin-only routes for viewers
- Read-only mode indicators for viewers

#### 3.2.2 Dashboard Components

**StatsCards.tsx**
Metrics displayed:
- Total candidates (with trend indicator)
- Open positions
- Pending reviews (applications awaiting decision)
- Pass rate percentage
- Average classification score

**PipelineSummary.tsx**
- Visual pipeline representation
- Counts per stage
- Bottleneck identification

#### 3.2.3 Position Management Components

**PositionForm.tsx**
Fields:
- Title, slug, description
- Requirements (array of strings with add/remove)
- Responsibilities (array of strings)
- Employment type, location, salary range
- Status (draft/active/paused/closed)
- Screening questions (dynamic form)
- Technical assessment toggle

**PositionStatusBadge.tsx**
- Color-coded badges for status
- Quick status toggle for admins

#### 3.2.4 Candidate Review Components

**CandidateList.tsx**
- Table view with sortable columns
- Quick filters (by position, status, score range)
- Bulk actions (export, status change)
- Pagination

**ClassificationScore.tsx**
Visual indicators:
- Circular progress indicator (0-1 scale)
- Color coding: red (<0.3), yellow (0.3-0.7), green (>0.7)
- Dimension breakdown on hover
- Manual review indicator

**ReviewActions.tsx**
Action buttons based on status:
- Screening completed: Pass / Fail / Manual Review
- Screening passed: Invite to Technical / Reject
- Technical completed: Make Offer / Reject

#### 3.2.5 Pipeline Components

**PipelineBoard.tsx**
- Kanban-style columns for each application stage
- Drag-and-drop to move candidates between stages
- Column counts and limits
- Filtering within columns

---

## 4. Permission/Role System

### 4.1 Role Definitions

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to all features, manage staff, edit settings, delete data |
| **Recruiter** | Manage positions, review candidates, change application status, invite to technical |
| **Viewer** | Read-only access to view candidates and applications, cannot change status or settings |

### 4.2 Permission Matrix

| Feature | Admin | Recruiter | Viewer |
|---------|-------|-----------|--------|
| View Dashboard | Yes | Yes | Yes |
| Manage Positions (CRUD) | Yes | Yes | Read-only |
| View Candidates | Yes | Yes | Yes |
| Review Applications | Yes | Yes | Yes |
| Change Application Status | Yes | Yes | No |
| Invite to Technical | Yes | Yes | No |
| View Pipeline | Yes | Yes | Yes |
| Move Pipeline Cards | Yes | Yes | No |
| Company Settings | Yes | No | No |
| Email Templates | Yes | No | No |
| Classification Settings | Yes | No | No |
| Manage Staff | Yes | No | No |

### 4.3 Implementation

```typescript
// src/lib/permissions.ts

export type Role = 'admin' | 'recruiter' | 'viewer';

export interface PermissionCheck {
  role: Role;
  action: 'create' | 'read' | 'update' | 'delete' | 'manage';
  resource: 'positions' | 'candidates' | 'applications' | 'settings' | 'staff';
}

const PERMISSION_MATRIX: Record<Role, Record<string, string[]>> = {
  admin: {
    positions: ['create', 'read', 'update', 'delete'],
    candidates: ['create', 'read', 'update', 'delete'],
    applications: ['create', 'read', 'update', 'delete'],
    settings: ['read', 'update', 'manage'],
    staff: ['create', 'read', 'update', 'delete']
  },
  recruiter: {
    positions: ['create', 'read', 'update'],
    candidates: ['read', 'update'],
    applications: ['read', 'update'],
    settings: ['read'],
    staff: []
  },
  viewer: {
    positions: ['read'],
    candidates: ['read'],
    applications: ['read'],
    settings: [],
    staff: []
  }
};

export function hasPermission(check: PermissionCheck): boolean {
  const allowed = PERMISSION_MATRIX[check.role][check.resource] || [];
  return allowed.includes(check.action);
}

// React hook for permission checking
export function usePermission() {
  const { staff } = useCompanyStaff();

  const can = useCallback(
    (action: PermissionCheck['action'], resource: PermissionCheck['resource']) => {
      if (!staff) return false;
      return hasPermission({ role: staff.role, action, resource });
    },
    [staff]
  );

  return { can, role: staff?.role };
}
```

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Set up admin infrastructure and basic dashboard

| Task | Description | Files |
|------|-------------|-------|
| 1.1 | Create database migrations for admin tables | `supabase/migrations/...` |
| 1.2 | Set up admin route group with layout | `src/app/(admin)/layout.tsx` |
| 1.3 | Implement role-based auth middleware | `src/lib/permissions.ts` |
| 1.4 | Create admin sidebar and header components | `src/components/admin/layout/` |
| 1.5 | Build dashboard overview with stats | `src/app/(admin)/dashboard/page.tsx` |
| 1.6 | Create data repositories for admin | `src/lib/repositories/admin-*.ts` |

**Deliverable**: Functional admin dashboard with stats overview

### Phase 2: Position Management (Week 1-2)

**Goal**: Full CRUD for job positions

| Task | Description | Files |
|------|-------------|-------|
| 2.1 | Position list view with filters | `src/app/(admin)/positions/page.tsx` |
| 2.2 | Position detail view | `src/app/(admin)/positions/[id]/page.tsx` |
| 2.3 | Position create/edit form | `src/components/positions/PositionForm.tsx` |
| 2.4 | Screening questions editor | `src/components/positions/ScreeningQuestionsEditor.tsx` |
| 2.5 | Position status management | API routes + UI |
| 2.6 | Applications by position view | `src/app/(admin)/positions/[id]/applications/page.tsx` |

**Deliverable**: Complete position management system

### Phase 3: Candidate Review (Week 2-3)

**Goal**: Candidate listing and detailed review interface

| Task | Description | Files |
|------|-------------|-------|
| 3.1 | Candidate list with filters | `src/app/(admin)/candidates/page.tsx` |
| 3.2 | Candidate detail view with profile | `src/app/(admin)/candidates/[id]/page.tsx` |
| 3.3 | Application list with classification scores | `src/app/(admin)/applications/page.tsx` |
| 3.4 | Application detail review page | `src/app/(admin)/applications/[id]/page.tsx` |
| 3.5 | Classification score visual component | `src/components/applications/ClassificationScore.tsx` |
| 3.6 | Transcript viewer | `src/components/applications/TranscriptViewer.tsx` |
| 3.7 | Audio player for recordings | `src/components/applications/AudioPlayer.tsx` |
| 3.8 | Review action buttons (pass/fail/invite) | `src/components/applications/ReviewActions.tsx` |

**Deliverable**: Complete candidate review workflow

### Phase 4: Pipeline View (Week 3)

**Goal**: Kanban-style pipeline visualization

| Task | Description | Files |
|------|-------------|-------|
| 4.1 | Pipeline board component | `src/components/pipeline/PipelineBoard.tsx` |
| 4.2 | Drag-and-drop implementation | `src/components/pipeline/DragDropProvider.tsx` |
| 4.3 | Pipeline columns and cards | `src/components/pipeline/PipelineColumn.tsx` |
| 4.4 | Status change API endpoints | `src/app/api/admin/applications/[id]/status/route.ts` |
| 4.5 | Pipeline filtering | Filters integration |

**Deliverable**: Interactive pipeline view

### Phase 5: Settings (Week 3-4)

**Goal**: Company settings and configuration

| Task | Description | Files |
|------|-------------|-------|
| 5.1 | Company profile settings | `src/app/(admin)/settings/company/page.tsx` |
| 5.2 | Email template editor | `src/app/(admin)/settings/email-templates/page.tsx` |
| 5.3 | Classification thresholds | `src/app/(admin)/settings/classification/page.tsx` |
| 5.4 | Staff management (admin only) | `src/components/settings/StaffManagement.tsx` |
| 5.5 | Settings API endpoints | `src/app/api/admin/settings/*` |

**Deliverable**: Complete settings management

### Phase 6: Polish & Integration (Week 4)

**Goal**: Testing, optimization, and integration

| Task | Description |
|------|-------------|
| 6.1 | Unit tests for components (80%+ coverage) |
| 6.2 | Integration tests for API routes |
| 6.3 | E2E tests for critical flows |
| 6.4 | Performance optimization |
| 6.5 | Accessibility audit |
| 6.6 | Documentation |

**Deliverable**: Production-ready admin portal

---

## 6. API Routes

### Admin-Specific API Routes

```
src/app/api/admin/
├── positions/
│   ├── route.ts              # GET (list), POST (create)
│   └── [id]/
│       ├── route.ts          # GET, PUT, DELETE
│       ├── publish/
│       │   └── route.ts      # POST - publish position
│       └── unpublish/
│           └── route.ts      # POST - unpublish position
├── candidates/
│   ├── route.ts              # GET (list with filters)
│   └── [id]/
│       ├── route.ts          # GET candidate detail
│       └── notes/
│           └── route.ts      # POST - add review note
├── applications/
│   ├── route.ts              # GET (list with filters)
│   └── [id]/
│       ├── route.ts          # GET application detail
│       ├── status/
│       │   └── route.ts      # PUT - update status
│       ├── classify/
│       │   └── route.ts      # POST - trigger re-classification
│       └── invite/
│           └── route.ts      # POST - invite to technical
├── pipeline/
│   └── route.ts              # GET pipeline data by status
└── settings/
    ├── company/
    │   └── route.ts          # GET, PUT company profile
    ├── email-templates/
    │   └── route.ts          # GET, PUT email templates
    ├── classification/
    │   └── route.ts          # GET, PUT classification settings
    └── staff/
        ├── route.ts          # GET (list), POST (invite)
        └── [id]/
            └── route.ts      # PUT (role), DELETE (remove)
```

---

## 7. Critical Files for Implementation

- `/src/app/(admin)/layout.tsx` - Core admin layout with auth and navigation
- `/src/lib/permissions.ts` - Role-based access control logic
- `/src/components/applications/ClassificationScore.tsx` - Visual score display component
- `/src/app/(admin)/applications/[id]/page.tsx` - Main candidate review interface
- `/supabase/migrations/` - Database schema for admin tables, classification results, and RLS policies
