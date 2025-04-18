/**
 * Application configuration handling environment-specific settings
 */

// Cache durations in milliseconds
export const CACHE_DURATIONS = {
  // Short cache for development, longer for production
  ARTICLES: process.env.NODE_ENV === 'production' ? 12 * 60 * 60 * 1000 : 30 * 60 * 1000, // 12 hours in production, 30 minutes in dev
  PODCASTS: process.env.NODE_ENV === 'production' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000, // 24 hours in production, 1 hour in dev
  IMAGES: process.env.NODE_ENV === 'production' ? 7 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000, // 7 days in production, 2 hours in dev
};

// API configuration
export const API_CONFIG = {
  // APIs with public access endpoints
  WIKIPEDIA: {
    BASE_URL: 'https://en.wikipedia.org/api/rest_v1',
    RANDOM_URL: 'https://en.wikipedia.org/api/rest_v1/page/random/summary',
    USER_AGENT: 'WikiWave/1.0',
  },
  WIKIMEDIA: {
    BASE_URL: 'https://commons.wikimedia.org/w/api.php',
    USER_AGENT: 'WikiWave/1.0',
  },
  ONTHISDAY: {
    BASE_URL: 'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday',
    USER_AGENT: 'WikiWave/1.0',
  },
  HACKERNEWS: {
    BASE_URL: 'https://hacker-news.firebaseio.com/v0',
    USER_AGENT: 'WikiWave/1.0',
  },
  REDDIT: {
    // Reddit requires a User-Agent header
    USER_AGENT: 'WikiWave/1.0 (web app for exploration)',
  }
};

// Feature flags
export const FEATURES = {
  OFFLINE_SUPPORT: true,
  USE_CACHE: true,
  PRELOAD_IMAGES: true,
  DEBUG_MODE: process.env.NODE_ENV !== 'production',
};

// Content limits
export const CONTENT_LIMITS = {
  MAX_ARTICLES: 100,
  ARTICLES_PER_LOAD: 10,
  MAX_PODCASTS: 50,
};

export default {
  CACHE_DURATIONS,
  API_CONFIG,
  FEATURES,
  CONTENT_LIMITS,
}; 