import { create } from 'zustand';
import { UserProfile, Issue, Notification, Badge } from '../types';

interface AppState {
  user: UserProfile | null;
  isLoading: boolean;
  issues: Issue[];
  notifications: Notification[];
  unreadCount: number;
  badges: Badge[];
  selectedIssue: Issue | null;
  isSubmitting: boolean;

  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setIssues: (issues: Issue[]) => void;
  addIssue: (issue: Issue) => void;
  updateIssue: (id: string, updates: Partial<Issue>) => void;
  setNotifications: (notifications: Notification[]) => void;
  setUnreadCount: (count: number) => void;
  markNotifRead: (id: string) => void;
  setBadges: (badges: Badge[]) => void;
  setSelectedIssue: (issue: Issue | null) => void;
  setSubmitting: (submitting: boolean) => void;
  addXp: (points: number) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  isLoading: true,
  issues: [],
  notifications: [],
  unreadCount: 0,
  badges: [],
  selectedIssue: null,
  isSubmitting: false,

  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setIssues: (issues) => set({ issues }),
  addIssue: (issue) => set((state) => ({ issues: [issue, ...state.issues] })),
  updateIssue: (id, updates) =>
    set((state) => ({
      issues: state.issues.map((i) => (i.issue_id === id ? { ...i, ...updates } : i)),
    })),
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  markNotifRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.notification_id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  setBadges: (badges) => set({ badges }),
  setSelectedIssue: (selectedIssue) => set({ selectedIssue }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  addXp: (points) =>
    set((state) => ({
      user: state.user ? { ...state.user, xp_points: state.user.xp_points + points } : null,
    })),
}));
