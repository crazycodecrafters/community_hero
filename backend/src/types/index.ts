export type UserRole = 'citizen' | 'moderator' | 'officer' | 'admin';
export type IssueStatus = 'reported' | 'ai_triaged' | 'verification' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'reopened';
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueCategory =
  | 'pothole' | 'water_leakage' | 'drainage_blockage' | 'garbage_overflow'
  | 'broken_streetlight' | 'fallen_tree' | 'damaged_road_sign' | 'unsafe_electric_line'
  | 'pavement_damage' | 'public_property_vandalism' | 'other';
export type VerificationAction = 'confirm' | 'dispute' | 'corroborate' | 'still_unresolved' | 'false_report_flag';
export type MediaType = 'image' | 'video' | 'voice';
export type UploadType = 'citizen_report' | 'citizen_verification' | 'officer_proof';

export interface AIStructuredOutput {
  issue_type: IssueCategory;
  subcategory: string;
  severity: IssueSeverity;
  department: string;
  public_safety_risk: boolean;
  environmental_risk: boolean;
  confidence: number;
  summary: string;
  recommended_sla_hours: number;
  duplicate_candidates: string[];
}

export interface CreateIssueInput {
  title?: string;
  description?: string;
  latitude: number;
  longitude: number;
  address_text?: string;
  is_anonymous?: boolean;
  device_fingerprint?: string;
}

export interface IssueData extends CreateIssueInput {
  issue_id: string;
  reporter_id: string;
  issue_type?: IssueCategory;
  subcategory?: string;
  severity: IssueSeverity;
  status: IssueStatus;
  ward_id?: string;
  ai_confidence?: number;
  ai_summary?: string;
  ai_department_recommendation?: string;
  ai_raw_response?: any;
  duplicate_group_id?: string;
  assigned_team_id?: string;
  assigned_officer_id?: string;
  sla_due_at?: number;
  public_safety_risk?: boolean;
  environmental_risk?: boolean;
  verification_score: number;
  verification_count: number;
  reopen_count: number;
  created_at: number;
  updated_at: number;
  closed_at?: number;
  resolved_at?: number;
}

export interface UserData {
  user_id: string;
  name: string;
  phone?: string;
  email?: string;
  ward_id?: string;
  role: UserRole;
  xp_points: number;
  streak_days: number;
  streak_last_active?: string;
  trust_score: number;
  false_report_count: number;
  spam_flag_count: number;
  badge_ids: string[];
  avatar_url?: string;
  is_active: boolean;
  created_at: number;
}

export interface VerificationData {
  verification_id: string;
  issue_id: string;
  citizen_id: string;
  action_type: VerificationAction;
  trust_weight: number;
  weighted_contribution: number;
  comment?: string;
  created_at: number;
}

export interface NotificationData {
  notification_id: string;
  user_id: string;
  issue_id?: string;
  title: string;
  body: string;
  notification_type: string;
  channel: string;
  is_read: boolean;
  deep_link?: string;
  created_at: number;
}

export interface SLAProfile {
  sla_id: string;
  issue_type: IssueCategory;
  severity: IssueSeverity;
  resolution_hours: number;
  assignment_acknowledgement_hours: number;
}
