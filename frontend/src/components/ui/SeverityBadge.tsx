import React from 'react';
import { IssueSeverity, SEVERITY_COLORS } from '../../types';

export const SeverityBadge: React.FC<{ severity: IssueSeverity; className?: string }> = ({ severity, className = '' }) => {
  const color = SEVERITY_COLORS[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}
      style={{ backgroundColor: `${color}20`, color }}>
      <span className="status-dot" style={{ backgroundColor: color }} />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
};
