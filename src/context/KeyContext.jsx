import React, { createContext, useContext, useState } from 'react';

const KeyContext = createContext();
const CONFIG_KEY = 'dns_manager_config';
const SELECTED_KEY_ID = 'dns_manager_selected_key';
const SELECTED_ZONE = 'dns_manager_selected_zone';

export function KeyProvider({ children }) {
  // Initialize state from localStorage, using the existing config structure
  const [keys, setKeys] = useState(() => {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      const config = JSON.parse(saved);
      return config.keys || [];
    }
    return [];
  });

  const [selectedKey, setSelectedKey] = useState(() => {
    const savedSelectedId = localStorage.getItem(SELECTED_KEY_ID);
    if (savedSelectedId) {
      const saved = localStorage.getItem(CONFIG_KEY);
      if (saved) {
        const config = JSON.parse(saved);
        return config.keys?.find(k => k.id === savedSelectedId) || null;
      }
    }
    return null;
  });

  const [selectedZone, setSelectedZone] = useState(() => {
    const savedZone = localStorage.getItem(SELECTED_ZONE);
    if (savedZone && selectedKey) {
      return selectedKey.zones?.includes(savedZone) ? savedZone : null;
    }
    return null;
  });

  const addKey = (keyData) => {
    const newKey = {
      id: Date.now().toString(),
      ...keyData,
      zones: keyData.zones || [],
      created: new Date().toISOString()
    };
    
    setKeys(prev => {
      const updated = [...prev, newKey];
      // Update the entire config object
      const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      config.keys = updated;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      return updated;
    });
    
    // If this is the first key, select it automatically
    if (keys.length === 0) {
      selectKey(newKey);
    }
    
    return newKey;
  };

  const removeKey = (keyId) => {
    setKeys(prev => {
      const updated = prev.filter(key => key.id !== keyId);
      // Update the entire config object
      const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      config.keys = updated;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      
      // If we removed the selected key, clear selections
      if (selectedKey?.id === keyId) {
        selectKey(updated[0] || null);
        setSelectedZone(null);
      }
      
      return updated;
    });
  };

  const selectKey = (key) => {
    setSelectedKey(key);
    localStorage.setItem(SELECTED_KEY_ID, key?.id || '');
    // Clear zone selection when changing keys
    setSelectedZone(null);
    localStorage.removeItem(SELECTED_ZONE);
  };

  const selectZone = (zone) => {
    setSelectedZone(zone);
    localStorage.setItem(SELECTED_ZONE, zone || '');
  };

  const updateKey = (keyId, updatedData) => {
    setKeys(prev => {
      const updated = prev.map(key => 
        key.id === keyId 
          ? { ...key, ...updatedData, id: key.id, created: key.created }
          : key
      );
      // Update the entire config object
      const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      config.keys = updated;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      
      // Update selected key if it was the one being edited
      if (selectedKey?.id === keyId) {
        const updatedKey = updated.find(k => k.id === keyId);
        selectKey(updatedKey);
      }
      
      return updated;
    });
  };

  return (
    <KeyContext.Provider value={{ 
      keys,
      selectedKey,
      selectedZone,
      addKey,
      removeKey,
      updateKey,
      selectKey,
      selectZone
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