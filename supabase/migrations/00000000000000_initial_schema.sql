-- Initial schema for HR Candidate Screening Platform
-- Creates all core tables with RLS policies

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'candidate' CHECK (role IN ('candidate', 'admin', 'super_admin')),
  headline TEXT,
  location TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social accounts table
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'github', 'google_scholar', 'twitter', 'website')),
  url TEXT NOT NULL,
  username TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, platform)
);

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  website TEXT,
  location TEXT,
  size TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Positions table
CREATE TABLE IF NOT EXISTS positions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT[],
  employment_type TEXT,
  location_type TEXT,
  salary_range JSONB,
  screening_questions JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, slug)
);

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  position_id UUID REFERENCES positions(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'started' CHECK (status IN ('started', 'submitted', 'screening', 'screening_completed', 'technical_assessment', 'technical_completed', 'review', 'accepted', 'rejected')),
  form_data JSONB DEFAULT '{}',
  form_completed BOOLEAN DEFAULT FALSE,
  classification_score DECIMAL(3,2),
  classification_notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, position_id)
);

-- Screening interviews table
CREATE TABLE IF NOT EXISTS screening_interviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'error')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  audio_url TEXT,
  transcript TEXT,
  answers JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Technical sessions table
CREATE TABLE IF NOT EXISTS technical_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'provisioning' CHECK (status IN ('provisioning', 'ready', 'in_progress', 'completed', 'expired', 'error')),
  container_id TEXT,
  session_url TEXT,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assessment_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Application events table (audit trail)
CREATE TABLE IF NOT EXISTS application_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- RLS Policies for social_accounts
CREATE POLICY "Users can view own social accounts"
  ON social_accounts FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Users can insert own social accounts"
  ON social_accounts FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own social accounts"
  ON social_accounts FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Users can delete own social accounts"
  ON social_accounts FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

-- RLS Policies for companies (public read, admin write)
CREATE POLICY "Companies are viewable by everyone"
  ON companies FOR SELECT
  TO anon, authenticated
  USING (true);

-- RLS Policies for positions (public read active, admin write)
CREATE POLICY "Active positions are viewable by everyone"
  ON positions FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

-- RLS Policies for applications
CREATE POLICY "Users can view own applications"
  ON applications FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Users can create own applications"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own applications"
  ON applications FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid());

-- RLS Policies for screening_interviews
CREATE POLICY "Users can view own screening interviews"
  ON screening_interviews FOR SELECT
  TO authenticated
  USING (
    application_id IN (
      SELECT id FROM applications WHERE profile_id = auth.uid()
    )
  );

-- RLS Policies for technical_sessions
CREATE POLICY "Users can view own technical sessions"
  ON technical_sessions FOR SELECT
  TO authenticated
  USING (
    application_id IN (
      SELECT id FROM applications WHERE profile_id = auth.uid()
    )
  );

-- RLS Policies for application_events
CREATE POLICY "Users can view own application events"
  ON application_events FOR SELECT
  TO authenticated
  USING (
    application_id IN (
      SELECT id FROM applications WHERE profile_id = auth.uid()
    )
  );

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on auth user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function to auto-update timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER social_accounts_updated_at
  BEFORE UPDATE ON social_accounts
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER screening_interviews_updated_at
  BEFORE UPDATE ON screening_interviews
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER technical_sessions_updated_at
  BEFORE UPDATE ON technical_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Application event logging trigger
CREATE OR REPLACE FUNCTION public.log_application_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO application_events (application_id, event_type, data, created_by)
  VALUES (
    NEW.id,
    CASE
      WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_change'
      WHEN OLD.form_data IS DISTINCT FROM NEW.form_data THEN 'form_saved'
      WHEN OLD.submitted_at IS NULL AND NEW.submitted_at IS NOT NULL THEN 'submitted'
      ELSE 'updated'
    END,
    JSONB_BUILD_OBJECT(
      'old_status', OLD.status,
      'new_status', NEW.status
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER applications_event_log
  AFTER UPDATE ON applications
  FOR EACH ROW EXECUTE PROCEDURE public.log_application_event();

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_social_accounts_profile_id ON social_accounts(profile_id);
CREATE INDEX IF NOT EXISTS idx_positions_company_id ON positions(company_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_applications_profile_id ON applications(profile_id);
CREATE INDEX IF NOT EXISTS idx_applications_position_id ON applications(position_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_screening_interviews_application_id ON screening_interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_technical_sessions_application_id ON technical_sessions(application_id);
CREATE INDEX IF NOT EXISTS idx_application_events_application_id ON application_events(application_id);
