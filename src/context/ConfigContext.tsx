import React, { createContext, useContext, useState, useCallback } from 'react';
import { Config, ensureValidConfig } from '../types/config';

interface ConfigContextType {
  config: Config;
  updateConfig: (newConfig: Config) => Promise<void>;
}

const defaultConfig: Config = {
  defaultTTL: 3600,
  webhookUrl: null,
  webhookProvider: null,
  keys: []
};

const ConfigContext = createContext<ConfigContextType>({
  config: defaultConfig,
  updateConfig: async () => {}
});

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config>(() => {
    try {
      const savedConfig = localStorage.getItem('dns_manager_config');
      return savedConfig ? ensureValidConfig(JSON.parse(savedConfig)) : defaultConfig;
    } catch (e) {
      console.error('Failed to parse saved config:', e);
      return defaultConfig;
    }
  });

  const updateConfig = useCallback(async (newConfig: Config) => {
    const validConfig = ensureValidConfig(newConfig);
    setConfig(validConfig);
    localStorage.setItem('dns_manager_config', JSON.stringify(validConfig));
  }, []);

  return (
    <ConfigContext.Provider value={{ config, updateConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
} 