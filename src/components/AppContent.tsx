// src/components/AppContent.tsx
import React, { useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Layout from './Layout';
import AddDNSRecord from './AddDNSRecord';
import ZoneEditor from './ZoneEditor';
import Settings from './Settings';
import Snapshots from './Snapshots';
import { useKey } from '../context/KeyContext';

function AppContent() {
  const { selectedKey, selectedZone } = useKey();
  const navigate = useNavigate();
  const location = useLocation();
  const isManualNavigation = useRef(false);

  // Auto-navigate to zone editor when a zone is selected from settings
  useEffect(() => {
    if (selectedZone && selectedKey && location.pathname === '/settings' && !isManualNavigation.current) {
      navigate('/zones');
    }
    isManualNavigation.current = false;
  }, [selectedZone, selectedKey, navigate, location.pathname]);

  // Track manual navigations to prevent auto-redirect from overriding them
  useEffect(() => {
    const handleBeforeNavigate = () => {
      isManualNavigation.current = true;
    };

    document.addEventListener('click', handleBeforeNavigate, true);
    document.addEventListener('keydown', handleBeforeNavigate, true);

    return () => {
      document.removeEventListener('click', handleBeforeNavigate, true);
      document.removeEventListener('keydown', handleBeforeNavigate, true);
    };
  }, []);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<AddDNSRecord />} />
        <Route path="/zones" element={<ZoneEditor />} />
        <Route path="/snapshots" element={<Snapshots />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default AppContent;
