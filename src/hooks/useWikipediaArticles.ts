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
const REFRESH_INTERVAL = 30 * 60 * 1000; // Refresh every 30 minutes (reduced from 2 hours)
const BATCH_SIZE = 50; // Increased from 30 to 50 for better infinite scroll
const MAX_CACHED_ARTICLES = 200; // Increased from 150 to 200 for more variety

// Source distribution for a balanced content mix
const SOURCES_CONFIG: Record<ContentSource, { weight: number }> = {
  'wikipedia': { weight: 50 },    // 50% Wikipedia (increased from 40%)
  'wikievents': { weight: 5 },    // 5% Wikipedia Current Events
  'reddit': { weight: 20 },       // 20% Reddit (reduced from 25%)
  'onthisday': { weight: 5 },     // 5% On This Day
  'oksurf': { weight: 10 },       // 10% OK Surf (reduced from 15%)
  'hackernews': { weight: 10 }    // 10% Hacker News
};

// Helper to get a random integer in a range
const getRandomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Helper function to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

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
      ['science', 'history', 'technology', 'art', 'nature', 'space', 'culture', 
       'innovation', 'business', 'health', 'education', 'travel'];
    
    // Select a random query if searchQuery not provided
    const query = searchQuery || queries[Math.floor(Math.random() * queries.length)];
    
    // Balanced source distribution with higher article counts per source
    const sourceDistribution: Partial<Record<ContentSource, number>> = {
      wikipedia: Math.ceil(count * 0.5),  // 50% Wikipedia
      wikievents: Math.ceil(count * 0.05), // 5% Wiki Events
      hackernews: Math.ceil(count * 0.1),  // 10% Hacker News
      reddit: Math.ceil(count * 0.2),      // 20% Reddit
      onthisday: Math.ceil(count * 0.05),  // 5% On This Day
      oksurf: Math.ceil(count * 0.1)       // 10% OK Surf
    };
    
    // Fetch the articles using our direct API approach with increased counts
    const articles = await fetchMultiSourceArticles(sourceDistribution, query);
    
    // Optimize the images - convert to WebP
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
  
  // Keep track of article IDs to prevent duplicates on refresh
  const seenArticleIds = useRef<Set<number>>(new Set());
  
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
  
  // Helper to filter out previously seen articles
  const filterOutSeenArticles = useCallback((newArticles: WikipediaArticle[], seenIds: Set<number>) => {
    return newArticles.filter(article => {
      if (!article.pageid) return false;
      
      // Check if we've already seen this article
      if (seenIds.has(article.pageid)) {
        console.log(`Filtering out duplicate article: ${article.title}`);
        return false;
      }
      
      // Add to seen set and return true to keep the article
      seenIds.add(article.pageid);
      return true;
    });
  }, []);

  // Load initial articles
  useEffect(() => {
    const loadInitialArticles = async () => {
      try {
        setLoading(true);
        console.log('Loading initial articles...');
        
        // Try to load from cache first
        const cachedArticles = loadArticlesFromCache();
        
        if (cachedArticles.length >= initialCount) {
          console.log(`Loaded ${cachedArticles.length} articles from cache`);
          
          // Add all cached article IDs to seen set to avoid duplicates
          cachedArticles.forEach(article => {
            if (article.pageid) {
              seenArticleIds.current.add(article.pageid);
            }
          });
          
          setArticles(cachedArticles);
          updateSourceCounts(cachedArticles);
          setInitialLoadComplete(true);
          setLoading(false);
          
          // Load more content in the background to refresh cache
          setTimeout(() => {
            refreshArticles();
          }, 2000);
          
          return;
        }
        
        // Otherwise load from API
        await refreshArticles();
      } catch (error) {
        console.error('Error loading initial articles:', error);
        setError('Failed to load articles. Please try again later.');
        setLoading(false);
      }
    };
    
    loadInitialArticles();
  }, [initialCount, loadArticlesFromCache, updateSourceCounts]);

  // Refresh articles function - completely replaces current articles
  const refreshArticles = async () => {
    try {
      console.log('Refreshing articles...');
      
      // Track refresh time to prevent excessive refreshes
      const now = Date.now();
      if (now - lastRefreshTime.current < 5000) {
        console.log('Refresh called too frequently, ignoring');
        return;
      }
      lastRefreshTime.current = now;
      
      // Generate diverse topics as requested for better quality content
      const topicsByCategory = {
        technology: ['technology', 'software', 'artificial intelligence', 'programming', 'gadgets', 'innovation'],
        politics: ['politics', 'government', 'democracy', 'diplomacy', 'elections'],
        entertainment: ['films', 'movies', 'music', 'celebrities', 'television', 'streaming'],
        food: ['cuisine', 'cooking', 'recipes', 'restaurants', 'food culture', 'gastronomy'],
        travel: ['travel destinations', 'tourism', 'adventure', 'countries', 'landmarks'],
        science: ['science', 'biology', 'physics', 'astronomy', 'chemistry', 'research'],
        history: ['history', 'historical events', 'ancient civilizations', 'world war', 'archaeology'],
        currentEvents: ['current events', 'trending', 'news', 'latest developments']
      };
      
      // Create a flattened list of all topics
      const allTopics = Object.values(topicsByCategory).flat();
      
      // Shuffle all topics
      const shuffledTopics = [...allTopics].sort(() => Math.random() - 0.5);
      
      // Select topics, ensuring at least one from each major category
      const selectedTopics: string[] = [];
      
      // First select one topic from each major category
      Object.keys(topicsByCategory).forEach(category => {
        const categoryTopics = topicsByCategory[category as keyof typeof topicsByCategory];
        // Select a random topic from this category
        const randomIndex = Math.floor(Math.random() * categoryTopics.length);
        selectedTopics.push(categoryTopics[randomIndex]);
      });
      
      // Then add more from the shuffled list to reach 10 total
      const additionalTopics = shuffledTopics.filter(topic => !selectedTopics.includes(topic));
      selectedTopics.push(...additionalTopics.slice(0, 5));
      
      // List of inappropriate terms to filter out
      const inappropriateTerms = [
        'explicit', 'vulgar', 'pornography', 'xxx', 'adult content',
        'nsfw', 'nudity', 'erotic', 'sexual', 'obscene'
      ];
      
      // Track fetching state
      setLoading(true);
      
      // Balance sources - more Wikipedia, Hacker News, and Reddit
      // Less On This Day and OK Surf
      const sourceRequests: Partial<Record<ContentSource, number>> = {
        wikipedia: 10,
        wikievents: 2,
        hackernews: 6,
        reddit: 6,
        onthisday: 2,
        oksurf: 2
      };
      
      // Create an array to hold all the new articles
      let allNewArticles: WikipediaArticle[] = [];
      
      // Fetch articles for selected topics in parallel
      const topicPromises = selectedTopics.map(topic => 
        fetchMultiSourceArticles(sourceRequests, topic)
      );
      
      const topicResults = await Promise.all(topicPromises);
      
      // Combine all results
      topicResults.forEach(articles => {
        allNewArticles = [...allNewArticles, ...articles];
      });
      
      // Filter out inappropriate content
      allNewArticles = allNewArticles.filter(article => {
        const content = `${article.title} ${article.extract} ${article.description || ''}`.toLowerCase();
        
        // Check if article contains inappropriate terms
        const hasInappropriateContent = inappropriateTerms.some(term => 
          content.includes(term.toLowerCase())
        );
        
        return !hasInappropriateContent;
      });
      
      // Filter out articles without valid images or with low-quality content
      allNewArticles = allNewArticles.filter(article => {
        // Must have thumbnail and extract
        if (!article.thumbnail || !article.thumbnail.source || !article.extract) {
          return false;
        }
        
        // Extract must have meaningful content (not too short)
        if (article.extract.length < 100) {
          return false;
        }
        
        return true;
      });
      
      // Shuffle the combined articles
      allNewArticles = shuffleArray(allNewArticles);
      
      // Filter out any duplicates or already seen articles
      const uniqueArticles = filterOutSeenArticles(allNewArticles, seenArticleIds.current);
      
      // Only take the first 24 articles (or however many we have)
      const finalArticles = uniqueArticles.slice(0, 30); // Increased from 24 to 30 for more variety
      
      // Update sources distribution for analytics
      updateSourceCounts(finalArticles);
      
      // Update article state with new articles 
      setArticles(finalArticles);
      
      // Cache the articles for future sessions
      saveArticlesToCache(finalArticles);
      
      console.log(`Refreshed with ${finalArticles.length} new unique articles`);
      setInitialLoadComplete(true);
    } catch (err) {
      console.error('Error refreshing articles:', err);
      setError('Failed to refresh articles. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Load more articles in the background
  const loadMoreArticlesInBackground = async (count: number = 10) => {
    if (isLoadingBackground) return; // Prevent parallel execution
    
    console.log('Loading more articles in the background...');
    setIsLoadingBackground(true);
    
    try {
      // Select diverse topics to ensure better article quality and variety
      // Get random topics from each major category
      const categories = [
        'technology', 'politics', 'entertainment', 'food', 
        'travel', 'science', 'history', 'current events'
      ];
      
      // Select 3 random categories
      const selectedCategories = shuffleArray([...categories]).slice(0, 3);
      
      // List of inappropriate terms to filter out
      const inappropriateTerms = [
        'explicit', 'vulgar', 'pornography', 'xxx', 'adult content',
        'nsfw', 'nudity', 'erotic', 'sexual', 'obscene'
      ];
      
      // Use a mix of sources to improve content variety
      const sourceRequests: Partial<Record<ContentSource, number>> = {
        wikipedia: Math.ceil(count * 0.5),  // 50% Wikipedia
        reddit: Math.ceil(count * 0.2),     // 20% Reddit
        hackernews: Math.ceil(count * 0.1), // 10% Hacker News
        wikievents: Math.ceil(count * 0.05),// 5% Wiki Events
        onthisday: Math.ceil(count * 0.05), // 5% On This Day
        oksurf: Math.ceil(count * 0.1)      // 10% OK Surf
      };
      
      // Fetch from multiple sources in parallel with different topics
      const newArticlesBatches = await Promise.all(
        selectedCategories.map(category => fetchMultiSourceArticles(sourceRequests, category))
      );
      
      // Flatten and shuffle the batches
      let newArticles = shuffleArray(newArticlesBatches.flat());
      
      // Filter out inappropriate content
      newArticles = newArticles.filter(article => {
        const content = `${article.title} ${article.extract} ${article.description || ''}`.toLowerCase();
        
        // Check if article contains inappropriate terms
        const hasInappropriateContent = inappropriateTerms.some(term => 
          content.includes(term.toLowerCase())
        );
        
        return !hasInappropriateContent;
      });
      
      // Filter out articles without valid images or with low-quality content
      newArticles = newArticles.filter(article => {
        // Must have thumbnail and extract
        if (!article.thumbnail || !article.thumbnail.source || !article.extract) {
          return false;
        }
        
        // Extract must have meaningful content (not too short)
        if (article.extract.length < 100) {
          return false;
        }
        
        return true;
      });
      
      // Filter out duplicates using the seenArticleIds set
      const uniqueArticles = filterOutSeenArticles(newArticles, seenArticleIds.current);
      
      // If we got enough articles, add them to the state
      if (uniqueArticles.length > 0) {
        console.log(`Adding ${uniqueArticles.length} new articles to state`);
        
        // Update articles state with new articles
        setArticles(prev => [...prev, ...uniqueArticles]);
        
        // Cache these articles too
        saveArticlesToCache(uniqueArticles);
        
        // Update source distribution for analytics
        updateSourceCounts([...articles, ...uniqueArticles]);
      } else {
        console.log('No new articles found, trying again with different query');
        
        // Try one more time with a different topic
        const fallbackTopics = ['trending', 'popular', 'interesting', 'facts', 'discoveries'];
        const randomTopic = fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)];
        
        const fallbackArticles = await fetchMultiSourceArticles({
          wikipedia: count,
          reddit: Math.ceil(count / 2),
          hackernews: Math.ceil(count / 2)
        }, randomTopic);
        
        // Filter out duplicates
        const uniqueFallbackArticles = filterOutSeenArticles(fallbackArticles, seenArticleIds.current);
        
        if (uniqueFallbackArticles.length > 0) {
          console.log(`Adding ${uniqueFallbackArticles.length} new fallback articles`);
          
          setArticles(prev => [...prev, ...uniqueFallbackArticles]);
          saveArticlesToCache(uniqueFallbackArticles);
          updateSourceCounts([...articles, ...uniqueFallbackArticles]);
        } else {
          console.log('Failed to find new articles in fallback attempt');
        }
      }
    } catch (error) {
      console.error('Error loading more articles:', error);
    } finally {
      // Reset loading state
      setIsLoadingBackground(false);
    }
  };

  return {
    articles,
    loading,
    error,
    refreshArticles,
    loadMoreArticlesInBackground,
    loadMoreArticles: loadMoreArticlesInBackground
  };
}; 