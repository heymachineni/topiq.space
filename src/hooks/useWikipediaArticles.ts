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

// Configuration for source distribution
const SOURCES_CONFIG: Record<ContentSource, { weight: number; fetchFunction: any; batchSize: number }> = {
  wikipedia: {
    weight: 35,
    fetchFunction: fetchRandomArticles,
    batchSize: 5,
  },
  wikievents: {
    weight: 10,
    fetchFunction: fetchOnThisDayEvents,
    batchSize: 3,
  },
  onthisday: {
    weight: 5,
    fetchFunction: fetchOnThisDayEvents,
    batchSize: 3,
  },
  hackernews: {
    weight: 10,
    fetchFunction: fetchHackerNewsStories,
    batchSize: 3,
  },
  oksurf: {
    weight: 20,
    fetchFunction: fetchOkSurfNews,
    batchSize: 5,
  },
  reddit: {
    weight: 20,
    fetchFunction: fetchRandomArticles,
    batchSize: 5,
  },
  rss: {
    weight: 0, // Initially set to 0 to maintain compatibility
    fetchFunction: fetchRandomArticles, // Fallback to Wikipedia as placeholder
    batchSize: 3,
  },
};

// Helper to get a random integer in a range
const getRandomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Helper function to calculate source distribution based on weights
const calculateSourceDistribution = (totalCount: number): Record<ContentSource, number> => {
  const distribution: Record<ContentSource, number> = {
    wikipedia: 0,
    wikievents: 0,
    onthisday: 0,
    hackernews: 0,
    oksurf: 0,
    reddit: 0,
    rss: 0,
  };

  const totalWeight = Object.values(SOURCES_CONFIG).reduce((sum, config) => sum + config.weight, 0);
  
  // Distribute the count across sources based on weights
  for (const source of Object.keys(SOURCES_CONFIG) as ContentSource[]) {
    const weight = SOURCES_CONFIG[source].weight;
    distribution[source] = Math.round((weight / totalWeight) * totalCount);
  }

  // Adjust for rounding errors
  const distributedCount = Object.values(distribution).reduce((sum, count) => sum + count, 0);
  const diff = totalCount - distributedCount;
  
  if (diff !== 0) {
    // Add or subtract from Wikipedia to account for rounding differences
    distribution.wikipedia = Math.max(0, distribution.wikipedia + diff);
  }

  return distribution;
};

// Helper function to shuffle array
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const useWikipediaArticles = (initialCount: number = 10) => {
  const [articles, setArticles] = useState<WikipediaArticle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoadingBackground, setIsLoadingBackground] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const lastRefreshTime = useRef<number>(0);
  const viewedArticleIds = useRef<Set<number>>(new Set());
  
  // Default distribution of articles by source
  const [sourceDistribution, setSourceDistribution] = useState<Record<ContentSource, number>>({
    wikipedia: Math.floor(initialCount * 0.35),
    wikievents: Math.floor(initialCount * 0.1),
    reddit: Math.floor(initialCount * 0.2),
    onthisday: Math.floor(initialCount * 0.05),
    oksurf: Math.floor(initialCount * 0.2),
    hackernews: Math.floor(initialCount * 0.1),
    rss: 0, // Add the missing rss property
  });
  
  // Update source counts in distribution
  const updateSourceCounts = useCallback((articleList: WikipediaArticle[]) => {
    const counts: Record<ContentSource, number> = {
      wikipedia: 0,
      wikievents: 0,
      reddit: 0,
      onthisday: 0,
      oksurf: 0,
      hackernews: 0,
      rss: 0
    };
    
    articleList.forEach(article => {
      const source = article.source || 'wikipedia';
      counts[source] = (counts[source] || 0) + 1;
    });
    
    setSourceDistribution(counts);
  }, []);

  // Function to fetch a batch of fresh articles
  const fetchFreshArticles = async (batchSize: number = 10): Promise<WikipediaArticle[]> => {
    console.log('Fetching fresh articles');
    setLoading(true);
    setError('');

    try {
      // Determine the number of articles to fetch from each source based on weights
      const sourceDistribution = calculateSourceDistribution(batchSize);
      console.log('Source distribution:', sourceDistribution);

      // Fetch articles from all sources in parallel
      const fetchPromises = Object.entries(sourceDistribution).map(([source, count]) => {
        if (count <= 0) return Promise.resolve([]);
        const { fetchFunction, batchSize: sourceBatchSize } = SOURCES_CONFIG[source as ContentSource];
        // Fetch more than needed to allow for filtering
        const extraFactor = source === 'onthisday' ? 1 : 2; // Don't overfetch onthisday since they have limited content
        return fetchFunction(Math.ceil(count * extraFactor))
          .then((articles: WikipediaArticle[]) => {
            // Apply consistent image quality filtering for all sources except onthisday
            if (source !== 'onthisday') {
              return articles.filter(article => 
                article.thumbnail && 
                article.thumbnail.width && 
                article.thumbnail.width >= 800
              ).slice(0, count);
            }
            return articles.slice(0, count);
          });
      });

      const articlesBySource = await Promise.all(fetchPromises);
      const allArticles = articlesBySource.flat();
      
      // Shuffle the articles to mix sources
      const shuffledArticles = shuffleArray(allArticles);
      
      console.log(`Fetched ${shuffledArticles.length} fresh articles`);
      return shuffledArticles;
    } catch (err) {
      console.error('Error fetching fresh articles:', err);
      setError('Failed to fetch articles. Please try again.');
      return [];
    } finally {
      setLoading(false);
    }
  };

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

  // Function to refresh the articles list
  const refreshArticles = async () => {
    const initialSourceDistribution = {
      wikipedia: Math.floor(initialCount * 0.35),
      wikievents: Math.floor(initialCount * 0.1),
      reddit: Math.floor(initialCount * 0.2),
      onthisday: Math.floor(initialCount * 0.05),
      oksurf: Math.floor(initialCount * 0.2),
      hackernews: Math.floor(initialCount * 0.1),
      rss: 0, // Add the missing rss property
    };

    setSourceDistribution(initialSourceDistribution);

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
  };

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