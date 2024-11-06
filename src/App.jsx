import React, { useState, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { ConfigProvider } from './context/ConfigContext';
import { PendingChangesProvider } from './context/PendingChangesContext';
import { ZoneProvider } from './context/ZoneContext';
import AppContent from './components/AppContent';
import useMediaQuery from '@mui/material/useMediaQuery';

function App() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('snapdns_theme');
    return saved ? saved === 'dark' : prefersDarkMode;
  });

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: darkMode ? 'dark' : 'light',
        },
      }),
    [darkMode]
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('snapdns_theme', newMode ? 'dark' : 'light');
  };

  return (
    <ThemeProvider theme={theme}>
      <ConfigProvider>
        <ZoneProvider>
          <PendingChangesProvider>
            <BrowserRouter>
              <AppContent drawerWidth={240} darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
            </BrowserRouter>
          </PendingChangesProvider>
        </ZoneProvider>
      </ConfigProvider>
    </ThemeProvider>
  );
}

export default App; 