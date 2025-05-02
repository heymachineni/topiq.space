import React, { useState, useEffect } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  loading?: 'lazy' | 'eager';
  priority?: boolean;
}

/**
 * OptimizedImage component that automatically converts images to WebP format
 * and provides proper loading behavior for better performance.
 */
const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  width,
  height,
  loading = 'lazy',
  priority = false,
}) => {
  const [imageSrc, setImageSrc] = useState<string>(
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjQwMCIgeT0iMzAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMzAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiPkxvYWRpbmcgSW1hZ2U8L3RleHQ+PC9zdmc+"
  );
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  
  const fallbackImageSrc = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjQwMCIgeT0iMzAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMzAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+";

  useEffect(() => {
    // Skip loading if no source or already encountered an error
    if (!src || error) return;
    
    const img = new Image();
    img.src = getOptimizedSrc(src);
    
    img.onload = () => {
      setImageSrc(getOptimizedSrc(src));
      setIsLoaded(true);
    };
    
    img.onerror = () => {
      console.error(`Failed to load image: ${src}`);
      setError(true);
      setImageSrc(fallbackImageSrc);
    };
    
    // Cleanup
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src, error]);

  // Convert image to WebP format when possible
  const getOptimizedSrc = (originalSrc: string): string => {
    if (!originalSrc) return fallbackImageSrc;
    
    try {
      // For Wikipedia/Wikimedia images
      if (originalSrc.includes('wikipedia.org') || originalSrc.includes('wikimedia.org')) {
        const baseUrl = originalSrc.split('?')[0];
        const targetWidth = width || 800;
        return `${baseUrl}?width=${targetWidth}&format=webp`;
      }
      
      // For Reddit images
      if (originalSrc.includes('redd.it') || originalSrc.includes('reddit.com')) {
        // Check if already has WebP
        if (originalSrc.includes('format=webp') || originalSrc.includes('.webp')) {
          return originalSrc;
        }
        
        // Add WebP format if not already in the URL
        return originalSrc.includes('?') 
          ? `${originalSrc}&format=webp` 
          : `${originalSrc}?format=webp`;
      }
      
      // For Imgur images
      if (originalSrc.includes('imgur.com') && !originalSrc.includes('.webp')) {
        return originalSrc.replace(/\.(jpg|jpeg|png)$/i, '.webp');
      }
      
      // For other images, return as is
      return originalSrc;
    } catch (error) {
      console.error('Error optimizing image src:', error);
      return originalSrc;
    }
  };

  // Generate srcset for responsive images
  const getSrcSet = (): string => {
    if (!src || error) return '';
    
    // For Wikipedia/Wikimedia images, create a srcset with different sizes
    if (src.includes('wikipedia.org') || src.includes('wikimedia.org')) {
      const baseSrc = src.split('?')[0]; // Remove any query parameters
      
      return `
        ${baseSrc}?width=300&format=webp 300w,
        ${baseSrc}?width=400&format=webp 400w,
        ${baseSrc}?width=600&format=webp 600w,
        ${baseSrc}?width=800&format=webp 800w
      `;
    }
    
    // For Reddit images
    if (src.includes('redd.it') || src.includes('reddit.com') && !src.includes('format=webp')) {
      // Add WebP format for different sizes
      const baseSrc = src.split('?')[0];
      
      return `
        ${baseSrc}?width=300&format=webp 300w,
        ${baseSrc}?width=500&format=webp 500w,
        ${baseSrc}?width=700&format=webp 700w
      `;
    }
    
    return '';
  };

  return (
    <img
      src={imageSrc}
      srcSet={getSrcSet()}
      sizes="(max-width: 480px) 100vw, (max-width: 768px) 90vw, (max-width: 1024px) 70vw, 600px"
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : loading}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-40'} transition-opacity duration-500`}
      style={{
        objectFit: 'cover',
        objectPosition: 'center',
      }}
      onError={() => {
        setError(true);
        setImageSrc(fallbackImageSrc);
      }}
    />
  );
};

export default OptimizedImage; 