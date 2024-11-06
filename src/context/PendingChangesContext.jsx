import React, { createContext, useContext, useState } from 'react';

const PendingChangesContext = createContext();

export function PendingChangesProvider({ children }) {
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);

  const addPendingChange = (change) => {
    setPendingChanges(prev => [...prev, change]);
  };

  const removePendingChange = (index) => {
    setPendingChanges(prev => prev.filter((_, i) => i !== index));
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

export function usePendingChanges() {
  const context = useContext(PendingChangesContext);
  if (!context) {
    throw new Error('usePendingChanges must be used within a PendingChangesProvider');
  }
  return context;
} 