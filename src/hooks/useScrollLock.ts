import { useCallback } from 'react';

// Hook for managing scroll locking
export const useScrollLock = () => {
  const lockScroll = useCallback(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }, []);

  const unlockScroll = useCallback(() => {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }, []);

  return { lockScroll, unlockScroll };
};

export default useScrollLock; 