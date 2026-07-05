// src/App.tsx
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { ConfigProvider } from './context/ConfigContext';
import { PendingChangesProvider } from './context/PendingChangesContext';
import { KeyProvider } from './context/KeyContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import AppContent from './components/AppContent';
import Login from './components/Login';
import ForcedPasswordChange from './components/ForcedPasswordChange';

function AuthenticatedApp() {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();

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

  // Block all app access until a forced password change is completed.
  if (mustChangePassword) {
    return <ForcedPasswordChange />;
  }

  return (
    <ConfigProvider>
      <KeyProvider>
        <PendingChangesProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </PendingChangesProvider>
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