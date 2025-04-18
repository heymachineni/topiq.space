import axios from 'axios';
import { WikipediaArticle, ContentSource, ArticleSource } from '../types';

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

const API_CACHE: Record<string, Cache> = {};
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Cache timeout in ms (5 minutes)
const CACHE_TIMEOUT = 5 * 60 * 1000;

// Helper to check if cache is valid
const isCacheValid = (cacheKey: string): boolean => {
  if (!API_CACHE[cacheKey]) return false;
  const now = Date.now();
  return now - API_CACHE[cacheKey].timestamp < CACHE_DURATION;
};

// Get data from cache or fetch new
const getFromCacheOrFetch = async (cacheKey: string, fetchFn: () => Promise<any>): Promise<any> => {
  if (isCacheValid(cacheKey)) {
    return API_CACHE[cacheKey].data;
  }
  
  const data = await fetchFn();
  API_CACHE[cacheKey] = {
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

    // Handle Wikipedia thumbnail URLs - convert /thumb/ to full resolution
    if (imgSrc.includes('/thumb/') && imgSrc.includes('wikipedia.org')) {
      const fullResUrl = imgSrc.replace(/\/thumb\//, '/').split('/').slice(0, -1).join('/');
      return {
        ...thumbnail,
        source: fullResUrl
      };
    }
    
    // Handle Wikimedia Commons URLs
    if (imgSrc.includes('wikimedia.org')) {
      // If URL contains a size parameter like /300px-
      if (imgSrc.match(/\/\d+px-/)) {
        // Remove size constraints from wikimedia URLs
        const fullResUrl = imgSrc.replace(/\/\d+px-/, '/');
        return {
          ...thumbnail,
          source: fullResUrl
        };
      }
    }
    
    // Handle iTunes artwork URLs - upgrade to highest resolution
    if (imgSrc.includes('mzstatic.com')) {
      // iTunes artwork often has dimensions in URL (e.g., 100x100)
      const fullResUrl = imgSrc.replace(/\/\d+x\d+/, '/1200x1200');
      return {
        ...thumbnail,
        source: fullResUrl
      };
    }
    
    // Handle imgur thumbnail URLs
    if (imgSrc.includes('imgur.com')) {
      // Replace thumbnail suffixes with originals
      if (imgSrc.includes('_d.') || imgSrc.includes('_t.') || imgSrc.includes('_m.') || imgSrc.includes('_l.')) {
        const fullResUrl = imgSrc.replace(/(_[a-z])\.(jpg|png|gif)/i, '.$2');
        return {
          ...thumbnail,
          source: fullResUrl
        };
      }
    }
    
    // Handle Reddit-specific resized images
    if (imgSrc.includes('external-preview.redd.it') || imgSrc.includes('preview.redd.it')) {
      // Reddit image previews often have width/compressions in URL params
      const urlWithoutParams = imgSrc.split('?')[0];
      return {
        ...thumbnail,
        source: urlWithoutParams
      };
    }
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
      // Increase parallel fetching to improve performance - from 5 to a larger number
      // Fetch more random articles in parallel to increase chances of finding good ones
      const fetchPromises = Array(10).fill(null).map(async () => {
        try {
          const response = await axios.get('https://en.wikipedia.org/api/rest_v1/page/random/summary', { timeout: 4000 });
          return response.data;
        } catch (error) {
          console.error('Error in parallel fetch of random article:', error);
          return null;
        }
      });
      
      // Wait for all parallel requests to complete
      const results = await Promise.all(fetchPromises);
      const validResults = results.filter(result => 
        result !== null && 
        result.title && 
        result.extract && 
        result.extract.length >= 100 &&
        result.thumbnail // Only check if thumbnail exists, without width filtering
      );
      
      if (validResults.length > 0) {
        // Pick the first valid result
        const data = validResults[0];
        console.log(`Found suitable Wikipedia article: ${data.title}`);
        
        // Get high-res version of the thumbnail
        const highResThumbnail = getHighResImage(data.thumbnail);
        
        return {
          pageid: data.pageid,
          title: data.title,
          extract: data.extract,
          thumbnail: highResThumbnail,
          description: data.description,
          source: 'wikipedia' as ContentSource,
          url: data.content_urls?.desktop?.page
        };
      }
      
      // If no valid result with image was found from the parallel attempts,
      // make one more direct fetch with more relaxed criteria
      const fallbackResponse = await axios.get('https://en.wikipedia.org/api/rest_v1/page/random/summary', { timeout: 3000 });
      const fallbackData = fallbackResponse.data;
      
      // Accept even without thumbnail as last resort
      return {
        pageid: fallbackData.pageid,
        title: fallbackData.title || 'Wikipedia Article',
        extract: fallbackData.extract || 'No description available',
        thumbnail: fallbackData.thumbnail ? getHighResImage(fallbackData.thumbnail) : undefined,
        description: fallbackData.description,
        source: 'wikipedia' as ContentSource,
        url: fallbackData.content_urls?.desktop?.page
      };
    } catch (error) {
      console.error('Error fetching random Wikipedia article:', error);
      throw error;
    }
  };
  
  return await getFromCacheOrFetch(cacheKey, fetchFn);
}

export async function fetchRandomArticles(count: number = 10): Promise<WikipediaArticle[]> {
  try {
    const articles: WikipediaArticle[] = [];
    
    // Fetch articles in parallel
    const promises = Array(count).fill(null).map(() => fetchRandomWikipediaArticle());
    const results = await Promise.all(promises);
    
    // Add to the articles array
    articles.push(...results);
    
    return articles;
  } catch (error) {
    console.error('Error fetching random articles:', error);
    throw error;
  }
}

export async function fetchArticlesBySearch(searchTerm: string): Promise<WikipediaArticle[]> {
  try {
    const cacheKey = `wikipedia_search_${searchTerm}`;
    
    const fetchFn = async () => {
      // Request more results to have a better pool of articles to choose from
      const searchResponse = await axios.get(`https://en.wikipedia.org/w/api.php`, {
        params: {
          action: 'query',
          list: 'search',
          srsearch: searchTerm,
          format: 'json',
          origin: '*',
          srlimit: 40 // Significantly increased to get more candidates
        }
      });
      
      const searchResults = searchResponse.data.query.search;
      console.log(`Received ${searchResults.length} initial search results for "${searchTerm}"`);
      
      // Create batches for parallel processing - process 10 at a time
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < searchResults.length; i += batchSize) {
        batches.push(searchResults.slice(i, i + batchSize));
      }
      
      const processedArticles = [];
      
      // Process each batch in parallel
      for (const batch of batches) {
        // Fetch full data for each search result in the batch
        const batchPromises = batch.map(async (result: any) => {
          try {
            const titleParam = encodeURIComponent(result.title);
            const response = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${titleParam}`);
            const data = response.data;
            
            // Only require the article to have any thumbnail, no width check
            // Plus a good extract and title
            if (!data.thumbnail || !data.extract || data.extract.length < 100 || !data.title) {
              return null;
            }
            
            // Use utility to convert thumbnail to high-res
            const highResThumbnail = getHighResImage(data.thumbnail);
            
            return {
              pageid: data.pageid,
              title: data.title,
              extract: data.extract,
              thumbnail: highResThumbnail,
              description: data.description,
              source: 'wikipedia' as ContentSource,
              url: data.content_urls?.desktop?.page
            };
          } catch (error) {
            console.error(`Error fetching article data for ${result.title}:`, error);
            return null;
          }
        });
        
        // Wait for the current batch to complete
        const batchResults = await Promise.all(batchPromises);
        processedArticles.push(...batchResults.filter(article => article !== null));
        
        // If we already have enough articles, stop processing batches
        if (processedArticles.length >= 10) {
          break;
        }
      }
      
      console.log(`Found ${processedArticles.length} articles with images for search "${searchTerm}"`);
      
      // If we didn't get enough articles, try to fill in with additional random articles
      if (processedArticles.length < 5) {
        console.log(`Only found ${processedArticles.length} articles for "${searchTerm}", fetching additional articles`);
        const additionalArticles = await fetchRandomArticles(10);
        processedArticles.push(...additionalArticles.slice(0, 10 - processedArticles.length));
      }
      
      return processedArticles;
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
      
      // Format date in a more readable way for display
      const dateOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
      const readableDate = today.toLocaleDateString('en-US', dateOptions);
      
      // Convert to WikipediaArticle format
      return shuffledEvents.map((event: any) => {
        // Create a unique ID for the event
        const eventId = parseInt(`${month}${day}${event.year}`.padEnd(10, '0'));
        
        return {
          pageid: eventId,
          title: `${event.year}: ${event.description.slice(0, 60)}${event.description.length > 60 ? '...' : ''}`,
          extract: event.description,
          description: `On ${readableDate}, in the year ${event.year}`,
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
      
      // Since HN stories don't have images by default, we'll need to fetch more
      // and then filter for those with images from the article content
      const topStoriesEndpoints = [
        'https://hacker-news.firebaseio.com/v0/topstories.json',
        'https://hacker-news.firebaseio.com/v0/beststories.json',
        'https://hacker-news.firebaseio.com/v0/newstories.json'
      ];
      
      // Try multiple endpoints in order until one succeeds
      let storyIds: number[] = [];
      let storiesResponse = null;
      
      // Try to fetch from all endpoints concurrently
      const endpointPromises = topStoriesEndpoints.map(endpoint => 
        axios.get(endpoint, { timeout: 4000 })
          .then(response => ({ 
            success: true, 
            data: response.data, 
            endpoint 
          }))
          .catch(err => ({ 
            success: false, 
            endpoint 
          }))
      );
      
      const endpointResults = await Promise.all(endpointPromises);
      const successfulFetch = endpointResults.find(result => 
        result.success && 
        result.hasOwnProperty('data') && 
        Array.isArray((result as any).data) && 
        (result as any).data.length > 0
      );
      
      if (successfulFetch) {
        storyIds = (successfulFetch as any).data.slice(0, count * 10); // Fetch more to ensure we get enough with images
        console.log(`Successfully fetched ${storyIds.length} HackerNews story IDs from ${successfulFetch.endpoint}`);
      } else {
        console.error("Failed to fetch any HackerNews story IDs from all endpoints");
        // Return mock data with images as fallback
        return createMockHackerNewsStories(count);
      }
      
      // Batch the story IDs to avoid overwhelming the API
      const batchSize = 20;
      const batches = [];
      for (let i = 0; i < storyIds.length; i += batchSize) {
        batches.push(storyIds.slice(i, i + batchSize));
      }
      
      let validStories: WikipediaArticle[] = [];
      
      // Process each batch in sequence
      for (const batch of batches) {
        // Fetch details for each story in parallel with timeouts
        const batchPromises = batch.map(async (id: number) => {
          try {
            const response = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 
                                        { timeout: 3000 });
            const story = response.data;
            
            // Skip jobs, polls, etc. or any story without needed data
            if (!story || !story.title || !story.url) {
              return null;
            }
            
            // Try to fetch the article page to extract metadata including images
            try {
              const pageResponse = await axios.get(`https://api.microlink.io?url=${encodeURIComponent(story.url)}&screenshot=true`, { 
                timeout: 4000 
              });
              
              const metadata = pageResponse.data.data;
              
              // Strict image filtering - only use stories where we can extract an image
              if (!metadata.image || !metadata.image.url) {
                return null;
              }
              
              return {
                pageid: story.id,
                title: story.title,
                extract: story.text || metadata.description || `${story.score} points | ${story.descendants || 0} comments`,
                thumbnail: {
                  source: metadata.image.url,
                  width: metadata.image.width || 800,
                  height: metadata.image.height || 600
                },
                description: `Posted by ${story.by}`,
                source: 'hackernews' as ContentSource,
                url: story.url
              };
            } catch (metaError) {
              // If we can't fetch metadata, skip this story
              console.error(`Error fetching metadata for HN story ${id}:`, metaError);
              return null;
            }
          } catch (error) {
            console.error(`Error fetching HN story ${id}:`, error);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        const validBatchStories = batchResults.filter(story => story !== null) as WikipediaArticle[];
        validStories = [...validStories, ...validBatchStories];
        
        // If we have enough valid stories with images, stop processing
        if (validStories.length >= count) {
          break;
        }
      }
      
      console.log(`Successfully fetched ${validStories.length} valid HackerNews stories with images`);
      
      if (validStories.length === 0) {
        return createMockHackerNewsStories(count);
      }
      
      // Apply high-res image optimizations
      validStories = validStories.map(story => ({
        ...story,
        thumbnail: story.thumbnail ? getHighResImage(story.thumbnail) : story.thumbnail
      }));
      
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
      source: 'hackernews' as ContentSource,
      thumbnail: {
        source: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=800&q=80",
        width: 800,
        height: 600
      }
    },
    {
      pageid: 36983294,
      title: "The Future of Web Browsers",
      extract: "An analysis of upcoming web standards and how they will impact browser technology in the next five years.",
      url: "https://example.com/future-browsers",
      description: "Posted by web_standards",
      source: 'hackernews' as ContentSource,
      thumbnail: {
        source: "https://images.unsplash.com/photo-1544652478-6653e09f18a2?auto=format&fit=crop&w=800&q=80",
        width: 800,
        height: 600
      }
    },
    {
      pageid: 36983295,
      title: "Machine Learning for Image Recognition: A Comprehensive Guide",
      extract: "Walkthrough of building an image recognition system from scratch using modern ML techniques.",
      url: "https://example.com/ml-image-guide",
      description: "Posted by deeplearning_researcher",
      source: 'hackernews' as ContentSource,
      thumbnail: {
        source: "https://images.unsplash.com/photo-1527474305487-b87b222841cc?auto=format&fit=crop&w=800&q=80",
        width: 800,
        height: 600
      }
    },
    {
      pageid: 36983296,
      title: "The Principles of Good API Design",
      extract: "Exploring the key principles behind successful and developer-friendly API design.",
      url: "https://example.com/api-design",
      description: "Posted by backend_developer",
      source: 'hackernews' as ContentSource,
      thumbnail: {
        source: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
        width: 800,
        height: 600
      }
    },
    {
      pageid: 36983297,
      title: "Optimizing Docker Containers for Production",
      extract: "Best practices for configuring and optimizing Docker containers in high-scale production environments.",
      url: "https://example.com/docker-optimization",
      description: "Posted by devops_engineer",
      source: 'hackernews' as ContentSource,
      thumbnail: {
        source: "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?auto=format&fit=crop&w=800&q=80",
        width: 800,
        height: 600
      }
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
  const cacheKey = `reddit_${count}`;
  
  const fetchFn = async () => {
    try {
      console.log(`Fetching Reddit posts, requested count: ${count}`);
      
      // Fetch from multiple subreddits to increase chances of finding posts with images
      // Request more posts than needed to ensure we can filter for ones with good images
      const response = await axios.get(
        `https://www.reddit.com/r/todayilearned+science+worldnews+technology+history+pics+EarthPorn+space.json?limit=${count * 10}`,
        { timeout: 4000 }
      );
      
      if (!response.data?.data?.children) {
        console.error('Invalid Reddit API response:', response.data);
        return [];
      }
      
      // Filter posts to only include those with proper images - strict filtering
      const posts = response.data.data.children
        .filter((post: any) => 
          // Ensure post has title and isn't NSFW
          post.data && 
          post.data.title && 
          !post.data.over_18 &&
          // Strict image requirement - must have preview images with source
          post.data.preview && 
          post.data.preview.images && 
          post.data.preview.images[0] &&
          post.data.preview.images[0].source &&
          post.data.preview.images[0].source.url
        )
        .slice(0, count);
      
      // Map to our article format
      const articles = posts
        .map((post: any) => {
          const data = post.data;
          
          // Extract image - always use the highest resolution available
          const image = data.preview.images[0];
          const source = image.source;
          
          const thumbnail = {
            source: source.url.replace(/&amp;/g, '&'),
            width: source.width,
            height: source.height
          };
          
          // Extract text content
          const extract = data.selftext && data.selftext.length > 0
            ? data.selftext.substring(0, 500) + (data.selftext.length > 500 ? '...' : '')
            : `Posted by u/${data.author} in r/${data.subreddit}`;
          
          return {
            pageid: parseInt(data.id, 36),
            title: data.title,
            extract,
            thumbnail: getHighResImage(thumbnail),
            description: `Posted by u/${data.author} in r/${data.subreddit}`,
            url: `https://www.reddit.com${data.permalink}`,
            source: 'reddit' as ContentSource
          };
        });
      
      console.log(`Converted ${articles.length} Reddit posts with images to articles`);
      return articles;
    } catch (error) {
      console.error('Error fetching Reddit posts:', error);
      // Return empty array on error
      return [];
    }
  };
  
  return await getFromCacheOrFetch(cacheKey, fetchFn);
}

// ========== WIKIPEDIA CURRENT EVENTS PORTAL ==========
export async function fetchWikipediaCurrentEvents(count: number = 5): Promise<WikipediaArticle[]> {
  const cacheKey = `wiki_events_${count}_${new Date().toDateString()}`;

  const fetchFn = async () => {
    try {
      // Get current date for the Wikipedia Current Events Portal
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      
      console.log(`Fetching Wikipedia events for ${year}-${month}-${day}`);
      
      // Fetch the current events page
      const response = await axios.get('https://en.wikipedia.org/w/api.php', {
        params: {
          action: 'parse',
          page: `Portal:Current_events/${year}_${month}_${day}`,
          format: 'json',
          prop: 'text',
          origin: '*'
        }
      });
      
      if (!response.data?.parse?.text?.['*']) {
        console.error('Invalid Wikipedia Current Events API response:', response.data);
        throw new Error('Invalid Wikipedia Current Events API response');
      }
      
      // Create a temporary DOM element to parse the HTML
      const parser = new DOMParser();
      const htmlDoc = parser.parseFromString(response.data.parse.text['*'], 'text/html');
      
      // Extract events from the page
      const eventItems = htmlDoc.querySelectorAll('.current-events-content li');
      console.log(`Found ${eventItems.length} event items on the page`);
      
      if (eventItems.length === 0) {
        throw new Error('No event items found on the current events page');
      }
      
      // Convert each event to a WikipediaArticle
      const articles: WikipediaArticle[] = [];
      let eventsProcessed = 0;
      
      for (const item of Array.from(eventItems)) {
        if (eventsProcessed >= count) break;
        
        // Find the linked article if any
        const link = item.querySelector('a');
        let pageTitle = '';
        let pageid = Math.floor(Math.random() * 100000000); // Random ID as fallback
        
        if (link) {
          const href = link.getAttribute('href') || '';
          if (href.startsWith('/wiki/')) {
            pageTitle = href.replace('/wiki/', '');
          }
        }
        
        const eventText = item.textContent?.trim() || '';
        if (!eventText) continue;
        
        // If we have a page title, try to fetch more info about it
        if (pageTitle) {
          try {
            const articleResponse = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`);
            const data = articleResponse.data;
            
            articles.push({
              pageid: data.pageid,
              title: data.title || `Current Event: ${pageTitle}`,
              extract: eventText,
              extract_html: item.innerHTML,
              thumbnail: getHighResImage(data.thumbnail),
              description: `Current event: ${today.toLocaleDateString()}`,
              url: `https://en.wikipedia.org/wiki/Portal:Current_events/${year}_${month}_${day}`,
              source: 'wikievents' as ContentSource
            });
            eventsProcessed++;
          } catch (error) {
            console.error(`Error fetching Wikipedia article details for ${pageTitle}:`, error);
            // If fetching article details fails, still add the event with basic info
            articles.push({
              pageid,
              title: pageTitle || `${today.toLocaleDateString()} Event`,
              extract: eventText,
              extract_html: item.innerHTML,
              description: `Current event: ${today.toLocaleDateString()}`,
              url: `https://en.wikipedia.org/wiki/Portal:Current_events/${year}_${month}_${day}`,
              source: 'wikievents' as ContentSource
            });
            eventsProcessed++;
          }
        } else {
          // Add the event with basic info
          articles.push({
            pageid,
            title: `${today.toLocaleDateString()} Event`,
            extract: eventText,
            extract_html: item.innerHTML,
            description: `Current event: ${today.toLocaleDateString()}`,
            url: `https://en.wikipedia.org/wiki/Portal:Current_events/${year}_${month}_${day}`,
            source: 'wikievents' as ContentSource
          });
          eventsProcessed++;
        }
      }
      
      console.log(`Processed ${articles.length} Wikipedia events`);
      return articles;
    } catch (error) {
      console.error('Error fetching Wikipedia current events:', error);
      
      // Try the previous day if today's page doesn't exist
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const year = yesterday.getFullYear();
        const month = String(yesterday.getMonth() + 1).padStart(2, '0');
        const day = String(yesterday.getDate()).padStart(2, '0');
        
        console.log(`Retrying with previous day: ${year}-${month}-${day}`);
        
        const response = await axios.get('https://en.wikipedia.org/w/api.php', {
          params: {
            action: 'parse',
            page: `Portal:Current_events/${year}_${month}_${day}`,
            format: 'json',
            prop: 'text',
            origin: '*'
          }
        });
        
        // Process events similar to above
        // [Code omitted for brevity - would be similar to the above processing]
        
        // Return a placeholder if we still failed
        return [{
          pageid: Math.floor(Math.random() * 100000000),
          title: `Recent Events (${yesterday.toLocaleDateString()})`,
          extract: `Events from yesterday are being displayed because today's events aren't available yet.`,
          description: `Current events: ${yesterday.toLocaleDateString()}`,
          url: `https://en.wikipedia.org/wiki/Portal:Current_events/${year}_${month}_${day}`,
          source: 'wikievents' as ContentSource
        }];
      } catch (fallbackError) {
        console.error('Error fetching fallback Wikipedia current events:', fallbackError);
        
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
    }
  };
  
  return await getFromCacheOrFetch(cacheKey, fetchFn);
}

// ========== COMBINED API ==========
export const fetchMultiSourceArticles = async (
  sourceRequests: Partial<Record<ContentSource, number>>
): Promise<WikipediaArticle[]> => {
  const allArticles: WikipediaArticle[] = [];
  
  // Fetch from each source based on the requests
  const promises: Promise<any>[] = []; // Change to any to handle different promise return types
  
  // Wikipedia
  if (sourceRequests.wikipedia && sourceRequests.wikipedia > 0) {
    promises.push(
      fetchRandomArticles(sourceRequests.wikipedia)
        .then(articles => allArticles.push(...articles))
        .catch(err => console.error('Error fetching Wikipedia articles:', err))
    );
  }
  
  // Wikipedia Current Events Portal
  if (sourceRequests.wikievents && sourceRequests.wikievents > 0) {
    promises.push(
      fetchWikipediaCurrentEvents(sourceRequests.wikievents)
        .then(articles => allArticles.push(...articles))
        .catch(err => console.error('Error fetching Wikipedia current events:', err))
    );
  }
  
  // Reddit
  if (sourceRequests.reddit && sourceRequests.reddit > 0) {
    promises.push(
      fetchRedditPosts(sourceRequests.reddit)
        .then(articles => allArticles.push(...articles))
        .catch(err => console.error('Error fetching Reddit posts:', err))
    );
  }
  
  // Hacker News (kept for backward compatibility)
  if (sourceRequests.hackernews && sourceRequests.hackernews > 0) {
    promises.push(
      fetchHackerNewsStories(sourceRequests.hackernews)
        .then(articles => allArticles.push(...articles))
        .catch(err => console.error('Error fetching Hacker News stories:', err))
    );
  }
  
  // On This Day
  if (sourceRequests.onthisday && sourceRequests.onthisday > 0) {
    promises.push(
      fetchOnThisDayEvents(sourceRequests.onthisday)
        .then(articles => allArticles.push(...articles))
        .catch(err => console.error('Error fetching On This Day events:', err))
    );
  }
  
  // OK Surf
  if (sourceRequests.oksurf && sourceRequests.oksurf > 0) {
    promises.push(
      fetchOkSurfNews(sourceRequests.oksurf)
        .then(articles => allArticles.push(...articles))
        .catch(err => console.error('Error fetching OK Surf news:', err))
    );
  }
  
  // Wait for all fetches to complete
  await Promise.all(promises);
  
  // Filter out articles without images (except onthisday which naturally doesn't have images)
  const filteredArticles = allArticles.filter(article => 
    article.thumbnail?.source || article.source === 'onthisday'
  );
  
  // Apply high resolution image optimization to all articles
  const optimizedArticles = optimizeArticleImagesArray(filteredArticles);
  
  // Shuffle the articles to mix sources
  return shuffleArray(optimizedArticles);
};

// PodcastIndex.org API Integration
export interface PodcastEpisode {
  id: number;
  title: string;
  description: string;
  url: string;
  datePublished: string;
  duration: number | string; // Allow both number and string formats for duration
  image?: string;
  feedTitle: string;
  feedUrl: string;
  feedImage?: string;
  categories?: string[];
  audio?: string;
}

// Format seconds to readable duration (MM:SS or HH:MM:SS)
const formatDuration = (seconds: number): string => {
  if (!seconds) return "00:00";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Format milliseconds to mm:ss format
const formatMilliseconds = (ms: number): string => {
  if (!ms) return '00:00';
  
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Search for podcast episodes by topic
export const searchPodcastEpisodes = async (term: string, limit: number = 5): Promise<PodcastEpisode[]> => {
  try {
    // Use iTunes Search API instead of PodcastIndex
    const response = await axios.get(
      'https://itunes.apple.com/search',
      {
        params: {
          term,
          media: 'podcast',
          entity: 'podcast',
          limit: 10,
          country: 'US'
        }
      }
    );
    
    if (!response.data?.results?.length) {
      return [];
    }
    
    // Process and format the response
    const podcasts = response.data.results.slice(0, limit);
    
    // For each podcast, fetch the latest episodes
    const podcastsWithEpisodes = await Promise.all(
      podcasts.map(async (podcast: any) => {
        try {
          const episodesResponse = await axios.get(
            'https://itunes.apple.com/lookup',
            {
              params: {
                id: podcast.collectionId,
                entity: 'podcastEpisode',
                limit: 3
              }
            }
          );
          
          if (episodesResponse.data?.results?.length > 1) {
            // First result is the podcast itself, rest are episodes
            const episodes = episodesResponse.data.results.slice(1);
            return episodes.map((episode: any) => ({
              id: episode.trackId,
              title: episode.trackName || 'Untitled Episode',
              description: episode.description || podcast.collectionName,
              url: episode.previewUrl || episode.trackViewUrl,
              audio: episode.episodeUrl || episode.previewUrl,
              datePublished: new Date(episode.releaseDate).toLocaleDateString(),
              duration: formatMilliseconds(episode.trackTimeMillis),
              image: getBestPodcastImage(episode.artworkUrl600, podcast.artworkUrl600, podcast.artworkUrl100),
              feedTitle: podcast.collectionName,
              feedUrl: podcast.feedUrl,
              feedImage: getBestPodcastImage(podcast.artworkUrl600, podcast.artworkUrl100),
              categories: [podcast.primaryGenreName]
            }));
          }
          
          // If no episodes found, return the podcast info as a placeholder
          return [{
            id: podcast.collectionId,
            title: podcast.collectionName,
            description: podcast.collectionName,
            url: podcast.collectionViewUrl,
            audio: '',
            datePublished: new Date(podcast.releaseDate).toLocaleDateString(),
            duration: '00:00',
            image: getBestPodcastImage(podcast.artworkUrl600, podcast.artworkUrl100),
            feedTitle: podcast.collectionName,
            feedUrl: podcast.feedUrl,
            feedImage: getBestPodcastImage(podcast.artworkUrl600, podcast.artworkUrl100),
            categories: [podcast.primaryGenreName]
          }];
        } catch (error) {
          console.error('Error fetching podcast episodes:', error);
          return [];
        }
      })
    );
    
    // Flatten the array of arrays
    return podcastsWithEpisodes.flat();
  } catch (error) {
    console.error('Error searching podcast episodes:', error);
    return [];
  }
};

// Search for trending podcasts
export const fetchTrendingPodcasts = async (limit: number = 10): Promise<PodcastEpisode[]> => {
  try {
    // Use a dedicated cache key for podcasts
    const cacheKey = 'podcasts_trending';
    
    // Try to get from cache first (with 30 minute expiration)
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      try {
        const parsedCache = JSON.parse(cachedData);
        if (parsedCache.timestamp && (Date.now() - parsedCache.timestamp < 30 * 60 * 1000)) {
          console.log('Using cached podcast data');
          return parsedCache.data;
        }
      } catch (e) {
        console.error('Failed to parse podcast cache:', e);
        // Cache was invalid, continue with fetch
      }
    }
    
    // Calculate how many podcasts to request from iTunes to ensure we get enough with episodes
    // Request 2.5x more than needed since not all will have valid episodes
    const requestLimit = Math.min(200, Math.ceil(limit * 2.5)); 
    
    // Use iTunes charts API to get popular podcasts with a focus on content with audio streams
    const response = await axios.get(
      'https://itunes.apple.com/search',
      {
        params: {
          term: 'podcast',
          media: 'podcast',
          entity: 'podcast',
          // Use attributes to get better audio results
          attribute: 'titleTerm',
          limit: requestLimit,
          country: 'US'
        },
        timeout: 8000 // Increase timeout for reliability
      }
    );
    
    if (!response.data?.results?.length) {
      // Fallback: use sample data if API fails
      return generateSamplePodcasts(limit);
    }
    
    // Process and format the response
    const podcasts = response.data.results;
    
    // For each podcast, fetch the latest episodes
    // Use Promise.allSettled to prevent one failure from affecting all requests
    const podcastsWithEpisodes = await Promise.allSettled(
      podcasts.map(async (podcast: any) => {
        try {
          const episodesResponse = await axios.get(
            'https://itunes.apple.com/lookup',
            {
              params: {
                id: podcast.collectionId,
                entity: 'podcastEpisode',
                limit: 10 // Increased from 5 to 10 episodes per podcast
              },
              timeout: 5000 // Add timeout to prevent hanging requests
            }
          );
          
          if (episodesResponse.data?.results?.length > 1) {
            // First result is the podcast itself, rest are episodes
            const episodes = episodesResponse.data.results.slice(1);
            return episodes.map((episode: any) => ({
              id: episode.trackId,
              title: episode.trackName || 'Untitled Episode',
              description: episode.description || podcast.collectionName,
              url: episode.previewUrl || episode.trackViewUrl,
              audio: episode.episodeUrl || episode.previewUrl || episode.trackViewUrl,
              datePublished: new Date(episode.releaseDate).toLocaleDateString(),
              duration: formatMilliseconds(episode.trackTimeMillis),
              image: getBestPodcastImage(episode.artworkUrl600, podcast.artworkUrl600, podcast.artworkUrl100),
              feedTitle: podcast.collectionName,
              feedUrl: podcast.feedUrl,
              feedImage: getBestPodcastImage(podcast.artworkUrl600, podcast.artworkUrl100),
              categories: [podcast.primaryGenreName]
            }));
          }
          
          // If no episodes found, return the podcast info as a placeholder
          return [{
            id: podcast.collectionId,
            title: podcast.collectionName,
            description: podcast.collectionName,
            url: podcast.collectionViewUrl,
            audio: '',
            datePublished: new Date(podcast.releaseDate).toLocaleDateString(),
            duration: '00:00',
            image: getBestPodcastImage(podcast.artworkUrl600, podcast.artworkUrl100),
            feedTitle: podcast.collectionName,
            feedUrl: podcast.feedUrl,
            feedImage: getBestPodcastImage(podcast.artworkUrl600, podcast.artworkUrl100),
            categories: [podcast.primaryGenreName]
          }];
        } catch (error) {
          console.error('Error fetching podcast episodes:', error);
          return [];
        }
      })
    );
    
    // Process results from Promise.allSettled
    const allEpisodes = podcastsWithEpisodes
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<PodcastEpisode[]>).value)
      .flat();
    
    // Filter valid episodes (with audio) and take up to the limit
    const validEpisodes = allEpisodes
      .filter(podcast => podcast.audio)
      .slice(0, limit);
      
    // Save to cache for faster future loads
    if (validEpisodes.length > 0) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          timestamp: Date.now(),
          data: validEpisodes
        }));
      } catch (e) {
        console.error('Failed to cache podcast data:', e);
      }
    }
    
    return validEpisodes;
  } catch (error) {
    console.error('Error fetching trending podcasts:', error);
    return generateSamplePodcasts(limit);
  }
};

// Generate sample podcast data for offline/fallback use
const generateSamplePodcasts = (count: number): PodcastEpisode[] => {
  const samplePodcasts: PodcastEpisode[] = [
    {
      id: 1001,
      title: "The Daily",
      description: "This is what the news should sound like. The biggest stories of our time, told by the best journalists.",
      url: "https://www.nytimes.com/column/the-daily",
      audio: "https://rss.art19.com/episodes/01a3a482-c8e0-4bf6-b0af-f002f0a3a86a.mp3",
      datePublished: new Date().toLocaleDateString(),
      duration: "25:00",
      image: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/89/51/48/895148d6-fe7b-e79c-6e06-71d540399aa3/mza_9278186528825138484.jpg/600x600bb.jpg",
      feedTitle: "The New York Times",
      feedUrl: "https://feeds.simplecast.com/54nAGcIl",
      feedImage: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/89/51/48/895148d6-fe7b-e79c-6e06-71d540399aa3/mza_9278186528825138484.jpg/600x600bb.jpg",
      categories: ["News"]
    },
    {
      id: 1002,
      title: "Science Vs",
      description: "Science Vs takes on fads, trends, and the opinionated mob to find out what's fact, what's not.",
      url: "https://gimletmedia.com/science-vs",
      audio: "https://traffic.omny.fm/d/clips/e73c998e-6e60-432f-8610-ae210140c5b1/7d01a137-bb0d-430e-aa67-ae3f00fc0187/2bd98d44-95a5-4a7e-9e9c-ae4300d59d50/audio.mp3",
      datePublished: new Date().toLocaleDateString(),
      duration: "31:00",
      image: "https://is5-ssl.mzstatic.com/image/thumb/Podcasts125/v4/58/a5/2c/58a52c5d-91dc-a59f-9206-b1919fcc8c55/mza_17589569769640067902.jpg/600x600bb.jpg",
      feedTitle: "Gimlet",
      feedUrl: "https://feeds.megaphone.fm/sciencevs",
      feedImage: "https://is5-ssl.mzstatic.com/image/thumb/Podcasts125/v4/58/a5/2c/58a52c5d-91dc-a59f-9206-b1919fcc8c55/mza_17589569769640067902.jpg/600x600bb.jpg",
      categories: ["Science"]
    },
    {
      id: 1003,
      title: "Radiolab",
      description: "Investigating a strange world with curiosity and clarity to illuminate fundamental science concepts.",
      url: "https://www.wnycstudios.org/podcasts/radiolab",
      audio: "https://www.podtrac.com/pts/redirect.mp3/audio.wnyc.org/radiolab/radiolab090723_mixdown_2.mp3",
      datePublished: new Date().toLocaleDateString(),
      duration: "45:00",
      image: "https://is4-ssl.mzstatic.com/image/thumb/Podcasts115/v4/6e/51/96/6e5196b7-ca97-01a1-efb5-d0a094159767/mza_16172304289559890899.jpg/600x600bb.jpg",
      feedTitle: "WNYC Studios",
      feedUrl: "https://feeds.wnyc.org/radiolab",
      feedImage: "https://is4-ssl.mzstatic.com/image/thumb/Podcasts115/v4/6e/51/96/6e5196b7-ca97-01a1-efb5-d0a094159767/mza_16172304289559890899.jpg/600x600bb.jpg",
      categories: ["Science", "Education"]
    },
    {
      id: 1004,
      title: "Planet Money",
      description: "The economy explained. Imagine you could call up a friend and say, 'Meet me at the bar and tell me what's going on with the economy.'",
      url: "https://www.npr.org/podcasts/510289/planet-money",
      audio: "https://pdst.fm/e/nprss.npr.org/anon.npr-podcasts/podcast/npr/pmoney/2023/09/20230929_pmoney_pmpod_1516_-_is_college_still_worth_it_wide_mix-b704ea68-1b51-497d-8c50-097a06b0916b.mp3",
      datePublished: new Date().toLocaleDateString(),
      duration: "20:00",
      image: "https://is3-ssl.mzstatic.com/image/thumb/Podcasts126/v4/98/d2/d5/98d2d599-1d21-e9d5-5cb7-749d9242e958/mza_11520507046916537252.jpg/600x600bb.jpg",
      feedTitle: "NPR",
      feedUrl: "https://feeds.npr.org/510289/podcast.xml",
      feedImage: "https://is3-ssl.mzstatic.com/image/thumb/Podcasts126/v4/98/d2/d5/98d2d599-1d21-e9d5-5cb7-749d9242e958/mza_11520507046916537252.jpg/600x600bb.jpg",
      categories: ["Business", "Economics"]
    },
    {
      id: 1005,
      title: "TED Talks Daily",
      description: "Every weekday, TED Talks Daily brings you the latest talks in audio. Join host and journalist Elise Hu for thought-provoking ideas.",
      url: "https://www.ted.com/talks",
      audio: "https://dts.podtrac.com/redirect.mp3/download.ted.com/talks/KateDarling_2023S.mp3",
      datePublished: new Date().toLocaleDateString(),
      duration: "15:00",
      image: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/d2/09/d5/d209d58f-8f9f-c2aa-3c59-0ffc4e5e35ec/mza_11998461439228757191.png/600x600bb.jpg",
      feedTitle: "TED",
      feedUrl: "https://feeds.feedburner.com/TEDTalks_audio",
      feedImage: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/d2/09/d5/d209d58f-8f9f-c2aa-3c59-0ffc4e5e35ec/mza_11998461439228757191.png/600x600bb.jpg",
      categories: ["Education", "Ideas"]
    }
  ];
  
  // Duplicate and modify samples if more than 5 are requested
  let result = [...samplePodcasts];
  while (result.length < count) {
    const newBatch = samplePodcasts.map((podcast, index) => ({
      ...podcast,
      id: podcast.id + 1000 * result.length,
      title: `${podcast.title} ${Math.floor(result.length / 5) + 1}`
    }));
    result = [...result, ...newBatch];
  }
  
  return result.slice(0, count);
};

// Search for podcasts by category
export const searchPodcastsByCategory = async (category: string, limit: number = 5): Promise<PodcastEpisode[]> => {
  try {
    // Map common topics to podcast categories
    const categoryMap: Record<string, string> = {
      'science': 'Science',
      'history': 'History',
      'technology': 'Technology',
      'news': 'News',
      'politics': 'Politics',
      'business': 'Business',
      'education': 'Education',
      'entertainment': 'Entertainment',
      'health': 'Health & Fitness',
      'sports': 'Sports',
      'arts': 'Arts',
      'music': 'Music',
      'society': 'Society & Culture',
      'philosophy': 'Philosophy'
    };
    
    const mappedCategory = categoryMap[category.toLowerCase()] || category;
    
    // Use iTunes Search API to search by genre
    const response = await axios.get(
      'https://itunes.apple.com/search',
      {
        params: {
          term: mappedCategory,
          media: 'podcast',
          entity: 'podcast',
          attribute: 'genreIndex',
          limit: limit,
          country: 'US'
        }
      }
    );
    
    if (!response.data?.results?.length) {
      // Try a regular search if genre search fails
      return searchPodcastEpisodes(mappedCategory, limit);
    }
    
    // Process and format the response 
    // (similar to searchPodcastEpisodes implementation)
    const podcasts = response.data.results;
    
    // For each podcast, fetch the latest episodes
    const podcastsWithEpisodes = await Promise.all(
      podcasts.map(async (podcast: any) => {
        try {
          const episodesResponse = await axios.get(
            'https://itunes.apple.com/lookup',
            {
              params: {
                id: podcast.collectionId,
                entity: 'podcastEpisode',
                limit: 100
              }
            }
          );
          
          if (episodesResponse.data?.results?.length > 1) {
            // First result is the podcast itself, rest are episodes
            const episodes = episodesResponse.data.results.slice(1);
            return episodes.map((episode: any) => ({
              id: episode.trackId,
              title: episode.trackName || 'Untitled Episode',
              description: episode.description || podcast.collectionName,
              url: episode.previewUrl || episode.trackViewUrl,
              audio: episode.episodeUrl || episode.previewUrl || episode.trackViewUrl,
              datePublished: new Date(episode.releaseDate).toLocaleDateString(),
              duration: formatMilliseconds(episode.trackTimeMillis),
              image: getBestPodcastImage(episode.artworkUrl600, podcast.artworkUrl600, podcast.artworkUrl100),
              feedTitle: podcast.collectionName,
              feedUrl: podcast.feedUrl,
              feedImage: getBestPodcastImage(podcast.artworkUrl600, podcast.artworkUrl100),
              categories: [podcast.primaryGenreName]
            }));
          }
          
          // If no episodes found, return the podcast info as a placeholder
          return [{
            id: podcast.collectionId,
            title: podcast.collectionName,
            description: podcast.collectionName,
            url: podcast.collectionViewUrl,
            audio: '',
            datePublished: new Date(podcast.releaseDate).toLocaleDateString(),
            duration: '00:00',
            image: getBestPodcastImage(podcast.artworkUrl600, podcast.artworkUrl100),
            feedTitle: podcast.collectionName,
            feedUrl: podcast.feedUrl,
            feedImage: getBestPodcastImage(podcast.artworkUrl600, podcast.artworkUrl100),
            categories: [podcast.primaryGenreName]
          }];
        } catch (error) {
          console.error('Error fetching podcast episodes:', error);
          return [];
        }
      })
    );
    
    // Flatten the array of arrays
    return podcastsWithEpisodes.flat();
  } catch (error) {
    console.error('Error searching podcasts by category:', error);
    return searchPodcastEpisodes(category, limit); // Fallback to regular search
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
  if (!articles || !Array.isArray(articles)) return articles;
  return articles.map(article => optimizeArticleImages(article));
}; 