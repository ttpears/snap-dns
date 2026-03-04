// src/context/KeyContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useConfig } from './ConfigContext';
import { tsigKeyService, TSIGKey } from '../services/tsigKeyService';
import { useAuth } from './AuthContext';

export interface AvailableKey {
  id: string;
  name: string;
  server: string;
  keyName: string;
  secret: string;
  algorithm: string;
  zones: string[];
  type: string;
}

interface KeyContextType {
  selectedKey: AvailableKey | null;
  selectedZone: string | null;
  selectKey: (key: AvailableKey | null) => void;
  selectZone: (zone: string | null) => void;
  availableZones: string[];
  availableKeys: AvailableKey[];
}

const KeyContext = createContext<KeyContextType | undefined>(undefined);

const STORAGE_KEY = 'dns_manager_selections';

export function KeyProvider({ children }: { children: React.ReactNode }) {
  const { config } = useConfig();
  const { isAuthenticated } = useAuth();
  const [selectedKey, setSelectedKey] = useState<AvailableKey | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [backendKeys, setBackendKeys] = useState<TSIGKey[]>([]);

  // Fetch keys from backend when authenticated
  useEffect(() => {
    const fetchKeys = async () => {
      if (isAuthenticated) {
        try {
          const keys = await tsigKeyService.listKeys();
          console.log('Fetched keys from backend:', keys);
          setBackendKeys(keys);
        } catch (error) {
          console.error('Failed to fetch keys from backend:', error);
          setBackendKeys([]);
        }
      } else {
        setBackendKeys([]);
      }
    };

    fetchKeys();
  }, [isAuthenticated]);

  // Calculate available keys and zones
  const availableZones = React.useMemo(() => {
    const zones = new Set<string>();
    const keysToUse: any[] = backendKeys.length > 0 ? backendKeys : (config.keys || []);
    keysToUse.forEach((key: any) => {
      key.zones?.forEach((zone: string) => zones.add(zone));
    });
    return Array.from(zones);
  }, [backendKeys, config.keys]);

  const availableKeys: AvailableKey[] = React.useMemo(() => {
    const keysToUse: any[] = backendKeys.length > 0 ? backendKeys : (config.keys || []);
    return keysToUse.map((key: any) => ({
      id: key.id,
      name: key.name,
      server: key.server,
      keyName: key.keyName || key.name,
      secret: key.keyValue || key.secret || 'server-side',
      algorithm: key.algorithm,
      zones: key.zones || [],
      type: key.type || 'internal'
    }));
  }, [backendKeys, config.keys]);

  const availableZonesForKey = React.useMemo(() => {
    if (!selectedKey) return availableZones;
    return selectedKey.zones || [];
  }, [selectedKey, availableZones]);

  // Load saved selections on mount - wait for availableKeys to be populated
  useEffect(() => {
    if (!initialized && availableKeys.length > 0) {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

        if (saved.keyId) {
          const savedKey = availableKeys.find(k => k.id === saved.keyId);
          if (savedKey) {
            console.log('Restoring saved key selection:', savedKey.name);
            setSelectedKey(savedKey);
            if (saved.zone && savedKey.zones?.includes(saved.zone)) {
              console.log('Restoring saved zone selection:', saved.zone);
              setSelectedZone(saved.zone);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load saved selections:', error);
      } finally {
        setInitialized(true);
      }
    }
  }, [availableKeys, initialized]);

  // Validate selections when availableKeys changes
  useEffect(() => {
    if (initialized && selectedKey) {
      const keyStillExists = availableKeys.find(k => k.id === selectedKey.id);
      const zoneStillValid = keyStillExists?.zones?.includes(selectedZone!);

      if (!keyStillExists || (selectedZone && !zoneStillValid)) {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const savedKey = availableKeys.find(k => k.id === saved.keyId);

        if (savedKey && (!saved.zone || savedKey.zones?.includes(saved.zone))) {
          setSelectedKey(savedKey);
          setSelectedZone(saved.zone || null);
        } else {
          setSelectedKey(null);
          setSelectedZone(null);
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  }, [availableKeys, selectedKey, selectedZone, initialized]);

  // Save selections to localStorage
  const saveSelections = (key: AvailableKey | null, zone: string | null) => {
    if (key) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        keyId: key.id,
        zone: zone
      }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const selectKey = (key: AvailableKey | null) => {
    setSelectedKey(key);
    if (key && selectedZone && !key.zones?.includes(selectedZone)) {
      setSelectedZone(null);
      saveSelections(key, null);
    } else {
      saveSelections(key, selectedZone);
    }
  };

  const selectZone = (zone: string | null) => {
    setSelectedZone(zone);
    if (zone && selectedKey && !selectedKey.zones?.includes(zone)) {
      setSelectedKey(null);
      saveSelections(null, zone);
    } else {
      saveSelections(selectedKey, zone);
    }
  };

  return (
    <KeyContext.Provider value={{
      selectedKey,
      selectedZone,
      selectKey,
      selectZone,
      availableZones,
      availableKeys
    }}>
      {children}
    </KeyContext.Provider>
  );
}

export function useKey(): KeyContextType {
  const context = useContext(KeyContext);
  if (!context) {
    throw new Error('useKey must be used within a KeyProvider');
  }
  return context;
}
