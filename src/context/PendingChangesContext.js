import React, { createContext, useContext, useState } from 'react';

const PendingChangesContext = createContext();

export function PendingChangesProvider({ children }) {
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);

  const addPendingChange = (change) => {
    setPendingChanges(prev => [...prev, { ...change, id: Date.now() }]);
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