/**
 * Script to fetch podcast data and save as static JSON files
 * Run with: node scripts/fetch-podcasts.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '../data/podcasts');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Configuration
const CONFIG = {
  EPISODES_PER_PODCAST: 10,
  USER_AGENT: 'WikiWave/1.0',
  MAX_RETRIES: 3,
  TIMEOUT_MS: 15000
};

// List of podcasts to fetch
const PODCASTS = [
  {
    id: 'ted-talks-daily',
    name: 'TED Talks Daily',
    url: 'https://feeds.feedburner.com/TEDTalks_audio',
    category: 'educational'
  },
  {
    id: 'radiolab',
    name: 'Radiolab',
    url: 'https://feeds.simplecast.com/ZoXX5JFa',
    category: 'science'
  },
  {
    id: 'freakonomics',
    name: 'Freakonomics Radio',
    url: 'https://feeds.simplecast.com/Y8lFbOT4',
    category: 'society'
  },
  {
    id: 'planet-money',
    name: 'Planet Money',
    url: 'https://feeds.npr.org/510289/podcast.xml',
    category: 'business'
  },
  {
    id: 'stuff-you-should-know',
    name: 'Stuff You Should Know',
    url: 'https://feeds.megaphone.fm/stuffyoushouldknow',
    category: 'educational'
  },
  {
    id: 'hidden-brain',
    name: 'Hidden Brain',
    url: 'https://feeds.simplecast.com/mMkO6v6Q',
    category: 'psychology'
  },
  {
    id: 'this-american-life',
    name: 'This American Life',
    url: 'https://www.thisamericanlife.org/podcast/rss.xml',
    category: 'storytelling'
  },
  {
    id: 'science-vs',
    name: 'Science Vs',
    url: 'https://feeds.megaphone.fm/sciencevs',
    category: 'science'
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
 * Parse XML content to extract podcast episodes
 */
function parsePodcastFeed(xml) {
  const episodes = [];
  
  // Parse for <item> elements - simplified regex parser
  // In production, use a proper XML parser
  const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<enclosure[^>]*url="([^"]*)"[^>]*length="([^"]*)"[^>]*type="([^"]*)"[^>]*\/>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/g;
  const descriptionRegex = /<description>([\s\S]*?)<\/description>/;
  const durationRegex = /<itunes:duration>([\s\S]*?)<\/itunes:duration>/;
  const imageRegex = /<itunes:image href="([^"]*)"\/>/;
  
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = xml.substring(match.index, match.index + match[0].length);
    
    // Extract description
    const descMatch = item.match(descriptionRegex);
    const description = descMatch ? cleanDescription(descMatch[1]) : '';
    
    // Extract duration
    const durMatch = item.match(durationRegex);
    const duration = durMatch ? durMatch[1] : '';
    
    // Extract image
    const imgMatch = item.match(imageRegex);
    const image = imgMatch ? imgMatch[1] : '';
    
    episodes.push({
      title: decodeHtmlEntities(match[1].trim()),
      link: match[2].trim(),
      audioUrl: match[3].trim(),
      fileSize: parseInt(match[4], 10) || 0,
      mimeType: match[5].trim(),
      pubDate: match[6].trim(),
      description: description,
      duration: formatDuration(duration),
      image: image
    });
  }
  
  return episodes;
}

/**
 * Clean HTML from description
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
 * Format duration to standard format
 */
function formatDuration(duration) {
  // Handle different duration formats
  if (!duration) return '';
  
  // If it's already in HH:MM:SS format, return as is
  if (/^\d+:\d+:\d+$/.test(duration)) return duration;
  
  // If it's in MM:SS format, add hours
  if (/^\d+:\d+$/.test(duration)) return `0:${duration}`;
  
  // If it's just seconds
  if (/^\d+$/.test(duration)) {
    const seconds = parseInt(duration, 10);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return duration;
}

/**
 * Transform podcast episodes to our format
 */
function transformPodcastEpisodes(episodes, podcastId, podcastName, category) {
  return episodes.map((episode, index) => {
    // Parse date
    let pubDate = new Date();
    try {
      pubDate = new Date(episode.pubDate);
      if (isNaN(pubDate.getTime())) {
        pubDate = new Date();
      }
    } catch (e) {
      console.warn(`Invalid date format: ${episode.pubDate}`);
    }
    
    return {
      id: `${podcastId}-${index}`,
      podcastId: podcastId,
      podcastName: podcastName,
      title: episode.title,
      description: episode.description,
      audioUrl: episode.audioUrl,
      duration: episode.duration,
      fileSize: episode.fileSize,
      mimeType: episode.mimeType,
      link: episode.link,
      image: episode.image,
      publishDate: pubDate.toISOString(),
      category: category,
      dateAdded: new Date().toISOString()
    };
  });
}

/**
 * Fetch podcast episodes
 */
async function fetchPodcast(podcast) {
  console.log(`Fetching podcast: ${podcast.name} (${podcast.id})...`);
  
  try {
    // Fetch feed content
    const xml = await fetchUrl(podcast.url);
    
    // Parse RSS items
    const episodes = parsePodcastFeed(xml);
    
    console.log(`Found ${episodes.length} episodes in podcast ${podcast.id}`);
    
    if (episodes.length === 0) {
      console.warn(`No episodes found in podcast: ${podcast.id}`);
      return [];
    }
    
    // Transform to our format
    const transformedEpisodes = transformPodcastEpisodes(
      episodes.slice(0, CONFIG.EPISODES_PER_PODCAST), 
      podcast.id,
      podcast.name,
      podcast.category
    );
    
    return transformedEpisodes;
  } catch (error) {
    console.error(`Error fetching ${podcast.id}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch all podcasts
 */
async function fetchAllPodcasts() {
  console.log(`Fetching ${PODCASTS.length} podcasts...`);
  
  const podcastResults = {};
  const allEpisodes = [];
  
  for (const podcast of PODCASTS) {
    let episodes = [];
    let retryCount = 0;
    
    while (episodes.length === 0 && retryCount < CONFIG.MAX_RETRIES) {
      episodes = await fetchPodcast(podcast);
      
      if (episodes.length === 0) {
        retryCount++;
        if (retryCount < CONFIG.MAX_RETRIES) {
          console.log(`Retrying ${podcast.id} (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES})...`);
        }
      }
    }
    
    // Record results
    podcastResults[podcast.id] = {
      name: podcast.name,
      url: podcast.url,
      count: episodes.length,
      success: episodes.length > 0
    };
    
    // Add to all episodes
    allEpisodes.push(...episodes);
    
    // Save individual podcast data
    savePodcastToFile(podcast.id, episodes);
  }
  
  return {
    episodes: allEpisodes,
    podcastResults: podcastResults
  };
}

/**
 * Save podcast episodes to individual files
 */
function savePodcastToFile(podcastId, episodes) {
  if (episodes.length === 0) return;
  
  const filePath = path.join(dataDir, `${podcastId}.json`);
  
  const outputData = {
    podcastId: podcastId,
    episodes: episodes,
    count: episodes.length,
    fetchedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2));
  console.log(`Saved ${episodes.length} episodes of ${podcastId} to ${filePath}`);
}

/**
 * Save all podcasts metadata to index file
 */
function savePodcastsIndex(data) {
  const filePath = path.join(dataDir, 'index.json');
  
  const outputData = {
    podcasts: Object.keys(data.podcastResults).map(id => ({
      id: id,
      name: data.podcastResults[id].name,
      episodeCount: data.podcastResults[id].count,
      category: PODCASTS.find(p => p.id === id)?.category || 'other'
    })),
    totalEpisodes: data.episodes.length,
    totalPodcasts: Object.keys(data.podcastResults).length,
    fetchedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2));
  console.log(`Saved podcasts index to ${filePath}`);
  
  // Print podcast results summary
  console.log('\nPodcast Results:');
  for (const [podcastId, result] of Object.entries(data.podcastResults)) {
    console.log(`- ${result.name}: ${result.count} episodes ${result.success ? '✅' : '❌'}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('Starting podcast fetch...');
  
  try {
    // Fetch all podcasts
    const data = await fetchAllPodcasts();
    
    // Save index file
    savePodcastsIndex(data);
    
    console.log('\nAll podcasts fetched and saved successfully! 🎉');
  } catch (error) {
    console.error('Error during execution:', error);
    process.exit(1);
  }
}

// Run the script
main(); 