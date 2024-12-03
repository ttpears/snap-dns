import React, { useState, useEffect } from 'react';
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
  CircularProgress,
  FormHelperText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { useConfig } from '../context/ConfigContext';
import { notificationService } from '../services/notificationService';
import KeyManagement from './KeyManagement';
import { Config, ensureValidConfig, WebhookProvider } from '../types/config';
import { Key } from '../types/keys';
import { backupService } from '../services/backupService';

// Webhook provider options with display names and descriptions
const WEBHOOK_PROVIDERS: Array<{
  value: WebhookProvider;
  label: string;
  description: string;
  urlPattern?: string;
}> = [
  {
    value: 'mattermost',
    label: 'Mattermost',
    description: 'Send notifications to Mattermost channels',
    urlPattern: 'https://<your-mattermost-instance>/hooks/xxx-xxx-xxx'
  },
  {
    value: 'slack',
    label: 'Slack',
    description: 'Send notifications to Slack channels',
    urlPattern: 'https://hooks.slack.com/services/xxx/xxx/xxx'
  },
  {
    value: 'discord',
    label: 'Discord',
    description: 'Send notifications to Discord channels',
    urlPattern: 'https://discord.com/api/webhooks/xxx/xxx'
  },
  {
    value: 'teams',
    label: 'Microsoft Teams',
    description: 'Send notifications to Microsoft Teams channels',
    urlPattern: 'https://xxx.webhook.office.com/xxx'
  },
  {
    value: 'generic',
    label: 'Generic Webhook',
    description: 'Send notifications to any webhook endpoint that accepts JSON'
  }
];

// Add this interface for imported data
interface ImportData {
  dns_manager_config: {
    zones?: string[];
    keys?: Array<{
      id: string;
      name: string;
      algorithm: string;
      secret: string;
      server: string;
      zones: string[];
      created?: number;
    }>;
    defaultTTL?: number;
    webhookUrl?: string | null;
    webhookProvider?: WebhookProvider;
  };
  dnsBackups?: Array<{
    id: string;
    timestamp: number;
    zone: string;
    server: string;
    records: any[];
    type: 'auto' | 'manual';
    description?: string;
    version: string;
  }>;
}

function Settings() {
  const { config, updateConfig } = useConfig();
  const [defaultTTL, setDefaultTTL] = useState(config.defaultTTL);
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl || '');
  const [webhookProvider, setWebhookProvider] = useState<WebhookProvider>(
    config.webhookProvider || 'mattermost'
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportKeys, setExportKeys] = useState(false);
  const [exportSettings, setExportSettings] = useState(true);
  const [exportZonesOnly, setExportZonesOnly] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importedData, setImportedData] = useState<ImportData | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [importType, setImportType] = useState<'full' | 'zones' | null>(null);
  const [exportBackups, setExportBackups] = useState(true);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const trimmedUrl = webhookUrl.trim();
      const provider = webhookProvider || 'mattermost';
      
      // First update the notification service
      notificationService.setWebhookConfig(
        trimmedUrl || '',
        provider as Exclude<WebhookProvider, null | undefined>
      );

      // Then save to config
      await updateConfig(ensureValidConfig({
        ...config,
        defaultTTL,
        webhookUrl: trimmedUrl || null,
        webhookProvider: provider
      }));
      
      setSuccess('Settings saved successfully');
    } catch (error) {
      setError(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Revert notification service config on error
      notificationService.setWebhookConfig(
        config.webhookUrl || '',
        (config.webhookProvider || 'mattermost') as Exclude<WebhookProvider, null | undefined>
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    setTesting(true);
    setError(null);
    try {
      await notificationService.testWebhook();
      setSuccess('Test notification sent successfully!');
    } catch (error) {
      setError(`Failed to send test notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTesting(false);
    }
  };

  const selectedProvider = WEBHOOK_PROVIDERS.find(p => p.value === webhookProvider);

  // Add useEffect to sync webhook config on component mount
  useEffect(() => {
    notificationService.setWebhookConfig(
      config.webhookUrl || '',
      config.webhookProvider || 'mattermost'
    );
  }, [config.webhookUrl, config.webhookProvider]);

  // Update state when config changes
  useEffect(() => {
    setWebhookUrl(config.webhookUrl || '');
    setWebhookProvider(config.webhookProvider || 'mattermost');
    setDefaultTTL(config.defaultTTL || 3600);
  }, [config]);

  // Add export handlers
  const handleExportConfig = () => {
    setExportDialogOpen(true);
  };

  const handleExportWithOptions = () => {
    try {
      const currentConfig = JSON.parse(localStorage.getItem('dns_manager_config') || '{}');
      const exportData: any = {};
      
      if (exportZonesOnly) {
        // Export just the zones list
        const zones = new Set<string>();
        currentConfig.keys?.forEach((key: Key) => {
          key.zones?.forEach((zone: string) => zones.add(zone));
        });
        
        exportData.dns_manager_config = {
          zones: Array.from(zones)
        };
      } else {
        // Export full or partial config based on selections
        exportData.dns_manager_config = { ...currentConfig };
        
        if (!exportKeys) {
          // Remove key data but keep zones
          exportData.dns_manager_config.keys = currentConfig.keys?.map((key: Key) => ({
            id: key.id,
            name: key.name,
            zones: key.zones
          }));
        }
        
        if (!exportSettings) {
          delete exportData.dns_manager_config.defaultTTL;
          delete exportData.dns_manager_config.webhookUrl;
          delete exportData.dns_manager_config.webhookProvider;
        }

        if (exportBackups) {
          exportData.dnsBackups = backupService.getBackups();
        }
      }

      // Create filename based on content
      const filePrefix = exportZonesOnly ? 'dns-zones' : 'dns-config-backup';
      const filename = `${filePrefix}-${new Date().toISOString()}.json`;

      // Create and trigger download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportDialogOpen(false);
      setSuccess('Configuration exported successfully');
    } catch (error) {
      setError(`Failed to export configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Add import handlers
  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        if (!e.target?.result) {
          throw new Error('Failed to read file');
        }
        
        const data = JSON.parse(e.target.result as string) as ImportData;
        
        // Determine import type
        const isZonesOnly = data?.dns_manager_config?.zones && 
          !data?.dns_manager_config?.keys &&
          !data?.dns_manager_config?.defaultTTL;

        setImportType(isZonesOnly ? 'zones' : 'full');
        setImportedData(data);
        setImportDialogOpen(true);
      } catch (error) {
        setError(`Failed to read import file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    try {
      if (!importedData?.dns_manager_config) {
        throw new Error('Invalid import data');
      }

      if (importType === 'zones') {
        // Handle zones-only import
        if (!selectedKeyId) {
          throw new Error('Please select a key to associate with the imported zones');
        }

        const currentConfig = ensureValidConfig(
          JSON.parse(localStorage.getItem('dns_manager_config') || '{}')
        );
        const keyToUpdate = currentConfig.keys.find((k: Key) => k.id === selectedKeyId);
        
        if (!keyToUpdate) {
          throw new Error('Selected key not found');
        }

        // Merge existing zones with imported zones
        const newZones = Array.from(new Set([
          ...(keyToUpdate.zones || []),
          ...(importedData.dns_manager_config.zones || [])
        ]));

        // Update the key's zones while preserving server and other fields
        keyToUpdate.zones = newZones;

        // Update config
        await updateConfig(ensureValidConfig(currentConfig));
        setSuccess('Zones imported successfully');
      } else {
        // Handle full backup import
        const currentConfig = JSON.parse(localStorage.getItem('dns_manager_config') || '{}');
        
        // Ensure imported keys have server field
        const importedKeys = importedData.dns_manager_config.keys?.map(key => ({
          ...key,
          server: key.server || currentConfig.keys?.find((k: Key) => k.id === key.id)?.server || '',
        }));

        // Merge configurations, ensuring server field is preserved
        const newConfig = ensureValidConfig({
          ...currentConfig,
          ...importedData.dns_manager_config,
          keys: importedKeys,
          webhookProvider: importedData.dns_manager_config.webhookProvider || null
        });

        await updateConfig(newConfig);

        // Import backups if present, ensuring server field is preserved
        if (importedData.dnsBackups?.length) {
          const backups = importedData.dnsBackups.map(backup => ({
            ...backup,
            server: backup.server || '' // Ensure server field exists
          }));
          localStorage.setItem('dnsBackups', JSON.stringify(backups));
        }

        setSuccess('Configuration and backups imported successfully');
      }

      setImportDialogOpen(false);
      setImportedData(null);
      setSelectedKeyId('');
    } catch (error) {
      setError(`Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
              onChange={(e) => setDefaultTTL(Number(e.target.value))}
              label="Default TTL"
            >
              <MenuItem value={300}>5 minutes</MenuItem>
              <MenuItem value={3600}>1 hour</MenuItem>
              <MenuItem value={86400}>24 hours</MenuItem>
            </Select>
            <FormHelperText>Default Time-To-Live for new records</FormHelperText>
          </FormControl>

          <FormControl>
            <InputLabel>Notification Provider</InputLabel>
            <Select
              value={webhookProvider}
              onChange={(e) => setWebhookProvider(e.target.value as WebhookProvider)}
              label="Notification Provider"
            >
              {WEBHOOK_PROVIDERS.map(provider => (
                <MenuItem 
                  key={provider.value} 
                  value={provider.value as Exclude<WebhookProvider, null | undefined>}
                >
                  {provider.label}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {selectedProvider?.description}
            </FormHelperText>
          </FormControl>

          <TextField
            label={`${selectedProvider?.label || 'Webhook'} URL`}
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            helperText={
              selectedProvider?.urlPattern
                ? `Example format: ${selectedProvider.urlPattern}`
                : 'Enter the webhook URL for receiving notifications'
            }
            fullWidth
            placeholder={selectedProvider?.urlPattern}
          />

          {success && (
            <Alert severity="success" onClose={() => setSuccess(null)}>
              {success}
            </Alert>
          )}

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            >
              Save Settings
            </Button>

            {webhookUrl && (
              <Button
                variant="outlined"
                onClick={handleTestWebhook}
                disabled={testing || !webhookUrl.trim()}
                startIcon={testing ? <CircularProgress size={20} /> : <SendIcon />}
              >
                Test Webhook
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Import/Export
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
            startIcon={<UploadIcon />}
            component="label"
          >
            Import Configuration
            <input
              type="file"
              hidden
              accept=".json"
              onChange={handleImportFile}
            />
          </Button>
        </Stack>
      </Paper>

      {/* Export Dialog */}
      <Dialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
      >
        <DialogTitle>Export Options</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Choose what to include in the export:
          </DialogContentText>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={exportZonesOnly}
                  onChange={(e) => {
                    setExportZonesOnly(e.target.checked);
                    if (e.target.checked) {
                      setExportKeys(false);
                      setExportSettings(false);
                      setExportBackups(false);
                    }
                  }}
                />
              }
              label="Export zones only (for sharing managed zones)"
            />
            {!exportZonesOnly && (
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={exportKeys}
                      onChange={(e) => setExportKeys(e.target.checked)}
                    />
                  }
                  label="Include TSIG keys"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={exportSettings}
                      onChange={(e) => setExportSettings(e.target.checked)}
                    />
                  }
                  label="Include application settings"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={exportBackups}
                      onChange={(e) => setExportBackups(e.target.checked)}
                    />
                  }
                  label="Include zone backups"
                />
              </>
            )}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleExportWithOptions} variant="contained">
            Export
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
      >
        <DialogTitle>Import Configuration</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {importType === 'zones' ? (
              <>
                <Typography gutterBottom>
                  Select a key to associate with the imported zones:
                </Typography>
                <FormControl fullWidth sx={{ mt: 2 }}>
                  <InputLabel>Select Key</InputLabel>
                  <Select
                    value={selectedKeyId}
                    onChange={(e) => setSelectedKeyId(e.target.value)}
                    label="Select Key"
                  >
                    {config.keys?.map((key: Key) => (
                      <MenuItem key={key.id} value={key.id}>
                        {key.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </>
            ) : (
              'This will merge the imported configuration with your current settings.'
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleImportConfirm} variant="contained">
            Import
          </Button>
        </DialogActions>
      </Dialog>

      <KeyManagement />
    </Box>
  );
}

export default Settings; 