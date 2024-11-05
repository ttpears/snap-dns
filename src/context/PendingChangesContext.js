import React, { createContext, useContext, useState } from 'react';

const PendingChangesContext = createContext();

export function PendingChangesProvider({ children }) {
  const [pendingChanges, setPendingChanges] = useState([]);

  const addChange = (change) => {
    setPendingChanges(prev => [...prev, { ...change, id: Date.now() }]);
  };

  const removeChange = (id) => {
    setPendingChanges(prev => prev.filter(change => change.id !== id));
  };

  const clearChanges = () => {
    setPendingChanges([]);
  };

  return (
    <PendingChangesContext.Provider value={{
      pendingChanges,
      addChange,
      removeChange,
      clearChanges
    }}>
      {children}
    </PendingChangesContext.Provider>
  );
}

export const usePendingChanges = () => useContext(PendingChangesContext); 