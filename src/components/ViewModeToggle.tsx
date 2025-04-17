import React from 'react';
import { ViewModeToggleProps } from '../types';
import { motion } from 'framer-motion';

const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ mode, onToggle }) => {
  const getIcon = () => {
    switch (mode) {
      case 'fullscreen':
        // Grid icon when in fullscreen mode
        return (
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            />
          </motion.svg>
        );
      case 'grid':
        // Fullscreen icon when in grid mode
        return (
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z"
            />
          </motion.svg>
        );
      case 'stack':
      default:
        // Grid icon when in stack mode
        return (
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            />
          </motion.svg>
        );
    }
  };
  
  const getAriaLabel = () => {
    switch (mode) {
      case 'fullscreen':
        return 'Switch to grid view';
      case 'grid':
        return 'Switch to fullscreen view';
      case 'stack':
      default:
        return 'Switch to grid view';
    }
  };
  
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-full transition-colors duration-200 hover:bg-primary-100 dark:hover:bg-primary-800 bg-white/20 backdrop-blur-sm"
      aria-label={getAriaLabel()}
    >
      {getIcon()}
    </button>
  );
};

export default ViewModeToggle; 