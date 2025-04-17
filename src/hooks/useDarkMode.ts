import { useState, useEffect } from 'react';
import { getAppSettings, saveAppSettings } from '../utils/storage';

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(() => {
    // Initialize from local storage or system preference
    return getAppSettings().darkMode;
  });

  useEffect(() => {
    // Apply dark mode class to document
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Save setting to local storage
    saveAppSettings({ darkMode });
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(prevMode => !prevMode);
  };

  return { darkMode, toggleDarkMode };
} 