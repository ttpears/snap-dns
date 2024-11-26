import React, { createContext, useContext, useState } from 'react';

const PendingChangesContext = createContext();

export function PendingChangesProvider({ children }) {
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  const addPendingChange = (change) => {
    console.log('Adding pending change:', change);

    const formattedChange = {
      id: `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: change.type,
      zone: change.zone,
      keyId: change.keyId
    };

    // Add type-specific properties
    if (change.type === 'ADD') {
      formattedChange.record = {
        name: change.record.name,
        type: change.record.type,
        value: change.record.value,
        ttl: change.record.ttl
      };
    } else if (change.type === 'MODIFY') {
      formattedChange.originalRecord = change.originalRecord;
      formattedChange.newRecord = change.newRecord;
    } else if (change.type === 'DELETE') {
      formattedChange.record = {
        name: change.record.name,
        type: change.record.type,
        value: change.record.value,
        ttl: change.record.ttl,
        class: change.record.class || 'IN'
      };
    }

    console.log('Formatted change:', formattedChange);
    setPendingChanges(prev => [...prev, formattedChange]);
  };

  const removePendingChange = (changeId) => {
    setPendingChanges(prev => prev.filter(change => change.id !== changeId));
  };

  const clearPendingChanges = () => {
    setPendingChanges([]);
  };

  const reorderPendingChanges = (startIndex, endIndex) => {
    setPendingChanges(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  };

  const applyChanges = async () => {
    setApplying(true);
    setError(null);
    
    try {
      // Apply the changes
      await dnsService.applyChanges(pendingChanges);
      
      // Log for debugging
      console.log('Changes applied, emitting event for zones:', 
        [...new Set(pendingChanges.map(change => change.zone))]);
      
      // Emit event with affected zones
      const affectedZones = [...new Set(pendingChanges.map(change => change.zone))];
      window.dispatchEvent(new CustomEvent('dnsChangesApplied', {
        detail: { zones: affectedZones }
      }));
      
      // Clear the changes
      setPendingChanges([]);
      setShowPendingDrawer(false);
    } catch (error) {
      console.error('Error applying changes:', error);
      setError(error.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <PendingChangesContext.Provider value={{
      pendingChanges,
      addPendingChange,
      removePendingChange,
      clearPendingChanges,
      reorderPendingChanges,
      showPendingDrawer,
      setShowPendingDrawer,
      setPendingChanges,
      applying,
      error
    }}>
      {children}
    </PendingChangesContext.Provider>
  );
}

export function usePendingChanges() {
  const context = useContext(PendingChangesContext);
  if (!context) {
    throw new Error('usePendingChanges must be used within a PendingChangesProvider');
  }
  return context;
} 