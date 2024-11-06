import React, { createContext, useContext, useState } from 'react';

const PendingChangesContext = createContext();

export function PendingChangesProvider({ children }) {
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);

  const addPendingChange = (change) => {
    console.log('Adding pending change:', change);

    const formattedChange = {
      id: `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: change.type,
      zone: change.zone
    };

    // Add type-specific properties
    if (change.type === 'ADD') {
      formattedChange.name = change.name;
      formattedChange.recordType = change.recordType;
      formattedChange.value = change.value;
      formattedChange.ttl = change.ttl;
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

  return (
    <PendingChangesContext.Provider value={{
      pendingChanges,
      addPendingChange,
      removePendingChange,
      clearPendingChanges,
      reorderPendingChanges,
      showPendingDrawer,
      setShowPendingDrawer
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