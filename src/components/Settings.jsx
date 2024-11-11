import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  IconButton,
  CircularProgress,
  FormControlLabel,
  Switch,
  FormHelperText,
  Divider
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Download as DownloadIcon,
  Upload as UploadIcon
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';
import { notificationService } from '../services/notificationService';
import KeyManagement from './KeyManagement';

function Settings() {
  const { config, updateConfig } = useConfig();
  const [defaultTTL, setDefaultTTL] = useState(config.defaultTTL || 3600);
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl || '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateConfig({
        ...config,
        defaultTTL,
        webhookUrl: webhookUrl.trim() || null
      });
      
      notificationService.setWebhookUrl(webhookUrl.trim() || null);
      setSuccess('Settings saved successfully');
    } catch (error) {
      setError(`Failed to save settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportConfig = () => {
    try {
      // Get all localStorage data
      const configData = {
        dns_manager_config: localStorage.getItem('dns_manager_config'),
        dnsBackups: localStorage.getItem('dnsBackups')
      };

      // Create blob and download
      const blob = new Blob([JSON.stringify(configData, null, 2)], { 
        type: 'application/json' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snap-dns-config-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess('Configuration exported successfully');
    } catch (error) {
      setError(`Failed to export configuration: ${error.message}`);
    }
  };

  const handleImportConfig = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        
        // Validate imported data structure
        if (!importedData.dns_manager_config) {
          throw new Error('Invalid configuration file');
        }

        // Import configuration
        localStorage.setItem('dns_manager_config', importedData.dns_manager_config);
        if (importedData.dnsBackups) {
          localStorage.setItem('dnsBackups', importedData.dnsBackups);
        }

        // Update current config state
        const newConfig = JSON.parse(importedData.dns_manager_config);
        await updateConfig(newConfig);

        setSuccess('Configuration imported successfully. Please refresh the page.');
      } catch (error) {
        setError(`Failed to import configuration: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Application Settings
        </Typography>

        <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <FormControl>
            <InputLabel>Default TTL</InputLabel>
            <Select
              value={defaultTTL}
              onChange={(e) => setDefaultTTL(e.target.value)}
              label="Default TTL"
            >
              <MenuItem value={300}>5 minutes</MenuItem>
              <MenuItem value={3600}>1 hour</MenuItem>
              <MenuItem value={86400}>24 hours</MenuItem>
            </Select>
            <FormHelperText>Default Time-To-Live for new records</FormHelperText>
          </FormControl>

          <TextField
            label="Mattermost Webhook URL"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            helperText="Receive notifications when DNS changes are applied"
            fullWidth
          />

          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            Save Settings
          </Button>

          <Divider sx={{ my: 2 }} />

          <Typography variant="h6" gutterBottom>
            Configuration Backup
          </Typography>

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportConfig}
            >
              Export Configuration
            </Button>
            <Button
              variant="outlined"
              component="label"
              startIcon={<UploadIcon />}
            >
              Import Configuration
              <input
                type="file"
                hidden
                accept=".json"
                onChange={handleImportConfig}
              />
            </Button>
          </Stack>

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" onClose={() => setSuccess(null)}>
              {success}
            </Alert>
          )}
        </Box>
      </Paper>

      <KeyManagement />
    </Box>
  );
}

export default Settings;