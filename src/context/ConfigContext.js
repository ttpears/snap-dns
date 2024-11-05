import React, { createContext, useContext, useState, useEffect } from 'react';
import { dnsService } from '../services/dnsService';

const ConfigContext = createContext();

const defaultConfig = {
  darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
  defaultTTL: 3600,
  defaultResolver: '127.0.0.1',
  alternateResolvers: ['1.1.1.1', '8.8.8.8'],
  keys: [
    {
      id: 'internal',
      name: 'Internal DDNS Key',
      keyName: '',
      keyValue: '',
      algorithm: 'hmac-sha512',
      server: '',
      zones: []  // zones this key can manage
    },
    {
      id: 'external',
      name: 'External DDNS Key',
      keyName: '',
      keyValue: '',
      algorithm: 'hmac-sha512',
      server: '',
      zones: []
    }
  ],
  savedZones: []  // All zones across all keys
};

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(() => {
    try {
      const savedConfig = localStorage.getItem('dnsManagerConfig');
      return savedConfig 
        ? { ...defaultConfig, ...JSON.parse(savedConfig) }
        : defaultConfig;
    } catch (error) {
      console.error('Error loading config:', error);
      return defaultConfig;
    }
  });

  const updateConfig = (newConfig) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  const purgeConfig = () => {
    localStorage.removeItem('dnsManagerConfig');
    setConfig(defaultConfig);
  };

  const loadZoneFromServer = async (zoneName) => {
    try {
      const records = await dnsService.getZoneRecords(zoneName);
      const zoneConfig = {
        name: zoneName,
        records,
        lastUpdated: new Date().toISOString()
      };
      
      updateConfig({
        savedZones: [...config.savedZones.filter(z => z.name !== zoneName), zoneConfig]
      });
      
      return zoneConfig;
    } catch (error) {
      console.error('Failed to load zone:', error);
      throw error;
    }
  };

  const removeSavedZone = (zoneName) => {
    updateConfig({
      savedZones: config.savedZones.filter(z => z.name !== zoneName)
    });
  };

  useEffect(() => {
    localStorage.setItem('dnsManagerConfig', JSON.stringify(config));
  }, [config]);

  return (
    <ConfigContext.Provider value={{ 
      config, 
      updateConfig, 
      purgeConfig,
      loadZoneFromServer,
      removeSavedZone
    }}>
      {children}
    </ConfigContext.Provider>
  );
}

export const useConfig = () => useContext(ConfigContext); 