// src/components/AppContent.tsx
import React, { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Layout from './Layout';
import ZoneEditor from './ZoneEditor';
import Settings from './Settings';
import Snapshots from './Snapshots';
import { useKey } from '../context/KeyContext';

function AppContent() {
  const { selectedZone } = useKey();
  const navigate = useNavigate();
  const location = useLocation();
  const prevZoneRef = useRef<string | null>(selectedZone);

  // Take the user to the zone editor only at the moment a zone first becomes
  // selected while they are on the settings page. Later navigation and
  // zone-to-zone switches are never overridden.
  useEffect(() => {
    const zoneJustSelected = !prevZoneRef.current && Boolean(selectedZone);
    prevZoneRef.current = selectedZone;
    if (zoneJustSelected && location.pathname === '/settings') {
      navigate('/zones');
    }
  }, [selectedZone, navigate, location.pathname]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/zones" replace />} />
        <Route path="/zones" element={<ZoneEditor />} />
        <Route path="/snapshots" element={<Snapshots />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/zones" replace />} />
      </Routes>
    </Layout>
  );
}

export default AppContent;
