// Wikipedia API response types
export interface WikipediaImage {
  source: string;
  width: number;
  height: number;
}

export interface WikipediaPageImage {
  thumbnail?: WikipediaImage;
  originalimage?: WikipediaImage;
}

export interface WikipediaApiResponse {
  query: {
    pages: Record<string, WikipediaPage>;
  };
}

export interface WikipediaPage {
  pageid: number;
  ns: number;
  title: string;
  extract: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  description?: string;
}

// Source types for multi-source content
export type ContentSource = 'wikipedia' | 'onthisday' | 'hackernews' | 'oksurf' | 'reddit' | 'rss' | 'wikievents' | 'movie';
export type ArticleSource = ContentSource; // Alias for backward compatibility

export interface WikipediaArticle {
  pageid: number;
  title: string;
  extract: string;
  extract_html?: string;
  thumbnail?: {
    source: string;
    width?: number;
    height?: number;
  };
  originalimage?: WikipediaImage;
  description?: string;
  url?: string; // For Hacker News articles
  year?: number; // For On This Day events
  date?: string; // For On This Day events
  source?: ContentSource; // Source of the article
  displaytitle?: string;
  lastViewedAt?: number;
  savedAt?: number;
  viewedAt?: string; // For backward compatibility
}

// App state types
export type SwipeDirection = 'left' | 'right' | 'up' | 'down' | null;

export interface SavedArticle extends WikipediaArticle {
  savedAt: number;
  emoji?: string;
}

export interface AppSettings {
  darkMode: boolean;
}

// View mode type
export type ViewMode = 'fullscreen' | 'grid' | 'stack';

// Media types for Wikimedia Commons and NASA integration
export interface MediaContent {
  title: string;
  description: string;
  url: string;
  thumbUrl: string;
  isVideo: boolean;
  license?: string;
  author?: string;
  dateCreated?: string;
  source: 'wikimedia' | 'nasa' | 'other';
}

export interface MediaGalleryProps {
  media: MediaContent[];
  onClose: () => void;
  isOpen: boolean;
}

// Component props types
export interface CardProps {
  article: WikipediaArticle;
  onSwipe?: (direction: SwipeDirection, article: WikipediaArticle) => void;
  isTop?: boolean;
  index?: number;
  isShuffling?: boolean;
  swipeDirection?: 'left' | 'right' | 'none';
  swipe?: SwipeDirection;
  setSwipe?: React.Dispatch<React.SetStateAction<SwipeDirection>>;
  isVisible?: boolean;
  handleSwipe?: (direction: SwipeDirection, article: WikipediaArticle) => void;
  disableSwipe?: boolean;
  animate?: boolean;
}

export interface SearchBarProps {
  onSearch: (query: string) => void;
  showHint?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export interface ThemeToggleProps {
  isDarkMode: boolean;
  onToggle: () => void;
}

export interface ViewModeToggleProps {
  mode: ViewMode;
  onToggle: () => void;
}

export interface MoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onViewLikedArticles: () => void;
}

// Podcast types
export interface PodcastEpisode {
  id: number;
  title: string;
  description: string;
  url: string;
  datePublished: string;
  duration: number | string;
  image?: string;
  feedTitle: string;
  feedUrl: string;
  feedImage?: string;
  categories?: string[];
  audio?: string; // URL to the audio file
}

export interface PodcastModalProps {
  episodes: PodcastEpisode[];
  isOpen: boolean;
  onClose: () => void;
}

export interface PodcastViewProps {
  onRefresh: () => Promise<PodcastEpisode[]>;
  tabNavigator?: React.ReactNode;
  onPlayPodcast: (podcast: PodcastEpisode) => void;
} 