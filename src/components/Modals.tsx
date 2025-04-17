import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WikipediaArticle } from '../types';
import { XMarkIcon } from '@heroicons/react/24/outline';
import useScrollLock from '../hooks/useScrollLock';

// Modal wrapper component to handle scroll locking
export const ModalWrapper: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ isOpen, onClose, children }) => {
  const { lockScroll, unlockScroll } = useScrollLock();
  
  // Apply complete scroll lock when modal opens
  useEffect(() => {
    if (isOpen) {
      // Lock scroll on body and html
      lockScroll();
      
      // Prevent wheel events from propagating to main content
      const preventWheel = (e: WheelEvent) => {
        // Only prevent default if not inside a scrollable modal area
        const target = e.target as HTMLElement;
        const isScrollableArea = target.closest('[data-scroll-allowed="true"]');
        
        if (!isScrollableArea) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      
      // Prevent touchmove events
      const preventTouch = (e: TouchEvent) => {
        const target = e.target as HTMLElement;
        const isScrollableArea = target.closest('[data-scroll-allowed="true"]');
        
        if (!isScrollableArea) {
          e.preventDefault();
        }
      };
      
      // Add all event listeners
      window.addEventListener('wheel', preventWheel, { passive: false });
      window.addEventListener('touchmove', preventTouch, { passive: false });
      
      // Clean up when component unmounts or modal closes
      return () => {
        unlockScroll();
        window.removeEventListener('wheel', preventWheel);
        window.removeEventListener('touchmove', preventTouch);
      };
    }
    
    return undefined;
  }, [isOpen, lockScroll, unlockScroll]);
  
  if (!isOpen) return null;
  
  return (
    <motion.div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      
      <motion.div 
        className="relative w-full max-w-lg bg-white/10 backdrop-blur-lg rounded-3xl text-white overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

// Utility function to generate source badges
export const getSourceBadge = (article: WikipediaArticle) => {
  if (article.source === 'wikipedia' || !article.source) {
    return { label: 'Wikipedia', color: 'from-blue-500 to-blue-700' };
  } else if (article.source === 'hackernews') {
    return { label: 'Hacker News', color: 'from-orange-500 to-orange-700' };
  } else if (article.source === 'onthisday') {
    return { label: 'On This Day', color: 'from-green-500 to-green-700' };
  } else if (article.source === 'oksurf') {
    return { label: 'Trending', color: 'from-purple-500 to-purple-700' };
  }
  return { label: 'Source', color: 'from-gray-500 to-gray-700' };
};

// About modal component
export const AboutModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  if (!isOpen) return null;
  
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      {/* Top section - Title + Close icon */}
      <div className="py-4 px-5 flex justify-between items-center">
        <h2 className="text-2xl font-bold font-garamond">About</h2>
        <button 
          className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          onClick={onClose}
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>
      
      {/* Divider - full width */}
      <div className="h-[2px] bg-white/10 w-full" />
      
      {/* Middle section - Description */}
      <div className="px-5 py-6 flex-grow overflow-y-auto modal-scrollable-content" data-scroll-allowed="true">
  <p className="font-space text-white/90 leading-relaxed">
    Explore the world with Topiq — a new way to learn, stay updated, and get inspired.
    From Wikipedia to Reddit, headlines to podcasts — it’s all here.<br />
    Fast. Thoughtful. Made for how we think today.
  </p>
</div>

      
      {/* Divider - full width */}
      <div className="h-[2px] bg-white/10 w-full" />
      
      {/* Bottom section - Signature */}
      <div className="py-3 px-4 flex items-center justify-center">
        <p className="flex items-center justify-center font-space">
          Made with ❤️ by <a href="https://www.linkedin.com/in/chandumachineni/" target="_blank" rel="noopener noreferrer" className="font-bold ml-1 hover:underline">Chandu Machineni</a>
        </p>
      </div>
    </ModalWrapper>
  );
};

// Likes modal component with proper scroll locking
export const LikesModal = ({ isOpen, onClose, likedArticles }: { 
  isOpen: boolean, 
  onClose: () => void, 
  likedArticles: Record<number, boolean> 
}) => {
  const [savedArticles, setSavedArticles] = useState<WikipediaArticle[]>([]);
  
  useEffect(() => {
    if (isOpen) {
      const fetchLikedArticles = async () => {
        try {
          const storedArticles = localStorage.getItem('topiq.space_saved_articles');
          if (storedArticles) {
            const articleList: WikipediaArticle[] = JSON.parse(storedArticles);
            // Keep only the ones that are still liked and reverse the order to show latest first
            const filtered = articleList.filter(a => likedArticles[a.pageid]).reverse();
            setSavedArticles(filtered);
            
            // If there are any inconsistencies between liked state and saved articles, fix them
            const currentLikedIds = Object.keys(likedArticles).map(id => parseInt(id));
            const savedIds = filtered.map(article => article.pageid);
            
            // Find IDs that are liked but not in saved articles
            const missingIds = currentLikedIds.filter(id => !savedIds.includes(id));
            
            if (missingIds.length > 0) {
              // Remove missing IDs from liked articles
              const updatedLikedArticles = { ...likedArticles };
              missingIds.forEach(id => {
                delete updatedLikedArticles[id];
              });
              
              // Update localStorage
              localStorage.setItem('topiq.space_liked', JSON.stringify(updatedLikedArticles));
            }
          }
        } catch (error) {
          console.error('Error fetching liked articles:', error);
        }
      };
      
      fetchLikedArticles();
    }
  }, [isOpen, likedArticles]);
  
  if (!isOpen) return null;
  
  // Remove article from likes
  const removeFromLikes = (articleId: number) => {
    // Update local storage
    const storedArticles = localStorage.getItem('topiq.space_saved_articles');
    if (storedArticles) {
      try {
        const articleList: WikipediaArticle[] = JSON.parse(storedArticles);
        const filtered = articleList.filter(a => a.pageid !== articleId);
        localStorage.setItem('topiq.space_saved_articles', JSON.stringify(filtered));
        setSavedArticles(filtered);
        
        // Update likes state
        const newLikedArticles = { ...likedArticles };
        delete newLikedArticles[articleId];
        localStorage.setItem('topiq.space_liked', JSON.stringify(newLikedArticles));
        
        // Force re-render of parent component by dispatching a custom event
        window.dispatchEvent(new CustomEvent('article:unliked', { detail: { articleId } }));
      } catch (error) {
        console.error('Error removing liked article:', error);
      }
    }
  };
  
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose}>
      {/* Top section - Title + Close icon */}
      <div className="py-4 px-5 flex justify-between items-center">
        <h2 className="text-2xl font-bold font-garamond">Liked Articles</h2>
        <button 
          className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          onClick={onClose}
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>
      
      {/* Divider - full width */}
      <div className="h-[2px] bg-white/10 w-full" />
      
      {/* Middle section - Grid layout of liked articles */}
      <div className="max-h-[70vh] overflow-y-auto modal-scrollable-content p-4" data-scroll-allowed="true">
        {savedArticles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {savedArticles.map(article => (
              <a 
                key={article.pageid} 
                href={article.source === 'hackernews' && article.url 
                  ? article.url 
                  : `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white/5 hover:bg-white/10 rounded-xl overflow-hidden transition-all duration-300 shadow-md flex flex-col h-full cursor-pointer"
              >
                {/* Article image */}
                <div className="w-full h-40 relative">
                  {article.thumbnail ? (
                    <img 
                      src={article.thumbnail.source} 
                      alt={article.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x200?text=No+Image';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                      {article.source === 'onthisday' && (
                        <span className="text-4xl">⏳</span>
                      )}
                      {article.source === 'hackernews' && (
                        <span className="text-4xl">💻</span>
                      )}
                      {article.source === 'oksurf' && (
                        <span className="text-4xl">📰</span>
                      )}
                      {(!article.source || article.source === 'wikipedia') && (
                        <span className="text-4xl">📚</span>
                      )}
                    </div>
                  )}
                  
                  {/* Source badge */}
                  {article.source && (
                    <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-full bg-gradient-to-r ${getSourceBadge(article).color} text-xs font-medium shadow text-white/90`}>
                      {getSourceBadge(article).label}
                    </div>
                  )}
                  
                  {/* Remove button - stopPropagation to prevent opening link when removing */}
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeFromLikes(article.pageid);
                    }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors"
                    aria-label="Remove from likes"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                
                {/* Article content */}
                <div className="p-3 flex-grow flex flex-col">
                  <h3 className="font-bold text-sm line-clamp-2 mb-1">{article.title}</h3>
                  
                  {article.extract && (
                    <p className="text-white/60 text-xs line-clamp-3">
                      {article.source === 'hackernews' 
                        ? article.extract.replace(/<[^>]*>/g, '').replace(/\d+ points \| \d+ comments/, '').trim()
                        : article.extract}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">❤️</div>
            <h3 className="text-xl font-bold mb-2">No liked articles yet</h3>
            <p className="text-white/60">
              When you like an article, it will appear here so you can find it later.
            </p>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}; 