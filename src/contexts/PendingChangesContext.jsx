import React, { useCallback, useState } from 'react';

const PendingChangesContext = React.createContext();

const PendingChangesProvider = () => {
  const [pendingChanges, setPendingChanges] = useState([]);

  const addPendingChange = useCallback((change) => {
    // Ensure each change has a string ID
    const changeWithId = {
      ...change,
      id: `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    setPendingChanges(prev => [...prev, changeWithId]);
  }, []);

  return (
    <PendingChangesContext.Provider value={{ pendingChanges, addPendingChange }}>
      {/* Your component content here */}
    </PendingChangesContext.Provider>
  );
};

export default PendingChangesProvider; 