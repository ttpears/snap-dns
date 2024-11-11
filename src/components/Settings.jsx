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
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormGroup,
  Checkbox,
  List,
  ListItem,
  ListItemText
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
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportKeys, setExportKeys] = useState(false);
  const [exportSettings, setExportSettings] = useState(true);
  const [exportBackups, setExportBackups] = useState(true);
  const [exportZonesOnly, setExportZonesOnly] = useState(true);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importedData, setImportedData] = useState(null);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [importType, setImportType] = useState(null); // 'full' or 'zones'

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
    setExportDialogOpen(true);
  };

  const handleExportWithOptions = () => {
    try {
      const currentConfig = JSON.parse(localStorage.getItem('dns_manager_config') || '{}');
      const backups = JSON.parse(localStorage.getItem('dnsBackups') || '[]');
      
      const exportData = {};
      
      if (exportZonesOnly) {
        // Export just the zones list
        const zones = new Set();
        currentConfig.keys?.forEach(key => {
          key.zones?.forEach(zone => zones.add(zone));
        });
        
        exportData.dns_manager_config = {
          zones: Array.from(zones)
        };
      } else {
        // Export full or partial config based on selections
        exportData.dns_manager_config = { ...currentConfig };
        
        if (!exportKeys) {
          // Remove key data but keep zones
          exportData.dns_manager_config.keys = currentConfig.keys?.map(key => ({
            id: key.id,
            name: key.name,
            zones: key.zones
          }));
        }
        
        if (!exportSettings) {
          delete exportData.dns_manager_config.defaultTTL;
          delete exportData.dns_manager_config.webhookUrl;
        }
      }

      if (exportBackups) {
        exportData.dnsBackups = backups;
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
      setError(`Failed to export configuration: ${error.message}`);
    }
  };

  const handleImportFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        // Determine import type
        const isZonesOnly = data.dns_manager_config?.zones && 
          !data.dns_manager_config?.keys &&
          !data.dns_manager_config?.defaultTTL;

        setImportType(isZonesOnly ? 'zones' : 'full');
        setImportedData(data);
        setImportDialogOpen(true);
      } catch (error) {
        setError(`Failed to read import file: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    try {
      if (importType === 'zones') {
        // Handle zones-only import
        if (!selectedKeyId) {
          throw new Error('Please select a key to associate with the imported zones');
        }

        const currentConfig = JSON.parse(localStorage.getItem('dns_manager_config') || '{}');
        const keyToUpdate = currentConfig.keys.find(k => k.id === selectedKeyId);
        
        if (!keyToUpdate) {
          throw new Error('Selected key not found');
        }

        // Merge existing zones with imported zones
        const newZones = Array.from(new Set([
          ...(keyToUpdate.zones || []),
          ...(importedData.dns_manager_config.zones || [])
        ]));

        // Update the key's zones
        keyToUpdate.zones = newZones;

        // Update config
        await updateConfig(currentConfig);
        setSuccess('Zones imported successfully');
      } else {
        // Handle full backup import
        const currentConfig = JSON.parse(localStorage.getItem('dns_manager_config') || '{}');
        
        // Merge configurations
        const newConfig = {
          ...currentConfig,
          ...importedData.dns_manager_config,
        };

        // Update backups if included
        if (importedData.dnsBackups) {
          localStorage.setItem('dnsBackups', JSON.stringify(importedData.dnsBackups));
        }

        await updateConfig(newConfig);
        setSuccess('Configuration imported successfully');
      }

      setImportDialogOpen(false);
      setImportedData(null);
      setSelectedKeyId('');
    } catch (error) {
      setError(`Failed to import configuration: ${error.message}`);
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
                onChange={handleImportFile}
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

      <Dialog 
        open={exportDialogOpen} 
        onClose={() => setExportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Export Configuration</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Choose what to include in your export:
            </Typography>
          </Box>

          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox 
                  checked={exportZonesOnly} 
                  onChange={(e) => setExportZonesOnly(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography>Export Zones Only</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Just the list of managed zones, ideal for sharing with team members
                  </Typography>
                </Box>
              }
            />

            <Divider sx={{ my: 2 }} />

            <FormControlLabel
              control={
                <Checkbox 
                  checked={exportKeys} 
                  onChange={(e) => setExportKeys(e.target.checked)}
                  disabled={exportZonesOnly}
                />
              }
              label={
                <Box>
                  <Typography>Include Key Configurations</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Includes sensitive key data - only for personal backups
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Checkbox 
                  checked={exportSettings} 
                  onChange={(e) => setExportSettings(e.target.checked)}
                  disabled={exportZonesOnly}
                />
              }
              label={
                <Box>
                  <Typography>Include Application Settings</Typography>
                  <Typography variant="caption" color="text.secondary">
                    TTL defaults, webhook URLs, and other settings
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Checkbox 
                  checked={exportBackups} 
                  onChange={(e) => setExportBackups(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography>Include Zone Backups</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Historical backups of zone configurations
                  </Typography>
                </Box>
              }
            />
          </FormGroup>

          {exportKeys && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Warning: You've enabled key configuration export. This includes sensitive data 
              and should only be used for personal backups.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleExportWithOptions} 
            variant="contained"
            color={exportKeys ? "warning" : "primary"}
          >
            Export
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog 
        open={importDialogOpen} 
        onClose={() => setImportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {importType === 'zones' ? 'Import Zones' : 'Import Configuration'}
        </DialogTitle>
        <DialogContent>
          {importType === 'zones' ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select which key you want to associate these zones with:
              </Typography>
              
              <FormControl fullWidth>
                <InputLabel>Select Key</InputLabel>
                <Select
                  value={selectedKeyId}
                  onChange={(e) => setSelectedKeyId(e.target.value)}
                  label="Select Key"
                >
                  {config.keys.map((key) => (
                    <MenuItem key={key.id} value={key.id}>
                      {key.name} ({key.id})
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  The imported zones will be added to this key's managed zones
                </FormHelperText>
              </FormControl>

              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2">Zones to import:</Typography>
                <List dense>
                  {importedData?.dns_manager_config?.zones?.map((zone) => (
                    <ListItem key={zone}>
                      <ListItemText primary={zone} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </>
          ) : (
            <>
              <Alert severity="warning" sx={{ mb: 2 }}>
                This will import a full configuration backup, including:
                {importedData?.dns_manager_config?.keys && <li>Key configurations</li>}
                {importedData?.dns_manager_config?.defaultTTL && <li>Application settings</li>}
                {importedData?.dnsBackups && <li>Zone backups</li>}
              </Alert>
              <Typography variant="body2" color="text.secondary">
                Existing configurations will be merged with the imported data.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleImportConfirm} 
            variant="contained"
            color={importType === 'zones' ? 'primary' : 'warning'}
            disabled={importType === 'zones' && !selectedKeyId}
          >
            {importType === 'zones' ? 'Import Zones' : 'Import Configuration'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Settings;