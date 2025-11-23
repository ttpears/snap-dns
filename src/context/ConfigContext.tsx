import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Config, ensureValidConfig } from '../types/config';
import { useAuth } from './AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';

interface ConfigContextType {
  config: Config;
  updateConfig: (newConfig: Config) => Promise<void>;
  loading: boolean;
}

const defaultConfig: Config = {
  defaultTTL: 3600,
  webhookUrl: null,
  webhookProvider: null,
  keys: []
};

const ConfigContext = createContext<ConfigContextType>({
  config: defaultConfig,
  updateConfig: async () => {},
  loading: true,
});

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [config, setConfig] = useState<Config>(() => {
    // Load non-webhook config from localStorage as fallback
    try {
      const savedConfig = localStorage.getItem('dns_manager_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        // Remove webhook config from localStorage (now stored server-side)
        delete parsed.webhookUrl;
        delete parsed.webhookProvider;
        return ensureValidConfig({ ...defaultConfig, ...parsed });
      }
      return defaultConfig;
    } catch (e) {
      console.error('Failed to parse saved config:', e);
      return defaultConfig;
    }
  });
  const [loading, setLoading] = useState(true);

  // Fetch webhook configuration from backend when authenticated
  useEffect(() => {
    const fetchWebhookConfig = async () => {
      if (isAuthenticated) {
        try {
          const response = await fetch(`${API_URL}/api/webhook-config`, {
            method: 'GET',
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            if (data.config) {
              setConfig(prev => ({
                ...prev,
                webhookUrl: data.config.webhookUrl,
                webhookProvider: data.config.webhookProvider,
              }));
            }
          }
        } catch (error) {
          console.error('Failed to fetch webhook config:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchWebhookConfig();
  }, [isAuthenticated]);

  const updateConfig = useCallback(async (newConfig: Config) => {
    const validConfig = ensureValidConfig(newConfig);

    // Save non-webhook config to localStorage
    const localConfig = { ...validConfig };
    delete localConfig.webhookUrl;
    delete localConfig.webhookProvider;
    localStorage.setItem('dns_manager_config', JSON.stringify(localConfig));

    // Save webhook config to backend
    if (isAuthenticated) {
      try {
        await fetch(`${API_URL}/api/webhook-config`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            webhookUrl: validConfig.webhookUrl,
            webhookProvider: validConfig.webhookProvider,
            enabled: true,
          }),
        });
      } catch (error) {
        console.error('Failed to update webhook config:', error);
        throw new Error('Failed to save webhook configuration');
      }
    }

    setConfig(validConfig);
  }, [isAuthenticated]);

  return (
    <ConfigContext.Provider value={{ config, updateConfig, loading }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
} 