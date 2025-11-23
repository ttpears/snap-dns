import React, { createContext, useContext, useState, useEffect } from 'react';
import { useConfig } from './ConfigContext';
import { tsigKeyService } from '../services/tsigKeyService';
import { useAuth } from './AuthContext';

const KeyContext = createContext({
  selectedKey: null,
  selectedZone: null,
  selectKey: () => {},
  selectZone: () => {},
  availableZones: [],
  availableKeys: []
});

const STORAGE_KEY = 'dns_manager_selections';

export function KeyProvider({ children }) {
  const { config } = useConfig();
  const { isAuthenticated, user } = useAuth();
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [backendKeys, setBackendKeys] = useState([]);

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
          // Fall back to config keys if backend fetch fails
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
    const zones = new Set();
    // Use backend keys first, fall back to config keys
    const keysToUse = backendKeys.length > 0 ? backendKeys : (config.keys || []);
    keysToUse.forEach(key => {
      key.zones?.forEach(zone => zones.add(zone));
    });
    return Array.from(zones);
  }, [backendKeys, config.keys]);

  const availableKeys = React.useMemo(() => {
    // Use backend keys first, fall back to config keys
    const keysToUse = backendKeys.length > 0 ? backendKeys : (config.keys || []);
    return keysToUse.map(key => ({
      id: key.id,
      name: key.name,
      server: key.server,
      keyName: key.keyName || key.name,
      // keyValue/secret is no longer needed on frontend - keys are stored server-side
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
      const zoneStillValid = keyStillExists?.zones?.includes(selectedZone);

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
  const saveSelections = (key, zone) => {
    if (key) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        keyId: key.id,
        zone: zone
      }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const selectKey = (key) => {
    setSelectedKey(key);
    // If key changes and current zone isn't valid for new key, reset zone
    if (key && selectedZone && !key.zones?.includes(selectedZone)) {
      setSelectedZone(null);
      saveSelections(key, null);
    } else {
      saveSelections(key, selectedZone);
    }
  };

  const selectZone = (zone) => {
    setSelectedZone(zone);
    // If zone changes and current key isn't valid for new zone, reset key
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

export function useKey() {
  const context = useContext(KeyContext);
  if (!context) {
    throw new Error('useKey must be used within a KeyProvider');
  }
  return context;
} 