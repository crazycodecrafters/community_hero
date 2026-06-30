import React from 'react';
import { IssueStatus, STATUS_LABELS } from '../../types';

const statusConfig: Record<IssueStatus, { color: string; bg: string; dot: string }> = {
  reported: { color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500' },
  ai_triaged: { color: 'text-purple-700', bg: 'bg-purple-50', dot: 'bg-purple-500' },
  verification: { color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  assigned: { color: 'text-indigo-700', bg: 'bg-indigo-50', dot: 'bg-indigo-500' },
  in_progress: { color: 'text-cyan-700', bg: 'bg-cyan-50', dot: 'bg-cyan-500' },
  resolved: { color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  closed: { color: 'text-gray-700', bg: 'bg-gray-100', dot: 'bg-gray-500' },
  reopened: { color: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500' },
};

export const StatusBadge: React.FC<{ status: IssueStatus; className?: string }> = ({ status, className = '' }) => {
  const config = statusConfig[status] || statusConfig.reported;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.color} ${config.bg} ${className}`}>
      <span className={`status-dot ${config.dot}`} />
      {STATUS_LABELS[status]}
    </span>
  );
};
