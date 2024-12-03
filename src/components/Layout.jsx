import React from 'react';
import { Box, Typography, IconButton, useTheme, Toolbar, Divider, Button } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import Navigation from './Navigation';
import PendingChangesDrawer from './PendingChangesDrawer';
import { useConfig } from '../context/ConfigContext';
import { usePendingChanges } from '../context/PendingChangesContext';

function Layout({ children }) {
  const location = useLocation();
  const theme = useTheme();
  const { toggleDarkMode } = useConfig();
  const { 
    pendingChanges, 
    setPendingChanges,
    showPendingDrawer, 
    setShowPendingDrawer,
    addPendingChange,
    removePendingChange,
    clearPendingChanges
  } = usePendingChanges();
  
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'Add DNS Record';
      case '/zones':
        return 'Zone Editor';
      case '/snapshots':
        return 'Snapshots';
      case '/settings':
        return 'Settings';
      default:
        return '';
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      minHeight: '100vh',
      bgcolor: 'background.default',
      color: 'text.primary'
    }}>
      <Box 
        component="nav"
        sx={{ 
          width: 240, 
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          height: '100vh',
          overflow: 'auto',
          position: 'fixed',
          bgcolor: 'background.paper'
        }}
      >
        <Navigation />
      </Box>
      <Box sx={{ 
        flexGrow: 1, 
        ml: '240px', // Match drawer width
        p: 3 
      }}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          mb: 3
        }}>
          <Typography variant="h6">
            {getPageTitle()}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {pendingChanges.length > 0 && (
              <Button
                variant="outlined"
                onClick={() => setShowPendingDrawer(true)}
                color="primary"
                size="small"
              >
                Pending Changes ({pendingChanges.length})
              </Button>
            )}
            <IconButton onClick={toggleDarkMode} color="inherit">
              {theme.palette.mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
            </IconButton>
          </Box>
        </Box>
        {children}
      </Box>
      <PendingChangesDrawer 
        open={showPendingDrawer}
        onClose={() => setShowPendingDrawer(false)}
        pendingChanges={pendingChanges}
        setPendingChanges={setPendingChanges}
        removePendingChange={removePendingChange}
        clearPendingChanges={clearPendingChanges}
      />
    </Box>
  );
}

export default Layout; 