// src/context/PendingChangesContext.tsx
import React, { createContext, useContext, useState } from 'react';
import { NewPendingChange, PendingChange } from '../types/dns';

interface PendingChangesContextType {
  pendingChanges: PendingChange[];
  setPendingChanges: React.Dispatch<React.SetStateAction<PendingChange[]>>;
  addPendingChange: (change: NewPendingChange) => void;
  removePendingChange: (changeId: string) => void;
  clearPendingChanges: () => void;
  showPendingDrawer: boolean;
  setShowPendingDrawer: React.Dispatch<React.SetStateAction<boolean>>;
}

// Stamp a unique id so each queued change can be removed individually.
function generateChangeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `chg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const PendingChangesContext = createContext<PendingChangesContextType | undefined>(undefined);

export function PendingChangesProvider({ children }: { children: React.ReactNode }) {
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);

  const addPendingChange = (change: NewPendingChange) => {
    const stamped: PendingChange = { ...change, id: change.id ?? generateChangeId() };
    setPendingChanges(prev => [...prev, stamped]);
  };

  const removePendingChange = (changeId: string) => {
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

export function usePendingChanges(): PendingChangesContextType {
  const context = useContext(PendingChangesContext);
  if (!context) {
    throw new Error('usePendingChanges must be used within a PendingChangesProvider');
  }
  return context;
}
