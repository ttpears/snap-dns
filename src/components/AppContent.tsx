// src/components/AppContent.tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import ZoneEditor from './ZoneEditor';
import Settings from './Settings';
import Snapshots from './Snapshots';

// Navigation is always user-initiated. An earlier auto-redirect ("jump to
// /zones when a zone first becomes selected on /settings") misfired whenever
// the zone passed through null — key switches on the Settings page and
// localStorage restores after a refresh both bounced the user out of
// Settings — so it was removed rather than patched.
function AppContent() {
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
