/**
 * Script to fetch Wikipedia articles and save as static JSON files
 * Run with: node scripts/fetch-wiki.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Configuration
const CONFIG = {
  TOTAL_ARTICLES: 100,
  ARTICLES_PER_BATCH: 5,
  MIN_QUALITY_SCORE: 40,
  USER_AGENT: 'WikiWave/1.0',
  MAX_RETRIES: 3,
  TIMEOUT_MS: 15000,
  SOURCES: {
    wikipedia: 0.7,   // 70% Wikipedia
    wikievents: 0.2,  // 20% On This Day
    hackernews: 0.1   // 10% Hacker News
  }
};

/**
 * Helper function to make HTTPS requests with timeout
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': CONFIG.USER_AGENT
      },
      timeout: CONFIG.TIMEOUT_MS
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Request failed with status code ${res.statusCode}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const data = Buffer.concat(chunks).toString();
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${CONFIG.TIMEOUT_MS}ms`));
    });
  });
}

/**
 * Calculate an article's quality score (0-100)
 */
function calculateQualityScore(article) {
  if (!article) return 0;
  
  let score = 0;
  
  // Meaningful title (1-10 points)
  if (article.title) {
    const titleLength = article.title.length;
    score += Math.min(10, Math.max(1, titleLength / 5));
  }
  
  // Has an extract (0-40 points)
  if (article.extract) {
    const extractLength = article.extract.length;
    score += Math.min(40, extractLength / 20);
  }
  
  // Has thumbnail (0-20 points)
  if (article.thumbnail && article.thumbnail.source) {
    score += 20;
  }
  
  // Has multiple related images (0-10 points)
  if (article.media && article.media.length > 0) {
    score += Math.min(10, article.media.length * 2);
  }
  
  // Has internal links (0-10 points)
  if (article.links && article.links.length > 0) {
    score += Math.min(10, article.links.length);
  }
  
  // Has categories (0-10 points)
  if (article.categories && article.categories.length > 0) {
    score += Math.min(10, article.categories.length);
  }
  
  // Round to integer
  return Math.round(score);
}

/**
 * Filter articles based on quality score
 */
function filterHighQualityArticles(articles, minQualityScore = CONFIG.MIN_QUALITY_SCORE) {
  return articles.filter(article => {
    const score = calculateQualityScore(article);
    article.qualityScore = score; // Add score to article
    return score >= minQualityScore;
  });
}

/**
 * Fetch random Wikipedia articles
 */
async function fetchWikipediaArticles(count) {
  console.log(`Fetching ${count} Wikipedia articles...`);
  
  const articles = [];
  let retryCount = 0;
  
  while (articles.length < count && retryCount < CONFIG.MAX_RETRIES) {
    try {
      // Use the random article endpoint
      const url = `https://en.wikipedia.org/api/rest_v1/page/random/summary?redirect=false`;
      const batchSize = Math.min(CONFIG.ARTICLES_PER_BATCH, count - articles.length);
      
      // Fetch multiple articles in parallel
      const batchPromises = Array(batchSize).fill().map(async () => {
        const data = await fetchUrl(url);
        const article = JSON.parse(data);
        
        return {
          pageid: article.pageid,
          title: article.title,
          extract: article.extract,
          thumbnail: article.thumbnail,
          url: article.content_urls?.desktop?.page || '',
          source: 'wikipedia',
          media: [article.thumbnail].filter(Boolean),
          categories: [],
          dateAdded: new Date().toISOString()
        };
      });
      
      const batchResults = await Promise.all(batchPromises);
      const highQualityArticles = filterHighQualityArticles(batchResults);
      
      if (highQualityArticles.length > 0) {
        articles.push(...highQualityArticles);
        console.log(`Fetched ${articles.length}/${count} Wikipedia articles`);
      } else {
        console.log('No high-quality articles found in this batch, retrying...');
        retryCount++;
      }
    } catch (error) {
      console.error(`Error fetching Wikipedia articles: ${error.message}`);
      retryCount++;
      
      if (retryCount < CONFIG.MAX_RETRIES) {
        console.log(`Retrying (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES})...`);
      }
    }
  }
  
  return articles;
}

/**
 * Fetch "On This Day" events
 */
async function fetchOnThisDayEvents(count) {
  console.log(`Fetching ${count} "On This Day" events...`);
  
  try {
    // Get current month and day
    const today = new Date();
    const month = today.getMonth() + 1; // getMonth() is 0-indexed
    const day = today.getDate();
    
    // Fetch events from wikimedia on-this-day API
    const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`;
    const data = await fetchUrl(url);
    const response = JSON.parse(data);
    
    if (!response.events || response.events.length === 0) {
      console.warn('No events found for today');
      return [];
    }
    
    // Shuffle events to get different ones each time
    const shuffledEvents = response.events.sort(() => Math.random() - 0.5);
    const selectedEvents = shuffledEvents.slice(0, count);
    
    // Convert to article format
    const articles = selectedEvents.map(event => {
      // Create a deterministic ID based on the event year and text
      const eventId = `wikievent-${event.year}-${
        Buffer.from(event.text).toString('base64').substring(0, 10)
      }`;
      
      const thumbnail = event.pages?.[0]?.thumbnail?.source
        ? {
            source: event.pages[0].thumbnail.source,
            width: event.pages[0].thumbnail.width,
            height: event.pages[0].thumbnail.height
          }
        : null;
      
      return {
        pageid: eventId,
        title: `${event.year}: ${event.text.split('.')[0]}`,
        extract: event.text,
        url: event.pages?.[0]?.content_urls?.desktop?.page || '',
        thumbnail: thumbnail,
        source: 'wikievents',
        media: thumbnail ? [thumbnail] : [],
        categories: ['history', 'on-this-day'],
        dateAdded: new Date().toISOString(),
        year: event.year
      };
    });
    
    // Filter high-quality articles
    const highQualityArticles = filterHighQualityArticles(articles, 30); // Lower threshold for events
    console.log(`Fetched ${highQualityArticles.length} "On This Day" events`);
    
    return highQualityArticles.slice(0, count);
  } catch (error) {
    console.error(`Error fetching "On This Day" events: ${error.message}`);
    return [];
  }
}

/**
 * Fetch top Hacker News stories
 */
async function fetchHackerNewsStories(count) {
  console.log(`Fetching ${count} Hacker News stories...`);
  
  try {
    // Fetch top stories IDs
    const topStoriesUrl = 'https://hacker-news.firebaseio.com/v0/topstories.json';
    const topStoriesData = await fetchUrl(topStoriesUrl);
    const storyIds = JSON.parse(topStoriesData);
    
    if (!storyIds || storyIds.length === 0) {
      console.warn('No Hacker News stories found');
      return [];
    }
    
    // Shuffle and select a subset of story IDs
    const shuffledIds = storyIds.sort(() => Math.random() - 0.5).slice(0, count * 2);
    
    // Fetch individual story details in parallel
    const storyPromises = shuffledIds.map(async (id) => {
      const storyUrl = `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
      const storyData = await fetchUrl(storyUrl);
      return JSON.parse(storyData);
    });
    
    const stories = await Promise.all(storyPromises);
    
    // Convert to article format
    const articles = stories
      .filter(story => story && story.title && story.url) // Filter stories with title and URL
      .map(story => {
        // Create extract from story text if available
        let extract = '';
        if (story.text) {
          // Clean HTML from text
          extract = story.text.replace(/<[^>]*>/g, ' ').trim();
        }
        
        // Use points and comments count to enhance extract
        const pointsText = story.score ? `${story.score} points` : '';
        const commentsText = story.descendants ? `${story.descendants} comments` : '';
        const statsText = [pointsText, commentsText].filter(Boolean).join(', ');
        
        if (statsText) {
          extract = extract ? `${extract} (${statsText})` : `(${statsText})`;
        }
        
        // If no extract, create one from the URL
        if (!extract) {
          try {
            const url = new URL(story.url);
            extract = `Article from ${url.hostname}`;
          } catch (e) {
            extract = 'Hacker News story';
          }
        }
        
        return {
          pageid: `hn-${story.id}`,
          title: story.title,
          extract: extract,
          url: story.url,
          thumbnail: null, // No thumbnails in HN API
          source: 'hackernews',
          media: [],
          categories: ['technology', 'hackernews'],
          dateAdded: new Date().toISOString(),
          hnId: story.id,
          hnScore: story.score,
          hnComments: story.descendants
        };
      });
    
    // Filter high-quality articles
    const highQualityArticles = filterHighQualityArticles(articles, 30); // Lower threshold for HN
    console.log(`Fetched ${highQualityArticles.length} Hacker News stories`);
    
    return highQualityArticles.slice(0, count);
  } catch (error) {
    console.error(`Error fetching Hacker News stories: ${error.message}`);
    return [];
  }
}

/**
 * Calculate article counts based on configured source weights
 */
function calculateArticleCounts(totalArticles) {
  const counts = {};
  let remaining = totalArticles;
  
  // Calculate counts based on weights
  Object.entries(CONFIG.SOURCES).forEach(([source, weight], index, arr) => {
    const isLast = index === arr.length - 1;
    if (isLast) {
      counts[source] = remaining;
    } else {
      counts[source] = Math.round(totalArticles * weight);
      remaining -= counts[source];
    }
  });
  
  return counts;
}

/**
 * Main function to fetch articles from all sources
 */
async function fetchAllArticles() {
  // Calculate how many articles to fetch from each source
  const counts = calculateArticleCounts(CONFIG.TOTAL_ARTICLES);
  console.log('Article distribution:', counts);
  
  // Fetch articles from each source
  const articles = [];
  
  // Wikipedia
  if (counts.wikipedia > 0) {
    const wikipediaArticles = await fetchWikipediaArticles(counts.wikipedia);
    articles.push(...wikipediaArticles);
  }
  
  // On This Day
  if (counts.wikievents > 0) {
    const wikiEvents = await fetchOnThisDayEvents(counts.wikievents);
    articles.push(...wikiEvents);
  }
  
  // Hacker News
  if (counts.hackernews > 0) {
    const hnStories = await fetchHackerNewsStories(counts.hackernews);
    articles.push(...hnStories);
  }
  
  // Shuffle the articles to mix the sources
  const shuffledArticles = articles.sort(() => Math.random() - 0.5);
  
  return shuffledArticles;
}

/**
 * Save articles to a file
 */
function saveArticlesToFile(articles) {
  const filePath = path.join(dataDir, 'wiki.json');
  
  const sourceStats = {};
  articles.forEach(article => {
    sourceStats[article.source] = (sourceStats[article.source] || 0) + 1;
  });
  
  const outputData = {
    articles: articles,
    count: articles.length,
    sources: sourceStats,
    fetchedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2));
  console.log(`Saved ${articles.length} articles to ${filePath}`);
  
  // Print source statistics
  console.log('\nSource statistics:');
  Object.entries(sourceStats).forEach(([source, count]) => {
    console.log(`- ${source}: ${count} articles (${Math.round(count / articles.length * 100)}%)`);
  });
}

/**
 * Main execution function
 */
async function main() {
  console.log('Starting article fetch...');
  
  try {
    // Fetch all articles
    const articles = await fetchAllArticles();
    
    // Save to file
    saveArticlesToFile(articles);
    
    console.log('\nAll articles fetched and saved successfully! 🎉');
  } catch (error) {
    console.error('Error during execution:', error);
    process.exit(1);
  }
}

// Run the script
main(); 