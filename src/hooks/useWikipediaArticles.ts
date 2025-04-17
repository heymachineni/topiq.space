import { useState, useEffect, useCallback, useRef } from 'react';
import { WikipediaArticle, ContentSource } from '../types';
import { 
  fetchMultiSourceArticles, 
  fetchRandomArticles, 
  fetchHackerNewsStories, 
  fetchOnThisDayEvents, 
  fetchOkSurfNews,
  clearArticleCaches
} from '../utils/api';
import { 
  getSavedArticles, 
  saveArticle, 
  getViewedArticles, 
  markArticleAsViewed 
} from '../utils/storage';

// Batching configuration
const REFRESH_INTERVAL = 2 * 60 * 60 * 1000; // Refresh every 2 hours
const BATCH_SIZE = 20; // Number of articles to fetch in each batch
const MAX_CACHED_ARTICLES = 100; // Maximum number of articles to keep in cache

// Source distribution for a balanced content mix
const SOURCES_CONFIG: Record<ContentSource, { weight: number }> = {
  'wikipedia': { weight: 20 },    // 20% Wikipedia
  'wikievents': { weight: 20 },   // 20% Wikipedia Current Events
  'rss': { weight: 20 },          // 20% RSS Feeds
  'reddit': { weight: 20 },       // 20% Reddit
  'onthisday': { weight: 10 },    // 10% On This Day
  'oksurf': { weight: 10 },       // 10% OK Surf
  'hackernews': { weight: 0 }     // 0% Hacker News (keeping for backward compatibility)
};

// Helper to get a random integer in a range
const getRandomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
    rss: 0,
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
      rss: 0,
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

  // Fetch fresh articles from all sources
  const fetchFreshArticles = useCallback(async (count: number) => {
    try {
      setError(null);
      
      // Get previously viewed article IDs - but don't filter them out completely
      const viewedArticles = getViewedArticles();
      // Convert to array of numbers
      const viewedIdNumbers = viewedArticles.map(article => article.pageid);
      viewedArticleIds.current = new Set(viewedIdNumbers);
      
      // Calculate how many articles to request from each source based on weights
      const sourceRequests: Partial<Record<ContentSource, number>> = {};
      const totalWeight = Object.values(SOURCES_CONFIG).reduce((sum, config) => sum + config.weight, 0);
      
      let remainingCount = count;
      
      // Distribute the count across sources based on weights
      for (const source of Object.keys(SOURCES_CONFIG) as ContentSource[]) {
        const weight = SOURCES_CONFIG[source].weight;
        const sourceCount = Math.round((weight / totalWeight) * count);
        sourceRequests[source] = sourceCount;
        remainingCount -= sourceCount;
      }
      
      // Adjust for rounding errors
      if (remainingCount > 0) {
        sourceRequests.wikipedia = (sourceRequests.wikipedia || 0) + remainingCount;
      } else if (remainingCount < 0) {
        sourceRequests.wikipedia = Math.max(1, (sourceRequests.wikipedia || 0) + remainingCount);
      }
      
      // Fetch articles from multiple sources - pass the viewed IDs but don't filter
      const freshArticles = await fetchMultiSourceArticles(sourceRequests);
      
      // Filter out articles without titles
      const validArticles = freshArticles.filter(article => 
        article.title && article.title.trim() !== ''
      );
      
      // Sort articles - new ones first, then already viewed ones
      const sortedArticles = validArticles.sort((a, b) => {
        const aViewed = a.pageid ? viewedArticleIds.current.has(a.pageid) : false;
        const bViewed = b.pageid ? viewedArticleIds.current.has(b.pageid) : false;
        
        if (aViewed && !bViewed) return 1; // a is viewed, b is not, so b comes first
        if (!aViewed && bViewed) return -1; // a is not viewed, b is viewed, so a comes first
        return 0; // no change in order
      });
      
      // Mark these articles as viewed
      sortedArticles.forEach(article => {
        if (article.pageid) {
          viewedArticleIds.current.add(article.pageid);
          markArticleAsViewed(article);
        }
      });
      
      // Update the last refresh time
      lastRefreshTime.current = Date.now();
      
      return sortedArticles;
    } catch (err) {
      console.error('Error fetching fresh articles:', err);
      setError('Failed to fetch articles. Please try again later.');
      return [];
    }
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
          const freshArticles = await fetchFreshArticles(BATCH_SIZE);
          
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
          const directArticles = await fetchFreshArticles(initialCount);
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

  // Refresh articles with new content
  const refreshArticles = useCallback(async () => {
    setLoading(true);
    
    try {
      // Clear existing caches to start fresh
      clearArticleCaches();
      
      // Fetch fresh articles
      const freshArticles = await fetchFreshArticles(BATCH_SIZE);
      
      if (freshArticles.length > 0) {
        // Log the source distribution of fetched articles
        const sourceCounts = freshArticles.reduce((acc, article) => {
          const source = article.source || 'wikipedia';
          acc[source] = (acc[source] || 0) + 1;
          return acc;
        }, {} as Record<ContentSource, number>);
        console.log('Source distribution of refreshed articles:', sourceCounts);
        
        setArticles(freshArticles);
        saveArticlesToCache(freshArticles);
      } else {
        setError('No articles found. Please try again.');
      }
    } catch (err) {
      console.error('Error refreshing articles:', err);
      setError('Failed to refresh articles. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [fetchFreshArticles, saveArticlesToCache]);

  // Load more articles in the background
  const loadMoreArticlesInBackground = useCallback(async (count: number = BATCH_SIZE) => {
    // Don't fetch more while already loading
    if (isLoadingBackground) return;
    
    setIsLoadingBackground(true);
    
    try {
      // Fetch more articles directly without worrying about filtering
      const freshArticles = await fetchFreshArticles(count);
      
      // Get cached articles to avoid exact duplicates
      const cachedArticles = loadArticlesFromCache();
      const cachedIds = new Set(cachedArticles.map(a => a.pageid));
      
      // Filter out exact duplicates and articles without titles
      const uniqueNewArticles = freshArticles.filter(article => 
        !cachedIds.has(article.pageid) && 
        article.title && 
        article.title.trim() !== ''
      );
      
      // Sort so unviewed articles come first
      const sortedNewArticles = uniqueNewArticles.sort((a, b) => {
        const aViewed = a.pageid ? viewedArticleIds.current.has(a.pageid) : false;
        const bViewed = b.pageid ? viewedArticleIds.current.has(b.pageid) : false;
        
        if (aViewed && !bViewed) return 1; 
        if (!aViewed && bViewed) return -1;
        return 0;
      });
      
      // Mark new articles as viewed
      sortedNewArticles.forEach(article => {
        if (article.pageid) {
          viewedArticleIds.current.add(article.pageid);
          markArticleAsViewed(article);
        }
      });
      
      // Update state and cache
      setArticles(prev => [...prev, ...sortedNewArticles]);
      saveArticlesToCache([...cachedArticles, ...sortedNewArticles].slice(0, MAX_CACHED_ARTICLES));
    } catch (err) {
      console.error('Error loading more articles:', err);
      // Don't show error to user for background loading
    } finally {
      setIsLoadingBackground(false);
    }
  }, [isLoadingBackground, fetchFreshArticles, loadArticlesFromCache, saveArticlesToCache]);

  return {
    articles,
    loading,
    error,
    refreshArticles,
    loadMoreArticlesInBackground
  };
}; 