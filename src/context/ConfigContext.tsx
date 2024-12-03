import React, { createContext, useContext, useState, useCallback } from 'react';
import { Config } from '../types/config';
import { Key } from '../types/keys';

interface ConfigContextType {
  config: Config;
  updateConfig: (newConfig: Config) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType>({
  config: {
    defaultTTL: 3600,
    webhookUrl: null,
    webhookProvider: null,
    keys: []
  },
  updateConfig: async () => {}
});

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config>(() => {
    const savedConfig = localStorage.getItem('dns_manager_config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        return {
          defaultTTL: parsed.defaultTTL ?? 3600,
          webhookUrl: parsed.webhookUrl ?? null,
          webhookProvider: parsed.webhookProvider ?? null,
          keys: parsed.keys ?? []
        };
      } catch (e) {
        console.error('Failed to parse saved config:', e);
      }
    }
    return {
      defaultTTL: 3600,
      webhookUrl: null,
      webhookProvider: null,
      keys: []
    };
  });

  const updateConfig = useCallback(async (newConfig: Config) => {
    setConfig(newConfig);
    localStorage.setItem('dns_manager_config', JSON.stringify(newConfig));
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