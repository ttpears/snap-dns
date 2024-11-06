import React, { createContext, useContext, useState } from 'react';

const ZoneContext = createContext();

export function ZoneProvider({ children }) {
  const [selectedZone, setSelectedZone] = useState('');

  return (
    <ZoneContext.Provider value={{ selectedZone, setSelectedZone }}>
      {children}
    </ZoneContext.Provider>
  );
}

export function useZone() {
  const context = useContext(ZoneContext);
  if (!context) {
    throw new Error('useZone must be used within a ZoneProvider');
  }
  return context;
} 