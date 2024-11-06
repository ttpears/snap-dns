import React, { createContext, useContext, useState } from 'react';

const PendingChangesContext = createContext();

export function PendingChangesProvider({ children }) {
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);

  const addPendingChange = (change) => {
    const formattedChange = {
      id: Date.now(),
      type: change.type,
      zone: change.zone,
      name: change.name,
      recordType: change.recordType,
      value: change.value,
      ttl: change.ttl
    };

    // Add type-specific properties
    if (change.type === 'MODIFY') {
      formattedChange.originalRecord = change.originalRecord;
      formattedChange.newRecord = change.newRecord;
    } else if (change.type === 'DELETE') {
      formattedChange.originalRecord = change.originalRecord;
    }

    setPendingChanges(prev => [...prev, formattedChange]);
  };

  const removePendingChange = (id) => {
    setPendingChanges(prev => prev.filter(change => change.id !== id));
  };

  const clearChanges = () => {
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
      clearChanges,
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