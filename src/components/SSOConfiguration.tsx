// src/components/SSOConfiguration.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
  Paper,
  Divider,
  CircularProgress,
  Stack,
  Chip,
  FormHelperText,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import TestIcon from '@mui/icons-material/BugReport';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';

interface SSOConfig {
  enabled: boolean;
  provider: 'm365' | 'disabled';
  clientId?: string;
  tenantId?: string;
  clientSecret?: string;
  redirectUri?: string;
  postLogoutRedirectUri?: string;
  adminGroups?: string[];
  editorGroups?: string[];
}

function SSOConfiguration() {
  const [config, setConfig] = useState<SSOConfig>({
    enabled: false,
    provider: 'disabled',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/sso-config`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
      } else {
        setError(data.error || 'Failed to load SSO configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SSO configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Validate required fields if enabling M365
      if (config.enabled && config.provider === 'm365') {
        if (!config.clientId || !config.tenantId || !config.redirectUri) {
          setError('Client ID, Tenant ID, and Redirect URI are required for M365 SSO');
          setSaving(false);
          return;
        }
      }

      const response = await fetch(`${API_URL}/api/sso-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('SSO configuration saved successfully');
        loadConfig(); // Reload to get server response
      } else {
        setError(data.error || 'Failed to save SSO configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SSO configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/sso-config/test`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message + (data.note ? ` - ${data.note}` : ''));
      } else {
        setError(data.message || data.error || 'SSO configuration test failed');
        if (data.errors && Array.isArray(data.errors)) {
          setError(`Configuration errors: ${data.errors.join(', ')}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test SSO configuration');
    } finally {
      setTesting(false);
    }
  };

  const handleToggleEnable = (enabled: boolean) => {
    if (enabled && config.provider === 'disabled') {
      // If enabling, default to M365
      setConfig({ ...config, enabled, provider: 'm365' });
    } else {
      setConfig({ ...config, enabled });
    }
  };

  const handleFieldChange = (field: keyof SSOConfig, value: any) => {
    setConfig({ ...config, [field]: value });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Single Sign-On (SSO) Configuration</Typography>
        <Chip
          label={config.enabled ? 'Enabled' : 'Disabled'}
          color={config.enabled ? 'success' : 'default'}
        />
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Stack spacing={3}>
        {/* Enable SSO */}
        <FormControlLabel
          control={
            <Switch
              checked={config.enabled}
              onChange={(e) => handleToggleEnable(e.target.checked)}
            />
          }
          label="Enable SSO Authentication"
        />

        {/* Provider Selection */}
        <FormControl fullWidth disabled={!config.enabled}>
          <InputLabel>SSO Provider</InputLabel>
          <Select
            value={config.provider}
            label="SSO Provider"
            onChange={(e) => handleFieldChange('provider', e.target.value)}
          >
            <MenuItem value="disabled">Disabled</MenuItem>
            <MenuItem value="m365">Microsoft 365 / Entra ID</MenuItem>
          </Select>
          <FormHelperText>
            Select your identity provider for SSO authentication
          </FormHelperText>
        </FormControl>

        {/* M365 Configuration */}
        {config.enabled && config.provider === 'm365' && (
          <>
            <Divider />
            <Typography variant="h6" color="primary">
              Microsoft 365 / Entra ID Settings
            </Typography>

            <Alert severity="info">
              You need to create an App Registration in Azure Portal before configuring these
              settings. See documentation for setup instructions.
            </Alert>

            <TextField
              label="Client ID"
              fullWidth
              value={config.clientId || ''}
              onChange={(e) => handleFieldChange('clientId', e.target.value)}
              helperText="Application (client) ID from Azure App Registration"
              required
            />

            <TextField
              label="Tenant ID"
              fullWidth
              value={config.tenantId || ''}
              onChange={(e) => handleFieldChange('tenantId', e.target.value)}
              helperText="Directory (tenant) ID from Azure Portal"
              required
            />

            <TextField
              label="Client Secret"
              type="password"
              fullWidth
              value={config.clientSecret || ''}
              onChange={(e) => handleFieldChange('clientSecret', e.target.value)}
              helperText="Client secret from Azure App Registration (stored encrypted)"
              placeholder={config.clientSecret ? '••••••••••••' : ''}
            />

            <TextField
              label="Redirect URI"
              fullWidth
              value={config.redirectUri || ''}
              onChange={(e) => handleFieldChange('redirectUri', e.target.value)}
              helperText="Must match redirect URI configured in Azure (e.g., http://yourdomain.com:3002/api/auth/sso/callback)"
              required
              placeholder={`${window.location.protocol}//${window.location.hostname}:3002/api/auth/sso/callback`}
            />

            <TextField
              label="Post Logout Redirect URI"
              fullWidth
              value={config.postLogoutRedirectUri || ''}
              onChange={(e) => handleFieldChange('postLogoutRedirectUri', e.target.value)}
              helperText="Where to redirect after logout (e.g., http://yourdomain.com:3001/login)"
              placeholder={`${window.location.protocol}//${window.location.hostname}:3001/login`}
            />

            <Divider />
            <Typography variant="h6" color="primary">
              Role Mapping (Optional)
            </Typography>

            <TextField
              label="Admin Groups"
              fullWidth
              value={(config.adminGroups || []).join(', ')}
              onChange={(e) =>
                handleFieldChange(
                  'adminGroups',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )
              }
              helperText="Azure AD Group Object IDs for admin role (comma-separated)"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />

            <TextField
              label="Editor Groups"
              fullWidth
              value={(config.editorGroups || []).join(', ')}
              onChange={(e) =>
                handleFieldChange(
                  'editorGroups',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )
              }
              helperText="Azure AD Group Object IDs for editor role (comma-separated)"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />

            <Alert severity="warning">
              <Typography variant="body2">
                <strong>Note:</strong> After enabling SSO, local authentication will remain
                available as a fallback. You can disable local auth in production environment
                variables once SSO is tested.
              </Typography>
            </Alert>
          </>
        )}

        {/* Action Buttons */}
        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            Save Configuration
          </Button>

          {config.enabled && (
            <Button
              variant="outlined"
              onClick={handleTest}
              disabled={testing}
              startIcon={testing ? <CircularProgress size={20} /> : <TestIcon />}
            >
              Test Configuration
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

export default SSOConfiguration;
