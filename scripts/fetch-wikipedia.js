/**
 * Script to fetch Wikipedia articles and save as static JSON
 * Run with: node scripts/fetch-wikipedia.js
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
  ARTICLES_TO_FETCH: 40,
  BATCH_SIZE: 5, // How many articles to fetch in parallel
  MAX_RETRIES: 20,
  USER_AGENT: 'WikiWave/1.0',
  TIMEOUT_MS: 10000 // 10 seconds timeout
};

/**
 * Helper function to make HTTPS requests
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
          resolve(JSON.parse(data));
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
 * Fetch a single random Wikipedia article using the REST API
 */
async function fetchRandomArticle() {
  const url = 'https://en.wikipedia.org/api/rest_v1/page/random/summary';
  
  try {
    const data = await fetchUrl(url);
    
    // Map to our article format
    return {
      pageid: data.pageid,
      title: data.title || data.displaytitle,
      extract: data.extract || '',
      thumbnail: data.thumbnail ? {
        source: data.thumbnail.source,
        width: data.thumbnail.width,
        height: data.thumbnail.height
      } : null,
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(data.title.replace(/ /g, '_'))}`,
      categories: [],
      source: 'wikipedia',
      language: 'en',
      dateAdded: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error fetching random article: ${error.message}`);
    throw error;
  }
}

/**
 * Check if an article meets quality criteria
 */
function isHighQualityArticle(article) {
  // Apply requested filters
  return (
    article.thumbnail &&
    article.thumbnail.source &&
    !article.thumbnail.source.includes("question") &&
    article.thumbnail.width >= 400 &&
    article.extract && 
    article.extract.length > 100 &&
    article.title
  );
}

/**
 * Fetch multiple articles in parallel
 */
async function fetchArticleBatch(count) {
  const promises = Array(count).fill().map(() => fetchRandomArticle());
  
  try {
    const results = await Promise.allSettled(promises);
    
    const articles = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value)
      .filter(isHighQualityArticle);
    
    return articles;
  } catch (error) {
    console.error(`Error fetching article batch: ${error.message}`);
    return [];
  }
}

/**
 * Main function to fetch articles until we reach the target count
 */
async function fetchArticles(targetCount) {
  console.log(`Starting to fetch ${targetCount} high-quality Wikipedia articles...`);
  
  const articles = [];
  let retryCount = 0;
  
  while (articles.length < targetCount && retryCount < CONFIG.MAX_RETRIES) {
    const batchSize = Math.min(CONFIG.BATCH_SIZE, targetCount - articles.length);
    
    console.log(`Fetching batch of ${batchSize} articles (retry #${retryCount + 1})...`);
    const batch = await fetchArticleBatch(batchSize);
    
    if (batch.length > 0) {
      articles.push(...batch);
      console.log(`Fetched ${articles.length}/${targetCount} articles so far`);
      retryCount = 0; // Reset retry count when we get some articles
    } else {
      retryCount++;
      console.warn(`No valid articles found in batch, retrying (${retryCount}/${CONFIG.MAX_RETRIES})...`);
    }
  }
  
  return articles;
}

/**
 * Save articles to JSON file
 */
function saveArticlesToFile(articles, filePath) {
  const data = {
    articles: articles,
    count: articles.length,
    fetchedAt: new Date().toISOString()
  };
  
  // Create directory if it doesn't exist
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Saved ${articles.length} articles to ${filePath}`);
  
  // Report results
  if (articles.length >= CONFIG.ARTICLES_TO_FETCH) {
    console.log(`Successfully fetched all ${CONFIG.ARTICLES_TO_FETCH} articles! 🎉`);
  } else if (articles.length > 0) {
    console.log(`Fetched ${articles.length}/${CONFIG.ARTICLES_TO_FETCH} articles. This should be enough to start with.`);
  } else {
    console.error(`Failed to fetch any articles after ${CONFIG.MAX_RETRIES} retries.`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log("Starting Wikipedia article fetch...");
  
  try {
    const articles = await fetchArticles(CONFIG.ARTICLES_TO_FETCH);
    saveArticlesToFile(articles, path.join(dataDir, 'wiki.json'));
    
    console.log("\nAll articles fetched and saved successfully! 🎉");
  } catch (error) {
    console.error("Error in main process:", error);
    process.exit(1);
  }
}

// Run the script
main(); 