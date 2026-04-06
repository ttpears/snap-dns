// src/context/ZoneContext.tsx
import React, { createContext, useContext, useState } from 'react';

interface ZoneContextType {
  selectedZone: string;
  setSelectedZone: (zone: string) => void;
}

const ZoneContext = createContext<ZoneContextType | undefined>(undefined);

export function ZoneProvider({ children }: { children: React.ReactNode }) {
  const [selectedZone, setSelectedZone] = useState<string>('');

  return (
    <ZoneContext.Provider value={{ selectedZone, setSelectedZone }}>
      {children}
    </ZoneContext.Provider>
  );
}

export function useZone(): ZoneContextType {
  const context = useContext(ZoneContext);
  if (!context) {
    throw new Error('useZone must be used within a ZoneProvider');
  }
  return context;
}
