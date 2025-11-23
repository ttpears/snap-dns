import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { ConfigProvider } from './context/ConfigContext';
import { PendingChangesProvider } from './context/PendingChangesContext';
import { ZoneProvider } from './context/ZoneContext';
import { KeyProvider } from './context/KeyContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import AppContent from './components/AppContent';
import Login from './components/Login';

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <ConfigProvider>
      <KeyProvider>
        <ZoneProvider>
          <PendingChangesProvider>
            <BrowserRouter>
              <AppContent drawerWidth={240} />
            </BrowserRouter>
          </PendingChangesProvider>
        </ZoneProvider>
      </KeyProvider>
    </ConfigProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App; 