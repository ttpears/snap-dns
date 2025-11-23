// src/components/Login.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Container,
  Divider,
} from '@mui/material';
import MicrosoftIcon from '@mui/icons-material/Microsoft';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Check for SSO errors in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        sso_disabled: 'SSO is not enabled on this server',
        sso_init_failed: 'Failed to initiate SSO login',
        invalid_state: 'Invalid authentication state (possible CSRF attack)',
        no_code: 'No authorization code received from identity provider',
        callback_failed: 'SSO callback failed',
        access_denied: 'Access denied by identity provider',
      };
      setError(errorMessages[errorParam] || `SSO Error: ${errorParam}`);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSSOLogin = () => {
    // Redirect to backend SSO endpoint
    window.location.href = `${API_URL}/api/auth/sso/signin`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(username, password);

      if (!result.success) {
        setError(result.error || 'Login failed');
      }
      // If successful, the AuthContext will update and the app will re-render
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
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
        <Paper elevation={3} sx={{ p: 4, width: '100%', maxWidth: 400 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Snap DNS
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom align="center" sx={{ mb: 3 }}>
            DNS Management System
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* SSO Login Button */}
          <Button
            fullWidth
            variant="contained"
            size="large"
            startIcon={<MicrosoftIcon />}
            onClick={handleSSOLogin}
            sx={{ mb: 2 }}
          >
            Sign in with Microsoft
          </Button>

          <Divider sx={{ my: 2 }}>OR</Divider>

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={isLoading || !username || !password}
            >
              {isLoading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>
              Local authentication for fallback access
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
