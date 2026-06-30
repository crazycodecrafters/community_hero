import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getIdToken } from '../services/auth';
import { NeuCard, NeuButton, NeuBadge, StatusBadge, SeverityBadge } from '../components/ui';
import { useStore } from '../store';
import {
  Issue, IssueStatus, IssueSeverity, UserProfile, UserRole,
  CATEGORY_LABELS, SEVERITY_COLORS, STATUS_LABELS, CATEGORY_ICONS,
  DashboardMetrics
} from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Queue, ChartBar, Users, MapPin, Clock, DotsThreeVertical,
  Funnel, Download, MagnifyingGlass, UserSwitch, ArrowLeft,
  ShieldCheck, Warning
} from 'phosphor-react';

const getApiUrl = () => {
  let url = import.meta.env.VITE_API_URL || '/api';
  if (url.endsWith('/')) url = url.slice(0, -1);
  if (url.startsWith('http') && !url.endsWith('/api')) url += '/api';
  return url;
};
const API_URL = getApiUrl();

const TABS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: 'queue', label: 'Queue', icon: <Queue size={18} weight="fill" /> },
  { key: 'analytics', label: 'Analytics', icon: <ChartBar size={18} weight="fill" /> },
  { key: 'users', label: 'Users', icon: <Users size={18} weight="fill" /> },
  { key: 'moderation', label: 'Moderation', icon: <ShieldCheck size={18} weight="fill" /> },
  { key: 'predictions', label: 'Predictions', icon: <Warning size={18} weight="fill" /> },
];

interface QueueFilters {
  status: string;
  severity: string;
  ward: string;
}

type AssignType = 'team' | 'officer';

function computeSlaStatus(slaDueAt: string | number | null): { label: string; status: 'breached' | 'at_risk' | 'ok' } | null {
  if (!slaDueAt) return null;
  const due = typeof slaDueAt === 'string' ? new Date(slaDueAt).getTime() : slaDueAt;
  const now = Date.now();
  const diff = due - now;
  if (diff <= 0) return { label: 'SLA Breached', status: 'breached' };
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours < 4) return { label: `${hours}h ${minutes}m left`, status: 'at_risk' };
  return { label: `${hours}h ${minutes}m left`, status: 'ok' };
}

const SEVERITY_ORDER: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const PIE_COLORS = ['#d63031', '#e17055', '#fdcb6e', '#00b894'];

function sortByPriority(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.severity] ?? 99;
    const sevB = SEVERITY_ORDER[b.severity] ?? 99;
    if (sevA !== sevB) return sevA - sevB;
    return (a.created_at ?? 0) - (b.created_at ?? 0);
  });
}

async function fetchWithAuth(url: string): Promise<any> {
  const token = await getIdToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

async function postWithAuth(url: string, body: any): Promise<any> {
  const token = await getIdToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useStore();

  const [activeTab, setActiveTab] = useState('queue');

  // Queue
  const [issues, setIssues] = useState<Issue[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [filters, setFilters] = useState<QueueFilters>({ status: '', severity: '', ward: '' });
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignType, setAssignType] = useState<AssignType>('team');
  const [assignTarget, setAssignTarget] = useState('');
  const [teams] = useState<string[]>(['Public Works', 'Sanitation', 'Electrical', 'Traffic', 'Parks']);
  const [showFilterBar, setShowFilterBar] = useState(false);

  // Moderation
  const [moderationQueue, setModerationQueue] = useState<any[]>([]);
  const [moderationLoading, setModerationLoading] = useState(false);

  const fetchModerationQueue = useCallback(async () => {
    setModerationLoading(true);
    try {
      const data = await fetchWithAuth(`${API_URL}/admin/moderation/queue`);
      setModerationQueue(data.data || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setModerationLoading(false);
    }
  }, []);

  // Analytics
  const [analytics, setAnalytics] = useState<DashboardMetrics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Users
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');

  // Predictions
  const [predictions, setPredictions] = useState<any>(null);
  const [predictionsLoading, setPredictionsLoading] = useState(false);

  const loadData = useCallback(() => {
    if (activeTab === 'queue') loadQueue();
    else if (activeTab === 'analytics') loadAnalytics();
    else if (activeTab === 'users') loadUsers();
    else if (activeTab === 'predictions') loadPredictions();
    else if (activeTab === 'moderation') fetchModerationQueue();
  }, [activeTab]);

  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'officer' && user.role !== 'moderator')) {
      navigate('/', { replace: true });
      return;
    }
    loadQueue();
    loadAnalytics();
    loadUsers();
  }, []);

  const loadQueue = async () => {
    setQueueLoading(true);
    try {
      const data = await fetchWithAuth(`${API_URL}/admin/queue?limit=100`);
      setIssues(sortByPriority(data.data || []));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setQueueLoading(false);
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const data = await fetchWithAuth(`${API_URL}/admin/analytics`);
      setAnalytics(data.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const data = await fetchWithAuth(`${API_URL}/admin/users`);
      setUsersList(data.data || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadPredictions = async () => {
    setPredictionsLoading(true);
    try {
      const data = await fetchWithAuth(`${API_URL}/admin/predictions`);
      setPredictions(data.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPredictionsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'predictions' && !predictions) {
      loadPredictions();
    }
    if (activeTab === 'moderation' && moderationQueue.length === 0) {
      fetchModerationQueue();
    }
  }, [activeTab]);

  const handleAssign = async () => {
    if (!selectedIssue || !assignTarget) return;
    try {
      await postWithAuth(`${API_URL}/admin/assign`, {
        issue_id: selectedIssue.issue_id,
        assign_type: assignType,
        assign_to: assignTarget,
      });
      toast.success(`Issue assigned to ${assignTarget}`);
      setShowAssignModal(false);
      setSelectedIssue(null);
      setAssignTarget('');
      loadQueue();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleChangeStatus = async (issueId: string, status: IssueStatus) => {
    try {
      await postWithAuth(`${API_URL}/admin/issues/${issueId}/status`, { status });
      toast.success(`Status changed to ${STATUS_LABELS[status]}`);
      loadQueue();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await postWithAuth(`${API_URL}/admin/users/${userId}/role`, { role: newRole });
      toast.success('Role updated');
      loadUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExportCSV = () => {
    if (!analytics) return;
    const csvRows: string[] = ['Metric,Value'];
    csvRows.push(`Total,${(analytics as any).total}`);
    csvRows.push(`Open,${(analytics as any).open}`);
    csvRows.push(`Resolved,${(analytics as any).resolved}`);
    csvRows.push(`Critical,${(analytics as any).critical}`);
    csvRows.push(`SLA Breached,${(analytics as any).sla_breached}`);
    csvRows.push(`Avg Resolution Hours,${(analytics as any).avg_resolution_hours ?? 'N/A'}`);
    if (analytics.category_breakdown) {
      csvRows.push('');
      csvRows.push('Category Breakdown');
      Object.entries(analytics.category_breakdown).forEach(([k, v]) => csvRows.push(`${k},${v}`));
    }
    if (analytics.severity_breakdown) {
      csvRows.push('');
      csvRows.push('Severity Breakdown');
      Object.entries(analytics.severity_breakdown).forEach(([k, v]) => csvRows.push(`${k},${v}`));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-analytics-${format(Date.now(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const openAssign = (issue: Issue) => {
    setSelectedIssue(issue);
    setAssignType('team');
    setAssignTarget('');
    setShowAssignModal(true);
  };

  const filteredIssues = issues.filter((issue) => {
    if (filters.status && issue.status !== filters.status) return false;
    if (filters.severity && issue.severity !== filters.severity) return false;
    if (filters.ward && issue.ward_id !== filters.ward) return false;
    return true;
  });

  const searchedUsers = usersList.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return u.name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q);
  });

  const categoryChartData = analytics?.category_breakdown
    ? Object.entries(analytics.category_breakdown).map(([name, value]) => ({
        name: CATEGORY_LABELS[name as keyof typeof CATEGORY_LABELS] || name,
        value,
      }))
    : [];

  const severityChartData = analytics?.severity_breakdown
    ? Object.entries(analytics.severity_breakdown).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }))
    : [];

  const statCards = analytics
    ? [
        { label: 'Total', value: (analytics as any).total, color: 'text-neu-800' },
        { label: 'Open', value: (analytics as any).open, color: 'text-primary-DEFAULT' },
        { label: 'Resolved', value: (analytics as any).resolved, color: 'text-emerald-600' },
        { label: 'Critical', value: (analytics as any).critical, color: 'text-red-500' },
        { label: 'SLA Breached', value: (analytics as any).sla_breached, color: 'text-rose-500' },
      ]
    : [];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-5xl mx-auto px-4 pt-6 pb-24"
    >
      <motion.div variants={itemVariants} className="mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage issues, users, and platform metrics</p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="flex gap-3 mb-6 overflow-x-auto pb-2 snap-x scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-300 snap-start ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30 scale-105'
                : 'glass-card text-slate-500 hover:text-slate-800 hover:bg-white/40'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        {/* --- QUEUE TAB --- */}
        {activeTab === 'queue' && (
          <motion.div key="queue" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10 }}>
            <motion.div variants={itemVariants} className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                Issue Queue
                <span className="text-sm font-normal text-gray-500 ml-2">({filteredIssues.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilterBar(!showFilterBar)}
                  className={`p-2 rounded-md border transition-colors ${showFilterBar ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  <Funnel size={18} />
                </button>
                <button onClick={loadQueue} className="p-2 rounded-md border bg-white border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </motion.div>

            <AnimatePresence>
              {showFilterBar && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
                  <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
                        <select className="w-full border-gray-300 rounded-md text-sm p-2 bg-gray-50" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                          <option value="">All</option>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Severity</label>
                        <select className="w-full border-gray-300 rounded-md text-sm p-2 bg-gray-50" value={filters.severity} onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}>
                          <option value="">All</option>
                          {(['low', 'medium', 'high', 'critical'] as IssueSeverity[]).map((s) => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Ward</label>
                        <input className="w-full border-gray-300 rounded-md text-sm p-2 bg-gray-50" placeholder="Ward ID" value={filters.ward} onChange={(e) => setFilters((f) => ({ ...f, ward: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {queueLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-lg p-4">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">ID</th>
                        <th className="px-4 py-3 font-semibold">Category</th>
                        <th className="px-4 py-3 font-semibold">Title</th>
                        <th className="px-4 py-3 font-semibold">Severity</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Age</th>
                        <th className="px-4 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredIssues.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                            No issues in queue.
                          </td>
                        </tr>
                      ) : (
                        filteredIssues.map((issue, i) => {
                          const slaStatus = computeSlaStatus(issue.sla_due_at ?? null);
                          return (
                            <tr key={issue.issue_id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs text-gray-500">{issue.issue_id.split('-')[0]}</td>
                              <td className="px-4 py-3 text-lg" title={CATEGORY_LABELS[issue.issue_type]}>
                                {CATEGORY_ICONS[issue.issue_type] || '📌'}
                              </td>
                              <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate cursor-pointer" onClick={() => navigate(`/issues/${issue.issue_id}`)}>
                                {issue.title}
                              </td>
                              <td className="px-4 py-3">
                                <SeverityBadge severity={issue.severity} />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1 items-start">
                                  <StatusBadge status={issue.status} />
                                  {slaStatus && (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      slaStatus.status === 'breached' ? 'bg-red-50 text-red-700' : slaStatus.status === 'at_risk' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'
                                    }`}>
                                      {slaStatus.label}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-xs">
                                {issue.created_at ? formatDistanceToNow(new Date(issue.created_at), { addSuffix: true }) : ''}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => openAssign(issue)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Assign">
                                    <UserSwitch size={16} />
                                  </button>
                                  <button onClick={() => navigate(`/issues/${issue.issue_id}`)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="View details">
                                    <DotsThreeVertical size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* --- ANALYTICS TAB --- */}
        {activeTab === 'analytics' && (
          <motion.div key="analytics" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10 }}>
            <motion.div variants={itemVariants} className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-neu-700">Analytics</h2>
              <NeuButton size="sm" icon={<Download size={16} />} onClick={handleExportCSV}>Export CSV</NeuButton>
            </motion.div>

            {analyticsLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <NeuCard key={i} padded={false} className="p-4">
                    <div className="animate-pulse space-y-2">
                      <div className="h-3 bg-neu-200 rounded w-1/2" />
                      <div className="h-6 bg-neu-200 rounded w-3/4" />
                    </div>
                  </NeuCard>
                ))}
              </div>
            ) : (
              <>
                <motion.div variants={itemVariants} className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
                  {statCards.map((stat) => (
                    <NeuCard key={stat.label} padded={false} className="p-4 text-center">
                      <p className="text-xs text-neu-400 mb-1">{stat.label}</p>
                      <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    </NeuCard>
                  ))}
                </motion.div>

                <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  {categoryChartData.length > 0 && (
                    <NeuCard padded={false} className="p-4 sm:p-6">
                      <h3 className="text-sm font-semibold text-neu-700 mb-4">Category Breakdown</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={categoryChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#c9cdd6" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#787f92' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#787f92' }} />
                          <Tooltip contentStyle={{ background: '#f0f2f5', border: 'none', borderRadius: '12px', boxShadow: '4px 4px 8px #c9cdd6' }} />
                          <Bar dataKey="value" fill="#6c5ce7" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </NeuCard>
                  )}
                  {severityChartData.length > 0 && (
                    <NeuCard padded={false} className="p-4 sm:p-6">
                      <h3 className="text-sm font-semibold text-neu-700 mb-4">Severity Breakdown</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={severityChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {severityChartData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: '#f0f2f5', border: 'none', borderRadius: '12px', boxShadow: '4px 4px 8px #c9cdd6' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </NeuCard>
                  )}
                </motion.div>

                {/* Ward leaderboard */}
                {(analytics as any)?.ward_leaderboard?.length > 0 && (
                  <motion.div variants={itemVariants}>
                    <NeuCard padded={false} className="p-4">
                      <h3 className="text-sm font-semibold text-neu-700 mb-4">Ward Leaderboard</h3>
                      <div className="space-y-2">
                        {(analytics as any).ward_leaderboard.map((ward: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-neu-100 last:border-0">
                            <span className="text-neu-700 font-medium">{ward.ward_name || 'Unknown Ward'}</span>
                            <div className="flex items-center gap-3 text-xs text-neu-500">
                              <span>{ward.total} total</span>
                              <span className="text-emerald-600 font-semibold">{ward.resolution_rate ?? 0}% resolved</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </NeuCard>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* --- USERS TAB --- */}
        {activeTab === 'users' && (
          <motion.div key="users" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10 }}>
            <motion.div variants={itemVariants} className="mb-4">
              <div className="neu-input flex items-center gap-2 px-4 py-3">
                <MagnifyingGlass size={16} className="text-neu-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="bg-transparent border-none outline-none flex-1 text-sm text-neu-700"
                />
              </div>
            </motion.div>

            {usersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <NeuCard key={i} padded={false} className="p-4">
                    <div className="animate-pulse space-y-2">
                      <div className="h-4 bg-neu-200 rounded w-1/3" />
                      <div className="h-3 bg-neu-200 rounded w-2/3" />
                    </div>
                  </NeuCard>
                ))}
              </div>
            ) : searchedUsers.length === 0 ? (
              <NeuCard padded={false} className="p-8 text-center">
                <Users size={40} className="text-neu-300 mx-auto mb-3" />
                <p className="text-neu-400 font-medium">No users found</p>
              </NeuCard>
            ) : (
              <div className="space-y-2">
                {searchedUsers.map((u, i) => (
                  <motion.div key={u.user_id} variants={itemVariants} transition={{ delay: 0.03 * i }}>
                    <NeuCard padded={false} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-light to-primary-dark flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {(u.name || 'User').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-neu-800 truncate">{u.name}</p>
                            {u.email && <p className="text-xs text-neu-400 truncate">{u.email}</p>}
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-amber-600 font-medium">{u.xp_points} XP</span>
                              <span className="text-[10px] text-neu-400">Trust: {u.trust_score?.toFixed(1)}</span>
                              <span className="text-[10px] text-neu-400">🔥 {u.streak_days}d streak</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <select
                            className="neu-input text-xs py-2 px-3 min-w-[100px]"
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.user_id, e.target.value as UserRole)}
                          >
                            {(['citizen', 'moderator', 'officer', 'admin'] as UserRole[]).map((r) => (
                              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </NeuCard>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* --- PREDICTIONS TAB --- */}
        {activeTab === 'predictions' && (
          <motion.div key="predictions" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10 }}>
            <motion.div variants={itemVariants} className="mb-4">
              <h2 className="text-lg font-bold text-neu-700">Predictive Insights</h2>
              <p className="text-sm text-neu-400">AI-powered hotspot detection and SLA risk analysis</p>
            </motion.div>

            {predictionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <NeuCard key={i} padded={false} className="p-4">
                    <div className="animate-pulse space-y-2">
                      <div className="h-4 bg-neu-200 rounded w-2/3" />
                      <div className="h-3 bg-neu-200 rounded w-1/2" />
                    </div>
                  </NeuCard>
                ))}
              </div>
            ) : predictions ? (
              <div className="space-y-4">
                {predictions.hotspots?.length > 0 && (
                  <motion.div variants={itemVariants}>
                    <h3 className="text-sm font-bold text-neu-700 mb-3 flex items-center gap-2">
                      <span className="text-red-500">🔥</span> Repeat Hotspots
                    </h3>
                    <div className="space-y-2">
                      {predictions.hotspots.map((h: any, i: number) => (
                        <NeuCard key={i} padded={false} className="p-4 border-l-4 border-orange-400">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-neu-800">
                                {CATEGORY_LABELS[h.issue_type as keyof typeof CATEGORY_LABELS] || h.issue_type} · {h.ward_name || 'Unknown Ward'}
                              </p>
                              <p className="text-xs text-neu-500 mt-0.5">{h.count} reports in 90 days</p>
                            </div>
                            <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full">{h.count}×</span>
                          </div>
                        </NeuCard>
                      ))}
                    </div>
                  </motion.div>
                )}

                {predictions.sla_at_risk?.length > 0 && (
                  <motion.div variants={itemVariants}>
                    <h3 className="text-sm font-bold text-neu-700 mb-3 flex items-center gap-2">
                      <Clock size={16} className="text-amber-500" /> SLA at Risk
                    </h3>
                    <div className="space-y-2">
                      {predictions.sla_at_risk.map((item: any, i: number) => (
                        <NeuCard key={i} padded={false} className="p-4 border-l-4 border-amber-400">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-neu-800 truncate max-w-xs">{item.title}</p>
                              <p className="text-xs text-neu-500">{item.officer_name ? `Assigned to: ${item.officer_name}` : 'Unassigned'}</p>
                            </div>
                            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full whitespace-nowrap">
                              {Math.round(item.hours_remaining)}h left
                            </span>
                          </div>
                        </NeuCard>
                      ))}
                    </div>
                  </motion.div>
                )}

                {predictions.bottlenecks?.length > 0 && (
                  <motion.div variants={itemVariants}>
                    <h3 className="text-sm font-bold text-neu-700 mb-3 flex items-center gap-2">
                      <Warning size={16} className="text-red-500" /> Department Bottlenecks
                    </h3>
                    <div className="space-y-2">
                      {predictions.bottlenecks.map((b: any, i: number) => (
                        <NeuCard key={i} padded={false} className="p-4 border-l-4 border-red-400">
                          <p className="text-sm font-semibold text-neu-800">{b.department}</p>
                          <p className="text-xs text-neu-500">{b.open_count} open · {b.breached_count} SLA breaches</p>
                        </NeuCard>
                      ))}
                    </div>
                  </motion.div>
                )}

                {(!predictions.hotspots?.length && !predictions.sla_at_risk?.length && !predictions.bottlenecks?.length) && (
                  <NeuCard padded={false} className="p-8 text-center">
                    <ShieldCheck size={40} className="text-emerald-400 mx-auto mb-3" />
                    <p className="text-neu-500 font-medium">All clear! No critical predictions at this time.</p>
                  </NeuCard>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
        
        {activeTab === 'moderation' && (
          <motion.div
            key="moderation"
            variants={itemVariants}
            initial="hidden" animate="visible" exit="exit"
            className="space-y-6"
          >
            <h3 className="text-lg font-bold text-neu-800 mb-4">Moderation Queue</h3>
            {moderationLoading ? (
              <div className="py-12 flex justify-center"><div className="animate-spin h-6 w-6 border-2 border-primary-DEFAULT border-t-transparent rounded-full" /></div>
            ) : moderationQueue.length === 0 ? (
              <NeuCard padded={false} className="p-8 text-center text-neu-500">
                <ShieldCheck size={32} className="mx-auto mb-2 text-emerald-400" />
                No items require moderation.
              </NeuCard>
            ) : (
              <div className="grid gap-3">
                {moderationQueue.map(item => (
                  <NeuCard key={item.issue_id} className="p-4 cursor-pointer hover:border-primary-DEFAULT transition-colors" onClick={() => navigate(`/issues/${item.issue_id}`)}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-neu-800">{item.title}</h4>
                        <p className="text-sm text-neu-500 line-clamp-1 mt-1">{item.description}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <SeverityBadge severity={item.severity as IssueSeverity} />
                      {item.ai_confidence !== undefined && item.ai_confidence < 0.65 && (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-semibold">
                          Low AI Confidence ({Math.round(item.ai_confidence * 100)}%)
                        </span>
                      )}
                      <span className="text-xs text-neu-400 ml-auto">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </NeuCard>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assign Modal */}
      <AnimatePresence>
        {showAssignModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowAssignModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              <NeuCard padded={false} className="p-6 w-full max-w-sm">
                <h3 className="text-base font-bold text-neu-800 mb-1">Assign Issue</h3>
                <p className="text-xs text-neu-400 mb-4 truncate">{selectedIssue?.title}</p>

                <div className="flex gap-2 mb-4">
                  <button onClick={() => setAssignType('team')} className={`flex-1 py-2 rounded-neup_sm text-xs font-semibold transition-all ${assignType === 'team' ? 'bg-primary-DEFAULT text-white' : 'neu-button text-neu-600'}`}>
                    To Team
                  </button>
                  <button onClick={() => setAssignType('officer')} className={`flex-1 py-2 rounded-neup_sm text-xs font-semibold transition-all ${assignType === 'officer' ? 'bg-primary-DEFAULT text-white' : 'neu-button text-neu-600'}`}>
                    To Officer
                  </button>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-neu-500 mb-1.5">Select {assignType === 'team' ? 'Team' : 'Officer'}</label>
                  <select className="neu-input text-sm" value={assignTarget} onChange={(e) => setAssignTarget(e.target.value)}>
                    <option value="">Choose...</option>
                    {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="flex gap-2">
                  <NeuButton variant="default" className="flex-1" onClick={() => setShowAssignModal(false)}>Cancel</NeuButton>
                  <NeuButton variant="primary" className="flex-1" onClick={handleAssign} disabled={!assignTarget}>Assign</NeuButton>
                </div>
              </NeuCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
