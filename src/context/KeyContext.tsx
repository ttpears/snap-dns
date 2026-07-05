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
  // availableZones is ALWAYS the union of zones across all keys, regardless of
  // whether a key is selected. Consumers that need only the selected key's
  // zones should read selectedKey.zones directly.
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

  // Calculate available keys and zones. availableZones is the union of zones
  // across all keys (key-agnostic) so zone-first selection can list everything.
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

  // Load saved selections on mount - wait for availableKeys to be populated
  useEffect(() => {
    if (!initialized && availableKeys.length > 0) {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

        if (saved.keyId) {
          const savedKey = availableKeys.find(k => k.id === saved.keyId);
          if (savedKey) {
            setSelectedKey(savedKey);
            if (saved.zone && savedKey.zones?.includes(saved.zone)) {
              setSelectedZone(saved.zone);
            }
          }
        } else if (saved.zone) {
          // Zone-only selection (zone-first flow with the key deselected)
          const zoneStillExists = availableKeys.some(k => k.zones?.includes(saved.zone));
          if (zoneStillExists) {
            setSelectedZone(saved.zone);
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

  // Save selections to localStorage; shape stays { keyId, zone }
  const saveSelections = (key: AvailableKey | null, zone: string | null) => {
    if (key || zone) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        keyId: key ? key.id : null,
        zone: zone
      }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // Selection transition rules:
  // - selectKey(key): the current zone is KEPT when the new key serves it;
  //   it is cleared only when the new key does not serve it. Deselecting the
  //   key (null) keeps the zone (zone-first state).
  // - selectZone(zone): the current key is KEPT when it serves the zone;
  //   otherwise the first available key serving the zone is auto-selected.
  //   Deselecting the zone (null) keeps the key.
  const selectKey = (key: AvailableKey | null) => {
    const keepZone = !key || !selectedZone || key.zones?.includes(selectedZone);
    const nextZone = keepZone ? selectedZone : null;
    setSelectedKey(key);
    setSelectedZone(nextZone);
    saveSelections(key, nextZone);
  };

  const selectZone = (zone: string | null) => {
    const keepKey = !zone || (selectedKey?.zones?.includes(zone) ?? false);
    const nextKey = keepKey
      ? selectedKey
      : availableKeys.find(k => k.zones?.includes(zone!)) || null;
    setSelectedKey(nextKey);
    setSelectedZone(zone);
    saveSelections(nextKey, zone);
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
