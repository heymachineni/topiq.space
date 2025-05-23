import React, { useState, useEffect, useRef, WheelEvent as ReactWheelEvent, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo, useTransform, useScroll } from 'framer-motion';
import { WikipediaArticle, SwipeDirection, ContentSource, PodcastEpisode } from '../types';
import { XMarkIcon, ArrowUpIcon } from '@heroicons/react/24/outline';
import { searchPodcastEpisodes } from '../utils/api';
import parse from 'html-react-parser';
import DOMPurify from 'dompurify';
import { AboutModal, LikesModal } from './Modals';
import useScrollLock from '../hooks/useScrollLock';
import { useState as useImageState, useEffect as useImageEffect } from 'react';
import OptimizedImage from './OptimizedImage';

interface FullScreenViewProps {
  articles: WikipediaArticle[];
  onRefresh: () => void;
  onSaveArticle: (article: WikipediaArticle) => void;
  onShareArticle: (article: WikipediaArticle) => void;
  isLoading: boolean;
  loadMoreArticlesInBackground: (count: number) => void;
  tabNavigator?: React.ReactNode;
  hasAudioPlayer?: boolean;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  newArticlesCount?: number;
  onScrollToTop?: () => void;
}

// Source-specific configurations for badges and labels
const sourceConfig = {
  'wikipedia': {
    label: 'Wikipedia',
    color: 'bg-blue-500'
  },
  'onthisday': {
    label: 'On This Day',
    color: 'bg-blue-300'
  },
  'hackernews': {
    label: 'Hacker News',
    color: 'bg-orange-400'
  },
  'oksurf': {
    label: 'OK Surf',
    color: 'bg-green-400'
  }, 
  'reddit': {
    label: 'Reddit',
    color: 'bg-red-500'
  },
  'wikievents': {
    label: 'Current Events',
    color: 'bg-blue-600'
  }
};

// Get source badge for articles
const getSourceBadge = (article: WikipediaArticle) => {
  // Default to Wikipedia if no source is specified
  if (!article.source || article.source === 'wikipedia') {
    return {
      label: 'Wikipedia',
      color: 'from-blue-500 to-blue-700'
    };
  } else if (article.source === 'hackernews') {
    return {
      label: 'Hacker News',
      color: 'from-orange-500 to-orange-700'
    };
  } else if (article.source === 'onthisday') {
    // Create a dynamic date for On This Day
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    return {
      label: `on ${formattedDate}`,
      color: 'from-green-500 to-teal-600'
    };
  } else if (article.source === 'oksurf') {
    return {
      label: 'Trending',
      color: 'from-purple-500 to-pink-600'
    };
  } else if (article.source === 'reddit') {
    return {
      label: 'Reddit',
      color: 'from-red-500 to-red-700'
    };
  } else if (article.source === 'wikievents') {
    return {
      label: 'Current Events',
      color: 'from-indigo-500 to-indigo-700'
    };
  }
  
  // Fallback to Wikipedia badge for any unknown source
  return {
    label: 'Wikipedia',
    color: 'from-blue-500 to-blue-700'
  };
};

// Format date like "Apr 13"
const formatDate = (dateStr: string) => {
  const [month, day] = dateStr.split('/');
  const date = new Date(2023, parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Get background for articles without thumbnails - pastel gradients
const getArticleBackground = (article: WikipediaArticle): string | undefined => {
  if (article.thumbnail?.source) return undefined;
  
  const source = article.source || 'wikipedia';
  
  // Enhanced pastel gradients for better visual appeal
  const gradients = {
    wikipedia: 'linear-gradient(135deg, #a8c0ff, #3f5efb)',
    onthisday: 'linear-gradient(135deg, #d4e7ff, #8aabdb)',
    hackernews: 'linear-gradient(135deg, #ffcf8c, #ffb347)',
    oksurf: 'linear-gradient(135deg, #c2e9fb, #81d4fa)',
    reddit: 'linear-gradient(135deg, #ffcccb, #e57373)',
    rss: 'linear-gradient(135deg, #a7f3d0, #10b981)',
    wikievents: 'linear-gradient(135deg, #c7d2fe, #6366f1)'
  };
  
  return gradients[source];
};

// Article gradient background colors by source
const gradientBackgrounds: Record<ContentSource, string> = {
  wikipedia: 'linear-gradient(135deg, #1a237e, #283593)',
  wikievents: 'linear-gradient(135deg, #6366f1, #4338ca)',
  hackernews: 'linear-gradient(135deg, #bf360c, #d84315)',
  reddit: 'linear-gradient(135deg, #b71c1c, #c62828)',
  onthisday: 'linear-gradient(135deg, #d4e7ff, #8aabdb)',
  oksurf: 'linear-gradient(135deg, #4a148c, #6a1b9a)'
};

// Format the title, accommodating different sources
const getFormattedTitle = (article: WikipediaArticle): string => {
  if (article && article.title) {
    return article.title;
  }
  return "No Title Available";
}

// Clean HackerNews extract (for text-only posts)
const cleanHackerNewsExtract = (article: WikipediaArticle): string => {
  // If no extract available, return a placeholder
  if (!article.extract) return "No content available";
  
  // Strip any HTML tags using a regex
  return article.extract
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&lt;/g, '<')    // Replace HTML entities
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim();
};

// Parse HTML content safely with DOMPurify
const parseHtmlContent = (html: string) => {
  const cleanHtml = DOMPurify.sanitize(html, {
    ADD_TAGS: ['math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac'],
    ADD_ATTR: ['display', 'notation', 'alttext']
  });
  
  return parse(cleanHtml);
};

// Podcast Modal Component
const PodcastModal = ({ 
  episodes, 
  isOpen, 
  onClose,
  lockScroll,
  unlockScroll
}: {
  episodes: PodcastEpisode[];
  isOpen: boolean;
  onClose: () => void;
  lockScroll: () => void;
  unlockScroll: () => void;
}) => {
  // Apply scroll lock when modal opens
  useEffect(() => {
    if (isOpen) {
      lockScroll();
    }
    
    return () => {
      // Only unlock if modal was open
      if (isOpen) {
        unlockScroll();
      }
    };
  }, [isOpen, lockScroll, unlockScroll]);
  
  if (!isOpen || episodes.length === 0) return null;
  
  return (
    <motion.div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      
      <motion.div 
        className="relative w-full max-w-4xl max-h-[90vh] bg-black/40 backdrop-blur-lg rounded-3xl text-white overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
      >
        {/* Header with title and close button */}
        <div className="px-5 py-4 flex justify-between items-center border-b border-white/10">
          <h2 className="text-2xl font-bold font-garamond">Related Podcasts</h2>
          <button 
            className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            onClick={onClose}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        {/* Episodes list with scrolling */}
        <div className="overflow-y-auto flex-grow modal-scrollable-content" data-scroll-allowed="true">
          {episodes.map(episode => (
            <div 
              key={episode.id}
              className="p-4 border-b border-white/10 hover:bg-white/5 transition-colors"
            >
              <div className="flex">
                {episode.image && (
                  <div className="w-24 h-24 flex-shrink-0 mr-4">
                    <img 
                      src={episode.image} 
                      alt={episode.feedTitle} 
                      className="w-full h-full object-cover rounded-lg"
                      loading="lazy"
                      decoding="async"
                      crossOrigin="anonymous"
                      onError={(e) => {
                        console.log('Modal image load error, using fallback', episode.title);
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/96x96?text=Podcast';
                      }}
                    />
                  </div>
                )}
                <div className="flex-grow">
                  <h3 className="text-lg font-bold mb-1 line-clamp-2">{episode.title}</h3>
                  <p className="text-sm text-white/60 mb-1">{episode.feedTitle}</p>
                  <div className="flex items-center text-xs text-white/60 mb-2">
                    <span>{episode.datePublished}</span>
                    {typeof episode.duration === 'string' && (
                      <>
                        <span className="mx-2">•</span>
                        <span>{episode.duration}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-white/80 line-clamp-2">{episode.description}</p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <a 
                  href={episode.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-blue-400 hover:text-blue-300 text-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Listen
                </a>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

const FullScreenView: React.FC<FullScreenViewProps> = ({
  articles,
  onRefresh,
  onSaveArticle,
  onShareArticle,
  isLoading,
  loadMoreArticlesInBackground,
  tabNavigator,
  hasAudioPlayer = false,
  initialIndex = 0,
  onIndexChange,
  newArticlesCount = 0,
  onScrollToTop,
}) => {
  // State for current article index and direction
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection | null>(null);
  
  // Modal visibility state
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showLikesModal, setShowLikesModal] = useState(false);
  const [showPodcastModal, setShowPodcastModal] = useState(false);
  
  // Liked articles state
  const [likedArticles, setLikedArticles] = useState<Record<number, boolean>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  
  // Podcast state
  const [relatedPodcasts, setRelatedPodcasts] = useState<PodcastEpisode[]>([]);
  
  // State for new articles notification animation
  const [isScrollingToTop, setIsScrollingToTop] = useState(false);
  
  // Refs for animation and interaction handling
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentArticleRef = useRef<WikipediaArticle | null>(null);
  const loadingMoreRef = useRef(false);
  const tapTimerRef = useRef<number | null>(null);
  const unlockScrollRef = useRef<(() => void) | null>(null);
  
  // Add touch tracking refs for mobile swipe detection
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  
  // State for double tap
  const [lastTapTime, setLastTapTime] = useState(0);

  // Add state for responsive padding
  const [paddingBottom, setPaddingBottom] = useState('calc(1.75rem + 40px)');
  
  // Update padding on window resize - safely check for window
  useEffect(() => {
    // Initialize padding based on client-side window width
    if (typeof window !== 'undefined') {
      setPaddingBottom(window.innerWidth < 768 ? 'calc(1.75rem + 76px)' : 'calc(1.75rem + 40px)');
      
      const handleResize = () => {
        setPaddingBottom(window.innerWidth < 768 ? 'calc(1.75rem + 76px)' : 'calc(1.75rem + 40px)');
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Initialize scroll lock at component level
  const { lockScroll, unlockScroll } = useScrollLock();
  
  // Add a new state to lock navigation during transitions
  const [isNavigationLocked, setIsNavigationLocked] = useState(false);
  
  // State for scroll control - switch to a simple cooldown-based approach
  const [isOnCooldown, setIsOnCooldown] = useState(false);
  const lastScrollTime = useRef(0);
  const lastScrollDirection = useRef<'up' | 'down' | null>(null);
  
  // Define callback functions for modals that need to be passed to child components
  const handleLockScroll = useCallback(() => {
    lockScroll();
  }, [lockScroll]);
  
  const handleUnlockScroll = useCallback(() => {
    unlockScroll();
  }, [unlockScroll]);
  
  // Notify parent component when current index changes
  useEffect(() => {
    onIndexChange?.(currentIndex);
  }, [currentIndex, onIndexChange]);
  
  // Handle scroll to top when clicking the new articles pill
  const handleNewArticlesPillClick = useCallback(() => {
    if (onScrollToTop) {
      onScrollToTop();
      return;
    }
    
    // Fallback if onScrollToTop is not provided
    setIsScrollingToTop(true);
    setIsNavigationLocked(true);
    
    // Smoothly scroll to the top (first article)
    const scrollToTop = () => {
      if (currentIndex <= 0) {
        setCurrentIndex(0);
        setIsScrollingToTop(false);
        setIsNavigationLocked(false);
        return;
      }
      
      // Decrease index by 1 and set up the next step
      setCurrentIndex(prev => prev - 1);
      setTimeout(scrollToTop, 150);
    };
    
    scrollToTop();
  }, [currentIndex, onScrollToTop]);
  
  // Apply scroll lock when component mounts, and release when it unmounts
  useEffect(() => {
    // Only lock scroll if this component is visible
    lockScroll();
    
    // Clean up and unlock scroll when component unmounts
    return () => {
      unlockScroll();
      
      // Also clear any timeouts to prevent memory leaks
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [lockScroll, unlockScroll]);
  
  // Handle About modal scroll locking
  useEffect(() => {
    // Apply scroll lock when About modal opens
    if (showAboutModal) {
      lockScroll();
    }
    
    // Clean up when the modal closes
    return () => {
      if (showAboutModal) {
        unlockScroll();
      }
    };
  }, [showAboutModal, lockScroll, unlockScroll]);
  
  // Handle Likes modal scroll locking
  useEffect(() => {
    if (showLikesModal) {
      lockScroll();
    }
    
    return () => {
      if (showLikesModal) {
        unlockScroll();
      }
    };
  }, [showLikesModal, lockScroll, unlockScroll]);

  // Handle Podcast modal scroll locking
  useEffect(() => {
    if (showPodcastModal) {
      lockScroll();
    }
    
    return () => {
      if (showPodcastModal) {
        unlockScroll();
      }
    };
  }, [showPodcastModal, lockScroll, unlockScroll]);
  
  // Always initialize scrollY, even if we don't use it right away
  const { scrollY } = useScroll({
    container: containerRef
  });
  
  // Create transform functions but remove scale effects
  const backgroundY = useTransform(scrollY, [0, 1], [0, 0]); // Remove parallax
  const titleY = useTransform(scrollY, [0, 1], [0, 0]); // Remove parallax
  const contentY = useTransform(scrollY, [0, 1], [0, 0]); // Fixed position
  const prevIndicatorOpacity = useTransform(scrollY, [0, -50], [0, 0.3]);
  const nextIndicatorOpacity = useTransform(scrollY, [0, 50], [0, 0.3]);
  // Remove scale transforms
  const prevIndicatorScale = useTransform(scrollY, [0, 1], [1, 1]);
  const nextIndicatorScale = useTransform(scrollY, [0, 1], [1, 1]);
  const backgroundScale = useTransform(scrollY, [0, 1], [1, 1]); // Remove scaling
  const imageScale = useTransform(scrollY, [0, 1], [1, 1]); // Remove scaling
  
  // Update current article ref when index or articles change
  useEffect(() => {
    currentArticleRef.current = articles[currentIndex] || null;
  }, [articles, currentIndex]);
  
  // Filter out articles without titles before using them
  useEffect(() => {
    if (articles.length > 0 && currentIndex >= articles.length) {
      // If current index is out of bounds after filtering, reset it
      setCurrentIndex(Math.max(0, articles.length - 1));
    }
  }, [articles, currentIndex]);
  
  // Check if we need to load more articles when we're getting close to the end
  useEffect(() => {
    if (currentIndex >= articles.length - 5 && !loadingMoreRef.current && articles.length > 0) {
      loadingMoreRef.current = true;
      console.log('Getting close to end of articles, loading more...');
      loadMoreArticlesInBackground(20);
      
      // Reset the flag after a reasonable delay
      setTimeout(() => {
        loadingMoreRef.current = false;
      }, 5000);
    }
  }, [currentIndex, articles.length, loadMoreArticlesInBackground]);
  
  // Get current article from the articles array
  const currentArticle = articles.length > 0 && currentIndex < articles.length 
    ? articles[currentIndex] 
    : null;

  // Only proceed if the current article has a title
  const hasValidTitle = currentArticle && currentArticle.title && currentArticle.title.trim() !== '';

  // Load liked articles from localStorage on mount
  useEffect(() => {
    const storedLikes = localStorage.getItem('topiq.space_liked');
    if (storedLikes) {
      try {
        setLikedArticles(JSON.parse(storedLikes));
      } catch (e) {
        console.error('Failed to parse liked articles', e);
      }
    }
    
    // Listen for unlike events from the LikesModal
    const handleUnlikeEvent = (event: CustomEvent) => {
      const { articleId } = event.detail;
      setLikedArticles(prev => {
        const newLikedArticles = { ...prev };
        delete newLikedArticles[articleId];
        return newLikedArticles;
      });
    };
    
    // Add event listener
    window.addEventListener('article:unliked', handleUnlikeEvent as EventListener);
    
    // Clean up on unmount
    return () => {
      window.removeEventListener('article:unliked', handleUnlikeEvent as EventListener);
    };
  }, []);
  
  // Completely redesigned wheel handler to prevent skipping articles
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Prevent default browser scrolling behavior and stop propagation
    e.preventDefault();
    e.stopPropagation();
    
    // Strict check: Don't process ANY wheel events during navigation or cooldown
    if (isNavigationLocked || isOnCooldown || showAboutModal || showLikesModal || showPodcastModal) {
      return;
    }
    
    // Immediately set cooldown AND navigation lock to prevent any additional events
    setIsOnCooldown(true);
    setIsNavigationLocked(true);
    
    // Determine scroll direction
    const scrollingDown = e.deltaY > 0;
    const direction = scrollingDown ? 'up' : 'down';
    lastScrollDirection.current = direction;
    
    // Set swipe direction for animations
    setSwipeDirection(scrollingDown ? 'up' : 'down');
    
    // Change the article based on scroll direction - always one article at a time
    if (scrollingDown) {
      // Only move one article at a time - go to next
      if (currentIndex < articles.length - 1) {
        setCurrentIndex(prev => prev + 1);
        
        // Load more articles when getting close to the end
        if (currentIndex >= articles.length - 5) {
          loadMoreArticlesInBackground(10);
        }
      } else {
        // If at end, release locks after delay
        setTimeout(() => {
          setIsOnCooldown(false);
          setIsNavigationLocked(false);
        }, 300);
        return;
      }
    } else {
      // Only move one article at a time - go to previous
      if (currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      } else {
        // If at beginning, release locks after delay
        setTimeout(() => {
          setIsOnCooldown(false);
          setIsNavigationLocked(false);
        }, 300);
        return;
      }
    }
    
    // Reset the cooldown and navigation lock after animation completes
    // Use a longer timeout to ensure animation is complete
    setTimeout(() => {
      setIsOnCooldown(false);
      setIsNavigationLocked(false);
    }, 1200);
  }, [currentIndex, articles, showAboutModal, showLikesModal, showPodcastModal, isNavigationLocked, isOnCooldown, loadMoreArticlesInBackground]);
  
  // Toggle like (save) for the article
  const handleLike = useCallback(() => {
    if (!currentArticle) return;
    
    // Update local state
    const newLikedArticles = { ...likedArticles };
    if (newLikedArticles[currentArticle.pageid]) {
      delete newLikedArticles[currentArticle.pageid];
    } else {
      newLikedArticles[currentArticle.pageid] = true;
      
      // Save the full article data for retrieval in the likes modal
      const savedArticles = localStorage.getItem('topiq.space_saved_articles');
      let articlesToSave: WikipediaArticle[] = [];
      
      if (savedArticles) {
        try {
          articlesToSave = JSON.parse(savedArticles);
          // Remove if already exists to avoid duplicates
          articlesToSave = articlesToSave.filter(a => a.pageid !== currentArticle.pageid);
        } catch (e) {
          console.error('Failed to parse saved articles', e);
        }
      }
      
      // Add current article and save back to storage
      articlesToSave.push(currentArticle);
      localStorage.setItem('topiq.space_saved_articles', JSON.stringify(articlesToSave));
    }
    
    // Update state and localStorage
    setLikedArticles(newLikedArticles);
    localStorage.setItem('topiq.space_liked', JSON.stringify(newLikedArticles));
    
    // Notify parent
    onSaveArticle(currentArticle);
  }, [currentArticle, likedArticles, onSaveArticle]);
  
  // Go to next article with animation - update to match wheel handler pattern
  const goToNext = useCallback(() => {
    if (isNavigationLocked || isOnCooldown || currentIndex >= articles.length - 1) {
      return;
    }
    
    setIsNavigationLocked(true);
    setIsOnCooldown(true);
    setSwipeDirection('up');
    setCurrentIndex(prev => prev + 1);
    
    // If we're near the end of our article list, load more in background
    if (currentIndex >= articles.length - 5) {
      loadMoreArticlesInBackground(10);
    }
    
    // Reset navigation lock after animation completes
    setTimeout(() => {
      setIsNavigationLocked(false);
      setIsOnCooldown(false);
    }, 1200);
  }, [currentIndex, articles.length, isNavigationLocked, isOnCooldown, loadMoreArticlesInBackground]);
  
  // Go to previous article with animation - update to match wheel handler pattern
  const goToPrevious = useCallback(() => {
    if (isNavigationLocked || isOnCooldown || currentIndex <= 0) {
      return;
    }
    
    setIsNavigationLocked(true);
    setIsOnCooldown(true);
    setSwipeDirection('down');
    setCurrentIndex(prev => prev - 1);
    
    // Reset navigation lock after animation completes
    setTimeout(() => {
      setIsNavigationLocked(false);
      setIsOnCooldown(false);
    }, 1200);
  }, [currentIndex, isNavigationLocked, isOnCooldown]);
  
  // Open the Wikipedia article
  const handleReadMore = useCallback(() => {
    if (!currentArticle) return;
    
    // Open appropriate URL based on source
    if (currentArticle.source === 'hackernews' && currentArticle.url) {
      window.open(currentArticle.url, '_blank');
    } else if (currentArticle.source === 'wikipedia' || !currentArticle.source) {
      window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(currentArticle.title)}`, '_blank');
    } else if (currentArticle.source === 'wikievents') {
      window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(currentArticle.title)}`, '_blank');
    } else if (currentArticle.source === 'onthisday') {
      // Get current date for the on this day page
      const today = new Date();
      const month = today.getMonth() + 1; // getMonth() is 0-indexed
      const day = today.getDate();
      
      // Redirect to Wikipedia's On This Day page instead of Google search
      window.open(`https://en.wikipedia.org/wiki/Wikipedia:On_this_day/${month}_${day}`, '_blank');
    } else if (currentArticle.source === 'oksurf') {
      // For OK.Surf, search the headline
      const query = encodeURIComponent(currentArticle.title);
      window.open(`https://www.google.com/search?q=${query}`, '_blank');
    } else if (currentArticle.source === 'reddit' && currentArticle.url) {
      window.open(currentArticle.url, '_blank');
    }
  }, [currentArticle]);
  
  // Get the appropriate read more button text based on article source
  const getReadMoreButtonText = useCallback((source?: ContentSource): string => {
    switch (source) {
      case 'hackernews':
        return 'Read on Hacker News';
      case 'wikipedia':
        return 'Read on Wikipedia';
      case 'wikievents':
        return 'Read on Wikipedia';
      case 'onthisday':
        return 'Read full story';
      case 'oksurf':
        return 'Check it out';
      case 'reddit':
        return 'Read on Reddit';
      default:
        return 'Read more';
    }
  }, []);
  
  // Navigate to likes page
  const handleViewLikes = () => {
    setShowLikesModal(true);
  };
  
  // Fetch related podcasts when current article changes
  useEffect(() => {
    if (!currentArticle) return;
    
    const fetchRelatedPodcasts = async () => {
      try {
        const podcasts = await searchPodcastEpisodes(currentArticle.title, 5);
        setRelatedPodcasts(podcasts);
      } catch (error) {
        console.error('Error fetching related podcasts:', error);
        setRelatedPodcasts([]);
      }
    };
    
    fetchRelatedPodcasts();
  }, [currentArticle]);
  
  // Handle opening the podcast modal
  const handleViewPodcasts = () => {
    if (relatedPodcasts.length > 0) {
      setShowPodcastModal(true);
    }
  };
  
  // Update the animation variants for the article transitions
  const articleVariants = {
    initial: (direction: SwipeDirection) => ({
      y: direction === 'up' ? 50 : -50,
      opacity: 0,
    }),
    animate: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.3, ease: "easeOut" }
    },
    exit: (direction: SwipeDirection) => ({
      y: direction === 'up' ? -50 : 50,
      opacity: 0,
      transition: { duration: 0.2, ease: "easeIn" }
    })
  };
  
  // Filter out articles without thumbnails - skip articles with no images
  useEffect(() => {
    if (articles.length > 0 && currentArticle && !currentArticle.thumbnail?.source) {
      // If current article has no image, find the next one with an image
      const nextArticleWithImage = articles.findIndex((article, index) => 
        index > currentIndex && article.thumbnail?.source
      );
      
      if (nextArticleWithImage !== -1) {
        setCurrentIndex(nextArticleWithImage);
      } else {
        // If no articles with images ahead, look behind
        const prevArticleWithImage = [...articles].reverse().findIndex((article, idx) => 
          (articles.length - 1 - idx) < currentIndex && article.thumbnail?.source
        );
        
        if (prevArticleWithImage !== -1) {
          setCurrentIndex(articles.length - 1 - prevArticleWithImage);
        }
      }
    }
  }, [currentIndex, articles, currentArticle]);
  
  // Handle tap/click on article
  const handleTap = () => {
    const now = Date.now();
    const timeDiff = now - lastTapTime;
    
    // Check if this is a double tap (timeframe between 100-500ms)
    if (timeDiff < 500 && timeDiff > 100) {
      // This is a double tap - toggle like status
      handleLike();
      
      // Show like animation
      setShowLikeAnimation(true);
      setTimeout(() => setShowLikeAnimation(false), 1000);
    }
    
    // Update last tap time for next comparison
    setLastTapTime(now);
  };
  
  // Enhanced infinite scroll with batch loading and preloading
  useEffect(() => {
    // Reference to track if we're already loading in the background
    const isLoadingBackgroundRef = { current: false };
    
    // Check if we should load more articles
    const checkForInfiniteScroll = () => {
      // If we're within 5 articles of the end, load more in the background
      if (articles.length - currentIndex <= 5 && !isLoadingBackgroundRef.current) {
        console.log('Near the end of articles, loading more in background...');
        isLoadingBackgroundRef.current = true;
        
        // Load 10 articles at a time for better performance
        loadMoreArticlesInBackground(10);
        
        // Reset the loading flag after a delay
        setTimeout(() => {
          isLoadingBackgroundRef.current = false;
        }, 5000);
      }
    };
    
    // Check when current index changes
    checkForInfiniteScroll();
    
    // Also set up a poll to periodically check and load more articles in the background
    // This ensures we always have articles ready, even if the user hasn't scrolled
    const backgroundLoadInterval = setInterval(() => {
      if (articles.length - currentIndex <= 20 && !isLoadingBackgroundRef.current) {
        isLoadingBackgroundRef.current = true;
        loadMoreArticlesInBackground(20);
        setTimeout(() => {
          isLoadingBackgroundRef.current = false;
        }, 5000);
      }
    }, 15000); // Check more frequently (decreased from 30000)
    
    return () => {
      clearInterval(backgroundLoadInterval);
    };
  }, [currentIndex, articles.length, loadMoreArticlesInBackground]);
  
  // Enhanced image preloading with more sophisticated handling
  useEffect(() => {
    if (!articles.length) return;
    
    // Create an array of articles to preload
    const preloadArticleIndices = [];
    
    // Next 15 articles (increased from 5 for better preloading)
    for (let i = 1; i <= 15; i++) {
      const index = currentIndex + i;
      if (index < articles.length) {
        preloadArticleIndices.push({index, priority: i <= 5 ? 'high' : 'medium'});
      }
    }
    
    // Previous 5 articles (less important)
    for (let i = 1; i <= 5; i++) {
      const index = currentIndex - i;
      if (index >= 0) {
        preloadArticleIndices.push({index, priority: 'low'});
      }
    }
    
    // Create a map to track images already loaded to avoid duplicates
    const preloadedImages = new Map();
    
    // Perform the preloading with priority levels and prevent redundant loads
    preloadArticleIndices.forEach(({index, priority}, i) => {
      const article = articles[index];
      if (article?.thumbnail?.source) {
        const imgUrl = article.thumbnail.source;
        
        // Skip if already preloaded
        if (preloadedImages.has(imgUrl)) return;
        preloadedImages.set(imgUrl, true);
        
        // Only preload if not already in browser cache
        // Reduce delay for higher priority images
        const delay = priority === 'high' ? i * 20 : i * 40; 
        setTimeout(() => {
          const img = new Image();
          
          // Add loading attributes based on priority
          if (priority === 'high') {
            // Images closer to current get higher priority
            img.setAttribute('importance', 'high');
            img.loading = 'eager';
            img.fetchPriority = 'high';
          } else if (priority === 'medium') {
            img.setAttribute('importance', 'auto');
            img.loading = 'eager';
            img.fetchPriority = 'auto';
          } else {
            img.setAttribute('importance', 'low');
            img.loading = 'lazy';
            img.fetchPriority = 'low';
          }
          
          // Add event handlers before setting src to catch all events
          img.onload = () => {
            console.log(`Preloaded image ${imgUrl.substring(0, 30)}... (index: ${index})`);
          };
          
          img.onerror = () => {
            console.error(`Failed to preload image ${imgUrl.substring(0, 30)}... (index: ${index})`);
          };
          
          // Set source last to start loading
          img.src = imgUrl;
        }, delay); // Reduced delay for better performance
      }
    });
  }, [currentIndex, articles]);
  
  // Safe truncation function for both client and server environments
  const truncateToWords = (text: string, maxWords: number): string => {
    if (!text) return '';
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(' ') + '...';
  };

  // Truncate HTML content to exactly 3 lines for all descriptions
  const truncateHtmlSafely = (html: string, maxWords: number): string => {
    if (!html) return '';
    
    // Remove any existing HTML tags to get plain text
    const plainText = html.replace(/<[^>]*>/g, '');
    
    // No need to truncate if it's already short
    if (plainText.split(/\s+/).length <= maxWords) {
      return html;
    }
    
    // Truncate to specified number of words and add ellipsis
    const words = plainText.split(/\s+/).slice(0, maxWords);
    return `${words.join(' ')}...`;
  };
  
  // Apply smooth scrolling globally
  useEffect(() => {
    // Add smooth scrolling to html element
    document.documentElement.style.scrollBehavior = 'smooth';
    
    // Clean up when component unmounts
    return () => {
      document.documentElement.style.scrollBehavior = '';
    };
  }, []);
  
  // Handle keyboard navigation (arrow keys) for desktop
  useEffect(() => {
    // Only add keyboard navigation for desktop devices
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    
    if (!isDesktop) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only process if not in modal and not navigating
      if (showAboutModal || showLikesModal || showPodcastModal || isNavigationLocked || isOnCooldown) {
        return;
      }
      
      // Check if an input element is focused
      const activeElement = document.activeElement;
      if (activeElement && 
          (activeElement.tagName === 'INPUT' || 
           activeElement.tagName === 'TEXTAREA' || 
           activeElement.tagName === 'SELECT' || 
           activeElement.getAttribute('contenteditable') === 'true')) {
        return; // Don't handle keyboard navigation when a form element is focused
      }
      
      if (event.key === 'ArrowUp') {
        // Navigate to previous article (like scrolling up)
        event.preventDefault();
        if (currentIndex > 0) {
          setIsNavigationLocked(true);
          setIsOnCooldown(true);
          setSwipeDirection('down');
          setCurrentIndex(prev => prev - 1);
          
          // Reset navigation lock after animation completes
          setTimeout(() => {
            setIsNavigationLocked(false);
            setIsOnCooldown(false);
          }, 1200);
        }
      } else if (event.key === 'ArrowDown') {
        // Navigate to next article (like scrolling down)
        event.preventDefault();
        if (currentIndex < articles.length - 1) {
          setIsNavigationLocked(true);
          setIsOnCooldown(true);
          setSwipeDirection('up');
          setCurrentIndex(prev => prev + 1);
          
          // Load more articles when getting close to the end
          if (currentIndex >= articles.length - 5) {
            loadMoreArticlesInBackground(10);
          }
          
          // Reset navigation lock after animation completes
          setTimeout(() => {
            setIsNavigationLocked(false);
            setIsOnCooldown(false);
          }, 1200);
        }
      }
    };
    
    // Add keyboard event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Clean up event listener
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    currentIndex, 
    articles.length, 
    isNavigationLocked, 
    isOnCooldown, 
    showAboutModal, 
    showLikesModal, 
    showPodcastModal,
    loadMoreArticlesInBackground
  ]);
  
  // Update the loading state to match the podcast loading style
  if (isLoading && articles.length === 0) {
    return (
      <div className="h-full w-full overflow-hidden bg-black text-white">
        {/* Keep header visible during loading */}
        <div className="fixed top-0 left-0 right-0 p-4 flex justify-between items-center z-50 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm">
          {/* Left: Logo */}
          <h1 className="text-xl font-bold font-garamond text-white drop-shadow-md">topiq.space</h1>
          
          {/* Center: Tab Navigator (if provided) */}
          <div className="mx-auto">
            {tabNavigator}
          </div>
          
          {/* Right: About and Likes links */}
          <div className="flex items-center space-x-3">
            <button 
              className="text-white/80 hover:text-white text-sm transition-colors"
              onClick={() => setShowAboutModal(true)}
            >
              About
            </button>
            <button 
              className="text-white/80 hover:text-white text-sm transition-colors"
              onClick={() => setShowLikesModal(true)}
            >
              Likes
            </button>
          </div>
        </div>
        
        {/* Loading spinner - updated to match podcast view */}
        <div className="h-full flex flex-col items-center justify-center bg-black">
          <div className="flex items-center justify-center space-x-3 px-6">
            <div 
              className="w-6 h-6 border-2 border-t-transparent border-white rounded-full animate-spin"
            />
            <p 
              className="text-lg text-white font-space"
            >
              Loading articles...
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  // Empty state - this should rarely show now with the improved loading
  if (articles.length === 0) {
    return (
      <div className="h-full w-full overflow-hidden bg-black">
        {/* Keep header visible */}
        <div className="fixed top-0 left-0 right-0 p-4 flex justify-between items-center z-50 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm">
          {/* Left: Logo */}
          <h1 className="text-xl font-bold font-garamond text-white drop-shadow-md">topiq.space</h1>
          
          {/* Center: Tab Navigator (if provided) */}
          <div className="mx-auto">
            {tabNavigator}
          </div>
          
          {/* Right: About and Likes links */}
          <div className="flex items-center space-x-3">
            <button 
              className="text-white/80 hover:text-white text-sm transition-colors"
              onClick={() => setShowAboutModal(true)}
            >
              About
            </button>
            <button 
              className="text-white/80 hover:text-white text-sm transition-colors"
              onClick={() => setShowLikesModal(true)}
            >
              Likes
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-center h-full mt-16">
          <div className="text-center px-6">
            <div className="text-6xl mb-6">🔍</div>
            <h3 className="text-2xl font-bold mb-3 text-white">No articles found</h3>
            <p className="text-white/70 mb-6">We couldn't find any content to display</p>
            <button 
              onClick={onRefresh}
              className="px-8 py-3 bg-white/20 hover:bg-white/30 text-white font-medium rounded-full transition backdrop-blur-sm"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className={`relative h-full w-full overflow-hidden bg-black ${hasAudioPlayer ? 'pb-20' : ''}`} 
      ref={containerRef}
      onWheel={handleWheel}
      style={{ 
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
        scrollSnapType: 'y mandatory',
        scrollBehavior: 'smooth'
      }}
      onTouchStart={(e) => {
        // Record starting touch position for swipe detection
        if (e.touches && e.touches.length === 1) {
          const touch = e.touches[0];
          touchStartY.current = touch.clientY;
        }
      }}
      onTouchEnd={(e) => {
        // If we have valid touch start and end positions, determine if it was a swipe
        if (touchStartY.current !== null && touchEndY.current !== null) {
          const deltaY = touchEndY.current - touchStartY.current;
          
          // Threshold for considering it a swipe (adjust as needed)
          if (Math.abs(deltaY) > 50) {
            if (deltaY > 0) {
              // Swipe down - go to previous
              goToPrevious();
            } else {
              // Swipe up - go to next
              goToNext();
            }
          }
          
          // Reset values
          touchStartY.current = null;
          touchEndY.current = null;
        }
      }}
      onTouchMove={(e) => {
        // Update current touch position
        if (e.touches && e.touches.length === 1) {
          const touch = e.touches[0];
          touchEndY.current = touch.clientY;
        }
      }}
    >
      {/* Fixed header at the top */}
      <div className="fixed top-0 left-0 right-0 p-4 flex justify-between items-center z-50 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm">
        {/* Left: Logo */}
        <h1 className="text-xl font-bold font-garamond text-white drop-shadow-md">topiq.space</h1>
        
        {/* Center: Tab Navigator (if provided) */}
        <div className="mx-auto">
          {tabNavigator}
        </div>
        
        {/* Right: About and Likes links */}
        <div className="flex items-center space-x-3">
          <button 
            className="text-white/80 hover:text-white text-sm transition-colors"
            onClick={() => setShowAboutModal(true)}
          >
            About
          </button>
          <button 
            className="text-white/80 hover:text-white text-sm transition-colors"
            onClick={() => setShowLikesModal(true)}
          >
            Likes
          </button>
        </div>
      </div>
      
      <AnimatePresence initial={false} custom={swipeDirection}>
        {currentArticle && hasValidTitle && (
          <motion.div
            key={currentArticle.pageid}
            className={`absolute inset-0 flex flex-col h-full overflow-hidden scroll-snap-align-start ${
              hasAudioPlayer ? 'pb-20' : ''
            }`}
            style={{
              scrollSnapAlign: 'start'
            }}
            variants={articleVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            custom={swipeDirection}
            onClick={handleTap}
          >
            {/* Background image - simplified to show just one image */}
            <motion.div 
              className="absolute inset-0 w-full h-full bg-cover bg-center"
              initial={{ scale: 1.1, opacity: 0.5 }}
              animate={{ 
                scale: 1,
                opacity: 1,
                transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
              }}
            >
              {/* Single image or gradient background */}
              {currentArticle.thumbnail ? (
                <OptimizedImage
                  src={currentArticle.thumbnail.source}
                  alt={currentArticle.title}
                  className="absolute inset-0 w-full h-full object-cover rounded-t-2xl"
                  priority={true}
                />
              ) : (
                <div 
                  className="absolute inset-0 w-full h-full rounded-t-2xl" 
                  style={{ background: getArticleBackground(currentArticle) }}
                />
              )}
              
              {/* Overlay gradient for better text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30 opacity-70"></div>
            </motion.div>

            {/* Content container */}
            <motion.div 
              className="absolute bottom-0 left-0 right-0 px-6 py-7 z-20 bg-black/30 backdrop-blur-md"
              style={{ paddingBottom }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                transition: { 
                  delay: 0.2, 
                  duration: 0.6,
                  ease: [0.16, 1, 0.3, 1]
                }
              }}
            >
              {/* Source badge */}
              {currentArticle.source && (
                <motion.div
                  className={`absolute top-0 left-6 transform -translate-y-full mt-[-12px] px-3 py-1 rounded-full bg-gradient-to-r ${getSourceBadge(currentArticle).color} text-white text-xs font-medium shadow-lg`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    transition: { delay: 0.3, duration: 0.5 }
                  }}
                  key={`badge-${currentArticle.pageid}`}
                >
                  {getSourceBadge(currentArticle).label}
                </motion.div>
              )}
              
              {/* Article content */}
              <div className="flex flex-col relative">
                {/* Like button - Moved to top right */}
                <div 
                  className="absolute top-0 right-0 z-30"
                  key={`like-container-${currentArticle.pageid}`}
                >
                  <motion.button 
                    onClick={handleLike}
                    className={`w-12 h-12 rounded-full backdrop-blur-lg flex items-center justify-center transition-all shadow-lg border border-white/10
                      ${likedArticles[currentArticle.pageid] ? 'bg-red-500/20' : 'bg-white/20 hover:bg-white/30'}`}
                    aria-label={likedArticles[currentArticle.pageid] ? "Unlike article" : "Like article"}
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ scale: 1.05 }}
                  >
                    {likedArticles[currentArticle.pageid] ? (
                      <motion.svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-6 w-6 text-red-500" 
                        viewBox="0 0 20 20" 
                        fill="currentColor"
                        initial={{ scale: 0.8 }}
                        animate={{ 
                          scale: [1, 1.2, 1],
                          rotate: [0, -5, 5, -5, 0]
                        }}
                        transition={{ 
                          duration: 0.6, 
                          ease: "easeInOut",
                          times: [0, 0.2, 0.4, 0.6, 1]
                        }}
                        key={`heart-filled-${currentArticle.pageid}`}
                      >
                        <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                      </motion.svg>
                    ) : (
                      <motion.svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-6 w-6 text-white" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                        key={`heart-outline-${currentArticle.pageid}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </motion.svg>
                    )}
                  </motion.button>
                </div>

                {/* Article title - Added padding right to avoid overlap */}
                <h2 className="text-4xl font-bold font-garamond mb-3 pr-16 text-white" style={{ fontSize: '24px', lineHeight: '1.2' }}>
                  {currentArticle.title}
                </h2>
                
                {/* Extract */}
                {currentArticle.extract && (
                  <div 
                    className="article-extract mt-3 line-clamp-4 overflow-hidden"
                    dangerouslySetInnerHTML={{ 
                      __html: currentArticle.extract_html 
                        ? truncateHtmlSafely(currentArticle.extract_html, 150) 
                        : truncateToWords(currentArticle.extract, 150) 
                    }}
                  />
                )}
                
                {/* Read more button */}
                <button 
                  onClick={handleReadMore}
                  className="inline-flex items-center text-white font-space hover:text-gray-300 transition mt-4"
                >
                  <span className="mr-2">
                    {getReadMoreButtonText(currentArticle.source)}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* About modal with improved structure */}
      <AnimatePresence initial={false}>
        {showAboutModal && (
          <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} />
        )}
      </AnimatePresence>

      {/* Likes modal with scroll lock */}
      <AnimatePresence initial={false}>
        {showLikesModal && (
          <LikesModal 
            isOpen={showLikesModal} 
            onClose={() => setShowLikesModal(false)} 
            likedArticles={likedArticles} 
          />
        )}
      </AnimatePresence>
      
      {/* Podcast Modal */}
      <AnimatePresence initial={false}>
      {showPodcastModal && (
        <PodcastModal
          episodes={relatedPodcasts}
          isOpen={showPodcastModal}
          onClose={() => setShowPodcastModal(false)}
          lockScroll={handleLockScroll}
          unlockScroll={handleUnlockScroll}
        />
      )}
      </AnimatePresence>
    </div>
  );
};

export default FullScreenView; 