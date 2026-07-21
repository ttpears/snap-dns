// src/components/Settings.tsx
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
  Tabs,
  Tab,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { useConfig } from '../context/ConfigContext';
import { notificationService } from '../services/notificationService';
import TSIGKeyManagement from './TSIGKeyManagement';
import UserManagement from './UserManagement';
import SSOConfiguration from './SSOConfiguration';
import TokenManagement from './TokenManagement';
import AuditLog from './AuditLog';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { ensureValidConfig, WebhookProvider } from '../types/config';
import { tsigKeyService, TSIGKey } from '../services/tsigKeyService';

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

// Shape of import files. Key entries cover both legacy exports (which
// embedded the TSIG secret as `secret`/`keyValue`) and current exports
// (metadata only - matched to server-side keys by name on import).
interface ImportData {
  dns_manager_config: {
    zones?: string[];
    keys?: Array<{
      id?: string;
      name: string;
      algorithm?: string;
      secret?: string;
      keyValue?: string;
      keyName?: string;
      server?: string;
      zones?: string[];
      created?: number;
    }>;
    defaultTTL?: number;
    rowsPerPage?: number;
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

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `settings-tab-${index}`,
    'aria-controls': `settings-tabpanel-${index}`,
  };
}

function Settings() {
  const { config, updateConfig } = useConfig();
  const { user } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const [currentTab, setCurrentTab] = useState(0);
  const [defaultTTL, setDefaultTTL] = useState(config.defaultTTL);
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl || '');
  const [webhookProvider, setWebhookProvider] = useState<WebhookProvider>(
    config.webhookProvider || 'mattermost'
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportKeys, setExportKeys] = useState(false);
  const [exportSettings, setExportSettings] = useState(true);
  const [exportZonesOnly, setExportZonesOnly] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importedData, setImportedData] = useState<ImportData | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [importType, setImportType] = useState<'full' | 'zones' | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [serverKeys, setServerKeys] = useState<TSIGKey[]>([]);

  // Key metadata comes from the server-side store; localStorage holds no
  // key material. An API failure just leaves the list empty.
  const refreshServerKeys = React.useCallback(async () => {
    try {
      const keys = await tsigKeyService.listKeys();
      setServerKeys(keys);
    } catch (error) {
      console.error('Failed to load keys:', error);
      setServerKeys([]);
    }
  }, []);

  useEffect(() => {
    refreshServerKeys();
  }, [refreshServerKeys]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const updatedConfig = {
        ...config,
        defaultTTL,
        webhookUrl,
        webhookProvider
      };
      
      await updateConfig(updatedConfig);
      notificationService.setWebhookConfig(webhookUrl, webhookProvider);
      showSuccess('Settings saved successfully');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      showError(`Failed to save settings: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    setTesting(true);
    try {
      await notificationService.testWebhook();
      showSuccess('Test notification sent successfully!');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      showError(`Failed to send test notification: ${errorMessage}`);
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

  const handleExportWithOptions = async () => {
    try {
      // Key data lives server-side; only metadata is ever exported. TSIG
      // secrets never leave the backend, so exports are safe to share.
      const keys = await tsigKeyService.listKeys();
      const exportData: any = {};

      if (exportZonesOnly) {
        // Export just the zones list
        const zones = new Set<string>();
        keys.forEach((key) => {
          key.zones?.forEach((zone) => zones.add(zone));
        });

        exportData.dns_manager_config = {
          zones: Array.from(zones)
        };
      } else {
        exportData.dns_manager_config = {};

        if (exportKeys) {
          // Metadata only (no keyValue); re-import matches these entries to
          // server-side keys by name and merges their zone lists.
          exportData.keyExportNote =
            'TSIG key entries contain metadata only (no secrets); import matches them to server-side keys by name';
          exportData.dns_manager_config.keys = keys.map((key) => ({
            id: key.id,
            name: key.name,
            server: key.server,
            keyName: key.keyName,
            algorithm: key.algorithm,
            zones: key.zones || []
          }));
        }

        if (exportSettings) {
          exportData.dns_manager_config.defaultTTL = config.defaultTTL;
          exportData.dns_manager_config.rowsPerPage = config.rowsPerPage;
          exportData.dns_manager_config.webhookUrl = config.webhookUrl;
          exportData.dns_manager_config.webhookProvider = config.webhookProvider;
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
      showSuccess('Configuration exported successfully');
    } catch (error) {
      showError(`Failed to export configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        setImportError(null);
        setImportDialogOpen(true);
      } catch (error) {
        showError(`Failed to read import file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    // Dialog-level form validation: a zones-only import needs a target key
    // before anything can run, so surface this inline rather than as a toast.
    if (importType === 'zones' && !selectedKeyId) {
      setImportError('Please select a key to associate with the imported zones');
      return;
    }
    setImportError(null);

    try {
      if (!importedData?.dns_manager_config) {
        throw new Error('Invalid import data');
      }

      if (importType === 'zones') {
        // Zones-only import: merge the imported zones into the selected
        // server-side key via the API. Nothing touches localStorage.
        const targetKey = serverKeys.find((k) => k.id === selectedKeyId);

        if (!targetKey) {
          throw new Error('Selected key not found');
        }

        const newZones = Array.from(new Set([
          ...(targetKey.zones || []),
          ...(importedData.dns_manager_config.zones || [])
        ]));

        await tsigKeyService.updateKey(targetKey.id, { zones: newZones });
        await refreshServerKeys();
        showSuccess('Zones imported successfully');
      } else {
        // Full backup import: keys are routed through the backend API and
        // never written to localStorage. Entries matching a server-side key
        // (by id or name) get their zone lists merged; unmatched entries are
        // created only when the file contains their secret (legacy exports
        // did); otherwise they are skipped and reported.
        const existingKeys = await tsigKeyService.listKeys();
        const importedKeys = importedData.dns_manager_config.keys || [];
        const updated: string[] = [];
        const created: string[] = [];
        const skipped: string[] = [];

        for (const entry of importedKeys) {
          const label = entry.name || entry.keyName || entry.id || 'unnamed key';
          try {
            const match = existingKeys.find(
              (k) => (entry.id && k.id === entry.id) || (entry.name && k.name === entry.name)
            );

            if (match) {
              const mergedZones = Array.from(new Set([
                ...(match.zones || []),
                ...(entry.zones || [])
              ]));
              if (mergedZones.length !== (match.zones || []).length) {
                await tsigKeyService.updateKey(match.id, { zones: mergedZones });
                updated.push(match.name);
              }
            } else {
              const secret = entry.keyValue || entry.secret;
              if (!secret) {
                skipped.push(`${label} (no secret in file and no matching server key)`);
                continue;
              }
              await tsigKeyService.createKey({
                name: entry.name,
                server: entry.server || '',
                keyName: entry.keyName || entry.name,
                keyValue: secret,
                algorithm: entry.algorithm || 'hmac-sha256',
                zones: entry.zones || []
              });
              created.push(entry.name);
            }
          } catch (keyError) {
            skipped.push(`${label} (${keyError instanceof Error ? keyError.message : 'unknown error'})`);
          }
        }

        if (importedKeys.length > 0) {
          await refreshServerKeys();
        }

        // Apply imported application settings (never key material).
        const imported = importedData.dns_manager_config;
        await updateConfig(ensureValidConfig({
          ...config,
          defaultTTL: imported.defaultTTL ?? config.defaultTTL,
          rowsPerPage: imported.rowsPerPage ?? config.rowsPerPage,
          webhookUrl: imported.webhookUrl ?? config.webhookUrl,
          webhookProvider: imported.webhookProvider ?? config.webhookProvider
        }));

        // Snapshots now live server-side; legacy dnsBackups entries in old
        // export files are not written to localStorage (nothing reads it).
        if (importedData.dnsBackups?.length) {
          showInfo(`${importedData.dnsBackups.length} legacy snapshot entr${importedData.dnsBackups.length === 1 ? 'y was' : 'ies were'} ignored - use Snapshots > Import Snapshot to import individual snapshots`);
        }

        const summaryParts = [
          updated.length ? `${updated.length} key${updated.length === 1 ? '' : 's'} updated` : null,
          created.length ? `${created.length} key${created.length === 1 ? '' : 's'} created` : null
        ].filter(Boolean);
        showSuccess(`Configuration imported successfully${summaryParts.length ? ` (${summaryParts.join(', ')})` : ''}`);
        if (skipped.length) {
          showInfo(`Skipped ${skipped.length} key entr${skipped.length === 1 ? 'y' : 'ies'}: ${skipped.join('; ')}`);
        }
      }

      setImportDialogOpen(false);
      setImportedData(null);
      setSelectedKeyId('');
    } catch (error) {
      showError(`Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={currentTab}
            onChange={handleTabChange}
            aria-label="settings tabs"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="General" {...a11yProps(0)} />
            <Tab label="Keys" {...a11yProps(1)} />
            <Tab label="Users" {...a11yProps(2)} />
            <Tab label="SSO" {...a11yProps(3)} />
            <Tab label="API Tokens" {...a11yProps(4)} />
            {user?.role === 'admin' && <Tab label="Audit Logs" {...a11yProps(5)} />}
          </Tabs>
        </Box>

        {/* General Tab */}
        <TabPanel value={currentTab} index={0}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h5" component="h2" gutterBottom>
              Application Settings
            </Typography>

            <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <FormControl>
            <InputLabel id="default-ttl-label">Default TTL</InputLabel>
            <Select
              labelId="default-ttl-label"
              id="default-ttl"
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
            <InputLabel id="notification-provider-label">Notification Provider</InputLabel>
            <Select
              labelId="notification-provider-label"
              id="notification-provider"
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

          <FormControl>
            <InputLabel id="rows-per-page-label">Default Rows Per Page</InputLabel>
            <Select
              labelId="rows-per-page-label"
              id="rows-per-page"
              value={config.rowsPerPage || 10}
              onChange={(e) => {
                updateConfig({
                  ...config,
                  rowsPerPage: Number(e.target.value)
                });
              }}
              label="Default Rows Per Page"
            >
              <MenuItem value={5}>5</MenuItem>
              <MenuItem value={10}>10</MenuItem>
              <MenuItem value={25}>25</MenuItem>
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
            </Select>
            <FormHelperText>Default number of records to show per page in tables</FormHelperText>
          </FormControl>

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

            {/* Import/Export Section */}
            <Box sx={{ mt: 4 }}>
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
            </Box>
          </Box>
        </TabPanel>

        {/* Keys Tab */}
        <TabPanel value={currentTab} index={1}>
          <Box sx={{ p: 3 }}>
            <TSIGKeyManagement />
          </Box>
        </TabPanel>

        {/* Users Tab */}
        <TabPanel value={currentTab} index={2}>
          <Box sx={{ p: 3 }}>
            <UserManagement />
          </Box>
        </TabPanel>

        {/* SSO Tab */}
        <TabPanel value={currentTab} index={3}>
          <Box sx={{ p: 3 }}>
            <SSOConfiguration />
          </Box>
        </TabPanel>

        {/* API Tokens Tab (all roles - personal tokens) */}
        <TabPanel value={currentTab} index={4}>
          <Box sx={{ p: 3 }}>
            <TokenManagement />
          </Box>
        </TabPanel>

        {/* Audit Logs Tab (Admin only) */}
        {user?.role === 'admin' && (
          <TabPanel value={currentTab} index={5}>
            <Box sx={{ p: 3 }}>
              <AuditLog />
            </Box>
          </TabPanel>
        )}
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
                  label="Include TSIG key metadata (names, servers, zones - never secrets)"
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
        onClose={() => {
          setImportDialogOpen(false);
          setImportError(null);
        }}
      >
        <DialogTitle>Import Configuration</DialogTitle>
        <DialogContent>
          {importError && (
            <Alert severity="error" onClose={() => setImportError(null)} sx={{ mb: 2 }}>
              {importError}
            </Alert>
          )}
          <DialogContentText>
            {importType === 'zones' ? (
              <>
                <Typography gutterBottom>
                  Select a key to associate with the imported zones:
                </Typography>
                <FormControl fullWidth sx={{ mt: 2 }}>
                  <InputLabel id="import-select-key-label">Select Key</InputLabel>
                  <Select
                    labelId="import-select-key-label"
                    id="import-select-key"
                    value={selectedKeyId}
                    onChange={(e) => {
                      setSelectedKeyId(e.target.value);
                      setImportError(null);
                    }}
                    label="Select Key"
                  >
                    {serverKeys.map((key) => (
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
          <Button
            onClick={() => {
              setImportDialogOpen(false);
              setImportError(null);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleImportConfirm} variant="contained">
            Import
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Settings; 