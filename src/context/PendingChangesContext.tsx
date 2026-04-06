// src/context/PendingChangesContext.tsx
import React, { createContext, useContext, useState } from 'react';
import { PendingChange } from '../types/dns';

interface PendingChangesContextType {
  pendingChanges: PendingChange[];
  setPendingChanges: React.Dispatch<React.SetStateAction<PendingChange[]>>;
  addPendingChange: (change: PendingChange) => void;
  removePendingChange: (changeId: string) => void;
  clearPendingChanges: () => void;
  showPendingDrawer: boolean;
  setShowPendingDrawer: React.Dispatch<React.SetStateAction<boolean>>;
}

const PendingChangesContext = createContext<PendingChangesContextType | undefined>(undefined);

export function PendingChangesProvider({ children }: { children: React.ReactNode }) {
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);

  const addPendingChange = (change: PendingChange) => {
    setPendingChanges(prev => [...prev, change]);
  };

  const removePendingChange = (changeId: string) => {
    setPendingChanges(prev => prev.filter((change: any) => change.id !== changeId));
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

export function usePendingChanges(): PendingChangesContextType {
  const context = useContext(PendingChangesContext);
  if (!context) {
    throw new Error('usePendingChanges must be used within a PendingChangesProvider');
  }
  return context;
}
