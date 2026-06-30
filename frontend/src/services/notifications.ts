import { auth } from '../firebase';
import { Notification } from '../types';
import { getIdToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL || '/api';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function getNotifications(limit = 30, offset = 0) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/notifications?limit=${limit}&offset=${offset}`, { headers });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to get notifications');
  return result.data;
}

export async function getUnreadCount(): Promise<number> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/notifications/unread-count`, { headers });
  const result = await response.json();
  if (!result.success) return 0;
  return result.data.count || 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/notifications/${id}/read`, { method: 'POST', headers });
}

export async function markAllNotificationsRead(): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/notifications/read-all`, { method: 'POST', headers });
}
