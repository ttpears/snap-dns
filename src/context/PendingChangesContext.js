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
    // For ADD type, we already have the basic properties

    setPendingChanges(prev => [...prev, formattedChange]);
  };

  const removePendingChange = (id) => {
    setPendingChanges(prev => prev.filter(change => change.id !== id));
  };

  const clearChanges = () => {
    setPendingChanges([]);
  };

  return (
    <PendingChangesContext.Provider value={{
      pendingChanges,
      addPendingChange,
      removePendingChange,
      clearChanges,
      showPendingDrawer,
      setShowPendingDrawer
    }}>
      {children}
    </PendingChangesContext.Provider>
  );
}

export const usePendingChanges = () => useContext(PendingChangesContext); 