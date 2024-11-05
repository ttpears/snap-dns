import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import Layout from './components/Layout';
import ZoneManager from './components/ZoneManager';
import PendingChanges from './components/PendingChanges';
import DemoMode from './components/DemoMode';
import Settings from './components/Settings';
import { PendingChangesProvider } from './context/PendingChangesContext';
import { ConfigProvider, useConfig } from './context/ConfigContext';
import ZoneViewer from './components/ZoneViewer';

function AppContent() {
  const { config } = useConfig();

  const theme = createTheme({
    palette: {
      mode: config.darkMode ? 'dark' : 'light',
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PendingChangesProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<ZoneManager />} />
              <Route path="pending" element={<PendingChanges />} />
              <Route path="demo" element={<DemoMode />} />
              <Route path="settings" element={<Settings />} />
              <Route path="viewer" element={<ZoneViewer />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PendingChangesProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <ConfigProvider>
      <AppContent />
    </ConfigProvider>
  );
}

export default App; 