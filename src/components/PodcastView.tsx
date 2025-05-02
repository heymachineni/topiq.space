import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PodcastEpisode } from '../types';
import { XMarkIcon, MagnifyingGlassIcon, ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { AboutModal, LikesModal } from './Modals';

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
  isExpanded?: boolean; // For mobile collapsible UI
}

const OptimizedImage = ({ src, alt, className, fallback }: { 
  src: string, 
  alt: string, 
  className: string,
  fallback?: string 
}) => {
  // Use direct image URL without messing with WebP conversion
  const defaultFallback = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjQwMCIgeT0iMzAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMzAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+';
  
  return (
    <img 
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async" 
      className={className}
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.onerror = null;
        target.src = fallback || defaultFallback;
      }}
    />
  );
};

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
  const [categories, setCategories] = useState<PodcastCategory[]>([]);
  
  // Famous podcasters state - update to include all podcasters in the requested order
  const [famousPodcasters, setFamousPodcasters] = useState<PodcastCategory[]>([
    { id: 'lexFridman', title: 'Lex Fridman Podcast', podcasts: [], loading: true, isExpanded: true },
    { id: 'joeRogan', title: 'The Joe Rogan Experience', podcasts: [], loading: true, isExpanded: true },
    { id: 'hubermanLab', title: 'Huberman Lab', podcasts: [], loading: true, isExpanded: true },
    { id: 'nikhilKamath', title: 'WTF is with Nikhil Kamath', podcasts: [], loading: true, isExpanded: true },
    { id: 'waveform', title: 'Waveform: The MKBHD Podcast', podcasts: [], loading: true, isExpanded: true },
    { id: 'tedTalks', title: 'TED Talks Daily', podcasts: [], loading: true, isExpanded: true },
    { id: 'ninetyNineInvisible', title: '99% Invisible', podcasts: [], loading: true, isExpanded: true },
    { id: 'uxCoffeeBreak', title: 'UX coffee break with UX Anudeep', podcasts: [], loading: true, isExpanded: true },
    { id: 'intercomOnProduct', title: 'Intercom on Product', podcasts: [], loading: true, isExpanded: true },
    { id: 'datelineNbc', title: 'Dateline NBC', podcasts: [], loading: true, isExpanded: true },
    { id: 'wvfrm', title: 'WVFRM', podcasts: [], loading: true, isExpanded: true },
    { id: 'smartLess', title: 'SmartLess', podcasts: [], loading: true, isExpanded: true },
    { id: 'thisAmericanLife', title: 'This American Life', podcasts: [], loading: true, isExpanded: true },
    { id: 'morbid', title: 'Morbid', podcasts: [], loading: true, isExpanded: true },
    { id: 'crimeJunkie', title: 'Crime Junkie', podcasts: [], loading: true, isExpanded: true },
    { id: 'upFirst', title: 'Up First', podcasts: [], loading: true, isExpanded: true },
    { id: 'hiddenBrain', title: 'Hidden Brain', podcasts: [], loading: true, isExpanded: true },
    { id: 'puriJagannadh', title: 'Puri Jagannadh', podcasts: [], loading: true, isExpanded: true },
    { id: 'stuffYouShouldKnow', title: 'Stuff You Should Know', podcasts: [], loading: true, isExpanded: true },
    { id: 'callHerDaddy', title: 'Call Her Daddy', podcasts: [], loading: true, isExpanded: true },
    { id: 'emmaChamberlain', title: 'Anything Goes with Emma Chamberlain', podcasts: [], loading: true, isExpanded: true },
    { id: 'onPurpose', title: 'On Purpose with Jay Shetty', podcasts: [], loading: true, isExpanded: true },
    { id: 'diaryOfACeo', title: 'The Diary Of A CEO with Steven Bartlett', podcasts: [], loading: true, isExpanded: true },
    { id: 'wiserThanMe', title: 'Wiser Than Me with Julia Louis-Dreyfus', podcasts: [], loading: true, isExpanded: true },
    { id: 'newHeights', title: 'New Heights with Jason & Travis Kelce', podcasts: [], loading: true, isExpanded: true },
    { id: 'heavyweight', title: 'Heavyweight', podcasts: [], loading: true, isExpanded: true }
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
    
    try {
      // Load all famous podcasters
      loadFamousPodcaster('lexFridman', 'lex fridman');
      loadFamousPodcaster('joeRogan', 'joe rogan');
      loadFamousPodcaster('hubermanLab', 'huberman lab');
      loadFamousPodcaster('nikhilKamath', 'wtf is with nikhil kamath');
      loadFamousPodcaster('waveform', 'waveform: the mkbhd podcast');
      loadFamousPodcaster('tedTalks', 'ted talks daily');
      loadFamousPodcaster('ninetyNineInvisible', '99% invisible');
      loadFamousPodcaster('uxCoffeeBreak', 'ux coffee break with ux anudeep');
      loadFamousPodcaster('intercomOnProduct', 'intercom on product');
      loadFamousPodcaster('datelineNbc', 'dateline nbc');
      loadFamousPodcaster('wvfrm', 'wvfrm');
      loadFamousPodcaster('smartLess', 'smartless');
      loadFamousPodcaster('thisAmericanLife', 'this american life');
      loadFamousPodcaster('morbid', 'morbid');
      loadFamousPodcaster('crimeJunkie', 'crime junkie');
      loadFamousPodcaster('upFirst', 'up first');
      loadFamousPodcaster('hiddenBrain', 'hidden brain');
      loadFamousPodcaster('puriJagannadh', 'puri jagannadh');
      loadFamousPodcaster('stuffYouShouldKnow', 'stuff you should know');
      loadFamousPodcaster('callHerDaddy', 'call her daddy');
      loadFamousPodcaster('emmaChamberlain', 'anything goes with emma chamberlain');
      loadFamousPodcaster('onPurpose', 'on purpose with jay shetty');
      loadFamousPodcaster('diaryOfACeo', 'the diary of a ceo with steven bartlett');
      loadFamousPodcaster('wiserThanMe', 'wiser than me with julia louis-dreyfus');
      loadFamousPodcaster('newHeights', 'new heights with jason & travis kelce');
      loadFamousPodcaster('heavyweight', 'heavyweight');
    } catch (error) {
      console.error('Error loading podcasters:', error);
      setError(error instanceof Error ? error : new Error('Failed to load podcasts'));
    } finally {
      setLoading(false);
    }
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
          ? { ...podcaster, podcasts: podcasts.slice(0, 10), loading: false } // Only keep first 10 episodes for UI
          : podcaster
      )
    );
  };
  
  // Toggle category expansion for mobile UI
  const toggleCategoryExpansion = (podcasterId: string) => {
    setFamousPodcasters(prev => 
      prev.map(podcaster => 
        podcaster.id === podcasterId 
          ? { ...podcaster, isExpanded: !podcaster.isExpanded }
          : podcaster
      )
    );
  };
  
  // Load category podcasts
  const loadCategoryPodcasts = async (categoryId: string, searchTerm: string) => {
    try {
      // Create static data for local development
      const podcastCount = Math.floor(Math.random() * 6) + 5; // 5-10 podcasts
      
      // Use a variety of working audio URLs for testing
      const sampleAudioUrls = [
        "https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3", // Sample audio file
        "https://samplelib.com/lib/preview/mp3/sample-3s.mp3", // Very short sample
        "https://samplelib.com/lib/preview/mp3/sample-9s.mp3", // Short sample
        "https://samplelib.com/lib/preview/mp3/sample-15s.mp3", // Medium sample
        "https://filesamples.com/samples/audio/mp3/sample3.mp3", // Alternative source
      ];
      
      const podcasts: PodcastEpisode[] = Array(podcastCount).fill(null).map((_, index) => ({
        id: Math.floor(Math.random() * 100000) + 1000 + index,
        title: `${searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1)} Podcast ${index + 1}`,
        description: `This is a sample ${searchTerm} podcast episode with interesting content.`,
        url: "https://example.com/podcast",
        datePublished: new Date().toLocaleDateString(),
        duration: `${Math.floor(Math.random() * 60) + 10}:00`,
        image: `https://source.unsplash.com/random/400x400?${searchTerm},podcast&sig=${categoryId}${index}`,
        feedTitle: `${searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1)} Network`,
        feedUrl: "https://example.com/feed",
        feedImage: `https://source.unsplash.com/random/100x100?${searchTerm},logo&sig=${categoryId}`,
        audio: sampleAudioUrls[index % sampleAudioUrls.length] // Rotate through sample URLs
      }));
      
      updateCategoryPodcasts(categoryId, podcasts);
    } catch (error) {
      console.error(`Error loading ${categoryId} podcasts:`, error);
      updateCategoryPodcasts(categoryId, []);
    }
  };
  
  // Load famous podcaster episodes
  const loadFamousPodcaster = async (podcasterId: string, searchTerm: string) => {
    try {
      // Fetch from the podcast-data.json file in the public directory
      console.log(`Attempting to fetch podcast data for ${podcasterId} (${searchTerm})`);
      
      // In Next.js, files in the public directory are served from the root path
      const response = await fetch('/podcast-data.json');
      
      console.log(`Fetch response status for ${podcasterId}:`, response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch podcast data: ${response.status}`);
      }
      
      const allPodcasts = await response.json();
      console.log(`Fetched ${allPodcasts.length} total podcasts from JSON file`);
      
      // Filter podcasts by name matching the search term
      const podcasterName = searchTerm.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      const podcasts = allPodcasts.filter((podcast: PodcastEpisode) => 
        podcast.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      console.log(`Found ${podcasts.length} podcasts matching "${searchTerm}"`);
      if (podcasts.length > 0) {
        console.log(`First matching podcast:`, podcasts[0]);
        console.log(`Audio URL present: ${Boolean(podcasts[0].audio)}`);
        console.log(`Image URL present: ${Boolean(podcasts[0].image)}`);
        updateFamousPodcasterPodcasts(podcasterId, podcasts);
      } else {
        console.warn(`No podcasts found for ${podcasterName}`);
        updateFamousPodcasterPodcasts(podcasterId, []);
      }
    } catch (error) {
      console.error(`Error loading ${podcasterId} podcasts:`, error);
      updateFamousPodcasterPodcasts(podcasterId, []);
      
      // Create static fallback data
      console.log(`Creating fallback data for ${podcasterId}`);
      const episodeCount = 5;
      const podcasterName = searchTerm.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      
      // Use a variety of working audio URLs for testing
      const sampleAudioUrls = [
        "https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3", // Sample audio file
        "https://samplelib.com/lib/preview/mp3/sample-3s.mp3", // Very short sample
        "https://samplelib.com/lib/preview/mp3/sample-9s.mp3", // Short sample
        "https://samplelib.com/lib/preview/mp3/sample-15s.mp3", // Medium sample
        "https://filesamples.com/samples/audio/mp3/sample3.mp3", // Alternative source
      ];
      
      const episodes: PodcastEpisode[] = Array(episodeCount).fill(null).map((_, index) => ({
        id: Math.floor(Math.random() * 100000) + 2000 + index,
        title: `${podcasterName} #${episodeCount - index}: ${['AI', 'Science', 'Philosophy', 'Tech', 'History'][Math.floor(Math.random() * 5)]} Discussion`,
        description: `${podcasterName} discusses fascinating topics with a special guest in this episode.`,
        url: "https://example.com/podcast",
        datePublished: new Date(Date.now() - index * 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        duration: `${Math.floor(Math.random() * 120) + 30}:00`,
        image: `https://picsum.photos/400/400?random=${podcasterId}${index}`,
        feedTitle: podcasterName,
        feedUrl: "https://example.com/feed",
        feedImage: `https://picsum.photos/100/100?random=${podcasterId}`,
        audio: sampleAudioUrls[index % sampleAudioUrls.length] // Rotate through sample URLs
      }));
      
      updateFamousPodcasterPodcasts(podcasterId, episodes);
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
    <div 
      key={podcast.id} 
      className={`group relative rounded-xl shadow-sm bg-white dark:bg-gray-800 overflow-hidden hover:shadow-lg transition-all duration-200 ${isWide ? 'w-64 flex-shrink-0' : 'w-full'} hover:scale-95 transform transition-transform duration-300 cursor-pointer`}
      onClick={() => onPlayPodcast(podcast)}
    >
      {/* Image */}
      <div className="relative w-full aspect-square">
        <OptimizedImage
          src={podcast.image || podcast.feedImage || ''}
          alt={podcast.title}
          className="w-full h-full object-cover"
          fallback={podcast.feedImage}
        />
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
        
        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="bg-black bg-opacity-60 p-4 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-8 h-8">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
        
        {/* Duration */}
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded-full text-xs">
          {podcast.duration || ''}
        </div>
      </div>
      
      {/* Title and description - with gray background */}
      <div className="p-3 bg-gray-100 dark:bg-gray-700">
        <h3 className="text-sm font-semibold line-clamp-2 text-gray-900 dark:text-gray-100">
          {podcast.title}
        </h3>
        {/* Date removed as requested */}
      </div>
    </div>
  );

  // Render podcast category row with collapsible UI for mobile
  const renderPodcastCategory = (category: PodcastCategory, isWide: boolean = false) => {
    // Don't render anything if there are no podcasts and we're not loading
    if (!category.loading && category.podcasts.length === 0) {
      return null;
    }
    
    // Limit to 10 podcasts for the UI display
    const limitedPodcasts = category.podcasts.slice(0, 10);
    
    return (
      <div key={category.id} className="mb-8">
        {/* Category header with collapsible toggle */}
        <div 
          className="flex justify-between items-center px-4 py-2 cursor-pointer sm:cursor-default"
          onClick={() => toggleCategoryExpansion(category.id)}
        >
          <h3 className="text-lg font-medium text-white/90">{category.title}</h3>
          {/* Chevron visible only on mobile - removed as requested */}
        </div>
        
        {/* Desktop layout - normal grid */}
        <div className="hidden sm:block px-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {limitedPodcasts.map(podcast => renderPodcastCard(podcast, isWide))}
          </div>
        </div>
        
        {/* Mobile layout - horizontal scroll with 3 columns */}
        <div className="sm:hidden px-4 overflow-x-auto hide-scrollbar">
          <div className="flex space-x-4 pb-3 w-full" style={{ 
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',  /* Firefox */
            msOverflowStyle: 'none'  /* IE and Edge */
          }}>
            {limitedPodcasts.map((podcast, index) => (
              <div 
                key={podcast.id} 
                className="w-[42%] min-w-[42%] flex-shrink-0 first:ml-0"
                style={{ 
                  flexBasis: '42%', 
                  flexShrink: 0,
                  flexGrow: 0 
                }}
              >
                {renderPodcastCard(podcast, false)}
              </div>
            ))}
            {/* Extra div showing 20% of next card to indicate scrollability */}
            {limitedPodcasts.length > 2 && (
              <div 
                className="w-[18%] min-w-[18%] flex-shrink-0 opacity-90"
                style={{ 
                  flexBasis: '18%', 
                  flexShrink: 0,
                  flexGrow: 0 
                }}
              >
                {renderPodcastCard(limitedPodcasts[Math.min(limitedPodcasts.length - 1, 2)], false)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  // Set up intersection observer for infinite scroll
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
  
  // Loading state - simplified to a single top-level loader
  if (loading) {
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
        
        {/* Single loading spinner in the middle of the screen */}
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
                    <div className="w-16 h-16 bg-white/10 rounded-md flex items-center justify-center mr-3 flex-shrink-0">
                      <span className="text-2xl">🎙️</span>
                    </div>
                  
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
      
      {/* Podcast categories - showing only the podcasters in the requested order */}
      <div className="h-full overflow-y-auto pb-24 pt-14 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {/* Render all famous podcasters in the requested order */}
        {famousPodcasters.map(podcaster => renderPodcastCategory(podcaster))}
        
        {/* Empty state */}
        {famousPodcasters.every(pod => pod.podcasts.length === 0) && !loading && (
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
        )}

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