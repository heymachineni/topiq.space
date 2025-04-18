import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PodcastEpisode } from '../types';
import { XMarkIcon, MagnifyingGlassIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { AboutModal, LikesModal } from './Modals';
import axios from 'axios';

interface PodcastViewProps {
  onRefresh: () => Promise<PodcastEpisode[]>;
  tabNavigator?: React.ReactNode;
  onPlayPodcast: (podcast: PodcastEpisode) => void;
  isPodcastPlaying?: boolean;
}

// Interface for podcast categories
interface PodcastCategory {
  id: string;
  title: string;
  podcasts: PodcastEpisode[];
  loading: boolean;
}

const PodcastView: React.FC<PodcastViewProps> = ({ onRefresh, tabNavigator, onPlayPodcast, isPodcastPlaying = false }) => {
  // Main state
  const [allPodcasts, setAllPodcasts] = useState<PodcastEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showLikesModal, setShowLikesModal] = useState(false);
  const [likedArticles, setLikedArticles] = useState<Record<number, boolean>>({});
  const [allLoaded, setAllLoaded] = useState(false);
  
  // Categories state - each category will have its own podcasts and loading state
  const [categories, setCategories] = useState<PodcastCategory[]>([
    { id: 'newNoteworthy', title: 'New & Noteworthy', podcasts: [], loading: true },
    { id: 'topEpisodes', title: 'Top Episodes', podcasts: [], loading: true },
    { id: 'everyoneTalking', title: 'Everyone\'s Talking About', podcasts: [], loading: true },
    { id: 'musicallyInclined', title: 'Musically Inclined', podcasts: [], loading: true }
  ]);
  
  // Famous podcasters state
  const [famousPodcasters, setFamousPodcasters] = useState<PodcastCategory[]>([
    { id: 'lexFridman', title: 'Lex Fridman Podcast', podcasts: [], loading: true },
    { id: 'joeRogan', title: 'The Joe Rogan Experience', podcasts: [], loading: true },
    { id: 'hubermanLab', title: 'Huberman Lab', podcasts: [], loading: true },
    { id: 'samHarris', title: 'Making Sense with Sam Harris', podcasts: [], loading: true },
    { id: 'steveBartlett', title: 'The Diary of a CEO', podcasts: [], loading: true },
    { id: 'timFerriss', title: 'The Tim Ferriss Show', podcasts: [], loading: true },
    { id: 'jordanPeterson', title: 'The Jordan B. Peterson Podcast', podcasts: [], loading: true },
    { id: 'richRoll', title: 'Rich Roll Podcast', podcasts: [], loading: true }
  ]);
  
  // Ref for bottom observer
  const bottomObserverRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // Search state
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PodcastEpisode[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Track when podcastPlaying changes
  useEffect(() => {
    console.log('isPodcastPlaying changed:', isPodcastPlaying);
  }, [isPodcastPlaying]);

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
  }, []);

  // Load all podcast categories on mount
  useEffect(() => {
    loadAllPodcastCategories();
  }, []);
  
  // Load all podcast categories
  const loadAllPodcastCategories = async () => {
    setLoading(true);
    console.log('⏳ Starting to load all podcast categories');
    
    // First load original trending podcasts
    try {
      const trendingPodcasts = await onRefresh();
      console.log(`📱 Loaded ${trendingPodcasts.length} trending podcasts`);
      setAllPodcasts(trendingPodcasts);
      
      // Trending podcasts will only show in Mixed section now
    } catch (error) {
      console.error('Error loading trending podcasts:', error);
      setError(error instanceof Error ? error : new Error('Failed to load podcasts'));
    } finally {
      setLoading(false);
    }
    
    // Load famous podcasters 
    console.log('🎙️ Loading famous podcasters...');
    loadFamousPodcaster('lexFridman', 'lex fridman');
    loadFamousPodcaster('joeRogan', 'joe rogan');
    loadFamousPodcaster('hubermanLab', 'huberman lab');
    loadFamousPodcaster('samHarris', 'sam harris podcast');
    loadFamousPodcaster('steveBartlett', 'diary of a ceo');
    loadFamousPodcaster('timFerriss', 'tim ferriss');
    loadFamousPodcaster('jordanPeterson', 'jordan peterson');
    loadFamousPodcaster('richRoll', 'rich roll');
    
    // Load other categories
    console.log('📚 Loading podcast categories...');
    loadCategoryPodcasts('newNoteworthy', 'new');
    loadCategoryPodcasts('topEpisodes', 'episodes');
    loadCategoryPodcasts('everyoneTalking', 'popular');
    loadCategoryPodcasts('musicallyInclined', 'music');
  };
  
  // Update a specific category with podcasts
  const updateCategoryPodcasts = (categoryId: string, podcasts: PodcastEpisode[]) => {
    setCategories(prev => 
      prev.map(cat => 
        cat.id === categoryId 
          ? { ...cat, podcasts, loading: false }
          : cat
      )
    );
  };
  
  // Update a specific famous podcaster with podcasts
  const updateFamousPodcasterPodcasts = (podcasterId: string, podcasts: PodcastEpisode[]) => {
    setFamousPodcasters(prev => 
      prev.map(podcaster => 
        podcaster.id === podcasterId 
          ? { ...podcaster, podcasts, loading: false }
          : podcaster
      )
    );
  };
  
  // Load famous podcaster episodes
  const loadFamousPodcaster = async (podcasterId: string, searchTerm: string) => {
    console.log(`🔍 Loading ${podcasterId} with search term: "${searchTerm}"`);
    
    // Define fallback search terms for common podcasters
    const fallbackSearchTerms: Record<string, string[]> = {
      'lexFridman': ['lex fridman podcast', 'lex friedman', 'fridman podcast'],
      'joeRogan': ['joe rogan experience', 'jre podcast', 'rogan podcast'],
      'hubermanLab': ['andrew huberman', 'huberman podcast', 'huberman lab podcast'],
      'samHarris': ['making sense sam harris', 'waking up sam harris', 'sam harris podcast'],
      'steveBartlett': ['diary of a ceo', 'steven bartlett', 'diary ceo'],
      'timFerriss': ['tim ferriss show', 'timothy ferriss', 'ferriss podcast'],
      'jordanPeterson': ['jordan b peterson', 'peterson podcast', 'dr peterson podcast'],
      'richRoll': ['rich roll podcast', 'richroll', 'roll podcast']
    };
    
    // Try primary search term first
    const result = await tryFetchPodcaster(searchTerm);
    if (result) {
      updateFamousPodcasterPodcasts(podcasterId, result);
      return;
    }
    
    // If primary search failed, try fallbacks
    const fallbacks = fallbackSearchTerms[podcasterId] || [];
    for (const fallbackTerm of fallbacks) {
      if (fallbackTerm === searchTerm) continue; // Skip if same as primary
      
      console.log(`🔄 Trying fallback search for ${podcasterId}: "${fallbackTerm}"`);
      const fallbackResult = await tryFetchPodcaster(fallbackTerm);
      if (fallbackResult) {
        updateFamousPodcasterPodcasts(podcasterId, fallbackResult);
        return;
      }
    }
    
    // If all searches failed
    console.warn(`⚠️ All searches failed for ${podcasterId}`);
    updateFamousPodcasterPodcasts(podcasterId, []);
    
    // Helper function to try fetching a podcaster
    async function tryFetchPodcaster(term: string): Promise<PodcastEpisode[] | null> {
      try {
        const response = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=podcast&limit=1`
        );
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          console.log(`✅ Found podcast for term "${term}": ${data.results[0].collectionName}`);
          const podcastId = data.results[0].collectionId;
          
          // Get episodes from the podcast
          console.log(`⏳ Fetching episodes for ID: ${podcastId}`);
          const episodesResponse = await fetch(
            `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcastEpisode&limit=20`
          );
          const episodesData = await episodesResponse.json();
          
          if (episodesData.results && episodesData.results.length > 1) {
            console.log(`✅ Found ${episodesData.results.length - 1} episodes`);
            
            // Transform to our format - skip the first result as it's the podcast itself
            const episodes: PodcastEpisode[] = episodesData.results
              .slice(1) // Skip the podcast entry, get only episodes
              .map((item: any) => ({
                id: item.trackId,
                title: item.trackName,
                description: item.description || '',
                url: item.trackViewUrl,
                datePublished: new Date(item.releaseDate).toLocaleDateString(),
                duration: item.trackTimeMillis ? Math.floor(item.trackTimeMillis / 1000) : '',
                image: item.artworkUrl600 || item.artworkUrl100,
                feedTitle: data.results[0].collectionName,
                feedUrl: item.feedUrl || '',
                audio: item.previewUrl || ''
              }));
            
            return episodes;
          } else {
            console.warn(`⚠️ No episodes found for term "${term}"`);
            return null;
          }
        } else {
          console.warn(`⚠️ No podcast found for search term "${term}"`);
          return null;
        }
      } catch (error) {
        console.error(`❌ Error loading podcasts for term "${term}":`, error);
        return null;
      }
    }
  };
  
  // Load category podcasts
  const loadCategoryPodcasts = async (categoryId: string, searchTerm: string) => {
    console.log(`🔍 Loading category ${categoryId} with search term: "${searchTerm}"`);
    try {
      const genreParam = 
        categoryId === 'musicallyInclined' ? '&genreId=1310' : 
        categoryId === 'topCharts' ? '&genreId=26' : '';
      
      const response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=podcast&entity=podcast${genreParam}&limit=20`
      );
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        console.log(`✅ Found ${data.results.length} podcasts for category ${categoryId}`);
        
        // For podcast shows, we'll just get the shows and populate with placeholder episodes
        const podcasts: PodcastEpisode[] = await Promise.all(
          data.results.slice(0, 10).map(async (podcast: any) => {
            // Try to get at least one episode for each show
            try {
              const episodesResponse = await fetch(
                `https://itunes.apple.com/lookup?id=${podcast.collectionId}&entity=podcastEpisode&limit=1`
              );
              const episodesData = await episodesResponse.json();
              
              if (episodesData.results && episodesData.results.length > 1) {
                const episode = episodesData.results[1]; // Index 1 is the first episode
                return {
                  id: episode.trackId,
                  title: episode.trackName,
                  description: episode.description || '',
                  url: episode.trackViewUrl,
                  datePublished: new Date(episode.releaseDate).toLocaleDateString(),
                  duration: episode.trackTimeMillis ? Math.floor(episode.trackTimeMillis / 1000) : '',
                  image: podcast.artworkUrl600 || podcast.artworkUrl100,
                  feedTitle: podcast.collectionName,
                  feedUrl: podcast.feedUrl || '',
                  audio: episode.previewUrl || ''
                };
              }
            } catch (e) {
              console.error(`❌ Error fetching episode for podcast in category ${categoryId}:`, e);
            }
            
            // Fallback if we can't get an episode
            return {
              id: podcast.collectionId,
              title: podcast.collectionName,
              description: podcast.collectionName,
              url: podcast.collectionViewUrl,
              datePublished: new Date(podcast.releaseDate).toLocaleDateString(),
              duration: '',
              image: podcast.artworkUrl600 || podcast.artworkUrl100,
              feedTitle: podcast.collectionName,
              feedUrl: podcast.feedUrl || '',
              audio: ''
            };
          })
        );
        
        console.log(`✅ Processed ${podcasts.length} podcasts for category ${categoryId}`);
        updateCategoryPodcasts(categoryId, podcasts.filter(Boolean));
      } else {
        console.warn(`⚠️ No podcasts found for category ${categoryId} with search term "${searchTerm}"`);
        updateCategoryPodcasts(categoryId, []);
      }
    } catch (error) {
      console.error(`❌ Error loading category ${categoryId}:`, error);
      updateCategoryPodcasts(categoryId, []);
    }
  };
  
  // Format time (seconds) to MM:SS or HH:MM:SS with improved format
  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };
  
  // Load more podcasts when near bottom - keeping for backward compatibility
  const loadMorePodcasts = useCallback(async () => {
    // Prevent multiple simultaneous calls
    if (loadingMoreRef.current || allLoaded) return;
    
    try {
      loadingMoreRef.current = true;
      setLoading(true);
      const morePodcasts = await onRefresh();
      
      setAllPodcasts(prev => {
        // Create a Set of existing IDs for deduplication
        const existingIds = new Set(prev.map(p => p.id));
        // Filter out duplicates from new podcasts
        const newPodcasts = morePodcasts.filter(p => !existingIds.has(p.id));
        
        console.log(`Loaded ${morePodcasts.length} podcasts, ${newPodcasts.length} are new`);
        
        // If no new podcasts were returned, we've reached the end
        if (newPodcasts.length === 0) {
          setAllLoaded(true);
          console.log('All podcasts loaded, no more to fetch');
        }
        
        return [...prev, ...newPodcasts];
      });
    } catch (error) {
      console.error('Error loading more podcasts:', error);
    } finally {
      setLoading(false);
      loadingMoreRef.current = false;
    }
  }, [onRefresh]);
  
  // Search podcasts via iTunes API
  const searchPodcasts = useCallback(async (term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    
    try {
      setSearchLoading(true);
      const response = await fetch(
        `https://itunes.apple.com/search?media=podcast&entity=podcastEpisode&term=${encodeURIComponent(term)}&limit=20`
      );
      const data = await response.json();
      
      // Transform the iTunes response to match our PodcastEpisode format
      const episodes: PodcastEpisode[] = data.results.map((item: any) => ({
        id: item.trackId,
        title: item.trackName,
        description: item.description || '',
        url: item.trackViewUrl,
        datePublished: new Date(item.releaseDate).toLocaleDateString(),
        duration: item.trackTimeMillis ? Math.floor(item.trackTimeMillis / 1000) : '',
        image: item.artworkUrl600 || item.artworkUrl100,
        feedTitle: item.collectionName,
        feedUrl: item.feedUrl || '',
        audio: item.previewUrl || ''
      }));
      
      setSearchResults(episodes);
    } catch (error) {
      console.error('Error searching podcasts:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Handle search input changes
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Debounce search to avoid making too many requests
    const delayDebounceFn = setTimeout(() => {
      searchPodcasts(query);
    }, 500);
    
    return () => clearTimeout(delayDebounceFn);
  }, [searchPodcasts]);

  // Handle toggling search mode
  const toggleSearch = useCallback(() => {
    setSearchActive(prev => !prev);
    
    // If opening search, focus the input after a brief delay to allow animation
    if (!searchActive) {
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 100);
    } else {
      // If closing search, clear results and query
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [searchActive]);

  // Search close function
  const closeSearch = useCallback(() => {
    setSearchActive(false);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  // Handle search result click
  const handleSearchResultClick = useCallback((podcast: PodcastEpisode) => {
    onPlayPodcast(podcast);
    closeSearch(); // Close search after selecting a result
  }, [onPlayPodcast, closeSearch]);

  // Render a podcast card - extracted for reuse
  const renderPodcastCard = (podcast: PodcastEpisode, isWide: boolean = false) => (
    <motion.div
      key={podcast.id}
      className="flex-shrink-0 w-full bg-white/5 rounded-lg overflow-hidden hover:bg-white/10 transition-all h-full"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="relative aspect-square">
        {podcast.image ? (
          <img 
            src={podcast.image} 
            alt={podcast.title} 
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            crossOrigin="anonymous"
            onError={(e) => {
              console.log('Image load error, using fallback', podcast.title);
              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x300?text=Podcast';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-purple-900">
            <span className="text-3xl">🎙️</span>
          </div>
        )}
        
        {/* Play button overlay */}
        <button 
          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity"
          onClick={() => onPlayPodcast(podcast)}
        >
          <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </button>
      </div>
      
      <div className="p-2">
        <h3 className="font-bold text-sm mb-1 line-clamp-1">{podcast.title}</h3>
        <p className="text-white/70 text-xs line-clamp-1">{podcast.feedTitle}</p>
        {podcast.duration && (
          <div className="flex items-center text-xs text-white/50 mt-1">
            <span className="line-clamp-1">
              {typeof podcast.duration === 'string' 
                ? podcast.duration 
                : formatTime(Number(podcast.duration))}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );

  // Render podcast category row
  const renderPodcastCategory = (category: PodcastCategory, isWide: boolean = false) => {
    if (category.loading) {
      return (
        <div className="h-44 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-t-transparent border-white/70 rounded-full animate-spin mr-3" />
          <span className="text-white/70">Loading {category.title}...</span>
        </div>
      );
    }
    
    if (category.podcasts.length === 0) {
      return null;
    }
    
    // Limit to 10 podcasts for the 2-row layout
    const limitedPodcasts = category.podcasts.slice(0, 10);
    
    return (
      <div key={category.id} className="mb-8">
        <h3 className="text-lg font-medium px-4 py-2 text-white/90">{category.title}</h3>
        <div className="px-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {limitedPodcasts.map(podcast => renderPodcastCard(podcast, isWide))}
          </div>
        </div>
      </div>
    );
  };
  
  // Set up intersection observer for infinite scroll in the Mixed category
  useEffect(() => {
    if (!bottomObserverRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !allLoaded && allPodcasts.length > 0) {
          console.log('Bottom of list approaching, loading more podcasts...');
          loadMorePodcasts();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );
    
    observer.observe(bottomObserverRef.current);
    
    return () => {
      if (bottomObserverRef.current) {
        observer.unobserve(bottomObserverRef.current);
      }
    };
  }, [loading, allLoaded, allPodcasts.length, loadMorePodcasts]);
  
  // Loading state
  if (loading && allPodcasts.length === 0 && categories.every(cat => cat.loading) && famousPodcasters.every(pod => pod.loading)) {
    return (
      <div className="h-full w-full overflow-hidden bg-black text-white">
        {/* Header - keep it visible during loading */}
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
        
        {/* Loading spinner in the middle of the screen */}
        <div className="h-full flex flex-col items-center justify-center bg-black">
          <div className="flex items-center justify-center space-x-3 px-6">
            <div 
              className="w-6 h-6 border-2 border-t-transparent border-white rounded-full animate-spin"
            />
            <p 
              className="text-lg text-white font-space"
            >
              Loading podcasts...
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error && allPodcasts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="text-center px-6">
          <div className="text-6xl mb-6">🎙️</div>
          <h3 className="text-2xl font-bold mb-3 text-white">Failed to load podcasts</h3>
          <p className="text-white/70 mb-6">{error.message}</p>
          <button 
            onClick={loadAllPodcastCategories}
            className="px-8 py-3 bg-white/20 hover:bg-white/30 text-white font-medium rounded-full transition backdrop-blur-sm"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  
  // Render search UI when active, otherwise show normal podcast list
  if (searchActive) {
    return (
      <div className="h-full w-full overflow-hidden bg-black text-white">
        {/* Search Header */}
        <div className="fixed top-0 left-0 right-0 p-4 z-50 bg-black">
          <div className="flex items-center">
            <button 
              className="mr-3 text-white/80 hover:text-white"
              onClick={closeSearch}
            >
              <ArrowLeftIcon className="h-6 w-6" />
            </button>
            
            <div className="flex-1 relative">
              <input
                ref={searchInputRef}
                type="text"
                className="w-full bg-white/10 rounded-full py-2 px-4 pl-10 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                placeholder="Search podcasts..."
                value={searchQuery}
                onChange={handleSearchChange}
              />
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-white/60" />
              
              {searchQuery && (
                <button 
                  className="absolute right-3 top-2.5 text-white/60 hover:text-white"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    if (searchInputRef.current) {
                      searchInputRef.current.focus();
                    }
                  }}
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Search results */}
        <div className="h-full overflow-y-auto pt-16 pb-24">
          {searchLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-t-transparent border-white rounded-full animate-spin mr-3" />
              <p className="text-white/80">Searching...</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="px-4">
              {/* Results count */}
              <div className="py-3 px-1 text-white/70">
                <h3 className="text-sm font-medium">
                  Search results ({searchResults.length})
                </h3>
              </div>

              {searchResults.map((podcast) => (
                <div 
                  key={`${podcast.id}-${podcast.title}`}
                  className="flex items-start p-3 border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => handleSearchResultClick(podcast)}
                >
                  {podcast.image ? (
                    <img 
                      src={podcast.image} 
                      alt={podcast.title}
                      className="w-16 h-16 rounded-md object-cover mr-3 flex-shrink-0"
                      loading="lazy"
                      decoding="async"
                      crossOrigin="anonymous"
                      onError={(e) => {
                        console.log('Search result image load error, using fallback', podcast.title);
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64?text=🎙️';
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 bg-white/10 rounded-md flex items-center justify-center mr-3 flex-shrink-0">
                      <span className="text-2xl">🎙️</span>
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium line-clamp-2">{podcast.title}</h3>
                    <p className="text-white/70 text-sm">{podcast.feedTitle}</p>
                    <div className="flex items-center text-white/50 text-xs mt-1">
                      <span>{podcast.datePublished}</span>
                      {podcast.duration && (
                        <>
                          <span className="mx-1">•</span>
                          <span>{typeof podcast.duration === 'number' ? formatTime(podcast.duration) : podcast.duration}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : searchQuery ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
              <div className="text-5xl mb-3">🔍</div>
              <h3 className="text-xl font-medium mb-2">No podcasts found</h3>
              <p className="text-white/60">Try a different search term</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-black text-white">
      {/* Header */}
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
      
      {/* Podcast categories - reduce top padding to fix spacing */}
      <div className="h-full overflow-y-auto pb-24 pt-14 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {/* Render categories in the specific order requested */}
        {/* 1. New & Noteworthy */}
        {renderPodcastCategory(categories.find(c => c.id === 'newNoteworthy') || { id: 'newNoteworthy', title: 'New & Noteworthy', podcasts: [], loading: true })}
        
        {/* 2. Top Episodes */}
        {renderPodcastCategory(categories.find(c => c.id === 'topEpisodes') || { id: 'topEpisodes', title: 'Top Episodes', podcasts: [], loading: true })}
        
        {/* 3. Lex Fridman */}
        {renderPodcastCategory(famousPodcasters.find(c => c.id === 'lexFridman') || { id: 'lexFridman', title: 'Lex Fridman Podcast', podcasts: [], loading: true })}
        
        {/* 4. Joe Rogan */}
        {renderPodcastCategory(famousPodcasters.find(c => c.id === 'joeRogan') || { id: 'joeRogan', title: 'The Joe Rogan Experience', podcasts: [], loading: true })}
        
        {/* 5. Huberman Lab */}
        {renderPodcastCategory(famousPodcasters.find(c => c.id === 'hubermanLab') || { id: 'hubermanLab', title: 'Huberman Lab', podcasts: [], loading: true })}
        
        {/* 6. Sam Harris */}
        {renderPodcastCategory(famousPodcasters.find(c => c.id === 'samHarris') || { id: 'samHarris', title: 'Making Sense with Sam Harris', podcasts: [], loading: true })}
        
        {/* 7. Steve Bartlett */}
        {renderPodcastCategory(famousPodcasters.find(c => c.id === 'steveBartlett') || { id: 'steveBartlett', title: 'The Diary of a CEO', podcasts: [], loading: true })}
        
        {/* 8. Tim Ferriss */}
        {renderPodcastCategory(famousPodcasters.find(c => c.id === 'timFerriss') || { id: 'timFerriss', title: 'The Tim Ferriss Show', podcasts: [], loading: true })}
        
        {/* 9. Jordan Peterson */}
        {renderPodcastCategory(famousPodcasters.find(c => c.id === 'jordanPeterson') || { id: 'jordanPeterson', title: 'The Jordan B. Peterson Podcast', podcasts: [], loading: true })}
        
        {/* 10. Rich Roll */}
        {renderPodcastCategory(famousPodcasters.find(c => c.id === 'richRoll') || { id: 'richRoll', title: 'Rich Roll Podcast', podcasts: [], loading: true })}
        
        {/* 11. Everyone's Talking About */}
        {renderPodcastCategory(categories.find(c => c.id === 'everyoneTalking') || { id: 'everyoneTalking', title: 'Everyone\'s Talking About', podcasts: [], loading: true })}
        
        {/* 12. Musically Inclined */}
        {renderPodcastCategory(categories.find(c => c.id === 'musicallyInclined') || { id: 'musicallyInclined', title: 'Musically Inclined', podcasts: [], loading: true })}
        
        {/* 8. Mixed category with vertical layout for all podcasts - loaded in batches */}
        {allPodcasts.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-medium px-4 py-2 text-white/90">Mixed</h3>
            <div className="px-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                {allPodcasts.map(podcast => renderPodcastCard(podcast))}
              </div>
            </div>
          </div>
        )}
        
        {/* Empty state */}
        {allPodcasts.length === 0 && 
          categories.every(cat => cat.podcasts.length === 0) && 
          famousPodcasters.every(pod => pod.podcasts.length === 0) && 
          !loading && (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="text-5xl mb-4">🔍</div>
              <p className="text-xl mb-2">No podcasts found</p>
              <button
                onClick={loadAllPodcastCategories}
                className="mt-4 px-6 py-2 bg-purple-600 rounded-full text-white"
              >
                Refresh
              </button>
            </div>
          )
        }

        {/* Loading indicator at bottom - this triggers infinite scroll */}
        <div ref={bottomObserverRef} className="py-8 flex justify-center">
          {loading && (
            <div className="flex items-center justify-center space-x-2 py-4">
              <div className="w-4 h-4 border-2 border-t-transparent border-white/70 rounded-full animate-spin" />
              <p className="text-white/70 text-sm">Loading more podcasts...</p>
            </div>
          )}
        </div>
        
        {/* Search pill - positioned absolutely at bottom and adjusted when podcast is playing */}
        <div className="pointer-events-none w-full h-0">
          <div 
            className={`absolute left-0 right-0 flex justify-center ${isPodcastPlaying ? 'podcast-playing' : ''}`}
            style={{
              bottom: isPodcastPlaying ? '100px !important' : '20px',
              position: 'fixed',
              transition: 'all 0.3s ease',
              zIndex: 50,
            }}
          >
            <button
              onClick={toggleSearch}
              className="flex items-center bg-white/10 hover:bg-white/15 backdrop-blur-sm rounded-full px-3 text-white shadow-lg transition-all pointer-events-auto h-7 text-xs"
            >
              <MagnifyingGlassIcon className="h-3.5 w-3.5 mr-1.5" />
              <span>Search</span>
            </button>
          </div>
        </div>
        
        {/* Shared modals */}
        <AnimatePresence>
          {showAboutModal && (
            <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} />
          )}
        </AnimatePresence>
        
        <AnimatePresence>
          {showLikesModal && (
            <LikesModal 
              isOpen={showLikesModal} 
              onClose={() => setShowLikesModal(false)} 
              likedArticles={likedArticles}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PodcastView; 