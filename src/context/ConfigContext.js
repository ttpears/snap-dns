import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';

const ConfigContext = createContext();

const STORAGE_KEY = 'dnsConfig';
const DARK_MODE_KEY = 'darkMode';

export function ConfigProvider({ children }) {
  // Initialize config from localStorage
  const [config, setConfig] = useState(() => {
    const savedConfig = localStorage.getItem(STORAGE_KEY);
    return savedConfig ? JSON.parse(savedConfig) : { keys: [] };
  });

  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem(DARK_MODE_KEY);
    return savedMode !== null ? savedMode === 'true' : true;
  });

  // Save config to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  // Save dark mode preference whenever it changes
  useEffect(() => {
    localStorage.setItem(DARK_MODE_KEY, darkMode.toString());
  }, [darkMode]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: darkMode ? 'dark' : 'light',
        },
      }),
    [darkMode]
  );

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  const updateConfig = (newConfig) => {
    setConfig(newConfig);
  };

  const value = {
    config,
    updateConfig,
    darkMode,
    toggleDarkMode
  };

  return (
    <ConfigContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
} 