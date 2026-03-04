// src/components/Layout.tsx
import React from 'react';
import { Box, Typography, IconButton, Divider, Button, Menu, MenuItem, Chip } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { Brightness4, Brightness7, AccountCircle, Logout } from '@mui/icons-material';
import Navigation from './Navigation';
import PendingChangesDrawer from './PendingChangesDrawer';
import { useConfig } from '../context/ConfigContext';
import { usePendingChanges } from '../context/PendingChangesContext';
import { useAuth } from '../context/AuthContext';
import Footer from './Footer';
import { useTheme } from '../context/ThemeContext';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { darkMode, toggleDarkMode } = useTheme();
  const { config } = useConfig();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const {
    pendingChanges,
    showPendingDrawer,
    setShowPendingDrawer,
    removePendingChange,
    clearPendingChanges
  } = usePendingChanges();

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleUserMenuClose();
    await logout();
  };

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
        ml: '240px',
        p: 3,
        pb: 8
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
              {darkMode ? <Brightness7 /> : <Brightness4 />}
            </IconButton>
            {user && (
              <>
                <Chip
                  icon={<AccountCircle />}
                  label={user.username}
                  onClick={handleUserMenuOpen}
                  clickable
                  size="small"
                />
                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleUserMenuClose}
                >
                  <MenuItem disabled>
                    <Typography variant="caption" color="text.secondary">
                      Role: {user.role}
                    </Typography>
                  </MenuItem>
                  <Divider />
                  <MenuItem onClick={handleLogout}>
                    <Logout fontSize="small" sx={{ mr: 1 }} />
                    Logout
                  </MenuItem>
                </Menu>
              </>
            )}
          </Box>
        </Box>
        {children}
      </Box>
      <Footer />
      <PendingChangesDrawer
        open={showPendingDrawer}
        onClose={() => setShowPendingDrawer(false)}
        removePendingChange={removePendingChange}
        clearPendingChanges={clearPendingChanges}
      />
    </Box>
  );
}

export default Layout;
