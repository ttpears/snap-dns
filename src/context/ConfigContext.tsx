import React, { createContext, useContext, useState, useCallback } from 'react';
import { WebhookProvider } from '../types/webhook';

interface Config {
  defaultTTL: number;
  webhookUrl: string | null;
  webhookProvider: WebhookProvider;
  // ... other existing config properties
}

interface ConfigContextType {
  config: Config;
  updateConfig: (newConfig: Config) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

function migrateConfig(savedConfig: any): Config {
  // Start with default configuration
  const defaultConfig: Config = {
    defaultTTL: 3600,
    webhookUrl: null,
    webhookProvider: 'mattermost' as WebhookProvider,
    // ... other default values
  };

  if (!savedConfig) {
    return defaultConfig;
  }

  // If there's an existing webhookUrl but no provider, assume it's Mattermost
  if (savedConfig.webhookUrl && !savedConfig.webhookProvider) {
    console.log('Migrating existing webhook configuration to Mattermost provider');
    return {
      ...savedConfig,
      webhookProvider: 'mattermost'
    };
  }

  // Return merged config with defaults
  return {
    ...defaultConfig,
    ...savedConfig
  };
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config>(() => {
    const saved = localStorage.getItem('dns_manager_config');
    const savedConfig = saved ? JSON.parse(saved) : null;
    return migrateConfig(savedConfig);
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
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
} 