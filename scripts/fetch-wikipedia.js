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
  ARTICLES_TO_FETCH: 100,
  MIN_ARTICLE_LENGTH: 3000,
  MIN_IMAGE_COUNT: 1,
  MIN_QUALITY_SCORE: 40,
  BATCH_SIZE: 10,
  LANGUAGES: ['en'],
  MAX_RETRIES: 3,
  USER_AGENT: 'WikiWave/1.0'
};

// Keep track of fetched articles to avoid duplicates
const fetchedPageIds = new Set();

/**
 * Helper function to make HTTPS requests
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': CONFIG.USER_AGENT
      }
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
    }).on('error', reject);
  });
}

/**
 * Fetch random articles from Wikipedia API
 */
async function fetchRandomArticles(count, language = 'en') {
  console.log(`Fetching ${count} random articles in ${language}...`);
  
  const url = `https://${language}.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=${count}`;
  
  try {
    const data = await fetchUrl(url);
    return data.query.random;
  } catch (error) {
    console.error(`Error fetching random articles: ${error.message}`);
    return [];
  }
}

/**
 * Fetch article details from Wikipedia API
 */
async function fetchArticleDetails(pageIds, language = 'en') {
  if (!pageIds.length) return [];
  
  console.log(`Fetching details for ${pageIds.length} articles...`);
  
  const url = `https://${language}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|pageimages|pageterms|categories|info|links&inprop=url&pithumbsize=800&pilimit=50&exintro=1&explaintext=1&pageids=${pageIds.join('|')}&redirects=1&cllimit=5`;
  
  try {
    const data = await fetchUrl(url);
    return data.query.pages;
  } catch (error) {
    console.error(`Error fetching article details: ${error.message}`);
    return {};
  }
}

/**
 * Calculate quality score for an article
 */
function calculateQualityScore(article) {
  let score = 0;
  
  // Score based on article length (0-40 points)
  const textLength = article.extract ? article.extract.length : 0;
  score += Math.min(40, Math.floor(textLength / 100));
  
  // Score based on having an image (0-20 points)
  if (article.thumbnail) {
    score += 20;
  }
  
  // Score based on category count (0-20 points)
  const categoryCount = article.categories ? article.categories.length : 0;
  score += Math.min(20, categoryCount * 4);
  
  // Score based on link count (0-20 points)
  const linkCount = article.links ? article.links.length : 0;
  score += Math.min(20, linkCount / 5);
  
  return score;
}

/**
 * Filter articles based on quality criteria
 */
function filterHighQualityArticles(articles, minQualityScore = CONFIG.MIN_QUALITY_SCORE) {
  return Object.values(articles).filter(article => {
    // Skip if already fetched
    if (fetchedPageIds.has(article.pageid)) {
      return false;
    }
    
    // Calculate quality score
    const qualityScore = calculateQualityScore(article);
    
    // Add to fetched set
    if (qualityScore >= minQualityScore) {
      fetchedPageIds.add(article.pageid);
    }
    
    return qualityScore >= minQualityScore;
  });
}

/**
 * Transform Wikipedia API response to our article format
 */
function transformArticles(articlesData, language = 'en') {
  return articlesData.map(article => {
    // Extract relevant images
    const images = [];
    if (article.thumbnail) {
      images.push({
        url: article.thumbnail.source,
        width: article.thumbnail.width,
        height: article.thumbnail.height
      });
    }
    
    // Extract categories
    const categories = article.categories ? 
      article.categories
        .map(cat => cat.title.replace('Category:', ''))
        .filter(cat => !cat.includes('Articles_with')) : 
      [];
    
    // Format article data
    return {
      id: article.pageid.toString(),
      title: article.title,
      extract: article.extract || '',
      url: article.fullurl || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`,
      thumbnail: article.thumbnail ? article.thumbnail.source : null,
      images: images,
      categories: categories.slice(0, 5),
      source: 'wikipedia',
      language: language,
      qualityScore: calculateQualityScore(article),
      dateAdded: new Date().toISOString()
    };
  });
}

/**
 * Main function to fetch articles in batches
 */
async function fetchArticlesInBatches(totalCount) {
  const articles = [];
  let language = CONFIG.LANGUAGES[0];
  let retryCount = 0;
  
  console.log(`Starting to fetch ${totalCount} high-quality Wikipedia articles...`);
  
  while (articles.length < totalCount && retryCount < CONFIG.MAX_RETRIES) {
    // Fetch random article IDs
    const batchSize = Math.min(CONFIG.BATCH_SIZE * 3, totalCount - articles.length);
    const randomArticles = await fetchRandomArticles(batchSize, language);
    
    if (randomArticles.length === 0) {
      console.warn('No random articles returned, retrying...');
      retryCount++;
      continue;
    }
    
    // Extract page IDs
    const pageIds = randomArticles.map(article => article.id);
    
    // Fetch article details
    const articlesData = await fetchArticleDetails(pageIds, language);
    
    // Filter high-quality articles
    const highQualityArticles = filterHighQualityArticles(articlesData);
    
    if (highQualityArticles.length === 0) {
      console.warn('No high-quality articles found in batch, retrying...');
      retryCount++;
      continue;
    }
    
    // Transform articles
    const transformedArticles = transformArticles(highQualityArticles, language);
    
    // Add to result
    articles.push(...transformedArticles);
    
    console.log(`Fetched ${articles.length}/${totalCount} articles...`);
    
    // Reset retry count since we got some articles
    retryCount = 0;
    
    // Rotate languages if multiple are configured
    if (CONFIG.LANGUAGES.length > 1) {
      const currentIndex = CONFIG.LANGUAGES.indexOf(language);
      language = CONFIG.LANGUAGES[(currentIndex + 1) % CONFIG.LANGUAGES.length];
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
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Saved ${articles.length} articles to ${filePath}`);
}

/**
 * Main execution function
 */
async function main() {
  console.log('Starting Wikipedia article fetch...');
  
  try {
    // Fetch Wikipedia articles
    const articles = await fetchArticlesInBatches(CONFIG.ARTICLES_TO_FETCH);
    
    // Save to file
    const filePath = path.join(dataDir, 'wiki.json');
    saveArticlesToFile(articles, filePath);
    
    console.log('\nAll articles fetched and saved successfully! 🎉');
  } catch (error) {
    console.error('Error during execution:', error);
    process.exit(1);
  }
}

// Run the script
main(); 