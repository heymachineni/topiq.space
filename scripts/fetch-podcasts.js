const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// List of podcasts to fetch, in the requested order
const podcastList = [
  "Lex Fridman",
  "The Joe Rogan",
  "Huberman Lab",
  "TED Talks Daily",
  "The Daily",
  "Dateline NBC",
  "WVFRM",
  "SmartLess",
  "This American Life",
  "Morbid",
  "Crime Junkie",
  "Up First",
  "Hidden Brain",
  "Stuff you should know",
  "Call Her Daddy",
  "Anything Goes with Emma Chamberlain",
  "On Purpose with Jay Shetty",
  "The Diary Of A CEO with Steven Bartlett",
  "Wiser Than Me with Julia Louis-Dreyfus",
  "Ghost Story",
  "New Heights with Jason & Travis Kelce",
  "Heavyweight"
];

// Function to fetch podcast details first
async function fetchPodcastDetails(podcastName) {
  try {
    console.log(`Fetching podcast details for: ${podcastName}`);
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(podcastName)}&media=podcast&entity=podcast&limit=1`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      return data.results[0];
    }
    return null;
  } catch (error) {
    console.error(`Error fetching details for ${podcastName}:`, error);
    return null;
  }
}

// Function to fetch episodes using the podcast ID
async function fetchPodcastEpisodes(podcastDetails) {
  if (!podcastDetails || !podcastDetails.collectionId) {
    return [];
  }
  
  try {
    console.log(`Fetching episodes for: ${podcastDetails.collectionName}`);
    const url = `https://itunes.apple.com/lookup?id=${podcastDetails.collectionId}&entity=podcastEpisode&limit=10`;
    const response = await fetch(url);
    const data = await response.json();
    
    // First result is the podcast itself, the rest are episodes
    // Include title, image, duration, and audio
    const episodes = data.results.slice(1).map(episode => {
      return {
        title: episode.trackName,
        image: episode.artworkUrl600 || podcastDetails.artworkUrl600 || podcastDetails.artworkUrl100,
        duration: episode.trackTimeMillis ? formatDuration(episode.trackTimeMillis / 1000) : '30m',
        audio: episode.episodeUrl || episode.previewUrl || '',
        date: new Date(episode.releaseDate).toLocaleDateString(),
        description: episode.description || ''
      };
    });
    
    return episodes;
  } catch (error) {
    console.error(`Error fetching episodes for ${podcastDetails.collectionName}:`, error);
    return [];
  }
}

// Format duration in seconds to "30:00" format
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  } else {
    return `${minutes}m`;
  }
}

// Main function to fetch all podcasts
async function fetchAllPodcasts() {
  const results = [];
  
  for (const podcastName of podcastList) {
    // Wait between requests to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get podcast details first
    const podcastDetails = await fetchPodcastDetails(podcastName);
    if (!podcastDetails) {
      console.log(`Could not find podcast: ${podcastName}`);
      continue;
    }
    
    // Wait again before fetching episodes
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get episodes
    const episodes = await fetchPodcastEpisodes(podcastDetails);
    
    // Add each episode to the results array with simplified structure
    for (const episode of episodes) {
      results.push({
        name: podcastDetails.collectionName,
        ...episode
      });
    }
    
    console.log(`Fetched ${episodes.length} episodes for ${podcastName}`);
  }
  
  // Save to data directory
  const dataDir = path.join(__dirname, '..', 'src', 'data');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const filePath = path.join(dataDir, 'podcast-data.json');
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  
  console.log(`Successfully saved podcast data to ${filePath}`);
}

// Run the script
fetchAllPodcasts().catch(error => {
  console.error('Error in fetchAllPodcasts:', error);
}); 