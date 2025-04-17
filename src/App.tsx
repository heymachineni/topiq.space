import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WikipediaArticle, ViewMode, PodcastEpisode } from './types';
import { useWikipediaArticles } from './hooks/useWikipediaArticles';
import FullScreenView from './components/FullScreenView';
import PodcastView from './components/PodcastView';
import TabNavigator, { TabType } from './components/TabNavigator';
import { clearArticleCaches, fetchTrendingPodcasts } from './utils/api';
import { XMarkIcon } from '@heroicons/react/24/outline';

const App: React.FC = () => {
  // App state
  const [activeTab, setActiveTab] = useState<TabType>('articles');
  const [viewMode, setViewMode] = useState<ViewMode>('fullscreen');
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastVisible = useRef<number>(Date.now());
  
  // Article position tracking state - preserve position between tab switches
  const [currentArticleIndex, setCurrentArticleIndex] = useState<number>(0);
  const [newArticlesCount, setNewArticlesCount] = useState<number>(0);
  const prevArticlesLength = useRef<number>(0);
  
  // Audio player state
  const [currentlyPlaying, setCurrentlyPlaying] = useState<PodcastEpisode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const {
    articles,
    loading,
    error,
    refreshArticles,
    loadMoreArticlesInBackground
  } = useWikipediaArticles(50);
  
  // Update new articles count when articles length changes
  useEffect(() => {
    if (prevArticlesLength.current && articles.length > prevArticlesLength.current) {
      // Only update count if we're on the podcast tab or not at the top of the article list
      if (activeTab === 'podcasts' || currentArticleIndex > 0) {
        setNewArticlesCount(articles.length - prevArticlesLength.current);
      }
    }
    prevArticlesLength.current = articles.length;
  }, [articles.length, activeTab, currentArticleIndex]);
  
  // Handle article index change
  const handleArticleIndexChange = useCallback((index: number) => {
    setCurrentArticleIndex(index);
    
    // If user scrolls to the top, clear new articles notification
    if (index === 0) {
      setNewArticlesCount(0);
    }
  }, []);
  
  // Handle scroll to top action
  const handleScrollToTop = useCallback(() => {
    setCurrentArticleIndex(0);
    setNewArticlesCount(0);
  }, []);
  
  // Handle article actions
  const handleSaveArticle = (article: WikipediaArticle) => {
    console.log('Liked article:', article.title);
    
    // Store is already handled in FullScreenView component
  };
  
  const handleShareArticle = (article: WikipediaArticle) => {
    // Open the article URL in a new tab
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title)}`;
    window.open(url, '_blank');
  };

  // When user returns to tab, load more content in background
  useEffect(() => {
    const handleVisibilityChange = () => {
      const now = Date.now();
      const fourHoursInMs = 4 * 60 * 60 * 1000; // 4 hours instead of 1 hour
      
      if (document.visibilityState === 'visible') {
        // Only refresh everything after a very long time (4+ hours)
        if (now - lastVisible.current > fourHoursInMs) {
          console.log('Returning after 4+ hours, refreshing all content');
          clearArticleCaches();
          refreshArticles();
        } else if (now - lastVisible.current > 60000) { 
          // Only load more content if page was hidden for more than a minute
          // This prevents reload when quickly switching between tabs
          console.log('Returning after a short break, loading more content');
          loadMoreArticlesInBackground(20);
        }
        
        lastVisible.current = now;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadMoreArticlesInBackground, refreshArticles]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // When user scrolls to 80% of the way down, load more content
      if (scrollTop + clientHeight >= scrollHeight * 0.8) {
        loadMoreArticlesInBackground(10);
      }
    }
  }, [loadMoreArticlesInBackground]);

  // Audio player functions
  const playPodcast = (podcast: PodcastEpisode) => {
    // Stop current podcast if one is playing
    if (audioRef.current) {
      audioRef.current.pause();
    }
    
    setCurrentlyPlaying(podcast);
    setIsPlaying(true);
    
    // Use setTimeout to ensure the audio element has updated with the new src
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
          setIsPlaying(false);
        });
      }
    }, 100);
  };
  
  // Toggle play/pause
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
        });
      }
      setIsPlaying(!isPlaying);
    }
  };
  
  // Handle time update
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };
  
  // Handle loaded metadata
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };
  
  // Handle seeking
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };
  
  // Format time (seconds) to HH:MM:SS or MM:SS
  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  };

  // Load new podcast episodes
  const loadNewEpisodes = async () => {
    console.log('Loading new podcast episodes');
    try {
      const trendingPodcasts = await fetchTrendingPodcasts(5000);
      return trendingPodcasts;
    } catch (error) {
      console.error('Error loading new podcast episodes:', error);
      return [];
    }
  };

  // Prevent scrolling on body
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = '';
    };
  }, []);
  
  // Handle tab change
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };
  
  // Create the TabNavigator component to pass to children
  const tabNavigator = (
    <TabNavigator activeTab={activeTab} onTabChange={handleTabChange} />
  );
  
  return (
    <div className="h-screen w-screen bg-black text-white overflow-hidden relative">
      {/* Main content - conditionally render based on active tab */}
      <div className={`h-full w-full ${currentlyPlaying ? 'pb-20' : ''}`}>
        {activeTab === "articles" && (
          <FullScreenView 
            articles={articles}
            onRefresh={refreshArticles}
            onSaveArticle={handleSaveArticle}
            onShareArticle={handleShareArticle}
            isLoading={loading}
            loadMoreArticlesInBackground={loadMoreArticlesInBackground}
            tabNavigator={tabNavigator}
            hasAudioPlayer={!!currentlyPlaying}
            initialIndex={currentArticleIndex}
            onIndexChange={handleArticleIndexChange}
            newArticlesCount={newArticlesCount}
            onScrollToTop={handleScrollToTop}
          />
        )}
        
        {activeTab === "podcasts" && (
          <PodcastView 
            onRefresh={loadNewEpisodes}
            tabNavigator={tabNavigator}
            onPlayPodcast={playPodcast}
            isPodcastPlaying={!!currentlyPlaying}
          />
        )}
      </div>

      {/* Shared Audio player */}
      <AnimatePresence>
        {currentlyPlaying && (
          <motion.div 
            className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black to-black/90 backdrop-blur-lg border-t border-white/5 px-4 py-3 z-20"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
          >
            {/* Progress bar at top */}
            <div className="w-full h-1 bg-white/10 rounded-full mb-3 relative">
              <div 
                className="absolute top-0 left-0 h-full bg-purple-600 rounded-full"
                style={{width: `${(currentTime / (duration || 1)) * 100}%`}}
              ></div>
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
            
            <div className="flex items-center">
              {/* Podcast image */}
              <div className="w-10 h-10 mr-3 rounded overflow-hidden flex-shrink-0">
                {currentlyPlaying.image ? (
                  <img 
                    src={currentlyPlaying.image} 
                    alt={currentlyPlaying.feedTitle} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-purple-900">
                    <span className="text-lg">🎙️</span>
                  </div>
                )}
              </div>
              
              {/* Podcast info */}
              <div className="flex-grow mr-4 flex items-center">
                <div className="flex-grow">
                  <p className="font-bold text-sm line-clamp-1">{currentlyPlaying.title}</p>
                  <p className="text-white/70 text-xs line-clamp-1">{currentlyPlaying.feedTitle}</p>
                </div>
                <div className="flex-shrink-0 text-xs text-white/70 mx-2">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>
              
              {/* Controls */}
              <div className="flex items-center space-x-2">
                <button 
                  className={`w-9 h-9 rounded-full ${isPlaying ? 'bg-purple-600' : 'bg-white/10'} flex items-center justify-center transition-colors`}
                  onClick={togglePlayPause}
                >
                  {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
                
                <button 
                  className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
                  onClick={() => setCurrentlyPlaying(null)}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {/* Audio element */}
            <audio
              ref={audioRef}
              src={currentlyPlaying.audio || currentlyPlaying.url}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
              onError={(e) => {
                console.error('Audio error:', e);
                setIsPlaying(false);
              }}
              className="hidden"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App; 