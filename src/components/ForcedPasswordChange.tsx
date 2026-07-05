// src/components/ForcedPasswordChange.tsx
// Full-screen gate shown after login when the account still owes a forced
// password change (seeded default admin, or an admin-set initial password).
// Blocks the rest of the app until the user changes their password; reuses the
// same authService.changePassword flow as the in-app Change Password dialog.
import React, { useState } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Container,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';

export default function ForcedPasswordChange() {
  const { user, logout, clearMustChangePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current password');
      return;
    }

    setSubmitting(true);
    try {
      const result = await authService.changePassword(currentPassword, newPassword);
      if (result.success) {
        setSuccess('Password changed successfully. Loading application...');
        // Clearing the flag lets AuthenticatedApp render the full application.
        clearMustChangePassword();
      } else {
        setError(result.error || 'Failed to change password');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%', maxWidth: 420 }}>
          <Typography variant="h5" component="h1" gutterBottom align="center">
            Change Your Password
          </Typography>
          <Alert severity="warning" sx={{ my: 2 }}>
            You must change the default password before continuing.
          </Alert>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              label="Current Password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={submitting}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="New Password"
              type="password"
              autoComplete="new-password"
              helperText="Must be at least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={submitting}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Confirm New Password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 1 }}
              disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
              aria-label={submitting ? 'Changing password' : undefined}
            >
              {submitting ? <CircularProgress size={24} /> : 'Change Password'}
            </Button>
            <Button
              fullWidth
              variant="text"
              onClick={() => logout()}
              disabled={submitting}
            >
              Sign in as a different user
            </Button>
          </Box>

          {user && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 2, display: 'block', textAlign: 'center' }}
            >
              Signed in as {user.username}
            </Typography>
          )}
        </Paper>
      </Box>
    </Container>
  );
}
