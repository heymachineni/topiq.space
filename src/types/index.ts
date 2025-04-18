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

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string;
  domain: string;
}

export interface WikipediaApiResponse {
  batchcomplete: string;
  continue: {
    gpsoffset: number;
    continue: string;
  };
  query: {
    pages: Record<string, WikipediaPage>;
  };
}

export interface WikipediaPage {
  pageid: number;
  ns: number;
  title: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  pageimage?: string;
  extract?: string;
  description?: string;
}

// Source types for multi-source content
export type ContentSource = 'wikipedia' | 'onthisday' | 'hackernews' | 'oksurf' | 'reddit' | 'wikievents' | 'rss';
export type ArticleSource = ContentSource; // Alias for backward compatibility

export interface WikipediaArticle {
  pageid: number;
  title: string;
  extract?: string;
  extract_html?: string;
  thumbnail?: {
    source: string;
    width?: number;
    height?: number;
  };
  description?: string;
  url?: string;
  date?: string;
  source?: ContentSource;
  year?: number; // For On This Day events
  image?: string; // Alternate image format
  labels?: string[]; // For topic labels/tags
}

// App state types
export type SwipeDirection = 'left' | 'right' | 'up' | 'down' | null;

export interface SavedArticle extends WikipediaArticle {
  savedAt: number;
  emoji?: string;
}

export interface AppSettings {
  darkMode: boolean;
  fontSize: number;
  fontFamily: string;
  articleHistory: WikipediaArticle[];
  lastRefreshDate: string;
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