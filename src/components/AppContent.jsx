import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import AddDNSRecord from './AddDNSRecord';
import ZoneEditor from './ZoneEditor';
import Settings from './Settings';
import Snapshots from './Snapshots';
import { useKey } from '../context/KeyContext';
import { useConfig } from '../context/ConfigContext';

function AppContent({ darkMode, toggleDarkMode }) {
  const { selectedKey, selectedZone } = useKey();
  const { config } = useConfig();

  // Protected route component that requires key selection
  const ProtectedZoneRoute = ({ children }) => {
    if (!selectedKey && (!config.keys || config.keys.length === 0)) {
      return (
        <Navigate 
          to="/settings" 
          replace 
          state={{ message: 'Please configure a TSIG key first' }} 
        />
      );
    }
    return children;
  };

  return (
    <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
      <Routes>
        <Route 
          path="/" 
          element={
            <ProtectedZoneRoute>
              <AddDNSRecord />
            </ProtectedZoneRoute>
          } 
        />
        <Route 
          path="/zones" 
          element={
            <ProtectedZoneRoute>
              <ZoneEditor />
            </ProtectedZoneRoute>
          } 
        />
        <Route 
          path="/snapshots" 
          element={
            <ProtectedZoneRoute>
              <Snapshots />
            </ProtectedZoneRoute>
          } 
        />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default AppContent;