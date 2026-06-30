import React from 'react';
import { motion } from 'framer-motion';

interface NeuCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  padded?: boolean;
}

export const NeuCard: React.FC<NeuCardProps> = ({ children, className = '', onClick, hoverable = false, padded = true }) => (
  <motion.div
    whileHover={hoverable ? { scale: 1.01 } : {}}
    whileTap={hoverable ? { scale: 0.99 } : {}}
    onClick={onClick}
    className={`neu-card ${padded ? 'p-4 sm:p-6' : ''} ${onClick || hoverable ? 'cursor-pointer' : ''} ${className}`}
  >
    {children}
  </motion.div>
);
