import React, { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
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
  const navigate = useNavigate();
  const location = useLocation();
  const isManualNavigation = useRef(false);

  // Add effect to handle navigation when zone is selected
  useEffect(() => {
    if (selectedZone && selectedKey && location.pathname === '/settings' && !isManualNavigation.current) {
      // Only navigate to zone editor when a zone is selected from settings
      // and it's not a manual navigation
      navigate('/zones');
    }
    // Reset the manual navigation flag
    isManualNavigation.current = false;
  }, [selectedZone, selectedKey, navigate, location.pathname]);

  // Listen for navigation events
  useEffect(() => {
    const handleBeforeNavigate = () => {
      isManualNavigation.current = true;
    };

    // Add listeners for both click and keyboard navigation
    document.addEventListener('click', handleBeforeNavigate, true);
    document.addEventListener('keydown', handleBeforeNavigate, true);

    return () => {
      document.removeEventListener('click', handleBeforeNavigate, true);
      document.removeEventListener('keydown', handleBeforeNavigate, true);
    };
  }, []);

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
          element={<Snapshots />}
        />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default AppContent;