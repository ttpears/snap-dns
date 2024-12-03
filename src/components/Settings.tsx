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
  CircularProgress,
  FormHelperText,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import { useConfig } from '../context/ConfigContext';
import { notificationService } from '../services/notificationService';
import KeyManagement from './KeyManagement';

// Define WebhookProvider type locally until we set up the types folder
type WebhookProvider = 'mattermost' | 'slack' | 'discord' | 'teams' | 'generic';

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

function Settings() {
  const { config, updateConfig } = useConfig();
  const [defaultTTL, setDefaultTTL] = useState(config.defaultTTL || 3600);
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl || '');
  const [webhookProvider, setWebhookProvider] = useState<WebhookProvider>(
    config.webhookProvider || 'mattermost'
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateConfig({
        ...config,
        defaultTTL,
        webhookUrl: webhookUrl.trim() || null,
        webhookProvider
      });
      
      notificationService.setWebhookConfig(
        webhookUrl.trim() || '',
        webhookProvider
      );
      setSuccess('Settings saved successfully');
    } catch (error) {
      setError(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                <MenuItem key={provider.value} value={provider.value}>
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

      <KeyManagement />
    </Box>
  );
}

export default Settings; 