import React, { createContext, useContext, useState, useEffect } from 'react';
import { useConfig } from './ConfigContext';

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
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [initialized, setInitialized] = useState(false);

  // Calculate available keys and zones
  const availableZones = React.useMemo(() => {
    const zones = new Set();
    config.keys?.forEach(key => {
      key.zones?.forEach(zone => zones.add(zone));
    });
    return Array.from(zones);
  }, [config.keys]);

  const availableKeys = React.useMemo(() => {
    return (config.keys || []).map(key => ({
      id: key.id,
      name: key.name,
      server: key.server,
      keyName: key.keyName || key.name,
      keyValue: key.keyValue || key.secret,
      algorithm: key.algorithm,
      zones: key.zones || [],
      type: key.type || 'internal'
    }));
  }, [config.keys]);

  const availableZonesForKey = React.useMemo(() => {
    if (!selectedKey) return availableZones;
    return selectedKey.zones || [];
  }, [selectedKey, availableZones]);

  // Load saved selections on mount
  useEffect(() => {
    if (!initialized && config.keys?.length) {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        
        if (saved.keyId) {
          const savedKey = config.keys.find(k => k.id === saved.keyId);
          if (savedKey) {
            setSelectedKey(savedKey);
            if (saved.zone && savedKey.zones?.includes(saved.zone)) {
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
  }, [config.keys, initialized]);

  // Validate selections when config changes
  useEffect(() => {
    if (initialized && selectedKey) {
      const keyStillExists = config.keys?.find(k => k.id === selectedKey.id);
      const zoneStillValid = keyStillExists?.zones?.includes(selectedZone);

      if (!keyStillExists || (selectedZone && !zoneStillValid)) {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const savedKey = config.keys?.find(k => k.id === saved.keyId);
        
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
  }, [config.keys, selectedKey, selectedZone, initialized]);

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