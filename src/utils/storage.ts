import { SavedArticle, AppSettings, WikipediaArticle } from '../types';

const SAVED_ARTICLES_KEY = 'topiq.space_saved_articles';
const APP_SETTINGS_KEY = 'topiq.space_settings';
const VIEWED_ARTICLES_KEY = 'viewedArticles';

// Save an article to local storage
export const saveArticle = (article: WikipediaArticle, emoji?: string): void => {
  const savedArticles = getSavedArticles();
  
  // Check if article is already saved
  const alreadySaved = savedArticles.findIndex(a => a.pageid === article.pageid) !== -1;
  
  if (!alreadySaved) {
    const savedArticle: SavedArticle = {
      ...article,
      savedAt: Date.now(),
      emoji: emoji
    };
    
    savedArticles.push(savedArticle);
    localStorage.setItem(SAVED_ARTICLES_KEY, JSON.stringify(savedArticles));
  }
};

// Get all saved articles from local storage
export const getSavedArticles = (): SavedArticle[] => {
  const savedArticlesJson = localStorage.getItem(SAVED_ARTICLES_KEY);
  return savedArticlesJson ? JSON.parse(savedArticlesJson) : [];
};

// Remove a saved article from local storage
export const removeSavedArticle = (pageid: number): void => {
  const savedArticles = getSavedArticles();
  const updatedArticles = savedArticles.filter(article => article.pageid !== pageid);
  localStorage.setItem(SAVED_ARTICLES_KEY, JSON.stringify(updatedArticles));
};

// Save app settings to local storage
export const saveAppSettings = (settings: AppSettings): void => {
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
};

// Get app settings from local storage
export const getAppSettings = (): AppSettings => {
  const settingsJson = localStorage.getItem(APP_SETTINGS_KEY);
  const defaultSettings: AppSettings = {
    darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches
  };
  
  return settingsJson ? JSON.parse(settingsJson) : defaultSettings;
};

// Mark an article as viewed (store full article data)
export const markArticleAsViewed = (article: WikipediaArticle): void => {
  const viewedArticles = getViewedArticles();
  const isAlreadyViewed = viewedArticles.some(viewed => viewed.pageid === article.pageid);
  
  if (!isAlreadyViewed) {
    const viewedArticle = {
      ...article,
      lastViewedAt: Date.now()
    };
    viewedArticles.unshift(viewedArticle); // Add to beginning of array
    
    // Keep only the last 100 viewed articles to prevent storage issues
    const trimmedArticles = viewedArticles.slice(0, 100);
    localStorage.setItem(VIEWED_ARTICLES_KEY, JSON.stringify(trimmedArticles));
  }
};

// Get all viewed articles (full objects)
export const getViewedArticles = (): WikipediaArticle[] => {
  const viewedArticlesJson = localStorage.getItem(VIEWED_ARTICLES_KEY);
  return viewedArticlesJson ? JSON.parse(viewedArticlesJson) : [];
};

// Clear viewed article history
export const clearViewedArticles = (): void => {
  localStorage.removeItem(VIEWED_ARTICLES_KEY);
}; 