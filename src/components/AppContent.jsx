import React, { useEffect } from 'react';
import {
  Box,
  CssBaseline,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  Container,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Button,
} from '@mui/material';
import {
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Dns as DnsIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';
import { usePendingChanges } from '../context/PendingChangesContext';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './Navigation';
import ZoneEditor from './ZoneEditor';
import BackupImport from './BackupImport';
import Settings from './Settings';
import AddDNSRecord from './AddDNSRecord';
import { notificationService } from '../services/notificationService';
import PendingChangesDrawer from './PendingChangesDrawer';

function AppContent({ drawerWidth, darkMode, toggleDarkMode }) {
  const { config } = useConfig();
  const { pendingChanges, showPendingDrawer, setShowPendingDrawer } = usePendingChanges();

  useEffect(() => {
    notificationService.setWebhookUrl(config.webhookUrl || null);
  }, [config.webhookUrl]);

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="h6" noWrap component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DnsIcon /> Snap DNS Manager
          </Typography>
          <Tooltip title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
            <IconButton color="inherit" onClick={toggleDarkMode}>
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { 
            width: drawerWidth, 
            boxSizing: 'border-box' 
          },
        }}
      >
        <Toolbar />
        <Navigation />
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` }
        }}
      >
        <Toolbar />
        <Container maxWidth="xl">
          <Routes>
            <Route path="/" element={<Navigate to="/zones" replace />} />
            <Route path="/zones" element={<ZoneEditor />} />
            <Route path="/add" element={<AddDNSRecord />} />
            <Route path="/backup" element={<BackupImport />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Container>
      </Box>

      <PendingChangesDrawer />
    </Box>
  );
}

export default AppContent;