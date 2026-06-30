import React from 'react';
import { motion } from 'framer-motion';

interface NeuButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const NeuButton: React.FC<NeuButtonProps> = ({
  children, onClick, variant = 'default', size = 'md', disabled = false,
  className = '', type = 'button', loading = false, icon,
}) => {
  const sizeClasses = { sm: 'px-4 py-2 text-sm', md: 'px-6 py-3 text-base', lg: 'px-8 py-4 text-lg' };
  const variantClasses = {
    default: 'neu-button text-neu-800',
    primary: 'neu-button-primary',
    danger: 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg',
    success: 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg',
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={onClick}
      disabled={disabled || loading}
      type={type}
      className={`${variantClasses[variant]} ${sizeClasses[size]} rounded-neup font-semibold flex items-center justify-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {loading ? (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
      ) : icon}
      {children}
    </motion.button>
  );
};
