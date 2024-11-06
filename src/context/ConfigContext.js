import React, { createContext, useContext, useState, useEffect } from 'react';

const ConfigContext = createContext();

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState({
    keys: [],
    defaultTTL: 3600,
    webhookUrl: null
  });

  const loadConfig = async () => {
    try {
      // In production, this would load from your config file or API
      const response = await fetch('/config.json');
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Failed to load config:', error);
      // Load fallback/default config
      setConfig({
        keys: [],
        defaultTTL: 3600,
        webhookUrl: null
      });
    }
  };

  const updateConfig = async (newConfig) => {
    try {
      // In production, this would save to your config file or API
      setConfig(newConfig);
      localStorage.setItem('dns_manager_config', JSON.stringify(newConfig));
      return true;
    } catch (error) {
      console.error('Failed to update config:', error);
      throw error;
    }
  };

  useEffect(() => {
    // Try to load from localStorage first
    const savedConfig = localStorage.getItem('dns_manager_config');
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
    } else {
      loadConfig();
    }
  }, []);

  return (
    <ConfigContext.Provider value={{ config, updateConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
} 