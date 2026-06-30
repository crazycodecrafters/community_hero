import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getIdToken } from '../services/auth';
import { useStore } from '../store';
import { Issue, IssueStatus, IssueSeverity, CATEGORY_LABELS, SEVERITY_COLORS, STATUS_LABELS, CATEGORY_ICONS } from '../types';
import { NeuCard, NeuButton, SeverityBadge, StatusBadge } from '../components/ui';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

async function fetchOfficerQueue(): Promise<Issue[]> {
  const token = await getIdToken();
  const res = await fetch(`${API_URL}/officer/queue`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const OfficerDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useStore();
  
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'new' | 'my_assignments' | 'team_queue' | 'resolved'>('new');

  useEffect(() => {
    fetchOfficerQueue()
      .then(setIssues)
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredIssues = issues.filter(issue => {
    if (activeTab === 'new') return issue.status === 'verification' || (issue.status === 'ai_triaged' && !issue.assigned_officer_id);
    if (activeTab === 'my_assignments') return issue.assigned_officer_id === user?.user_id && issue.status !== 'resolved';
    if (activeTab === 'resolved') return issue.assigned_officer_id === user?.user_id && issue.status === 'resolved';
    return true; // Team queue logic requires backend team fetching, simplified for now
  });

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary-DEFAULT border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Officer Console</h1>
          <p className="text-sm text-gray-500">Manage your assigned wards and department queue</p>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          <span className="text-gray-600">{user?.name}</span>
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md uppercase text-xs">{user?.role}</span>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex space-x-3 border-b border-gray-200 px-6 py-4 bg-gray-50/50 overflow-x-auto snap-x scrollbar-hide">
            {[
              { id: 'new', label: 'New & Unassigned' },
              { id: 'my_assignments', label: 'My Assignments' },
              { id: 'team_queue', label: 'Team Queue' },
              { id: 'resolved', label: 'Resolved by Me' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-300 whitespace-nowrap snap-start ${
                  activeTab === tab.id 
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20 scale-105' 
                    : 'glass-card text-gray-500 hover:text-gray-800 hover:bg-white/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">Issue ID</th>
                  <th className="px-6 py-3 font-semibold">Title</th>
                  <th className="px-6 py-3 font-semibold">Severity</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">SLA Status</th>
                  <th className="px-6 py-3 font-semibold text-right">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredIssues.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No issues found in this queue.
                    </td>
                  </tr>
                ) : (
                  filteredIssues.map(issue => {
                    const isBreached = issue.sla_due_at && new Date(issue.sla_due_at).getTime() < Date.now();
                    return (
                      <tr 
                        key={issue.issue_id} 
                        onClick={() => navigate(`/issues/${issue.issue_id}`)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">
                          {issue.issue_id.split('-')[0]}
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900 max-w-xs truncate">
                          {issue.title}
                        </td>
                        <td className="px-6 py-4">
                          <SeverityBadge severity={issue.severity} />
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={issue.status} />
                        </td>
                        <td className="px-6 py-4">
                          {issue.sla_due_at ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              isBreached ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {isBreached ? 'SLA Breached' : 'On Track'}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">No SLA</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-500 text-xs">
                          {formatDistanceToNow(new Date(issue.created_at || Date.now()), { addSuffix: true })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
