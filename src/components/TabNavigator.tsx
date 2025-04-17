import React from 'react';
import { motion } from 'framer-motion';

export type TabType = 'articles' | 'podcasts';

interface TabNavigatorProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TabNavigator: React.FC<TabNavigatorProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex justify-center items-center">
      <div className="flex bg-white/5 backdrop-blur-md rounded-full p-0.5 shadow-md">
        <button
          className={`relative flex items-center justify-center px-3 py-1 rounded-full text-sm transition-colors ${
            activeTab === 'articles' ? 'text-white' : 'text-white/60 hover:text-white/80'
          }`}
          onClick={() => onTabChange('articles')}
        >
          {activeTab === 'articles' && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full"
              layoutId="activeTab"
              initial={false}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          <span className="z-10 relative">Articles</span>
        </button>
        
        <button
          className={`relative flex items-center justify-center px-3 py-1 rounded-full text-sm transition-colors ${
            activeTab === 'podcasts' ? 'text-white' : 'text-white/60 hover:text-white/80'
          }`}
          onClick={() => onTabChange('podcasts')}
        >
          {activeTab === 'podcasts' && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-purple-600 to-purple-800 rounded-full"
              layoutId="activeTab"
              initial={false}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          <span className="z-10 relative">Podcasts</span>
        </button>
      </div>
    </div>
  );
};

export default TabNavigator; 