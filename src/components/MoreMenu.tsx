import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreMenuProps } from '../types';

// Utility for comprehensive scroll locking
const lockScroll = () => {
  // Save current scroll position
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;
  
  // Store original body style properties
  const originalStyles = {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    width: document.body.style.width,
    height: document.body.style.height,
    touchAction: document.body.style.touchAction,
    htmlOverflow: document.documentElement.style.overflow,
    htmlHeight: document.documentElement.style.height
  };
  
  // Apply comprehensive scroll locking
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.style.height = '100%';
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = `-${scrollX}px`;
  document.body.style.width = '100%';
  document.body.style.height = '100%';
  document.body.style.touchAction = 'none'; // Prevent touch scrolling
  
  // Add event listener to prevent touchmove on mobile
  const preventDefault = (e: TouchEvent) => {
    e.preventDefault();
  };
  
  document.addEventListener('touchmove', preventDefault, { passive: false });
  
  // Return function to unlock
  return () => {
    // Restore original styles
    document.documentElement.style.overflow = originalStyles.htmlOverflow;
    document.documentElement.style.height = originalStyles.htmlHeight;
    document.body.style.overflow = originalStyles.overflow;
    document.body.style.position = originalStyles.position;
    document.body.style.top = originalStyles.top;
    document.body.style.left = originalStyles.left;
    document.body.style.width = originalStyles.width;
    document.body.style.height = originalStyles.height;
    document.body.style.touchAction = originalStyles.touchAction;
    
    // Remove event listener
    document.removeEventListener('touchmove', preventDefault);
    
    // Restore scroll position
    window.scrollTo(scrollX, scrollY);
  };
};

const MoreMenu: React.FC<MoreMenuProps> = ({ isOpen, onClose, onViewLikedArticles }) => {
  const unlockScrollRef = useRef<(() => void) | null>(null);
  
  // Handle scroll locking
  useEffect(() => {
    if (isOpen) {
      unlockScrollRef.current = lockScroll();
    }
    
    return () => {
      if (unlockScrollRef.current) {
        unlockScrollRef.current();
        unlockScrollRef.current = null;
      }
    };
  }, [isOpen]);
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          
          {/* Menu */}
          <motion.div
            className="fixed bottom-0 inset-x-0 bg-white/10 backdrop-blur-xl rounded-t-3xl text-white z-50 overflow-hidden"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Menu header */}
            <div className="px-6 pt-5 pb-3 flex justify-between items-center">
              <h3 className="text-xl font-bold font-garamond">More Options</h3>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Menu options */}
            <div className="px-4 pb-8">
              <button
                onClick={() => {
                  onViewLikedArticles();
                  onClose();
                }}
                className="w-full py-4 px-4 flex items-center space-x-4 hover:bg-white/10 rounded-2xl transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-lg font-space">Liked Topics</h4>
                  <p className="text-sm text-white/70">View your favorite articles</p>
                </div>
              </button>
            </div>
            
            {/* Safe area spacer for iOS */}
            <div className="h-[env(safe-area-inset-bottom)]"></div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MoreMenu; 