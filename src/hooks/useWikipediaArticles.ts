import { useState, useEffect, useCallback, useRef } from 'react';
import { WikipediaArticle, ContentSource } from '../types';
import { 
  fetchMultiSourceArticles, 
  fetchRandomArticles, 
  fetchHackerNewsStories, 
  fetchOnThisDayEvents, 
  fetchOkSurfNews,
  clearArticleCaches,
  optimizeArticleImagesArray
} from '../utils/api';
import { 
  getSavedArticles, 
  saveArticle, 
  getViewedArticles, 
  markArticleAsViewed 
} from '../utils/storage';

// Batching configuration
const REFRESH_INTERVAL = 2 * 60 * 60 * 1000; // Refresh every 2 hours
const BATCH_SIZE = 30; // Increased from 20 to 30 for better infinite scroll
const MAX_CACHED_ARTICLES = 150; // Increased from 100 to ensure we have enough articles cached

// Source distribution for a balanced content mix
const SOURCES_CONFIG: Record<ContentSource, { weight: number }> = {
  'wikipedia': { weight: 40 },    // 40% Wikipedia
  'wikievents': { weight: 5 },    // 5% Wikipedia Current Events
  'reddit': { weight: 25 },       // 25% Reddit
  'onthisday': { weight: 5 },     // 5% On This Day
  'oksurf': { weight: 15 },       // 15% OK Surf
  'hackernews': { weight: 10 }    // 10% Hacker News
};

// Helper to get a random integer in a range
const getRandomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Function to fetch fresh articles using the direct API approach
const fetchFreshArticles = async (
  count: number, 
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  searchQuery?: string
): Promise<WikipediaArticle[]> => {
  setIsLoading(true);
  
  try {
    // Generate a varied set of search queries if none provided
    const queries = searchQuery ? 
      [searchQuery] : 
      ['science', 'history', 'technology', 'art', 'nature', 'space', 'culture'];
    
    // Select a random query if searchQuery not provided
    const query = searchQuery || queries[Math.floor(Math.random() * queries.length)];
    
    // Default distribution with Wikipedia as the main source
    const sourceDistribution: Partial<Record<ContentSource, number>> = {
      wikipedia: count * 0.5,
      wikievents: count * 0.1,
      hackernews: count * 0.1,
      reddit: count * 0.1,
      onthisday: count * 0.1,
      oksurf: count * 0.1
    };
    
    // Fetch the articles using our new direct API approach
    const articles = await fetchMultiSourceArticles(sourceDistribution, query);
    
    // Optimize the images
    const optimizedArticles = optimizeArticleImagesArray(articles);
    
    return optimizedArticles;
  } catch (error) {
    console.error('Error fetching fresh articles:', error);
    return [];
  } finally {
    setIsLoading(false);
  }
};

// Check seen articles to avoid duplicates
const filterOutSeenArticles = (newArticles: WikipediaArticle[], seenArticles: Set<number>): WikipediaArticle[] => {
  return newArticles.filter(article => !seenArticles.has(article.pageid));
};

export const useWikipediaArticles = (initialCount: number = 10) => {
  const [articles, setArticles] = useState<WikipediaArticle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoadingBackground, setIsLoadingBackground] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const lastRefreshTime = useRef<number>(0);
  const viewedArticleIds = useRef<Set<number>>(new Set());
  
  // Keep track of distribution across sources
  const [sourceDistribution, setSourceDistribution] = useState<Record<ContentSource, number>>({
    wikipedia: 0,
    wikievents: 0,
    reddit: 0,
    onthisday: 0,
    oksurf: 0,
    hackernews: 0
  });
  
  // Update source counts in distribution
  const updateSourceCounts = useCallback((articleList: WikipediaArticle[]) => {
    const counts: Record<ContentSource, number> = {
      wikipedia: 0,
      wikievents: 0,
      reddit: 0,
      onthisday: 0,
      oksurf: 0,
      hackernews: 0
    };
    
    articleList.forEach(article => {
      const source = article.source || 'wikipedia';
      counts[source] = (counts[source] || 0) + 1;
    });
    
    setSourceDistribution(counts);
  }, []);

  // Save articles to cache
  const saveArticlesToCache = useCallback((articleList: WikipediaArticle[]) => {
    // Save each article individually
    articleList.forEach(article => {
      saveArticle(article);
    });
  }, []);

  // Load articles from cache
  const loadArticlesFromCache = useCallback((): WikipediaArticle[] => {
    return getSavedArticles();
  }, []);

  // Initialize articles on mount
  useEffect(() => {
    const initializeArticles = async () => {
      setLoading(true);
      
      try {
        // Try to load cached articles first
        let cachedArticles = loadArticlesFromCache();
        
        // Check if we need to refresh the cache
        const needsRefresh = 
          cachedArticles.length < initialCount || 
          !lastRefreshTime.current || 
          (Date.now() - lastRefreshTime.current > REFRESH_INTERVAL);
        
        if (needsRefresh) {
          // Fetch fresh articles if needed
          const freshArticles = await fetchFreshArticles(BATCH_SIZE, setLoading);
          
          if (freshArticles.length > 0) {
            // Combine fresh articles with existing cache
            cachedArticles = [...freshArticles, ...cachedArticles];
            
            // Limit the cache size
            if (cachedArticles.length > MAX_CACHED_ARTICLES) {
              cachedArticles = cachedArticles.slice(0, MAX_CACHED_ARTICLES);
            }
            
            // Save updated cache
            saveArticlesToCache(cachedArticles);
          }
        }
        
        // Use cached articles for initial display
        if (cachedArticles.length > 0) {
          setArticles(cachedArticles.slice(0, initialCount));
        } else {
          // Fallback to direct fetch if cache is empty
          const directArticles = await fetchFreshArticles(initialCount, setLoading);
          setArticles(directArticles);
        }
      } catch (err) {
        console.error('Error initializing articles:', err);
        setError('Failed to load articles. Please try again later.');
      } finally {
        setLoading(false);
        setInitialLoadComplete(true);
      }
    };
    
    initializeArticles();
  }, [initialCount, fetchFreshArticles, loadArticlesFromCache, saveArticlesToCache]);

  // Refresh articles - modify to use seen articles tracking
  const refreshArticles = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Track seen article IDs to avoid repeats
      const seenArticleIds = new Set<number>();
      
      // Add current articles to seen set
      articles.forEach(article => {
        seenArticleIds.add(article.pageid);
      });
      
      // Fetch new articles and filter out any we've already seen
      const freshArticles = await fetchFreshArticles(30, setLoading);
      const uniqueArticles = filterOutSeenArticles(freshArticles, seenArticleIds);
      
      // Save to cache and update state with unique articles
      saveArticlesToCache(uniqueArticles);
      setArticles(uniqueArticles);
      
    } catch (error) {
      console.error('Error refreshing articles:', error);
      setError('Failed to refresh articles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load more articles in the background - modify to check for duplicates
  const loadMoreArticlesInBackground = async (count: number = 10) => {
    if (isLoadingBackground) return; // Prevent concurrent loads
    
    setIsLoadingBackground(true);
    
    try {
      // Track seen article IDs to avoid repeats
      const seenArticleIds = new Set<number>();
      
      // Add current articles to seen set
      articles.forEach(article => {
        seenArticleIds.add(article.pageid);
      });
      
      // Use a random search query for variety
      const queries = ['science', 'history', 'technology', 'art', 'nature', 'space', 'culture'];
      const randomQuery = queries[Math.floor(Math.random() * queries.length)];
      
      // Fetch with the direct API and filter out seen articles
      const newArticles = await fetchFreshArticles(count + 10, () => {}, randomQuery);
      const uniqueArticles = filterOutSeenArticles(newArticles, seenArticleIds);
      
      // Only append if we got unique articles
      if (uniqueArticles.length > 0) {
        setArticles(prev => [...prev, ...uniqueArticles.slice(0, count)]);
        
        // Update the cache with new combined set
        saveArticlesToCache([...articles, ...uniqueArticles.slice(0, count)]);
      } else {
        // If all are duplicates, try again with a different query
        const backupQuery = queries[Math.floor(Math.random() * queries.length)];
        const backupArticles = await fetchFreshArticles(count + 10, () => {}, backupQuery);
        const uniqueBackupArticles = filterOutSeenArticles(backupArticles, seenArticleIds);
        
        setArticles(prev => [...prev, ...uniqueBackupArticles.slice(0, count)]);
        saveArticlesToCache([...articles, ...uniqueBackupArticles.slice(0, count)]);
      }
    } catch (error) {
      console.error('Error loading more articles in background:', error);
    } finally {
      setIsLoadingBackground(false);
    }
  };

  return {
    articles,
    loading,
    error,
    refreshArticles,
    loadMoreArticlesInBackground
  };
}; 