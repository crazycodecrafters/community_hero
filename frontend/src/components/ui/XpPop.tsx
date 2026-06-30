import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface XpPopProps {
  points: number;
  trigger: boolean;
}

export const XpPop: React.FC<XpPopProps> = ({ points, trigger }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (trigger) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 800);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1, y: 0, scale: 0.5 }}
          animate={{ opacity: 0, y: -80, scale: 1.5 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="xp-float top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <div className="bg-gradient-to-r from-primary-DEFAULT to-purple-500 text-white font-bold text-lg px-4 py-2 rounded-full shadow-lg">
            +{points} XP
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
