// src/components/Layout.tsx
import React, { useState } from 'react';
import {
  Box, Typography, IconButton, Divider, Button, Menu, MenuItem, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert,
  CircularProgress,
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import { Brightness4, Brightness7, AccountCircle, Logout, Lock } from '@mui/icons-material';
import Navigation from './Navigation';
import PendingChangesDrawer from './PendingChangesDrawer';
import { useConfig } from '../context/ConfigContext';
import { usePendingChanges } from '../context/PendingChangesContext';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import Footer from './Footer';
import { useTheme } from '../context/ThemeContext';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { darkMode, toggleDarkMode } = useTheme();
  const { config } = useConfig();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
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

  const handleOpenPasswordDialog = () => {
    handleUserMenuClose();
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordSuccess(null);
    setPasswordDialogOpen(true);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      const result = await authService.changePassword(currentPassword, newPassword);
      if (result.success) {
        setPasswordSuccess('Password changed successfully');
        setTimeout(() => setPasswordDialogOpen(false), 1500);
      } else {
        setPasswordError(result.error || 'Failed to change password');
      }
    } catch {
      setPasswordError('Failed to connect to server');
    } finally {
      setChangingPassword(false);
    }
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
            <Button
              variant="outlined"
              onClick={() => setShowPendingDrawer(true)}
              color="primary"
              size="small"
            >
              Pending Changes ({pendingChanges.length})
            </Button>
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
                  <MenuItem onClick={handleOpenPasswordDialog}>
                    <Lock fontSize="small" sx={{ mr: 1 }} />
                    Change Password
                  </MenuItem>
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

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          {passwordError && (
            <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{passwordError}</Alert>
          )}
          {passwordSuccess && (
            <Alert severity="success" sx={{ mb: 2, mt: 1 }}>{passwordSuccess}</Alert>
          )}
          <TextField
            margin="dense"
            label="Current Password"
            type="password"
            fullWidth
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            disabled={changingPassword}
          />
          <TextField
            margin="dense"
            label="New Password"
            type="password"
            fullWidth
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            helperText="Must be at least 8 characters"
            disabled={changingPassword}
          />
          <TextField
            margin="dense"
            label="Confirm New Password"
            type="password"
            fullWidth
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={changingPassword}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordDialogOpen(false)} disabled={changingPassword}>
            Cancel
          </Button>
          <Button
            onClick={handleChangePassword}
            variant="contained"
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            startIcon={changingPassword ? <CircularProgress size={16} /> : undefined}
          >
            Change Password
          </Button>
        </DialogActions>
      </Dialog>

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
