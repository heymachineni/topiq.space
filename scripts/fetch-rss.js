/**
 * Script to fetch RSS feed articles and save as static JSON
 * Run with: node scripts/fetch-rss.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Configuration
const CONFIG = {
  ARTICLES_PER_FEED: 20,
  USER_AGENT: 'WikiWave/1.0',
  MAX_RETRIES: 3,
  TIMEOUT_MS: 10000
};

// RSS feed sources
const RSS_FEEDS = [
  {
    id: 'hackernews',
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage?count=30',
    category: 'technology'
  },
  {
    id: 'theconversation',
    name: 'The Conversation',
    url: 'https://theconversation.com/articles.atom',
    category: 'science'
  },
  {
    id: 'sciencedaily',
    name: 'Science Daily',
    url: 'https://www.sciencedaily.com/rss/all.xml',
    category: 'science'
  },
  {
    id: 'reddit-technology',
    name: 'Reddit Technology',
    url: 'https://www.reddit.com/r/technology/top/.rss?sort=top&t=day',
    category: 'technology'
  },
  {
    id: 'reddit-science',
    name: 'Reddit Science',
    url: 'https://www.reddit.com/r/science/top/.rss?sort=top&t=day',
    category: 'science'
  },
  {
    id: 'newyorker',
    name: 'New Yorker',
    url: 'https://www.newyorker.com/feed/everything',
    category: 'culture'
  },
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    category: 'technology'
  },
  {
    id: 'newyorktimes',
    name: 'New York Times',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    category: 'news'
  }
];

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
 * Parse XML content to extract RSS items
 */
function parseRssFeed(xml) {
  const items = [];
  
  // Simple regex-based parsing for demonstration
  // In production, use a proper XML parser like xml2js
  const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/g;
  
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    items.push({
      title: decodeHtmlEntities(match[1].trim()),
      link: match[2].trim(),
      description: cleanDescription(match[3]),
      pubDate: match[4].trim(),
    });
  }
  
  // If no items found with standard RSS format, try Atom format
  if (items.length === 0) {
    const entryRegex = /<entry>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>[\s\S]*?<link[^>]*href="([^"]*)"[^>]*\/>[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>[\s\S]*?<published>([\s\S]*?)<\/published>[\s\S]*?<\/entry>/g;
    
    while ((match = entryRegex.exec(xml)) !== null) {
      items.push({
        title: decodeHtmlEntities(match[1].trim()),
        link: match[2].trim(),
        description: cleanDescription(match[3]),
        pubDate: match[4].trim(),
      });
    }
  }
  
  return items;
}

/**
 * Clean HTML from description and limit length
 */
function cleanDescription(html) {
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, ' ');
  
  // Decode HTML entities
  text = decodeHtmlEntities(text);
  
  // Remove excessive whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  // Limit to reasonable length
  const maxLength = 500;
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + '...';
  }
  
  return text;
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
}

/**
 * Convert RSS items to our article format
 */
function transformRssItems(items, feedId, feedName, category) {
  return items.map(item => {
    // Generate deterministic ID based on link
    const id = crypto.createHash('md5').update(item.link).digest('hex');
    
    // Extract thumbnail if available in description (simplified)
    let thumbnail = null;
    const imgMatch = item.description.match(/<img[^>]*src="([^"]*)"[^>]*>/);
    if (imgMatch) {
      thumbnail = imgMatch[1];
    }
    
    // Parse date
    let pubDate = new Date();
    try {
      pubDate = new Date(item.pubDate);
      if (isNaN(pubDate.getTime())) {
        pubDate = new Date();
      }
    } catch (e) {
      console.warn(`Invalid date format: ${item.pubDate}`);
    }
    
    return {
      id: `${feedId}-${id}`,
      title: item.title,
      extract: item.description,
      url: item.link,
      thumbnail: thumbnail,
      images: thumbnail ? [{ url: thumbnail }] : [],
      categories: [category],
      source: 'rss',
      feedId: feedId,
      feedName: feedName,
      datePublished: pubDate.toISOString(),
      dateAdded: new Date().toISOString()
    };
  });
}

/**
 * Fetch RSS feed articles
 */
async function fetchRssFeed(feed) {
  console.log(`Fetching RSS feed: ${feed.name} (${feed.id})...`);
  
  try {
    // Fetch feed content
    const xml = await fetchUrl(feed.url);
    
    // Parse RSS items
    const items = parseRssFeed(xml);
    
    console.log(`Found ${items.length} items in feed ${feed.id}`);
    
    if (items.length === 0) {
      console.warn(`No items found in feed: ${feed.id}`);
      return [];
    }
    
    // Transform to our format
    const articles = transformRssItems(
      items.slice(0, CONFIG.ARTICLES_PER_FEED), 
      feed.id,
      feed.name,
      feed.category
    );
    
    return articles;
  } catch (error) {
    console.error(`Error fetching ${feed.id}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch all RSS feeds
 */
async function fetchAllRssFeeds() {
  console.log(`Fetching ${RSS_FEEDS.length} RSS feeds...`);
  
  const allArticles = [];
  const feedResults = {};
  
  for (const feed of RSS_FEEDS) {
    let articles = [];
    let retryCount = 0;
    
    while (articles.length === 0 && retryCount < CONFIG.MAX_RETRIES) {
      articles = await fetchRssFeed(feed);
      
      if (articles.length === 0) {
        retryCount++;
        if (retryCount < CONFIG.MAX_RETRIES) {
          console.log(`Retrying ${feed.id} (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES})...`);
        }
      }
    }
    
    // Record results
    feedResults[feed.id] = {
      name: feed.name,
      url: feed.url,
      count: articles.length,
      success: articles.length > 0
    };
    
    // Add to all articles
    allArticles.push(...articles);
  }
  
  return {
    articles: allArticles,
    feedResults: feedResults
  };
}

/**
 * Save articles to JSON file
 */
function saveArticlesToFile(data, filePath) {
  const outputData = {
    articles: data.articles,
    count: data.articles.length,
    feeds: data.feedResults,
    fetchedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2));
  console.log(`Saved ${data.articles.length} RSS articles to ${filePath}`);
  
  // Print feed results summary
  console.log('\nFeed Results:');
  for (const [feedId, result] of Object.entries(data.feedResults)) {
    console.log(`- ${result.name}: ${result.count} articles ${result.success ? '✅' : '❌'}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('Starting RSS feed fetch...');
  
  try {
    // Fetch RSS feeds
    const data = await fetchAllRssFeeds();
    
    // Save to file
    const filePath = path.join(dataDir, 'rss.json');
    saveArticlesToFile(data, filePath);
    
    console.log('\nAll RSS feeds fetched and saved successfully! 🎉');
  } catch (error) {
    console.error('Error during execution:', error);
    process.exit(1);
  }
}

// Run the script
main(); 