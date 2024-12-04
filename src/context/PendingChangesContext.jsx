import React, { createContext, useContext, useState } from 'react';

const PendingChangesContext = createContext({
  pendingChanges: [],
  setPendingChanges: () => {},
  addPendingChange: () => {},
  removePendingChange: () => {},
  clearPendingChanges: () => {},
  showPendingDrawer: false,
  setShowPendingDrawer: () => {}
});

export function PendingChangesProvider({ children }) {
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);

  const addPendingChange = (change) => {
    setPendingChanges(prev => [...prev, change]);
    setShowPendingDrawer(true);
  };

  const removePendingChange = (changeId) => {
    setPendingChanges(prev => prev.filter(change => change.id !== changeId));
  };

  const clearPendingChanges = () => {
    setPendingChanges([]);
    setShowPendingDrawer(false);
  };

  return (
    <PendingChangesContext.Provider value={{
      pendingChanges,
      setPendingChanges,
      addPendingChange,
      removePendingChange,
      clearPendingChanges,
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