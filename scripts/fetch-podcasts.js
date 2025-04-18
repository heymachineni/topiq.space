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
  // New & Noteworthy
  {
    id: 'new-noteworthy',
    name: 'New & Noteworthy',
    itunesId: '1534243784', // Example: TED Tech
    category: 'new-noteworthy'
  },
  // Top Episodes
  {
    id: 'top-episodes',
    name: 'Top Episodes',
    itunesId: '1441595858', // Example: SmartLess
    category: 'top-episodes'
  },
  // Lex Fridman
  {
    id: 'lex-fridman',
    name: 'Lex Fridman Podcast',
    itunesId: '1434243584',
    category: 'technology'
  },
  // Joe Rogan
  {
    id: 'joe-rogan',
    name: 'The Joe Rogan Experience',
    itunesId: '360084272',
    category: 'society'
  },
  // Huberman Lab
  {
    id: 'huberman-lab',
    name: 'Huberman Lab',
    itunesId: '1545953110',
    category: 'science'
  },
  // Everyone's Talking About
  {
    id: 'everyones-talking',
    name: "Everyone's Talking About",
    itunesId: '1200361736', // Example: The Daily
    category: 'popular'
  },
  // Musically Inclined
  {
    id: 'musically-inclined',
    name: 'Musically Inclined',
    itunesId: '1635211340', // Example: 60 Songs That Explain the '90s
    category: 'music'
  },
  // Mixed
  {
    id: 'mixed',
    name: 'Mixed',
    itunesId: '1028908750', // Example: Radiolab
    category: 'mixed'
  },
  // Additional popular podcasts
  {
    id: 'ted-talks-daily',
    name: 'TED Talks Daily',
    itunesId: '160904630',
    category: 'educational'
  },
  {
    id: 'freakonomics',
    name: 'Freakonomics Radio',
    itunesId: '354668519',
    category: 'society'
  },
  {
    id: 'planet-money',
    name: 'Planet Money',
    itunesId: '290783428',
    category: 'business'
  },
  {
    id: 'stuff-you-should-know',
    name: 'Stuff You Should Know',
    itunesId: '278981407',
    category: 'educational'
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
 * Fetch podcast episodes from iTunes API
 */
async function fetchPodcast(podcast) {
  console.log(`Fetching podcast: ${podcast.name} (${podcast.id})...`);
  
  try {
    // Lookup the podcast in iTunes
    const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.itunesId}&entity=podcastEpisode&limit=20`;
    const data = await fetchUrl(lookupUrl);
    const parsedData = JSON.parse(data);
    
    if (!parsedData.results || parsedData.results.length <= 1) {
      console.warn(`No episodes found for podcast: ${podcast.id}`);
      return [];
    }
    
    // First result is the podcast itself, rest are episodes
    const podcastInfo = parsedData.results[0];
    const episodes = parsedData.results.slice(1);
    
    console.log(`Found ${episodes.length} episodes in podcast ${podcast.id}`);
    
    // Transform to our format
    const transformedEpisodes = episodes.map((episode, index) => ({
      id: `${podcast.id}-${index}`,
      podcastId: podcast.id,
      podcastName: podcast.name,
      title: episode.trackName || 'Untitled Episode',
      description: episode.description || podcast.name,
      audioUrl: episode.episodeUrl || episode.previewUrl || '',
      duration: formatMilliseconds(episode.trackTimeMillis),
      fileSize: episode.trackTimeMillis || 0,
      mimeType: 'audio/mpeg',
      link: episode.trackViewUrl || '',
      image: episode.artworkUrl600 || podcastInfo.artworkUrl600 || '',
      publishDate: new Date(episode.releaseDate).toISOString(),
      category: podcast.category,
      dateAdded: new Date().toISOString()
    }));
    
    return transformedEpisodes.slice(0, CONFIG.EPISODES_PER_PODCAST);
  } catch (error) {
    console.error(`Error fetching ${podcast.id}: ${error.message}`);
    return [];
  }
}

/**
 * Format milliseconds to HH:MM:SS
 */
function formatMilliseconds(ms) {
  if (!ms) return '00:00:00';
  
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Fetch all podcasts
 */
async function fetchAllPodcasts() {
  const results = {};
  
  for (const podcast of PODCASTS) {
    try {
      console.log(`\nProcessing podcast: ${podcast.name}`);
      const episodes = await fetchPodcast(podcast);
      
      if (episodes.length > 0) {
        results[podcast.id] = {
          id: podcast.id,
          name: podcast.name,
          category: podcast.category,
          episodes: episodes,
          count: episodes.length,
          fetchedAt: new Date().toISOString()
        };
        
        // Save individual podcast file
        savePodcastToFile(podcast.id, results[podcast.id]);
      } else {
        console.warn(`Skipping ${podcast.id} due to no episodes found`);
      }
    } catch (error) {
      console.error(`Failed to process ${podcast.id}: ${error.message}`);
    }
  }
  
  // Create an index file with all podcasts
  savePodcastsIndex(results);
  
  return results;
}

/**
 * Save podcast data to file
 */
function savePodcastToFile(podcastId, data) {
  const filePath = path.join(dataDir, `${podcastId}.json`);
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Saved podcast data to ${filePath}`);
  } catch (error) {
    console.error(`Failed to save podcast data for ${podcastId}: ${error.message}`);
  }
}

/**
 * Save index of all podcasts
 */
function savePodcastsIndex(data) {
  const filePath = path.join(dataDir, 'index.json');
  
  const indexData = {
    podcasts: Object.values(data).map(podcast => ({
      id: podcast.id,
      name: podcast.name,
      category: podcast.category,
      count: podcast.count,
      fetchedAt: podcast.fetchedAt
    })),
    count: Object.keys(data).length,
    fetchedAt: new Date().toISOString()
  };
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(indexData, null, 2));
    console.log(`Saved podcasts index to ${filePath}`);
  } catch (error) {
    console.error(`Failed to save podcasts index: ${error.message}`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Starting podcast fetch...');
  
  try {
    await fetchAllPodcasts();
    console.log('\nAll podcasts fetched and saved successfully! 🎉');
  } catch (error) {
    console.error('Error during execution:', error);
    process.exit(1);
  }
}

// Run the script
main(); 