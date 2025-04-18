import axios from 'axios';
import { WikipediaArticle, ContentSource, ArticleSource } from '../types';
import { CACHE_DURATIONS, API_CONFIG, FEATURES } from '../config';

/**
 * Additional Free Wiki-like and Knowledge API Sources:
 * 
 * 1. Wikimedia REST API - More comprehensive Wikipedia/Wikimedia data
 *    - Endpoint: https://en.wikipedia.org/api/rest_v1/
 *    - Features: Page summaries, mobile-optimized content, page metadata
 *    - No auth required, completely free
 * 
 * 2. Wikidata API - Structured data behind Wikipedia
 *    - Endpoint: https://www.wikidata.org/w/api.php
 *    - Features: Entity data, structured relationships, multilingual support
 *    - Access to 100+ million items linked to Wikipedia articles
 *    - No auth required, completely free
 * 
 * 3. Wikiquote API - Access to quotes collection
 *    - Endpoint: https://en.wikiquote.org/w/api.php
 *    - Features: Famous quotes by topic, person, work
 *    - No auth required, completely free
 * 
 * 4. The Internet Archive Availability API
 *    - Endpoint: https://archive.org/services/context/availability
 *    - Features: Historical web pages, books, audio recordings
 *    - No auth required for basic usage
 * 
 * 5. Open Library API - Book information
 *    - Endpoint: https://openlibrary.org/developers/api
 *    - Features: Book metadata, cover images, author information
 *    - No auth required, completely free
 * 
 * 6. Europeana API - Cultural heritage collections
 *    - Endpoint: https://pro.europeana.eu/page/apis
 *    - Features: Historical artifacts, art, books from European institutions
 *    - Requires API key but free to obtain
 * 
 * 7. Digital Public Library of America API
 *    - Endpoint: https://pro.dp.la/developers/api-codex
 *    - Features: Historical/cultural material from US libraries, archives, museums
 *    - Requires API key but free to obtain
 * 
 * 8. Library of Congress API
 *    - Endpoint: https://www.loc.gov/apis/
 *    - Features: Historical documents, photos, books from US history
 *    - No auth required, completely free
 */

// Utility to shuffle an array (Fisher-Yates algorithm)
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Cache for API responses
interface Cache {
  timestamp: number;
  data: any;
}

const cache: Record<string, Cache> = {};

// Check if cache is valid (not expired)
const isCacheValid = (cacheKey: string): boolean => {
  if (!FEATURES.USE_CACHE) return false;
  
  const cacheItem = cache[cacheKey];
  if (!cacheItem) return false;
  
  const now = Date.now();
  // Use appropriate cache duration based on the type of content
  let cacheDuration = CACHE_DURATIONS.ARTICLES;
  
  if (cacheKey.includes('podcast')) {
    cacheDuration = CACHE_DURATIONS.PODCASTS;
  } else if (cacheKey.includes('image') || cacheKey.includes('media')) {
    cacheDuration = CACHE_DURATIONS.IMAGES;
  }
  
  return now - cacheItem.timestamp < cacheDuration;
};

// Get data from cache if valid, or fetch from API
const getFromCacheOrFetch = async (cacheKey: string, fetchFn: () => Promise<any>): Promise<any> => {
  if (isCacheValid(cacheKey)) {
    console.log(`Using cached data for ${cacheKey}`);
    return cache[cacheKey].data;
  }
  
  console.log(`Fetching fresh data for ${cacheKey}`);
  const data = await fetchFn();
  
  // Update cache
  cache[cacheKey] = {
    timestamp: Date.now(),
    data
  };
  
  return data;
};

// Utility function to get high-resolution version of images
export const getHighResImage = (thumbnail: any): any => {
  if (!thumbnail || !thumbnail.source) return thumbnail;
  
  try {
    const imgSrc = thumbnail.source;
    let newSrc = imgSrc;
    let width = thumbnail.width;
    let height = thumbnail.height;

    // Handle Wikipedia thumbnail URLs - convert /thumb/ to full resolution
    if (imgSrc.includes('/thumb/') && (imgSrc.includes('wikipedia.org') || imgSrc.includes('wikimedia.org'))) {
      // Get full resolution image by removing thumbnail size constraint
      newSrc = imgSrc.replace(/\/thumb\//, '/').split('/').slice(0, -1).join('/');
      
      // If image is already big enough, keep it as is
      if (width && width >= 800) {
        return thumbnail;
      }
      
      // Set larger dimensions for the full-size image
      width = width ? width * 2 : 800;
      height = height ? height * 2 : 1200;
    }
    
    // Handle direct Wikimedia Commons URLs
    else if (imgSrc.includes('wikimedia.org')) {
      // If URL contains a size parameter like /300px-
      if (imgSrc.match(/\/\d+px-/)) {
        // Replace with larger size, targeting 800px minimum
        newSrc = imgSrc.replace(/\/\d+px-/, '/800px-');
        width = 800;
        // Calculate height proportionally if we have original dimensions
        if (width && height) {
          const ratio = height / width;
          height = Math.round(800 * ratio);
        } else {
          height = 1200; // Default tall rectangle
        }
      }
    }
    
    // Handle iTunes artwork URLs - upgrade to highest resolution
    else if (imgSrc.includes('mzstatic.com')) {
      // iTunes artwork often has dimensions in URL (e.g., 100x100)
      newSrc = imgSrc.replace(/\/\d+x\d+/, '/1200x1200');
      width = 1200;
      height = 1200;
    }
    
    // Handle imgur thumbnail URLs
    else if (imgSrc.includes('imgur.com')) {
      // Replace thumbnail suffixes with originals
      if (imgSrc.includes('_d.') || imgSrc.includes('_t.') || imgSrc.includes('_m.') || imgSrc.includes('_l.')) {
        newSrc = imgSrc.replace(/(_[a-z])\.(jpg|png|gif)/i, '.$2');
        width = width ? width * 2 : 800;
        height = height ? height * 2 : 800;
      }
    }
    
    // Handle Reddit-specific resized images
    else if (imgSrc.includes('external-preview.redd.it') || imgSrc.includes('preview.redd.it')) {
      // Reddit image previews often have width/compressions in URL params
      newSrc = imgSrc.split('?')[0];
      width = width ? width * 2 : 800;
      height = height ? height * 2 : 800;
    }
    
    // Return the enhanced image object
    return {
      ...thumbnail,
      source: newSrc,
      width: width || thumbnail.width,
      height: height || thumbnail.height
    };
  } catch (error) {
    console.error('Error converting thumbnail to high-res:', error);
  }
  
  return thumbnail;
};

// ========== WIKIPEDIA API ==========
export async function fetchRandomWikipediaArticle(): Promise<WikipediaArticle> {
  const cacheKey = 'wikipedia_random';
  
  const fetchFn = async () => {
    try {
      // Try to load from static data first
      try {
        // Use axios to load the static data file
        const staticResponse = await axios.get('/data/wiki.json');
        const staticData = staticResponse.data;
        if (staticData && staticData.articles && staticData.articles.length > 0) {
          // Get a random article from the static data
          const randomArticle = staticData.articles[Math.floor(Math.random() * staticData.articles.length)];
          console.log('Using static Wikipedia article data');
          return randomArticle;
        }
      } catch (staticError) {
        console.log('No static data available, falling back to API');
      }
      
      // Use the official Wikipedia API for random article with optimal thumbnail size
      // balancing quality and performance
      const response = await axios.get('https://en.wikipedia.org/api/rest_v1/page/random/summary', {
        params: {
          redirect: false,
          thumbsize: 800  // Reduced from 1600 to 800 for better performance while maintaining quality
        }
      });
      
      const data = response.data;
      
      // Skip articles without thumbnails or with poor quality content
      if (!data.thumbnail || 
          !data.thumbnail.source || 
          data.thumbnail.source.includes("question") || 
          (data.thumbnail.width && data.thumbnail.width < 400) ||
          !data.extract ||
          data.extract.length < 100) {
        // Try again recursively until we find a good article
        console.log('Skipping article with low quality content, trying again');
        return fetchRandomWikipediaArticle();
      }
      
      // Convert thumbnail to high-res (but don't go overboard)
      const highResThumbnail = getHighResImage(data.thumbnail);
      
      return {
        pageid: data.pageid,
        title: data.title || data.displaytitle,
        extract: data.extract,
        extract_html: data.extract_html,
        thumbnail: highResThumbnail,
        description: data.description,
        url: data.content_urls?.desktop?.page,
        source: 'wikipedia' as ContentSource
      };
    } catch (error) {
      console.error('Error fetching random Wikipedia article:', error);
      throw error;
    }
  };
  
  // Don't cache random articles - we want a new one each time
  return fetchFn();
}

export async function fetchRandomArticles(count: number = 10): Promise<WikipediaArticle[]> {
  try {
    // Increase buffer size to have more articles ready
    const requestCount = Math.ceil(count * 2); // Request double to ensure enough good quality ones
    
    // Fetch articles in parallel
    const articles: WikipediaArticle[] = [];
    const promises = Array(requestCount).fill(null).map(() => fetchRandomWikipediaArticle());
    const results = await Promise.all(promises);
    
    // Add to the articles array
    articles.push(...results);
    
    // Apply quality filtering to ensure we get the best articles
    const highQualityArticles = filterHighQualityArticles(articles);
    
    // If we have more articles than requested after filtering, return only what was asked for
    if (highQualityArticles.length > count) {
      const slicedArticles = highQualityArticles.slice(0, count);
      
      // Preload images for smoother scrolling
      preloadArticleImages(slicedArticles);
      
      // Buffer the next set of articles in the background
      if (highQualityArticles.length > count + 10) {
        // We already have a good buffer
      } else {
        setTimeout(() => {
          console.log('Prefetching more articles in the background');
          fetchRandomArticles(10).catch(err => console.error('Error prefetching articles:', err));
        }, 2000);
      }
      
      return slicedArticles;
    }
    
    // Preload images for the articles we're returning
    preloadArticleImages(highQualityArticles);
    
    // Otherwise return all high quality articles we found
    return highQualityArticles;
  } catch (error) {
    console.error('Error fetching random articles:', error);
    throw error;
  }
}

// Helper function to preload article images
function preloadArticleImages(articles: WikipediaArticle[]) {
  articles.forEach(article => {
    if (article.thumbnail?.source) {
      const img = new Image();
      img.src = article.thumbnail.source;
    }
  });
}

export async function fetchArticlesBySearch(searchTerm: string): Promise<WikipediaArticle[]> {
  try {
    const cacheKey = `wikipedia_search_${searchTerm}`;
    
    const fetchFn = async () => {
      const searchResponse = await axios.get(`https://en.wikipedia.org/w/api.php`, {
        params: {
          action: 'query',
          list: 'search',
          srsearch: searchTerm,
          format: 'json',
          origin: '*',
          srlimit: 20 // Request more to filter for quality
        }
      });
      
      const searchResults = searchResponse.data.query.search;
      
      // Fetch full data for each search result
      const articlePromises = searchResults.map(async (result: any) => {
        try {
          const titleParam = encodeURIComponent(result.title);
          const response = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${titleParam}`, {
            params: {
              redirect: false,
              thumbsize: 800 // Reduced from 1600 to 800 for better performance while maintaining quality
            }
          });
          
          const data = response.data;
          
          // Skip articles without thumbnails or with poor quality content
          if (!data.thumbnail || 
              !data.thumbnail.source || 
              data.thumbnail.source.includes("question") || 
              (data.thumbnail.width && data.thumbnail.width < 400) ||
              !data.extract ||
              data.extract.length < 100) {
            return null;
          }
          
          // Use utility to convert thumbnail to high-res
          const highResThumbnail = getHighResImage(data.thumbnail);
          
          return {
            pageid: data.pageid,
            title: data.title || data.displaytitle,
            extract: data.extract,
            thumbnail: highResThumbnail,
            description: data.description,
            url: data.content_urls?.desktop?.page,
            source: 'wikipedia' as ContentSource
          };
        } catch (error) {
          console.error(`Error fetching article data for ${result.title}:`, error);
          return null;
        }
      });
      
      // Wait for all article data to be fetched
      const articles = await Promise.all(articlePromises);
      
      // Filter out any null results
      const validArticles = articles.filter(article => article !== null);
      
      // Preload images for smoother experience
      preloadArticleImages(validArticles);
      
      return validArticles;
    };
    
    return await getFromCacheOrFetch(cacheKey, fetchFn);
  } catch (error) {
    console.error('Error in fetchArticlesBySearch:', error);
    throw error;
  }
}

// Validate if a topic returns any results
export async function validateTopic(topic: string): Promise<boolean> {
  try {
    const articles = await fetchArticlesBySearch(topic);
    return articles.length > 0;
  } catch (error) {
    console.error(`Error validating topic ${topic}:`, error);
    return false;
  }
}

// ========== ON THIS DAY API ==========
export async function fetchOnThisDayEvents(count: number = 5): Promise<WikipediaArticle[]> {
  const today = new Date();
  const month = today.getMonth() + 1; // getMonth() is 0-indexed
  const day = today.getDate();
  const formattedDate = `${month}/${day}`;
  
  const cacheKey = `onthisday_${formattedDate}`;
  
  const fetchFn = async () => {
    try {
      const response = await axios.get(`https://byabbe.se/on-this-day/${month}/${day}/events.json`);
      const events = response.data.events;
      
      // Shuffle and take a subset of events
      const shuffledEvents = events.sort(() => 0.5 - Math.random()).slice(0, count);
      
      // Convert to WikipediaArticle format
      return shuffledEvents.map((event: any) => {
        // Create a unique ID for the event
        const eventId = parseInt(`${month}${day}${event.year}`.padEnd(10, '0'));
        
        return {
          pageid: eventId,
          title: `${event.year}: Historical Event`,
          extract: event.description,
          description: `On ${formattedDate}, in the year ${event.year}`,
          year: event.year,
          date: formattedDate,
          source: 'onthisday' as ContentSource,
          // No thumbnail by default, will use a fallback in the UI
        };
      });
    } catch (error) {
      console.error('Error fetching On This Day events:', error);
      throw error;
    }
  };
  
  return await getFromCacheOrFetch(cacheKey, fetchFn);
}

// ========== HACKER NEWS API ==========
export async function fetchHackerNewsStories(count: number = 5): Promise<WikipediaArticle[]> {
  const cacheKey = 'hackernews_top';
  
  const fetchFn = async () => {
    try {
      console.log("Fetching HackerNews stories, requested count:", count);
      
      // Fetch top story IDs - use more resilient endpoints
      const topStoriesEndpoints = [
        'https://hacker-news.firebaseio.com/v0/topstories.json',
        'https://hacker-news.firebaseio.com/v0/beststories.json',
        'https://hacker-news.firebaseio.com/v0/newstories.json'
      ];
      
      // Try multiple endpoints in order until one succeeds
      let storyIds: number[] = [];
      let storiesResponse = null;
      
      for (const endpoint of topStoriesEndpoints) {
        try {
          storiesResponse = await axios.get(endpoint, { timeout: 5000 });
          if (storiesResponse.data && Array.isArray(storiesResponse.data) && storiesResponse.data.length > 0) {
            storyIds = storiesResponse.data.slice(0, count * 3); // Fetch more than needed in case some fail
            console.log(`Successfully fetched ${storyIds.length} HackerNews story IDs from ${endpoint}`);
            break;
          }
        } catch (err) {
          console.error(`Failed to fetch story IDs from ${endpoint}:`, err);
          // Continue to next endpoint
        }
      }
      
      if (storyIds.length === 0) {
        console.error("Failed to fetch any HackerNews story IDs from all endpoints");
        // Return mock data as fallback
        return createMockHackerNewsStories(count);
      }
      
      // Fetch details for each story in parallel with timeouts
      const storyPromises = storyIds.map(async (id: number) => {
        try {
          const response = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 
                                        { timeout: 3000 });
          const story = response.data;
          
          // Skip jobs, polls, etc. or any story without needed data
          if (!story || !story.title || (!story.url && !story.text)) {
            return null;
          }
          
          return {
            pageid: story.id,
            title: story.title,
            extract: story.text || `${story.score} points | ${story.descendants || 0} comments`,
            url: story.url,
            description: `Posted by ${story.by}`,
            source: 'hackernews' as ContentSource,
            // No thumbnail by default
          };
        } catch (error) {
          console.error(`Error fetching HN story ${id}:`, error);
          return null;
        }
      });
      
      // Wait for all stories with a reasonable overall timeout
      const stories = await Promise.all(storyPromises);
      
      // Filter nulls and limit to requested count
      const validStories = stories.filter(story => story !== null);
      console.log(`Successfully fetched ${validStories.length} valid HackerNews stories`);
      
      if (validStories.length === 0) {
        return createMockHackerNewsStories(count);
      }
      
      return validStories.slice(0, count);
    } catch (error) {
      console.error('Error in fetchHackerNewsStories:', error);
      return createMockHackerNewsStories(count);
    }
  };
  
  return await getFromCacheOrFetch(cacheKey, fetchFn);
}

// Fallback data for HackerNews in case the API is down
function createMockHackerNewsStories(count: number): WikipediaArticle[] {
  console.log("Creating mock HackerNews stories:", count);
  
  const mockStories = [
    {
      pageid: 36983293,
      title: "Building a Keyboard from Scratch",
      extract: "A detailed guide on building a mechanical keyboard from individual components, including PCB design, firmware, and case manufacturing.",
      url: "https://example.com/keyboard-guide",
      description: "Posted by keyboard_enthusiast",
      source: 'hackernews' as ContentSource
    },
    {
      pageid: 36983294,
      title: "The Future of Web Browsers",
      extract: "An analysis of upcoming web standards and how they will impact browser technology in the next five years.",
      url: "https://example.com/future-browsers",
      description: "Posted by web_standards",
      source: 'hackernews' as ContentSource
    },
    {
      pageid: 36983295,
      title: "Machine Learning for Image Recognition: A Comprehensive Guide",
      extract: "Walkthrough of building an image recognition system from scratch using modern ML techniques.",
      url: "https://example.com/ml-image-guide",
      description: "Posted by deeplearning_researcher",
      source: 'hackernews' as ContentSource
    },
    {
      pageid: 36983296,
      title: "The Principles of Good API Design",
      extract: "Exploring the key principles behind successful and developer-friendly API design.",
      url: "https://example.com/api-design",
      description: "Posted by backend_developer",
      source: 'hackernews' as ContentSource
    },
    {
      pageid: 36983297,
      title: "Optimizing Docker Containers for Production",
      extract: "Best practices for configuring and optimizing Docker containers in high-scale production environments.",
      url: "https://example.com/docker-optimization",
      description: "Posted by devops_engineer",
      source: 'hackernews' as ContentSource
    }
  ];
  
  // Return a slice of the mock data up to the requested count
  return mockStories.slice(0, count);
}

// ========== OK.SURF NEWS API ==========
export async function fetchOkSurfNews(count: number = 5): Promise<WikipediaArticle[]> {
  const cacheKey = 'oksurf_news';
  
  const fetchFn = async () => {
    try {
      // Note: OK.Surf doesn't have a public API, so we're mocking this data
      // In a real app, you would integrate with their actual API
      const mockResponse = [
        {
          id: 1001,
          title: "AI Model Breaks New Record in Scientific Discovery",
          summary: "A new AI model has accelerated scientific research by predicting molecular structures with unprecedented accuracy.",
          image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8M3x8YWklMjBzY2llbmNlfGVufDB8fDB8fA%3D%3D&auto=format&fit=crop&w=800&q=60"
        },
        {
          id: 1002,
          title: "Breakthrough in Quantum Computing Announced",
          summary: "Researchers have achieved quantum supremacy with a new 1000-qubit processor that solves problems previously thought impossible.",
          image: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8cXVhbnR1bXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60"
        },
        {
          id: 1003,
          title: "New Sustainable Material Could Replace Plastic",
          summary: "Scientists have developed a biodegradable material with properties similar to plastic but that breaks down completely in weeks.",
          image: "https://images.unsplash.com/photo-1605600659453-128bfdb251a8?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Nnx8c3VzdGFpbmFibGV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60"
        },
        {
          id: 1004,
          title: "Tech Company Launches Revolutionary AR Glasses",
          summary: "The sleek AR glasses promise to blend digital information seamlessly with the real world, bringing sci-fi to life.",
          image: "https://images.unsplash.com/photo-1478416272538-5f7e51dc5400?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8YXVnbWVudGVkJTIwcmVhbGl0eXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60"
        },
        {
          id: 1005,
          title: "Global Climate Initiative Exceeds CO2 Reduction Goals",
          summary: "The multinational climate alliance announced it has reduced carbon emissions by 15% more than projected for this year.",
          image: "https://images.unsplash.com/photo-1535016120720-40c646be5580?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8NXx8Y2xpbWF0ZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60"
        },
        {
          id: 1006,
          title: "Pioneering Study Reveals Key to Extended Human Lifespan",
          summary: "A landmark 30-year study has identified specific lifestyle factors that could extend human life expectancy by up to 15 years.",
          image: "https://images.unsplash.com/photo-1559598467-f8b76c8155d0?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8OHx8aGVhbHRoeSUyMGFnaW5nfGVufDB8fDB8fA%3D%3D&auto=format&fit=crop&w=800&q=60"
        },
        {
          id: 1007,
          title: "Space Tourism Becomes Reality for Average Consumers",
          summary: "The first commercial space hotel has announced plans to open by 2028, with reservation prices dropping below $50,000 per night.",
          image: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MXx8c3BhY2V8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60"
        },
        {
          id: 1008,
          title: "Revolutionary Battery Technology Powers Phone for a Week",
          summary: "New solid-state battery technology promises to extend smartphone battery life to over a week on a single charge.",
          image: "https://images.unsplash.com/photo-1601706354997-701e911ac734?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8M3x8YmF0dGVyeXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60"
        }
      ];
      
      // Shuffle and slice to get requested count
      const shuffled = mockResponse.sort(() => 0.5 - Math.random()).slice(0, count);
      
      // Convert to WikipediaArticle format
      return shuffled.map(item => ({
        pageid: item.id,
        title: item.title,
        extract: item.summary,
        thumbnail: item.image ? {
          // Get highest quality version by removing size parameters
          source: item.image.replace(/[?&](w|h|width|height|size|quality|resize)=[^&]+/g, '')
                            .replace(/\?$/, '')
        } : undefined,
        description: "Trending search from Google",
        source: 'oksurf' as ContentSource
      }));
    } catch (error) {
      console.error('Error fetching OK.Surf news:', error);
      throw error;
    }
  };
  
  return await getFromCacheOrFetch(cacheKey, fetchFn);
}

// ========== REDDIT API ==========
export async function fetchRedditPosts(count: number = 5): Promise<WikipediaArticle[]> {
  const cacheKey = `reddit_top_${count}`;

  const fetchFn = async () => {
    try {
      // Use the Reddit JSON API - Pull from multiple subreddits for variety
      const subreddits = ['todayilearned', 'science', 'worldnews', 'explainlikeimfive', 'history'];
      const randomSubreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
      
      console.log(`Fetching Reddit posts from r/${randomSubreddit}`);
      
      const response = await axios.get(`https://www.reddit.com/r/${randomSubreddit}/top.json`, {
        params: {
          limit: count * 2, // Fetch more than needed to account for filtering
          t: 'day' // Time filter: today's top posts
        }
      });
      
      if (!response.data?.data?.children) {
        console.error('Invalid Reddit API response:', response.data);
        return [];
      }
      
      const posts = response.data.data.children;
      console.log(`Received ${posts.length} posts from Reddit`);
      
      // Convert Reddit posts to WikipediaArticle format
      const articles: WikipediaArticle[] = posts
        .filter((post: any) => {
          // We'll accept posts even without selftext
          return post.data && post.data.title && !post.data.stickied && !post.data.over_18;
        })
        .slice(0, count)
        .map((post: any) => {
          const data = post.data;
          
          // Generate a unique pageid based on the Reddit post ID
          const pageid = parseInt(data.id, 36) % 100000000;
          
          // Extract content - either selftext or the post URL's title
          const extract = data.selftext || data.title;
          
          // Get the best available thumbnail
          let thumbnail = undefined;
          if (data.preview?.images?.[0]?.source?.url) {
            try {
              // Get the highest resolution from preview source - this is better than thumbnail
              const imageUrl = data.preview.images[0].source.url.replace(/&amp;/g, '&');
              thumbnail = { source: imageUrl };
            } catch (e) {
              // If preview parsing fails, try fallback
              if (data.thumbnail && data.thumbnail !== 'self' && data.thumbnail !== 'default' && data.thumbnail !== 'nsfw') {
                thumbnail = { source: data.thumbnail };
              }
            }
          } else if (data.thumbnail && data.thumbnail !== 'self' && data.thumbnail !== 'default' && data.thumbnail !== 'nsfw') {
            thumbnail = { source: data.thumbnail };
          }
          
          return {
            pageid,
            title: data.title,
            extract: extract.length > 500 
              ? `${extract.substring(0, 500)}...` 
              : extract,
            extract_html: data.selftext_html,
            thumbnail,
            description: `Posted by u/${data.author} in r/${data.subreddit}`,
            url: `https://www.reddit.com${data.permalink}`,
            source: 'reddit' as ContentSource
          };
        });
      
      console.log(`Converted ${articles.length} Reddit posts to articles`);
      return articles;
    } catch (error) {
      console.error('Error fetching Reddit posts:', error);
      // Return empty array on error
      return [];
    }
  };
  
  return await getFromCacheOrFetch(cacheKey, fetchFn);
}

// ========== RSS FEEDS API ==========
export async function fetchRssFeeds(count: number = 5): Promise<WikipediaArticle[]> {
  const cacheKey = `rss_feeds_${count}`;

  const fetchFn = async () => {
    try {
      // List of diverse RSS feeds
      const rssSources = [
        { 
          url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
          name: 'BBC News'
        },
        { 
          url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
          name: 'New York Times'
        },
        { 
          url: 'https://feeds.npr.org/1001/rss.xml',
          name: 'NPR News'
        },
        {
          url: 'https://www.economist.com/science-and-technology/rss.xml',
          name: 'The Economist'
        },
        {
          url: 'https://www.wired.com/feed/rss',
          name: 'Wired'
        }
      ];
      
      // Randomly select 2 feeds
      const shuffledSources = shuffleArray(rssSources).slice(0, 2);
      console.log(`Fetching RSS feeds from: ${shuffledSources.map(s => s.name).join(', ')}`);
      
      // Use a RSS to JSON converter API
      const feedPromises = shuffledSources.map(async (source) => {
        try {
          // Use the RSS-to-JSON API to convert RSS to JSON
          const response = await axios.get(`https://api.rss2json.com/v1/api.json`, {
            params: {
              rss_url: source.url,
              api_key: 'free', // Free tier
              count: Math.ceil(count / 2)
            }
          });
          
          if (!response.data?.items || !Array.isArray(response.data.items)) {
            console.error(`Invalid RSS response for ${source.name}:`, response.data);
            return [];
          }
          
          console.log(`Received ${response.data.items.length} items from ${source.name}`);
          
          // Map items to WikipediaArticle format
          return response.data.items.map((item: any) => {
            // Generate a deterministic pageid
            const pageid = parseInt(item.guid?.replace(/\D/g, '').substring(0, 8) || Math.random().toString().slice(2), 10) || 
                          Math.floor(Math.random() * 100000000);
            
            // Extract an image if available
            let thumbnail;
            // Try multiple image sources in order of likely quality
            if (item.enclosure?.link && item.enclosure.type?.startsWith('image/')) {
              // Enclosure is often highest quality when it's an image
              thumbnail = { source: item.enclosure.link };
            } else if (item.image?.url) {
              // Some feeds provide a dedicated image field
              thumbnail = { source: item.image.url };
            } else if (item.thumbnail) {
              // Fall back to thumbnail
              thumbnail = { source: item.thumbnail };
            } else if (item.description) {
              // Try to extract image from HTML description as last resort
              try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(item.description, 'text/html');
                const firstImage = doc.querySelector('img');
                if (firstImage && firstImage.src) {
                  thumbnail = { source: firstImage.src };
                }
              } catch (e) {
                console.log('Failed to extract image from description:', e);
              }
            }
            
            // Ensure we have a title
            const title = item.title || `${source.name} article`;
            
            // Clean up the description (remove HTML tags for plain text extract)
            const cleanedDescription = item.description
              ? item.description
                .replace(/<[^>]*>/g, ' ') // Replace HTML tags with spaces
                .replace(/\s{2,}/g, ' ')  // Replace multiple spaces with single space
                .trim()
              : 'No description available';
            
            return {
              pageid,
              title,
              extract: cleanedDescription.length > 500 
                ? `${cleanedDescription.substring(0, 500)}...` 
                : cleanedDescription,
              extract_html: item.description,
              thumbnail,
              description: `From ${source.name}`,
              url: item.link,
              date: item.pubDate,
              source: 'rss' as ContentSource
            };
          });
        } catch (error) {
          console.error(`Error fetching RSS feed from ${source.name}:`, error);
          return [];
        }
      });
      
      // Wait for all feed requests to complete
      const results = await Promise.all(feedPromises);
      
      // Flatten and shuffle the results
      const articles = shuffleArray(results.flat()).slice(0, count);
      console.log(`Converted ${articles.length} RSS items to articles`);
      return articles;
    } catch (error) {
      console.error('Error fetching RSS feeds:', error);
      // Return empty array on error
      return [];
    }
  };
  
  return await getFromCacheOrFetch(cacheKey, fetchFn);
}

// ========== WIKIPEDIA CURRENT EVENTS PORTAL ==========
export async function fetchWikipediaCurrentEvents(count: number = 5): Promise<WikipediaArticle[]> {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  const cacheKey = `wikievents_${year}${month}${day}`;
  
  const fetchFn = async () => {
    try {
      // First try to fetch current events
      const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`;
      const response = await axios.get(url);
      
      if (response.data && response.data.events && response.data.events.length) {
        // Sort events by most recent year
        const sortedEvents = response.data.events.sort((a: any, b: any) => b.year - a.year);
        
        // Take the most recent events
        const recentEvents = sortedEvents.slice(0, count * 2); // Get more to filter for quality
        
        // Convert events to WikipediaArticle format
        const eventPromises = recentEvents.map(async (event: any) => {
          try {
            // Event might have pages attached, use the first one if available
            if (event.pages && event.pages.length > 0) {
              const page = event.pages[0];
              
              // Skip if no thumbnail or low quality
              if (!page.thumbnail || 
                  !page.thumbnail.source || 
                  page.thumbnail.source.includes("question") ||
                  (page.thumbnail.width && page.thumbnail.width < 400)) {
                // Try to get a better image through the REST API
                try {
                  const pageDetails = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`, {
                    params: {
                      redirect: false,
                      thumbsize: 800 // Reduced from 1600 to 800 for better performance while maintaining quality
                    }
                  });
                  
                  if (pageDetails.data && 
                      pageDetails.data.thumbnail && 
                      pageDetails.data.thumbnail.source &&
                      !pageDetails.data.thumbnail.source.includes("question") &&
                      pageDetails.data.thumbnail.width >= 400) {
                    // Use the better image
                    page.thumbnail = pageDetails.data.thumbnail;
                  } else {
                    // Skip if still no good image
                    return null;
                  }
                } catch (imageError) {
                  console.error('Error fetching better image:', imageError);
                  return null;
                }
              }
              
              // Create article from page
              return {
                pageid: page.pageid,
                title: page.title,
                extract: event.text || page.extract || `Event from ${event.year}: ${page.title}`,
                thumbnail: getHighResImage(page.thumbnail),
                description: `On ${month}/${day}, in the year ${event.year}`,
                year: event.year,
                date: `${month}/${day}`,
                source: 'wikievents' as ContentSource
              };
            } else {
              // No page attached, create generic event
              return {
                pageid: parseInt(`${month}${day}${event.year}`.padEnd(10, '0')),
                title: `${event.year}: Historical Event`,
                extract: event.text,
                description: `On ${month}/${day}, in the year ${event.year}`,
                year: event.year,
                date: `${month}/${day}`,
                source: 'wikievents' as ContentSource
              };
            }
          } catch (eventError) {
            console.error('Error processing event:', eventError);
            return null;
          }
        });
        
        // Wait for all event processing to complete
        const articles = await Promise.all(eventPromises);
        
        // Filter out nulls and limit to requested count
        const validArticles = articles.filter(article => article !== null);
        
        // Prioritize articles with thumbnails
        const withImages = validArticles.filter(article => article && article.thumbnail && article.thumbnail.source);
        
        // Preload images for smoother scrolling
        preloadArticleImages(withImages);
        
        // Add articles without thumbnails only if needed to meet count
        if (withImages.length >= count) {
          return withImages.slice(0, count);
        } else {
          const noImages = validArticles.filter(article => !article.thumbnail || !article.thumbnail.source);
          return [...withImages, ...noImages].slice(0, count);
        }
      }
      
      // Fallback to current events portal for today
      console.log('No events found for today, falling back to current events portal');
      
      try {
        // Format date for current events portal (WP:Current_events/YYYY_MM_DD)
        const portalUrl = `https://en.wikipedia.org/api/rest_v1/page/html/Portal:Current_events/${year}_${month}_${day}`;
        const portalResponse = await axios.get(portalUrl);
        
        if (portalResponse.data) {
          // Extract content from HTML
          const html = portalResponse.data;
          
          // Simple article with portal content
          return [{
            pageid: parseInt(`${year}${month}${day}`),
            title: `Current Events (${month}/${day}/${year})`,
            extract: `Current events for ${month}/${day}/${year}`,
            description: `Current events: ${month}/${day}/${year}`,
            url: `https://en.wikipedia.org/wiki/Portal:Current_events/${year}_${month}_${day}`,
            source: 'wikievents' as ContentSource
          }];
        }
      } catch (portalError) {
        console.error('Error fetching current events portal:', portalError);
        
        // Try yesterday's date as fallback
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yYear = yesterday.getFullYear();
        const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
        const yDay = String(yesterday.getDate()).padStart(2, '0');
        
        try {
          const yesterdayUrl = `https://en.wikipedia.org/api/rest_v1/page/html/Portal:Current_events/${yYear}_${yMonth}_${yDay}`;
          const yesterdayResponse = await axios.get(yesterdayUrl);
          
          if (yesterdayResponse.data) {
            return [{
              pageid: parseInt(`${yYear}${yMonth}${yDay}`),
              title: `Recent Events (${yesterday.toLocaleDateString()})`,
              extract: `Events from yesterday are being displayed because today's events aren't available yet.`,
              description: `Current events: ${yesterday.toLocaleDateString()}`,
              url: `https://en.wikipedia.org/wiki/Portal:Current_events/${year}_${month}_${day}`,
              source: 'wikievents' as ContentSource
            }];
          }
        } catch (fallbackError) {
          console.error('Error fetching fallback Wikipedia current events:', fallbackError);
        }
      }
      
      // Final fallback - return a message if all else fails
      return [{
        pageid: Math.floor(Math.random() * 100000000),
        title: `${today.toLocaleDateString()} Events`,
        extract: `We couldn't fetch today's current events. Please check Wikipedia directly.`,
        description: `Current events: ${today.toLocaleDateString()}`,
        url: `https://en.wikipedia.org/wiki/Portal:Current_events`,
        source: 'wikievents' as ContentSource
      }];
    } catch (error) {
      console.error('Error fetching Wikipedia current events:', error);
      
      // Return a fallback explanation if we couldn't fetch events
      const today = new Date();
      return [{
        pageid: Math.floor(Math.random() * 100000000),
        title: `${today.toLocaleDateString()} Events`,
        extract: `We couldn't fetch today's current events. Please check Wikipedia directly.`,
        description: `Current events: ${today.toLocaleDateString()}`,
        url: `https://en.wikipedia.org/wiki/Portal:Current_events`,
        source: 'wikievents' as ContentSource
      }];
    }
  };
  
  return await getFromCacheOrFetch(cacheKey, fetchFn);
}

// Article quality scoring - gives a score based on content quality
export const calculateArticleQualityScore = (article: WikipediaArticle): number => {
  let score = 0;
  
  // Base score from extract length (0-40 points)
  const textLength = article.extract ? article.extract.length : 0;
  score += Math.min(40, Math.floor(textLength / 100));
  
  // Has a decent title (0-10 points)
  if (article.title && article.title.length > 3) {
    score += Math.min(10, article.title.length / 3);
  }
  
  // Has a thumbnail image (0-20 points)
  if (article.thumbnail && article.thumbnail.source) {
    score += 20;
  }
  
  // Has an original image (0-10 points)
  if (article.originalimage && article.originalimage.source) {
    score += 10;
  }
  
  // New content sources have varying quality, adjust scores
  if (article.source === 'hackernews') {
    // Adjust score for Hacker News content
    // More points if it has a URL
    if (article.url) score += 10;
    
    // Penalty for very short extracts
    if (textLength < 100) score -= 10;
  } else if (article.source === 'wikievents' || article.source === 'onthisday') {
    // Wiki events should all have a year
    if (article.year) score += 10;
    
    // These articles are generally good quality
    score += 10;
  } else if (article.source === 'rss') {
    // RSS content quality varies, but usually good if long
    if (textLength > 300) score += 10;
    
    // Boost for having a URL
    if (article.url) score += 10;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
};

// Filter articles based on quality score
export const filterHighQualityArticles = (articles: WikipediaArticle[], minQualityScore: number = 40): WikipediaArticle[] => {
  if (!articles || !Array.isArray(articles)) return articles;
  
  // Calculate scores for all articles
  const articlesWithScores = articles.map(article => ({
    article,
    score: calculateArticleQualityScore(article)
  }));
  
  // Log detailed quality information for debugging
  console.log("Article quality scores:", articlesWithScores.map(item => ({
    title: item.article.title.substring(0, 30),
    source: item.article.source,
    score: item.score,
    hasImage: !!item.article.thumbnail?.source,
    imageWidth: item.article.thumbnail?.width
  })));
  
  // Filter to only high-quality articles
  const highQualityArticles = articlesWithScores
    .filter(item => item.score >= minQualityScore)
    .map(item => item.article);
  
  console.log(`After filtering by score ≥ ${minQualityScore}: ${highQualityArticles.length}/${articles.length} articles`);
  
  // If we filtered too aggressively, return at least some articles
  if (highQualityArticles.length < articles.length * 0.3) {
    // Sort by score and take the top 40%
    const sortedArticles = articlesWithScores
      .sort((a, b) => b.score - a.score)
      .map(item => item.article);
      
    const result = sortedArticles.slice(0, Math.max(Math.ceil(articles.length * 0.4), 5));
    console.log(`Fallback to top articles: returning ${result.length}`);
    return result;
  }
  
  return highQualityArticles;
};

// ========== COMBINED API ==========
export const fetchMultiSourceArticles = async (
  sourceRequests: Partial<Record<ContentSource, number>>
): Promise<WikipediaArticle[]> => {
  console.log('Fetching articles from multiple sources:', sourceRequests);
  
  if (Object.values(sourceRequests).every(count => count === 0)) {
    console.warn('No article sources requested, returning empty array');
    return [];
  }
  
  // Keep track of source counts for debugging and balancing
  const sourceCounts: Record<string, number> = {};
  const allArticles: WikipediaArticle[] = [];
  
  // Calculate a multiplier to get the right number of articles
  // We request more than needed to account for filtering
  const totalRequested = Object.values(sourceRequests).reduce((sum, count) => sum + (count || 0), 0);
  const multiplier = Math.max(1.5, Math.min(3, 100 / totalRequested));
  
  try {
    // Start with Wikipedia sources as they're typically higher quality
    if (sourceRequests.wikipedia && sourceRequests.wikipedia > 0) {
      const count = sourceRequests.wikipedia * multiplier;
      console.log(`Requesting ${count} Wikipedia articles`);
      
      const articles = await fetchRandomArticles(count);
      allArticles.push(...articles);
      sourceCounts['wikipedia'] = articles.length;
    }
    
    // "On This Day" historical events
    if ((sourceRequests.onthisday && sourceRequests.onthisday > 0) || 
        (sourceRequests.wikievents && sourceRequests.wikievents > 0)) {
      // Combine both types of historical events
      const count = ((sourceRequests.onthisday || 0) + (sourceRequests.wikievents || 0)) * multiplier;
      console.log(`Requesting ${count} historical events`);
      
      const articles = await fetchOnThisDayEvents(count);
      allArticles.push(...articles);
      sourceCounts['onthisday'] = articles.length;
    }
    
    // Hacker News stories
    if (sourceRequests.hackernews && sourceRequests.hackernews > 0) {
      const count = sourceRequests.hackernews * multiplier;
      console.log(`Requesting ${count} Hacker News stories`);
      
      const articles = await fetchHackerNewsStories(count);
      allArticles.push(...articles);
      sourceCounts['hackernews'] = articles.length;
    }
    
    // OK.Surf trending topics
    if (sourceRequests.oksurf && sourceRequests.oksurf > 0) {
      const count = sourceRequests.oksurf * multiplier;
      console.log(`Requesting ${count} OK.Surf trending topics`);
      
      const articles = await fetchOkSurfNews(count);
      allArticles.push(...articles);
      sourceCounts['oksurf'] = articles.length;
    }
    
    // Reddit posts
    if (sourceRequests.reddit && sourceRequests.reddit > 0) {
      const count = sourceRequests.reddit * multiplier;
      console.log(`Requesting ${count} Reddit posts`);
      
      const articles = await fetchRedditPosts(count);
      allArticles.push(...articles);
      sourceCounts['reddit'] = articles.length;
    }
    
    // RSS feeds
    if (sourceRequests.rss && sourceRequests.rss > 0) {
      const count = sourceRequests.rss * multiplier;
      console.log(`Requesting ${count} RSS items`);
      
      const articles = await fetchRssFeeds(count);
      allArticles.push(...articles);
      sourceCounts['rss'] = articles.length;
    }
    
    // Wikipedia current events
    if (sourceRequests.wikievents && sourceRequests.wikievents > 0) {
      const count = sourceRequests.wikievents * multiplier;
      console.log(`Requesting ${count} Wikipedia current events`);
      
      const articles = await fetchWikipediaCurrentEvents(count);
      allArticles.push(...articles);
      sourceCounts['wikievents'] = articles.length;
    }
    
    // Log what we found
    console.log('Articles fetched by source:', sourceCounts);
    
    // Balance the sources to match the requested distribution
    return balanceSourceDistribution(allArticles, sourceRequests);
  } catch (error) {
    console.error('Error fetching multi-source articles:', error);
    return [];
  }
};

// Helper function to balance sources in the final result
const balanceSourceDistribution = (articles: WikipediaArticle[], sourceRequests: Partial<Record<ContentSource, number>>): WikipediaArticle[] => {
  // Early return if no articles or not enough to balance
  if (!articles || articles.length <= 10) return articles;
  
  // Count articles by source
  const sourceCount: Record<string, WikipediaArticle[]> = {};
  articles.forEach(article => {
    const source = article.source || 'unknown';
    if (!sourceCount[source]) {
      sourceCount[source] = [];
    }
    sourceCount[source].push(article);
  });
  
  // Calculate the target count for each source
  const totalRequired = Object.values(sourceRequests).reduce((sum, count) => sum + (count || 0), 0);
  const result: WikipediaArticle[] = [];
  
  // Determine if we have enough articles
  if (articles.length < totalRequired) {
    return articles; // Not enough to balance, return all
  }
  
  // Try to select according to requested distribution
  Object.entries(sourceRequests).forEach(([source, requestedCount]) => {
    if (!requestedCount) return;
    
    const available = sourceCount[source] || [];
    const toTake = Math.min(available.length, requestedCount);
    
    // Take random articles from this source
    const selected = shuffleArray([...available]).slice(0, toTake);
    result.push(...selected);
    
    // Remove selected articles from the source pool
    sourceCount[source] = available.filter(a => !selected.includes(a));
  });
  
  // If we don't have enough articles yet, fill with whatever is left
  if (result.length < totalRequired) {
    const remaining = Object.values(sourceCount).flat();
    result.push(...shuffleArray(remaining).slice(0, totalRequired - result.length));
  }
  
  return result;
};

// Media API Integration - Wikimedia Commons and NASA

interface WikimediaCommonsResponse {
  parse: {
    images: string[];
    title: string;
    text: {
      '*': string;
    };
  };
}

export interface MediaOfTheDay {
  title: string;
  description: string;
  url: string;
  thumbUrl: string;
  isVideo: boolean;
  license?: string;
  author?: string;
  dateCreated?: string;
}

export interface NasaApodResponse {
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: 'image' | 'video';
  date: string;
  copyright?: string;
}

// Fetch Media of the Day from Wikimedia Commons
export const fetchMediaOfTheDay = async (): Promise<MediaOfTheDay | null> => {
  try {
    // Get current date in format YYYY/MM/DD
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    // Attempt to fetch Picture of the Day first
    const response = await axios.get<WikimediaCommonsResponse>(
      'https://commons.wikimedia.org/w/api.php',
      {
        params: {
          action: 'parse',
          page: `Template:Potd/${now.getFullYear()}-${month}-${day}`,
          format: 'json',
          prop: 'text|images',
          origin: '*'
        }
      }
    );
    
    if (response.data.parse) {
      // Extract image information from the response
      const html = response.data.parse.text['*'];
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract the main image
      const imgElement = doc.querySelector('.commons-file-information-table img') as HTMLImageElement;
      const descElement = doc.querySelector('.description');
      
      if (imgElement && imgElement.src) {
        const imgSrc = imgElement.src.startsWith('//') 
          ? `https:${imgElement.src}` 
          : imgElement.src;
          
        // Get high-res version by modifying thumbnail URL
        const fullResUrl = imgSrc.replace(/\/thumb\//, '/').split('/').slice(0, -1).join('/');
        
        return {
          title: response.data.parse.title,
          description: descElement ? descElement.textContent || '' : '',
          url: fullResUrl,
          thumbUrl: imgSrc,
          isVideo: false
        };
      }
    }
    
    // If Picture of the Day fails, try Media of the Day as fallback
    const mediaResponse = await axios.get<WikimediaCommonsResponse>(
      'https://commons.wikimedia.org/w/api.php',
      {
        params: {
          action: 'parse',
          page: `Template:Motd/${now.getFullYear()}-${month}-${day}`,
          format: 'json',
          prop: 'text|images',
          origin: '*'
        }
      }
    );
    
    if (mediaResponse.data.parse) {
      const html = mediaResponse.data.parse.text['*'];
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract video or image
      const mediaElement = doc.querySelector('video') || doc.querySelector('img');
      const descElement = doc.querySelector('.description');
      
      if (mediaElement) {
        const isVideo = mediaElement.tagName.toLowerCase() === 'video';
        const mediaSrc = isVideo 
          ? (mediaElement as HTMLVideoElement).poster || ''
          : (mediaElement as HTMLImageElement).src;
          
        const finalSrc = mediaSrc.startsWith('//') 
          ? `https:${mediaSrc}` 
          : mediaSrc;
          
        return {
          title: mediaResponse.data.parse.title,
          description: descElement ? descElement.textContent || '' : '',
          url: finalSrc,
          thumbUrl: finalSrc,
          isVideo
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching Media of the Day:', error);
    return null;
  }
};

// Fetch NASA Astronomy Picture of the Day
export const fetchNasaApod = async (): Promise<NasaApodResponse | null> => {
  try {
    // NASA's APOD API is free to use with limited requests
    // For production, you should get an API key: https://api.nasa.gov/
    const response = await axios.get<NasaApodResponse>(
      'https://api.nasa.gov/planetary/apod',
      {
        params: {
          api_key: 'DEMO_KEY' // Limited to 30 requests per hour
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error fetching NASA APOD:', error);
    return null;
  }
};

// Fetch relevant images for a topic from Wikimedia Commons
export const fetchRelevantImages = async (topic: string, limit: number = 5): Promise<MediaOfTheDay[]> => {
  try {
    // Search Wikimedia Commons for images related to the topic
    const searchResponse = await axios.get(
      'https://commons.wikimedia.org/w/api.php',
      {
        params: {
          action: 'query',
          list: 'search',
          srsearch: `${topic} filetype:bitmap`,
          srnamespace: 6, // File namespace
          srlimit: limit,
          format: 'json',
          origin: '*'
        }
      }
    );
    
    if (!searchResponse.data.query?.search?.length) {
      return [];
    }
    
    // Get file details for each search result
    const filePromises = searchResponse.data.query.search.map(async (result: any) => {
      const title = result.title;
      
      // Get image info
      const imageResponse = await axios.get(
        'https://commons.wikimedia.org/w/api.php',
        {
          params: {
            action: 'query',
            titles: title,
            prop: 'imageinfo',
            iiprop: 'url|extmetadata',
            iiurlwidth: 2400, // Increased from 1600 to 2400 for even higher resolution
            format: 'json',
            origin: '*'
          }
        }
      );
      
      const pages = imageResponse.data.query?.pages || {};
      const pageId = Object.keys(pages)[0];
      
      if (pageId && pages[pageId].imageinfo && pages[pageId].imageinfo.length) {
        const imageInfo = pages[pageId].imageinfo[0];
        const metadata = imageInfo.extmetadata || {};
        
        return {
          title: title.replace('File:', ''),
          description: metadata.ImageDescription?.value || '',
          url: imageInfo.url, // Original full resolution URL
          thumbUrl: imageInfo.thumburl || imageInfo.url,
          isVideo: false,
          license: metadata.License?.value || '',
          author: metadata.Artist?.value || '',
          dateCreated: metadata.DateTimeOriginal?.value || ''
        };
      }
      
      return null;
    });
    
    const results = await Promise.all(filePromises);
    return results.filter(result => result !== null) as MediaOfTheDay[];
  } catch (error) {
    console.error('Error fetching relevant images:', error);
    return [];
  }
};

// Check if a topic is related to astronomy
export const isAstronomyTopic = (topic: string): boolean => {
  const astronomyKeywords = [
    'astronomy', 'space', 'planet', 'star', 'galaxy', 'cosmos', 'universe', 
    'nebula', 'solar system', 'moon', 'mars', 'jupiter', 'saturn', 'venus', 
    'telescope', 'astronaut', 'nasa', 'esa', 'spacex', 'rocket', 'meteor', 
    'asteroid', 'comet', 'black hole', 'supernova', 'exoplanet', 'constellation',
    'observatory', 'cosmology', 'astrophysics', 'orbit', 'celestial'
  ];
  
  const lowerTopic = topic.toLowerCase();
  return astronomyKeywords.some(keyword => lowerTopic.includes(keyword));
};

// ========== PODCAST API ==========

// Podcast Episode interface
export interface PodcastEpisode {
  id: number | string;
  title: string;
  description: string;
  url?: string;
  datePublished?: string;
  publishDate?: string;
  duration?: number | string;
  image?: string;
  feedTitle?: string;
  feedUrl?: string;
  feedImage?: string;
  categories?: string[];
  audio?: string;
  audioUrl?: string;
  podcastId?: string;
  podcastName?: string;
}

// Search for podcast episodes by topic
export const searchPodcastEpisodes = async (term: string, limit: number = 5): Promise<PodcastEpisode[]> => {
  try {
    // Try to load from static data first
    try {
      console.log('Using static podcast data for search');
      const response = await axios.get('/data/podcasts/index.json');
      const indexData = response.data;
      
      // Search across all podcasts
      const results: PodcastEpisode[] = [];
      
      // For each podcast in the index, get its episodes
      for (const podcast of indexData.podcasts) {
        try {
          const podcastResponse = await axios.get(`/data/podcasts/${podcast.id}.json`);
          const podcastData = podcastResponse.data;
          
          if (podcastData && podcastData.episodes) {
            // Filter episodes by the search term
            const matchingEpisodes = podcastData.episodes.filter((episode: PodcastEpisode) => 
              episode.title.toLowerCase().includes(term.toLowerCase()) ||
              episode.description.toLowerCase().includes(term.toLowerCase()) ||
              podcastData.name.toLowerCase().includes(term.toLowerCase())
            );
            
            results.push(...matchingEpisodes);
          }
        } catch (podcastErr) {
          console.warn(`Couldn't load podcast ${podcast.id}:`, podcastErr);
        }
      }
      
      return results.slice(0, limit);
    } catch (staticError) {
      console.warn('Static podcast data not available for search, showing placeholder:', staticError);
      // Return empty results for production
      return [];
    }
  } catch (error) {
    console.error('Error searching podcast episodes:', error);
    return [];
  }
};

// Search for trending podcasts
export const fetchTrendingPodcasts = async (limit: number = 10): Promise<PodcastEpisode[]> => {
  try {
    // Try to load from static data first
    try {
      console.log('Using static podcast data for trending');
      
      // Load the index
      const indexResponse = await axios.get('/data/podcasts/index.json');
      const indexData = indexResponse.data;
      
      if (!indexData || !indexData.podcasts || indexData.podcasts.length === 0) {
        throw new Error('No podcasts in index');
      }
      
      // Get random podcasts from the index
      const randomPodcasts = [...indexData.podcasts]
        .sort(() => 0.5 - Math.random())  // Shuffle
        .slice(0, Math.min(3, indexData.podcasts.length));  // Take a few
      
      // Get episodes from each podcast
      const allEpisodes: PodcastEpisode[] = [];
      
      for (const podcast of randomPodcasts) {
        try {
          const podcastResponse = await axios.get(`/data/podcasts/${podcast.id}.json`);
          const podcastData = podcastResponse.data;
          
          if (podcastData && podcastData.episodes) {
            allEpisodes.push(...podcastData.episodes);
          }
        } catch (podcastErr) {
          console.warn(`Couldn't load podcast ${podcast.id}:`, podcastErr);
        }
      }
      
      // Randomize and limit
      return allEpisodes
        .sort(() => 0.5 - Math.random())
        .slice(0, limit);
    } catch (staticError) {
      console.warn('Static podcast data not available for trending, showing placeholder:', staticError);
      // Return empty results for production
      return [];
    }
  } catch (error) {
    console.error('Error fetching trending podcasts:', error);
    return [];
  }
};

// Search for podcasts by category
export const searchPodcastsByCategory = async (category: string, limit: number = 5): Promise<PodcastEpisode[]> => {
  try {
    // Try to load from static data first
    try {
      console.log(`Using static podcast data for category: ${category}`);
      
      // Load the index
      const indexResponse = await axios.get('/data/podcasts/index.json');
      const indexData = indexResponse.data;
      
      if (!indexData || !indexData.podcasts || indexData.podcasts.length === 0) {
        throw new Error('No podcasts in index');
      }
      
      // Filter podcasts by category
      const matchingPodcasts = indexData.podcasts.filter((podcast: any) => 
        podcast.category === category || 
        podcast.category === 'mixed'  // Always include mixed category
      );
      
      if (matchingPodcasts.length === 0) {
        // If no matches, use any podcasts
        console.log('No matching podcasts for category, using random ones');
        const randomPodcasts = [...indexData.podcasts]
          .sort(() => 0.5 - Math.random())
          .slice(0, Math.min(3, indexData.podcasts.length));
          
        const allEpisodes: PodcastEpisode[] = [];
        
        for (const podcast of randomPodcasts) {
          try {
            const podcastResponse = await axios.get(`/data/podcasts/${podcast.id}.json`);
            const podcastData = podcastResponse.data;
            
            if (podcastData && podcastData.episodes) {
              allEpisodes.push(...podcastData.episodes.slice(0, 3));  // Take a few episodes
            }
          } catch (podcastErr) {
            console.warn(`Couldn't load podcast ${podcast.id}:`, podcastErr);
          }
        }
        
        return allEpisodes
          .sort(() => 0.5 - Math.random())
          .slice(0, limit);
      }
      
      // Get episodes from matching podcasts
      const allEpisodes: PodcastEpisode[] = [];
      
      for (const podcast of matchingPodcasts) {
        try {
          const podcastResponse = await axios.get(`/data/podcasts/${podcast.id}.json`);
          const podcastData = podcastResponse.data;
          
          if (podcastData && podcastData.episodes) {
            allEpisodes.push(...podcastData.episodes);
          }
        } catch (podcastErr) {
          console.warn(`Couldn't load podcast ${podcast.id}:`, podcastErr);
        }
      }
      
      // Randomize and limit
      return allEpisodes
        .sort(() => 0.5 - Math.random())
        .slice(0, limit);
    } catch (staticError) {
      console.warn(`Static podcast data not available for category ${category}, showing placeholder:`, staticError);
      // Return empty results for production
      return [];
    }
  } catch (error) {
    console.error(`Error searching podcasts for category ${category}:`, error);
    return [];
  }
};

// Force clear all article-related caches
export const clearArticleCaches = () => {
  localStorage.removeItem('wikicache_random');
  localStorage.removeItem('wikicache_search');
  localStorage.removeItem('cache_hackernews');
  localStorage.removeItem('cache_onthisday');
  localStorage.removeItem('cache_oksurf');
  console.log('All article caches cleared');
};

// Helper function to get the best podcast image
const getBestPodcastImage = (...images: (string | undefined)[]): string => {
  // Find the first valid image from the provided URLs
  const bestImageUrl = images.find(image => image && image !== 'self' && image !== 'default' && image !== 'nsfw');
  
  if (!bestImageUrl) return '';
  
  // Apply high-resolution transformations
  try {
    // iTunes artwork often has dimensions in URL (e.g., 100x100)
    // Replace with maximum resolution
    if (bestImageUrl.includes('mzstatic.com')) {
      return bestImageUrl.replace(/\/\d+x\d+/, '/1200x1200');
    }
    
    // Apply the getHighResImage utility for other URLs by creating a dummy thumbnail object
    const highResResult = getHighResImage({ source: bestImageUrl });
    return highResResult?.source || bestImageUrl;
  } catch (error) {
    console.error('Error getting high-res podcast image:', error);
    return bestImageUrl;
  }
};

// Optimize all images in a WikipediaArticle
export const optimizeArticleImages = (article: WikipediaArticle): WikipediaArticle => {
  if (!article) return article;
  
  // Apply high-res transformation to the thumbnail
  let optimizedArticle = { ...article };
  
  if (optimizedArticle.thumbnail) {
    optimizedArticle.thumbnail = getHighResImage(optimizedArticle.thumbnail);
  }
  
  return optimizedArticle;
};

// Optimize all images in an array of WikipediaArticles
export const optimizeArticleImagesArray = (articles: WikipediaArticle[]): WikipediaArticle[] => {
  return articles.map(article => optimizeArticleImages(article));
};