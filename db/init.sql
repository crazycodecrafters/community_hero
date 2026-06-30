CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('citizen', 'moderator', 'officer', 'admin');
CREATE TYPE issue_status AS ENUM ('reported', 'ai_triaged', 'verification', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened');
CREATE TYPE issue_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE issue_category AS ENUM (
  'pothole', 'water_leakage', 'drainage_blockage', 'garbage_overflow',
  'broken_streetlight', 'fallen_tree', 'damaged_road_sign', 'unsafe_electric_line',
  'pavement_damage', 'public_property_vandalism', 'other'
);
CREATE TYPE verification_action AS ENUM ('confirm', 'dispute', 'corroborate', 'still_unresolved', 'false_report_flag');
CREATE TYPE media_type AS ENUM ('image', 'video', 'voice');
CREATE TYPE upload_type AS ENUM ('citizen_report', 'citizen_verification', 'officer_proof');
CREATE TYPE notification_channel AS ENUM ('push', 'sms', 'email', 'in_app');

CREATE TABLE wards (
  ward_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Default City',
  polygon GEOMETRY(Polygon, 4326),
  officer_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wards_polygon ON wards USING GIST (polygon);

CREATE TABLE departments (
  department_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teams (
  team_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  department_id UUID REFERENCES departments(department_id),
  ward_id UUID REFERENCES wards(ward_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255),
  password_hash VARCHAR(255),
  ward_id UUID REFERENCES wards(ward_id),
  role user_role NOT NULL DEFAULT 'citizen',
  xp_points INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  streak_last_active DATE,
  trust_score FLOAT NOT NULL DEFAULT 1.0,
  false_report_count INTEGER NOT NULL DEFAULT 0,
  spam_flag_count INTEGER NOT NULL DEFAULT 0,
  badge_ids TEXT[] DEFAULT '{}',
  avatar_url VARCHAR(500),
  google_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_submissions INTEGER NOT NULL DEFAULT 5,
  rate_limit_window_minutes INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT chk_trust_score CHECK (trust_score >= 0 AND trust_score <= 5.0)
);

CREATE TABLE refresh_tokens (
  token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE issues (
  issue_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES users(user_id),
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  device_fingerprint VARCHAR(255),
  title VARCHAR(200),
  description TEXT,
  issue_type issue_category,
  subcategory VARCHAR(100),
  severity issue_severity DEFAULT 'medium',
  status issue_status NOT NULL DEFAULT 'reported',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geometry GEOMETRY(Point, 4326),
  address_text VARCHAR(300),
  ward_id UUID REFERENCES wards(ward_id),
  ai_confidence FLOAT,
  ai_summary TEXT,
  ai_department_recommendation VARCHAR(100),
  ai_raw_response JSONB,
  duplicate_group_id UUID,
  assigned_team_id UUID REFERENCES teams(team_id),
  assigned_officer_id UUID REFERENCES users(user_id),
  sla_due_at TIMESTAMPTZ,
  sla_breach_notified BOOLEAN DEFAULT FALSE,
  sla_75_notified BOOLEAN DEFAULT FALSE,
  public_safety_risk BOOLEAN DEFAULT FALSE,
  environmental_risk BOOLEAN DEFAULT FALSE,
  verification_score FLOAT DEFAULT 0.0,
  verification_count INTEGER DEFAULT 0,
  reopen_count INTEGER DEFAULT 0,
  resolution_proof_uploaded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  CONSTRAINT chk_confidence CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1))
);

CREATE INDEX idx_issues_geometry ON issues USING GIST (geometry);
CREATE INDEX idx_issues_status ON issues (status);
CREATE INDEX idx_issues_category ON issues (issue_type);
CREATE INDEX idx_issues_ward ON issues (ward_id);
CREATE INDEX idx_issues_reporter ON issues (reporter_id);
CREATE INDEX idx_issues_severity ON issues (severity);
CREATE INDEX idx_issues_created ON issues (created_at DESC);
CREATE INDEX idx_issues_duplicate_group ON issues (duplicate_group_id) WHERE duplicate_group_id IS NOT NULL;
CREATE INDEX idx_issues_sla ON issues (sla_due_at) WHERE sla_due_at IS NOT NULL AND status NOT IN ('closed', 'resolved');

CREATE TABLE issue_media (
  media_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
  media_url VARCHAR(500) NOT NULL,
  media_type media_type NOT NULL DEFAULT 'image',
  uploaded_by UUID REFERENCES users(user_id),
  upload_type upload_type NOT NULL DEFAULT 'citizen_report',
  is_exif_stripped BOOLEAN NOT NULL DEFAULT FALSE,
  perceptual_hash VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_issue_media_issue ON issue_media (issue_id);

CREATE TABLE verifications (
  verification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
  citizen_id UUID NOT NULL REFERENCES users(user_id),
  action_type verification_action NOT NULL DEFAULT 'confirm',
  trust_weight FLOAT NOT NULL DEFAULT 1.0,
  weighted_contribution FLOAT NOT NULL DEFAULT 1.0,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(issue_id, citizen_id, action_type, created_at)
);

CREATE INDEX idx_verifications_issue ON verifications (issue_id);
CREATE INDEX idx_verifications_citizen ON verifications (citizen_id);

CREATE TABLE issue_history (
  history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(user_id),
  from_status issue_status,
  to_status issue_status NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_issue_history_issue ON issue_history (issue_id);
CREATE INDEX idx_issue_history_created ON issue_history (created_at DESC);

CREATE TABLE sla_profiles (
  sla_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_type issue_category NOT NULL,
  severity issue_severity NOT NULL,
  resolution_hours INTEGER NOT NULL,
  assignment_acknowledgement_hours INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(issue_type, severity)
);

INSERT INTO sla_profiles (issue_type, severity, resolution_hours, assignment_acknowledgement_hours) VALUES
  ('pothole', 'critical', 24, 2),
  ('pothole', 'high', 48, 4),
  ('pothole', 'medium', 72, 6),
  ('pothole', 'low', 96, 8),
  ('water_leakage', 'critical', 24, 2),
  ('water_leakage', 'high', 48, 4),
  ('water_leakage', 'medium', 72, 6),
  ('water_leakage', 'low', 96, 8),
  ('drainage_blockage', 'critical', 24, 2),
  ('drainage_blockage', 'high', 48, 4),
  ('drainage_blockage', 'medium', 72, 6),
  ('drainage_blockage', 'low', 96, 8),
  ('garbage_overflow', 'critical', 24, 2),
  ('garbage_overflow', 'high', 48, 4),
  ('garbage_overflow', 'medium', 72, 6),
  ('garbage_overflow', 'low', 96, 8),
  ('broken_streetlight', 'critical', 24, 2),
  ('broken_streetlight', 'high', 48, 4),
  ('broken_streetlight', 'medium', 72, 6),
  ('broken_streetlight', 'low', 96, 8),
  ('fallen_tree', 'critical', 24, 2),
  ('fallen_tree', 'high', 48, 4),
  ('fallen_tree', 'medium', 72, 6),
  ('fallen_tree', 'low', 96, 8),
  ('unsafe_electric_line', 'critical', 24, 2),
  ('unsafe_electric_line', 'high', 48, 4),
  ('unsafe_electric_line', 'medium', 72, 6),
  ('unsafe_electric_line', 'low', 96, 8),
  ('pavement_damage', 'critical', 48, 4),
  ('pavement_damage', 'high', 72, 6),
  ('pavement_damage', 'medium', 96, 8),
  ('pavement_damage', 'low', 120, 12)
ON CONFLICT (issue_type, severity) DO NOTHING;

CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  issue_id UUID REFERENCES issues(issue_id),
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  channel notification_channel NOT NULL DEFAULT 'in_app',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  deep_link VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications (created_at DESC);

CREATE TABLE badges (
  badge_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon_name VARCHAR(50) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL,
  trigger_threshold INTEGER NOT NULL,
  trigger_category issue_category,
  xp_reward INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO badges (name, description, icon_name, trigger_type, trigger_threshold, xp_reward) VALUES
  ('First Fix Catalyst', 'First report that led to a resolved issue', 'first_fix', 'reports_resolved', 1, 50),
  ('Local Guardian', '10 verified reports in a single ward', 'local_guardian', 'ward_reports_verified', 10, 100),
  ('Flood Watcher', '5 drainage or water-related reports verified before monsoon', 'flood_watcher', 'category_verified', 5, 75),
  ('Night Safety Reporter', 'Reports submitted between 10pm-6am that are verified', 'night_safety', 'night_reports_verified', 3, 50),
  ('Clean Street Champion', '5 verified garbage overflow reports resolved', 'clean_street', 'category_resolved', 5, 100),
  ('Top Verifier', '50 community verification actions in a month', 'top_verifier', 'verifications_count', 50, 150),
  ('Road Watcher', '10 verified pothole or road damage reports', 'road_watcher', 'road_reports_verified', 10, 100),
  ('Water Saver', '5 verified water leakage reports resolved', 'water_saver', 'water_reports_resolved', 5, 100),
  ('Neighborhood Guardian', '30 days continuous civic participation streak', 'streak_30', 'streak_days', 30, 200),
  ('First Reporter', 'First issue submitted on the platform', 'first_report', 'first_submission', 1, 25);

CREATE TABLE weekly_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  challenge_type VARCHAR(50) NOT NULL,
  target_count INTEGER NOT NULL,
  target_ward_id UUID REFERENCES wards(ward_id),
  target_category issue_category,
  xp_multiplier FLOAT NOT NULL DEFAULT 2.0,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_challenge_progress (
  progress_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  challenge_id UUID NOT NULL REFERENCES weekly_challenges(challenge_id),
  current_count INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, challenge_id)
);

CREATE TABLE cluster_insights (
  cluster_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  center_latitude DOUBLE PRECISION NOT NULL,
  center_longitude DOUBLE PRECISION NOT NULL,
  center_geometry GEOMETRY(Point, 4326),
  radius_meters INTEGER NOT NULL DEFAULT 200,
  issue_type issue_category,
  issue_count INTEGER NOT NULL DEFAULT 1,
  average_severity_score FLOAT,
  recurrence_prediction_score FLOAT,
  recommended_action TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cluster_insights_geometry ON cluster_insights USING GIST (center_geometry);

CREATE TABLE comment_moderation (
  comment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id),
  content TEXT NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  moderation_status VARCHAR(50) NOT NULL DEFAULT 'approved',
  guardrail_pass BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comment_moderation_issue ON comment_moderation (issue_id);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_issues_updated_at BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_wards_updated_at BEFORE UPDATE ON wards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_comment_moderation_updated_at BEFORE UPDATE ON comment_moderation FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION update_issue_geometry()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geometry = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_issues_set_geometry BEFORE INSERT OR UPDATE OF latitude, longitude ON issues
  FOR EACH ROW EXECUTE FUNCTION update_issue_geometry();

CREATE OR REPLACE FUNCTION update_cluster_geometry()
RETURNS TRIGGER AS $$
BEGIN
  NEW.center_geometry = ST_SetSRID(ST_MakePoint(NEW.center_longitude, NEW.center_latitude), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cluster_set_geometry BEFORE INSERT OR UPDATE OF center_latitude, center_longitude ON cluster_insights
  FOR EACH ROW EXECUTE FUNCTION update_cluster_geometry();

CREATE OR REPLACE FUNCTION assign_ward()
RETURNS TRIGGER AS $$
BEGIN
  SELECT w.ward_id INTO NEW.ward_id
  FROM wards w
  WHERE w.polygon IS NOT NULL
    AND ST_Contains(w.polygon, ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326))
  LIMIT 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_issues_assign_ward BEFORE INSERT ON issues
  FOR EACH ROW WHEN (NEW.ward_id IS NULL)
  EXECUTE FUNCTION assign_ward();

CREATE OR REPLACE FUNCTION compute_sla_due()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'assigned' AND NEW.sla_due_at IS NULL THEN
    SELECT (
      NEW.created_at + (s.resolution_hours || ' hours')::INTERVAL
    ) INTO NEW.sla_due_at
    FROM sla_profiles s
    WHERE s.issue_type = NEW.issue_type AND s.severity = NEW.severity;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_issues_sla_due BEFORE UPDATE ON issues
  FOR EACH ROW WHEN (NEW.status = 'assigned' AND NEW.sla_due_at IS NULL)
  EXECUTE FUNCTION compute_sla_due();

-- Seed some test wards
INSERT INTO wards (name, city, polygon) VALUES
  ('Ward 1 - MG Road', 'Default City', ST_GeomFromText('POLYGON((77.5900 12.9700, 77.5950 12.9700, 77.5950 12.9750, 77.5900 12.9750, 77.5900 12.9700))', 4326)),
  ('Ward 2 - Indiranagar', 'Default City', ST_GeomFromText('POLYGON((77.5950 12.9700, 77.6000 12.9700, 77.6000 12.9750, 77.5950 12.9750, 77.5950 12.9700))', 4326)),
  ('Ward 3 - Koramangala', 'Default City', ST_GeomFromText('POLYGON((77.5900 12.9650, 77.5950 12.9650, 77.5950 12.9700, 77.5900 12.9700, 77.5900 12.9650))', 4326)),
  ('Ward 4 - Jayanagar', 'Default City', ST_GeomFromText('POLYGON((77.5950 12.9650, 77.6000 12.9650, 77.6000 12.9700, 77.5950 12.9700, 77.5950 12.9650))', 4326)),
  ('Ward 5 - Malleswaram', 'Default City', ST_GeomFromText('POLYGON((77.5850 12.9750, 77.5900 12.9750, 77.5900 12.9800, 77.5850 12.9800, 77.5850 12.9750))', 4326))
ON CONFLICT DO NOTHING;

INSERT INTO departments (name, code, description) VALUES
  ('Roads and Maintenance', 'roads_and_maintenance', 'Handles potholes, pavement damage, road signs'),
  ('Water and Drainage', 'water_and_drainage', 'Handles water leakage, drainage blockage'),
  ('Electricity', 'electricity', 'Handles streetlights, electric lines'),
  ('Sanitation', 'sanitation', 'Handles garbage overflow, waste management'),
  ('Parks and Trees', 'parks_and_trees', 'Handles fallen trees, park maintenance'),
  ('Public Safety', 'public_safety', 'Handles vandalism, public safety issues')
ON CONFLICT DO NOTHING;

INSERT INTO users (user_id, name, email, role, password_hash, xp_points, trust_score) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin User', 'admin@communityhero.dev', 'admin', '$2b$12$LJ3m4ys3GZfnYMz8kVsKaOqF6hDPJHtR3jBRXCqCWvE8yKvFGRvKW', 1000, 5.0),
  ('00000000-0000-0000-0000-000000000002', 'Officer Raj', 'officer@communityhero.dev', 'officer', '$2b$12$LJ3m4ys3GZfnYMz8kVsKaOqF6hDPJHtR3jBRXCqCWvE8yKvFGRvKW', 500, 4.0),
  ('00000000-0000-0000-0000-000000000003', 'Moderator Priya', 'moderator@communityhero.dev', 'moderator', '$2b$12$LJ3m4ys3GZfnYMz8kVsKaOqF6hDPJHtR3jBRXCqCWvE8yKvFGRvKW', 750, 4.5)
ON CONFLICT DO NOTHING;