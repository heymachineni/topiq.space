const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// List of podcasts to fetch, in the requested order
const podcastList = [
  "Lex Fridman",
  "The Joe Rogan",
  "Huberman Lab",
  "WTF is with Nikhil Kamath",
  "Waveform: The MKBHD Podcast",
  "TED Talks Daily",
  "99% Invisible",
  "UX coffee break with UX Anudeep",
  "Intercom on Product",
  "Dateline NBC",
  "WVFRM",
  "SmartLess",
  "This American Life",
  "Morbid",
  "Crime Junkie",
  "Up First",
  "Hidden Brain",
  "Puri Jagannadh",
  "Stuff you should know",
  "Call Her Daddy",
  "Anything Goes with Emma Chamberlain",
  "On Purpose with Jay Shetty",
  "The Diary Of A CEO with Steven Bartlett",
  "Wiser Than Me with Julia Louis-Dreyfus",
  "New Heights with Jason & Travis Kelce",
  "Heavyweight"
];

// Audio fallbacks by podcast (these are sample/test audio files)
const audioFallbacks = {
  "Lex Fridman": "https://media.blubrry.com/takeituneasy/content.blubrry.com/takeituneasy/lex_ai_jeffrey_wasserstrom.mp3",
  "The Joe Rogan": "https://traffic.megaphone.fm/GLT3681145152.mp3",
  "Huberman Lab": "https://www.podtrac.com/pts/redirect.mp3/traffic.megaphone.fm/SCIM2878719314.mp3",
  "TED Talks Daily": "https://dts.podtrac.com/redirect.mp3/download.ted.com/talks/KateDarling_2018S.mp3",
  "Dateline NBC": "https://podcastfeeds.nbcnews.com/HL4TzgYC/dateline-nbc",
  "Waveform: The MKBHD Podcast": "https://traffic.megaphone.fm/VMP6385462378.mp3",
  "99% Invisible": "https://99percentinvisible.org/app/uploads/audio/999-999-The-Smell-of-Concrete-After-Rain.mp3",
  "WTF is with Nikhil Kamath": "https://traffic.libsyn.com/secure/wtfwithnikhilkamath/HistoryofHumanity.mp3",
  "UX coffee break with UX Anudeep": "https://anchor.fm/s/8ca845bc/podcast/play/62396879/https%3A%2F%2Fd3ctxlq1ktw2nl.cloudfront.net%2Fstaging%2F2023-1-9%2F318360754-44100-2-3a794f1eff83d.m4a",
  "Intercom on Product": "https://traffic.libsyn.com/secure/intercomonproduct/Intercom_on_Product_-_Shipping_Season_-_E04_-_Liam_Geraghty.mp3",
  "Puri Jagannadh": "https://anchor.fm/s/3ba96188/podcast/play/79123583/https%3A%2F%2Fd3ctxlq1ktw2nl.cloudfront.net%2Fstaging%2F2023-10-26%2F358839683-44100-2-a9da5aa6d6ad9.m4a",
  "default": "https://samplelib.com/lib/preview/mp3/sample-15s.mp3"
};

// Image fallbacks if iTunes API doesn't provide images
const imageFallbacks = {
  "Lex Fridman": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/19/d1/ce/19d1ce79-690c-4254-9122-1b864725cfca/mza_15493761654786490904.jpg/600x600bb.jpg",
  "The Joe Rogan": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts113/v4/63/10/96/631096e0-cbc4-2228-053f-645c9a2f00f5/mza_11558693523525727896.jpg/600x600bb.jpg",
  "Waveform: The MKBHD Podcast": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/02/39/54/02395478-21f3-5cc9-815c-97fa634175b5/mza_1310730137179828497.jpg/600x600bb.jpg",
  "99% Invisible": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts116/v4/6e/7c/db/6e7cdbe2-4865-36fc-4642-833a5599a8f5/mza_11510606366997150519.jpg/600x600bb.jpg",
  "WTF is with Nikhil Kamath": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/b6/fb/95/b6fb95b7-1bdb-f9fe-b084-f06bc954d9ab/mza_3258259774253196913.jpg/600x600bb.jpg",
  "UX coffee break with UX Anudeep": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/a6/9b/ec/a69bec90-e75a-ddcd-5b9c-36c3b5298bf7/mza_16523221211257007523.jpg/600x600bb.jpg",
  "Intercom on Product": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/f0/99/5e/f0995e9d-5a58-129e-d4bf-3b2ebb67b8f4/mza_7366813862524447968.jpg/600x600bb.jpg", 
  "Puri Jagannadh": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/a2/3a/38/a23a380a-9f99-6d07-c326-f8e0a31f586e/mza_8319433134170865272.jpg/600x600bb.jpg",
  "default": "https://podcastindex.org/images/no-cover-art.png"
};

// Constants for API requests
const EPISODES_PER_REQUEST = 200; // Maximum allowed by iTunes API
const MIN_EPISODES_PER_PODCAST = 150; // Target minimum episodes per podcast (increased from 100)
const BATCH_DELAY_MS = 1000; // Delay between batch requests to avoid rate limiting
const PODCAST_DELAY_MS = 2000; // Delay between podcast requests

// Function to get fallback audio URL based on podcast name
function getFallbackAudio(podcastName) {
  // Check if we have a specific fallback for this podcast
  for (const [key, url] of Object.entries(audioFallbacks)) {
    if (podcastName.includes(key)) {
      return url;
    }
  }
  // Use default fallback
  return audioFallbacks.default;
}

// Function to get fallback image URL based on podcast name
function getFallbackImage(podcastName) {
  // Check if we have a specific fallback for this podcast
  for (const [key, url] of Object.entries(imageFallbacks)) {
    if (podcastName.includes(key)) {
      return url;
    }
  }
  // Use default fallback
  return imageFallbacks.default;
}

// Generate a unique ID for episodes
function generateEpisodeId(podcastName, index) {
  // Create a deterministic but unique ID by hashing podcast name and episode index
  const hash = podcastName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash * 1000 + index;
}

// Helper function to format duration
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

// Helper function to clean podcast names and remove symbols at the start
function cleanPodcastName(name) {
  if (!name) return '';
  
  // Remove emojis and other non-alphanumeric characters from the beginning
  return name.replace(/^[^\p{L}\p{N}]*/u, '').trim();
}

// Helper function to remove episode numbers from titles and clean up beginning with symbols/dashes
function cleanEpisodeTitle(title, podcastName) {
  if (!title) return '';
  
  // Remove common episode number patterns
  let cleanTitle = title
    // Remove "#123: " or "#123 - " patterns
    .replace(/^#\d+[:\s-]+\s*/i, '')
    // Remove "Ep. 123: " or "Ep 123 - " or "Episode 123: " patterns
    .replace(/^(ep\.?|episode)\s*\d+[:\s-]+\s*/i, '')
    // Remove podcast name from the beginning if it's redundant
    .replace(new RegExp(`^${podcastName}\\s*[:\\-–—]\\s*`, 'i'), '')
    // Remove leading dash if present (as requested)
    .replace(/^\s*-\s*/, '')
    // Special handling for Lex Fridman podcast - always remove any leading dash
    .replace(podcastName.toLowerCase().includes('lex fridman') ? /^\s*[-–—]\s*/ : /^$/, '')
    // Remove any symbols or emojis at the beginning
    .replace(/^[^\p{L}\p{N}]*/u, '')
    // Remove trailing whitespace
    .trim();
    
  return cleanTitle;
}

// Function to fetch podcast details first
async function fetchPodcastDetails(podcastName) {
  try {
    console.log(`Fetching podcast details for: ${podcastName}`);
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(podcastName)}&media=podcast&entity=podcast&limit=5`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      // Try to find an exact match first
      const exactMatch = data.results.find(
        result => result.collectionName.toLowerCase().includes(podcastName.toLowerCase())
      );
      
      if (exactMatch) {
        return exactMatch;
      }
      
      // Fall back to first result
      return data.results[0];
    }
    return null;
  } catch (error) {
    console.error(`Error fetching details for ${podcastName}:`, error);
    return null;
  }
}

// Function to fetch episodes using the podcast ID with pagination
async function fetchPodcastEpisodes(podcastDetails, targetCount = MIN_EPISODES_PER_PODCAST) {
  if (!podcastDetails || !podcastDetails.collectionId) {
    console.log(`Creating fallback episodes for ${podcastDetails?.collectionName || "unknown podcast"}`);
    return createFallbackEpisodes(podcastDetails?.collectionName || "Unknown Podcast", targetCount);
  }
  
  try {
    console.log(`Fetching episodes for: ${podcastDetails.collectionName} (target: ${targetCount}+ episodes)`);
    
    let allEpisodes = [];
    let offset = 0;
    let fetchedEpisodesCount = 0;
    let batchCount = 0;
    
    // Fetch episodes in batches until we reach our target or run out of episodes
    while (fetchedEpisodesCount < targetCount) {
      batchCount++;
      console.log(`Fetching batch ${batchCount} (offset: ${offset}) for ${podcastDetails.collectionName}`);
      
      const url = `https://itunes.apple.com/lookup?id=${podcastDetails.collectionId}&entity=podcastEpisode&limit=${EPISODES_PER_REQUEST}&offset=${offset}`;
      const response = await fetch(url);
      const data = await response.json();
      
      // First result is the podcast itself, the rest are episodes
      const batchEpisodes = data.results.slice(1);
      
      if (batchEpisodes.length === 0) {
        console.log(`No more episodes available for ${podcastDetails.collectionName}`);
        break; // No more episodes available
      }
      
      // Map the episodes to our format
      const formattedEpisodes = batchEpisodes.map((episode, index) => {
        // Try to get audio URL from API
        const audioUrl = episode.episodeUrl || episode.previewUrl || getFallbackAudio(podcastDetails.collectionName);
        const imageUrl = episode.artworkUrl600 || podcastDetails.artworkUrl600 || podcastDetails.artworkUrl100 || getFallbackImage(podcastDetails.collectionName);
        
        // Clean the podcast name and episode title
        const cleanedPodcastName = cleanPodcastName(podcastDetails.collectionName);
        const cleanTitle = cleanEpisodeTitle(episode.trackName || `Episode ${offset + index + 1}`, cleanedPodcastName);
        
        return {
          id: episode.trackId || generateEpisodeId(podcastDetails.collectionName, offset + index),
          name: cleanedPodcastName,
          title: cleanTitle,
          image: imageUrl,
          duration: episode.trackTimeMillis ? formatDuration(episode.trackTimeMillis / 1000) : '30m',
          audio: audioUrl,
          url: episode.trackViewUrl || podcastDetails.collectionViewUrl,
          datePublished: new Date(episode.releaseDate).toLocaleDateString(),
          description: episode.description || podcastDetails.description || `${cleanedPodcastName} episode.`,
          feedTitle: cleanedPodcastName,
          // Store raw duration for UI display
          rawDuration: episode.trackTimeMillis ? Math.floor(episode.trackTimeMillis / 1000) : null
        };
      });
      
      allEpisodes = [...allEpisodes, ...formattedEpisodes];
      fetchedEpisodesCount = allEpisodes.length;
      
      // Update offset for next batch
      offset += batchEpisodes.length;
      
      // If we got fewer episodes than we requested, there are no more to fetch
      if (batchEpisodes.length < EPISODES_PER_REQUEST) {
        console.log(`Reached the end of available episodes for ${podcastDetails.collectionName} at ${fetchedEpisodesCount}`);
        break;
      }
      
      // Add a small delay to avoid rate limiting
      if (fetchedEpisodesCount < targetCount) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
    
    console.log(`Successfully fetched ${allEpisodes.length} episodes for ${podcastDetails.collectionName}`);
    return allEpisodes;
  } catch (error) {
    console.error(`Error fetching episodes for ${podcastDetails.collectionName}:`, error);
    return createFallbackEpisodes(podcastDetails.collectionName, targetCount);
  }
}

// Function to create fallback episodes when API fails
function createFallbackEpisodes(podcastName, count = MIN_EPISODES_PER_PODCAST, startIndex = 0) {
  console.log(`Creating ${count} fallback episodes for ${podcastName}`);
  
  const cleanedPodcastName = cleanPodcastName(podcastName);
  
  return Array(count).fill(null).map((_, index) => ({
    id: generateEpisodeId(podcastName, startIndex + index),
    name: cleanedPodcastName,
    title: `Episode ${startIndex + index + 1}: Sample Content`,
    image: getFallbackImage(podcastName),
    duration: `${Math.floor(Math.random() * 60) + 30}m`,
    audio: getFallbackAudio(podcastName),
    url: '#',
    datePublished: new Date(Date.now() - ((startIndex + index) * 7 * 24 * 60 * 60 * 1000)).toLocaleDateString(),
    description: `Sample episode ${startIndex + index + 1} for ${cleanedPodcastName}.`,
    feedTitle: cleanedPodcastName
  }));
}

// Main function to fetch all podcasts and save to file
async function fetchAllPodcasts() {
  console.log(`Starting podcast fetch process (target: ${MIN_EPISODES_PER_PODCAST}+ episodes per podcast)...`);
  let allEpisodes = [];
  
  for (const podcastName of podcastList) {
    try {
      // Step 1: Get podcast details
      const details = await fetchPodcastDetails(podcastName);
      
      if (!details) {
        console.warn(`No details found for ${podcastName}, using fallbacks...`);
        // Create fallback episodes
        const fallbackEpisodes = createFallbackEpisodes(podcastName);
        allEpisodes = [...allEpisodes, ...fallbackEpisodes];
        continue;
      }
      
      // Step 2: Get episodes for this podcast
      const episodes = await fetchPodcastEpisodes(details);
      console.log(`Got ${episodes.length} episodes for ${podcastName}`);
      
      // Add to our collection
      allEpisodes = [...allEpisodes, ...episodes];
      
      // Delay between podcast requests to avoid rate limiting
      if (podcastList.indexOf(podcastName) < podcastList.length - 1) {
        console.log(`Delaying ${PODCAST_DELAY_MS}ms before next podcast...`);
        await new Promise(resolve => setTimeout(resolve, PODCAST_DELAY_MS));
      }
    } catch (error) {
      console.error(`Error processing ${podcastName}:`, error);
      // Create fallback episodes for failed podcasts
      const fallbackEpisodes = createFallbackEpisodes(podcastName);
      allEpisodes = [...allEpisodes, ...fallbackEpisodes];
    }
  }
  
  // Make sure we always have some audio URLs and images
  allEpisodes = allEpisodes.map(episode => {
    if (!episode.audio) {
      const podcastName = episode.name || '';
      episode.audio = getFallbackAudio(podcastName);
    }
    if (!episode.image) {
      const podcastName = episode.name || '';
      episode.image = getFallbackImage(podcastName);
    }
    return episode;
  });
  
  console.log(`Total episodes collected: ${allEpisodes.length}`);
  
  // Save to file
  const outputPath = path.join(__dirname, 'podcast-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(allEpisodes, null, 2));
  console.log(`Data saved to ${outputPath}`);
  
  // Create a summary file with counts per podcast
  const podcastCounts = podcastList.reduce((acc, podcastName) => {
    const count = allEpisodes.filter(e => e.name?.toLowerCase().includes(podcastName.toLowerCase())).length;
    acc[podcastName] = count;
    return acc;
  }, {});
  
  const summaryPath = path.join(__dirname, 'podcast-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    totalEpisodes: allEpisodes.length,
    podcastCounts,
    fetchDate: new Date().toISOString()
  }, null, 2));
  console.log(`Summary saved to ${summaryPath}`);
}

// Run the main function
fetchAllPodcasts().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 