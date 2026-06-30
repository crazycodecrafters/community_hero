import React from 'react';

interface NeuInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const NeuInput: React.FC<NeuInputProps> = ({ label, error, icon, className = '', ...props }) => (
  <div className="w-full">
    {label && <label className="block text-sm font-medium text-neu-600 mb-2">{label}</label>}
    <div className="relative">
      {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neu-400">{icon}</div>}
      <input className={`neu-input ${icon ? 'pl-12' : ''} ${error ? 'shadow-[inset_3px_3px_6px_rgba(225,112,85,0.2),inset_-3px_-3px_6px_#ffffff]' : ''} ${className}`} {...props} />
    </div>
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
);
