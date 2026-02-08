-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (extends auth.users)
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

-- Social accounts
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

-- Companies
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

-- Positions
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

-- Applications
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

-- Screening interviews
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

-- RLS Policies
alter table profiles enable row level security;
alter table social_accounts enable row level security;
alter table companies enable row level security;
alter table positions enable row level security;
alter table applications enable row level security;
alter table screening_interviews enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on profiles for select to authenticated using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update to authenticated using (auth.uid() = id);

-- Social accounts policies
create policy "Users can view own social accounts"
  on social_accounts for select to authenticated using (profile_id = auth.uid());
create policy "Users can manage own social accounts"
  on social_accounts for all to authenticated using (profile_id = auth.uid());

-- Companies policies (public read)
create policy "Companies are viewable by everyone"
  on companies for select to anon, authenticated using (true);

-- Positions policies (public read for active)
create policy "Active positions are viewable by everyone"
  on positions for select to anon, authenticated using (status = 'active');

-- Applications policies
create policy "Users can view own applications"
  on applications for select to authenticated using (profile_id = auth.uid());
create policy "Users can create own applications"
  on applications for insert to authenticated with check (profile_id = auth.uid());
create policy "Users can update own applications"
  on applications for update to authenticated using (profile_id = auth.uid());

-- Screening interviews policies
create policy "Users can view own interviews"
  on screening_interviews for select to authenticated
  using (application_id in (select id from applications where profile_id = auth.uid()));

-- Triggers
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles
  for each row execute procedure public.handle_updated_at();
create trigger social_accounts_updated_at before update on social_accounts
  for each row execute procedure public.handle_updated_at();
create trigger companies_updated_at before update on companies
  for each row execute procedure public.handle_updated_at();
create trigger positions_updated_at before update on positions
  for each row execute procedure public.handle_updated_at();
create trigger applications_updated_at before update on applications
  for each row execute procedure public.handle_updated_at();
create trigger screening_interviews_updated_at before update on screening_interviews
  for each row execute procedure public.handle_updated_at();
