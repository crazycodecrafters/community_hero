-- Admin and Officer Profiles

CREATE TABLE IF NOT EXISTS officer_profiles (
  officer_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(department_id),
  ward_ids UUID[],
  employee_code VARCHAR(50) UNIQUE,
  designation VARCHAR(100),
  team_id UUID REFERENCES teams(team_id),
  phone_verified BOOLEAN DEFAULT false,
  active_status VARCHAR(20) DEFAULT 'active',
  shift_hours VARCHAR(100),
  created_by_admin_id UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_profiles (
  admin_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  admin_level VARCHAR(50) NOT NULL DEFAULT 'department_admin',
  managed_departments UUID[],
  can_configure_sla BOOLEAN DEFAULT false,
  can_manage_users BOOLEAN DEFAULT false,
  can_access_moderation BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS lead_officer_id UUID REFERENCES users(user_id);

-- Optional constraints or triggers could go here.
