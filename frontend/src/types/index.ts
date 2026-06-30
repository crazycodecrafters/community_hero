export type UserRole = 'citizen' | 'moderator' | 'officer' | 'admin';
export type IssueStatus = 'reported' | 'ai_triaged' | 'verification' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'reopened';
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueCategory =
  | 'pothole' | 'water_leakage' | 'drainage_blockage' | 'garbage_overflow'
  | 'broken_streetlight' | 'fallen_tree' | 'damaged_road_sign' | 'unsafe_electric_line'
  | 'pavement_damage' | 'public_property_vandalism' | 'other';
export type VerificationAction = 'confirm' | 'dispute' | 'corroborate' | 'still_unresolved' | 'false_report_flag';

export interface UserProfile {
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
  last_login?: number;
}

export interface Issue {
  issue_id: string;
  reporter_id: string;
  is_anonymous: boolean;
  title: string;
  description?: string;
  issue_type: IssueCategory;
  subcategory?: string;
  severity: IssueSeverity;
  status: IssueStatus;
  latitude: number;
  longitude: number;
  address_text?: string;
  ward_id?: string;
  ai_confidence?: number;
  ai_summary?: string;
  ai_department_recommendation?: string;
  duplicate_group_id?: string;
  assigned_team_id?: string;
  assigned_officer_id?: string;
  sla_due_at?: number;
  public_safety_risk: boolean;
  environmental_risk: boolean;
  verification_score: number;
  verification_count: number;
  reopen_count: number;
  created_at: number;
  updated_at: number;
  closed_at?: number;
  resolved_at?: number;
  history?: IssueHistory[];
  verifications?: Verification[];
}

export interface IssueHistory {
  history_id: string;
  changed_by: string;
  from_status: string | null;
  to_status: string;
  note?: string;
  created_at: number;
}

export interface Verification {
  verification_id: string;
  issue_id: string;
  citizen_id: string;
  action_type: VerificationAction;
  trust_weight: number;
  weighted_contribution: number;
  comment?: string;
  created_at: number;
}

export interface Notification {
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

export interface Badge {
  badge_id: string;
  name: string;
  description: string;
  icon_name: string;
  trigger_type: string;
  trigger_threshold: number;
  xp_reward: number;
}

export interface AIResult {
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

export interface DashboardMetrics {
  total: number;
  open: number;
  resolved: number;
  critical: number;
  sla_breached: number;
  avg_resolution_hours: number;
  category_breakdown?: Record<string, number>;
  severity_breakdown?: Record<string, number>;
}

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  xp_points: number;
  trust_score: number;
  badge_count: number;
  ward_id?: string;
}

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  pothole: 'Pothole',
  water_leakage: 'Water Leakage',
  drainage_blockage: 'Drainage Blockage',
  garbage_overflow: 'Garbage Overflow',
  broken_streetlight: 'Broken Streetlight',
  fallen_tree: 'Fallen Tree',
  damaged_road_sign: 'Damaged Road Sign',
  unsafe_electric_line: 'Unsafe Electric Line',
  pavement_damage: 'Pavement Damage',
  public_property_vandalism: 'Vandalism',
  other: 'Other Issue',
};

export const SEVERITY_COLORS: Record<IssueSeverity, string> = {
  low: '#00b894',
  medium: '#fdcb6e',
  high: '#e17055',
  critical: '#d63031',
};

export const STATUS_LABELS: Record<IssueStatus, string> = {
  reported: 'Reported',
  ai_triaged: 'AI Triaged',
  verification: 'Verification',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
};

export const CATEGORY_ICONS: Record<IssueCategory, string> = {
  pothole: '⛔',
  water_leakage: '💧',
  drainage_blockage: '🌊',
  garbage_overflow: '🗑️',
  broken_streetlight: '💡',
  fallen_tree: '🌳',
  damaged_road_sign: '🪧',
  unsafe_electric_line: '⚡',
  pavement_damage: '🧱',
  public_property_vandalism: '🏚️',
  other: '📌',
};
