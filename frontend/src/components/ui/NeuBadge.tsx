import React from 'react';

interface NeuBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'warning';
  className?: string;
}

const colors = {
  default: 'text-neu-600', primary: 'text-primary-DEFAULT', success: 'text-emerald-600',
  danger: 'text-red-500', warning: 'text-amber-600',
};

export const NeuBadge: React.FC<NeuBadgeProps> = ({ children, variant = 'default', className = '' }) => (
  <span className={`neu-badge ${colors[variant]} ${className}`}>{children}</span>
);
