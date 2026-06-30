import { auth } from '../firebase';
import { Issue, AIResult } from '../types';

const API_URL = '/api';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function createIssue(data: {
  title?: string;
  description?: string;
  latitude: number;
  longitude: number;
  address_text?: string;
  is_anonymous?: boolean;
  base64_images?: string[];
}): Promise<Issue> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to create issue');
  return result.data;
}

export async function getIssues(params?: {
  status?: string;
  category?: string;
  severity?: string;
  ward_id?: string;
  lat?: number;
  lng?: number;
  radius_m?: number;
  limit?: number;
  offset?: number;
}): Promise<{ issues: Issue[]; total: number }> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.category) query.set('category', params.category);
  if (params?.severity) query.set('severity', params.severity);
  if (params?.ward_id) query.set('ward_id', params.ward_id);
  if (params?.lat !== undefined) query.set('lat', params.lat.toString());
  if (params?.lng !== undefined) query.set('lng', params.lng.toString());
  if (params?.radius_m !== undefined) query.set('radius_m', params.radius_m.toString());
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/issues?${query}`, { headers });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to get issues');
  return { issues: result.data, total: result.meta?.total || 0 };
}

export async function getIssue(id: string): Promise<Issue> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/issues/${id}`, { headers });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to get issue');
  return result.data;
}

export async function verifyIssue(issueId: string, actionType: string, comment?: string): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/issues/${issueId}/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action_type: actionType, comment }),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to verify issue');
  return result.data;
}

export async function addComment(issueId: string, content: string): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/issues/${issueId}/comment`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to add comment');
  return result.data;
}

export async function updateIssueStatus(issueId: string, status: string, note?: string, proofMediaUrl?: string): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/issues/${issueId}/status`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ status, note, proof_media_url: proofMediaUrl }),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to update status');
  return result.data;
}

export async function reopenIssue(issueId: string, reason: string): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/issues/${issueId}/reopen`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reason }),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to reopen issue');
  return result.data;
}

export async function classifyIssue(images: string[], description: string): Promise<AIResult> {
  // Call backend AI classification (which proxies to NVIDIA NIM)
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/ai/classify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ images, description }),
  });
  if (!response.ok) {
    // Fallback: return partial result
    return {
      issue_type: 'other',
      subcategory: 'Unknown',
      severity: 'medium',
      department: 'roads_and_maintenance',
      public_safety_risk: false,
      environmental_risk: false,
      confidence: 0.4,
      summary: description.slice(0, 100) || 'Civic issue',
      recommended_sla_hours: 72,
      duplicate_candidates: [],
    };
  }
  return response.json();
}

export async function getHeatmapData(): Promise<any> {
  const response = await fetch(`${API_URL}/issues/heatmap/public`);
  const result = await response.json();
  if (!result.success) throw new Error('Failed to get heatmap data');
  return result.data;
}

export async function getPublicDashboard(): Promise<any> {
  const response = await fetch(`${API_URL}/public/dashboard`);
  const result = await response.json();
  if (!result.success) throw new Error('Failed to get dashboard data');
  return result.data;
}

export async function getAdminDashboard(): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/admin/dashboard`, { headers });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to get admin dashboard');
  return result.data;
}

export async function getAdminQueue(params?: { status?: string; severity?: string; ward_id?: string; limit?: number }): Promise<Issue[]> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.severity) query.set('severity', params.severity);
  if (params?.ward_id) query.set('ward_id', params.ward_id);
  if (params?.limit) query.set('limit', params.limit.toString());

  const response = await fetch(`${API_URL}/admin/queue?${query}`, { headers });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to get admin queue');
  return result.data;
}

export async function getAdminAnalytics(): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/admin/analytics`, { headers });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to get analytics');
  return result.data;
}

export async function getAdminUsers(params?: { search?: string; role?: string }): Promise<any[]> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.role) query.set('role', params.role);
  const response = await fetch(`${API_URL}/admin/users?${query}`, { headers });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to get users');
  return result.data;
}

export async function assignIssue(issueId: string, assignType: string, assignTo: string, dueAt?: string): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/admin/assign`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ issue_id: issueId, assign_type: assignType, assign_to: assignTo, due_at: dueAt }),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to assign issue');
  return result.data;
}

export async function getGamificationProfile(): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/gamification/profile`, { headers });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to get profile');
  return result.data;
}

export async function getLeaderboard(wardId?: string, limit = 20): Promise<any[]> {
  const query = new URLSearchParams({ limit: limit.toString() });
  if (wardId) query.set('ward_id', wardId);
  const response = await fetch(`${API_URL}/gamification/leaderboard?${query}`);
  const result = await response.json();
  if (!result.success) throw new Error('Failed to get leaderboard');
  return result.data;
}

export async function getCivicImpact(): Promise<any> {
  const response = await fetch(`${API_URL}/gamification/impact`);
  const result = await response.json();
  if (!result.success) throw new Error('Failed to get impact data');
  return result.data;
}

export async function getAdminPredictions(): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/admin/predictions`, { headers });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to get predictions');
  return result.data;
}
