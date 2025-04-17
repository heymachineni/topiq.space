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
      // First attempt to get a featured article with image
      try {
        // Try to get a featured article first (these usually have better content and images)
        const featuredResponse = await axios.get('https://en.wikipedia.org/api/rest_v1/page/featured/today');
        if (featuredResponse.data && featuredResponse.data.tfa) {
          const data = featuredResponse.data.tfa;
          
          // Convert thumbnail to high-res
          const highResThumbnail = getHighResImage(data.thumbnail);
          
          // Check if this featured article has a good quality image
          if (!highResThumbnail || 
              !highResThumbnail.source || 
              highResThumbnail.source.includes("question") || 
              (highResThumbnail.width && highResThumbnail.width < 800)) {
            // Skip and try a random article instead
            console.log('Featured article had low quality image, falling back to random');
            throw new Error('Low quality image in featured article');
          }
          
          return {
            pageid: data.pageid,
            title: data.title,
            extract: data.extract || data.description,
            extract_html: data.extract_html,
            thumbnail: highResThumbnail,
            description: data.description,
            source: 'wikipedia' as ContentSource
          };
        }
      } catch (featuredError) {
        console.log('Could not fetch featured article, falling back to random:', featuredError);
      }
      
      // Use the official Wikipedia API for random article with larger thumbnails
      // Convert to REST API call with parameters to ensure high quality images
      const response = await axios.get('https://en.wikipedia.org/api/rest_v1/page/random/summary', {
        params: {
          redirect: false,
          thumbsize: 1600  // Request a larger thumbnail - increased from 1024 to 1600
        }
      });
      
      const data = response.data;
      
      // Skip articles without thumbnails or with low quality images - enforcing minimum width of 800
      if (!data.thumbnail || 
          !data.thumbnail.source || 
          data.thumbnail.source.includes("question") || 
          (data.thumbnail.width && data.thumbnail.width < 800)) {
        // Try again recursively until we find a good image
        console.log('Skipping article with low quality image, trying again');
        return fetchRandomWikipediaArticle();
      }
      
      // Convert thumbnail to high-res
      const highResThumbnail = getHighResImage(data.thumbnail);
      
      return {
        pageid: data.pageid,
        title: data.title,
        extract: data.extract,
        extract_html: data.extract_html,
        thumbnail: highResThumbnail,
        description: data.description,
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
    // Request extra articles to allow for quality filtering
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
      return highQualityArticles.slice(0, count);
    }
    
    // Otherwise return all high quality articles we found
    return highQualityArticles;
  } catch (error) {
    console.error('Error fetching random articles:', error);
    throw error;
  }
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
              thumbsize: 1600 // Request larger thumbnails - increased from 1024 to 1600
            }
          });
          
          const data = response.data;
          
          // Skip articles without thumbnails or with low quality images
          if (!data.thumbnail || 
              !data.thumbnail.source || 
              data.thumbnail.source.includes("question") || 
              (data.thumbnail.width && data.thumbnail.width < 800)) {
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
      return articles.filter(article => article !== null);
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
                  (page.thumbnail.width && page.thumbnail.width < 800)) {
                // Try to get a better image through the REST API
                try {
                  const pageDetails = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`, {
                    params: {
                      redirect: false,
                      thumbsize: 1600 // Increased from 1024 to 1600 for higher resolution
                    }
                  });
                  
                  if (pageDetails.data && 
                      pageDetails.data.thumbnail && 
                      pageDetails.data.thumbnail.source &&
                      !pageDetails.data.thumbnail.source.includes("question") &&
                      pageDetails.data.thumbnail.width >= 800) {
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
  if (!article) return 0;
  
  let score = 0;
  
  // Score based on having a thumbnail image
  if (article.thumbnail && article.thumbnail.source) {
    // Check for low-quality image patterns
    const imgSrc = article.thumbnail.source;
    const isLowQuality = 
      imgSrc.includes('thumb/') || 
      imgSrc.includes('thumbnail') || 
      imgSrc.includes('_small.') ||
      imgSrc.includes('-small.') ||
      imgSrc.includes('_thumb.') ||
      imgSrc.includes('w200') ||
      imgSrc.includes('width=200') ||
      imgSrc.includes('w100') ||
      (article.thumbnail.width && article.thumbnail.width < 300);
      
    if (isLowQuality) {
      score += 10; // Give only minimal points for low quality images
    } else {
      score += 35; // Give significant weight to having a good image
      
      // Higher score for larger images
      if (article.thumbnail.width && article.thumbnail.height) {
        // Score boost for high-resolution images
        const area = article.thumbnail.width * article.thumbnail.height;
        if (area > 250000) { // Large image (500x500+)
          score += 20;
        } else if (area > 90000) { // Medium image (300x300+)
          score += 15;
        } else if (area > 40000) { // Small image (200x200+)
          score += 5;
        }
      } else {
        // If no dimensions specified but image URL suggests high quality
        if (
          imgSrc.includes('1200w') || 
          imgSrc.includes('original') || 
          imgSrc.includes('full') ||
          imgSrc.includes('large')
        ) {
          score += 15;
        }
      }
    }
  }
  
  // Score based on having a good extract (content)
  if (article.extract) {
    // Basic points for having any content
    score += 10;
    
    // More points for longer, substantial content
    const wordCount = article.extract.split(/\s+/).length;
    if (wordCount > 200) { // Very detailed
      score += 15;
    } else if (wordCount > 100) { // Good detail
      score += 10;
    } else if (wordCount > 50) { // Moderate detail
      score += 5;
    }
    
    // Penalize very short extracts
    if (wordCount < 20) {
      score -= 15;
    }
    
    // Bonus for having HTML-formatted content (usually more detailed)
    if (article.extract_html) {
      score += 5;
    }
  }
  
  // Score based on having a good description
  if (article.description && article.description.length > 10) {
    score += 5;
  }
  
  // Score boost for Wikipedia articles (generally higher quality content)
  if (article.source === 'wikipedia') {
    score += 5;
  }
  
  // Score boost for movie content (typically high quality)
  if (article.source === 'movie') {
    score += 10;
  }
  
  return score;
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
  const allArticles: WikipediaArticle[] = [];
  const sourceCounts: Record<string, number> = {};
  
  // Request more articles than needed to allow for quality filtering
  const multiplier = 2; // Request 2x the number of articles
  
  // Fetch from each source based on the requests
  const promises: Promise<any>[] = []; // Change to any to handle different promise return types
  
  // Wikipedia
  if (sourceRequests.wikipedia && sourceRequests.wikipedia > 0) {
    const count = sourceRequests.wikipedia * multiplier;
    promises.push(
      fetchRandomArticles(count)
        .then(articles => {
          allArticles.push(...articles);
          sourceCounts['wikipedia'] = articles.length;
        })
        .catch(err => console.error('Error fetching Wikipedia articles:', err))
    );
  }
  
  // Wikipedia Current Events Portal
  if (sourceRequests.wikievents && sourceRequests.wikievents > 0) {
    const count = sourceRequests.wikievents * multiplier;
    promises.push(
      fetchWikipediaCurrentEvents(count)
        .then(articles => {
          allArticles.push(...articles);
          sourceCounts['wikievents'] = articles.length;
        })
        .catch(err => console.error('Error fetching Wikipedia current events:', err))
    );
  }
  
  // RSS Feeds
  if (sourceRequests.rss && sourceRequests.rss > 0) {
    const count = sourceRequests.rss * multiplier;
    promises.push(
      fetchRssFeeds(count)
        .then(articles => {
          allArticles.push(...articles);
          sourceCounts['rss'] = articles.length;
        })
        .catch(err => console.error('Error fetching RSS feeds:', err))
    );
  }
  
  // Reddit
  if (sourceRequests.reddit && sourceRequests.reddit > 0) {
    const count = sourceRequests.reddit * multiplier;
    promises.push(
      fetchRedditPosts(count)
        .then(articles => {
          allArticles.push(...articles);
          sourceCounts['reddit'] = articles.length;
        })
        .catch(err => console.error('Error fetching Reddit posts:', err))
    );
  }
  
  // Hacker News
  if (sourceRequests.hackernews && sourceRequests.hackernews > 0) {
    const count = sourceRequests.hackernews * multiplier;
    promises.push(
      fetchHackerNewsStories(count)
        .then(articles => {
          allArticles.push(...articles);
          sourceCounts['hackernews'] = articles.length;
        })
        .catch(err => console.error('Error fetching Hacker News stories:', err))
    );
  }
  
  // On This Day
  if (sourceRequests.onthisday && sourceRequests.onthisday > 0) {
    const count = sourceRequests.onthisday * multiplier;
    promises.push(
      fetchOnThisDayEvents(count)
        .then(articles => {
          allArticles.push(...articles);
          sourceCounts['onthisday'] = articles.length;
        })
        .catch(err => console.error('Error fetching On This Day events:', err))
    );
  }
  
  // OK Surf
  if (sourceRequests.oksurf && sourceRequests.oksurf > 0) {
    const count = sourceRequests.oksurf * multiplier;
    promises.push(
      fetchOkSurfNews(count)
        .then(articles => {
          allArticles.push(...articles);
          sourceCounts['oksurf'] = articles.length;
        })
        .catch(err => console.error('Error fetching OK Surf news:', err))
    );
  }
  
  // Movies & TV Shows
  if (sourceRequests.movie && sourceRequests.movie > 0) {
    const count = sourceRequests.movie * multiplier;
    promises.push(
      fetchTrendingMovies(count)
        .then(articles => {
          allArticles.push(...articles);
          sourceCounts['movie'] = articles.length;
        })
        .catch(err => console.error('Error fetching Movie/TV data:', err))
    );
  }
  
  // Wait for all fetches to complete
  await Promise.all(promises);
  
  // Apply high resolution image optimization to all articles
  const optimizedArticles = optimizeArticleImagesArray(allArticles);
  
  console.log('Source distribution before filtering:', sourceCounts);
  
  // Apply quality filtering - prioritize articles with good content and images
  const highQualityArticles = filterHighQualityArticles(optimizedArticles);
  
  // Get distribution of sources after filtering
  const finalSourceCounts: Record<string, number> = {};
  highQualityArticles.forEach(article => {
    const source = article.source || 'unknown';
    finalSourceCounts[source] = (finalSourceCounts[source] || 0) + 1;
  });
  
  console.log('Source distribution after filtering:', finalSourceCounts);
  
  // Log quality metrics
  console.log(`Article quality filtering: ${highQualityArticles.length}/${optimizedArticles.length} articles passed quality check`);
  
  // Ensure we maintain a mix of sources in the final result
  const finalResult = balanceSourceDistribution(highQualityArticles, sourceRequests);
  
  // Shuffle the articles to mix sources
  return shuffleArray(finalResult);
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

// Format milliseconds to mm:ss format
const formatMilliseconds = (ms: number): string => {
  if (!ms) return '00:00';
  
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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

// ========== MOVIE/SHOW API (Wikidata) ==========
// Get trending movies and shows from Wikidata (open data)
export async function fetchTrendingMovies(count: number = 5): Promise<WikipediaArticle[]> {
  const cacheKey = 'wikidata_movies';
  
  const fetchFn = async () => {
    try {
      // Improved Wikidata SPARQL query to get high-quality movie data
      // This query specifically targets films with awards, high IMDB ratings, and images
      const sparqlQuery = `
        SELECT ?film ?filmLabel ?description ?image ?date ?imdbId WHERE {
          ?film wdt:P31 wd:Q11424.
          ?film wdt:P577 ?date.
          ?film wdt:P18 ?image.
          OPTIONAL { ?film wdt:P345 ?imdbId. }
          OPTIONAL { ?film schema:description ?description. FILTER(LANG(?description) = "en"). }
          
          # Ensure quality content by requiring one of these quality markers
          {
            # Has received an award
            ?film wdt:P166 ?award.
          } UNION {
            # Or has high IMDb rating (7+)
            ?film wdt:P345 ?id.
            ?film p:P444 ?imdbRatingStatement.
            ?imdbRatingStatement ps:P444 ?rating.
            FILTER(?rating >= 7)
          } UNION {
            # Or is considered a notable film (featured in lists/collections)
            ?film wdt:P1411 ?nominatedFor.
          } UNION {
            # Or was released recently (last 3 years)
            BIND(YEAR(NOW()) - 3 as ?cutoffYear)
            FILTER(YEAR(?date) >= ?cutoffYear)
          }
          
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
        ORDER BY DESC(?date)
        LIMIT 50
      `;
      
      const url = 'https://query.wikidata.org/sparql';
      const response = await axios.get(url, {
        params: {
          query: sparqlQuery,
          format: 'json'
        },
        headers: {
          'Accept': 'application/sparql-results+json',
          'User-Agent': 'WikiApp/1.0'
        }
      });
      
      if (!response.data || !response.data.results || !response.data.results.bindings || 
          response.data.results.bindings.length === 0) {
        console.error('No movie data found from Wikidata');
        return createMockMovieData(count);
      }
      
      const results = response.data.results.bindings;
      console.log(`Fetched ${results.length} movies from Wikidata`);
      
      // Convert to WikipediaArticle format
      const articles = results.map((movie: any) => {
        const title = movie.filmLabel?.value || 'Unknown Movie';
        const extract = movie.description?.value || `A film titled "${title}"`;
        const year = movie.date?.value ? new Date(movie.date.value).getFullYear() : '';
        const wikidataId = movie.film.value.split('/').pop();
        
        // Format thumbnail URL - request a larger size directly
        let thumbnailUrl = '';
        if (movie.image?.value) {
          // Get proper Commons image URL
          const filename = movie.image.value.split('/').pop();
          thumbnailUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=800`;
        }
        
        return {
          pageid: parseInt(wikidataId.replace('Q', ''), 10),
          title: title,
          extract: extract,
          thumbnail: thumbnailUrl ? { 
            source: thumbnailUrl,
            width: 800,
            height: 1200
          } : undefined,
          description: `${year ? year + ' • ' : ''}Film`,
          source: 'movie' as ContentSource,
          url: `https://www.wikidata.org/wiki/${wikidataId}`
        };
      });
      
      // Filter for articles with thumbnails
      const withImages = articles.filter((a: WikipediaArticle) => a.thumbnail?.source);
      
      if (withImages.length < count) {
        console.warn(`Only found ${withImages.length} movies with images, using mock data to supplement`);
        const mockMovies = createMockMovieData(count - withImages.length);
        return [...withImages, ...mockMovies].slice(0, count);
      }
      
      // Return a random selection from the filtered results
      return shuffleArray(withImages).slice(0, count);
    } catch (error) {
      console.error('Error fetching movie data from Wikidata:', error);
      return createMockMovieData(count);
    }
  };
  
  return await getFromCacheOrFetch(cacheKey, fetchFn);
}

// Fallback data for movies in case the API is down
function createMockMovieData(count: number): WikipediaArticle[] {
  console.log("Creating mock movie data:", count);
  
  const mockMovies = [
    {
      pageid: 12345678,
      title: "Dune: Part Two",
      extract: "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the universe, he must prevent a terrible future only he can foresee.",
      thumbnail: {
        source: "https://upload.wikimedia.org/wikipedia/en/thumb/5/58/Dune_Part_Two_poster.jpeg/320px-Dune_Part_Two_poster.jpeg",
        width: 320,
        height: 500
      },
      description: "2024 • Film",
      source: 'movie' as ContentSource,
      url: "https://www.wikidata.org/wiki/Q63985561"
    },
    {
      pageid: 23456789,
      title: "Oppenheimer",
      extract: "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.",
      thumbnail: {
        source: "https://upload.wikimedia.org/wikipedia/en/thumb/4/4a/Oppenheimer_%28film%29.jpg/320px-Oppenheimer_%28film%29.jpg",
        width: 320,
        height: 500
      },
      description: "2023 • Film",
      source: 'movie' as ContentSource,
      url: "https://www.wikidata.org/wiki/Q55001181"
    },
    {
      pageid: 34567890,
      title: "Everything Everywhere All at Once",
      extract: "A middle-aged Chinese immigrant is swept up in an insane adventure in which she alone can save existence by exploring other universes and connecting with the lives she could have led.",
      thumbnail: {
        source: "https://upload.wikimedia.org/wikipedia/en/1/1e/Everything_Everywhere_All_at_Once.jpg",
        width: 320,
        height: 500
      },
      description: "2022 • Film",
      source: 'movie' as ContentSource,
      url: "https://www.wikidata.org/wiki/Q83808505"
    },
    {
      pageid: 45678901,
      title: "Poor Things",
      extract: "The incredible tale about the fantastical evolution of Bella Baxter, a young woman brought back to life by the brilliant and unorthodox scientist Dr. Godwin Baxter.",
      thumbnail: {
        source: "https://upload.wikimedia.org/wikipedia/en/f/fa/Poor_Things_%28film%29.jpg",
        width: 320,
        height: 500
      },
      description: "2023 • Film",
      source: 'movie' as ContentSource,
      url: "https://www.wikidata.org/wiki/Q111323779"
    },
    {
      pageid: 56789012,
      title: "Parasite",
      extract: "Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.",
      thumbnail: {
        source: "https://upload.wikimedia.org/wikipedia/en/5/53/Parasite_%282019_film%29.png",
        width: 320,
        height: 500
      },
      description: "2019 • Film",
      source: 'movie' as ContentSource,
      url: "https://www.wikidata.org/wiki/Q61448040"
    }
  ];
  
  // Return a slice of the mock data up to the requested count
  return mockMovies.slice(0, count);
}