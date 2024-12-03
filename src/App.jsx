import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from './context/ConfigContext';
import { PendingChangesProvider } from './context/PendingChangesContext';
import { ZoneProvider } from './context/ZoneContext';
import { KeyProvider } from './context/KeyContext';
import { ThemeProvider } from './context/ThemeContext';
import AppContent from './components/AppContent';

function App() {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}

export default App; 