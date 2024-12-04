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

export function KeyProvider({ children }) {
  const { config } = useConfig();
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);

  const availableZones = React.useMemo(() => {
    const zones = new Set();
    config.keys?.forEach(key => {
      key.zones?.forEach(zone => zones.add(zone));
    });
    return Array.from(zones);
  }, [config.keys]);

  const availableKeys = React.useMemo(() => {
    if (!selectedZone) return [];
    return config.keys?.filter(key => key.zones?.includes(selectedZone)) || [];
  }, [selectedZone, config.keys]);

  // Reset selections if config changes
  useEffect(() => {
    if (!config.keys?.length) {
      setSelectedKey(null);
      setSelectedZone(null);
      return;
    }

    // Validate current selections
    if (selectedKey && selectedZone) {
      const keyStillExists = config.keys.find(k => k.id === selectedKey.id);
      const zoneStillValid = keyStillExists?.zones?.includes(selectedZone);

      if (!keyStillExists || !zoneStillValid) {
        setSelectedKey(null);
        setSelectedZone(null);
      }
    }
  }, [config.keys, selectedKey, selectedZone]);

  const selectKey = (key) => {
    setSelectedKey(key);
    // If key changes and current zone isn't valid for new key, reset zone
    if (key && (!key.zones?.includes(selectedZone))) {
      setSelectedZone(null);
    }
  };

  const selectZone = (zone) => {
    setSelectedZone(zone);
    // If zone changes and current key isn't valid for new zone, reset key
    if (zone && selectedKey && !selectedKey.zones?.includes(zone)) {
      setSelectedKey(null);
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